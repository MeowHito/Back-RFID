import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkpoint, CheckpointDocument } from './checkpoint.schema';
import { Runner, RunnerDocument } from '../runners/runner.schema';
import { Event, EventDocument } from '../events/event.schema';

/**
 * CheckpointSchedulerService
 *
 * Periodically checks checkpoint cutoffTime values.
 * Based on the diagram (section 4 — CutOff Time Auto-Detect):
 *
 * - START checkpoint cutoff → runners with no timing at START → DNS
 * - Non-START checkpoint cutoff → running runners who haven't reached this CP → DNF
 *
 * Respects isManualStatus: if staff manually set a status, auto-cutoff won't override it.
 * Runs every 60 seconds.
 */
@Injectable()
export class CheckpointSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(CheckpointSchedulerService.name);
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    ) { }

    onModuleInit() {
        this.intervalId = setInterval(() => {
            this.checkCutOffTimes().catch(err => {
                this.logger.error('Error checking cut-off times', err);
            });
        }, 60_000);
        this.logger.log('Checkpoint cut-off scheduler initialized (60s interval)');
    }

    /**
     * Check all checkpoints with cutoffTime and auto-mark DNS/DNF.
     */
    async checkCutOffTimes(): Promise<{ processed: number; dnsCount: number; dnfCount: number }> {
        const now = new Date();
        let processed = 0;
        let dnsCount = 0;
        let dnfCount = 0;

        try {
            const checkpoints = await this.checkpointModel
                .find({ active: { $ne: false }, cutoffTime: { $exists: true, $nin: [null, '-', ''] } })
                .lean()
                .exec();

            if (checkpoints.length > 0) {
                this.logger.debug(`Found ${checkpoints.length} checkpoint(s) with cutoffTime`);
            }

            // Group checkpoints by campaign for ordering context
            const cpsByCampaign = new Map<string, any[]>();
            for (const cp of checkpoints) {
                const cid = String((cp as any).campaignId || '');
                if (!cid) continue;
                if (!cpsByCampaign.has(cid)) cpsByCampaign.set(cid, []);
                cpsByCampaign.get(cid)!.push(cp);
            }

            for (const [campaignId, campaignCps] of cpsByCampaign.entries()) {
                // Get all checkpoints for ordering (including those without cutoff)
                const campaignOid = Types.ObjectId.isValid(campaignId) ? new Types.ObjectId(campaignId) : null;
                const cpQuery = campaignOid ? { campaignId: campaignOid } : { campaignId };
                const allCampaignCps = await this.checkpointModel
                    .find(cpQuery)
                    .lean().exec();
                const cpOrderMap = new Map<string, number>();
                for (const c of allCampaignCps) {
                    cpOrderMap.set(((c as any).name || '').toUpperCase(), (c as any).orderNum ?? 0);
                }
                const isStartCp = (cpName: string) => {
                    const name = cpName.toUpperCase();
                    if (name === 'START') return true;
                    const order = cpOrderMap.get(name);
                    return order !== undefined && order === Math.min(...cpOrderMap.values());
                };

                // Resolve event IDs for this campaign using properly injected Event model
                const eventQuery: any = campaignOid
                    ? { $or: [{ campaignId }, { campaignId: campaignOid }] }
                    : { campaignId };
                const events = await this.eventModel.find(eventQuery).select('_id').lean().exec();
                const eventOids: Types.ObjectId[] = events.map((e: any) => new Types.ObjectId(String(e._id)));
                // Also include campaignId itself as fallback (some runners may have eventId = campaignId)
                if (campaignOid) eventOids.push(campaignOid);
                if (!eventOids.length) {
                    this.logger.debug(`No events found for campaign ${campaignId}, skipping cutoff check`);
                    continue;
                }
                this.logger.debug(`Campaign ${campaignId}: found ${events.length} event(s), eventOids=[${eventOids.map(e => e.toString()).join(',')}]`);

                for (const cp of campaignCps) {
                    const cutoffStr = (cp as any).cutoffTime;
                    const cutoff = this.parseCutoffTime(cutoffStr);
                    if (!cutoff) {
                        this.logger.debug(`CP "${(cp as any).name}": could not parse cutoffTime "${cutoffStr}"`);
                        continue;
                    }
                    if (cutoff > now) {
                        this.logger.debug(`CP "${(cp as any).name}": cutoff ${cutoff.toISOString()} > now ${now.toISOString()}, not yet`);
                        continue;
                    }
                    this.logger.log(`CP "${(cp as any).name}": cutoff ${cutoff.toISOString()} <= now ${now.toISOString()}, processing...`);
                    processed++;

                    const cpName = ((cp as any).name || '').toUpperCase();
                    const cpOrder = cpOrderMap.get(cpName) ?? -1;

                    if (isStartCp((cp as any).name || '')) {
                        // START checkpoint cutoff → mark not_started runners as DNS
                        const result = await this.runnerModel.updateMany(
                            {
                                eventId: { $in: eventOids },
                                status: 'not_started',
                                isManualStatus: { $ne: true },
                            },
                            {
                                $set: {
                                    status: 'dns',
                                    statusCheckpoint: (cp as any).name || 'START',
                                    statusChangedAt: now,
                                    statusChangedBy: 'cutoff-scheduler',
                                },
                            },
                        ).exec();
                        if (result.modifiedCount > 0) {
                            dnsCount += result.modifiedCount;
                            this.logger.warn(
                                `START cutoff "${(cp as any).name}" (${(cp as any).cutoffTime}): ${result.modifiedCount} runners → DNS`
                            );
                        }
                    } else {
                        // Non-START checkpoint cutoff → mark running runners whose
                        // latestCheckpoint is before this CP as DNF
                        const prevCpNames: string[] = [];
                        for (const [name, order] of cpOrderMap.entries()) {
                            if (order < cpOrder) prevCpNames.push(name);
                        }
                        this.logger.debug(`CP "${(cp as any).name}" (order=${cpOrder}): prevCpNames=[${prevCpNames.join(',')}]`);
                        // Runners who are running but haven't reached this checkpoint
                        const filter: any = {
                            eventId: { $in: eventOids },
                            status: { $in: ['in_progress', 'not_started'] },
                            isManualStatus: { $ne: true },
                        };
                        if (prevCpNames.length > 0) {
                            // Only DNF runners whose latestCheckpoint is BEFORE this CP
                            filter.$or = [
                                { latestCheckpoint: { $exists: false } },
                                { latestCheckpoint: null },
                                { latestCheckpoint: '' },
                                { latestCheckpoint: { $in: prevCpNames.map(n => new RegExp(`^${n}$`, 'i')) } },
                            ];
                        }
                        // Count matching runners first for debug
                        const matchCount = await this.runnerModel.countDocuments(filter).exec();
                        this.logger.debug(`CP "${(cp as any).name}": ${matchCount} runner(s) match DNF filter`);
                        const result = await this.runnerModel.updateMany(
                            filter,
                            {
                                $set: {
                                    status: 'dnf',
                                    statusCheckpoint: (cp as any).name || '',
                                    statusChangedAt: now,
                                    statusChangedBy: 'cutoff-scheduler',
                                },
                            },
                        ).exec();
                        if (result.modifiedCount > 0) {
                            dnfCount += result.modifiedCount;
                            this.logger.warn(
                                `Cutoff "${(cp as any).name}" (${(cp as any).cutoffTime}): ${result.modifiedCount} runners → DNF`
                            );
                        }
                    }
                }
            }
        } catch (err) {
            this.logger.error('Failed to process cut-off times', err);
        }

        return { processed, dnsCount, dnfCount };
    }

    /**
     * Manually trigger cut-off check (for admin API)
     */
    async triggerCutOffCheck(): Promise<{ processed: number; dnsCount: number; dnfCount: number }> {
        this.logger.log('Manual cut-off check triggered');
        return this.checkCutOffTimes();
    }

    /**
     * Parse cutoffTime string into a Date.
     * Supports formats: ISO datetime "2026-02-15T10:30", or time-only "10:30" (today).
     */
    private parseCutoffTime(timeStr: string): Date | null {
        if (!timeStr || timeStr === '-') return null;

        // Try ISO datetime first
        const isoDate = new Date(timeStr);
        if (!isNaN(isoDate.getTime())) return isoDate;

        // Try time-only format (HH:mm) - use today's date
        const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                parseInt(timeMatch[1]), parseInt(timeMatch[2]));
        }

        return null;
    }

    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

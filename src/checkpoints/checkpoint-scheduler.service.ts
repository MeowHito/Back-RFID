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
    // Cache: cpId -> cutoffTime value last fully processed (no further mutations)
    private settledCutoffs = new Map<string, string>();

    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    ) { }

    onModuleInit() {
        // Only instance 0 runs the scheduler to avoid duplicate writes in cluster mode
        if (process.env.NODE_APP_INSTANCE !== undefined && process.env.NODE_APP_INSTANCE !== '0') {
            this.logger.log(`Checkpoint cut-off scheduler skipped (instance ${process.env.NODE_APP_INSTANCE})`);
            return;
        }
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
            // A checkpoint qualifies if it has a legacy cutoffTime OR any per-category cutoffTimes entry.
            const checkpoints = await this.checkpointModel
                .find({
                    active: { $ne: false },
                    $or: [
                        { cutoffTime: { $exists: true, $nin: [null, '-', ''] } },
                        { cutoffTimes: { $exists: true, $not: { $size: 0 } } },
                    ],
                })
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
                    const cpId = String((cp as any)._id);
                    const cpName = ((cp as any).name || '').toUpperCase();
                    const cpOrder = cpOrderMap.get(cpName) ?? -1;

                    // Expand into one or more cutoff entries.
                    // If per-category `cutoffTimes` has any entry, it fully replaces the legacy
                    // `cutoffTime` (so a user who migrated to per-distance cutoffs isn't double-billed
                    // by the legacy global one). Otherwise fall back to legacy.
                    const entries: Array<{ category: string | null; cutoffStr: string; cutoff: Date; cacheKey: string }> = [];
                    const cutoffTimes = (cp as any).cutoffTimes || {};
                    const cutoffTimesEntries = Object.entries(cutoffTimes).filter(
                        ([, val]) => !!String(val || '').trim() && String(val) !== '-',
                    );
                    if (cutoffTimesEntries.length > 0) {
                        for (const [cat, val] of cutoffTimesEntries) {
                            const str = String(val);
                            const d = this.parseCutoffTime(str);
                            if (d) entries.push({ category: cat, cutoffStr: str, cutoff: d, cacheKey: `${cpId}:${cat}` });
                        }
                    } else {
                        const legacyStr = (cp as any).cutoffTime;
                        if (legacyStr && legacyStr !== '-' && legacyStr !== '') {
                            const d = this.parseCutoffTime(legacyStr);
                            if (d) entries.push({ category: null, cutoffStr: legacyStr, cutoff: d, cacheKey: cpId });
                        }
                    }

                    for (const entry of entries) {
                        if (entry.cutoff > now) {
                            this.logger.debug(`CP "${(cp as any).name}"${entry.category ? ` [${entry.category}]` : ''}: cutoff ${entry.cutoff.toISOString()} > now, not yet`);
                            continue;
                        }
                        if (this.settledCutoffs.get(entry.cacheKey) === entry.cutoffStr) continue;
                        processed++;

                        // Build a runner-scope filter. When the entry is category-specific,
                        // restrict to runners whose `category` field matches (case-insensitive exact).
                        const baseScope: any = { eventId: { $in: eventOids } };
                        if (entry.category) {
                            const esc = entry.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            baseScope.category = { $regex: new RegExp(`^${esc}$`, 'i') };
                        }

                        const isStart = ((cp as any).type === 'start') || isStartCp((cp as any).name || '');
                        if (isStart) {
                            // START cutoff → not_started → DNS
                            const result = await this.runnerModel.updateMany(
                                { ...baseScope, status: 'not_started', isManualStatus: { $ne: true } },
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
                                    `START cutoff "${(cp as any).name}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${result.modifiedCount} runners → DNS`
                                );
                            } else {
                                this.settledCutoffs.set(entry.cacheKey, entry.cutoffStr);
                            }
                        } else {
                            // Non-START cutoff:
                            //   in_progress runners who haven't reached this CP  → DNF
                            //   not_started runners (never crossed START)         → DNS (never DNF)
                            const prevCpNames: string[] = [];
                            for (const [name, order] of cpOrderMap.entries()) {
                                if (order < cpOrder) prevCpNames.push(name);
                            }
                            const dnfFilter: any = { ...baseScope, status: 'in_progress', isManualStatus: { $ne: true } };
                            if (prevCpNames.length > 0) {
                                dnfFilter.$or = [
                                    { latestCheckpoint: { $exists: false } },
                                    { latestCheckpoint: null },
                                    { latestCheckpoint: '' },
                                    { latestCheckpoint: { $in: prevCpNames.map(n => new RegExp(`^${n}$`, 'i')) } },
                                ];
                            }
                            const result = await this.runnerModel.updateMany(
                                dnfFilter,
                                {
                                    $set: {
                                        status: 'dnf',
                                        statusCheckpoint: (cp as any).name || '',
                                        statusChangedAt: now,
                                        statusChangedBy: 'cutoff-scheduler',
                                    },
                                },
                            ).exec();
                            const dnsResult = await this.runnerModel.updateMany(
                                { ...baseScope, status: 'not_started', isManualStatus: { $ne: true } },
                                {
                                    $set: {
                                        status: 'dns',
                                        statusCheckpoint: 'START',
                                        statusChangedAt: now,
                                        statusChangedBy: 'cutoff-scheduler',
                                    },
                                },
                            ).exec();
                            if (dnsResult.modifiedCount > 0) {
                                dnsCount += dnsResult.modifiedCount;
                                this.logger.warn(
                                    `Cutoff "${(cp as any).name}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${dnsResult.modifiedCount} not_started → DNS`
                                );
                            }
                            if (result.modifiedCount > 0) {
                                dnfCount += result.modifiedCount;
                                this.logger.warn(
                                    `Cutoff "${(cp as any).name}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${result.modifiedCount} runners → DNF`
                                );
                            } else if (dnsResult.modifiedCount === 0) {
                                this.settledCutoffs.set(entry.cacheKey, entry.cutoffStr);
                            }
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
     * Revert runners auto-DNF'd/DNS'd by the cutoff scheduler for a specific checkpoint
     * when its cutoff time is EXTENDED. Only reverts runners where:
     *   - statusChangedBy = 'cutoff-scheduler'
     *   - statusCheckpoint matches the checkpoint name
     *   - isManualStatus != true (safety: never touch manual overrides)
     *
     * DNF → in_progress, DNS → not_started
     */
    async revertCutoffRunners(
        cpName: string,
        campaignId: string,
        cpType: string,
        category?: string,
    ): Promise<{ revertedCount: number }> {
        const now = new Date();
        let revertedCount = 0;
        // Clear settled cache so the scheduler re-evaluates this cutoff next tick
        this.settledCutoffs.clear();

        try {
            // Resolve event IDs for this campaign
            const campaignOid = Types.ObjectId.isValid(campaignId) ? new Types.ObjectId(campaignId) : null;
            const eventQuery: any = campaignOid
                ? { $or: [{ campaignId }, { campaignId: campaignOid }] }
                : { campaignId };
            const events = await this.eventModel.find(eventQuery).select('_id').lean().exec();
            const eventOids: Types.ObjectId[] = events.map((e: any) => new Types.ObjectId(String(e._id)));
            if (campaignOid) eventOids.push(campaignOid);
            if (!eventOids.length) {
                this.logger.debug(`revertCutoffRunners: no events for campaign ${campaignId}`);
                return { revertedCount: 0 };
            }

            const isStart = cpType === 'start' || cpName.toUpperCase() === 'START';
            const baseScope: any = { eventId: { $in: eventOids } };
            if (category) {
                const esc = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                baseScope.category = { $regex: new RegExp(`^${esc}$`, 'i') };
            }

            if (isStart) {
                // Revert DNS → not_started for runners auto-DNS'd at this START checkpoint
                const result = await this.runnerModel.updateMany(
                    {
                        ...baseScope,
                        status: 'dns',
                        statusChangedBy: 'cutoff-scheduler',
                        statusCheckpoint: { $regex: new RegExp(`^${cpName}$`, 'i') },
                        isManualStatus: { $ne: true },
                    },
                    {
                        $set: {
                            status: 'not_started',
                            statusCheckpoint: '',
                            statusChangedAt: now,
                            statusChangedBy: 'cutoff-extension',
                        },
                    },
                ).exec();
                revertedCount = result.modifiedCount;
                if (revertedCount > 0) {
                    this.logger.warn(
                        `Cutoff extended "${cpName}"${category ? ` [${category}]` : ''}: ${revertedCount} runner(s) DNS → not_started`
                    );
                }
            } else {
                // Revert DNF → in_progress for runners auto-DNF'd at this checkpoint
                const result = await this.runnerModel.updateMany(
                    {
                        ...baseScope,
                        status: 'dnf',
                        statusChangedBy: 'cutoff-scheduler',
                        statusCheckpoint: { $regex: new RegExp(`^${cpName}$`, 'i') },
                        isManualStatus: { $ne: true },
                    },
                    {
                        $set: {
                            status: 'in_progress',
                            statusCheckpoint: '',
                            statusChangedAt: now,
                            statusChangedBy: 'cutoff-extension',
                        },
                    },
                ).exec();
                revertedCount = result.modifiedCount;
                if (revertedCount > 0) {
                    this.logger.warn(
                        `Cutoff extended "${cpName}"${category ? ` [${category}]` : ''}: ${revertedCount} runner(s) DNF → in_progress`
                    );
                }
                // Also revert DNS → not_started runners that were flipped by the same non-START cutoff
                const dnsRevert = await this.runnerModel.updateMany(
                    {
                        ...baseScope,
                        status: 'dns',
                        statusChangedBy: 'cutoff-scheduler',
                        statusCheckpoint: { $regex: new RegExp(`^START$`, 'i') },
                        isManualStatus: { $ne: true },
                    },
                    {
                        $set: {
                            status: 'not_started',
                            statusCheckpoint: '',
                            statusChangedAt: now,
                            statusChangedBy: 'cutoff-extension',
                        },
                    },
                ).exec();
                if (dnsRevert.modifiedCount > 0) {
                    revertedCount += dnsRevert.modifiedCount;
                    this.logger.warn(
                        `Cutoff extended "${cpName}"${category ? ` [${category}]` : ''}: ${dnsRevert.modifiedCount} DNS → not_started`
                    );
                }
            }
        } catch (err) {
            this.logger.error(`Failed to revert cutoff runners for CP "${cpName}"`, err);
        }

        return { revertedCount };
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

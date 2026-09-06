import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkpoint, CheckpointDocument } from './checkpoint.schema';
import { Runner, RunnerDocument } from '../runners/runner.schema';
import { Event, EventDocument } from '../events/event.schema';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import {
    CutoffEntry,
    formatCutoffForNote,
    getCutoffEntries,
    isAdminOwnedStatus,
} from './cutoff.util';

/**
 * CheckpointSchedulerService
 *
 * Periodically checks checkpoint cutoffTime values.
 * Based on the diagram (section 4 — CutOff Time Auto-Detect):
 *
 * - START checkpoint cutoff → runners with no timing at START → DNS
 * - Non-START checkpoint cutoff → runners who did not pass this CP in time → DNF, which
 *   covers both those who never reached it and those whose crossing is stamped AFTER the
 *   cut-off (a finisher who crossed the line late is a DNF, not a finisher).
 *
 * Respects isManualStatus: if staff manually set a status, auto-cutoff won't override it.
 * Runs every 60 seconds.
 */
@Injectable()
export class CheckpointSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(CheckpointSchedulerService.name);
    private intervalId: NodeJS.Timeout | null = null;
    // Cache: cutoff cacheKey -> data fingerprint last evaluated with nothing left to change.
    // The fingerprint carries the cut-off value AND how much data it was judged against, so a
    // crossing that lands after the cut-off (late RFID upload, RaceTiger sync, staff-typed time)
    // re-opens the check instead of being skipped forever.
    private settledCutoffs = new Map<string, string>();

    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
        @InjectModel(TimingRecord.name) private timingRecordModel: Model<TimingRecordDocument>,
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
     * `force` re-evaluates cut-offs the last run left settled (admin-triggered runs).
     */
    async checkCutOffTimes(options: { force?: boolean } = {}): Promise<{ processed: number; dnsCount: number; dnfCount: number }> {
        const force = options.force === true;
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
                    const cpDisplayName = (cp as any).name || '';
                    const cpName = cpDisplayName.toUpperCase();
                    const cpOrder = cpOrderMap.get(cpName) ?? -1;

                    for (const entry of getCutoffEntries(cp)) {
                        if (entry.cutoff > now) {
                            this.logger.debug(`CP "${cpDisplayName}"${entry.category ? ` [${entry.category}]` : ''}: cutoff ${entry.cutoff.toISOString()} > now, not yet`);
                            continue;
                        }

                        // Build a runner-scope filter. When the entry is category-specific,
                        // restrict to runners whose `category` field matches (case-insensitive exact).
                        const baseScope: any = { eventId: { $in: eventOids } };
                        if (entry.category) {
                            baseScope.category = { $regex: CheckpointSchedulerService.exactNameRegex(entry.category) };
                        } else {
                            // Legacy all-distance cut-off: still only the distances this checkpoint
                            // is mapped to, so a cut-off on a 100K-only point can't cut a 10K runner.
                            const mappings: string[] = Array.isArray((cp as any).distanceMappings)
                                ? (cp as any).distanceMappings.filter(Boolean) : [];
                            if (mappings.length > 0) {
                                baseScope.category = { $in: mappings.map(m => CheckpointSchedulerService.exactNameRegex(m)) };
                            }
                        }

                        const isStart = ((cp as any).type === 'start') || isStartCp(cpDisplayName);
                        // Skip a cut-off whose verdict can't have changed since the last run.
                        const fingerprint = await this.cutoffFingerprint(entry, baseScope, eventOids,
                            isStart ? [cpName] : this.cpNamesFrom(cpOrderMap, cpOrder, cpName));
                        if (!force && this.settledCutoffs.get(entry.cacheKey) === fingerprint) continue;
                        processed++;

                        let changed = 0;
                        if (isStart) {
                            // START cutoff → not_started → DNS
                            const result = await this.runnerModel.updateMany(
                                { ...baseScope, status: 'not_started', isManualStatus: { $ne: true } },
                                {
                                    $set: {
                                        status: 'dns',
                                        statusCheckpoint: cpDisplayName || 'START',
                                        statusChangedAt: now,
                                        statusChangedBy: 'cutoff-scheduler',
                                    },
                                },
                            ).exec();
                            changed = result.modifiedCount;
                            dnsCount += changed;
                            if (changed > 0) {
                                this.logger.warn(
                                    `START cutoff "${cpDisplayName}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${changed} runners → DNS`
                                );
                            }
                        } else {
                            const applied = await this.applyNonStartCutoff({
                                cp, cpDisplayName, cpName, cpOrder, cpOrderMap, entry, baseScope, eventOids, now,
                            });
                            changed = applied.dnfCount + applied.dnsCount + applied.revertedCount;
                            dnfCount += applied.dnfCount;
                            dnsCount += applied.dnsCount;
                        }

                        // Settle only when a full evaluation of this data changed nothing.
                        if (changed === 0) this.settledCutoffs.set(entry.cacheKey, fingerprint);
                        else this.settledCutoffs.delete(entry.cacheKey);
                    }
                }
            }
        } catch (err) {
            this.logger.error('Failed to process cut-off times', err);
        }

        return { processed, dnsCount, dnfCount };
    }

    /**
     * Apply one non-START cut-off:
     *   • crossed this checkpoint AFTER the cut-off        → DNF (a late finisher is not a finisher)
     *   • never reached it and still racing                → DNF
     *   • never crossed START                             → DNS (never DNF)
     * A crossing further down the course that is itself late proves nothing about this point —
     * the mat here may simply have missed the read — so those runners are left alone.
     */
    private async applyNonStartCutoff(params: {
        cp: any;
        cpDisplayName: string;
        cpName: string;
        cpOrder: number;
        cpOrderMap: Map<string, number>;
        entry: CutoffEntry;
        baseScope: any;
        eventOids: Types.ObjectId[];
        now: Date;
    }): Promise<{ dnfCount: number; dnsCount: number; revertedCount: number }> {
        const { cp, cpDisplayName, cpName, cpOrder, cpOrderMap, entry, baseScope, eventOids, now } = params;
        const cutoffMs = entry.cutoff.getTime();
        const orders = [...cpOrderMap.values()];
        const isFinishCp = String((cp as any).type || '').toLowerCase() === 'finish'
            || (orders.length > 0 && cpOrder === Math.max(...orders));

        // Everyone still counted as racing or finished is a candidate. Staff-owned statuses
        // (manual stops, or anything a human last set) are never touched.
        const candidates = (await this.runnerModel
            .find({
                ...baseScope,
                status: { $in: ['in_progress', 'finished'] },
                isManualStatus: { $ne: true },
            })
            .select('_id status statusChangedBy latestCheckpoint finishTime')
            .lean()
            .exec())
            .filter((r: any) => !isAdminOwnedStatus(r));

        // Runners this same rule already cut here. Their verdict is re-examined below: nothing
        // else does it, so a DNF written from incomplete data (the crossing not yet uploaded,
        // synced, or typed in) would otherwise stand for the rest of the race.
        const previouslyCut = await this.runnerModel
            .find({
                ...baseScope,
                status: 'dnf',
                statusChangedBy: 'cutoff-scheduler',
                statusCheckpoint: CheckpointSchedulerService.exactNameRegex(cpDisplayName),
                isManualStatus: { $ne: true },
            })
            .select('_id finishTime')
            .lean()
            .exec();

        const dnfIds: Types.ObjectId[] = [];
        const revertFinishedIds: Types.ObjectId[] = [];
        const revertRacingIds: Types.ObjectId[] = [];
        if (candidates.length > 0 || previouslyCut.length > 0) {
            const crossings = await this.firstCrossings(cpName, cpOrderMap, cpOrder, eventOids);
            const prevCpNames = [...cpOrderMap.entries()]
                .filter(([, order]) => order < cpOrder)
                .map(([name]) => name);

            for (const runner of candidates as any[]) {
                const seen = crossings.get(String(runner._id));
                if (seen?.atCp) {
                    if (seen.atCp.getTime() > cutoffMs) dnfIds.push(runner._id);
                    continue; // crossed here in time
                }
                if (seen?.beyond) {
                    // Past this point already (in time) → fine. Past it late → missed read, leave alone.
                    continue;
                }
                // No crossing recorded here or beyond it.
                if (runner.status === 'in_progress') {
                    const last = String(runner.latestCheckpoint || '').toUpperCase();
                    if (!last || prevCpNames.includes(last)) dnfIds.push(runner._id);
                } else if (isFinishCp && runner.finishTime
                    && new Date(runner.finishTime).getTime() > cutoffMs) {
                    // Score-only events carry no FINISH split row; the finish time IS the crossing.
                    dnfIds.push(runner._id);
                }
            }

            for (const runner of previouslyCut as any[]) {
                const seen = crossings.get(String(runner._id));
                const finishMs = runner.finishTime ? new Date(runner.finishTime).getTime() : NaN;
                // In time here after all — either the crossing at this point now reads before the
                // cut-off, or (score-only events, which carry no FINISH split row) the finish does.
                const inTime = seen?.atCp
                    ? seen.atCp.getTime() <= cutoffMs
                    : (isFinishCp && Number.isFinite(finishMs) && finishMs <= cutoffMs);
                if (!inTime) continue;
                if (Number.isFinite(finishMs)) revertFinishedIds.push(runner._id);
                else revertRacingIds.push(runner._id);
            }
        }

        let revertModified = 0;
        for (const [ids, status] of [
            [revertFinishedIds, 'finished'] as const,
            [revertRacingIds, 'in_progress'] as const,
        ]) {
            if (ids.length === 0) continue;
            const result = await this.runnerModel.updateMany(
                { _id: { $in: ids } },
                {
                    $set: {
                        status,
                        statusCheckpoint: '',
                        statusNote: '',
                        statusChangedAt: now,
                        statusChangedBy: 'cutoff-scheduler',
                    },
                },
            ).exec();
            revertModified += result.modifiedCount;
            if (result.modifiedCount > 0) {
                this.logger.warn(
                    `Cutoff "${cpDisplayName}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${result.modifiedCount} runners DNF → ${status} (crossed in time after all)`
                );
            }
        }

        let dnfModified = 0;
        if (dnfIds.length > 0) {
            const result = await this.runnerModel.updateMany(
                { _id: { $in: dnfIds } },
                {
                    $set: {
                        status: 'dnf',
                        statusCheckpoint: cpDisplayName,
                        statusChangedAt: now,
                        statusChangedBy: 'cutoff-scheduler',
                        statusNote: `Auto DNF: missed the ${cpDisplayName} cut-off (${formatCutoffForNote(entry.cutoff)})`,
                    },
                },
            ).exec();
            dnfModified = result.modifiedCount;
            if (dnfModified > 0) {
                this.logger.warn(
                    `Cutoff "${cpDisplayName}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${dnfModified} runners → DNF`
                );
            }
        }

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
            this.logger.warn(
                `Cutoff "${cpDisplayName}"${entry.category ? ` [${entry.category}]` : ''} (${entry.cutoffStr}): ${dnsResult.modifiedCount} not_started → DNS`
            );
        }

        return { dnfCount: dnfModified, dnsCount: dnsResult.modifiedCount, revertedCount: revertModified };
    }

    /**
     * Per runner: the first crossing AT this checkpoint, and the first crossing BEYOND it.
     * Both are needed to tell "arrived late" from "the mat here missed them".
     */
    private async firstCrossings(
        cpName: string,
        cpOrderMap: Map<string, number>,
        cpOrder: number,
        eventOids: Types.ObjectId[],
    ): Promise<Map<string, { atCp: Date | null; beyond: Date | null }>> {
        const names = this.cpNamesFrom(cpOrderMap, cpOrder, cpName);
        const crossings = new Map<string, { atCp: Date | null; beyond: Date | null }>();
        if (names.length === 0) return crossings;

        const isThisCp = { $eq: [{ $toUpper: '$checkpoint' }, cpName] };
        const rows = await this.timingRecordModel.aggregate([
            {
                $match: {
                    eventId: { $in: eventOids },
                    checkpoint: { $in: names.map(n => CheckpointSchedulerService.exactNameRegex(n)) },
                },
            },
            {
                $group: {
                    _id: '$runnerId',
                    atCp: { $min: { $cond: [isThisCp, '$scanTime', null] } },
                    beyond: { $min: { $cond: [isThisCp, null, '$scanTime'] } },
                },
            },
        ]).exec();

        for (const row of rows as any[]) {
            crossings.set(String(row._id), {
                atCp: row.atCp ? new Date(row.atCp) : null,
                beyond: row.beyond ? new Date(row.beyond) : null,
            });
        }
        return crossings;
    }

    /**
     * How much data this cut-off has been judged against. Any new crossing at (or beyond) the
     * checkpoint, or any status flip in scope, changes the fingerprint and re-opens the check —
     * which is what makes a late-arriving finish get caught instead of being skipped as settled.
     */
    private async cutoffFingerprint(
        entry: CutoffEntry,
        baseScope: any,
        eventOids: Types.ObjectId[],
        cpNames: string[],
    ): Promise<string> {
        const [records, racing] = await Promise.all([
            this.timingRecordModel.countDocuments({
                eventId: { $in: eventOids },
                checkpoint: { $in: cpNames.map(n => CheckpointSchedulerService.exactNameRegex(n)) },
            }).exec(),
            this.runnerModel.countDocuments({
                ...baseScope,
                status: { $in: ['in_progress', 'finished', 'not_started'] },
            }).exec(),
        ]);
        return `${entry.cutoffStr}|${records}|${racing}`;
    }

    /** Checkpoint names at or beyond `cpOrder` — where evidence of passing this point shows up. */
    private cpNamesFrom(cpOrderMap: Map<string, number>, cpOrder: number, cpName: string): string[] {
        const names = new Set<string>([cpName]);
        for (const [name, order] of cpOrderMap.entries()) {
            if (order >= cpOrder) names.add(name);
        }
        return [...names].filter(Boolean);
    }

    /** Case-insensitive exact-match regex for a checkpoint / category name. */
    private static exactNameRegex(name: string): RegExp {
        return new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    }

    /**
     * Manually trigger cut-off check (for admin API)
     */
    async triggerCutOffCheck(): Promise<{ processed: number; dnsCount: number; dnfCount: number }> {
        this.logger.log('Manual cut-off check triggered');
        return this.checkCutOffTimes({ force: true });
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
                // Revert DNF → finished/in_progress for runners auto-DNF'd at this checkpoint.
                // Anyone who already has a finish time was cut for crossing the line late, so
                // the longer cut-off makes them a finisher again — not a runner still out there.
                const revertScope = {
                    ...baseScope,
                    status: 'dnf',
                    statusChangedBy: 'cutoff-scheduler',
                    statusCheckpoint: { $regex: new RegExp(`^${cpName}$`, 'i') },
                    isManualStatus: { $ne: true },
                };
                const revertSet = {
                    statusCheckpoint: '',
                    statusNote: '',
                    statusChangedAt: now,
                    statusChangedBy: 'cutoff-extension',
                };
                const finishedRevert = await this.runnerModel.updateMany(
                    { ...revertScope, finishTime: { $ne: null } },
                    { $set: { ...revertSet, status: 'finished' } },
                ).exec();
                const result = await this.runnerModel.updateMany(
                    { ...revertScope, finishTime: null },
                    { $set: { ...revertSet, status: 'in_progress' } },
                ).exec();
                revertedCount = result.modifiedCount + finishedRevert.modifiedCount;
                if (revertedCount > 0) {
                    this.logger.warn(
                        `Cutoff extended "${cpName}"${category ? ` [${category}]` : ''}: ${result.modifiedCount} runner(s) DNF → in_progress, ${finishedRevert.modifiedCount} → finished`
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

    onModuleDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimingRecord, TimingRecordDocument } from './timing-record.schema';
import { RunnersService } from '../runners/runners.service';
import { TimingGateway } from './timing.gateway';
import { EventsService } from '../events/events.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { formatCutoffForNote, isAdminOwnedStatus, resolveCutoffForCategory } from '../checkpoints/cutoff.util';

export interface ScanData {
    eventId: string;
    bib?: string;
    rfidTag?: string;
    checkpoint: string;
    scanTime: Date;
    note?: string;
    /** Staff typed this time in by hand (admin UI) instead of it coming off a mat. */
    isManual?: boolean;
}

/** A scan is manual when the caller says so, or when its note marks it as such. */
function isManualScan(scanData: ScanData): boolean {
    if (scanData.isManual === true) return true;
    return /manual/i.test(scanData.note || '');
}

function normalizeCheckpointRunnerValue(value?: string): string {
    return (value || '').trim().toLowerCase();
}

function formatPaceMs(timeMs: number, distKm: number): string {
    if (!timeMs || timeMs <= 0 || !distKm || distKm <= 0) return '';
    const paceMinPerKm = (timeMs / 60000) / distKm;
    const pm = Math.floor(paceMinPerKm);
    const ps = Math.round((paceMinPerKm - pm) * 60);
    return `${pm}:${String(ps).padStart(2, '0')}`;
}

/** ms → "H:MM:SS", the same shape RaceTiger sends in NetTime/GunTime strings. */
function formatMsToHHMMSS(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "H:MM:SS" / "HH:MM:SS(.mmm)" → ms. 0 when the string isn't a time. */
function parseHHMMSSToMs(value?: string): number {
    const m = String(value || '').trim().match(/^(\d+):([0-5]?\d):([0-5]?\d)(?:\.(\d{1,3}))?$/);
    if (!m) return 0;
    const ms = ((Number(m[1]) * 3600) + (Number(m[2]) * 60) + Number(m[3])) * 1000
        + (m[4] ? Number(m[4].padEnd(3, '0')) : 0);
    return Number.isFinite(ms) ? ms : 0;
}

function getCheckpointRunnerScanTimeValue(scanTime?: string | Date): number {
    if (!scanTime) return Number.POSITIVE_INFINITY;
    const value = new Date(scanTime).getTime();
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getCheckpointRunnerDedupKey(record: any): string {
    const bib = normalizeCheckpointRunnerValue(record?.bib);
    if (bib) return bib;
    return String(record?._id || 'unknown-runner');
}

function hasRunnerName(record: any): boolean {
    return !!(record?.firstName || record?.lastName);
}

function dedupeCheckpointRunnerRecords<T extends { _id?: any; scanTime?: string | Date }>(records: T[]): T[] {
    const deduped = new Map<string, T>();

    records.forEach((record) => {
        const key = getCheckpointRunnerDedupKey(record);
        const existing = deduped.get(key);

        if (!existing) {
            deduped.set(key, record);
            return;
        }

        // Always prefer the record that has a runner name (joined from runners collection)
        const existingHasName = hasRunnerName(existing);
        const nextHasName = hasRunnerName(record);

        if (!existingHasName && nextHasName) {
            // Replace orphan (no name) with the named record, but keep earliest scanTime
            const existingScanTime = getCheckpointRunnerScanTimeValue(existing.scanTime);
            const nextScanTime = getCheckpointRunnerScanTimeValue(record.scanTime);
            deduped.set(key, {
                ...record,
                scanTime: existingScanTime < nextScanTime ? existing.scanTime : record.scanTime,
                elapsedTime: (existing as any).elapsedTime || (record as any).elapsedTime,
            } as T);
            return;
        }

        if (existingHasName && !nextHasName) {
            // Keep existing (has name), just update scanTime if this orphan is earlier
            const existingScanTime = getCheckpointRunnerScanTimeValue(existing.scanTime);
            const nextScanTime = getCheckpointRunnerScanTimeValue(record.scanTime);
            if (nextScanTime < existingScanTime) {
                deduped.set(key, { ...existing, scanTime: record.scanTime } as T);
            }
            return;
        }

        // Both have name or both are orphans — keep the one with earliest scanTime
        const existingScanTime = getCheckpointRunnerScanTimeValue(existing.scanTime);
        const nextScanTime = getCheckpointRunnerScanTimeValue(record.scanTime);
        if (nextScanTime < existingScanTime) {
            deduped.set(key, { ...existing, ...record, _id: record._id || existing._id } as T);
        }
    });

    return Array.from(deduped.values());
}

// Net-first time (used for Age-group / CAT ranking — matches /event/[id] liveRanks).
function getCheckpointRankPrimaryTimeMs(record: any): number {
    const candidates = [
        record?.netTimeMs,
        record?.totalNetTimeMs,
        record?.totalNetTime,
        record?.netTime,
        record?.gunTimeMs,
        record?.totalGunTimeMs,
        record?.totalGunTime,
        record?.gunTime,
        record?.elapsedTime,
    ];
    for (const value of candidates) {
        const num = Number(value || 0);
        if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
}

// Gun-first time (used for Overall + Gender ranking — matches /event/[id] liveRanks).
function getCheckpointRankGunTimeMs(record: any): number {
    const candidates = [
        record?.gunTimeMs,
        record?.totalGunTimeMs,
        record?.totalGunTime,
        record?.gunTime,
        record?.netTimeMs,
        record?.totalNetTimeMs,
        record?.totalNetTime,
        record?.netTime,
        record?.elapsedTime,
    ];
    for (const value of candidates) {
        const num = Number(value || 0);
        if (Number.isFinite(num) && num > 0) return num;
    }
    return 0;
}

function compareCheckpointStableBib(a: any, b: any): number {
    const bibCompare = String(a?.bib || '').localeCompare(String(b?.bib || ''), undefined, { numeric: true });
    if (bibCompare !== 0) return bibCompare;
    return String(a?._id || '').localeCompare(String(b?._id || ''));
}

// Ranking comparator parametrized by the primary time extractor, so Overall/Gender
// can rank by GUN time while Age-group ranks by NET time — matching /event/[id].
function makeCheckpointRankComparator(getTime: (record: any) => number) {
    return function (a: any, b: any): number {
        const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dns: 3, dq: 4, not_started: 5 };
        const aStatus = String(a?.status || '').toLowerCase();
        const bStatus = String(b?.status || '').toLowerCase();
        const statusDiff = (statusOrder[aStatus] ?? 6) - (statusOrder[bStatus] ?? 6);
        if (statusDiff !== 0) return statusDiff;

        if (aStatus === 'finished' && bStatus === 'finished') {
            const aTime = getTime(a);
            const bTime = getTime(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = getCheckpointRunnerScanTimeValue(a?.scanTime);
            const bScan = getCheckpointRunnerScanTimeValue(b?.scanTime);
            if (aScan !== bScan) return aScan - bScan;
            return compareCheckpointStableBib(a, b);
        }

        if (aStatus === 'in_progress' && bStatus === 'in_progress') {
            const aPassed = Number(a?.passedCount ?? 0);
            const bPassed = Number(b?.passedCount ?? 0);
            if (aPassed !== bPassed) return bPassed - aPassed;
            const aTime = getTime(a);
            const bTime = getTime(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = getCheckpointRunnerScanTimeValue(a?.scanTime);
            const bScan = getCheckpointRunnerScanTimeValue(b?.scanTime);
            if (aScan !== bScan) return aScan - bScan;
            return compareCheckpointStableBib(a, b);
        }

        return compareCheckpointStableBib(a, b);
    };
}

// Overall + Gender rank by GUN time; Age-group (CAT) rank by NET time.
const compareCheckpointGunRankOrder = makeCheckpointRankComparator(getCheckpointRankGunTimeMs);
const compareCheckpointNetRankOrder = makeCheckpointRankComparator(getCheckpointRankPrimaryTimeMs);

@Injectable()
export class TimingService implements OnModuleInit {
    // In-memory cache for getLatestPerRunner (TTL 5s)
    private latestPerRunnerCache = new Map<string, { data: any[]; expiry: number }>();
    // In-memory cache for getCheckpointRecordsByCampaign (TTL 5s)
    private checkpointByCampaignCache = new Map<string, { data: any[]; expiry: number }>();
    // In-memory cache for allRunners by eventIds (TTL 10s)
    private allRunnersCache = new Map<string, { data: any[]; expiry: number }>();
    // In-memory cache of a campaign's checkpoints, for the per-scan cut-off check (TTL 15s)
    private cutoffCheckpointsCache = new Map<string, { data: any[]; expiry: number }>();
    // eventId -> campaignId (an event never moves campaign)
    private campaignIdByEvent = new Map<string, string>();
    private static readonly CACHE_TTL_MS = 5000;
    private static readonly RUNNERS_CACHE_TTL_MS = 10000;
    private static readonly CUTOFF_CACHE_TTL_MS = 15000;
    // Debounce timers for updateRankings — prevents race condition when many runners finish simultaneously
    private rankingDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // Cumulative race clocks RaceTiger stamps on a synced pass. getLatestPerRunner keeps
    // only the newest record per runner, so a record that lacks these (a hand-typed
    // checkpoint, a plain mat scan) would report them as empty and wipe the Gun/Net
    // columns of a runner still out on course. They are carried forward instead: the
    // newest record that actually has a value wins. See carryForwardGroup/carryForward.
    private static readonly CARRY_FORWARD_FIELDS = [
        'netTime', 'gunTime', 'gunTimeMs', 'netTimeMs', 'totalGunTime', 'totalNetTime', 'netPace', 'gunPace',
    ] as const;

    /**
     * $group accumulators collecting each carried field newest-first, as { v, t } pairs
     * (the value and the scanTime it was measured at); a blank contributes null.
     */
    private static carryForwardGroup(): Record<string, any> {
        return Object.fromEntries(TimingService.CARRY_FORWARD_FIELDS.map(field => [
            `${field}Chain`,
            {
                // $ifNull first: a field the record simply does not have is "missing", which
                // $eq against null does NOT match — without this every blank would be kept.
                $push: {
                    $let: {
                        vars: { val: { $ifNull: [`$${field}`, null] } },
                        in: {
                            $cond: [
                                { $or: [{ $eq: ['$$val', null] }, { $eq: ['$$val', 0] }, { $eq: ['$$val', ''] }] },
                                null,
                                { v: '$$val', t: '$scanTime' },
                            ],
                        },
                    },
                },
            },
        ]));
    }

    /** The newest non-empty { v, t } pair of a carried field. */
    private static newestCarried(field: string): any {
        return {
            $arrayElemAt: [
                { $filter: { input: `$${field}Chain`, cond: { $ne: ['$$this', null] } } },
                0,
            ],
        };
    }

    /** $project expression for the newest non-empty value of a carried field, as stored. */
    private static carryForward(field: string): any {
        return { $ifNull: [{ $let: { vars: { base: TimingService.newestCarried(field) }, in: '$$base.v' } }, null] };
    }

    /**
     * $project expression for a cumulative race clock (gun/net time). The clock runs from a
     * fixed start, so when the newest record carries no value the newest one that does is
     * wound forward by the wall-clock gap up to the newest scan — a hand-typed checkpoint
     * then reports the time at ITS crossing, not at the checkpoint before it.
     */
    private static carryForwardClock(field: string): any {
        return {
            $let: {
                vars: { base: TimingService.newestCarried(field) },
                in: {
                    $cond: [
                        { $eq: [{ $ifNull: ['$$base.v', null] }, null] },
                        null,
                        { $add: ['$$base.v', { $max: [0, { $subtract: ['$scanTime', '$$base.t'] }] }] },
                    ],
                },
            },
        };
    }

    constructor(
        @InjectModel(TimingRecord.name) private timingModel: Model<TimingRecordDocument>,
        private runnersService: RunnersService,
        private timingGateway: TimingGateway,
        private eventsService: EventsService,
        private checkpointsService: CheckpointsService,
    ) { }

    /**
     * Backfill for records created before `isManualTime` existed: the admin UI has
     * always stamped them with a "manual" note, so that note is the only evidence
     * left that a time was typed in rather than captured. Runs once per boot and is
     * a no-op afterwards.
     */
    async onModuleInit(): Promise<void> {
        try {
            const res = await this.timingModel.updateMany(
                { isManualTime: { $ne: true }, note: /manual/i },
                { $set: { isManualTime: true } },
            ).exec();
            if (res.modifiedCount > 0) {
                console.log(`[timing] Backfilled isManualTime on ${res.modifiedCount} legacy manual records`);
            }
        } catch { /* non-fatal — flag stays off until the record is edited again */ }
    }

    async processScan(scanData: ScanData): Promise<TimingRecordDocument> {
        // Find runner by BIB or RFID
        const runner = scanData.bib
            ? await this.runnersService.findByBib(scanData.eventId, scanData.bib)
            : await this.runnersService.findByRfid(scanData.eventId, scanData.rfidTag || '');

        if (!runner) {
            throw new Error(`Runner not found: ${scanData.bib || scanData.rfidTag}`);
        }

        // Get existing records to calculate order and split time
        const existingRecords = await this.getRunnerRecords(scanData.eventId, runner._id.toString());
        const order = existingRecords.length + 1;

        // Calculate elapsed time from start
        let elapsedTime = 0;
        let splitTime = 0;
        if (runner.startTime) {
            elapsedTime = new Date(scanData.scanTime).getTime() - new Date(runner.startTime).getTime();
        }
        if (existingRecords.length > 0) {
            const lastRecord = existingRecords[existingRecords.length - 1];
            splitTime = new Date(scanData.scanTime).getTime() - new Date(lastRecord.scanTime).getTime();
        }

        // Cumulative gun/net time for this crossing. RaceTiger stamps both on every
        // synced pass, and the public table reads them off the runner's NEWEST record —
        // so a hand-typed checkpoint that carried neither used to blank out the Gun/Net
        // columns of someone still out on course. Anchor each clock on the newest record
        // that does carry it (gun start = that record's scanTime - its gunTime) and
        // measure this scan from there. A typed START owns the net clock, so
        // runner.startTime wins for net when it is set.
        const scanMs = new Date(scanData.scanTime).getTime();
        const timeFromAnchor = (field: 'gunTime' | 'netTime'): number | null => {
            const anchor = existingRecords
                .filter(r => Number((r as any)[field]) > 0 && r.scanTime)
                .sort((a, b) => new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime())[0];
            if (!anchor) return null;
            const clockStartMs = new Date(anchor.scanTime).getTime() - Number((anchor as any)[field]);
            const ms = scanMs - clockStartMs;
            return Number.isFinite(ms) && ms > 0 ? ms : null;
        };
        const recordNetTime = elapsedTime > 0 ? elapsedTime : timeFromAnchor('netTime');
        const recordGunTime = timeFromAnchor('gunTime');

        // Create timing record
        const manual = isManualScan(scanData);
        const record = new this.timingModel({
            eventId: new Types.ObjectId(scanData.eventId),
            runnerId: runner._id,
            bib: runner.bib,
            checkpoint: scanData.checkpoint,
            scanTime: scanData.scanTime,
            rfidTag: scanData.rfidTag || runner.rfidTag,
            order,
            note: scanData.note,
            splitTime,
            elapsedTime,
            ...(recordNetTime ? { netTime: recordNetTime } : {}),
            ...(recordGunTime ? { gunTime: recordGunTime } : {}),
            isManualTime: manual,
            ...(manual ? { manualTimeAt: new Date() } : {}),
        });

        await record.save();

        // Update runner status and timing
        const isStart = scanData.checkpoint.toUpperCase() === 'START';
        const isFinish = scanData.checkpoint.toUpperCase() === 'FINISH';

        const updateData: any = {
            latestCheckpoint: scanData.checkpoint,
            elapsedTime,
        };

        // ── Cut-off ──────────────────────────────────────────────────────────────────
        // Same rule as the cut-off scheduler: a crossing stamped AFTER a checkpoint's
        // cut-off does not take the runner through it. Someone who reaches the finish
        // line past the cut-off is a DNF, not a finisher — whether the record comes off
        // the mat live or is typed in later.
        const campaignCps = await this.getCutoffCheckpoints(scanData.eventId);
        // START keeps its own semantics (missing START → DNS), so it is never "late" here.
        const cutoffHere = isStart ? null : this.cutoffFor(campaignCps, scanData.checkpoint, runner.category);
        const crossedLate = !!cutoffHere && scanMs > cutoffHere.getTime();
        // The cut-off that already stopped this runner, if any. A later scan lifts it only
        // when this crossing proves they made that checkpoint in time (a mat read that
        // reached us late) — otherwise the scan would quietly undo the DNF.
        const stoppedAtCp = String((runner as any).statusCheckpoint || '');
        const stoppedCutoff = stoppedAtCp ? this.cutoffFor(campaignCps, stoppedAtCp, runner.category) : null;
        const clearsPriorCutoff = !stoppedCutoff
            || (scanMs <= stoppedCutoff.getTime()
                && this.cpOrder(campaignCps, scanData.checkpoint) >= this.cpOrder(campaignCps, stoppedAtCp));

        // Respect isManualStatus: if staff manually set DNF/DNS/DQ, don't override
        const isManuallySet = (runner as any).isManualStatus === true;
        const isStoppedStatus = ['dnf', 'dns', 'dq'].includes(runner.status);
        const isCutoffStopped = !isManuallySet
            && (runner.status === 'dns' || runner.status === 'dnf')
            && (runner as any).statusChangedBy === 'cutoff-scheduler';
        // A DNS/DNF set by the cutoff scheduler is recoverable: if the runner shows up
        // and scans any checkpoint, treat it as a re-entry. We never override a manual
        // status, but we DO undo automatic ones.
        const isAutoStoppedByScheduler = isCutoffStopped && clearsPriorCutoff;

        if (isManuallySet && isStoppedStatus) {
            // Staff manually set this status — record the timing but DON'T change status
            updateData.isStarted = true;
        } else if (crossedLate && !isAdminOwnedStatus(runner)) {
            // Past the cut-off for this checkpoint → out of the race.
            if (isFinish) {
                updateData.finishTime = scanData.scanTime;
                updateData.netTime = elapsedTime;
            }
            updateData.status = 'dnf';
            updateData.statusCheckpoint = scanData.checkpoint;
            updateData.statusChangedAt = new Date();
            updateData.statusChangedBy = 'cutoff-scheduler';
            updateData.statusNote = `Auto DNF: missed the ${scanData.checkpoint} cut-off (${formatCutoffForNote(cutoffHere!)})`;
            updateData.isStarted = true;
        } else if (isCutoffStopped && !clearsPriorCutoff) {
            // Still cut at an earlier checkpoint — keep the DNF/DNS, just record the crossing.
            if (isStart) updateData.startTime = scanData.scanTime;
            if (isFinish) {
                updateData.finishTime = scanData.scanTime;
                updateData.netTime = elapsedTime;
            }
            updateData.isStarted = true;
        } else if (isStart) {
            updateData.startTime = scanData.scanTime;
            updateData.status = 'in_progress';
            updateData.isStarted = true;
        } else if (isFinish) {
            updateData.finishTime = scanData.scanTime;
            updateData.netTime = elapsedTime;
            // Auto-DQ (mirrors the manual admin action): a runner who reaches FINISH but never
            // crossed START is disqualified. Guarded by eventHasStartRecords() so gun-start events
            // with no START mat are never affected. Manually-set statuses are left untouched.
            const crossedStart = !!runner.startTime
                || existingRecords.some(r => String(r.checkpoint || '').toUpperCase() === 'START');
            if (!crossedStart && !isManuallySet && await this.eventHasStartRecords(scanData.eventId)) {
                updateData.status = 'dq';
                updateData.statusChangedBy = 'auto-dq-no-start';
                updateData.statusChangedAt = new Date();
                updateData.statusNote = 'Auto DQ: finished without a START record';
            } else {
                updateData.status = 'finished';
            }
        } else if (runner.status === 'not_started' || isAutoStoppedByScheduler) {
            // not_started → first scan brings them into the race.
            // dns/dnf-by-scheduler → revert when they actually scan a CP (safety net for the
            // case where someone misses START but appears at CP1+, or was DNS'd by an
            // earlier cutoff but is now passing checkpoints).
            updateData.status = 'in_progress';
            updateData.isStarted = true;
            updateData.statusChangedBy = 'timing-scan';
        }

        await this.runnersService.update(runner._id.toString(), updateData);

        // Recompute passedCount + latestCheckpoint from records so the Runner doc
        // reflects the new scan immediately (the warning "5/6 CP" badge depends on this).
        await this.recomputeRunnerAggregates(scanData.eventId, runner._id.toString())
            .catch(() => { /* non-fatal */ });

        // Update rankings if finished — debounced to consolidate concurrent finish scans.
        // A hand-typed START on someone who already finished changes their net time
        // (net = FINISH − START), so the net-ranked pools must be recomputed too.
        if (isFinish || (manual && isStart && runner.status === 'finished')) {
            this.scheduleRankingUpdate(scanData.eventId, runner.category);
        }

        // Broadcast update via WebSocket — use known data to avoid extra DB round-trip
        this.timingGateway.broadcastRunnerUpdate(scanData.eventId, { ...(runner as any), ...updateData });

        return record;
    }

    /**
     * The campaign's checkpoints, cached briefly — every scan consults them for cut-offs.
     * Returns [] when the event has no campaign or the lookup fails, which simply means
     * "no cut-offs apply" and leaves scan handling as it was.
     */
    private async getCutoffCheckpoints(eventId: string): Promise<any[]> {
        try {
            let campaignId = this.campaignIdByEvent.get(eventId);
            if (!campaignId) {
                const event: any = await this.eventsService.findOne(eventId);
                campaignId = event?.campaignId ? String(event.campaignId) : '';
                if (!campaignId) return [];
                this.campaignIdByEvent.set(eventId, campaignId);
            }
            const cached = this.cutoffCheckpointsCache.get(campaignId);
            if (cached && cached.expiry > Date.now()) return cached.data;
            const cps = await this.checkpointsService.findByCampaign(campaignId) as any[];
            this.cutoffCheckpointsCache.set(campaignId, {
                data: cps,
                expiry: Date.now() + TimingService.CUTOFF_CACHE_TTL_MS,
            });
            return cps;
        } catch {
            return [];
        }
    }

    /** Cut-off applying to `checkpoint` for a runner in `category`, or null when there is none. */
    private cutoffFor(checkpoints: any[], checkpoint: string, category?: string): Date | null {
        const target = String(checkpoint || '').trim().toUpperCase();
        if (!target) return null;
        const cp = checkpoints.find(c => String(c?.name || '').trim().toUpperCase() === target);
        if (!cp || cp.active === false) return null;
        return resolveCutoffForCategory(cp, category);
    }

    /** orderNum of a checkpoint by name; -1 when the campaign has no such checkpoint. */
    private cpOrder(checkpoints: any[], checkpoint: string): number {
        const target = String(checkpoint || '').trim().toUpperCase();
        const cp = checkpoints.find(c => String(c?.name || '').trim().toUpperCase() === target);
        return cp?.orderNum ?? -1;
    }

    private scheduleRankingUpdate(eventId: string, category: string): void {
        const key = `${eventId}:${category}`;
        const existing = this.rankingDebounceTimers.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(async () => {
            this.rankingDebounceTimers.delete(key);
            await this.runnersService.updateRankings(eventId, category).catch(console.error);
        }, 500);
        this.rankingDebounceTimers.set(key, timer);
    }

    /** True if any runner in the event has a START timing record (i.e. the event uses a START line). */
    private async eventHasStartRecords(eventId: string): Promise<boolean> {
        const one = await this.timingModel.findOne({
            eventId: new Types.ObjectId(eventId),
            $expr: { $eq: [{ $toUpper: '$checkpoint' }, 'START'] },
        }).select('_id').lean().exec();
        return !!one;
    }

    async getRunnerRecords(eventId: string, runnerId: string): Promise<TimingRecordDocument[]> {
        return this.timingModel
            .find({
                eventId: new Types.ObjectId(eventId),
                runnerId: new Types.ObjectId(runnerId),
            })
            .sort({ order: 1 })
            .lean()
            .exec() as Promise<TimingRecordDocument[]>;
    }

    /**
     * Get per-checkpoint ranks for a specific runner within their event.
     * Returns a map: checkpoint name → rank (1-based, by netTime ascending).
     * Optimized: uses targeted $count per checkpoint instead of loading all runners.
     */
    async getCheckpointRanksForRunner(eventId: string, bib: string): Promise<Map<string, number>> {
        const objectId = new Types.ObjectId(eventId);

        // 1. Get this runner's timing records (their netTime per checkpoint)
        const runnerTimings = await this.timingModel.find(
            { eventId: objectId, bib, netTime: { $gt: 0 } },
        ).select('checkpoint netTime').lean().exec();

        if (!runnerTimings.length) return new Map();

        // 2. For each checkpoint, count how many runners are faster
        const rankMap = new Map<string, number>();
        await Promise.all(runnerTimings.map(async (t: any) => {
            const fasterCount = await this.timingModel.countDocuments({
                eventId: objectId,
                checkpoint: t.checkpoint,
                netTime: { $gt: 0, $lt: t.netTime },
            }).exec();
            rankMap.set(t.checkpoint, fasterCount + 1);
        }));

        return rankMap;
    }

    async getEventRecords(eventId: string): Promise<TimingRecordDocument[]> {
        return this.timingModel
            .find({ eventId: new Types.ObjectId(eventId) })
            .sort({ scanTime: -1 })
            .limit(100)
            .lean()
            .exec() as Promise<TimingRecordDocument[]>;
    }

    async getLatestPerRunner(eventIds: string[]): Promise<any[]> {
        // --- In-memory cache (5s TTL) ---
        const cacheKey = [...eventIds].sort().join(',');
        const cached = this.latestPerRunnerCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }

        const objectIds = eventIds.map(id => new Types.ObjectId(id));
        // Group by bib+eventId (not runnerId) so we survive clean-slate re-imports
        // that delete & recreate Runner docs with new ObjectIds.
        const result = await this.timingModel.aggregate([
            { $match: { eventId: { $in: objectIds } } },
            { $sort: { scanTime: -1 } },
            {
                $group: {
                    _id: { bib: '$bib', eventId: '$eventId' },
                    runnerId: { $first: '$runnerId' },
                    checkpoint: { $first: '$checkpoint' },
                    scanTime: { $first: '$scanTime' },
                    ...TimingService.carryForwardGroup(),
                    splitTime: { $first: '$splitTime' },
                    distanceFromStart: { $first: '$distanceFromStart' },
                    order: { $first: '$order' },
                    uniqueCheckpoints: { $addToSet: '$checkpoint' },
                    // null placeholders for non-manual records; stripped in $project below
                    manualCheckpointsRaw: {
                        $addToSet: {
                            $cond: [{ $eq: ['$isManualTime', true] }, { $toUpper: '$checkpoint' }, null],
                        },
                    },
                    // Wall-clock time of this runner's FINISH scan, if they have one at
                    // all. For a DNF/DQ it is the proof they made it back to the finish
                    // area rather than being unaccounted for out on course. $max skips
                    // the nulls the non-finish records contribute.
                    finishScanTime: {
                        $max: {
                            $cond: [
                                {
                                    $regexMatch: {
                                        input: { $toUpper: { $ifNull: ['$checkpoint', ''] } },
                                        regex: /FINISH|^FIN$/,
                                    },
                                },
                                '$scanTime',
                                null,
                            ],
                        },
                    },
                    splitNo: { $first: '$splitNo' },
                    splitDesc: { $first: '$splitDesc' },
                    splitPace: { $first: '$splitPace' },
                    chipCode: { $first: '$chipCode' },
                    printingCode: { $first: '$printingCode' },
                    supplement: { $first: '$supplement' },
                    cutOff: { $first: '$cutOff' },
                    legTime: { $first: '$legTime' },
                    legPace: { $first: '$legPace' },
                    legDistance: { $first: '$legDistance' },
                    lagMs: { $first: '$lagMs' },
                },
            },
            // Lookup current runner by bib + eventId (resilient to runnerId changes)
            {
                $lookup: {
                    from: 'runners',
                    let: { bib: '$_id.bib', eventId: '$_id.eventId' },
                    pipeline: [
                        { $match: { $expr: { $and: [{ $eq: ['$bib', '$$bib'] }, { $eq: ['$eventId', '$$eventId'] }] } } },
                        { $limit: 1 },
                    ],
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: '$runner._id',
                    eventId: '$_id.eventId',
                    bib: '$_id.bib',
                    firstName: '$runner.firstName',
                    lastName: '$runner.lastName',
                    firstNameTh: '$runner.firstNameTh',
                    lastNameTh: '$runner.lastNameTh',
                    gender: '$runner.gender',
                    category: '$runner.category',
                    ageGroup: '$runner.ageGroup',
                    age: '$runner.age',
                    nationality: '$runner.nationality',
                    team: '$runner.team',
                    teamName: '$runner.teamName',
                    status: '$runner.status',
                    latestCheckpoint: '$checkpoint',
                    passedCount: { $size: '$uniqueCheckpoints' },
                    manualCheckpoints: { $setDifference: ['$manualCheckpointsRaw', [null]] },
                    scanTime: 1,
                    // Prefer the runner-stored value when an admin has manually edited it
                    // (e.g. /admin/results gun/net time edit). Fall back to the timing
                    // record's value when the runner has no override.
                    netTime: { $cond: [{ $gt: ['$runner.netTime', 0] }, '$runner.netTime', TimingService.carryForwardClock('netTime')] },
                    gunTime: { $cond: [{ $gt: ['$runner.gunTime', 0] }, '$runner.gunTime', TimingService.carryForwardClock('gunTime')] },
                    splitTime: 1,
                    distanceFromStart: 1,
                    order: 1,
                    overallRank: '$runner.overallRank',
                    genderRank: '$runner.genderRank',
                    genderNetRank: '$runner.genderNetRank',
                    ageGroupRank: '$runner.ageGroupRank',
                    ageGroupNetRank: '$runner.ageGroupNetRank',
                    categoryRank: '$runner.categoryRank',
                    categoryNetRank: '$runner.categoryNetRank',
                    netTimeStr: '$runner.netTimeStr',
                    gunTimeStr: '$runner.gunTimeStr',
                    gunPace: { $ifNull: ['$runner.gunPace', TimingService.carryForward('gunPace')] },
                    netPace: { $ifNull: ['$runner.netPace', TimingService.carryForward('netPace')] },
                    statusCheckpoint: '$runner.statusCheckpoint',
                    statusNote: '$runner.statusNote',
                    finishScanTime: 1,
                    returnedHome: '$runner.returnedHome',
                    returnedHomeNote: '$runner.returnedHomeNote',
                    returnedHomeBy: '$runner.returnedHomeBy',
                    returnedHomeAt: '$runner.returnedHomeAt',
                    chipCode: { $ifNull: ['$runner.chipCode', '$chipCode'] },
                    printingCode: { $ifNull: ['$runner.printingCode', '$printingCode'] },
                    totalFinishers: '$runner.totalFinishers',
                    genderFinishers: '$runner.genderFinishers',
                    splitNo: 1,
                    splitDesc: 1,
                    splitPace: 1,
                    gunTimeMs: TimingService.carryForward('gunTimeMs'),
                    netTimeMs: TimingService.carryForward('netTimeMs'),
                    totalGunTime: TimingService.carryForwardClock('totalGunTime'),
                    totalNetTime: TimingService.carryForwardClock('totalNetTime'),
                    totalGunTimeMs: 1,
                    totalNetTimeMs: 1,
                    supplement: 1,
                    cutOff: 1,
                    legTime: 1,
                    legPace: 1,
                    legDistance: 1,
                    lagMs: 1,
                    lapCount: '$runner.lapCount',
                    bestLapTime: '$runner.bestLapTime',
                    avgLapTime: '$runner.avgLapTime',
                    lastLapTime: '$runner.lastLapTime',
                    lastPassTime: '$runner.lastPassTime',
                    elapsedTime: '$runner.elapsedTime',
                },
            },
            { $sort: { scanTime: -1 } },
        ]).exec();

        // Store in cache
        this.latestPerRunnerCache.set(cacheKey, { data: result, expiry: Date.now() + TimingService.CACHE_TTL_MS });
        return result;
    }

    async getCheckpointRecords(eventId: string, checkpoint: string): Promise<any[]> {
        const objectId = new Types.ObjectId(eventId);
        const records = await this.timingModel.aggregate([
            { $match: { eventId: objectId, checkpoint } },
            { $sort: { scanTime: 1 } },
            {
                $lookup: {
                    from: 'runners',
                    localField: 'runnerId',
                    foreignField: '_id',
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: '$runner._id',
                    bib: 1,
                    checkpoint: 1,
                    scanTime: 1,
                    elapsedTime: 1,
                    splitTime: 1,
                    order: 1,
                    firstName: '$runner.firstName',
                    lastName: '$runner.lastName',
                    gender: '$runner.gender',
                    category: '$runner.category',
                    status: '$runner.status',
                    overallRank: '$runner.overallRank',
                    genderRank: '$runner.genderRank',
                    categoryRank: '$runner.categoryRank',
                    netTime: { $ifNull: ['$runner.netTime', '$elapsedTime'] },
                    gunTime: '$runner.gunTime',
                    netPace: '$runner.netPace',
                    gunPace: '$runner.gunPace',
                },
            },
        ]).exec();

        return dedupeCheckpointRunnerRecords(records);
    }

    async getCheckpointRecordsByCampaign(campaignId: string, checkpoint: string): Promise<any[]> {
        // --- In-memory cache (5s TTL) ---
        const cacheKey = `${campaignId}::${checkpoint}`;
        const cached = this.checkpointByCampaignCache.get(cacheKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }

        const events = await this.eventsService.findByCampaign(campaignId);
        // Include campaignId itself in the event IDs set (runners/timing records may use campaignId as eventId)
        const eventIdSet = new Set<string>([campaignId]);
        if (events && events.length > 0) {
            events.forEach((e: any) => {
                const id = String(e._id || '');
                if (id) eventIdSet.add(id);
            });
        }
        const eventIds = Array.from(eventIdSet)
            .filter(id => Types.ObjectId.isValid(id))
            .map(id => new Types.ObjectId(id));
        const records = await this.timingModel.aggregate([
            { $match: { eventId: { $in: eventIds }, checkpoint } },
            { $sort: { scanTime: 1, bib: 1 } },
            {
                $group: {
                    _id: '$bib',
                    runnerId: { $first: '$runnerId' },
                    timingId: { $first: '$_id' },
                    bib: { $first: '$bib' },
                    checkpoint: { $first: '$checkpoint' },
                    scanTime: { $first: '$scanTime' },
                    elapsedTime: { $first: '$elapsedTime' },
                    splitTime: { $first: '$splitTime' },
                    order: { $first: '$order' },
                    netTime: { $first: '$netTime' },
                    gunTime: { $first: '$gunTime' },
                    netPace: { $first: '$netPace' },
                    gunPace: { $first: '$gunPace' },
                    splitPace: { $first: '$splitPace' },
                    splitNo: { $first: '$splitNo' },
                    splitDesc: { $first: '$splitDesc' },
                    distanceFromStart: { $first: '$distanceFromStart' },
                },
            },
            { $sort: { scanTime: 1, bib: 1 } },
            // Simple localField/foreignField $lookup (uses indexes efficiently)
            {
                $lookup: {
                    from: 'runners',
                    localField: 'runnerId',
                    foreignField: '_id',
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: { $ifNull: ['$runner._id', '$timingId'] },
                    bib: 1,
                    checkpoint: 1,
                    scanTime: 1,
                    elapsedTime: 1,
                    splitTime: 1,
                    order: 1,
                    netTime: { $ifNull: ['$netTime', '$elapsedTime'] },
                    gunTime: 1,
                    netPace: { $ifNull: ['$runner.netPace', '$netPace'] },
                    gunPace: { $ifNull: ['$runner.gunPace', '$gunPace'] },
                    splitPace: 1,
                    splitNo: 1,
                    splitDesc: 1,
                    distanceFromStart: 1,
                    firstName: { $ifNull: ['$runner.firstName', ''] },
                    lastName: { $ifNull: ['$runner.lastName', ''] },
                    firstNameTh: '$runner.firstNameTh',
                    lastNameTh: '$runner.lastNameTh',
                    gender: { $ifNull: ['$runner.gender', ''] },
                    category: { $ifNull: ['$runner.category', ''] },
                    status: { $ifNull: ['$runner.status', 'in_progress'] },
                    overallRank: { $ifNull: ['$runner.overallRank', 0] },
                    genderRank: { $ifNull: ['$runner.genderRank', 0] },
                    categoryRank: { $ifNull: ['$runner.categoryRank', 0] },
                    ageGroup: '$runner.ageGroup',
                    nationality: '$runner.nationality',
                    team: '$runner.team',
                    teamName: '$runner.teamName',
                    statusCheckpoint: '$runner.statusCheckpoint',
                    statusNote: '$runner.statusNote',
                },
            },
        ]).exec();

        const deduped = dedupeCheckpointRunnerRecords(records);

        // ── Build checkpoint ordering map (name → orderNum) for per-CP status logic ──
        const cpOrderMap = new Map<string, number>();
        try {
            const campaignCheckpoints = await this.checkpointsService.findByCampaign(campaignId);
            for (const cp of campaignCheckpoints) {
                const cpObj = cp as any;
                const cpName = (cpObj.name || '').toUpperCase();
                if (cpName) cpOrderMap.set(cpName, cpObj.orderNum ?? 0);
            }
        } catch { /* checkpoints may not exist yet */ }
        const currentCpOrder = cpOrderMap.get(checkpoint.toUpperCase()) ?? -1;

        // ── Merge DNF/DNS/DQ runners + fix statuses per-checkpoint ──
        const eventIdStrings = eventIds.map(id => id.toHexString());
        // Use cached allRunners (10s TTL) to avoid repeated full-collection loads
        const runnersCacheKey = eventIdStrings.sort().join(',');
        let allRunners: any[];
        const cachedRunners = this.allRunnersCache.get(runnersCacheKey);
        if (cachedRunners && cachedRunners.expiry > Date.now()) {
            allRunners = cachedRunners.data;
        } else {
            allRunners = await this.runnersService.findByEventIds(eventIdStrings, {});
            this.allRunnersCache.set(runnersCacheKey, { data: allRunners, expiry: Date.now() + TimingService.RUNNERS_CACHE_TTL_MS });
        }
        if (allRunners && allRunners.length > 0) {
            const runnerByBib = new Map<string, any>();
            for (const runner of allRunners) {
                const r = runner as any;
                if (r.bib) {
                    runnerByBib.set(String(r.bib), r);
                }
            }

            const latestPerRunner = await this.getLatestPerRunner(eventIdStrings);
            const rankSourceByBib = new Map<string, any>();
            for (const latest of latestPerRunner) {
                const bib = String((latest as any)?.bib || '');
                if (!bib) continue;
                rankSourceByBib.set(bib, { ...latest });
            }
            for (const runner of allRunners) {
                const r = runner as any;
                const bib = String(r.bib || '');
                if (!bib || rankSourceByBib.has(bib)) continue;
                rankSourceByBib.set(bib, { ...r, passedCount: 0 });
            }

            const rankable = Array.from(rankSourceByBib.values()).filter((runner: any) => {
                const status = String(runner?.status || '').toLowerCase();
                return status === 'finished' || status === 'in_progress';
            });
            // Rank ordering mirrors /event/[id] liveRanks:
            //  • Overall + Gender by GUN time, scoped PER EVENT (each distance ranks separately)
            //  • Age-group (CAT) by NET time, scoped per event + gender + ageGroup
            const eventKeyOf = (runner: any) => String(runner?.eventId || '_');
            const genderKeyOf = (runner: any) => String(runner?.gender || '_').toUpperCase();

            const overallRankMap = new Map<string, number>();
            const genderRankMap = new Map<string, number>();
            const overallCounters = new Map<string, number>();
            const genderCounters = new Map<string, number>();
            [...rankable].sort(compareCheckpointGunRankOrder).forEach((runner: any) => {
                const bib = String(runner?.bib || '');
                const eventKey = eventKeyOf(runner);
                const genderKey = `${eventKey}::${genderKeyOf(runner)}`;
                overallCounters.set(eventKey, (overallCounters.get(eventKey) || 0) + 1);
                genderCounters.set(genderKey, (genderCounters.get(genderKey) || 0) + 1);
                overallRankMap.set(bib, overallCounters.get(eventKey)!);
                genderRankMap.set(bib, genderCounters.get(genderKey)!);
            });
            // Category (CAT) rank by NET time, scoped to event + gender + ageGroup so
            // M40-49 and F40-49 (and different distances) rank separately.
            const categoryRankMap = new Map<string, number>();
            const categoryCounters = new Map<string, number>();
            [...rankable].sort(compareCheckpointNetRankOrder).forEach((runner: any) => {
                const ageGroup = String(runner?.ageGroup || '');
                if (!ageGroup) return;
                const catKey = `${eventKeyOf(runner)}::${genderKeyOf(runner)}::${ageGroup}`;
                categoryCounters.set(catKey, (categoryCounters.get(catKey) || 0) + 1);
                categoryRankMap.set(String(runner?.bib || ''), categoryCounters.get(catKey)!);
            });
            const applyRaceRanks = (record: any, bib: string) => {
                record.overallRank = overallRankMap.get(bib) || 0;
                record.genderRank = genderRankMap.get(bib) || 0;
                record.categoryRank = categoryRankMap.get(bib) || 0;
            };

            // 1) Fix status for runners already in results (have timing at this CP)
            const existingBibs = new Set<string>();
            for (const rec of deduped) {
                if (rec.bib) {
                    existingBibs.add(String(rec.bib));
                    const dbRunner = runnerByBib.get(String(rec.bib));
                    if (dbRunner) {
                        const dbStatus = (dbRunner.status || 'not_started').toLowerCase();
                        const dbStatusCp = dbRunner.statusCheckpoint || '';

                        if (['dnf', 'dq'].includes(dbStatus)) {
                            if (dbStatusCp) {
                                // Admin-set statusCheckpoint: show DNF only at that CP, passed elsewhere
                                const stoppedOrder = cpOrderMap.get(dbStatusCp.toUpperCase()) ?? -1;
                                if (stoppedOrder === currentCpOrder || currentCpOrder < 0 || stoppedOrder < 0) {
                                    rec.status = dbRunner.status; // DNF/DQ at this CP
                                } else {
                                    rec.status = 'finished'; // passed here, DNF elsewhere
                                }
                            } else {
                                // No statusCheckpoint — show DNF/DQ at all checkpoints with timing
                                rec.status = dbRunner.status;
                            }
                        } else {
                            rec.status = dbRunner.status || 'not_started';
                        }

                        // Fill in missing runner data if $lookup failed
                        if (!rec.firstName && dbRunner.firstName) rec.firstName = dbRunner.firstName;
                        if (!rec.lastName && dbRunner.lastName) rec.lastName = dbRunner.lastName;
                        if (!rec.gender && dbRunner.gender) rec.gender = dbRunner.gender;
                        if (!rec.category && dbRunner.category) rec.category = dbRunner.category;
                        rec.statusCheckpoint = dbRunner.statusCheckpoint || '';
                        rec.statusNote = dbRunner.statusNote || '';
                    }
                    applyRaceRanks(rec, String(rec.bib));
                }
            }

            // 2) Add stopped runners NOT in results (no timing at this checkpoint)
            //    - DNS: always add (never started → missing everywhere)
            //    - DNF/DQ with statusCheckpoint matching this CP: add (admin marked them here)
            //    - DNF/DQ otherwise: DON'T add (they never reached this checkpoint)
            for (const runner of allRunners) {
                const r = runner as any;
                const st = (r.status || '').toLowerCase();
                if (!['dnf', 'dns', 'dq'].includes(st)) continue;
                if (!r.bib || existingBibs.has(String(r.bib))) continue;

                if (['dnf', 'dq'].includes(st)) {
                    const sCp = (r.statusCheckpoint || '').toUpperCase();
                    if (sCp) {
                        // Staff-set statusCheckpoint: only show at that specific CP
                        const stoppedOrder = cpOrderMap.get(sCp) ?? -1;
                        if (stoppedOrder !== currentCpOrder) continue;
                    } else {
                        // No statusCheckpoint — skip (DNF runners without a CP assignment
                        // shouldn't appear at checkpoints they never reached)
                        continue;
                    }
                }

                deduped.push({
                    _id: r._id,
                    bib: r.bib,
                    checkpoint: null,
                    scanTime: null,
                    elapsedTime: null,
                    splitTime: null,
                    order: null,
                    netTime: r.netTime || null,
                    gunTime: r.gunTime || null,
                    netPace: r.netPace || '',
                    gunPace: r.gunPace || '',
                    splitPace: null,
                    firstName: r.firstName || '',
                    lastName: r.lastName || '',
                    firstNameTh: r.firstNameTh || '',
                    lastNameTh: r.lastNameTh || '',
                    gender: r.gender || '',
                    category: r.category || '',
                    status: r.status,
                    overallRank: r.overallRank || 0,
                    genderRank: r.genderRank || 0,
                    categoryRank: r.categoryRank || 0,
                    ageGroup: r.ageGroup || '',
                    nationality: r.nationality || '',
                    team: r.team || '',
                    teamName: r.teamName || '',
                    statusCheckpoint: r.statusCheckpoint || '',
                    statusNote: r.statusNote || '',
                } as any);
                applyRaceRanks(deduped[deduped.length - 1], String(r.bib));
            }

            // ── Add "incoming" runners: passed a previous checkpoint but NOT this one ──
            // These runners are "on their way" (กำลังมา) to the current checkpoint.
            if (cpOrderMap.size > 0 && currentCpOrder >= 0) {
                // Find all checkpoints with lower order than the current one
                const prevCpNames: string[] = [];
                for (const [cpName, order] of cpOrderMap.entries()) {
                    if (order < currentCpOrder) prevCpNames.push(cpName);
                }
                if (prevCpNames.length > 0) {
                    // Find runners who have timing at any previous checkpoint
                    // Use exact $in match instead of regex for better index utilization
                    const prevCpTimingRecords = await this.timingModel.find({
                        eventId: { $in: eventIds },
                        checkpoint: { $in: prevCpNames },
                    }).select('bib runnerId checkpoint scanTime').lean().exec();
                    // Get unique BIBs from previous checkpoints
                    const bibsAtPrevCp = new Set<string>();
                    const latestPrevScan = new Map<string, { scanTime: Date; checkpoint: string }>();
                    for (const tr of prevCpTimingRecords) {
                        const bib = String((tr as any).bib);
                        if (!bib) continue;
                        bibsAtPrevCp.add(bib);
                        const scanTime = (tr as any).scanTime ? new Date((tr as any).scanTime) : null;
                        const existingPrev = latestPrevScan.get(bib);
                        if (scanTime && (!existingPrev || scanTime > existingPrev.scanTime)) {
                            latestPrevScan.set(bib, { scanTime, checkpoint: (tr as any).checkpoint });
                        }
                    }
                    // Filter: has timing at prev CP, NOT at current CP, NOT DNF/DNS/DQ
                    for (const runner of allRunners) {
                        const r = runner as any;
                        if (!r.bib) continue;
                        const bibStr = String(r.bib);
                        if (existingBibs.has(bibStr)) continue; // Already has timing at this CP
                        if (!bibsAtPrevCp.has(bibStr)) continue; // Never reached any previous CP
                        const st = (r.status || '').toLowerCase();
                        if (['dnf', 'dns', 'dq'].includes(st)) continue; // Stopped runners handled separately
                        const prevInfo = latestPrevScan.get(bibStr);
                        deduped.push({
                            _id: r._id,
                            bib: r.bib,
                            checkpoint: prevInfo?.checkpoint || null,
                            scanTime: null, // No scanTime at THIS checkpoint (they haven't arrived yet)
                            elapsedTime: null,
                            splitTime: null,
                            order: null,
                            netTime: null,
                            gunTime: null,
                            netPace: '',
                            gunPace: '',
                            splitPace: null,
                            firstName: r.firstName || '',
                            lastName: r.lastName || '',
                            firstNameTh: r.firstNameTh || '',
                            lastNameTh: r.lastNameTh || '',
                            gender: r.gender || '',
                            category: r.category || '',
                            status: r.status || 'in_progress',
                            overallRank: 0,
                            genderRank: 0,
                            categoryRank: 0,
                            ageGroup: r.ageGroup || '',
                            nationality: r.nationality || '',
                            team: r.team || '',
                            teamName: r.teamName || '',
                            statusCheckpoint: prevInfo?.checkpoint || '',
                            statusNote: '',
                        } as any);
                        applyRaceRanks(deduped[deduped.length - 1], bibStr);
                        existingBibs.add(bibStr); // Prevent duplicates
                    }
                }
            }
        }

        // Store in cache
        this.checkpointByCampaignCache.set(cacheKey, { data: deduped, expiry: Date.now() + TimingService.CACHE_TTL_MS });

        return deduped;
    }

    async getRecentArrivals(campaignId: string, withinSeconds: number): Promise<any[]> {
        const events = await this.eventsService.findByCampaign(campaignId);
        const eventIdSet = new Set<string>([campaignId]);
        if (events && events.length > 0) {
            events.forEach((e: any) => {
                const id = String(e._id || '');
                if (id) eventIdSet.add(id);
            });
        }
        const eventIds = Array.from(eventIdSet)
            .filter(id => Types.ObjectId.isValid(id))
            .map(id => new Types.ObjectId(id));
        const since = new Date(Date.now() - withinSeconds * 1000);
        return this.timingModel.aggregate([
            { $match: { eventId: { $in: eventIds }, scanTime: { $gte: since } } },
            { $sort: { scanTime: -1 } },
            {
                $lookup: {
                    from: 'runners',
                    localField: 'runnerId',
                    foreignField: '_id',
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    bib: 1,
                    checkpoint: 1,
                    scanTime: 1,
                    elapsedTime: 1,
                    firstName: { $ifNull: ['$runner.firstName', ''] },
                    lastName: { $ifNull: ['$runner.lastName', ''] },
                    firstNameTh: { $ifNull: ['$runner.firstNameTh', ''] },
                    lastNameTh: { $ifNull: ['$runner.lastNameTh', ''] },
                    category: { $ifNull: ['$runner.category', ''] },
                    gender: { $ifNull: ['$runner.gender', ''] },
                },
            },
        ]).exec();
    }

    async updateRecordScanTime(id: string, scanTime: string): Promise<TimingRecordDocument | null> {
        const existing = await this.timingModel.findById(id).exec();
        if (!existing) return null;

        const newScan = new Date(scanTime);
        if (isNaN(newScan.getTime())) {
            return existing.toObject() as TimingRecordDocument;
        }

        const runner = await this.runnersService.findOne(String(existing.runnerId)).catch(() => null);

        // Load all of this runner's records (ordered) for split + START propagation.
        const allRecords = await this.timingModel
            .find({ eventId: existing.eventId, runnerId: existing.runnerId })
            .sort({ order: 1 })
            .exec();

        const idx = allRecords.findIndex(r => String(r._id) === String(existing._id));
        const prev = idx > 0 ? allRecords[idx - 1] : null;
        const next = idx >= 0 && idx < allRecords.length - 1 ? allRecords[idx + 1] : null;

        const cpUp = (existing.checkpoint || '').toUpperCase();
        const isFinish = cpUp === 'FINISH';
        const isStart = cpUp === 'START';

        const startMs = isStart
            ? newScan.getTime()
            : (runner?.startTime ? new Date(runner.startTime).getTime() : null);

        // 1) Recompute this record's derived fields.
        const elapsedTime = startMs != null ? Math.max(0, newScan.getTime() - startMs) : 0;
        const splitTime = prev ? Math.max(0, newScan.getTime() - new Date(prev.scanTime).getTime()) : 0;

        // Editing a scanTime always makes the record staff-owned: the sync must stop
        // overwriting it, and the public table shows it in orange.
        const update: any = { scanTime: newScan, elapsedTime, splitTime, isManualTime: true, manualTimeAt: new Date() };
        if (isFinish || (existing.netTime && existing.netTime > 0)) update.netTime = elapsedTime;

        // GUN time is measured from the official start-gun, NOT from this runner's own
        // START crossing, so it must never be re-derived from the START anchor. Moving a
        // scan time simply shifts it by the same delta (and editing START leaves it alone,
        // since the START record carries no gun time of its own).
        const oldScanMs = new Date(existing.scanTime).getTime();
        const deltaMs = Number.isFinite(oldScanMs) ? newScan.getTime() - oldScanMs : 0;
        const existingGunMs = Number(existing.gunTime) || 0;
        if (existingGunMs > 0 && deltaMs !== 0) {
            update.gunTime = Math.max(0, existingGunMs + deltaMs);
        }
        const gunMsAfter = Number(update.gunTime) > 0 ? Number(update.gunTime) : existingGunMs;

        const dist = existing.distanceFromStart;
        if (dist && dist > 0 && elapsedTime > 0) {
            const pace = formatPaceMs(elapsedTime, dist);
            update.netPace = pace;
            if (gunMsAfter > 0) update.gunPace = formatPaceMs(gunMsAfter, dist);
        }
        if (existing.legDistance && existing.legDistance > 0 && splitTime > 0) {
            const segPace = formatPaceMs(splitTime, existing.legDistance);
            update.legTime = splitTime;
            update.legPace = segPace;
            update.splitPace = segPace;
        }

        await this.timingModel.findByIdAndUpdate(id, update).exec();

        // 2) Recompute next record's splitTime (depends on this scanTime).
        if (next) {
            const nextSplitMs = Math.max(0, new Date(next.scanTime).getTime() - newScan.getTime());
            const nextUpdate: any = { splitTime: nextSplitMs };
            if (next.legDistance && next.legDistance > 0 && nextSplitMs > 0) {
                const segPace = formatPaceMs(nextSplitMs, next.legDistance);
                nextUpdate.legTime = nextSplitMs;
                nextUpdate.legPace = segPace;
                nextUpdate.splitPace = segPace;
            }
            await this.timingModel.findByIdAndUpdate(next._id, nextUpdate).exec();
        }

        // 3) FINISH → sync runner aggregate.
        if (isFinish && runner) {
            await this.runnersService.update(String(existing.runnerId), {
                finishTime: newScan,
                netTime: elapsedTime,
                elapsedTime,
            });
            if (runner.category) {
                this.scheduleRankingUpdate(String(existing.eventId), runner.category);
            }
        }

        // 4) START → update runner.startTime and recompute every other record.
        if (isStart && runner) {
            await this.runnersService.update(String(existing.runnerId), { startTime: newScan });
            const newStartMs = newScan.getTime();
            for (const r of allRecords) {
                if (String(r._id) === String(existing._id)) continue;
                const rScanMs = new Date(r.scanTime).getTime();
                const newElapsed = Math.max(0, rScanMs - newStartMs);
                const rCpUp = (r.checkpoint || '').toUpperCase();
                // Only chip/net time follows the START anchor — gunTime stays as it was.
                const u: any = { elapsedTime: newElapsed };
                if (rCpUp === 'FINISH' || (r.netTime && r.netTime > 0)) u.netTime = newElapsed;
                if (r.distanceFromStart && r.distanceFromStart > 0 && newElapsed > 0) {
                    u.netPace = formatPaceMs(newElapsed, r.distanceFromStart);
                }
                await this.timingModel.findByIdAndUpdate(r._id, u).exec();
                if (rCpUp === 'FINISH') {
                    await this.runnersService.update(String(existing.runnerId), {
                        finishTime: r.scanTime,
                        netTime: newElapsed,
                        elapsedTime: newElapsed,
                    });
                    if (runner.category) {
                        this.scheduleRankingUpdate(String(existing.eventId), runner.category);
                    }
                }
            }
        }

        // 5) Sync derived aggregate fields (passedCount, netTime, gunTime, finishTime).
        await this.recomputeRunnerAggregates(
            String(existing.eventId),
            String(existing.runnerId),
        ).catch(() => { /* non-fatal */ });

        // 6) Broadcast updated runner state.
        try {
            const updatedRunner = await this.runnersService.findOne(String(existing.runnerId)).catch(() => null);
            if (updatedRunner) {
                this.timingGateway.broadcastRunnerUpdate(String(existing.eventId), updatedRunner);
            }
        } catch { /* non-fatal */ }

        return this.timingModel.findById(id).lean().exec() as Promise<TimingRecordDocument | null>;
    }

    async deleteRecord(id: string): Promise<void> {
        const existing = await this.timingModel.findById(id).lean().exec() as any;
        await this.timingModel.findByIdAndDelete(id).exec();
        if (existing?.eventId && existing?.runnerId) {
            await this.recomputeRunnerAggregates(
                String(existing.eventId),
                String(existing.runnerId),
            ).catch(() => { /* non-fatal */ });
        }
    }

    /**
     * Recompute Runner aggregate fields from current TimingRecords.
     * Must be called whenever a TimingRecord is created/edited/deleted, so the
     * cached values on the Runner doc (passedCount, latestCheckpoint, netTime,
     * gunTime, finishTime, status) stay in sync with the underlying records.
     */
    async recomputeRunnerAggregates(eventId: string, runnerId: string): Promise<void> {
        // Load by scanTime ascending so we can derive splitTime/elapsedTime from neighbors.
        // (The persisted `order` field can be stale after manual edits; trust scanTime instead.)
        const records = await this.timingModel
            .find({
                eventId: new Types.ObjectId(eventId),
                runnerId: new Types.ObjectId(runnerId),
            })
            .sort({ scanTime: 1, order: 1 })
            .lean()
            .exec() as any[];

        const uniqueCps = new Set<string>();
        const manualCps = new Set<string>();
        let latestRecord: any = null;
        let finishRecord: any = null;
        let startRecord: any = null;
        for (const r of records) {
            const cp = String(r.checkpoint || '').trim();
            const cpUp = cp.toUpperCase();
            if (cp) uniqueCps.add(cp.toLowerCase());
            if (cp && r.isManualTime === true) manualCps.add(cpUp);
            if (cpUp === 'START') startRecord = r;
            if (cpUp === 'FINISH') finishRecord = r;
            if (!latestRecord || new Date(r.scanTime).getTime() > new Date(latestRecord.scanTime).getTime()) {
                latestRecord = r;
            }
        }

        // Anchor for elapsedTime calculation. Prefer the START timing record's scanTime —
        // this is what makes admin-added checkpoints get a correct NET time even if
        // runner.startTime was never synced (e.g. START scan was inserted by sync but
        // the runner aggregate wasn't updated).
        const runner = await this.runnersService.findOne(runnerId).catch(() => null);
        const startMs = startRecord?.scanTime
            ? new Date(startRecord.scanTime).getTime()
            : (runner?.startTime ? new Date(runner.startTime).getTime() : null);

        // Recompute each record's derived fields when a START anchor is available.
        // This fixes records inserted via admin manual entry whose elapsedTime/netTime
        // came out as 0 because runner.startTime wasn't populated at insert time.
        if (startMs != null && records.length > 0) {
            const bulkOps: any[] = [];
            let prevScanMs: number | null = null;
            for (const r of records) {
                const scanMs = new Date(r.scanTime).getTime();
                if (!Number.isFinite(scanMs)) {
                    prevScanMs = scanMs;
                    continue;
                }
                const newElapsed = Math.max(0, scanMs - startMs);
                const splitTime = prevScanMs != null ? Math.max(0, scanMs - prevScanMs) : 0;
                const cpUp = String(r.checkpoint || '').toUpperCase();
                const isFinishRec = cpUp === 'FINISH';
                const recUpdate: any = { elapsedTime: newElapsed, splitTime };
                // FINISH always carries netTime. For other records, only refresh netTime
                // when it was already set (preserves intentional zero-net records).
                if (isFinishRec || (r.netTime && Number(r.netTime) > 0)) {
                    recUpdate.netTime = newElapsed;
                }
                // Recompute pace strings when distance is known. gunPace follows the
                // record's own (untouched) gunTime — the START anchor only drives net.
                const dist = Number(r.distanceFromStart) || 0;
                if (dist > 0 && newElapsed > 0) {
                    recUpdate.netPace = formatPaceMs(newElapsed, dist);
                    if (Number(r.gunTime) > 0) recUpdate.gunPace = formatPaceMs(Number(r.gunTime), dist);
                }
                const legDist = Number(r.legDistance) || 0;
                if (legDist > 0 && splitTime > 0) {
                    const segPace = formatPaceMs(splitTime, legDist);
                    recUpdate.legTime = splitTime;
                    recUpdate.legPace = segPace;
                    recUpdate.splitPace = segPace;
                }
                // Skip the write if nothing meaningfully changed (avoids touching
                // unchanged docs and keeps writes cheap).
                const stale =
                    Number(r.elapsedTime || 0) !== newElapsed
                    || Number(r.splitTime || 0) !== splitTime
                    || (recUpdate.netTime !== undefined && Number(r.netTime || 0) !== recUpdate.netTime);
                if (stale) {
                    bulkOps.push({
                        updateOne: {
                            filter: { _id: r._id },
                            update: { $set: recUpdate },
                        },
                    });
                }
                prevScanMs = scanMs;
            }
            if (bulkOps.length > 0) {
                await this.timingModel.bulkWrite(bulkOps, { ordered: false });
            }
        }

        // ── Cut-off, again ───────────────────────────────────────────────────────────
        // This runs after every scan and after every staff edit of a checkpoint time, and it
        // is what actually writes 'finished'. Two statuses it must not overwrite: one staff
        // set by hand, and a cut-off DNF that this data does not clear.
        const campaignCps = await this.getCutoffCheckpoints(eventId);
        const curStatus = String(runner?.status || '').toLowerCase();
        const stoppedByStaff = ['dnf', 'dns', 'dq'].includes(curStatus) && isAdminOwnedStatus(runner);
        const cutoffStopped = (runner as any)?.isManualStatus !== true
            && ['dnf', 'dns'].includes(curStatus)
            && (runner as any)?.statusChangedBy === 'cutoff-scheduler';
        // A runner cut at an earlier checkpoint only races again if their crossing THERE
        // turns out to have been in time.
        const cutCpName = String((runner as any)?.statusCheckpoint || '');
        const priorCutoff = cutCpName ? this.cutoffFor(campaignCps, cutCpName, runner?.category) : null;
        const cutRecord = cutCpName
            ? records.find(r => String(r.checkpoint || '').toUpperCase() === cutCpName.toUpperCase())
            : null;
        const priorCutStands = cutoffStopped && !!priorCutoff
            && !(cutRecord && new Date(cutRecord.scanTime).getTime() <= priorCutoff.getTime());

        const update: Record<string, unknown> = {
            passedCount: uniqueCps.size,
            // Which checkpoints carry a staff-typed time — drives the orange time
            // styling on /event without the page having to load timing records.
            manualCheckpoints: [...manualCps],
        };
        if (latestRecord) update.latestCheckpoint = latestRecord.checkpoint;
        if (startRecord?.scanTime) update.startTime = new Date(startRecord.scanTime);
        if (finishRecord) {
            const finishMs = new Date(finishRecord.scanTime).getTime();
            const anchorMs = startMs ?? (finishRecord.elapsedTime != null ? finishMs - Number(finishRecord.elapsedTime) : finishMs);
            const elapsed = Math.max(0, finishMs - anchorMs);
            update.finishTime = new Date(finishRecord.scanTime);
            update.netTime = elapsed > 0
                ? elapsed
                : (Number(finishRecord.netTime) > 0 ? Number(finishRecord.netTime) : 0);
            update.elapsedTime = elapsed;
            // When staff typed the START (or FINISH) time by hand, the net time we just derived
            // is the source of truth — but several public pages print `netTimeStr` (RaceTiger's
            // raw string) in preference to the number, so refresh it too or the old, wrong time
            // keeps showing after the fix.
            const anchorIsManual = startRecord?.isManualTime === true || finishRecord.isManualTime === true;
            if (anchorIsManual && Number(update.netTime) > 0) {
                update.netTimeStr = formatMsToHHMMSS(Number(update.netTime));
            }
            // GUN time comes from the official start-gun, so a hand-typed START (or any
            // other checkpoint edit) must NOT move it — only the chip/net time above.
            // The one thing that legitimately shifts it is moving the FINISH scan itself:
            // updateRecordScanTime() shifts the FINISH record's gunTime by the same delta,
            // so that edited value wins. Otherwise: RaceTiger's raw gun string → the FINISH
            // record's gun → the runner's stored gunTime → the net elapsed, which is only
            // right when nothing at all knows a gun time.
            // runner.gunTime comes last because it is only trustworthy once they have
            // finished: while a runner is out on course RaceTiger keeps it as a *running*
            // gun time (gun → last pass), so freezing that at the finish under-reports it.
            const finishGunMs = Number(finishRecord.gunTime) || 0;
            const finishGunIsEdited = finishRecord.isManualTime === true && finishGunMs > 0;
            const wasFinished = String(runner?.status || '').toLowerCase() === 'finished';
            // Staff typed the FINISH in themselves and RaceTiger never scored this runner,
            // so no gun time exists to copy. Recover the wall-clock of the start gun from
            // any checkpoint that DOES carry one (gunStart = scanTime − gunTime) and measure
            // the finish against it — otherwise gun would silently fall back to the net
            // time, and the sync won't correct it later (a manual FINISH stops gun writes).
            const gunStartMs = (() => {
                for (const r of records) {
                    const g = Number(r.gunTime) || 0;
                    const t = new Date(r.scanTime).getTime();
                    if (g > 0 && Number.isFinite(t)) return t - g;
                }
                const runningGun = Number(runner?.gunTime) || 0;
                const lastPass = runner?.lastPassTime ? new Date(runner.lastPassTime).getTime() : NaN;
                if (runningGun > 0 && Number.isFinite(lastPass)) return lastPass - runningGun;
                return NaN;
            })();
            const gunFromStartLine = Number.isFinite(gunStartMs)
                ? Math.max(0, finishMs - gunStartMs)
                : 0;
            const knownGunMs = finishGunIsEdited
                ? finishGunMs
                : (parseHHMMSSToMs(runner?.gunTimeStr)
                    || finishGunMs
                    || gunFromStartLine
                    || (wasFinished ? Number(runner?.gunTime) || 0 : 0));
            update.gunTime = knownGunMs > 0 ? knownGunMs : elapsed;
            if (finishGunIsEdited) {
                update.gunTimeStr = formatMsToHHMMSS(finishGunMs);
            }
            const finishCutoff = this.cutoffFor(campaignCps, finishRecord.checkpoint, runner?.category);
            const finishedLate = !!finishCutoff && finishMs > finishCutoff.getTime();
            if (stoppedByStaff || priorCutStands) {
                // Leave the status exactly as it is — the times above are still worth recording.
            } else if (finishedLate) {
                update.status = 'dnf';
                update.statusCheckpoint = finishRecord.checkpoint;
                update.statusChangedAt = new Date();
                update.statusChangedBy = 'cutoff-scheduler';
                update.statusNote = `Auto DNF: missed the ${finishRecord.checkpoint} cut-off (${formatCutoffForNote(finishCutoff!)})`;
            } else {
                update.status = 'finished';
                // A cut-off DNF this data has just cleared must not leave its note behind:
                // that is what produced rows reading "FINISH · Auto DNF: missed the FINISH
                // cut-off" — a finisher carrying the reason they were once pulled.
                if (!isAdminOwnedStatus(runner) && /^auto\s+(dnf|dns|dq)\s*:/i.test(String((runner as any)?.statusNote || ''))) {
                    update.statusCheckpoint = '';
                    update.statusNote = '';
                    update.statusChangedAt = new Date();
                    update.statusChangedBy = 'cutoff-scheduler';
                }
            }
        } else if (startRecord?.isManualTime === true && startMs != null && latestRecord) {
            // Still out on course. With no FINISH to anchor on, the running chip time is
            // "latest checkpoint − the START staff typed in". RaceTiger's own NetTime is
            // exactly the wrong number for these runners (it counts from their first chip
            // read, which is the read that was missing at the start line), and the sync
            // stops sending net once a manual START exists — so without this the typed
            // START saved fine but the Chip Time box snapped back to the old value.
            // gunTime is deliberately untouched: it is measured from the start gun.
            const latestMs = new Date(latestRecord.scanTime).getTime();
            const elapsed = Number.isFinite(latestMs) ? Math.max(0, latestMs - startMs) : 0;
            if (elapsed > 0) {
                update.netTime = elapsed;
                update.elapsedTime = elapsed;
                update.netTimeStr = formatMsToHHMMSS(elapsed);
            }
        }

        await this.runnersService.setAggregates(runnerId, update);
    }
}

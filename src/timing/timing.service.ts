import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimingRecord, TimingRecordDocument } from './timing-record.schema';
import { RunnersService } from '../runners/runners.service';
import { TimingGateway } from './timing.gateway';
import { EventsService } from '../events/events.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';

export interface ScanData {
    eventId: string;
    bib?: string;
    rfidTag?: string;
    checkpoint: string;
    scanTime: Date;
    note?: string;
}

function normalizeCheckpointRunnerValue(value?: string): string {
    return (value || '').trim().toLowerCase();
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

@Injectable()
export class TimingService {
    constructor(
        @InjectModel(TimingRecord.name) private timingModel: Model<TimingRecordDocument>,
        private runnersService: RunnersService,
        private timingGateway: TimingGateway,
        private eventsService: EventsService,
        private checkpointsService: CheckpointsService,
    ) { }

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

        // Create timing record
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
        });

        await record.save();

        // Update runner status and timing
        const isStart = scanData.checkpoint.toUpperCase() === 'START';
        const isFinish = scanData.checkpoint.toUpperCase() === 'FINISH';

        const updateData: any = {
            latestCheckpoint: scanData.checkpoint,
            elapsedTime,
        };

        if (isStart) {
            updateData.startTime = scanData.scanTime;
            updateData.status = 'in_progress';
        } else if (isFinish) {
            updateData.finishTime = scanData.scanTime;
            updateData.netTime = elapsedTime;
            updateData.status = 'finished';
        } else if (runner.status === 'not_started') {
            updateData.status = 'in_progress';
        }

        await this.runnersService.update(runner._id.toString(), updateData);

        // Update rankings if finished
        if (isFinish) {
            await this.runnersService.updateRankings(scanData.eventId, runner.category);
        }

        // Broadcast update via WebSocket
        const updatedRunner = await this.runnersService.findOne(runner._id.toString());
        this.timingGateway.broadcastRunnerUpdate(scanData.eventId, updatedRunner);

        return record;
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

    async getEventRecords(eventId: string): Promise<TimingRecordDocument[]> {
        return this.timingModel
            .find({ eventId: new Types.ObjectId(eventId) })
            .sort({ scanTime: -1 })
            .limit(100)
            .lean()
            .exec() as Promise<TimingRecordDocument[]>;
    }

    async getLatestPerRunner(eventIds: string[]): Promise<any[]> {
        const objectIds = eventIds.map(id => new Types.ObjectId(id));
        // Group by bib+eventId (not runnerId) so we survive clean-slate re-imports
        // that delete & recreate Runner docs with new ObjectIds.
        return this.timingModel.aggregate([
            { $match: { eventId: { $in: objectIds } } },
            { $sort: { scanTime: -1 } },
            {
                $group: {
                    _id: { bib: '$bib', eventId: '$eventId' },
                    runnerId: { $first: '$runnerId' },
                    checkpoint: { $first: '$checkpoint' },
                    scanTime: { $first: '$scanTime' },
                    netTime: { $first: '$netTime' },
                    gunTime: { $first: '$gunTime' },
                    splitTime: { $first: '$splitTime' },
                    distanceFromStart: { $first: '$distanceFromStart' },
                    order: { $first: '$order' },
                    uniqueCheckpoints: { $addToSet: '$checkpoint' },
                    splitNo: { $first: '$splitNo' },
                    splitDesc: { $first: '$splitDesc' },
                    netPace: { $first: '$netPace' },
                    gunPace: { $first: '$gunPace' },
                    splitPace: { $first: '$splitPace' },
                    gunTimeMs: { $first: '$gunTimeMs' },
                    netTimeMs: { $first: '$netTimeMs' },
                    totalGunTime: { $first: '$totalGunTime' },
                    totalNetTime: { $first: '$totalNetTime' },
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
                    scanTime: 1,
                    netTime: 1,
                    gunTime: 1,
                    splitTime: 1,
                    distanceFromStart: 1,
                    order: 1,
                    overallRank: '$runner.overallRank',
                    genderRank: '$runner.genderRank',
                    categoryRank: '$runner.categoryRank',
                    netTimeStr: '$runner.netTimeStr',
                    gunTimeStr: '$runner.gunTimeStr',
                    gunPace: { $ifNull: ['$runner.gunPace', '$gunPace'] },
                    netPace: { $ifNull: ['$runner.netPace', '$netPace'] },
                    statusCheckpoint: '$runner.statusCheckpoint',
                    statusNote: '$runner.statusNote',
                    chipCode: { $ifNull: ['$runner.chipCode', '$chipCode'] },
                    printingCode: { $ifNull: ['$runner.printingCode', '$printingCode'] },
                    totalFinishers: '$runner.totalFinishers',
                    genderFinishers: '$runner.genderFinishers',
                    splitNo: 1,
                    splitDesc: 1,
                    splitPace: 1,
                    gunTimeMs: 1,
                    netTimeMs: 1,
                    totalGunTime: 1,
                    totalNetTime: 1,
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
            { $sort: { scanTime: 1 } },
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
            { $sort: { scanTime: 1 } },
            // Pipeline-based lookup: try runnerId first, fall back to bib+eventId match
            {
                $lookup: {
                    from: 'runners',
                    let: { rid: '$runnerId', bibVal: '$bib' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $eq: ['$_id', '$$rid'] },
                                        {
                                            $and: [
                                                { $eq: ['$bib', '$$bibVal'] },
                                                { $in: ['$eventId', eventIds] },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                        { $limit: 1 },
                    ],
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
        const allRunners = await this.runnersService.findByEventIds(eventIdStrings, {});
        if (allRunners && allRunners.length > 0) {
            const runnerByBib = new Map<string, any>();
            const dnfDqBibs: string[] = [];
            for (const runner of allRunners) {
                const r = runner as any;
                if (r.bib) {
                    runnerByBib.set(String(r.bib), r);
                    const st = (r.status || '').toLowerCase();
                    if (['dnf', 'dq'].includes(st)) dnfDqBibs.push(String(r.bib));
                }
            }

            // For DNF/DQ runners without statusCheckpoint, find their last checkpoint via timing records
            // so we know where to show them as DNF vs passed
            const dnfLastCpMap = new Map<string, number>(); // bib → highest orderNum with timing
            if (dnfDqBibs.length > 0 && cpOrderMap.size > 0) {
                const dnfTimingRecords = await this.timingModel.find({
                    eventId: { $in: eventIds },
                    bib: { $in: dnfDqBibs },
                }).select('bib checkpoint').lean().exec();
                for (const tr of dnfTimingRecords) {
                    const bib = String((tr as any).bib);
                    const cpName = ((tr as any).checkpoint || '').toUpperCase();
                    const cpOrder = cpOrderMap.get(cpName) ?? -1;
                    const prev = dnfLastCpMap.get(bib) ?? -1;
                    if (cpOrder > prev) dnfLastCpMap.set(bib, cpOrder);
                }
            }

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
                                // RaceTiger import: show DNF at their LAST timed CP, passed at earlier CPs
                                const lastOrder = dnfLastCpMap.get(String(rec.bib)) ?? -1;
                                if (lastOrder === currentCpOrder || currentCpOrder < 0) {
                                    rec.status = dbRunner.status; // DNF at their last CP
                                } else {
                                    rec.status = 'finished'; // passed through here earlier
                                }
                            }
                        } else {
                            rec.status = dbRunner.status || 'not_started';
                        }

                        // Fill in missing runner data if $lookup failed
                        if (!rec.firstName && dbRunner.firstName) rec.firstName = dbRunner.firstName;
                        if (!rec.lastName && dbRunner.lastName) rec.lastName = dbRunner.lastName;
                        if (!rec.gender && dbRunner.gender) rec.gender = dbRunner.gender;
                        if (!rec.category && dbRunner.category) rec.category = dbRunner.category;
                        if ((!rec.overallRank || rec.overallRank === 0) && dbRunner.overallRank) rec.overallRank = dbRunner.overallRank;
                        if ((!rec.genderRank || rec.genderRank === 0) && dbRunner.genderRank) rec.genderRank = dbRunner.genderRank;
                        if ((!rec.categoryRank || rec.categoryRank === 0) && dbRunner.categoryRank) rec.categoryRank = dbRunner.categoryRank;
                        rec.statusCheckpoint = dbRunner.statusCheckpoint || '';
                        rec.statusNote = dbRunner.statusNote || '';
                    }
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
                    // Only add if admin explicitly set statusCheckpoint to THIS checkpoint
                    const sCp = (r.statusCheckpoint || '').toUpperCase();
                    if (!sCp) continue; // No statusCheckpoint → they have no timing here → skip
                    const stoppedOrder = cpOrderMap.get(sCp) ?? -1;
                    if (stoppedOrder !== currentCpOrder) continue; // Different CP → skip
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
                    const prevCpTimingRecords = await this.timingModel.find({
                        eventId: { $in: eventIds },
                        checkpoint: { $in: prevCpNames.map(n => new RegExp(`^${n}$`, 'i')) },
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
                        existingBibs.add(bibStr); // Prevent duplicates
                    }
                }
            }
        }

        // ── Compute per-checkpoint arrival rankings from scanTime order ──
        // This provides live rankings even before score sync populates finish rankings.
        const runnersWithTime = deduped.filter(r => r.scanTime);
        runnersWithTime.sort((a, b) => new Date(a.scanTime).getTime() - new Date(b.scanTime).getTime());
        // Overall rank (arrival order)
        runnersWithTime.forEach((r, i) => { r.overallRank = i + 1; });
        // Gender rank
        for (const gender of ['M', 'F']) {
            const genderRunners = runnersWithTime.filter(r => r.gender === gender);
            genderRunners.forEach((r, i) => { r.genderRank = i + 1; });
        }
        // Category rank
        const categories = [...new Set(runnersWithTime.map(r => r.category).filter(Boolean))];
        for (const cat of categories) {
            const catRunners = runnersWithTime.filter(r => r.category === cat);
            catRunners.forEach((r, i) => { r.categoryRank = i + 1; });
        }

        return deduped;
    }

    async deleteRecord(id: string): Promise<void> {
        await this.timingModel.findByIdAndDelete(id).exec();
    }
}

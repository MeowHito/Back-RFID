import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimingRecord, TimingRecordDocument } from './timing-record.schema';
import { RunnersService } from '../runners/runners.service';
import { TimingGateway } from './timing.gateway';
import { EventsService } from '../events/events.service';

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
        return this.timingModel.aggregate([
            { $match: { eventId: { $in: objectIds } } },
            { $sort: { scanTime: -1 } },
            {
                $group: {
                    _id: '$runnerId',
                    eventId: { $first: '$eventId' },
                    bib: { $first: '$bib' },
                    checkpoint: { $first: '$checkpoint' },
                    scanTime: { $first: '$scanTime' },
                    netTime: { $first: '$netTime' },
                    gunTime: { $first: '$gunTime' },
                    splitTime: { $first: '$splitTime' },
                    distanceFromStart: { $first: '$distanceFromStart' },
                    order: { $first: '$order' },
                    totalPasses: { $sum: 1 },
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
            {
                $lookup: {
                    from: 'runners',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: '$runner._id',
                    eventId: 1,
                    bib: 1,
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
                    passedCount: '$totalPasses',
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
        if (!events || events.length === 0) return [];
        const eventIds = events.map(e => new Types.ObjectId(String(e._id)));
        const records = await this.timingModel.aggregate([
            { $match: { eventId: { $in: eventIds }, checkpoint } },
            { $sort: { scanTime: 1 } },
            {
                $group: {
                    _id: '$runnerId',
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
                },
            },
            { $sort: { scanTime: 1 } },
            {
                $lookup: {
                    from: 'runners',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'runner',
                },
            },
            { $unwind: { path: '$runner', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
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
                    firstName: '$runner.firstName',
                    lastName: '$runner.lastName',
                    gender: '$runner.gender',
                    category: '$runner.category',
                    status: '$runner.status',
                    overallRank: '$runner.overallRank',
                    genderRank: '$runner.genderRank',
                    categoryRank: '$runner.categoryRank',
                    statusCheckpoint: '$runner.statusCheckpoint',
                    statusNote: '$runner.statusNote',
                },
            },
        ]).exec();

        return dedupeCheckpointRunnerRecords(records);
    }

    async deleteRecord(id: string): Promise<void> {
        await this.timingModel.findByIdAndDelete(id).exec();
    }
}

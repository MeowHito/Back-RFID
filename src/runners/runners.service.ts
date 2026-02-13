import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Runner, RunnerDocument } from './runner.schema';
import { CreateRunnerDto } from './dto/create-runner.dto';

export interface RunnerFilter {
    eventId: string;
    category?: string;
    gender?: string;
    ageGroup?: string;
    box?: string;
    status?: string;
    search?: string;
    checkpoint?: string;
    chipStatus?: string;
    runnerStatus?: string; // 'no_bib','dup_bib','no_chip','dup_chip','ready' (comma-separated)
}

export interface PagingData {
    page: number;
    limit: number;
    search?: string;
}

@Injectable()
export class RunnersService {
    constructor(
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
    ) { }

    // Get all runners without filter (for debugging/checking data)
    async findAll(limit: number = 100): Promise<RunnerDocument[]> {
        return this.runnerModel.find().limit(limit).sort({ createdAt: -1 }).exec();
    }

    async create(createRunnerDto: CreateRunnerDto): Promise<RunnerDocument> {
        const runner = new this.runnerModel({
            ...createRunnerDto,
            eventId: new Types.ObjectId(createRunnerDto.eventId),
        });
        return runner.save();
    }

    async createMany(runners: CreateRunnerDto[], updateExisting = false): Promise<{ inserted: number; updated: number; errors: string[] }> {
        const result = { inserted: 0, updated: 0, errors: [] as string[] };
        if (!runners || runners.length === 0) return result;

        if (updateExisting) {
            // Use bulkWrite with upsert — update existing runners or insert new ones
            const bulkOps = runners.map(r => ({
                updateOne: {
                    filter: { eventId: new Types.ObjectId(r.eventId), bib: r.bib },
                    update: {
                        $set: {
                            ...r,
                            eventId: new Types.ObjectId(r.eventId),
                        },
                    },
                    upsert: true,
                },
            }));
            const bulkResult = await this.runnerModel.bulkWrite(bulkOps as any, { ordered: false });
            result.inserted = bulkResult.upsertedCount || 0;
            result.updated = bulkResult.modifiedCount || 0;
        } else {
            // Insert only, skip duplicates (ordered: false continues past errors)
            try {
                const docs = runners.map(r => ({
                    ...r,
                    eventId: new Types.ObjectId(r.eventId),
                }));
                const inserted = await this.runnerModel.insertMany(docs, { ordered: false });
                result.inserted = inserted.length;
            } catch (err: any) {
                // MongoDB duplicate key errors (code 11000) — partial success
                if (err.code === 11000 || err.writeErrors) {
                    const successCount = err.insertedDocs?.length ?? err.result?.nInserted ?? 0;
                    result.inserted = successCount;
                    const dupCount = runners.length - successCount;
                    if (dupCount > 0) {
                        result.errors.push(`${dupCount} BIB ซ้ำ (duplicate) — ข้ามไป`);
                    }
                } else {
                    throw err;
                }
            }
        }
        return result;
    }

    /** Count runners by event (fast, uses index) – use this instead of findByEvent().length */
    async countByEvent(eventId: string): Promise<number> {
        return this.runnerModel.countDocuments({
            eventId: new Types.ObjectId(eventId),
        }).exec();
    }

    /** List runners by event – capped at 2000 to avoid slow responses. Use findByEventWithPaging for large lists. */
    async findByEvent(filter: RunnerFilter, limitCap: number = 2000): Promise<RunnerDocument[]> {
        const query: any = { eventId: new Types.ObjectId(filter.eventId) };

        if (filter.category) query.category = filter.category;
        if (filter.gender) query.gender = filter.gender;
        if (filter.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter.box) query.box = filter.box;
        if (filter.status) query.status = filter.status;
        if (filter.checkpoint) query.latestCheckpoint = filter.checkpoint;

        if (filter.search) {
            query.$or = [
                { bib: { $regex: filter.search, $options: 'i' } },
                { firstName: { $regex: filter.search, $options: 'i' } },
                { lastName: { $regex: filter.search, $options: 'i' } },
                { firstNameTh: { $regex: filter.search, $options: 'i' } },
                { lastNameTh: { $regex: filter.search, $options: 'i' } },
            ];
        }

        return this.runnerModel
            .find(query)
            .sort({ overallRank: 1, bib: 1 })
            .limit(limitCap)
            .lean()
            .exec() as Promise<RunnerDocument[]>;
    }

    async findByEventWithPaging(filter: RunnerFilter, paging?: PagingData): Promise<{ data: RunnerDocument[]; total: number; dupBibs?: string[]; dupChips?: string[] }> {
        const eventOid = new Types.ObjectId(filter.eventId);
        const baseMatch: any = { eventId: eventOid };
        if (filter.category) baseMatch.category = filter.category;

        // Pre-compute duplicate BIBs and ChipCodes for this event+category
        const statuses = filter.runnerStatus ? filter.runnerStatus.split(',').map(s => s.trim()) : [];
        const needDups = statuses.length > 0 || true; // always compute for status badges

        let dupBibs: string[] = [];
        let dupChips: string[] = [];

        if (needDups) {
            const [bibDups, chipDups] = await Promise.all([
                this.runnerModel.aggregate([
                    { $match: { ...baseMatch, bib: { $exists: true, $nin: ['', null] } } },
                    { $group: { _id: '$bib', count: { $sum: 1 } } },
                    { $match: { count: { $gt: 1 } } },
                ]).exec(),
                this.runnerModel.aggregate([
                    { $match: { ...baseMatch, chipCode: { $exists: true, $nin: ['', null] } } },
                    { $group: { _id: '$chipCode', count: { $sum: 1 } } },
                    { $match: { count: { $gt: 1 } } },
                ]).exec(),
            ]);
            dupBibs = bibDups.map(d => d._id);
            dupChips = chipDups.map(d => d._id);
        }

        // Build main query
        const query: any = { ...baseMatch };
        if (filter.gender) query.gender = filter.gender;
        if (filter.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter.status) query.status = filter.status;
        if (filter.chipStatus === 'has') {
            query.chipCode = { $exists: true, $nin: ['', null] };
        } else if (filter.chipStatus === 'missing') {
            if (!query.$and) query.$and = [];
            query.$and.push({ $or: [{ chipCode: { $exists: false } }, { chipCode: '' }, { chipCode: null }] });
        }

        if (paging?.search || filter.search) {
            const searchTerm = paging?.search || filter.search;
            const searchOr = [
                { bib: { $regex: searchTerm, $options: 'i' } },
                { firstName: { $regex: searchTerm, $options: 'i' } },
                { lastName: { $regex: searchTerm, $options: 'i' } },
            ];
            if (!query.$and) query.$and = [];
            query.$and.push({ $or: searchOr });
        }

        // Apply runnerStatus filters
        if (statuses.length > 0) {
            const statusConditions: any[] = [];
            for (const s of statuses) {
                if (s === 'no_bib') statusConditions.push({ $or: [{ bib: { $exists: false } }, { bib: '' }, { bib: null }] });
                if (s === 'dup_bib' && dupBibs.length > 0) statusConditions.push({ bib: { $in: dupBibs } });
                if (s === 'dup_bib' && dupBibs.length === 0) statusConditions.push({ _id: null }); // no results
                if (s === 'no_chip') statusConditions.push({ $or: [{ chipCode: { $exists: false } }, { chipCode: '' }, { chipCode: null }] });
                if (s === 'dup_chip' && dupChips.length > 0) statusConditions.push({ chipCode: { $in: dupChips } });
                if (s === 'dup_chip' && dupChips.length === 0) statusConditions.push({ _id: null }); // no results
                if (s === 'ready') {
                    // Has BIB, has ChipCode, not duplicate BIB, not duplicate ChipCode
                    const readyCond: any = {
                        bib: { $exists: true, $nin: ['', null, ...dupBibs] },
                        chipCode: { $exists: true, $nin: ['', null, ...dupChips] },
                    };
                    statusConditions.push(readyCond);
                }
            }
            if (statusConditions.length > 0) {
                if (!query.$and) query.$and = [];
                query.$and.push(statusConditions.length === 1 ? statusConditions[0] : { $or: statusConditions });
            }
        }

        const page = paging?.page || 1;
        const limit = paging?.limit || 50;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.runnerModel.find(query).sort({ overallRank: 1, bib: 1 }).skip(skip).limit(limit).lean().exec(),
            this.runnerModel.countDocuments(query).exec(),
        ]);

        return { data: data as RunnerDocument[], total, dupBibs, dupChips };
    }

    async findOne(id: string): Promise<RunnerDocument> {
        const runner = await this.runnerModel.findById(id).exec();
        if (!runner) throw new NotFoundException('Runner not found');
        return runner;
    }

    async findByBib(eventId: string, bib: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            bib,
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async findByRfid(eventId: string, rfidTag: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            $or: [{ rfidTag }, { chipCode: rfidTag }],
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async findByChipCode(eventId: string, chipCode: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            chipCode,
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async update(id: string, updateData: any): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    }

    async updateStatus(id: string, status: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    }

    async updateTiming(
        id: string,
        data: {
            latestCheckpoint?: string;
            netTime?: number;
            elapsedTime?: number;
            finishTime?: Date;
            status?: string;
        }
    ): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }

    async updateRankings(eventId: string, category: string): Promise<void> {
        // Fetch all finished runners (lean for speed)
        const runners = await this.runnerModel
            .find({
                eventId: new Types.ObjectId(eventId),
                category,
                status: 'finished',
            })
            .sort({ netTime: 1 })
            .lean()
            .exec();

        if (runners.length === 0) return;

        // Build a map: runnerId -> { overallRank, genderRank, ageGroupRank }
        const rankMap = new Map<string, { overallRank: number; genderRank: number; ageGroupRank: number }>();

        // Overall ranking
        for (let i = 0; i < runners.length; i++) {
            rankMap.set(runners[i]._id.toString(), { overallRank: i + 1, genderRank: 0, ageGroupRank: 0 });
        }

        // Gender rankings
        for (const gender of ['M', 'F']) {
            const genderRunners = runners.filter(r => r.gender === gender);
            for (let i = 0; i < genderRunners.length; i++) {
                const entry = rankMap.get(genderRunners[i]._id.toString())!;
                entry.genderRank = i + 1;
            }
        }

        // Age group rankings
        const ageGroups = [...new Set(runners.map(r => r.ageGroup))];
        for (const ageGroup of ageGroups) {
            const ageGroupRunners = runners.filter(r => r.ageGroup === ageGroup);
            for (let i = 0; i < ageGroupRunners.length; i++) {
                const entry = rankMap.get(ageGroupRunners[i]._id.toString())!;
                entry.ageGroupRank = i + 1;
            }
        }

        // Single bulkWrite instead of N individual updates
        const bulkOps = Array.from(rankMap.entries()).map(([id, ranks]) => ({
            updateOne: {
                filter: { _id: new Types.ObjectId(id) },
                update: { $set: ranks },
            },
        }));

        await this.runnerModel.bulkWrite(bulkOps, { ordered: false });
    }

    // Statistics methods from reference
    async getAllStatusByEvent(eventId: string): Promise<Array<{ status: string; count: number }>> {
        const result = await this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]).exec();
        return result.map(r => ({ status: r._id, count: r.count }));
    }

    async getStartersByAge(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: { $in: ['in_progress', 'finished'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getWithdrawalByAge(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: { $in: ['dnf', 'dns'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getWithdrawalByCheckpoint(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: 'dnf' } },
            { $group: { _id: '$latestCheckpoint', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getFinishByTime(eventId: string): Promise<any[]> {
        // Use aggregation instead of loading all runners into memory
        return this.runnerModel.aggregate([
            {
                $match: {
                    eventId: new Types.ObjectId(eventId),
                    status: 'finished',
                    netTime: { $exists: true, $gt: 0 },
                },
            },
            {
                $project: {
                    hourBucket: { $floor: { $divide: ['$netTime', 3600000] } },
                },
            },
            {
                $group: {
                    _id: '$hourBucket',
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    timeRange: {
                        $concat: [
                            { $toString: '$_id' }, 'h-',
                            { $toString: { $add: ['$_id', 1] } }, 'h',
                        ],
                    },
                    count: 1,
                },
            },
        ]).exec();
    }

    async getParticipantWithStationByEvent(eventId: string): Promise<RunnerDocument[]> {
        return this.runnerModel.find({
            eventId: new Types.ObjectId(eventId),
            latestCheckpoint: { $exists: true, $ne: null },
        }).sort({ latestCheckpoint: 1, elapsedTime: 1 }).limit(2000).lean().exec() as Promise<RunnerDocument[]>;
    }

    async getLatestParticipantByCheckpoint(
        eventId: string,
        checkpoint: string,
        gender?: string,
        ageGroup?: string,
    ): Promise<RunnerDocument[]> {
        const query: any = {
            eventId: new Types.ObjectId(eventId),
            latestCheckpoint: checkpoint,
        };
        if (gender) query.gender = gender;
        if (ageGroup) query.ageGroup = ageGroup;

        return this.runnerModel.find(query).sort({ elapsedTime: -1 }).limit(50).lean().exec() as Promise<RunnerDocument[]>;
    }

    async delete(id: string): Promise<void> {
        await this.runnerModel.findByIdAndDelete(id).exec();
    }

    async deleteByEvent(eventId: string): Promise<void> {
        await this.runnerModel.deleteMany({ eventId: new Types.ObjectId(eventId) }).exec();
    }

    async deleteAllParticipants(eventId: string): Promise<void> {
        await this.deleteByEvent(eventId);
    }
}

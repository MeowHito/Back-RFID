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

    async createMany(runners: CreateRunnerDto[]): Promise<any[]> {
        const docs = runners.map(r => ({
            ...r,
            eventId: new Types.ObjectId(r.eventId),
        }));
        return this.runnerModel.insertMany(docs);
    }

    async findByEvent(filter: RunnerFilter): Promise<RunnerDocument[]> {
        // Query both ObjectId and string formats for eventId (for backward compatibility)
        const query: any = {
            $or: [
                { eventId: new Types.ObjectId(filter.eventId) },
                { eventId: filter.eventId }
            ]
        };

        if (filter.category) query.category = filter.category;
        if (filter.gender) query.gender = filter.gender;
        if (filter.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter.box) query.box = filter.box;
        if (filter.status) query.status = filter.status;
        if (filter.checkpoint) query.latestCheckpoint = filter.checkpoint;

        if (filter.search) {
            query.$and = [{
                $or: [
                    { bib: { $regex: filter.search, $options: 'i' } },
                    { firstName: { $regex: filter.search, $options: 'i' } },
                    { lastName: { $regex: filter.search, $options: 'i' } },
                    { firstNameTh: { $regex: filter.search, $options: 'i' } },
                    { lastNameTh: { $regex: filter.search, $options: 'i' } },
                ]
            }];
        }

        return this.runnerModel.find(query).sort({ overallRank: 1, bib: 1 }).exec();
    }

    async findByEventWithPaging(filter: RunnerFilter, paging?: PagingData): Promise<{ data: RunnerDocument[]; total: number }> {
        const query: any = { eventId: new Types.ObjectId(filter.eventId) };

        if (filter.category) query.category = filter.category;
        if (filter.gender) query.gender = filter.gender;
        if (filter.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter.status) query.status = filter.status;

        if (paging?.search || filter.search) {
            const searchTerm = paging?.search || filter.search;
            query.$or = [
                { bib: { $regex: searchTerm, $options: 'i' } },
                { firstName: { $regex: searchTerm, $options: 'i' } },
                { lastName: { $regex: searchTerm, $options: 'i' } },
            ];
        }

        const page = paging?.page || 1;
        const limit = paging?.limit || 50;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.runnerModel.find(query).sort({ overallRank: 1, bib: 1 }).skip(skip).limit(limit).exec(),
            this.runnerModel.countDocuments(query).exec(),
        ]);

        return { data, total };
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
        }).exec();
    }

    async findByRfid(eventId: string, rfidTag: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            $or: [{ rfidTag }, { chipCode: rfidTag }],
        }).exec();
    }

    async findByChipCode(eventId: string, chipCode: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            chipCode,
        }).exec();
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
        // Update overall ranking
        const runners = await this.runnerModel
            .find({
                eventId: new Types.ObjectId(eventId),
                category,
                status: 'finished',
            })
            .sort({ netTime: 1 })
            .exec();

        for (let i = 0; i < runners.length; i++) {
            await this.runnerModel.findByIdAndUpdate(runners[i]._id, {
                overallRank: i + 1,
            });
        }

        // Update gender rankings
        for (const gender of ['M', 'F']) {
            const genderRunners = runners.filter(r => r.gender === gender);
            for (let i = 0; i < genderRunners.length; i++) {
                await this.runnerModel.findByIdAndUpdate(genderRunners[i]._id, {
                    genderRank: i + 1,
                });
            }
        }

        // Update age group rankings
        const ageGroups = [...new Set(runners.map(r => r.ageGroup))];
        for (const ageGroup of ageGroups) {
            const ageGroupRunners = runners.filter(r => r.ageGroup === ageGroup);
            for (let i = 0; i < ageGroupRunners.length; i++) {
                await this.runnerModel.findByIdAndUpdate(ageGroupRunners[i]._id, {
                    ageGroupRank: i + 1,
                });
            }
        }
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
        const runners = await this.runnerModel.find({
            eventId: new Types.ObjectId(eventId),
            status: 'finished',
            netTime: { $exists: true },
        }).exec();

        // Group by hour intervals
        const timeGroups: Record<string, number> = {};
        runners.forEach(runner => {
            if (runner.netTime) {
                const hours = Math.floor(runner.netTime / 3600000);
                const key = `${hours}h-${hours + 1}h`;
                timeGroups[key] = (timeGroups[key] || 0) + 1;
            }
        });

        return Object.entries(timeGroups).map(([timeRange, count]) => ({ timeRange, count }));
    }

    async getParticipantWithStationByEvent(eventId: string): Promise<RunnerDocument[]> {
        return this.runnerModel.find({
            eventId: new Types.ObjectId(eventId),
            latestCheckpoint: { $exists: true, $ne: null },
        }).sort({ latestCheckpoint: 1, elapsedTime: 1 }).exec();
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

        return this.runnerModel.find(query).sort({ elapsedTime: -1 }).limit(50).exec();
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

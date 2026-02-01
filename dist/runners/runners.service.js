"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunnersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const runner_schema_1 = require("./runner.schema");
let RunnersService = class RunnersService {
    runnerModel;
    constructor(runnerModel) {
        this.runnerModel = runnerModel;
    }
    async create(createRunnerDto) {
        const runner = new this.runnerModel({
            ...createRunnerDto,
            eventId: new mongoose_2.Types.ObjectId(createRunnerDto.eventId),
        });
        return runner.save();
    }
    async createMany(runners) {
        const docs = runners.map(r => ({
            ...r,
            eventId: new mongoose_2.Types.ObjectId(r.eventId),
        }));
        return this.runnerModel.insertMany(docs);
    }
    async findByEvent(filter) {
        const query = { eventId: new mongoose_2.Types.ObjectId(filter.eventId) };
        if (filter.category)
            query.category = filter.category;
        if (filter.gender)
            query.gender = filter.gender;
        if (filter.ageGroup)
            query.ageGroup = filter.ageGroup;
        if (filter.box)
            query.box = filter.box;
        if (filter.status)
            query.status = filter.status;
        if (filter.checkpoint)
            query.latestCheckpoint = filter.checkpoint;
        if (filter.search) {
            query.$or = [
                { bib: { $regex: filter.search, $options: 'i' } },
                { firstName: { $regex: filter.search, $options: 'i' } },
                { lastName: { $regex: filter.search, $options: 'i' } },
                { firstNameTh: { $regex: filter.search, $options: 'i' } },
                { lastNameTh: { $regex: filter.search, $options: 'i' } },
            ];
        }
        return this.runnerModel.find(query).sort({ overallRank: 1, bib: 1 }).exec();
    }
    async findByEventWithPaging(filter, paging) {
        const query = { eventId: new mongoose_2.Types.ObjectId(filter.eventId) };
        if (filter.category)
            query.category = filter.category;
        if (filter.gender)
            query.gender = filter.gender;
        if (filter.ageGroup)
            query.ageGroup = filter.ageGroup;
        if (filter.status)
            query.status = filter.status;
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
    async findOne(id) {
        const runner = await this.runnerModel.findById(id).exec();
        if (!runner)
            throw new common_1.NotFoundException('Runner not found');
        return runner;
    }
    async findByBib(eventId, bib) {
        return this.runnerModel.findOne({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            bib,
        }).exec();
    }
    async findByRfid(eventId, rfidTag) {
        return this.runnerModel.findOne({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            $or: [{ rfidTag }, { chipCode: rfidTag }],
        }).exec();
    }
    async findByChipCode(eventId, chipCode) {
        return this.runnerModel.findOne({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            chipCode,
        }).exec();
    }
    async update(id, updateData) {
        return this.runnerModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
    }
    async updateStatus(id, status) {
        return this.runnerModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    }
    async updateTiming(id, data) {
        return this.runnerModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }
    async updateRankings(eventId, category) {
        const runners = await this.runnerModel
            .find({
            eventId: new mongoose_2.Types.ObjectId(eventId),
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
        for (const gender of ['M', 'F']) {
            const genderRunners = runners.filter(r => r.gender === gender);
            for (let i = 0; i < genderRunners.length; i++) {
                await this.runnerModel.findByIdAndUpdate(genderRunners[i]._id, {
                    genderRank: i + 1,
                });
            }
        }
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
    async getAllStatusByEvent(eventId) {
        const result = await this.runnerModel.aggregate([
            { $match: { eventId: new mongoose_2.Types.ObjectId(eventId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]).exec();
        return result.map(r => ({ status: r._id, count: r.count }));
    }
    async getStartersByAge(eventId) {
        return this.runnerModel.aggregate([
            { $match: { eventId: new mongoose_2.Types.ObjectId(eventId), status: { $in: ['in_progress', 'finished'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }
    async getWithdrawalByAge(eventId) {
        return this.runnerModel.aggregate([
            { $match: { eventId: new mongoose_2.Types.ObjectId(eventId), status: { $in: ['dnf', 'dns'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }
    async getWithdrawalByCheckpoint(eventId) {
        return this.runnerModel.aggregate([
            { $match: { eventId: new mongoose_2.Types.ObjectId(eventId), status: 'dnf' } },
            { $group: { _id: '$latestCheckpoint', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }
    async getFinishByTime(eventId) {
        const runners = await this.runnerModel.find({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            status: 'finished',
            netTime: { $exists: true },
        }).exec();
        const timeGroups = {};
        runners.forEach(runner => {
            if (runner.netTime) {
                const hours = Math.floor(runner.netTime / 3600000);
                const key = `${hours}h-${hours + 1}h`;
                timeGroups[key] = (timeGroups[key] || 0) + 1;
            }
        });
        return Object.entries(timeGroups).map(([timeRange, count]) => ({ timeRange, count }));
    }
    async getParticipantWithStationByEvent(eventId) {
        return this.runnerModel.find({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            latestCheckpoint: { $exists: true, $ne: null },
        }).sort({ latestCheckpoint: 1, elapsedTime: 1 }).exec();
    }
    async getLatestParticipantByCheckpoint(eventId, checkpoint, gender, ageGroup) {
        const query = {
            eventId: new mongoose_2.Types.ObjectId(eventId),
            latestCheckpoint: checkpoint,
        };
        if (gender)
            query.gender = gender;
        if (ageGroup)
            query.ageGroup = ageGroup;
        return this.runnerModel.find(query).sort({ elapsedTime: -1 }).limit(50).exec();
    }
    async delete(id) {
        await this.runnerModel.findByIdAndDelete(id).exec();
    }
    async deleteByEvent(eventId) {
        await this.runnerModel.deleteMany({ eventId: new mongoose_2.Types.ObjectId(eventId) }).exec();
    }
    async deleteAllParticipants(eventId) {
        await this.deleteByEvent(eventId);
    }
};
exports.RunnersService = RunnersService;
exports.RunnersService = RunnersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(runner_schema_1.Runner.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], RunnersService);
//# sourceMappingURL=runners.service.js.map
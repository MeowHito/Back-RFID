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
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const sync_log_schema_1 = require("./sync-log.schema");
let SyncService = class SyncService {
    syncLogModel;
    constructor(syncLogModel) {
        this.syncLogModel = syncLogModel;
    }
    async wasLastSyncError(campaignId) {
        const lastSync = await this.syncLogModel
            .findOne({ campaignId: new mongoose_2.Types.ObjectId(campaignId) })
            .sort({ createdAt: -1 })
            .exec();
        return lastSync?.status === 'error';
    }
    async getAllCampaignSyncErrors() {
        const errorLogs = await this.syncLogModel
            .aggregate([
            { $match: { status: 'error' } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$campaignId',
                    lastError: { $first: '$$ROOT' },
                },
            },
            {
                $lookup: {
                    from: 'campaigns',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'campaign',
                },
            },
            { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
        ])
            .exec();
        return errorLogs.map(log => ({
            campaignId: log._id,
            campaignName: log.campaign?.name,
            error: log.lastError,
        }));
    }
    async getSyncData(campaignId) {
        const logs = await this.syncLogModel
            .find({ campaignId: new mongoose_2.Types.ObjectId(campaignId) })
            .sort({ createdAt: -1 })
            .limit(10)
            .exec();
        const totalRecords = await this.syncLogModel
            .countDocuments({ campaignId: new mongoose_2.Types.ObjectId(campaignId) })
            .exec();
        const successCount = await this.syncLogModel
            .countDocuments({ campaignId: new mongoose_2.Types.ObjectId(campaignId), status: 'success' })
            .exec();
        const errorCount = await this.syncLogModel
            .countDocuments({ campaignId: new mongoose_2.Types.ObjectId(campaignId), status: 'error' })
            .exec();
        return {
            recentLogs: logs,
            statistics: {
                total: totalRecords,
                success: successCount,
                error: errorCount,
            },
        };
    }
    async createSyncLog(data) {
        const log = new this.syncLogModel({
            ...data,
            campaignId: new mongoose_2.Types.ObjectId(data.campaignId),
        });
        return log.save();
    }
    async updateSyncLog(id, data) {
        return this.syncLogModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(sync_log_schema_1.SyncLog.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], SyncService);
//# sourceMappingURL=sync.service.js.map
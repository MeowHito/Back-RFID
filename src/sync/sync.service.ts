import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SyncLog, SyncLogDocument } from './sync-log.schema';

@Injectable()
export class SyncService {
    constructor(
        @InjectModel(SyncLog.name) private syncLogModel: Model<SyncLogDocument>,
    ) { }

    async wasLastSyncError(campaignId: string): Promise<boolean> {
        const lastSync = await this.syncLogModel
            .findOne({ campaignId: new Types.ObjectId(campaignId) })
            .sort({ createdAt: -1 })
            .exec();
        return lastSync?.status === 'error';
    }

    async getAllCampaignSyncErrors(): Promise<any[]> {
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

    async getSyncData(campaignId: string): Promise<any> {
        const logs = await this.syncLogModel
            .find({ campaignId: new Types.ObjectId(campaignId) })
            .sort({ createdAt: -1 })
            .limit(10)
            .exec();

        const totalRecords = await this.syncLogModel
            .countDocuments({ campaignId: new Types.ObjectId(campaignId) })
            .exec();

        const successCount = await this.syncLogModel
            .countDocuments({ campaignId: new Types.ObjectId(campaignId), status: 'success' })
            .exec();

        const errorCount = await this.syncLogModel
            .countDocuments({ campaignId: new Types.ObjectId(campaignId), status: 'error' })
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

    async createSyncLog(data: {
        campaignId: string;
        status: 'success' | 'error' | 'pending';
        message?: string;
        recordsProcessed?: number;
        recordsFailed?: number;
        startTime?: Date;
        endTime?: Date;
        errorDetails?: Record<string, any>;
    }): Promise<SyncLogDocument> {
        const log = new this.syncLogModel({
            ...data,
            campaignId: new Types.ObjectId(data.campaignId),
        });
        return log.save();
    }

    async updateSyncLog(
        id: string,
        data: Partial<{
            status: string;
            message: string;
            recordsProcessed: number;
            recordsFailed: number;
            endTime: Date;
            errorDetails: Record<string, any>;
        }>,
    ): Promise<SyncLogDocument | null> {
        return this.syncLogModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }
}

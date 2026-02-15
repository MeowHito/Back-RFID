import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../campaigns/campaign.schema';
import { SyncLog, SyncLogDocument } from './sync-log.schema';

type RaceTigerRequestType = 'info' | 'bio' | 'split';

@Injectable()
export class SyncService {
    constructor(
        @InjectModel(SyncLog.name) private syncLogModel: Model<SyncLogDocument>,
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        private readonly configService: ConfigService,
    ) { }

    private toCampaignObjectId(campaignId: string): Types.ObjectId {
        if (!Types.ObjectId.isValid(campaignId)) {
            throw new BadRequestException('Invalid campaign id');
        }
        return new Types.ObjectId(campaignId);
    }

    private maskToken(token: string): string {
        if (!token) return '';
        if (token.length <= 8) return '********';
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    }

    private getRaceTigerBaseUrl(): string {
        return this.configService.get<string>('RACE_TIGER_BASE_URL') || 'https://rqs.racetigertiming.com';
    }

    private getRaceTigerPath(type: RaceTigerRequestType): string {
        if (type === 'info') {
            return this.configService.get<string>('RACE_TIGER_INFO_PATH') || '/Dif/info';
        }
        if (type === 'bio') {
            return this.configService.get<string>('RACE_TIGER_BIO_PATH') || '/Dif/bio';
        }
        return this.configService.get<string>('RACE_TIGER_SPLIT_PATH') || '/Dif/splitScore';
    }

    private getPayloadSample(parsedBody: any): any {
        const data = parsedBody?.data;
        if (Array.isArray(data)) {
            return data.slice(0, 3);
        }
        if (data && typeof data === 'object') {
            const entries = Object.entries(data).slice(0, 12);
            return Object.fromEntries(entries);
        }
        return parsedBody;
    }

    private async getSyncEnabledCampaign(campaignId: string): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findById(this.toCampaignObjectId(campaignId)).exec();
        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        if (!campaign.allowRFIDSync) {
            throw new BadRequestException('RFID sync is disabled for this campaign');
        }

        if (!campaign.rfidToken?.trim() || !campaign.raceId?.trim()) {
            throw new BadRequestException('Missing rfidToken or raceId for this campaign');
        }

        return campaign;
    }

    async wasLastSyncError(campaignId: string): Promise<boolean> {
        const lastSync = await this.syncLogModel
            .findOne({ campaignId: this.toCampaignObjectId(campaignId) })
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
        const cid = this.toCampaignObjectId(campaignId);

        // Run all queries in parallel instead of sequential
        const [logs, totalRecords, successCount, errorCount] = await Promise.all([
            this.syncLogModel.find({ campaignId: cid }).sort({ createdAt: -1 }).limit(10).lean().exec(),
            this.syncLogModel.countDocuments({ campaignId: cid }).exec(),
            this.syncLogModel.countDocuments({ campaignId: cid, status: 'success' }).exec(),
            this.syncLogModel.countDocuments({ campaignId: cid, status: 'error' }).exec(),
        ]);

        return {
            recentLogs: logs,
            statistics: {
                total: totalRecords,
                success: successCount,
                error: errorCount,
            },
        };
    }

    async getLatestPayload(campaignId: string): Promise<any> {
        const latest = await this.syncLogModel
            .findOne({ campaignId: this.toCampaignObjectId(campaignId), 'errorDetails.preview': { $exists: true } })
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        if (!latest) return null;

        return {
            status: latest.status,
            message: latest.message,
            createdAt: (latest as any).createdAt,
            preview: latest.errorDetails?.preview,
        };
    }

    async previewRaceTigerData(
        campaignId: string,
        type: RaceTigerRequestType = 'info',
        page: number = 1,
    ): Promise<any> {
        if (!['info', 'bio', 'split'].includes(type)) {
            throw new BadRequestException('type must be one of: info, bio, split');
        }

        const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
        const startTime = new Date();

        const syncLog = await this.createSyncLog({
            campaignId,
            status: 'pending',
            message: `RaceTiger ${type} preview started`,
            startTime,
        });

        const previewRequest: Record<string, any> = { type, page: safePage };

        try {
            const campaign = await this.getSyncEnabledCampaign(campaignId);
            const raceId = campaign.raceId.trim();
            const token = campaign.rfidToken.trim();

            const baseUrl = this.getRaceTigerBaseUrl();
            const path = this.getRaceTigerPath(type);
            const endpoint = `${baseUrl}${path}`;
            const partnerCode = this.configService.get<string>('RACE_TIGER_PARTNER_CODE') || '000001';
            const timeoutMs = Number(this.configService.get<string>('RACE_TIGER_TIMEOUT_MS') || 15000);

            const form = new URLSearchParams({
                pc: partnerCode,
                rid: raceId,
                token,
            });
            if (type !== 'info') {
                form.set('page', String(safePage));
            }

            previewRequest.endpoint = endpoint;
            previewRequest.requestParams = {
                pc: partnerCode,
                rid: raceId,
                page: type === 'info' ? undefined : safePage,
                token: this.maskToken(token),
            };

            const controller = new AbortController();
            const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

            let response: Response;
            try {
                response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: form.toString(),
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeoutHandle);
            }

            const rawBody = await response.text();
            let parsedBody: any = null;
            try {
                parsedBody = JSON.parse(rawBody);
            } catch {
                parsedBody = null;
            }

            const itemCount = Array.isArray(parsedBody?.data) ? parsedBody.data.length : 0;
            const preview = {
                fetchedAt: new Date().toISOString(),
                request: previewRequest,
                response: {
                    ok: response.ok,
                    httpStatus: response.status,
                    contentType: response.headers.get('content-type'),
                    bodySize: rawBody.length,
                    rawSnippet: rawBody.slice(0, 5000),
                    rawSnippetTruncated: rawBody.length > 5000,
                    itemCount,
                    payloadSample: this.getPayloadSample(parsedBody),
                },
            };

            if (!response.ok) {
                throw new BadGatewayException(`RaceTiger returned status ${response.status}`);
            }

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'success',
                message: `RaceTiger ${type} preview success`,
                recordsProcessed: itemCount,
                recordsFailed: 0,
                endTime: new Date(),
                errorDetails: { preview },
            });

            return preview;
        } catch (error: any) {
            const timeoutError = error?.name === 'AbortError';
            const errorMessage = timeoutError
                ? 'RaceTiger request timeout'
                : (error?.message || 'RaceTiger preview failed');

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'error',
                message: `RaceTiger ${type} preview failed: ${errorMessage}`,
                recordsProcessed: 0,
                recordsFailed: 1,
                endTime: new Date(),
                errorDetails: {
                    previewRequest,
                    error: {
                        message: errorMessage,
                        name: error?.name,
                    },
                },
            });

            if (
                error instanceof BadRequestException
                || error instanceof NotFoundException
                || error instanceof BadGatewayException
            ) {
                throw error;
            }

            throw new BadGatewayException(errorMessage);
        }
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
            campaignId: this.toCampaignObjectId(data.campaignId),
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

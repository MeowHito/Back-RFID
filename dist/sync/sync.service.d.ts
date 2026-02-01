import { Model } from 'mongoose';
import { SyncLogDocument } from './sync-log.schema';
export declare class SyncService {
    private syncLogModel;
    constructor(syncLogModel: Model<SyncLogDocument>);
    wasLastSyncError(campaignId: string): Promise<boolean>;
    getAllCampaignSyncErrors(): Promise<any[]>;
    getSyncData(campaignId: string): Promise<any>;
    createSyncLog(data: {
        campaignId: string;
        status: 'success' | 'error' | 'pending';
        message?: string;
        recordsProcessed?: number;
        recordsFailed?: number;
        startTime?: Date;
        endTime?: Date;
        errorDetails?: Record<string, any>;
    }): Promise<SyncLogDocument>;
    updateSyncLog(id: string, data: Partial<{
        status: string;
        message: string;
        recordsProcessed: number;
        recordsFailed: number;
        endTime: Date;
        errorDetails: Record<string, any>;
    }>): Promise<SyncLogDocument | null>;
}

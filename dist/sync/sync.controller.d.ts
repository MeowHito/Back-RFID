import { SyncService } from './sync.service';
interface NormalizedResponse {
    status: {
        code: string;
        description: string;
    };
    data?: any;
}
export declare class SyncController {
    private readonly syncService;
    constructor(syncService: SyncService);
    private successResponse;
    wasLastSyncError(headers: Record<string, string>, campaignId: string): Promise<NormalizedResponse>;
    getAllCampaignSyncErrors(headers: Record<string, string>): Promise<NormalizedResponse>;
    getSyncData(headers: Record<string, string>, id: string): Promise<NormalizedResponse>;
}
export {};

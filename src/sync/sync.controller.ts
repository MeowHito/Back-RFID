import { Controller, Get, Query, Headers } from '@nestjs/common';
import { SyncService } from './sync.service';

interface NormalizedResponse {
    status: {
        code: string;
        description: string;
    };
    data?: any;
}

@Controller('api/sync')
export class SyncController {
    constructor(private readonly syncService: SyncService) { }

    private successResponse(data?: any): NormalizedResponse {
        return {
            status: { code: '200', description: 'success' },
            data,
        };
    }

    @Get('last-sync-error')
    async wasLastSyncError(
        @Headers() headers: Record<string, string>,
        @Query('campaignId') campaignId: string,
    ) {
        const isError = await this.syncService.wasLastSyncError(campaignId);
        return this.successResponse(isError);
    }

    @Get('all-campaign-sync-errors')
    async getAllCampaignSyncErrors(@Headers() headers: Record<string, string>) {
        const errors = await this.syncService.getAllCampaignSyncErrors();
        return this.successResponse(errors);
    }

    @Get('sync-data')
    async getSyncData(
        @Headers() headers: Record<string, string>,
        @Query('id') id: string,
    ) {
        const data = await this.syncService.getSyncData(id);
        return this.successResponse(data);
    }
}

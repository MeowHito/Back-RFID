import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { TimingService } from './timing.service';
import type { ScanData } from './timing.service';
import { CampaignsService } from '../campaigns/campaigns.service';

@Controller('timing')
export class TimingController {
    constructor(
        private readonly timingService: TimingService,
        private readonly campaignsService: CampaignsService,
    ) { }

    @Post('scan')
    processScan(@Body() scanData: ScanData) {
        return this.timingService.processScan(scanData);
    }

    @Get('runner/:eventId/:runnerId')
    getRunnerRecords(
        @Param('eventId') eventId: string,
        @Param('runnerId') runnerId: string,
    ) {
        return this.timingService.getRunnerRecords(eventId, runnerId);
    }

    @Get('event/:eventId')
    getEventRecords(@Param('eventId') eventId: string) {
        return this.timingService.getEventRecords(eventId);
    }

    @Get('checkpoint/:eventId')
    getCheckpointRecords(
        @Param('eventId') eventId: string,
        @Query('cp') checkpoint: string,
    ) {
        return this.timingService.getCheckpointRecords(eventId, checkpoint);
    }

    @Get('checkpoint-by-campaign/:campaignId')
    async getCheckpointRecordsByCampaign(
        @Param('campaignId') campaignId: string,
        @Query('cp') checkpoint: string,
    ) {
        // Resolve slug/uuid to actual campaign _id
        let resolvedId = campaignId;
        try {
            const campaign = await this.campaignsService.findById(campaignId);
            if (campaign) resolvedId = String(campaign._id);
        } catch { /* use original if not found */ }
        return this.timingService.getCheckpointRecordsByCampaign(resolvedId, checkpoint);
    }

    @Delete(':id')
    deleteRecord(@Param('id') id: string) {
        return this.timingService.deleteRecord(id);
    }
}

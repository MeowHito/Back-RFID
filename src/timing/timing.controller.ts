import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { TimingService } from './timing.service';
import type { ScanData } from './timing.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { EventsService } from '../events/events.service';

@Controller('timing')
export class TimingController {
    constructor(
        private readonly timingService: TimingService,
        private readonly campaignsService: CampaignsService,
        private readonly eventsService: EventsService,
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

    @Get('recent-arrivals/:campaignId')
    getRecentArrivals(
        @Param('campaignId') campaignId: string,
        @Query('withinSeconds') withinSeconds: string,
    ) {
        return this.timingService.getRecentArrivals(campaignId, parseInt(withinSeconds || '60', 10));
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

    /**
     * One-shot repair for runners whose Gun/Net froze mid-race behind a staff-typed
     * checkpoint (see TimingService.isFrozenMidRace). The split sync now re-anchors these
     * as they happen; this endpoint fixes the ones that were already broken before that.
     * Idempotent — running it twice repairs nothing the second time.
     */
    @Post('repair-frozen/:campaignId')
    async repairFrozen(@Param('campaignId') campaignId: string) {
        let resolvedId = campaignId;
        try {
            const campaign = await this.campaignsService.findById(campaignId);
            if (campaign) resolvedId = String(campaign._id);
        } catch { /* use original if not found */ }
        const events = await this.eventsService.findByCampaign(resolvedId).catch(() => [] as any[]);
        const eventIds = [...new Set([
            resolvedId,
            ...(events as any[]).map(ev => String(ev?._id || '')).filter(Boolean),
        ])];
        return this.timingService.repairFrozenRunners(eventIds);
    }

    @Put(':id')
    updateRecord(
        @Param('id') id: string,
        @Body() body: { scanTime: string },
    ) {
        return this.timingService.updateRecordScanTime(id, body.scanTime);
    }

    @Delete(':id')
    deleteRecord(@Param('id') id: string) {
        return this.timingService.deleteRecord(id);
    }
}

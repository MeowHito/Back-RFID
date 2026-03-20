import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { TimingService } from './timing.service';
import type { ScanData } from './timing.service';

@Controller('timing')
export class TimingController {
    constructor(private readonly timingService: TimingService) { }

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
    getCheckpointRecordsByCampaign(
        @Param('campaignId') campaignId: string,
        @Query('cp') checkpoint: string,
    ) {
        return this.timingService.getCheckpointRecordsByCampaign(campaignId, checkpoint);
    }

    @Delete(':id')
    deleteRecord(@Param('id') id: string) {
        return this.timingService.deleteRecord(id);
    }
}

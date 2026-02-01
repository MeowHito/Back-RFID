import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
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

    @Delete(':id')
    deleteRecord(@Param('id') id: string) {
        return this.timingService.deleteRecord(id);
    }
}

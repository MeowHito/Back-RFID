import {
    Controller,
    Get,
    Delete,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CctvBetaRecordingsService } from './cctv-beta-recordings.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('cctv-beta/recordings')
export class CctvBetaRecordingsController {
    constructor(private readonly recordingsService: CctvBetaRecordingsService) {}

    @Get()
    findAll(
        @Query('campaignId') campaignId?: string,
        @Query('cameraId') cameraId?: string,
    ) {
        return this.recordingsService.findAll({ campaignId, cameraId });
    }

    @Get('runner-window')
    runnerWindow(
        @Query('campaignId') campaignId: string,
        @Query('checkpointName') checkpointName: string,
        @Query('from') from: string,
        @Query('to') to: string,
    ) {
        return this.recordingsService.findForRunnerWindow({
            campaignId,
            checkpointName,
            from: new Date(from),
            to: new Date(to),
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.recordingsService.findById(id);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    remove(@Param('id') id: string) {
        return this.recordingsService.remove(id);
    }
}

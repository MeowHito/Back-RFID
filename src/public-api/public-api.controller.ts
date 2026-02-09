import { Controller, Get, Post, Body, Query, Headers, Param, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { CampaignsService, PagingData } from '../campaigns/campaigns.service';
import { RunnersService } from '../runners/runners.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { TimingService } from '../timing/timing.service';
import { CreateUserDto, LoginStationDto, UpdatePasswordDto } from '../users/dto/user.dto';

interface NormalizedResponse {
    status: {
        code: string;
        description: string;
    };
    data?: any;
}

@Controller('public-api')
export class PublicApiController {
    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
        private readonly campaignsService: CampaignsService,
        private readonly runnersService: RunnersService,
        private readonly checkpointsService: CheckpointsService,
        private readonly timingService: TimingService,
    ) { }

    private successResponse(data?: any): NormalizedResponse {
        return {
            status: { code: '200', description: 'success' },
            data,
        };
    }

    private errorResponse(code: string, description: string): NormalizedResponse {
        return {
            status: { code, description },
        };
    }

    // User Registration
    @Post('register')
    async register(@Body() body: CreateUserDto) {
        try {
            const existingUser = await this.usersService.findByEmail(body.email);
            if (existingUser) {
                return this.errorResponse('10005', 'Email already exists in the system');
            }
            await this.usersService.create(body);
            return this.successResponse();
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    // Station Login
    @Post('loginStation')
    async loginStation(@Headers() headers: Record<string, string>, @Body() body: LoginStationDto) {
        try {
            const result = await this.authService.loginStation(body);
            return this.successResponse(result);
        } catch (error) {
            return this.errorResponse('401', 'Invalid credentials');
        }
    }

    // Check User Email (for password reset)
    @Post('checkUserEmail')
    async checkUserEmail(@Body() body: { email: string }) {
        const user = await this.usersService.findByEmail(body.email);
        if (user) {
            const token = await this.usersService.createResetToken(body.email);
            // In production, send email with reset link
            return this.successResponse({ tokenCreated: !!token });
        }
        return this.successResponse(null);
    }

    // Get User Token (check reset token validity)
    @Get('getUserToken')
    async getUserToken(@Query('id') id: string) {
        const isValid = await this.usersService.validateResetToken(id);
        return this.successResponse(isValid);
    }

    // Update Password via Token
    @Post('updateUserToken')
    async updateUserToken(@Body() body: { uuid: string; npw: string }) {
        try {
            await this.usersService.resetPasswordByToken(body.uuid, body.npw);
            return this.successResponse();
        } catch (error) {
            return this.errorResponse('400', error.message);
        }
    }

    // Update Password (authenticated)
    @Post('user/updatePassword')
    async updatePassword(@Body() body: UpdatePasswordDto) {
        try {
            await this.usersService.updatePassword(body);
            return this.successResponse();
        } catch (error) {
            return this.errorResponse('400', error.message);
        }
    }

    // ========== Campaign Endpoints ==========

    @Get('campaign/getCampaignByDate')
    async getCampaignByDate(
        @Query('type') type: string,
        @Query('user') user: string,
        @Query('role') role: string,
        @Query('paging') pagingJson: string,
    ) {
        let paging: PagingData | undefined;
        if (pagingJson) {
            try {
                paging = JSON.parse(pagingJson);
            } catch {
                // ignore parse error
            }
        }
        const data = await this.campaignsService.findByDate({ type, user, role }, paging);
        return this.successResponse(data);
    }

    @Get('campaign/getCampaignById')
    async getCampaignById(@Query('id') id: string) {
        try {
            const data = await this.campaignsService.findById(id);
            return this.successResponse(data);
        } catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
    }

    @Get('campaign/getCampaignDetailById')
    async getCampaignDetailById(@Query('id') id: string) {
        try {
            const data = await this.campaignsService.getDetailById(id);
            return this.successResponse(data);
        } catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
    }

    @Get('campaign/getCheckpointById')
    async getCheckpointById(@Query('id') id: string) {
        const data = await this.checkpointsService.findByCampaign(id);
        return this.successResponse(data);
    }

    // ========== Participant Endpoints ==========

    // Get all runners (no filter - for debugging)
    @Get('runners/all')
    async getAllRunners() {
        try {
            // Get all runners without filter
            const data = await this.runnersService.findAll(50);
            return this.successResponse({ data, total: data.length });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    @Get('campaign/getAllParticipantByEvent')
    async getAllParticipantByEvent(
        @Query('id') id: string,
        @Query('paging') pagingJson: string,
        @Query('eventName') eventName: string,
        @Query('gender') gender: string,
        @Query('ageGroup') ageGroup: string,
        @Query('favorites') favorites: string,
        @Query('type') type: string,
    ) {
        const filter = {
            eventId: id,
            gender,
            ageGroup,
        };
        const data = await this.runnersService.findByEvent(filter);
        return this.successResponse({ data, total: data.length });
    }

    @Get('campaign/getAllStatusByEvent')
    async getAllStatusByEvent(@Query('id') id: string) {
        // Get statistics by status
        const runners = await this.runnersService.findByEvent({ eventId: id });
        const statusCounts: Record<string, number> = {};
        runners.forEach(runner => {
            statusCounts[runner.status] = (statusCounts[runner.status] || 0) + 1;
        });
        const data = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
        return this.successResponse(data);
    }

    @Get('campaign/getStartersByAge')
    async getStartersByAge(@Query('id') id: string) {
        const runners = await this.runnersService.findByEvent({
            eventId: id,
            status: 'in_progress'
        });
        const ageGroups: Record<string, number> = {};
        runners.forEach(runner => {
            const ag = runner.ageGroup || 'Unknown';
            ageGroups[ag] = (ageGroups[ag] || 0) + 1;
        });
        const data = Object.entries(ageGroups).map(([ageGroup, count]) => ({ ageGroup, count }));
        return this.successResponse(data);
    }

    @Get('campaign/getFinishByTime')
    async getFinishByTime(@Query('id') id: string) {
        const runners = await this.runnersService.findByEvent({
            eventId: id,
            status: 'finished'
        });
        // Group by hour intervals
        const timeGroups: Record<string, number> = {};
        runners.forEach(runner => {
            if (runner.netTime) {
                const hours = Math.floor(runner.netTime / 3600000);
                const key = `${hours}h-${hours + 1}h`;
                timeGroups[key] = (timeGroups[key] || 0) + 1;
            }
        });
        const data = Object.entries(timeGroups).map(([timeRange, count]) => ({ timeRange, count }));
        return this.successResponse(data);
    }

    @Get('campaign/getParticipantByChipCode')
    async getParticipantByChipCode(
        @Query('id') id: string,
        @Query('chipCode') chipCode: string,
        @Query('bibNo') bibNo: string,
    ) {
        let runner;
        if (bibNo) {
            runner = await this.runnersService.findByBib(id, bibNo);
        } else if (chipCode) {
            runner = await this.runnersService.findByRfid(id, chipCode);
        }
        return this.successResponse(runner ? [runner] : []);
    }

    @Get('campaign/getLatestParticipantByCheckpoint')
    async getLatestParticipantByCheckpoint(
        @Query('id') id: string,
        @Query('eventUuid') eventUuid: string,
        @Query('paging') pagingJson: string,
        @Query('checkpointName') checkpointName: string,
        @Query('gender') gender: string,
        @Query('ageGroup') ageGroup: string,
    ) {
        const filter = {
            eventId: id,
            checkpoint: checkpointName,
            gender,
            ageGroup,
        };
        const data = await this.runnersService.findByEvent(filter);
        return this.successResponse({ data, total: data.length });
    }

    // ========== Race Timestamp Endpoints ==========

    @Post('raceTimestamp/createRaceTimestampWithQRCode')
    async createRaceTimestampWithQRCode(
        @Headers() headers: Record<string, string>,
        @Body() body: {
            campaignUuid: string;
            stationUuid: string;
            bibNo: string;
            scanTime: string;
            checkpoint: string;
        },
    ) {
        try {
            const scanData = {
                eventId: body.campaignUuid, // This should be resolved to actual eventId
                bib: body.bibNo,
                checkpoint: body.checkpoint,
                scanTime: new Date(body.scanTime),
            };
            await this.timingService.processScan(scanData);
            return this.successResponse();
        } catch (error) {
            return this.errorResponse('400', error.message);
        }
    }

    @Get('raceTimestamp/getRaceTimestampByStation')
    async getRaceTimestampByStation(
        @Query('id') id: string,
        @Query('campaignUuid') campaignUuid: string,
        @Query('paging') pagingJson: string,
    ) {
        // Get timing records for a station
        const data = await this.timingService.getEventRecords(campaignUuid);
        return this.successResponse({ data, total: data.length });
    }

    @Get('raceTimestamp/getParticipantBycampaign')
    async getParticipantByCampaign(
        @Query('id') id: string,
        @Query('campaignUuid') campaignUuid: string,
    ) {
        // This would need to fetch participants across all events in a campaign
        // For now, return empty array
        return this.successResponse([]);
    }

    // ========== Public Runner Registration ==========

    @Post('runner/register')
    async registerRunner(@Body() body: {
        eventId: string;
        firstName: string;
        lastName: string;
        gender: string;
        nationality?: string;
        ageGroup?: string;
        category?: string;
    }) {
        try {
            // Auto-generate BIB
            const runners = await this.runnersService.findByEvent({ eventId: body.eventId });
            const bib = `R${(runners.length + 1).toString().padStart(4, '0')}`;

            const runner = await this.runnersService.create({
                ...body,
                bib,
                status: 'registered',
                registerDate: new Date(),
            } as any);
            return this.successResponse(runner);
        } catch (error) {
            return this.errorResponse('400', error.message);
        }
    }

    // ========== Dev/Testing: Seed Sample Runners ==========

    @Post('seed/runners')
    async seedRunners(@Body() body: { eventId: string }) {
        try {
            const eventId = body.eventId;
            const sampleRunners = [
                { bib: 'R0001', firstName: 'สมชาย', lastName: 'ใจดี', gender: 'M', nationality: 'TH', ageGroup: '30-39', category: '50K', status: 'finished', netTime: 18000000, latestCheckpoint: 'Finish' },
                { bib: 'R0002', firstName: 'สมหญิง', lastName: 'รักวิ่ง', gender: 'F', nationality: 'TH', ageGroup: '25-29', category: '25K', status: 'in_progress', netTime: 7200000, latestCheckpoint: 'CP3' },
                { bib: 'R0003', firstName: 'John', lastName: 'Smith', gender: 'M', nationality: 'US', ageGroup: '40-49', category: '100K', status: 'in_progress', netTime: 28800000, latestCheckpoint: 'CP5' },
                { bib: 'R0004', firstName: 'Maria', lastName: 'Garcia', gender: 'F', nationality: 'ES', ageGroup: '35-39', category: '50K', status: 'finished', netTime: 21600000, latestCheckpoint: 'Finish' },
                { bib: 'R0005', firstName: 'วิทยา', lastName: 'มาราธอน', gender: 'M', nationality: 'TH', ageGroup: '45-49', category: '100K', status: 'dns', latestCheckpoint: 'Start' },
                { bib: 'R0006', firstName: 'อรุณ', lastName: 'พัฒนา', gender: 'M', nationality: 'TH', ageGroup: '20-24', category: '25K', status: 'in_progress', netTime: 5400000, latestCheckpoint: 'CP2' },
                { bib: 'R0007', firstName: 'Emma', lastName: 'Wilson', gender: 'F', nationality: 'UK', ageGroup: '30-34', category: '50K', status: 'in_progress', netTime: 14400000, latestCheckpoint: 'CP4' },
                { bib: 'R0008', firstName: 'ประยุทธ์', lastName: 'นักวิ่ง', gender: 'M', nationality: 'TH', ageGroup: '50-54', category: '100K', status: 'dnf', latestCheckpoint: 'CP6' },
                { bib: 'R0009', firstName: 'Lisa', lastName: 'Brown', gender: 'F', nationality: 'AU', ageGroup: '25-29', category: '25K', status: 'finished', netTime: 9000000, latestCheckpoint: 'Finish' },
                { bib: 'R0010', firstName: 'ธีรศักดิ์', lastName: 'วิ่งเร็ว', gender: 'M', nationality: 'TH', ageGroup: '35-39', category: '50K', status: 'in_progress', netTime: 16200000, latestCheckpoint: 'CP4' },
            ];

            const createdRunners: any[] = [];
            for (const runner of sampleRunners) {
                const existing = await this.runnersService.findByBib(eventId, runner.bib);
                if (!existing) {
                    const created = await this.runnersService.create({
                        eventId,
                        ...runner,
                        registerDate: new Date(),
                    } as any);
                    createdRunners.push(created);
                }
            }
            return this.successResponse({ created: createdRunners.length, total: sampleRunners.length });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    // Delete sample runners (BIB starting with R00)
    @Post('seed/delete-samples')
    async deleteSampleRunners(@Body() body: { eventId: string }) {
        try {
            const runners = await this.runnersService.findByEvent({ eventId: body.eventId });
            let deletedCount = 0;
            for (const runner of runners) {
                if (runner.bib.startsWith('R00')) {
                    await this.runnersService.delete(runner._id.toString());
                    deletedCount++;
                }
            }
            return this.successResponse({ deleted: deletedCount });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    // Update runners eventId (reassign to different campaign)
    @Post('runners/update-event')
    async updateRunnersEvent(@Body() body: { fromEventId: string; toEventId: string }) {
        try {
            const runners = await this.runnersService.findByEvent({ eventId: body.fromEventId });
            let updatedCount = 0;
            for (const runner of runners) {
                await this.runnersService.update(runner._id.toString(), {
                    eventId: body.toEventId
                });
                updatedCount++;
            }
            return this.successResponse({ updated: updatedCount });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }
}

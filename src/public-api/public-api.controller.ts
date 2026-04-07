import { Controller, Get, Post, Body, Query, Headers, Param, BadRequestException, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { CampaignsService, PagingData } from '../campaigns/campaigns.service';
import { RunnersService } from '../runners/runners.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { TimingService } from '../timing/timing.service';
import { EventsService } from '../events/events.service';
import { CctvRecordingsService } from '../cctv-cameras/cctv-recordings.service';
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
        private readonly eventsService: EventsService,
        private readonly cctvRecordingsService: CctvRecordingsService,
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

    private async resolveCampaignObjectId(id: string): Promise<string> {
        if (!id) {
            throw new BadRequestException('Campaign id is required');
        }

        const campaign = await this.campaignsService.findById(id);
        return String(campaign._id);
    }

    private getRunnerPrimaryTimeMs(runner: any): number {
        const candidates = [
            runner?.netTimeMs,
            runner?.totalNetTimeMs,
            runner?.totalNetTime,
            runner?.netTime,
            runner?.gunTimeMs,
            runner?.totalGunTimeMs,
            runner?.totalGunTime,
            runner?.gunTime,
            runner?.elapsedTime,
        ];
        for (const value of candidates) {
            const num = Number(value || 0);
            if (Number.isFinite(num) && num > 0) return num;
        }
        return 0;
    }

    private getRunnerScanTimeMs(runner: any): number {
        const time = runner?.scanTime ? new Date(runner.scanTime).getTime() : 0;
        return Number.isFinite(time) && time > 0 ? time : 0;
    }

    private compareStableRunnerOrder(a: any, b: any): number {
        const bibCompare = String(a?.bib || '').localeCompare(String(b?.bib || ''), undefined, { numeric: true });
        if (bibCompare !== 0) return bibCompare;
        return String(a?._id || '').localeCompare(String(b?._id || ''));
    }

    private comparePublicRankOrder(a: any, b: any): number {
        const statusOrder: Record<string, number> = { finished: 0, in_progress: 1, dnf: 2, dns: 3, dq: 4, not_started: 5 };
        const statusDiff = (statusOrder[a?.status] ?? 6) - (statusOrder[b?.status] ?? 6);
        if (statusDiff !== 0) return statusDiff;

        if (a?.status === 'finished' && b?.status === 'finished') {
            const aTime = this.getRunnerPrimaryTimeMs(a);
            const bTime = this.getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = this.getRunnerScanTimeMs(a);
            const bScan = this.getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return this.compareStableRunnerOrder(a, b);
        }

        if (a?.status === 'in_progress' && b?.status === 'in_progress') {
            const aPassed = a?.passedCount ?? 0;
            const bPassed = b?.passedCount ?? 0;
            if (aPassed !== bPassed) return bPassed - aPassed;
            const aTime = this.getRunnerPrimaryTimeMs(a);
            const bTime = this.getRunnerPrimaryTimeMs(b);
            if (aTime > 0 && bTime > 0 && aTime !== bTime) return aTime - bTime;
            if (aTime > 0 && bTime <= 0) return -1;
            if (aTime <= 0 && bTime > 0) return 1;
            const aScan = this.getRunnerScanTimeMs(a);
            const bScan = this.getRunnerScanTimeMs(b);
            if (aScan > 0 && bScan > 0 && aScan !== bScan) return aScan - bScan;
            return this.compareStableRunnerOrder(a, b);
        }

        return this.compareStableRunnerOrder(a, b);
    }

    private buildScopedPublicRankMaps(records: any[]) {
        const overallRankMap = new Map<string, number>();
        const genderRankMap = new Map<string, number>();
        const catRankMap = new Map<string, number>();

        const byEvent = new Map<string, any[]>();
        records.forEach((record: any) => {
            const status = String(record?.status || '').toLowerCase();
            if (status !== 'finished' && status !== 'in_progress') return;
            const eventKey = String(record?.eventId || '');
            if (!byEvent.has(eventKey)) byEvent.set(eventKey, []);
            byEvent.get(eventKey)!.push(record);
        });

        byEvent.forEach((eventRecords) => {
            [...eventRecords].sort((a: any, b: any) => this.comparePublicRankOrder(a, b)).forEach((record, index) => {
                overallRankMap.set(String(record._id), index + 1);
            });

            const genderGroups = new Map<string, any[]>();
            eventRecords.forEach((record: any) => {
                const gender = String(record?.gender || '').toUpperCase();
                if (!genderGroups.has(gender)) genderGroups.set(gender, []);
                genderGroups.get(gender)!.push(record);
            });
            genderGroups.forEach((group) => {
                group.sort((a: any, b: any) => this.comparePublicRankOrder(a, b)).forEach((record, index) => {
                    genderRankMap.set(String(record._id), index + 1);
                });
            });

            const catGroups = new Map<string, any[]>();
            eventRecords.forEach((record: any) => {
                const category = String(record?.ageGroup || '');
                if (!category) return;
                if (!catGroups.has(category)) catGroups.set(category, []);
                catGroups.get(category)!.push(record);
            });
            catGroups.forEach((group) => {
                group.sort((a: any, b: any) => this.comparePublicRankOrder(a, b)).forEach((record, index) => {
                    catRankMap.set(String(record._id), index + 1);
                });
            });
        });

        return { overallRankMap, genderRankMap, catRankMap };
    }

    private mergeTimingIntoRunner(target: any, timing: any): void {
        if (!timing) return;
        if (!target.netTime || target.netTime <= 0) target.netTime = timing.netTime || 0;
        if (!target.gunTime || target.gunTime <= 0) target.gunTime = timing.gunTime || 0;
        if (!target.elapsedTime || target.elapsedTime <= 0) target.elapsedTime = timing.elapsedTime || 0;
        if (!target.netTimeMs || target.netTimeMs <= 0) target.netTimeMs = timing.netTimeMs || 0;
        if (!target.gunTimeMs || target.gunTimeMs <= 0) target.gunTimeMs = timing.gunTimeMs || 0;
        if (!target.totalNetTime || target.totalNetTime <= 0) target.totalNetTime = timing.totalNetTime || 0;
        if (!target.totalGunTime || target.totalGunTime <= 0) target.totalGunTime = timing.totalGunTime || 0;
        if (!target.totalNetTimeMs || target.totalNetTimeMs <= 0) target.totalNetTimeMs = timing.totalNetTimeMs || 0;
        if (!target.totalGunTimeMs || target.totalGunTimeMs <= 0) target.totalGunTimeMs = timing.totalGunTimeMs || 0;
        if (!target.scanTime) target.scanTime = timing.scanTime;
        if (!target.passedCount || target.passedCount <= 0) target.passedCount = timing.passedCount || 0;
    }

    private async getRunnerCctvContext(runnerId: string) {
        const runner = await this.runnersService.findOne(runnerId);
        if (!runner) {
            throw new BadRequestException('Runner not found');
        }

        const event = await this.eventsService.findOne(String(runner.eventId)).catch(() => null);
        const campaignId = event?.campaignId ? String(event.campaignId) : String(runner.eventId);
        if (!campaignId) {
            throw new BadRequestException('Campaign not found for runner');
        }

        const hits = await this.cctvRecordingsService.runnerLookup(runner.bib, campaignId);
        return { runner, campaignId, hits };
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

    @Get('campaign/image')
    async getCampaignImage(@Query('id') id: string) {
        try {
            const data = await this.campaignsService.findById(id);
            return this.successResponse({ pictureUrl: data?.pictureUrl || null });
        } catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
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
        const campaignId = await this.resolveCampaignObjectId(id);
        const data = await this.checkpointsService.findByCampaign(campaignId);
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
        const campaignId = await this.resolveCampaignObjectId(id);
        const events = await this.eventsService.findByCampaign(campaignId);
        const eventIds = Array.from(
            new Set([
                campaignId,
                ...events.map((event: any) => String(event?._id || '')).filter(Boolean),
            ]),
        );

        const filter = {
            gender,
            ageGroup,
        };

        const data = await this.runnersService.findByEventIds(eventIds, filter);

        // Supplement runner documents with timing-based time values for accurate ranking
        try {
            const timingData = await this.timingService.getLatestPerRunner(eventIds);
            const timingByRunner = new Map<string, any>();
            for (const t of timingData) {
                if (t._id) timingByRunner.set(String(t._id), t);
            }
            for (const r of data as any[]) {
                const timing = timingByRunner.get(String(r._id));
                this.mergeTimingIntoRunner(r, timing);
            }
        } catch { /* timing supplement failed, proceed with runner data */ }

        const { overallRankMap, genderRankMap, catRankMap } = this.buildScopedPublicRankMaps(data as any[]);

        // Apply computed ranks for all rankable runners so stale stored ranks cannot conflict
        for (const r of data as any[]) {
            const rid = String(r._id);
            if (overallRankMap.has(rid)) {
                r.overallRank = overallRankMap.get(rid);
            }
            if (genderRankMap.has(rid)) {
                r.genderRank = genderRankMap.get(rid);
            }
            if (catRankMap.has(rid)) {
                r.ageGroupRank = catRankMap.get(rid);
            }
        }

        return this.successResponse({ data, total: data.length });
    }

    @Get('campaign/getPassTimeByEvent')
    async getPassTimeByEvent(
        @Query('id') id: string,
    ) {
        const campaignId = await this.resolveCampaignObjectId(id);
        const events = await this.eventsService.findByCampaign(campaignId);
        const eventIds = Array.from(
            new Set([
                campaignId,
                ...events.map((event: any) => String(event?._id || '')).filter(Boolean),
            ]),
        );

        // 1. Run both queries in parallel for speed
        const [timingData, allRunners] = await Promise.all([
            this.timingService.getLatestPerRunner(eventIds),
            this.runnersService.findByEventIds(eventIds),
        ]);
        const timingRunnerIds = new Set(timingData.map((r: any) => String(r._id)));

        // 3. Merge: for runners NOT in timing data, add them from Runner collection
        const extraRunners = allRunners
            .filter((r: any) => !timingRunnerIds.has(String(r._id)))
            .map((r: any) => ({
                _id: r._id,
                eventId: r.eventId,
                bib: r.bib,
                firstName: r.firstName,
                lastName: r.lastName,
                firstNameTh: r.firstNameTh,
                lastNameTh: r.lastNameTh,
                gender: r.gender,
                category: r.category,
                ageGroup: r.ageGroup,
                age: r.age,
                nationality: r.nationality,
                team: r.team,
                teamName: r.teamName,
                status: r.status,
                latestCheckpoint: r.latestCheckpoint,
                passedCount: r.passedCount || 0,
                netTime: r.netTime,
                gunTime: r.gunTime,
                overallRank: r.overallRank,
                genderRank: r.genderRank,
                genderNetRank: r.genderNetRank,
                ageGroupRank: r.ageGroupRank,
                ageGroupNetRank: r.ageGroupNetRank,
                categoryRank: r.categoryRank,
                categoryNetRank: r.categoryNetRank,
                netTimeStr: r.netTimeStr,
                gunTimeStr: r.gunTimeStr,
                gunPace: r.gunPace,
                netPace: r.netPace,
                statusCheckpoint: r.statusCheckpoint,
                statusNote: r.statusNote,
                scanTime: r.scanTime,
                elapsedTime: r.elapsedTime,
                gunTimeMs: r.gunTimeMs,
                netTimeMs: r.netTimeMs,
                totalGunTime: r.totalGunTime,
                totalNetTime: r.totalNetTime,
                totalGunTimeMs: r.totalGunTimeMs,
                totalNetTimeMs: r.totalNetTimeMs,
            }));

        const merged = [...timingData, ...extraRunners];

        const { overallRankMap, genderRankMap, catRankMap } = this.buildScopedPublicRankMaps(merged as any[]);

        // Apply computed ranks to merged data
        for (const r of merged) {
            const id = String(r._id);
            if (overallRankMap.has(id)) {
                r.overallRank = overallRankMap.get(id);
            }
            if (genderRankMap.has(id)) {
                r.genderRank = genderRankMap.get(id);
            }
            if (catRankMap.has(id)) {
                r.ageGroupRank = catRankMap.get(id);
            }
        }

        return this.successResponse({ data: merged, total: merged.length });
    }

    @Get('campaign/getAllStatusByEvent')
    async getAllStatusByEvent(@Query('id') id: string) {
        const eventId = await this.resolveCampaignObjectId(id);
        // Use server-side aggregation instead of loading all runners into memory
        const data = await this.runnersService.getAllStatusByEvent(eventId);
        return this.successResponse(data);
    }

    @Get('campaign/getStartersByAge')
    async getStartersByAge(@Query('id') id: string) {
        const eventId = await this.resolveCampaignObjectId(id);
        const runners = await this.runnersService.findByEvent({
            eventId,
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
        const eventId = await this.resolveCampaignObjectId(id);
        const runners = await this.runnersService.findByEvent({
            eventId,
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
        const eventId = await this.resolveCampaignObjectId(id);
        let runner;
        if (bibNo) {
            runner = await this.runnersService.findByBib(eventId, bibNo);
        } else if (chipCode) {
            runner = await this.runnersService.findByRfid(eventId, chipCode);
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
        const eventId = await this.resolveCampaignObjectId(id);
        const filter = {
            eventId,
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
            // Auto-generate BIB (use count, no full list load)
            const count = await this.runnersService.countByEvent(body.eventId);
            const bib = `R${(count + 1).toString().padStart(4, '0')}`;

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

    // ========== Runner Profile (for public runner detail page) ==========

    @Get('runner/:id')
    async getRunnerProfile(@Param('id') id: string) {
        try {
            const runner = await this.runnersService.findOne(id);
            if (!runner) return this.errorResponse('404', 'Runner not found');

            const eventId = String(runner.eventId);
            const runnerId = String(runner._id);

            // Fetch timing records for this runner + per-checkpoint ranks
            const [timingRecords, checkpointRanks] = await Promise.all([
                this.timingService.getRunnerRecords(eventId, runnerId),
                this.timingService.getCheckpointRanksForRunner(eventId, runner.bib),
            ]);

            // Fetch event to get campaign info
            const event = await this.eventsService.findOne(eventId).catch(() => null);
            let campaign: any = null;
            if (event) {
                campaign = await this.campaignsService.findById(String(event.campaignId)).catch(() => null);
            }

            // Fetch checkpoint mappings for this event (with distances from RaceTiger sync)
            let checkpointMappings: any[] = [];
            try {
                checkpointMappings = await this.checkpointsService.findMappingsByEvent(eventId);
            } catch { /* no mappings */ }

            // Convert checkpoint ranks Map to plain object for JSON serialization
            const checkpointRanksObj: Record<string, number> = {};
            for (const [cp, rank] of checkpointRanks.entries()) {
                checkpointRanksObj[cp] = rank;
            }

            // Compute live ranks from authoritative campaign timing data so runner page matches event page
            const runnerObj = (runner as any).toObject ? (runner as any).toObject() : { ...runner as any };
            const needsFinishTime = !runnerObj.netTime && !runnerObj.gunTime && !runnerObj.elapsedTime;

            try {
                // Get event scope only so runner rank matches the selected event distance/tab
                const eventIds = [eventId];

                // Get all runners + timing data for accurate ranking
                const [allRunners, timingForRank] = await Promise.all([
                    this.runnersService.findByEventIds(eventIds),
                    this.timingService.getLatestPerRunner(eventIds),
                ]);

                // Supplement runner documents with timing-based time values
                const timingByRunnerId = new Map<string, any>();
                for (const t of timingForRank) {
                    if (t._id) timingByRunnerId.set(String(t._id), t);
                }
                for (const r of allRunners as any[]) {
                    const timing = timingByRunnerId.get(String(r._id));
                    this.mergeTimingIntoRunner(r, timing);
                }

                const { overallRankMap, genderRankMap, catRankMap } = this.buildScopedPublicRankMaps(allRunners as any[]);
                if (overallRankMap.has(runnerId)) runnerObj.overallRank = overallRankMap.get(runnerId);
                if (genderRankMap.has(runnerId)) runnerObj.genderRank = genderRankMap.get(runnerId);
                if (catRankMap.has(runnerId)) runnerObj.ageGroupRank = catRankMap.get(runnerId);

                const eventScopedRankable = (allRunners as any[]).filter((r: any) => {
                    const sameEvent = String(r?.eventId || '') === eventId;
                    const status = String(r?.status || '').toLowerCase();
                    return sameEvent && (status === 'finished' || status === 'in_progress');
                });
                runnerObj.totalFinishers = eventScopedRankable.length;
                runnerObj.genderFinishers = eventScopedRankable.filter((r: any) => (r.gender || '').toUpperCase() === (runnerObj.gender || '').toUpperCase()).length;

                // Finish time from timing records
                if (needsFinishTime && timingRecords.length > 0) {
                    const finishRecord = timingRecords.find((t: any) => (t.checkpoint || '').toLowerCase().includes('finish'));
                    const lastRecord = timingRecords[timingRecords.length - 1] as any;
                    const useRecord = finishRecord || (runnerObj.status === 'finished' ? lastRecord : null);
                    if (useRecord) {
                        const net = (useRecord as any).netTime || (useRecord as any).elapsedTime || (useRecord as any).gunTime;
                        if (net && net > 0) {
                            runnerObj.netTime = net;
                        }
                    }
                }
            } catch { /* rank computation failed, proceed without */ }

            return this.successResponse({
                runner: runnerObj,
                timingRecords,
                checkpointRanks: checkpointRanksObj,
                checkpointMappings,
                event,
                campaign: campaign ? {
                    _id: campaign._id,
                    name: campaign.name,
                    slug: campaign.slug,
                    eventDate: campaign.eventDate,
                    location: campaign.location,
                    pictureUrl: campaign.pictureUrl,
                    categories: campaign.categories,
                    eslipTemplate: campaign.eslipTemplate || 'template1',
                    eslipTemplates: (campaign as any).eslipTemplates || [],
                    eslipVisibleFields: (campaign as any).eslipVisibleFields || [],
                    displayMode: (campaign as any).displayMode || 'marathon',
                    isApproveCertificate: campaign.isApproveCertificate ?? false,
                    certLayout: (campaign as any).certLayout || null,
                } : null,
            });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    @Get('runner/:id/cctv')
    async getRunnerCctv(@Param('id') id: string) {
        try {
            const { campaignId, hits } = await this.getRunnerCctvContext(id);
            return this.successResponse({ campaignId, hits });
        } catch (error) {
            return this.errorResponse('500', error.message);
        }
    }

    @Get('runner/:runnerId/cctv/:recordingId/stream')
    async streamRunnerCctv(
        @Param('runnerId') runnerId: string,
        @Param('recordingId') recordingId: string,
        @Query('download') download: string,
        @Query('ss') ssParam: string,
        @Query('t') tParam: string,
        @Res() res: Response,
    ) {
        try {
            const { hits } = await this.getRunnerCctvContext(runnerId);
            const matched = hits.find((hit: any) => String(hit?.recording?._id || '') === recordingId);
            if (!matched?.recording) {
                return res.status(404).json({ error: 'Recording not found for runner' });
            }

            const { filePath, mimeType, fileName } = await this.cctvRecordingsService.getFilePath(recordingId);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Parse trim parameters
            const ss = Number(ssParam);
            const t = Number(tParam);
            const hasTrim = Number.isFinite(ss) && ss >= 0 && Number.isFinite(t) && t > 0;

            // Trim + convert to mp4 (cached) — for both download and streaming with ss/t params
            if (download === '1' || hasTrim) {
                const baseName = fileName.replace(/\.[^.]+$/, '');
                const cacheKey = hasTrim ? `${baseName}_ss${ss}_t${t}.mp4` : `${baseName}.mp4`;
                const cacheDir = path.dirname(filePath);
                const cachedPath = path.join(cacheDir, cacheKey);
                const mp4FileName = `${baseName}.mp4`;
                const disposition = download === '1' ? 'attachment' : 'inline';

                // Serve cached file if it exists
                if (fs.existsSync(cachedPath)) {
                    const mp4Stat = fs.statSync(cachedPath);
                    if (mp4Stat.size > 0) {
                        res.setHeader('Content-Type', 'video/mp4');
                        res.setHeader('Content-Length', mp4Stat.size);
                        res.setHeader('Content-Disposition', `${disposition}; filename="${mp4FileName}"`);
                        res.setHeader('Accept-Ranges', 'bytes');
                        fs.createReadStream(cachedPath).pipe(res);
                        return;
                    }
                }

                // Build ffmpeg args: trim + convert to mp4
                try {
                    const ffmpegArgs: string[] = ['-y'];
                    if (hasTrim) {
                        ffmpegArgs.push('-ss', String(ss), '-t', String(t));
                    }
                    ffmpegArgs.push(
                        '-i', filePath,
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-crf', '28',
                        '-c:a', 'aac',
                        '-b:a', '96k',
                        '-movflags', '+faststart',
                        cachedPath,
                    );

                    await new Promise<void>((resolve, reject) => {
                        execFile('ffmpeg', ffmpegArgs, { timeout: 120_000 }, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    if (fs.existsSync(cachedPath)) {
                        const mp4Stat = fs.statSync(cachedPath);
                        res.setHeader('Content-Type', 'video/mp4');
                        res.setHeader('Content-Length', mp4Stat.size);
                        res.setHeader('Content-Disposition', `${disposition}; filename="${mp4FileName}"`);
                        res.setHeader('Accept-Ranges', 'bytes');
                        fs.createReadStream(cachedPath).pipe(res);
                        return;
                    }
                } catch {
                    // ffmpeg failed – clean up and fall through to serve original
                    try { if (fs.existsSync(cachedPath)) fs.unlinkSync(cachedPath); } catch {}
                }
            }

            // Streaming / fallback: serve original file as-is
            const stat = fs.statSync(filePath);
            res.setHeader('Content-Type', mimeType || 'video/webm');
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', `${download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`);
            res.setHeader('Accept-Ranges', 'bytes');
            fs.createReadStream(filePath).pipe(res);
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'Internal server error' });
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

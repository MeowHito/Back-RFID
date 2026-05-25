import { Controller, Get, Post, Body, Query, Headers, Param, BadRequestException, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFile, spawn } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { CampaignsService, PagingData } from '../campaigns/campaigns.service';
import { RunnersService } from '../runners/runners.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { TimingService } from '../timing/timing.service';
import { EventsService } from '../events/events.service';
import { CctvRecordingsService } from '../cctv-cameras/cctv-recordings.service';
import { CctvSettingsService } from '../cctv-cameras/cctv-settings.service';
import { CctvBetaRecordingsService } from '../cctv-beta/cctv-beta-recordings.service';
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
    // In-memory response cache for hot public endpoints (TTL 8s — sync runs every 5s so max staleness is acceptable)
    private readonly _cache = new Map<string, { data: any; expiry: number }>();
    private readonly _CACHE_TTL = 8_000;
    private readonly _campaignIdCache = new Map<string, { id: string; expiry: number }>();

    private _cacheGet(key: string): any | null {
        const entry = this._cache.get(key);
        if (!entry || Date.now() > entry.expiry) { this._cache.delete(key); return null; }
        return entry.data;
    }
    private _cacheSet(key: string, data: any): void {
        this._cache.set(key, { data, expiry: Date.now() + this._CACHE_TTL });
    }

    constructor(
        private readonly usersService: UsersService,
        private readonly authService: AuthService,
        private readonly campaignsService: CampaignsService,
        private readonly runnersService: RunnersService,
        private readonly checkpointsService: CheckpointsService,
        private readonly timingService: TimingService,
        private readonly eventsService: EventsService,
        private readonly cctvRecordingsService: CctvRecordingsService,
        private readonly cctvSettingsService: CctvSettingsService,
        private readonly cctvBetaRecordingsService: CctvBetaRecordingsService,
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
        const cached = this._campaignIdCache.get(id);
        if (cached && Date.now() < cached.expiry) return cached.id;
        const campaign = await this.campaignsService.findById(id);
        const resolved = String(campaign._id);
        this._campaignIdCache.set(id, { id: resolved, expiry: Date.now() + 60_000 });
        return resolved;
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

            // CAT rank is scoped to gender + ageGroup so M40-49 and F40-49 rank separately.
            const catGroups = new Map<string, any[]>();
            eventRecords.forEach((record: any) => {
                const ageGroup = String(record?.ageGroup || '');
                if (!ageGroup) return;
                const gender = String(record?.gender || '').toUpperCase();
                const catKey = `${gender}::${ageGroup}`;
                if (!catGroups.has(catKey)) catGroups.set(catKey, []);
                catGroups.get(catKey)!.push(record);
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
        // Pass-time fields — needed so Results mode (raceFinished=true) keeps the same
        // column coverage as Live mode. Without these the Distance / Split* / Leg* /
        // Chip Code / Cut-off etc. columns render as "-" after raceFinished is toggled.
        if (target.distanceFromStart == null) target.distanceFromStart = timing.distanceFromStart;
        if (target.order == null) target.order = timing.order;
        if (!target.latestCheckpoint) target.latestCheckpoint = timing.latestCheckpoint || timing.checkpoint;
        if (!target.splitTime) target.splitTime = timing.splitTime;
        if (target.splitNo == null) target.splitNo = timing.splitNo;
        if (!target.splitDesc) target.splitDesc = timing.splitDesc;
        if (!target.splitPace) target.splitPace = timing.splitPace;
        if (!target.gunPace) target.gunPace = timing.gunPace;
        if (!target.netPace) target.netPace = timing.netPace;
        if (!target.chipCode) target.chipCode = timing.chipCode;
        if (!target.printingCode) target.printingCode = timing.printingCode;
        if (!target.supplement) target.supplement = timing.supplement;
        if (!target.cutOff) target.cutOff = timing.cutOff;
        if (!target.legTime) target.legTime = timing.legTime;
        if (!target.legPace) target.legPace = timing.legPace;
        if (target.legDistance == null) target.legDistance = timing.legDistance;
        if (target.lagMs == null) target.lagMs = timing.lagMs;

        // Result mode (raceFinished=true) hits getAllParticipantByEvent which seeds
        // `latestCheckpoint` from the Runner doc. RaceTiger's pass-time sync stamps
        // `latestCheckpoint='CP4'` for runners whose last RaceTiger pass-time row was
        // CP4 — even after FINISH is recorded — so the STATUS column on /event/[slug]
        // (RESULT mode) shows CP4 forever. Force the FINISH label for runners whose
        // status is finished, regardless of what the source row says.
        if (String(target.status || '').toLowerCase() === 'finished') {
            const looksLikeFinish = (v: any) => /finish|^fin$/i.test(String(v || ''));
            const finishName = looksLikeFinish(target.statusCheckpoint) ? target.statusCheckpoint
                : looksLikeFinish(timing?.checkpoint) ? timing.checkpoint
                : 'FINISH';
            if (!looksLikeFinish(target.latestCheckpoint)) target.latestCheckpoint = finishName;
            if (!looksLikeFinish(target.splitDesc)) target.splitDesc = finishName;
        }
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

        // Runner profile (/runner/:id) surfaces ONLY the Beta pipeline (Larix / IRL Pro
        // → MediaMTX → S3 HLS). The legacy browser-based classic CCTV is intentionally
        // excluded here — admin tools still expose it via /cctv-recordings, but the
        // public-facing runner page is beta-only by product decision.
        const betaHits = await this.cctvBetaRecordingsService.runnerLookup(runner.bib, campaignId);
        const hits = betaHits.map((h: any) => {
            const recWithSource = h.recording
                ? { ...h.recording, source: 'beta', seekSeconds: h.seekSeconds }
                : null;
            return {
                checkpoint: h.checkpoint,
                scanTime: h.scanTime,
                elapsedTime: h.elapsedTime,
                splitTime: h.splitTime,
                recording: recWithSource,
                seekSeconds: h.seekSeconds,
                recordings: recWithSource ? [recWithSource] : [],
            };
        }).sort((a: any, b: any) => new Date(a.scanTime).getTime() - new Date(b.scanTime).getTime());
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
            const cacheKey = `campaignDetail:${id}`;
            const cached = this._cacheGet(cacheKey);
            if (cached) return cached;
            const data = await this.campaignsService.getDetailById(id);
            const result = this.successResponse(data);
            this._cacheSet(cacheKey, result);
            return result;
        } catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
    }

    @Get('campaign/getCheckpointById')
    async getCheckpointById(@Query('id') id: string) {
        const campaignId = await this.resolveCampaignObjectId(id);
        const cacheKey = `checkpoints:${campaignId}`;
        const cached = this._cacheGet(cacheKey);
        if (cached) return cached;
        const data = await this.checkpointsService.findByCampaign(campaignId);
        const result = this.successResponse(data);
        this._cacheSet(cacheKey, result);
        return result;
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
        const cacheKey = `allParticipants:${campaignId}:${gender || ''}:${ageGroup || ''}`;
        const cached = this._cacheGet(cacheKey);
        if (cached) return cached;

        const events = await this.eventsService.findByCampaign(campaignId);
        const eventIds = Array.from(
            new Set([
                campaignId,
                ...events.map((event: any) => String(event?._id || '')).filter(Boolean),
            ]),
        );

        const filter = { gender, ageGroup };
        const data = await this.runnersService.findByEventIds(eventIds, filter);

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

        // Normalize STATUS for finished runners regardless of whether timing data was
        // available — covers the case where RaceTiger pass-time sync left
        // latestCheckpoint='CP4' on the Runner doc even after FINISH was recorded.
        for (const r of data as any[]) {
            if (String(r?.status || '').toLowerCase() !== 'finished') continue;
            const looksLikeFinish = (v: any) => /finish|^fin$/i.test(String(v || ''));
            const finishName = looksLikeFinish(r.statusCheckpoint) ? r.statusCheckpoint : 'FINISH';
            if (!looksLikeFinish(r.latestCheckpoint)) r.latestCheckpoint = finishName;
            if (!looksLikeFinish(r.splitDesc)) r.splitDesc = finishName;
        }

        const { overallRankMap, genderRankMap, catRankMap } = this.buildScopedPublicRankMaps(data as any[]);
        for (const r of data as any[]) {
            const rid = String(r._id);
            if (overallRankMap.has(rid)) r.overallRank = overallRankMap.get(rid);
            if (genderRankMap.has(rid)) r.genderRank = genderRankMap.get(rid);
            if (catRankMap.has(rid)) r.ageGroupRank = catRankMap.get(rid);
        }

        const result = this.successResponse({ data, total: data.length });
        this._cacheSet(cacheKey, result);
        return result;
    }

    @Get('campaign/getPassTimeByEvent')
    async getPassTimeByEvent(
        @Query('id') id: string,
    ) {
        const campaignId = await this.resolveCampaignObjectId(id);
        const cacheKey = `passTime:${campaignId}`;
        const cached = this._cacheGet(cacheKey);
        if (cached) return cached;

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

        // Normalize STATUS for finished runners so RaceTiger's stale
        // latestCheckpoint='CP4' doesn't leak through.
        for (const r of merged as any[]) {
            if (String(r?.status || '').toLowerCase() !== 'finished') continue;
            const looksLikeFinish = (v: any) => /finish|^fin$/i.test(String(v || ''));
            const finishName = looksLikeFinish(r.statusCheckpoint) ? r.statusCheckpoint
                : looksLikeFinish(r.checkpoint) ? r.checkpoint
                : 'FINISH';
            if (!looksLikeFinish(r.latestCheckpoint)) r.latestCheckpoint = finishName;
            if (!looksLikeFinish(r.splitDesc)) r.splitDesc = finishName;
        }

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

        const result = this.successResponse({ data: merged, total: merged.length });
        this._cacheSet(cacheKey, result);
        return result;
    }

    @Get('campaign/getAllStatusByEvent')
    async getAllStatusByEvent(@Query('id') id: string) {
        const eventId = await this.resolveCampaignObjectId(id);
        const cacheKey = `allStatus:${eventId}`;
        const cached = this._cacheGet(cacheKey);
        if (cached) return cached;
        const data = await this.runnersService.getAllStatusByEvent(eventId);
        const result = this.successResponse(data);
        this._cacheSet(cacheKey, result);
        return result;
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
            const [timingRecordsRaw, checkpointRanks] = await Promise.all([
                this.timingService.getRunnerRecords(eventId, runnerId),
                this.timingService.getCheckpointRanksForRunner(eventId, runner.bib),
            ]);

            // Normalize the FINISH timing record against the (authoritative) Runner doc.
            // Admins can edit gunTime/netTime on the Runner doc from /event/[slug],
            // /event/[slug] Manual Status, or /admin/results — runners.service.update()
            // syncs those edits to the FINISH TimingRecord. This layer self-heals any
            // legacy records that pre-date that sync so /runner/[id] (NET/SPLIT/PACE)
            // and the eslip Checkpoint Splits always match the runner doc.
            const runnerForOverride: any = runner as any;
            const timingRecords = timingRecordsRaw.map(rec => {
                const r: any = (rec as any).toObject ? (rec as any).toObject() : { ...(rec as any) };
                if (!/^finish$/i.test(String(r.checkpoint || ''))) return r;
                const docNet = Number(runnerForOverride.netTime) || 0;
                const docGun = Number(runnerForOverride.gunTime) || 0;
                if (docNet > 0) { r.netTime = docNet; r.elapsedTime = docNet; }
                if (docGun > 0) { r.gunTime = docGun; }
                // Recompute split from the previous timing record's net/elapsed.
                if (docNet > 0) {
                    const idx = timingRecordsRaw.indexOf(rec);
                    const prev: any = idx > 0 ? timingRecordsRaw[idx - 1] : null;
                    const prevNet = prev ? Number((prev as any).netTime ?? (prev as any).elapsedTime ?? 0) : 0;
                    r.splitTime = Math.max(0, docNet - prevNet);
                    // Recompute pace strings when distance is known so the row matches the new time.
                    const fmtPace = (ms: number, km: number): string => {
                        if (!(ms > 0) || !(km > 0)) return '';
                        const totalSec = ms / 1000 / km;
                        const m = Math.floor(totalSec / 60);
                        const s = Math.round(totalSec - m * 60);
                        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    };
                    const finishDist = Number(r.distanceFromStart) || 0;
                    const legDist = Number(r.legDistance)
                        || (prev && r.distanceFromStart != null && (prev as any).distanceFromStart != null
                            ? Math.max(0, Number(r.distanceFromStart) - Number((prev as any).distanceFromStart))
                            : 0);
                    r.netPace = fmtPace(docNet, finishDist);
                    r.splitPace = fmtPace(r.splitTime, legDist);
                    if (docGun > 0) r.gunPace = fmtPace(docGun, finishDist);
                }
                return r;
            });

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
                if (catRankMap.has(runnerId)) {
                    const catRank = catRankMap.get(runnerId);
                    // Surface as both fields so /runner/[id] (ageGroupRank) and /eslip (categoryRank)
                    // display the same gender+ageGroup-scoped CAT rank.
                    runnerObj.ageGroupRank = catRank;
                    runnerObj.categoryRank = catRank;
                }

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

            // Strip base64 image fields from event (bannerImage/coverImage/pictureUrl may be
            // huge data URIs). Clients that need them should fetch the dedicated image endpoint.
            const eventLite = event ? (() => {
                const e: any = (event as any).toObject ? (event as any).toObject() : { ...event as any };
                delete e.bannerImage;
                delete e.coverImage;
                delete e.pictureUrl;
                return e;
            })() : null;

            return this.successResponse({
                runner: runnerObj,
                timingRecords,
                checkpointRanks: checkpointRanksObj,
                checkpointMappings,
                event: eventLite,
                campaign: campaign ? {
                    _id: campaign._id,
                    name: campaign.name,
                    nameTh: (campaign as any).nameTh || null,
                    nameEn: (campaign as any).nameEn || null,
                    slug: campaign.slug,
                    eventDate: campaign.eventDate,
                    location: campaign.location,
                    // pictureUrl intentionally omitted — clients should fetch
                    // /public-api/campaigns/:id/image to get the campaign cover.
                    categories: campaign.categories,
                    eslipTemplate: campaign.eslipTemplate || 'template1',
                    eslipTemplates: (campaign as any).eslipTemplates || [],
                    eslipVisibleFields: (campaign as any).eslipVisibleFields || [],
                    eslipMode: (campaign as any).eslipMode || 'v1',
                    eslipV2Layout: (campaign as any).eslipV2Layout || null,
                    displayMode: (campaign as any).displayMode || 'marathon',
                    isApproveCertificate: campaign.isApproveCertificate ?? false,
                    certLayout: (campaign as any).certLayout || null,
                    certBackgroundImage: (campaign as any).certBackgroundImage || null,
                    certPaperSize: (campaign as any).certPaperSize || 'a4-landscape',
                    certBgOpacity: typeof (campaign as any).certBgOpacity === 'number' ? (campaign as any).certBgOpacity : 1,
                    certBgColor: (campaign as any).certBgColor || null,
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
        @Query('lq') lqParam: string,
        @Headers('range') rangeHeader: string,
        @Res() res: Response,
    ) {
        try {
            const { hits } = await this.getRunnerCctvContext(runnerId);
            // Search both the flat `recording` (back-compat) and `recordings[]` (multi-source).
            // The merge logic exposes only the first non-null recording in `recording`, but the
            // requested id may belong to a second source for the same scan.
            let matchedRecording: any = null;
            for (const hit of hits) {
                if (hit?.recording && String(hit.recording._id) === recordingId) {
                    matchedRecording = hit.recording;
                    break;
                }
                if (Array.isArray(hit?.recordings)) {
                    const r = hit.recordings.find((x: any) => String(x?._id || '') === recordingId);
                    if (r) { matchedRecording = r; break; }
                }
            }
            if (!matchedRecording) {
                return res.status(404).json({ error: 'Recording not found for runner' });
            }

            // Enforce admin-controlled download switch — applies only to download requests,
            // streaming/inline playback is always allowed.
            if (download === '1') {
                try {
                    const settings = await this.cctvSettingsService.get();
                    if (settings && (settings as any).allowDownload === false) {
                        return res.status(403).json({ error: 'Downloads are disabled by the event admin' });
                    }
                } catch { /* if settings unavailable, fall through to allow (back-compat) */ }
            }

            // Parse trim parameters
            const ss = Number(ssParam);
            const t = Number(tParam);
            const hasTrim = Number.isFinite(ss) && ss >= 0 && Number.isFinite(t) && t > 0;
            // Low-quality flag: in-page viewing on /runner/[id] passes lq=1 so we transcode
            // to 480p (and skip the upscale for already-smaller sources). Downloads omit lq
            // so the original/720p file is served. Force OFF for downloads regardless.
            const lq = lqParam === '1' && download !== '1';
            const disposition = download === '1' ? 'attachment' : 'inline';

            // Beta recordings (MediaMTX → EC2/S3, no entry in cctvRecordingsService).
            // Per /runner/[id] requirement, we still trim them to clipBufferSeconds — the
            // source we feed into ffmpeg is either the on-disk fmp4 (recording in progress)
            // or the archived S3 URL (https mp4 / HLS — ffmpeg handles both).
            if (matchedRecording.source === 'beta') {
                if (!hasTrim) {
                    // Legacy/back-compat: callers without ss/t just want the raw playback URL.
                    const url = matchedRecording.playbackUrl;
                    if (!url) {
                        return res.status(404).json({ error: 'Beta recording has no playback URL yet' });
                    }
                    return res.redirect(302, url);
                }
                const betaDoc = await this.cctvBetaRecordingsService.findById(recordingId).catch(() => null);
                let inputSource: string | null = null;
                if (betaDoc?.recordingStatus === 'recording') {
                    // Try local .mp4 file first (fmp4/2-min segment mode).
                    const atTime = (matchedRecording as any)?.startTime
                        ? new Date((matchedRecording as any).startTime)
                        : betaDoc.serverIngestStart;
                    inputSource = this.cctvBetaRecordingsService.resolveLiveFilePath({
                        streamKey: betaDoc.streamKey,
                        serverIngestStart: betaDoc.serverIngestStart,
                        atTime,
                    });
                    // MPEGTS mode: no local .mp4 file — fall back to S3 HLS manifest
                    // (set by on-publish hook within ~30s of stream start).
                    if (!inputSource) {
                        inputSource = matchedRecording.playbackUrl || (betaDoc as any)?.s3MasterManifestUrl || null;
                    }
                } else {
                    inputSource = matchedRecording.playbackUrl || (betaDoc as any)?.s3MasterManifestUrl || null;
                }
                if (!inputSource) {
                    return res.status(404).json({ error: 'Beta recording source not available' });
                }
                const cacheDir = this.cctvBetaRecordingsService.betaCacheDir;
                try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
                const cachedPath = path.join(cacheDir, `${recordingId}_ss${ss}_t${t}.mp4`);
                const mp4FileName = `${recordingId}.mp4`;
                if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 0) {
                    return this.serveFileWithRange(res, cachedPath, fs.statSync(cachedPath).size, 'video/mp4', mp4FileName, disposition, rangeHeader);
                }
                // Prefer local file over S3 download for instant playback:
                //   1. Already resolved to local path (in-progress recording via resolveLiveFilePath)
                //   2. Segment still on EC2 disk (cleanup window is 10 min) — derive path from s3Key
                //   3. S3 direct stream — ffmpeg uses HTTP byte-range seeks so no pre-download needed
                if (inputSource && /^https?:\/\//i.test(inputSource) && !/\.m3u8(\?|$)/i.test(inputSource)) {
                    // Try to find the segment file still on local EC2 disk using s3Key.
                    // s3Key format: "hls/live/{streamKey}/YYYY-MM-DD_HH-MM-SS.mp4"
                    const s3Key: string | undefined = (matchedRecording as any)?.s3Key
                        || (betaDoc as any)?.s3Key;
                    if (s3Key) {
                        const localFromS3Key = path.join('/var/cctv/hls', s3Key.replace(/^hls\//, ''));
                        if (fs.existsSync(localFromS3Key)) {
                            inputSource = localFromS3Key;
                        }
                    }
                    // Remote MP4: ffmpeg uses -multiple_requests + -seekable to byte-range seek
                    // directly into S3 without downloading the whole file first. This starts
                    // playback in <1s regardless of source file size.
                }
                return this.streamTrimmedClip(res, {
                    inputSource,
                    ss,
                    t,
                    disposition,
                    mp4FileName,
                    cachedPath,
                });
            }

            const isLive = String(matchedRecording?.recordingStatus || '') === 'recording';

            const { filePath, mimeType, fileName, startTime } = await this.cctvRecordingsService.getFilePath(recordingId);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            // For completed recordings we transcode to mp4 with an optional wall-clock
            // timestamp burned in. Output is cached so the cost is paid once per recording
            // (or per trim variant). Live recordings are streamed raw — the file is still
            // being written.
            if (!isLive) {
                const baseName = fileName.replace(/\.[^.]+$/, '');
                // Cache key differs per trim window. View and download share the same cache
                // since both go through stream-copy and produce identical bytes.
                const cacheKey = hasTrim
                    ? `${baseName}_ss${ss}_t${t}.mp4`
                    : `${baseName}.mp4`;
                const cacheDir = path.dirname(filePath);
                const cachedPath = path.join(cacheDir, cacheKey);
                const mp4FileName = `${baseName}.mp4`;

                const serveCachedMp4 = (cachedFile: string) => {
                    const mp4Stat = fs.statSync(cachedFile);
                    return this.serveFileWithRange(res, cachedFile, mp4Stat.size, 'video/mp4', mp4FileName, disposition, rangeHeader);
                };

                // Serve cached file if it exists
                if (fs.existsSync(cachedPath)) {
                    const mp4Stat = fs.statSync(cachedPath);
                    if (mp4Stat.size > 0) {
                        return serveCachedMp4(cachedPath);
                    }
                }

                // Trimmed clips: stream ffmpeg output as fragmented mp4 so playback starts
                // within ~1s (no waiting for the full transcode). Shared with the beta path.
                if (hasTrim) {
                    return this.streamTrimmedClip(res, {
                        inputSource: filePath,
                        ss,
                        t,
                        disposition,
                        mp4FileName,
                        cachedPath,
                    });
                }

                // No trim: full-file transcode to a cached faststart mp4 (legacy behavior).
                // This path runs when the caller wants the whole recording — typically admin
                // downloads, not the runner page (which always supplies ss/t).
                const startEpochSec = Math.floor(new Date(startTime).getTime() / 1000);
                const drawtextFilter = this.buildTimestampDrawtext(startEpochSec);

                const runFfmpeg = (withDrawtext: boolean) => new Promise<void>((resolve, reject) => {
                    const ffmpegArgs: string[] = ['-y', '-i', filePath];
                    const filters: string[] = [];
                    if (withDrawtext) filters.push(drawtextFilter);
                    if (lq) filters.push(`scale=-2:'min(480,ih)'`);
                    if (filters.length > 0) ffmpegArgs.push('-vf', filters.join(','));
                    ffmpegArgs.push(
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-crf', lq ? '30' : '28',
                        '-c:a', 'aac',
                        '-b:a', '96k',
                        '-movflags', '+faststart',
                        cachedPath,
                    );
                    execFile('ffmpeg', ffmpegArgs, { timeout: 180_000 }, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                try {
                    try {
                        await runFfmpeg(true);
                    } catch {
                        // drawtext can fail on systems missing fontconfig/freetype fonts.
                        // Retry once without the overlay so playback still works.
                        try { if (fs.existsSync(cachedPath)) fs.unlinkSync(cachedPath); } catch {}
                        await runFfmpeg(false);
                    }

                    if (fs.existsSync(cachedPath)) {
                        return serveCachedMp4(cachedPath);
                    }
                } catch {
                    // ffmpeg failed completely – clean up and fall through to serve original
                    try { if (fs.existsSync(cachedPath)) fs.unlinkSync(cachedPath); } catch {}
                }
            }

            // Live (in-progress) recording: stream what is on disk now without Content-Length
            // so the browser does not bail when the file size mismatches. No Range support
            // because the file keeps growing.
            if (isLive) {
                res.setHeader('Content-Type', mimeType || 'video/webm');
                res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
                res.setHeader('Cache-Control', 'no-store');
                fs.createReadStream(filePath).pipe(res);
                return;
            }

            // Completed recording: serve original file with proper Range support so browsers
            // (especially Safari/iOS) can seek and start playback reliably.
            const stat = fs.statSync(filePath);
            return this.serveFileWithRange(res, filePath, stat.size, mimeType || 'video/webm', fileName, disposition, rangeHeader);
        } catch (error: any) {
            return res.status(500).json({ error: error?.message || 'Internal server error' });
        }
    }

    /**
     * Download a remote (https) source to a local path once, so subsequent trim
     * requests for the same recording read from local disk instead of paying the
     * S3 HTTPS round-trip every time.
     *
     * Returns the local path. If the source is already a local path (`/...`) we
     * just return it. For HLS manifests (.m3u8) we skip caching — would need to
     * fetch every segment which defeats the purpose for a single trim.
     *
     * Important: this is the cold-start bottleneck on Beta clips. Once the source
     * is on disk, every viewer of every trim window opens in <1 second.
     */
    private async ensureLocalSource(remoteOrLocal: string, localCachePath: string): Promise<string> {
        if (!/^https?:\/\//i.test(remoteOrLocal)) return remoteOrLocal;
        if (/\.m3u8(\?|$)/i.test(remoteOrLocal)) return remoteOrLocal;
        if (fs.existsSync(localCachePath) && fs.statSync(localCachePath).size > 0) {
            return localCachePath;
        }
        try {
            const dir = path.dirname(localCachePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        } catch {}

        const tmpPath = localCachePath + '.dl';
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        await new Promise<void>((resolve, reject) => {
            const client = remoteOrLocal.startsWith('https') ? https : http;
            const req = client.get(remoteOrLocal, (res) => {
                // Follow one redirect (S3 presigned-> direct often does this).
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    this.ensureLocalSource(res.headers.location, localCachePath).then(() => resolve()).catch(reject);
                    return;
                }
                if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} for ${remoteOrLocal}`));
                }
                const out = fs.createWriteStream(tmpPath);
                res.pipe(out);
                out.on('finish', () => out.close(() => resolve()));
                out.on('error', reject);
                res.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(60_000, () => { req.destroy(new Error('download timeout')); });
        });
        try { fs.renameSync(tmpPath, localCachePath); } catch {}
        return localCachePath;
    }

    /**
     * Stream a trimmed clip via ffmpeg as fragmented mp4 so the browser starts playback
     * within ~1s instead of waiting for the entire transcode. Shared between classic
     * CCTV (local file input) and beta (local fmp4 OR remote https mp4/HLS input).
     *
     * Bytes are teed to a `.partial` cache file; on a clean ffmpeg exit the file is
     * renamed into place so subsequent viewers get a normal cached response instead of
     * paying the transcode cost again.
     *
     * Important behavior: when ffmpeg can't run (binary missing, source unreadable)
     * we return HTTP 500. We do NOT fall back to serving the un-trimmed source —
     * that's what caused the 15-second setting to look like the full 6-min file.
     *
     * Performance: we use `-c copy` (stream copy / remux) instead of re-encoding with
     * libx264 + scale. Trim becomes a near-instant byte-range remux (~0.3-1s cold start
     * vs ~5-15s for a re-encode of the same window) at the cost of giving up the 480p
     * downscale — the user explicitly prioritized "เปิดให้เร็ว" over "ลดคุณภาพ", and
     * a 15s 720p clip is well under 5 MB anyway.
     */
    private streamTrimmedClip(
        res: Response,
        opts: {
            inputSource: string;
            ss: number;
            t: number;
            disposition: 'inline' | 'attachment';
            mp4FileName: string;
            cachedPath: string;
        },
    ) {
        const { inputSource, ss, t, disposition, mp4FileName, cachedPath } = opts;
        const partialPath = cachedPath + '.partial';
        try { if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath); } catch {}
        try {
            const dir = path.dirname(cachedPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        } catch {}

        const isRemote = /^https?:\/\//i.test(inputSource);
        // `-ss` BEFORE `-i` performs an input-side seek (keyframe seek) which is
        // dramatically faster than output-side. For 15-30s clips the <1s drift
        // is not noticeable. Works for both local files and remote HTTP/HLS URLs.
        //
        // `-c copy` skips decoding/re-encoding entirely — ffmpeg just remuxes the
        // existing H.264/AAC streams into a new mp4 container. This is the fastest
        // possible trim and lets us open the clip in under a second.
        // `+genpts +fastseek` regenerates presentation timestamps cleanly from 0
        // and tells ffmpeg to skip the heavy probing pass before seeking.
        // `-probesize 32K -analyzeduration 100000` caps the input-analysis budget
        // — the recordings are vanilla H.264/AAC mp4 so probing is unnecessary.
        const ffmpegArgs: string[] = [
            '-y',
            '-hide_banner',
            '-loglevel', 'error',
            '-fflags', '+genpts+fastseek+nobuffer',
            '-probesize', '32K',
            '-analyzeduration', '100000',
        ];
        if (isRemote) {
            // Let ffmpeg do parallel range fetches against S3 and reuse the same TCP
            // connection across them — both shave hundreds of ms off the cold start.
            ffmpegArgs.push('-multiple_requests', '1', '-seekable', '1');
        }
        ffmpegArgs.push(
            '-ss', String(ss),
            '-i', inputSource,
            '-t', String(t),
            '-c', 'copy',
            '-avoid_negative_ts', 'make_zero',
            // Fragmented mp4 + empty_moov puts the moov atom at the start so the
            // browser doesn't need to seek to the end of the file before playback.
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
            '-f', 'mp4',
            'pipe:1',
        );

        const ff = spawn('ffmpeg', ffmpegArgs);
        const cacheStream = fs.createWriteStream(partialPath);
        let clientAborted = false;
        let spawnFailed = false;

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `${disposition}; filename="${mp4FileName}"`);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Accept-Ranges', 'none');
        // Tell nginx/CloudFront not to buffer the chunked response — without this,
        // upstream proxies wait until they have a "useful" chunk size before
        // forwarding, which can delay first frame by several seconds.
        res.setHeader('X-Accel-Buffering', 'no');
        // Push headers + a TCP packet out immediately so the browser starts the
        // video pipeline (codec init, etc.) without waiting for ffmpeg's first chunk.
        try { res.flushHeaders(); } catch {}
        try { (res as any).socket?.setNoDelay?.(true); } catch {}

        ff.on('error', () => {
            spawnFailed = true;
            try { cacheStream.destroy(); } catch {}
            try { fs.unlinkSync(partialPath); } catch {}
            if (!res.headersSent) {
                res.status(500).json({ error: 'Video transcoder unavailable' });
            } else {
                try { res.end(); } catch {}
            }
        });

        ff.stdout.on('data', (chunk: Buffer) => {
            if (!clientAborted) res.write(chunk);
            if (!cacheStream.destroyed) cacheStream.write(chunk);
        });

        res.on('close', () => {
            if (!res.writableEnded) {
                clientAborted = true;
                try { ff.kill('SIGKILL'); } catch {}
            }
        });

        ff.on('close', (code: number | null) => {
            try { cacheStream.end(); } catch {}
            const success = !spawnFailed && !clientAborted && code === 0;
            cacheStream.on('finish', () => {
                if (success) {
                    try { fs.renameSync(partialPath, cachedPath); } catch {}
                } else {
                    try { fs.unlinkSync(partialPath); } catch {}
                }
            });
            if (!clientAborted) {
                if (!res.headersSent && !success) {
                    res.status(500).json({ error: 'ffmpeg failed' });
                } else {
                    try { res.end(); } catch {}
                }
            }
        });
    }

    /** Build an ffmpeg drawtext filter that renders a wall-clock timestamp top-right.
     *  startEpochSec is the unix-seconds value that should map to pts=0 of the output. */
    private buildTimestampDrawtext(startEpochSec: number): string {
        // %{pts\:localtime\:EPOCH\:FORMAT} prints localtime(EPOCH + pts) in the given strftime fmt.
        // Colons inside the expansion need to be escaped as \: for ffmpeg's filter parser.
        const fmt = '%Y-%m-%d %H\\:%M\\:%S';
        const text = `%{pts\\:localtime\\:${startEpochSec}\\:${fmt}}`;
        return [
            `drawtext=text='${text}'`,
            'fontcolor=white',
            'fontsize=h*0.04',
            'box=1',
            'boxcolor=black@0.55',
            'boxborderw=12',
            'x=w-tw-30',
            'y=20',
        ].join(':');
    }

    private serveFileWithRange(
        res: Response,
        filePath: string,
        fileSize: number,
        contentType: string,
        fileName: string,
        disposition: 'inline' | 'attachment',
        rangeHeader?: string,
    ) {
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);

        const rangeMatch = rangeHeader && /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
        if (rangeMatch) {
            let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : NaN;
            let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : NaN;

            // suffix range: bytes=-N → last N bytes
            if (Number.isNaN(start) && Number.isFinite(end)) {
                start = Math.max(0, fileSize - end);
                end = fileSize - 1;
            } else {
                if (Number.isNaN(start)) start = 0;
                if (Number.isNaN(end) || end >= fileSize) end = fileSize - 1;
            }

            if (start > end || start < 0 || end >= fileSize) {
                res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
                return res.end();
            }

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Content-Length', end - start + 1);
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }

        res.status(200);
        res.setHeader('Content-Length', fileSize);
        fs.createReadStream(filePath).pipe(res);
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

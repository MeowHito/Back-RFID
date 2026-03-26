import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Types } from 'mongoose';
import { RunnersService } from './runners.service';
import type { RunnerFilter, PagingData } from './runners.service';
import { CreateRunnerDto } from './dto/create-runner.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';

@Controller('runners')
export class RunnersController {
    constructor(private readonly runnersService: RunnersService) { }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    create(@Body() createRunnerDto: CreateRunnerDto) {
        return this.runnersService.create(createRunnerDto);
    }

    @Post('bulk')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    createMany(@Body() runners: CreateRunnerDto[], @Query('updateExisting') updateExisting?: string) {
        return this.runnersService.createMany(runners, updateExisting === 'true');
    }

    @Get()
    findByEvent(@Query() filter: RunnerFilter) {
        return this.runnersService.findByEvent(filter);
    }

    @Get('counts')
    getCounts(@Query('campaignId') campaignId: string) {
        return this.runnersService.countByEventGrouped(campaignId);
    }

    @Get('paged')
    findByEventWithPaging(
        @Query('eventId') eventId: string,
        @Query('campaignId') campaignId: string,
        @Query('category') category: string,
        @Query('gender') gender: string,
        @Query('ageGroup') ageGroup: string,
        @Query('status') status: string,
        @Query('chipStatus') chipStatus: string,
        @Query('runnerStatus') runnerStatus: string,
        @Query('sortBy') sortBy: string,
        @Query('sortOrder') sortOrder: string,
        @Query('search') search: string,
        @Query('page') page: number,
        @Query('limit') limit: number,
        @Query('skipStatusCounts') skipStatusCounts: string,
    ) {
        const filter: RunnerFilter = { eventId, campaignId, category, gender, ageGroup, status, chipStatus, runnerStatus, sortBy, sortOrder, search };
        const paging: PagingData = { page: page || 1, limit: limit || 50, search };
        return this.runnersService.findByEventWithPaging(filter, paging, skipStatusCounts === 'true');
    }

    @Delete('bulk')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'delete')
    deleteMany(@Body() body: { ids: string[] }) {
        return this.runnersService.deleteMany(body.ids || []);
    }

    @Get('statistics/:eventId')
    async getStatistics(@Param('eventId') eventId: string) {
        const [status, starters, withdrawals, finishTimes] = await Promise.all([
            this.runnersService.getAllStatusByEvent(eventId),
            this.runnersService.getStartersByAge(eventId),
            this.runnersService.getWithdrawalByAge(eventId),
            this.runnersService.getFinishByTime(eventId),
        ]);
        return { status, starters, withdrawals, finishTimes };
    }

    @Get('status/:eventId')
    getAllStatusByEvent(@Param('eventId') eventId: string) {
        return this.runnersService.getAllStatusByEvent(eventId);
    }

    @Get('starters-by-age/:eventId')
    getStartersByAge(@Param('eventId') eventId: string) {
        return this.runnersService.getStartersByAge(eventId);
    }

    @Get('finish-by-time/:eventId')
    getFinishByTime(@Param('eventId') eventId: string) {
        return this.runnersService.getFinishByTime(eventId);
    }

    @Get('by-checkpoint/:eventId/:checkpoint')
    getLatestParticipantByCheckpoint(
        @Param('eventId') eventId: string,
        @Param('checkpoint') checkpoint: string,
        @Query('gender') gender: string,
        @Query('ageGroup') ageGroup: string,
    ) {
        return this.runnersService.getLatestParticipantByCheckpoint(eventId, checkpoint, gender, ageGroup);
    }

    @Get('lookup')
    async lookupByCode(
        @Query('campaignId') campaignId: string,
        @Query('code') code: string,
    ) {
        if (!code) {
            return { found: false, runner: null };
        }
        const runner = await this.runnersService.findByAnyCodeGlobal(code.trim());
        return { found: !!runner, runner };
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.runnersService.findOne(id);
    }

    @Get('bib/:eventId/:bib')
    findByBib(@Param('eventId') eventId: string, @Param('bib') bib: string) {
        return this.runnersService.findByBib(eventId, bib);
    }

    @Get('chip/:eventId/:chipCode')
    findByChipCode(@Param('eventId') eventId: string, @Param('chipCode') chipCode: string) {
        return this.runnersService.findByChipCode(eventId, chipCode);
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    update(@Param('id') id: string, @Body() updateData: any) {
        return this.runnersService.update(id, updateData);
    }

    @Put(':id/status')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    updateStatus(
        @Param('id') id: string,
        @Body() body: { status: string; statusCheckpoint?: string; statusNote?: string; changedBy?: string },
    ) {
        return this.runnersService.updateStatus(id, body);
    }

    @Put(':id/photo')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    updatePhoto(@Param('id') id: string, @Body() body: any) {
        return this.runnersService.updatePhoto(id, body.photo);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'delete')
    delete(@Param('id') id: string) {
        return this.runnersService.delete(id);
    }

    @Delete('event/:eventId')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'delete')
    deleteByEvent(@Param('eventId') eventId: string) {
        return this.runnersService.deleteByEvent(eventId);
    }

    // Public registration endpoint (no auth required)
    @Post('public/register')
    async publicRegister(@Body() registrationData: CreateRunnerDto) {
        // Auto-generate BIB if not provided (use count, no full list load)
        if (!registrationData.bib) {
            const count = await this.runnersService.countByEvent(registrationData.eventId);
            registrationData.bib = `REG${(count + 1).toString().padStart(4, '0')}`;
        }
        // Set register date
        registrationData.registerDate = new Date();
        return this.runnersService.create(registrationData);
    }

    // Get registration count for an event (public) – uses countDocuments, not full list
    @Get('public/count/:eventId')
    async getRegistrationCount(@Param('eventId') eventId: string) {
        const count = await this.runnersService.countByEvent(eventId);
        return { count };
    }
}

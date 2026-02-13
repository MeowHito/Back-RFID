import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RunnersService } from './runners.service';
import type { RunnerFilter, PagingData } from './runners.service';
import { CreateRunnerDto } from './dto/create-runner.dto';

@Controller('runners')
// TODO: Re-enable auth guards once admin login flow is implemented
// @UseGuards(AuthGuard('jwt'))
export class RunnersController {
    constructor(private readonly runnersService: RunnersService) { }

    @Post()
    create(@Body() createRunnerDto: CreateRunnerDto) {
        return this.runnersService.create(createRunnerDto);
    }

    @Post('bulk')
    createMany(@Body() runners: CreateRunnerDto[], @Query('updateExisting') updateExisting?: string) {
        return this.runnersService.createMany(runners, updateExisting === 'true');
    }

    @Get()
    findByEvent(@Query() filter: RunnerFilter) {
        return this.runnersService.findByEvent(filter);
    }

    @Get('paged')
    findByEventWithPaging(
        @Query('eventId') eventId: string,
        @Query('category') category: string,
        @Query('gender') gender: string,
        @Query('ageGroup') ageGroup: string,
        @Query('status') status: string,
        @Query('chipStatus') chipStatus: string,
        @Query('search') search: string,
        @Query('page') page: number,
        @Query('limit') limit: number,
    ) {
        const filter: RunnerFilter = { eventId, category, gender, ageGroup, status, chipStatus, search };
        const paging: PagingData = { page: page || 1, limit: limit || 50, search };
        return this.runnersService.findByEventWithPaging(filter, paging);
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
    update(@Param('id') id: string, @Body() updateData: any) {
        return this.runnersService.update(id, updateData);
    }

    @Put(':id/status')
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.runnersService.updateStatus(id, status);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.runnersService.delete(id);
    }

    @Delete('event/:eventId')
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

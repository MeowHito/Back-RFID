import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './events.service';
import type { EventFilter } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('events')
export class EventsController {
    constructor(private readonly eventsService: EventsService) { }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    create(@Body() createEventDto: CreateEventDto) {
        return this.eventsService.create(createEventDto);
    }

    @Get()
    findAll() {
        return this.eventsService.findAll();
    }

    @Get('by-campaign/:campaignId')
    findByCampaign(@Param('campaignId') campaignId: string) {
        return this.eventsService.findByCampaign(campaignId);
    }

    @Get('filter')
    findByFilter(@Query() filter: EventFilter) {
        return this.eventsService.findByFilter(filter);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.eventsService.findOne(id);
    }

    @Get('uuid/:uuid')
    findByUuid(@Param('uuid') uuid: string) {
        return this.eventsService.findByUuid(uuid);
    }

    @Get('share/:token')
    findByShareToken(@Param('token') token: string) {
        return this.eventsService.findByShareToken(token);
    }

    @Get(':id/detail')
    getDetail(@Param('id') id: string) {
        return this.eventsService.getEventDetailById(id);
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    update(@Param('id') id: string, @Body() updateEventDto: Partial<CreateEventDto>) {
        return this.eventsService.update(id, updateEventDto);
    }

    @Put(':id/status')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.eventsService.updateStatus(id, status);
    }

    @Put(':id/active')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateActive(@Param('id') id: string, @Body('active') active: boolean) {
        return this.eventsService.updateActive(id, active);
    }

    @Put(':id/autofix')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateAutoFix(@Param('id') id: string, @Body('isAutoFix') isAutoFix: boolean) {
        return this.eventsService.updateAutoFix(id, isAutoFix);
    }

    @Put(':id/finished')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateFinished(@Param('id') id: string, @Body('isFinished') isFinished: boolean) {
        return this.eventsService.updateFinished(id, isFinished);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    delete(@Param('id') id: string) {
        return this.eventsService.delete(id);
    }

    // Public endpoints (no auth required)
    @Get('public/upcoming')
    async getUpcomingEvents() {
        const events = await this.eventsService.findByFilter({ status: 'upcoming' });
        return events;
    }

    @Get('public/active')
    async getActiveEvents() {
        const allEvents = await this.eventsService.findAll();
        // Return events that are upcoming or live
        return allEvents.filter(e => e.status === 'upcoming' || e.status === 'live');
    }

    @Get('public/:id')
    getPublicEventDetail(@Param('id') id: string) {
        return this.eventsService.getEventDetailById(id);
    }
}

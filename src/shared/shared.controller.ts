import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { RunnersService } from '../runners/runners.service';
import { TimingService } from '../timing/timing.service';

@Controller('shared')
export class SharedController {
    constructor(
        private readonly eventsService: EventsService,
        private readonly runnersService: RunnersService,
        private readonly timingService: TimingService,
    ) { }

    @Get('results')
    async getSharedResults(
        @Query('token') token?: string,
        @Query('eventId') eventId?: string,
        @Query('category') category?: string,
        @Query('gender') gender?: string,
        @Query('ageGroup') ageGroup?: string,
        @Query('box') box?: string,
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('checkpoint') checkpoint?: string,
        
    ) {
        let event;

        if (token) {
            // Find by share token
            event = await this.eventsService.findByShareToken(token);
        } else if (eventId) {
            // Find by event ID
            event = await this.eventsService.findOne(eventId);
        } else {
            throw new NotFoundException('Token or eventId is required');
        }

        if (!event) {
            throw new NotFoundException('Event not found');
        }

        const runners = await this.runnersService.findByEvent({
            eventId: (event as any)._id.toString(),
            category,
            gender,
            ageGroup,
            box,
            status,
            search,
            checkpoint,
        });

        return {
            event: {
                _id: (event as any)._id,
                name: event.name,
                date: event.date,
                status: event.status,
                location: event.location,
                categories: event.categories,
                checkpoints: event.checkpoints,
                startTime: event.startTime,
            },
            runners,
            totalRunners: runners.length,
        };
    }

    @Get('runner')
    async getSharedRunnerDetails(
        @Query('token') token: string,
        @Query('runnerId') runnerId: string,
    ) {
        if (!token || !runnerId) {
            throw new NotFoundException('Token and runnerId are required');
        }

        const event = await this.eventsService.findByShareToken(token);
        if (!event) {
            throw new NotFoundException('Event not found');
        }

        const runner = await this.runnersService.findOne(runnerId);
        const timingRecords = await this.timingService.getRunnerRecords(
            (event as any)._id.toString(),
            runnerId,
        );

        return {
            runner,
            timingRecords,
        };
    }
}

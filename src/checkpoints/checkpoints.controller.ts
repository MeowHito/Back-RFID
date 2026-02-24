import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CheckpointsService } from './checkpoints.service';
import { CheckpointSchedulerService } from './checkpoint-scheduler.service';
import { CreateCheckpointDto, CreateCheckpointMappingDto } from './dto/create-checkpoint.dto';

@Controller('checkpoints')
export class CheckpointsController {
    constructor(
        private readonly checkpointsService: CheckpointsService,
        private readonly schedulerService: CheckpointSchedulerService,
    ) { }

    @Post('cutoff/check')
    triggerCutOffCheck() {
        return this.schedulerService.triggerCutOffCheck();
    }

    @Post()
    create(@Body() createDto: CreateCheckpointDto) {
        return this.checkpointsService.create(createDto);
    }

    @Post('bulk')
    createMany(@Body() checkpoints: CreateCheckpointDto[]) {
        return this.checkpointsService.createMany(checkpoints);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.checkpointsService.findById(id);
    }

    @Get('uuid/:uuid')
    findByUuid(@Param('uuid') uuid: string) {
        return this.checkpointsService.findByUuid(uuid);
    }

    @Get('campaign/:campaignId')
    findByCampaign(@Param('campaignId') campaignId: string) {
        return this.checkpointsService.findByCampaign(campaignId);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() updateData: Partial<CreateCheckpointDto>) {
        return this.checkpointsService.update(id, updateData);
    }

    @Put('bulk/update')
    updateMany(@Body() checkpoints: Array<{ id: string } & Partial<CreateCheckpointDto>>) {
        return this.checkpointsService.updateMany(checkpoints);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.checkpointsService.delete(id);
    }

    // Mapping endpoints
    @Post('mapping')
    createMapping(@Body() createDto: CreateCheckpointMappingDto) {
        return this.checkpointsService.createMapping(createDto);
    }

    @Post('mapping/bulk')
    createManyMappings(@Body() mappings: CreateCheckpointMappingDto[]) {
        return this.checkpointsService.createManyMappings(mappings);
    }

    @Get('mapping/event/:eventId')
    findMappingsByEvent(@Param('eventId') eventId: string) {
        return this.checkpointsService.findMappingsByEvent(eventId);
    }

    @Get('mapping/:campaignId/:eventId')
    findMappingsByCampaignAndEvent(
        @Param('campaignId') campaignId: string,
        @Param('eventId') eventId: string,
    ) {
        return this.checkpointsService.findMappingsByCampaignAndEvent(campaignId, eventId);
    }

    @Put('mapping/bulk')
    updateMappings(
        @Body() mappings: Array<{ checkpointId: string; eventId: string } & Partial<CreateCheckpointMappingDto>>
    ) {
        return this.checkpointsService.updateMappings(mappings);
    }
}

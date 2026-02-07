import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import type { PagingData, CampaignFilter } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Controller('campaigns')
export class CampaignsController {
    constructor(private readonly campaignsService: CampaignsService) { }

    @Post()
    create(@Body() createCampaignDto: CreateCampaignDto) {
        return this.campaignsService.create(createCampaignDto);
    }

    @Get()
    findAll(@Query() paging: PagingData) {
        return this.campaignsService.findAll(paging);
    }

    @Get('by-date')
    findByDate(
        @Query('type') type: string,
        @Query('status') status: string,
        @Query('page') page: number,
        @Query('limit') limit: number,
        @Query('search') search: string,
    ) {
        const filter: CampaignFilter = { type, status };
        const paging: PagingData = { page: page || 1, limit: limit || 20, search };
        return this.campaignsService.findByDate(filter, paging);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.campaignsService.findById(id);
    }

    @Get('uuid/:uuid')
    findByUuid(@Param('uuid') uuid: string) {
        return this.campaignsService.findByUuid(uuid);
    }

    @Get(':id/detail')
    getDetail(@Param('id') id: string) {
        return this.campaignsService.getDetailById(id);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() updateData: Partial<CreateCampaignDto>) {
        return this.campaignsService.update(id, updateData);
    }

    @Put(':id/status')
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.campaignsService.updateStatus(id, status);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.campaignsService.delete(id);
    }
}

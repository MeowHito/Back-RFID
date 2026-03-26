import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CampaignsService } from './campaigns.service';
import type { PagingData, CampaignFilter } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('campaigns')
export class CampaignsController {
    constructor(private readonly campaignsService: CampaignsService) { }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
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

    @Get('featured')
    getFeatured() {
        return this.campaignsService.findFeatured();
    }

    @Put(':id/featured')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    setFeatured(@Param('id') id: string, @Body('value') value: boolean) {
        if (value) {
            return this.campaignsService.setFeatured(id);
        }
        return this.campaignsService.unsetFeatured(id);
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
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    update(@Param('id') id: string, @Body() updateData: Partial<CreateCampaignDto>) {
        return this.campaignsService.update(id, updateData);
    }

    @Put(':id/status')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateStatus(@Param('id') id: string, @Body('status') status: string) {
        return this.campaignsService.updateStatus(id, status);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    delete(@Param('id') id: string) {
        return this.campaignsService.delete(id);
    }
}

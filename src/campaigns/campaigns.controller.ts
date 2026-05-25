import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CampaignsService } from './campaigns.service';
import type { PagingData, CampaignFilter } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

// Fields holding base64 data URIs that bloat responses (100KB–1MB each).
// Stripped by default on GET single/featured; opt back in with ?full=true.
const HEAVY_CAMPAIGN_FIELDS = [
    'pictureUrl',
    'scanningBgImage',
    'eslipCustomHtml',
    'eslipV2Layout',
    'certBackgroundImage',
    'chipBanner',
    'chipBgUrl',
] as const;

function stripHeavyCampaignFields(campaign: any): any {
    if (!campaign) return campaign;
    const c = (campaign as any).toObject ? (campaign as any).toObject() : { ...campaign };
    for (const f of HEAVY_CAMPAIGN_FIELDS) delete c[f];
    return c;
}

function isFull(full?: string): boolean {
    return full === 'true' || full === '1';
}

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
    async getFeatured(@Query('full') full?: string) {
        const campaign = await this.campaignsService.findFeatured();
        return isFull(full) ? campaign : stripHeavyCampaignFields(campaign);
    }

    @Get('cert-templates')
    async listCertTemplates() {
        return this.campaignsService.findCertTemplates();
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
    async findOne(@Param('id') id: string, @Query('full') full?: string) {
        const campaign = await this.campaignsService.findById(id);
        return isFull(full) ? campaign : stripHeavyCampaignFields(campaign);
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

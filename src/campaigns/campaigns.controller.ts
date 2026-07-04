import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CampaignsService } from './campaigns.service';
import type { PagingData, CampaignFilter } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
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
    @UseGuards(OptionalJwtAuthGuard)
    async getFeatured(@Req() req: Request, @Query('full') full?: string) {
        // Authenticated users get their own selected campaign; anonymous requests
        // (public shortcut pages) get the global featured campaign.
        const userUuid = (req.user as { sub?: string } | undefined)?.sub;
        const campaign = await this.campaignsService.findFeaturedForUser(userUuid);
        return isFull(full) ? campaign : stripHeavyCampaignFields(campaign);
    }

    @Get('cert-templates')
    async listCertTemplates() {
        return this.campaignsService.findCertTemplates();
    }

    @Put(':id/featured')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    async setFeatured(@Req() req: Request, @Param('id') id: string, @Body('value') value: boolean) {
        // Per-user selection: starring an event only changes THIS admin's current
        // work, never the global featured campaign or any other account's view.
        const userUuid = (req.user as { sub?: string } | undefined)?.sub;
        if (!userUuid) {
            return { success: false };
        }
        await this.campaignsService.setUserSelectedCampaign(userUuid, value ? id : null);
        return { success: true, selectedCampaignId: value ? id : '' };
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

import { Controller, Get, Post, Delete, Body, Query, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApplicantsService, ApplicantInput } from './applicants.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';

@Controller('applicants')
export class ApplicantsController {
    constructor(
        private readonly applicantsService: ApplicantsService,
        private readonly campaignsService: CampaignsService,
    ) { }

    // ─── Admin endpoints (auth) ──────────────────────────────────

    @Post('bulk')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'create')
    async bulkImport(
        @Body() body: { campaignId: string; rows: ApplicantInput[]; mode?: 'replace' | 'append' },
    ) {
        if (!body?.campaignId) throw new BadRequestException('campaignId is required');
        return this.applicantsService.bulkImport(body.campaignId, body.rows || [], body.mode || 'replace');
    }

    @Get()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'view')
    async list(@Query('campaignId') campaignId: string, @Query('limit') limit?: string) {
        if (!campaignId) throw new BadRequestException('campaignId is required');
        const [data, total] = await Promise.all([
            this.applicantsService.findByCampaign(campaignId, limit ? Number(limit) : 0),
            this.applicantsService.countByCampaign(campaignId),
        ]);
        return { data, total };
    }

    @Delete()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('participants', 'delete')
    async clear(@Query('campaignId') campaignId: string) {
        if (!campaignId) throw new BadRequestException('campaignId is required');
        return this.applicantsService.clearCampaign(campaignId);
    }

    // ─── Public search (no auth) — resolves slug/uuid/id ─────────

    @Get('search')
    async search(@Query('campaign') campaign: string, @Query('q') q: string) {
        if (!campaign) throw new BadRequestException('campaign is required');
        const found = await this.campaignsService.findById(campaign);
        if (!found) throw new NotFoundException('Campaign not found');
        const campaignId = (found as { _id: unknown })._id?.toString();
        const results = await this.applicantsService.search(campaignId!, q || '');
        return {
            campaign: {
                _id: campaignId,
                name: found.name,
                nameTh: (found as { nameTh?: string }).nameTh,
                nameEn: (found as { nameEn?: string }).nameEn,
                slug: (found as { slug?: string }).slug,
            },
            results,
            total: results.length,
        };
    }
}

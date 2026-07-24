import { Controller, Get, Post, Put, Delete, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RoutesService } from './routes.service';
import { UpsertRouteDto, UpdateMarksDto } from './dto/upsert-route.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('routes')
export class RoutesController {
    constructor(private readonly routesService: RoutesService) { }

    /** GET /routes?campaignId=...&meta=true */
    @Get()
    findByCampaign(
        @Query('campaignId') campaignId: string,
        @Query('meta') meta?: string,
    ) {
        if (!campaignId) throw new BadRequestException('campaignId is required');
        return this.routesService.findByCampaign(campaignId, meta === 'true' || meta === '1');
    }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    upsert(@Body() dto: UpsertRouteDto) {
        return this.routesService.upsert(dto);
    }

    @Put('marks')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateMarks(@Body() dto: UpdateMarksDto) {
        return this.routesService.updateMarks(dto);
    }

    /** DELETE /routes?campaignId=...&category=... */
    @Delete()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    remove(
        @Query('campaignId') campaignId: string,
        @Query('category') category: string,
    ) {
        if (!campaignId || !category) {
            throw new BadRequestException('campaignId and category are required');
        }
        return this.routesService.remove(campaignId, category);
    }
}

import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CctvBetaCamerasService } from './cctv-beta-cameras.service';
import { CreateCctvBetaCameraDto, UpdateCctvBetaCameraDto } from './dto/create-cctv-beta-camera.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('cctv-beta/cameras')
export class CctvBetaCamerasController {
    constructor(private readonly camerasService: CctvBetaCamerasService) {}

    @Get()
    findAll(@Query('campaignId') campaignId?: string) {
        return campaignId
            ? this.camerasService.findByCampaign(campaignId)
            : this.camerasService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.camerasService.findById(id);
    }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    create(@Body() dto: CreateCctvBetaCameraDto) {
        return this.camerasService.create(dto);
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    update(@Param('id') id: string, @Body() dto: UpdateCctvBetaCameraDto) {
        return this.camerasService.update(id, dto);
    }

    @Patch(':id/rotate-key')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    rotateKey(@Param('id') id: string) {
        return this.camerasService.rotateStreamKey(id);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    remove(@Param('id') id: string) {
        return this.camerasService.remove(id);
    }
}

import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CctvCamerasService } from './cctv-cameras.service';
import { CreateCctvCameraDto } from './dto/create-cctv-camera.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('cctv-cameras')
export class CctvCamerasController {
    constructor(private readonly camerasService: CctvCamerasService) {}

    @Get()
    findAll() {
        return this.camerasService.findAll();
    }

    @Get('stats')
    getStats() {
        return this.camerasService.getStats();
    }

    @Get('stats/:campaignId')
    getStatsByCampaign(@Param('campaignId') campaignId: string) {
        return this.camerasService.getStats(campaignId);
    }

    @Get('campaign/:campaignId')
    findByCampaign(@Param('campaignId') campaignId: string) {
        return this.camerasService.findByCampaign(campaignId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.camerasService.findById(id);
    }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    create(@Body() dto: CreateCctvCameraDto) {
        return this.camerasService.create(dto);
    }

    @Post('register')
    publicRegister(@Body() dto: CreateCctvCameraDto) {
        return this.camerasService.create(dto);
    }

    @Put('register/:id')
    publicRegisterUpdate(
        @Param('id') id: string,
        @Body() updateData: Partial<CreateCctvCameraDto>,
    ) {
        return this.camerasService.update(id, updateData);
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    update(
        @Param('id') id: string,
        @Body() updateData: Partial<CreateCctvCameraDto>,
    ) {
        return this.camerasService.update(id, updateData);
    }

    @Put(':id/status')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    updateStatus(
        @Param('id') id: string,
        @Body() body: { status: string },
    ) {
        return this.camerasService.updateStatus(id, body.status);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    delete(@Param('id') id: string) {
        return this.camerasService.delete(id);
    }
}

import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';
import { CctvSettingsService } from './cctv-settings.service';

@Controller('cctv-settings')
export class CctvSettingsController {
    constructor(private readonly service: CctvSettingsService) {}

    @Get()
    get() {
        return this.service.get();
    }

    @Put()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    update(@Body() body: Record<string, unknown>) {
        return this.service.update(body as any);
    }
}

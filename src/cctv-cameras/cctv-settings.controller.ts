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
        const patch: Record<string, unknown> = { ...body };
        // Pre-scan buffer is restricted to a fixed set so the UI button list stays canonical.
        if (patch.clipPreBufferSeconds !== undefined) {
            const allowed = [5, 10, 15, 20];
            const n = Math.floor(Number(patch.clipPreBufferSeconds));
            patch.clipPreBufferSeconds = allowed.includes(n) ? n : 5;
        }
        return this.service.update(patch as any);
    }
}

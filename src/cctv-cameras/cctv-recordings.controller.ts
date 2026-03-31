import {
    Controller, Get, Delete, Post, Param, Query, Res, UseGuards, HttpCode, Body,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { CctvRecordingsService } from './cctv-recordings.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('cctv-recordings')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@AdminOnly()
export class CctvRecordingsController {
    constructor(private readonly service: CctvRecordingsService) {}

    @Get()
    findAll(@Query('campaignId') campaignId?: string) {
        return this.service.findAll(campaignId);
    }

    @Get('storage')
    storageInfo(@Query('campaignId') campaignId?: string) {
        return this.service.getStorageInfo(campaignId);
    }

    @Get('runner-lookup')
    runnerLookup(@Query('bib') bib: string, @Query('campaignId') campaignId: string) {
        if (!bib || !campaignId) return [];
        return this.service.runnerLookup(bib, campaignId);
    }

    @Get(':id/stream')
    async streamVideo(@Param('id') id: string, @Res() res: Response) {
        const { filePath, mimeType, fileName } = await this.service.getFilePath(id);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs.statSync(filePath);
        res.setHeader('Content-Type', mimeType || 'video/webm');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Accept-Ranges', 'bytes');
        fs.createReadStream(filePath).pipe(res);
    }

    @Post('clip')
    @UseGuards()
    @HttpCode(201)
    saveClip(@Body() body: {
        videoBase64: string;
        mimeType: string;
        cameraId: string;
        cameraName: string;
        campaignId?: string;
        checkpointName?: string;
        location?: string;
        deviceId?: string;
        durationSeconds?: number;
    }) {
        return this.service.saveClip(body);
    }

    @Delete('all')
    @HttpCode(200)
    deleteAll() {
        return this.service.deleteAll();
    }

    @Delete(':id')
    @HttpCode(200)
    async deleteOne(@Param('id') id: string) {
        await this.service.deleteOne(id);
        return { success: true };
    }
}

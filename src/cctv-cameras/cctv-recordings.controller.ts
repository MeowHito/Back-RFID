import {
    Controller, Get, Delete, Post, Param, Query, Req, Res, UseGuards, HttpCode, Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
    async streamVideo(
        @Param('id') id: string,
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const { filePath, mimeType, fileName, duration } = await this.service.getFilePath(id);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        // Support HTTP Range requests for video seeking
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunkSize);
            res.setHeader('Content-Type', mimeType || 'video/webm');
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            if (duration && duration > 0) {
                res.setHeader('X-Content-Duration', String(duration));
            }

            const stream = fs.createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.setHeader('Content-Type', mimeType || 'video/webm');
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            res.setHeader('Accept-Ranges', 'bytes');
            if (duration && duration > 0) {
                res.setHeader('X-Content-Duration', String(duration));
            }

            fs.createReadStream(filePath).pipe(res);
        }
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

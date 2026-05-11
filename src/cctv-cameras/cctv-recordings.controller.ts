import {
    Controller, Get, Delete, Post, Param, Query, Req, Res, UseGuards, HttpCode, Body,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { CctvRecordingsService } from './cctv-recordings.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

@Controller('cctv-recordings')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@AdminOnly()
export class CctvRecordingsController {
    // Track which destination MP4s are currently being transcoded so we don't
    // spawn duplicate ffmpeg jobs when multiple plays of the same recording
    // overlap.
    private static transcodingNow = new Set<string>();

    constructor(private readonly service: CctvRecordingsService) {}

    private startBackgroundTranscode(srcPath: string, dstPath: string) {
        if (CctvRecordingsController.transcodingNow.has(dstPath)) return;
        if (!fs.existsSync(srcPath)) return;
        CctvRecordingsController.transcodingNow.add(dstPath);
        execFile('ffmpeg', [
            '-y',
            '-i', srcPath,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-movflags', '+faststart',
            dstPath,
        ], { timeout: 30 * 60_000 }, (err) => {
            CctvRecordingsController.transcodingNow.delete(dstPath);
            if (err) {
                try { if (fs.existsSync(dstPath)) fs.unlinkSync(dstPath); } catch {}
            }
        });
    }

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
        const { filePath, mimeType, fileName, duration, recordingStatus } = await this.service.getFilePath(id);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        const range = req.headers.range;
        const isLive = recordingStatus === 'recording';

        if (!isLive) {
            const baseName = fileName.replace(/\.[^.]+$/, '');
            const cacheDir = path.dirname(filePath);
            const cachedPath = path.join(cacheDir, `${baseName}.mp4`);
            const mp4FileName = `${baseName}.mp4`;

            // If MP4 cache exists, serve it (fast, seekable).
            if (fs.existsSync(cachedPath) && fs.statSync(cachedPath).size > 0) {
                const mp4Stat = fs.statSync(cachedPath);
                return this.serveFileWithRange(res, cachedPath, mp4Stat.size, 'video/mp4', mp4FileName, range, duration);
            }

            // No cache yet: kick off ffmpeg in the background and serve raw
            // webm immediately. Blocking the response on ffmpeg for a 12h file
            // takes far longer than any browser will wait — this trades a
            // first-play "no seek index" cost for an instant response, and
            // the next play picks up the cached MP4.
            this.startBackgroundTranscode(filePath, cachedPath);
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;

        if (isLive) {
            res.setHeader('Content-Type', mimeType || 'video/webm');
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            res.setHeader('Cache-Control', 'no-store');
            fs.createReadStream(filePath).pipe(res);
            return;
        }

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

    private serveFileWithRange(
        res: Response,
        filePath: string,
        fileSize: number,
        mimeType: string,
        fileName: string,
        range?: string,
        duration?: number,
    ) {
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = Math.max(0, parseInt(parts[0], 10) || 0);
            const end = parts[1] ? Math.min(fileSize - 1, parseInt(parts[1], 10)) : fileSize - 1;
            const chunkSize = end - start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunkSize);
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
            res.setHeader('Cache-Control', 'no-store');
            if (duration && duration > 0) res.setHeader('X-Content-Duration', String(duration));
            fs.createReadStream(filePath, { start, end }).pipe(res);
            return;
        }
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        if (duration && duration > 0) res.setHeader('X-Content-Duration', String(duration));
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

import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    Headers,
    Res,
    NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { CctvBetaRecordingsService } from './cctv-beta-recordings.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

// Where MediaMTX writes its on-disk fmp4 recordings (volume-mounted into the container at
// /recordings, exposed on the host at /var/cctv/hls). Override via env if your deployment
// uses a different path.
const BETA_RECORDINGS_DIR = process.env.CCTV_BETA_RECORDINGS_DIR || '/var/cctv/hls';

@Controller('cctv-beta/recordings')
export class CctvBetaRecordingsController {
    constructor(private readonly recordingsService: CctvBetaRecordingsService) {}

    @Get()
    findAll(
        @Query('campaignId') campaignId?: string,
        @Query('cameraId') cameraId?: string,
    ) {
        return this.recordingsService.findAll({ campaignId, cameraId });
    }

    @Get('storage')
    storage(@Query('campaignId') campaignId?: string) {
        return this.recordingsService.getStorageInfo(campaignId);
    }

    @Get('runner-lookup')
    runnerLookup(@Query('bib') bib: string, @Query('campaignId') campaignId: string) {
        return this.recordingsService.runnerLookup(bib, campaignId);
    }

    @Get('by-time')
    findByTime(@Query('campaignId') campaignId: string, @Query('at') at: string) {
        return this.recordingsService.findByTime({ campaignId, at: new Date(at) });
    }

    @Post('bulk-delete')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    bulkDelete(@Body() body: { ids?: string[]; campaignId?: string }) {
        return this.recordingsService.deleteMany(body);
    }

    @Get('runner-window')
    runnerWindow(
        @Query('campaignId') campaignId: string,
        @Query('checkpointName') checkpointName: string,
        @Query('from') from: string,
        @Query('to') to: string,
    ) {
        return this.recordingsService.findForRunnerWindow({
            campaignId,
            checkpointName,
            from: new Date(from),
            to: new Date(to),
        });
    }

    /**
     * Serve the on-disk fmp4 recording file with HTTP Range support.
     *
     * Used by /runner/:id when the beta clip is still being recorded — MediaMTX's LL-HLS
     * manifest only retains a few seconds of past segments, but the parallel disk
     * recording (recordPath in mediamtx.yml) is the full timeline from publish start.
     * Streaming it directly lets the browser seek to the scan moment even while the file
     * is still growing.
     *
     * File layout: {BETA_RECORDINGS_DIR}/live/{streamKey}/{YYYY-MM-DD_HH-MM-SS}.mp4
     * The filename's timestamp matches the recording's `serverIngestStart` in UTC.
     */
    @Get(':id/file')
    async streamFile(
        @Param('id') id: string,
        @Headers('range') rangeHeader: string,
        @Res() res: Response,
    ) {
        const rec = await this.recordingsService.findById(id);
        if (!rec?.streamKey || !rec?.serverIngestStart) {
            return res.status(404).json({ error: 'Recording not found' });
        }

        // Derive the expected filename from serverIngestStart (UTC, MediaMTX rounds to seconds).
        const start = new Date(rec.serverIngestStart);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fname = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}_${pad(start.getUTCHours())}-${pad(start.getUTCMinutes())}-${pad(start.getUTCSeconds())}.mp4`;
        const recDir = path.join(BETA_RECORDINGS_DIR, 'live', rec.streamKey);
        let filePath = path.join(recDir, fname);

        // Fall back to the closest file in the same directory if the exact timestamp drifts
        // by a second (clock rounding) — MediaMTX may name a file 09-10-58 when ingest start
        // was recorded at 09-10-58.849 by the on-publish webhook.
        if (!fs.existsSync(filePath)) {
            try {
                const files = fs.readdirSync(recDir).filter(f => f.endsWith('.mp4'));
                const targetSec = Math.floor(start.getTime() / 1000);
                let best: { name: string; diff: number } | null = null;
                for (const f of files) {
                    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.mp4$/);
                    if (!m) continue;
                    const fileDate = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
                    const diff = Math.abs(Math.floor(fileDate / 1000) - targetSec);
                    if (!best || diff < best.diff) best = { name: f, diff };
                }
                if (best && best.diff <= 5) {
                    filePath = path.join(recDir, best.name);
                }
            } catch { /* dir may not exist yet */ }
        }

        if (!fs.existsSync(filePath)) {
            throw new NotFoundException(`Recording file not found: ${filePath}`);
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Cache-Control', 'no-store');

        const rangeMatch = rangeHeader && /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
        if (rangeMatch) {
            let s = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : NaN;
            let e = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : NaN;
            if (Number.isNaN(s) && Number.isFinite(e)) {
                s = Math.max(0, fileSize - e);
                e = fileSize - 1;
            } else {
                if (Number.isNaN(s)) s = 0;
                if (Number.isNaN(e) || e >= fileSize) e = fileSize - 1;
            }
            if (s > e || s >= fileSize) {
                res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
                return res.end();
            }
            res.status(206);
            res.setHeader('Content-Range', `bytes ${s}-${e}/${fileSize}`);
            res.setHeader('Content-Length', String(e - s + 1));
            fs.createReadStream(filePath, { start: s, end: e }).pipe(res);
            return;
        }

        res.setHeader('Content-Length', String(fileSize));
        fs.createReadStream(filePath).pipe(res);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.recordingsService.findById(id);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @AdminOnly()
    remove(@Param('id') id: string) {
        return this.recordingsService.remove(id);
    }
}

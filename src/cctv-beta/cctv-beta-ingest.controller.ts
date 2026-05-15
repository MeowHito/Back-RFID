import {
    Controller,
    Post,
    Body,
    Headers,
    UnauthorizedException,
    BadRequestException,
    HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { CctvBetaCamerasService } from './cctv-beta-cameras.service';
import { CctvBetaRecordingsService } from './cctv-beta-recordings.service';

/**
 * MediaMTX calls these endpoints via runOnPublish/runOnUnpublish/runOnReady hooks.
 * Configure runOnPublish in mediamtx.yml to POST to /cctv-beta/ingest/on-publish
 * with an X-Ingest-Signature header containing HMAC-SHA256(secret, rawBody).
 *
 * MediaMTX env vars passed: MTX_PATH, MTX_QUERY, MTX_SOURCE_TYPE, MTX_SOURCE_ID
 * The wrapper script should forward these as JSON body.
 */
@Controller('cctv-beta/ingest')
export class CctvBetaIngestController {
    constructor(
        private readonly camerasService: CctvBetaCamerasService,
        private readonly recordingsService: CctvBetaRecordingsService,
        private readonly config: ConfigService,
    ) {}

    private verifySignature(rawBody: string, signature?: string): void {
        const secret = this.config.get<string>('CCTV_BETA_INGEST_SECRET');
        if (!secret) throw new UnauthorizedException('Ingest secret not configured');
        if (!signature) throw new UnauthorizedException('Missing signature');
        const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
        const a = Buffer.from(expected);
        const b = Buffer.from(signature);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw new UnauthorizedException('Invalid signature');
        }
    }

    private extractStreamKey(path?: string): string {
        // mediamtx path like "live/abc_def123..." → "abc_def123..."
        if (!path) throw new BadRequestException('Missing path');
        const parts = path.split('/').filter(Boolean);
        return parts[parts.length - 1];
    }

    @Post('on-publish')
    @HttpCode(200)
    async onPublish(
        @Body() body: { path?: string; sourceType?: string; query?: string; rawBody?: string },
        @Headers('x-ingest-signature') signature?: string,
    ) {
        this.verifySignature(JSON.stringify(body), signature);
        const streamKey = this.extractStreamKey(body.path);
        const camera = await this.camerasService.findByStreamKey(streamKey);
        if (!camera) {
            throw new UnauthorizedException('Unknown stream key — rejecting publish');
        }
        await this.camerasService.markPublishing(streamKey);

        if (camera.autoRecord) {
            await this.recordingsService.startRecording({
                cameraId: String(camera._id),
                cameraName: camera.name,
                campaignId: String(camera.campaignId),
                checkpointName: camera.checkpointName,
                streamKey,
                protocol: (body.sourceType?.includes('srt') ? 'srt' : 'rtmp') as 'srt' | 'rtmp',
                hlsManifestPath: `/hls/${streamKey}/index.m3u8`,
            });
        }
        return { ok: true, accepted: true };
    }

    @Post('on-unpublish')
    @HttpCode(200)
    async onUnpublish(
        @Body() body: { path?: string; s3Key?: string; s3Bucket?: string; fileSize?: number },
        @Headers('x-ingest-signature') signature?: string,
    ) {
        this.verifySignature(JSON.stringify(body), signature);
        const streamKey = this.extractStreamKey(body.path);
        await this.camerasService.markOffline(streamKey);
        const rec = await this.recordingsService.finalizeRecording(streamKey, {
            fileSize: body.fileSize,
            s3Bucket: body.s3Bucket,
            s3Key: body.s3Key,
            s3MasterManifestUrl: body.s3Key && body.s3Bucket
                ? `https://${body.s3Bucket}.s3.amazonaws.com/${body.s3Key}`
                : undefined,
        });
        return { ok: true, recordingId: rec?._id };
    }

    @Post('on-error')
    @HttpCode(200)
    async onError(
        @Body() body: { path?: string; error?: string },
        @Headers('x-ingest-signature') signature?: string,
    ) {
        this.verifySignature(JSON.stringify(body), signature);
        const streamKey = this.extractStreamKey(body.path);
        await this.recordingsService.markError(streamKey, body.error || 'unknown');
        await this.camerasService.markOffline(streamKey);
        return { ok: true };
    }
}

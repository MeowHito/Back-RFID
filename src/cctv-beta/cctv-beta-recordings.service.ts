import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { CctvBetaRecording, CctvBetaRecordingDocument } from './cctv-beta-recording.schema';
import { CctvBetaS3Service } from './cctv-beta-s3.service';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Event, EventDocument } from '../events/event.schema';

// Where MediaMTX writes its on-disk fmp4 recordings (mirrors the constant in the
// controller). Override via env if your deployment uses a different path.
const BETA_RECORDINGS_DIR = process.env.CCTV_BETA_RECORDINGS_DIR || '/var/cctv/hls';

@Injectable()
export class CctvBetaRecordingsService {
    private readonly logger = new Logger(CctvBetaRecordingsService.name);

    constructor(
        @InjectModel(CctvBetaRecording.name)
        private readonly recordingModel: Model<CctvBetaRecordingDocument>,
        @InjectModel(TimingRecord.name)
        private readonly timingModel: Model<TimingRecordDocument>,
        @InjectModel(Event.name)
        private readonly eventModel: Model<EventDocument>,
        private readonly configService: ConfigService,
        private readonly s3: CctvBetaS3Service,
    ) {}

    /**
     * Best-effort: delete every S3 object under the recording's prefix.
     * Logs failures but doesn't throw — the DB delete must succeed even if S3 is down.
     * No-op when AWS credentials aren't configured (the service silently skips).
     */
    private async deleteS3ForRecording(rec: { streamKey?: string; s3Key?: string }): Promise<void> {
        if (!this.s3.isEnabled()) return;
        // Prefer streamKey (matches the actual MediaMTX upload structure: hls/{streamKey}/...)
        // Fall back to s3Key's directory if streamKey is missing on old records.
        let prefix = '';
        if (rec.streamKey) {
            prefix = `hls/${rec.streamKey}/`;
        } else if (rec.s3Key) {
            prefix = rec.s3Key.replace(/\/[^/]*$/, '/'); // strip filename → keep folder
        }
        if (!prefix) return;
        try {
            const result = await this.s3.deletePrefix(prefix);
            if (result.deleted > 0) {
                this.logger.log(`S3 deleted ${result.deleted} object(s) under ${prefix}`);
            }
        } catch (err) {
            this.logger.warn(`S3 delete failed for prefix ${prefix}: ${err}`);
        }
    }

    private normalizeCheckpointName(value?: string): string {
        return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    }

    /**
     * Pick the best playback URL for a Beta recording.
     *
     * Priority: S3 archive (cold, durable) → EC2 hot HLS manifest.
     * The Beta pipeline records to MediaMTX on EC2 and then archives to S3 when the
     * stream ends, so `s3MasterManifestUrl` exists only after archival; live & freshly
     * finished segments only have `hlsManifestPath` on EC2.
     */
    /**
     * Default bitrates used to *estimate* live file size while a recording is in progress.
     * The Beta pipeline stores files on EC2/S3 — the backend can't `stat` them — so we use
     * `now - serverIngestStart` × bitrate as a rough estimate that updates every page refresh.
     * Replaced by the real on-disk size in the on-unpublish webhook when streaming ends.
     *
     * Numbers calibrated against actual Larix/IRL Pro recordings seen in production
     * (observed 6-13 Mbps for 1080p, depending on app settings + scene motion). H.264
     * baseline at default encoder presets:
     *   720p  ≈ 4   Mbps
     *   1080p ≈ 8   Mbps  (← default when resolution missing — calibrated 2026-05)
     *   4K    ≈ 20  Mbps
     *
     * Real bitrate varies ±50% based on motion + the phone's encoder settings;
     * if you want tighter estimates, lock the bitrate in the Larix/IRL Pro app.
     */
    private estimateBitrateKbps(resolution?: string): number {
        switch (resolution) {
            case '720p': return 4000;
            case '4K': return 20000;
            case '1080p':
            default: return 8000;
        }
    }

    /**
     * For a doc whose status is `'recording'`, compute live `duration` (seconds since
     * serverIngestStart) and an `fileSize` estimate. Doesn't persist — just enriches
     * the returned object so the admin list shows growing numbers.
     */
    private enrichLiveRecording(doc: any): any {
        if (doc?.recordingStatus !== 'recording' || !doc?.serverIngestStart) return doc;
        const startMs = new Date(doc.serverIngestStart).getTime();
        const liveSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));

        const segments = Array.isArray(doc.segments) ? doc.segments : [];
        if (segments.length > 0) {
            // Segmented mode (2-min uploads): segments[] holds real bytes for archived chunks;
            // estimate only the current in-flight segment (now - last endedAt) so the admin
            // list reflects growing size without doubling counting.
            const lastEnd = segments[segments.length - 1]?.endedAt;
            const inflightStartMs = lastEnd ? new Date(lastEnd).getTime() : startMs;
            const inflightSec = Math.max(0, Math.floor((Date.now() - inflightStartMs) / 1000));
            const kbps = this.estimateBitrateKbps((doc as any).resolution);
            const archivedSize = segments.reduce((sum: number, s: any) => sum + (Number(s.fileSize) || 0), 0);
            doc.fileSize = archivedSize + Math.floor((inflightSec * kbps * 1000) / 8);
            doc.duration = liveSeconds;
            doc.fileSizeEstimated = true;
        } else {
            // Legacy single-file recording — no segments yet (e.g. wrapper not running, or
            // the first 2 minutes haven't elapsed). Whole-session estimate.
            doc.duration = liveSeconds;
            if (!doc.fileSize || doc.fileSize === 0) {
                const kbps = this.estimateBitrateKbps((doc as any).resolution);
                doc.fileSize = Math.floor((liveSeconds * kbps * 1000) / 8);
                doc.fileSizeEstimated = true;
            }
        }
        return doc;
    }

    private resolveEc2HlsUrl(rec: any): string | null {
        if (!rec?.hlsManifestPath) return null;
        const playbackHost = this.configService.get<string>('CCTV_BETA_PLAYBACK_HOST');
        if (!playbackHost) return rec.hlsManifestPath;
        const cleanHost = playbackHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const cleanPath = rec.hlsManifestPath.startsWith('/')
            ? rec.hlsManifestPath
            : `/${rec.hlsManifestPath}`;
        return `https://${cleanHost}${cleanPath}`;
    }

    private pickPlaybackUrl(rec: any): { url: string; source: 's3' | 'ec2' } | null {
        // S3-first for ALL cases — the MPEGTS / s3-sync architecture publishes the
        // index.m3u8 to S3 within ~30 s of stream start (Cache-Control: max-age=2),
        // so live viewers get the same URL as archived viewers and benefit from S3's
        // global edge cache. The EC2 LL-HLS muxer remains as a fallback for the brief
        // window before the first sync pass lands, or when S3 isn't configured.
        if (rec?.s3MasterManifestUrl) return { url: rec.s3MasterManifestUrl, source: 's3' };
        const ec2 = this.resolveEc2HlsUrl(rec);
        if (ec2) return { url: ec2, source: 'ec2' };
        return null;
    }

    /**
     * Seconds after `serverIngestEnd` during which a new on-publish for the same
     * streamKey will RESUME the existing recording row instead of creating a new one.
     * Defaults to 30s — long enough to bridge most Larix/IRL Pro reconnects without
     * accidentally merging genuinely separate recording sessions.
     */
    private get mergeWindowSec(): number {
        const v = parseInt(this.configService.get<string>('CCTV_BETA_MERGE_WINDOW_SEC') || '', 10);
        return Number.isFinite(v) && v > 0 ? v : 30;
    }

    async startRecording(payload: {
        cameraId: string;
        cameraName: string;
        campaignId?: string;
        checkpointName?: string;
        streamKey: string;
        protocol: 'rtmp' | 'srt';
        hlsManifestPath?: string;
        encoderFirstFrameTime?: Date;
        // Predicted S3 manifest URL — set by the on-publish hook in the MPEGTS/s3-sync
        // architecture so the row carries a playable URL immediately. When unset the
        // older fmp4-on-unpublish behavior applies.
        s3Bucket?: string;
        s3Key?: string;
        s3MasterManifestUrl?: string;
    }): Promise<CctvBetaRecordingDocument> {
        // Merge window: if the *latest* recording for this streamKey ended (or stalled
        // without an end) within mergeWindowSec, resume it instead of creating a new doc.
        // This collapses Larix reconnect storms (5-10 rapid disconnects) into a single
        // session row in the admin UI.
        const cutoff = new Date(Date.now() - this.mergeWindowSec * 1000);
        const latest = await this.recordingModel
            .findOne({ streamKey: payload.streamKey })
            .sort({ serverIngestStart: -1 })
            .exec();

        const recentEnoughToMerge = latest
            && (
                // Stale "recording" with no end webhook fired (zombie row)
                latest.recordingStatus === 'recording'
                // Or a clean completion within the merge window
                || (latest.serverIngestEnd && latest.serverIngestEnd >= cutoff)
            );

        if (recentEnoughToMerge) {
            this.logger.log(
                `Resuming recording ${(latest as any)._id} (streamKey=${payload.streamKey}) ` +
                `— last ended ${latest.serverIngestEnd?.toISOString() || 'never'}, ` +
                `within ${this.mergeWindowSec}s merge window`,
            );
            // Reset the active recording back to 'recording' state. Keep prior s3Key
            // (so the admin UI can still play the previous segment if the new one fails
            // to finalize), but clear `serverIngestEnd` so the live duration estimate
            // resumes from the original serverIngestStart.
            latest.recordingStatus = 'recording';
            latest.serverIngestEnd = undefined as any;
            if (payload.hlsManifestPath) latest.hlsManifestPath = payload.hlsManifestPath;
            if (payload.encoderFirstFrameTime) latest.encoderFirstFrameTime = payload.encoderFirstFrameTime;
            // Re-apply predicted S3 URL — the bucket/key shape is the same per streamKey,
            // but a previous session might have lacked them (mid-deploy resume).
            if (payload.s3Bucket) latest.s3Bucket = payload.s3Bucket;
            if (payload.s3Key) latest.s3Key = payload.s3Key;
            if (payload.s3MasterManifestUrl) latest.s3MasterManifestUrl = payload.s3MasterManifestUrl;
            return latest.save();
        }

        const doc = new this.recordingModel({
            ...payload,
            serverIngestStart: new Date(),
            recordingStatus: 'recording',
            segments: [],
        });
        return doc.save();
    }

    async finalizeRecording(streamKey: string, payload: {
        fileSize?: number;
        s3Bucket?: string;
        s3Key?: string;
        s3MasterManifestUrl?: string;
    }): Promise<CctvBetaRecordingDocument | null> {
        const active = await this.recordingModel
            .findOne({ streamKey, recordingStatus: 'recording' })
            .sort({ serverIngestStart: -1 })
            .exec();
        if (!active) return null;

        const end = new Date();
        // Segment start = previous segment's end (or serverIngestStart for the first one).
        // This way duration of each segment is well-defined, and the total session duration
        // still equals (end - serverIngestStart).
        const prevSegments = Array.isArray(active.segments) ? active.segments : [];
        const lastSegmentEnd = prevSegments.length
            ? new Date(prevSegments[prevSegments.length - 1].endedAt || active.serverIngestStart)
            : active.serverIngestStart;

        const segment = {
            s3Bucket: payload.s3Bucket,
            s3Key: payload.s3Key,
            s3MasterManifestUrl: payload.s3MasterManifestUrl,
            startedAt: lastSegmentEnd,
            endedAt: end,
            fileSize: payload.fileSize || 0,
            duration: Math.floor((end.getTime() - lastSegmentEnd.getTime()) / 1000),
        };
        active.segments = [...prevSegments, segment];

        active.serverIngestEnd = end;
        // Session duration = total elapsed since FIRST publish, not just this segment.
        active.duration = Math.floor((end.getTime() - active.serverIngestStart.getTime()) / 1000);
        // Total fileSize across all segments (preserve real bytes even when segments roll).
        const totalSize = active.segments.reduce((sum, s) => sum + (Number(s.fileSize) || 0), 0);
        active.fileSize = totalSize || (payload.fileSize ?? active.fileSize);
        // Top-level s3Key/url ALWAYS point at the latest segment so default playback
        // opens the most-recent file (where the runner most likely finished).
        if (payload.s3Bucket) active.s3Bucket = payload.s3Bucket;
        if (payload.s3Key) active.s3Key = payload.s3Key;
        if (payload.s3MasterManifestUrl) active.s3MasterManifestUrl = payload.s3MasterManifestUrl;
        active.recordingStatus = (payload.s3Key || active.s3Key) ? 'archived' : 'completed';
        return active.save();
    }

    /**
     * Called by the on-segment-complete webhook every 2 minutes as MediaMTX
     * rotates recording files. Adds the completed segment to segments[] so
     * runnerLookup can resolve the exact 2-min S3 file for any scan time —
     * even while the overall session is still recording.
     *
     * Deduplicates by s3Key so re-fires (e.g. MediaMTX retry) are idempotent.
     */
    async addSegment(streamKey: string, payload: {
        segmentFile?: string;
        s3Bucket?: string;
        s3Key?: string;
        s3MasterManifestUrl?: string;
        fileSize?: number;
    }): Promise<void> {
        const active = await this.recordingModel
            .findOne({ streamKey, recordingStatus: 'recording' })
            .sort({ serverIngestStart: -1 })
            .exec();
        if (!active) return;

        const prevSegments = Array.isArray(active.segments) ? active.segments : [];

        // Deduplicate — hook can fire more than once for the same segment.
        if (payload.s3Key && prevSegments.some((s: any) => s.s3Key === payload.s3Key)) return;

        // Parse segment start time from filename (YYYY-MM-DD_HH-MM-SS.mp4).
        // Fall back to the end of the previous segment for timing continuity.
        const lastEnd = prevSegments.length
            ? new Date(prevSegments[prevSegments.length - 1].endedAt || active.serverIngestStart)
            : active.serverIngestStart;

        let segmentStart: Date = lastEnd;
        if (payload.segmentFile) {
            const m = payload.segmentFile.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.mp4$/);
            if (m) {
                // MediaMTX timestamps are UTC inside the Docker container (default TZ=UTC).
                segmentStart = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
            }
        }
        const segmentEnd = new Date(); // approximate — real end time when hook fired

        const segment = {
            s3Bucket: payload.s3Bucket,
            s3Key: payload.s3Key,
            s3MasterManifestUrl: payload.s3MasterManifestUrl,
            startedAt: segmentStart,
            endedAt: segmentEnd,
            fileSize: payload.fileSize || 0,
            duration: Math.floor((segmentEnd.getTime() - segmentStart.getTime()) / 1000),
        };
        active.segments = [...prevSegments, segment];
        await active.save();
    }

    async markError(streamKey: string, errorMessage: string): Promise<void> {
        await this.recordingModel.updateMany(
            { streamKey, recordingStatus: 'recording' },
            { $set: { recordingStatus: 'error', errorMessage, serverIngestEnd: new Date() } },
        ).exec();
    }

    async findAll(filter: { campaignId?: string; cameraId?: string } = {}): Promise<CctvBetaRecordingDocument[]> {
        const q: any = {};
        if (filter.campaignId) q.campaignId = filter.campaignId;
        if (filter.cameraId) q.cameraId = filter.cameraId;
        const recs = await this.recordingModel.find(q).sort({ serverIngestStart: -1 }).limit(500).exec();
        // Live in-progress recordings (status='recording') have stale duration/fileSize in DB
        // until the on-unpublish webhook fires. Enrich each one with a live duration and an
        // estimated size so the admin list reflects what's happening right now.
        // .toJSON() is invoked when Mongoose serializes for the HTTP response — by mutating
        // the doc here we ensure the enrichment survives the response trip.
        for (const rec of recs) {
            this.enrichLiveRecording(rec);
        }
        return recs;
    }

    async findById(id: string): Promise<CctvBetaRecordingDocument> {
        const r = await this.recordingModel.findById(id).exec();
        if (!r) throw new NotFoundException('Recording not found');
        return r;
    }

    /**
     * Resolve the on-disk fmp4 path for an in-progress beta recording.
     *
     * MediaMTX writes files named after their start timestamp; the on-publish webhook
     * records `serverIngestStart` to the same second, but real-world clock rounding
     * can drift by up to a second, so we fall back to the closest .mp4 in the same
     * directory if the exact name is missing. Returns null when no file is found
     * (live recording hasn't started writing, or the directory is missing).
     */
    resolveLiveFilePath(rec: { streamKey?: string; serverIngestStart?: Date; atTime?: Date }): string | null {
        if (!rec?.streamKey || !rec?.serverIngestStart) return null;
        // With 2-min segmentation enabled, the directory contains many .mp4 files (one per
        // segment that hasn't been uploaded + deleted yet — typically just the in-flight one).
        // Pick the file whose START timestamp is the most recent one that is ≤ `atTime`
        // (default: serverIngestStart for back-compat when no scan time is supplied).
        const target = rec.atTime ? new Date(rec.atTime) : new Date(rec.serverIngestStart);
        const targetSec = Math.floor(target.getTime() / 1000);
        const recDir = path.join(BETA_RECORDINGS_DIR, 'live', rec.streamKey);
        try {
            const files = fs.readdirSync(recDir).filter(f => f.endsWith('.mp4'));
            let best: { path: string; startSec: number } | null = null;
            for (const f of files) {
                const m = f.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.mp4$/);
                if (!m) continue;
                const fileSec = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000);
                // Allow 5s of clock rounding when atTime equals serverIngestStart (the very
                // first segment may be named a second or two later than the publish webhook).
                if (fileSec > targetSec + 5) continue;
                if (!best || fileSec > best.startSec) {
                    best = { path: path.join(recDir, f), startSec: fileSec };
                }
            }
            if (best) return best.path;
        } catch { /* dir may not exist yet */ }
        return null;
    }

    /** Directory used to cache transcoded beta clips on the EC2 host. */
    get betaCacheDir(): string {
        return path.join(BETA_RECORDINGS_DIR, '_cache');
    }

    async findForRunnerWindow(params: {
        campaignId: string;
        checkpointName?: string;
        from: Date;
        to: Date;
    }): Promise<CctvBetaRecordingDocument[]> {
        const q: any = {
            campaignId: params.campaignId,
            serverIngestStart: { $lte: params.to },
            $or: [
                { serverIngestEnd: { $gte: params.from } },
                { serverIngestEnd: null, recordingStatus: 'recording' },
            ],
        };
        if (params.checkpointName) q.checkpointName = params.checkpointName;
        return this.recordingModel.find(q).sort({ serverIngestStart: 1 }).exec();
    }

    async remove(id: string): Promise<void> {
        const doc = await this.recordingModel.findById(id).exec();
        if (!doc) throw new NotFoundException('Recording not found');
        // Delete S3 objects FIRST so a transient S3 outage doesn't leave orphan files
        // when the DB row is already gone. If S3 delete fails we log but proceed —
        // the lifecycle policy will catch the orphan later.
        await this.deleteS3ForRecording(doc as any);
        await this.recordingModel.findByIdAndDelete(id).exec();
    }

    /**
     * Storage summary for the /admin/cctv-recordings dashboard — EC2 disk usage only.
     *
     * Only bytes actually resident on EC2 disk count:
     *   • 'archived' → all .ts segments are on S3 and pruned by s3-sync → 0
     *   • 'recording' → only the current in-flight segment is on disk; completed
     *     segments have already been uploaded to S3 and pruned
     *   • 'completed' → recording ended but not yet archived (rare) → fileSize
     */
    async getStorageInfo(campaignId?: string): Promise<{ totalSize: number; count: number }> {
        const q: any = { recordingStatus: { $in: ['recording', 'completed', 'archived'] } };
        if (campaignId) q.campaignId = campaignId;
        const recs = await this.recordingModel
            .find(q)
            .select('fileSize recordingStatus serverIngestStart resolution segments')
            .lean()
            .exec();
        const totalSize = recs.reduce((sum: number, r: any) => {
            // 'archived' = all .ts files are on S3, local copies pruned → zero EC2 footprint
            if (r.recordingStatus === 'archived') return sum;

            if (r.recordingStatus === 'recording' && r.serverIngestStart) {
                // Only the current in-flight segment occupies EC2 disk.
                // Completed 2-min chunks are already uploaded to S3 and pruned by s3-sync.
                const segments = Array.isArray(r.segments) ? r.segments : [];
                const lastEnd = segments.length ? segments[segments.length - 1]?.endedAt : null;
                const inflightStartMs = lastEnd
                    ? new Date(lastEnd).getTime()
                    : new Date(r.serverIngestStart).getTime();
                const inflightSec = Math.max(0, Math.floor((Date.now() - inflightStartMs) / 1000));
                const kbps = this.estimateBitrateKbps(r.resolution);
                return sum + Math.floor((inflightSec * kbps * 1000) / 8);
            }

            // 'completed' — recording ended but not yet archived; may still be on disk
            return sum + (Number(r.fileSize) || 0);
        }, 0);
        return { totalSize, count: recs.length };
    }

    /**
     * Force-upload all pending .ts segments in /var/cctv/hls/live/* to S3 immediately,
     * rebuild the HLS manifest from the S3 listing, and prune local files.
     * Mirrors what the s3-sync sidecar does on its 30-second timer, but on demand.
     * Called by POST /cctv-beta/recordings/force-sync from the admin UI.
     */
    async forceSync(): Promise<{ uploaded: number; skipped: number; errors: number }> {
        if (!this.s3.isEnabled()) {
            this.logger.warn('forceSync: S3 not configured — skipping');
            return { uploaded: 0, skipped: 0, errors: 0 };
        }

        const liveDir = path.join(BETA_RECORDINGS_DIR, 'live');
        let uploaded = 0, skipped = 0, errors = 0;

        let streamKeys: string[];
        try {
            streamKeys = fs.readdirSync(liveDir).filter(d => {
                try { return fs.statSync(path.join(liveDir, d)).isDirectory(); } catch { return false; }
            });
        } catch {
            this.logger.warn(`forceSync: cannot read ${liveDir} — no recordings to sync`);
            return { uploaded: 0, skipped: 0, errors: 0 };
        }

        for (const streamKey of streamKeys) {
            const streamDir = path.join(liveDir, streamKey);
            let dirFiles: string[];
            try { dirFiles = fs.readdirSync(streamDir); } catch { continue; }

            const tsFiles = dirFiles.filter(f => f.endsWith('.ts')).sort();
            const isEnded = dirFiles.includes('.ended');

            // Upload each .ts segment. Skip files modified in the last 8s — they may
            // still be open by MediaMTX (the current in-progress 6s segment).
            for (const file of tsFiles) {
                const localPath = path.join(streamDir, file);
                try {
                    const stat = fs.statSync(localPath);
                    if ((Date.now() - stat.mtimeMs) < 8000) { skipped++; continue; }
                    await this.s3.uploadFile(localPath, `hls/live/${streamKey}/${file}`, 'video/mp2t');
                    try { fs.unlinkSync(localPath); } catch { /* s3-sync will prune it */ }
                    uploaded++;
                } catch { errors++; }
            }

            // Rebuild the HLS manifest from what is now on S3 and push it.
            try {
                const allKeys = await this.s3.listKeys(`hls/live/${streamKey}/`);
                const tsSegments = allKeys
                    .filter(k => k.endsWith('.ts'))
                    .map(k => k.split('/').pop()!)
                    .sort();

                if (tsSegments.length > 0) {
                    const lines = [
                        '#EXTM3U', '#EXT-X-VERSION:3',
                        '#EXT-X-TARGETDURATION:7', '#EXT-X-MEDIA-SEQUENCE:0',
                    ];
                    for (const seg of tsSegments) { lines.push('#EXTINF:6.000,', seg); }
                    if (isEnded) lines.push('#EXT-X-ENDLIST');

                    const manifestKey = `hls/live/${streamKey}/index.m3u8`;
                    await this.s3.uploadContent(
                        manifestKey,
                        lines.join('\n') + '\n',
                        'application/vnd.apple.mpegurl',
                        'public, max-age=2',
                    );

                    const bucket = this.s3.getBucket()!;
                    const manifestUrl = `https://${bucket}.s3.amazonaws.com/${manifestKey}`;
                    const update: any = { s3MasterManifestUrl: manifestUrl, s3Key: manifestKey };
                    if (isEnded) update.recordingStatus = 'archived';

                    await this.recordingModel.findOneAndUpdate(
                        { streamKey, recordingStatus: { $in: ['recording', 'completed'] } },
                        { $set: update },
                        { sort: { serverIngestStart: -1 } },
                    ).exec();
                }
            } catch (err) {
                this.logger.warn(`forceSync: manifest rebuild failed for ${streamKey}: ${err}`);
                errors++;
            }
        }

        this.logger.log(`forceSync complete: uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
        return { uploaded, skipped, errors };
    }

    /**
     * Bulk delete by IDs or by campaign. Mirrors `CctvRecordingsService.deleteAll`.
     * Note: only removes MongoDB metadata — the S3/HLS files themselves are pruned
     * by lifecycle policies (or the s3-sync container if you wipe disk).
     */
    async deleteMany(opts: { ids?: string[]; campaignId?: string }): Promise<{ deleted: number; s3Deleted: number }> {
        const q: any = {};
        if (opts.ids?.length) q._id = { $in: opts.ids };
        else if (opts.campaignId) q.campaignId = opts.campaignId;
        else throw new NotFoundException('Specify either ids or campaignId');

        // 1. Collect streamKey/s3Key BEFORE deletion so we know what S3 prefixes to clean
        const docs = await this.recordingModel.find(q).select('streamKey s3Key').lean().exec();

        // 2. Delete S3 prefixes in parallel (best-effort — failures logged, never blocked)
        let s3Deleted = 0;
        if (this.s3.isEnabled() && docs.length > 0) {
            const results = await Promise.allSettled(
                docs.map((d: any) => this.deleteS3ForRecording(d).then(() => null)),
            );
            s3Deleted = results.filter((r) => r.status === 'fulfilled').length;
        }

        // 3. Remove DB rows
        const res = await this.recordingModel.deleteMany(q).exec();
        return { deleted: res.deletedCount || 0, s3Deleted };
    }

    /**
     * Find recordings whose ingest window covers a given Thailand-local timestamp,
     * plus the nearest recordings before/after if no covering recording exists.
     * Mirrors the time-search feature on /admin/cctv-recordings.
     */
    async findByTime(opts: { campaignId: string; at: Date }): Promise<{
        covering: any[];
        nearestBefore: any | null;
        nearestAfter: any | null;
    }> {
        const { campaignId, at } = opts;
        const baseFilter: any = {
            campaignId,
            recordingStatus: { $in: ['recording', 'completed', 'archived'] },
        };

        // Recordings whose interval [serverIngestStart, serverIngestEnd] includes `at`
        const covering = await this.recordingModel.find({
            ...baseFilter,
            serverIngestStart: { $lte: at },
            $or: [
                { serverIngestEnd: { $gte: at } },
                { serverIngestEnd: null, recordingStatus: 'recording' },
            ],
        }).sort({ serverIngestStart: -1 }).lean().exec();

        const [nearestBefore] = await this.recordingModel.find({
            ...baseFilter,
            serverIngestStart: { $lt: at },
        }).sort({ serverIngestStart: -1 }).limit(1).lean().exec();

        const [nearestAfter] = await this.recordingModel.find({
            ...baseFilter,
            serverIngestStart: { $gt: at },
        }).sort({ serverIngestStart: 1 }).limit(1).lean().exec();

        return {
            covering,
            nearestBefore: nearestBefore || null,
            nearestAfter: nearestAfter || null,
        };
    }

    /**
     * Match a runner's timing scans to Beta recordings at the same checkpoint.
     * Mirrors `CctvRecordingsService.runnerLookup` but reads cctvbetarecordings.
     * Returns one entry per timing scan, with the matching Beta recording (or null)
     * plus a precomputed `seekSeconds` and playback URL.
     */
    async runnerLookup(bib: string, campaignId: string): Promise<any[]> {
        const eventIdSet: string[] = [campaignId];
        if (Types.ObjectId.isValid(campaignId)) {
            const events = await this.eventModel
                .find({ $or: [{ campaignId }, { campaignId: new Types.ObjectId(campaignId) }] })
                .select('_id')
                .lean()
                .exec();
            events.forEach((e: any) => eventIdSet.push(String(e._id)));
        }
        const objectIds = [...new Set(eventIdSet)]
            .filter(id => Types.ObjectId.isValid(id))
            .map(id => new Types.ObjectId(id));
        const campaignIdsToMatch = [...new Set(eventIdSet)];

        const timings = await this.timingModel
            .find({ bib, eventId: { $in: objectIds } })
            .sort({ scanTime: 1 })
            .lean()
            .exec();

        if (!timings.length) return [];

        const earliestScan = new Date((timings[0] as any).scanTime);
        const latestScan = new Date((timings[timings.length - 1] as any).scanTime);

        const allRecordings = await this.recordingModel.find({
            campaignId: { $in: campaignIdsToMatch },
            recordingStatus: { $in: ['recording', 'completed', 'archived'] },
            serverIngestStart: { $lte: latestScan },
            $or: [
                { serverIngestEnd: { $gte: earliestScan } },
                { serverIngestEnd: null, recordingStatus: 'recording' },
            ],
        }).sort({ serverIngestStart: -1 }).lean().exec();

        const results: any[] = [];
        for (const t of timings) {
            const checkpoint = (t as any).checkpoint;
            const scanTime = new Date((t as any).scanTime);
            const normalizedCheckpoint = this.normalizeCheckpointName(checkpoint);

            const candidates = allRecordings.filter((r: any) => {
                const recStart = new Date(r.serverIngestStart);
                if (recStart > scanTime) return false;
                if (r.recordingStatus === 'recording' || !r.serverIngestEnd) return true;
                return new Date(r.serverIngestEnd) >= scanTime;
            });

            const recording = candidates.find((candidate: any) =>
                this.normalizeCheckpointName(candidate?.checkpointName) === normalizedCheckpoint,
            ) || null;

            // Merged sessions split into multiple `segments[]` (Larix reconnect storms,
            // MediaMTX recordSegmentDuration rollover — every 2 min in production). Each
            // segment is its own .mp4 file on S3 covering [startedAt, endedAt]. Resolve
            // the segment matching THIS scanTime so playback opens the correct file.
            //
            // Three cases:
            //  (a) segment matches            → S3 mp4, seek = scan - segment.startedAt
            //  (b) recording active, no match → scan is in the in-flight 2-min window
            //                                    (segment not uploaded yet). Use EC2 live
            //                                    HLS, seek = 0 (live edge — runner can
            //                                    rewatch precisely within ~2 min once the
            //                                    segment finalizes + uploads).
            //  (c) no segments at all         → legacy single-file recording, fall back
            //                                    to top-level s3MasterManifestUrl, seek
            //                                    from serverIngestStart.
            const segment = recording ? this.pickSegmentForScan(recording, scanTime) : null;
            const hasSegments = recording && Array.isArray((recording as any).segments) && (recording as any).segments.length > 0;
            const inLiveWindow = !!recording && !segment && hasSegments && (recording as any).recordingStatus === 'recording';

            let playback: { url: string; source: 's3' | 'ec2' } | null = null;
            let fileStart: Date | null = null;
            let fileEnd: Date | null = null;
            let seekSeconds = 0;

            if (segment) {
                playback = { url: segment.s3MasterManifestUrl, source: 's3' };
                fileStart = new Date(segment.startedAt);
                fileEnd = new Date(segment.endedAt || segment.startedAt);
                seekSeconds = Math.max(0, Math.floor((scanTime.getTime() - fileStart.getTime()) / 1000));
            } else if (inLiveWindow) {
                // Scan landed in the currently-recording 2-min segment — play live HLS.
                const ec2 = this.resolveEc2HlsUrl(recording);
                if (ec2) {
                    playback = { url: ec2, source: 'ec2' };
                    fileStart = scanTime; // live edge
                    fileEnd = new Date();
                    seekSeconds = 0;
                }
            } else if (recording) {
                playback = this.pickPlaybackUrl(recording);
                fileStart = new Date((recording as any).serverIngestStart);
                fileEnd = (recording as any).serverIngestEnd
                    ? new Date((recording as any).serverIngestEnd)
                    : new Date();
                seekSeconds = Math.max(0, Math.floor((scanTime.getTime() - fileStart.getTime()) / 1000));
            }

            results.push({
                checkpoint,
                scanTime: scanTime.toISOString(),
                elapsedTime: (t as any).elapsedTime || null,
                splitTime: (t as any).splitTime || null,
                recording: recording ? {
                    _id: (recording as any)._id,
                    cameraId: String((recording as any).cameraId || ''),
                    cameraName: (recording as any).cameraName,
                    checkpointName: (recording as any).checkpointName,
                    startTime: fileStart,
                    endTime: fileEnd,
                    // Duration of the FILE the player will actually load — not the
                    // whole session — so clip-end clamping in the frontend works.
                    duration: segment?.duration || (recording as any).duration || 0,
                    fileSize: segment?.fileSize || (recording as any).fileSize || 0,
                    recordingStatus: (recording as any).recordingStatus,
                    protocol: (recording as any).protocol,
                    playbackUrl: playback?.url || null,
                    playbackSource: playback?.source || null,
                } : null,
                seekSeconds,
            });
        }
        return results;
    }

    /**
     * For multi-segment merged recordings, find the segment whose [startedAt, endedAt]
     * window contains scanTime. Returns null when the recording has no segments (single
     * .mp4 covers the whole session) or when no segment matches.
     */
    private pickSegmentForScan(recording: any, scanTime: Date): any | null {
        const segments = Array.isArray(recording?.segments) ? recording.segments : [];
        if (!segments.length) return null;
        const t = scanTime.getTime();
        const match = segments.find((s: any) => {
            if (!s?.startedAt || !s?.s3MasterManifestUrl) return false;
            const start = new Date(s.startedAt).getTime();
            const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
            return t >= start && t <= end;
        });
        return match || null;
    }
}

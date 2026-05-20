import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { CctvBetaRecording, CctvBetaRecordingDocument } from './cctv-beta-recording.schema';
import { CctvBetaS3Service } from './cctv-beta-s3.service';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Event, EventDocument } from '../events/event.schema';

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
        doc.duration = liveSeconds;
        // Only override fileSize if the DB value is 0/unset — preserve any value an
        // external process (e.g. a future MediaMTX poll worker) may have set.
        if (!doc.fileSize || doc.fileSize === 0) {
            const kbps = this.estimateBitrateKbps((doc as any).resolution);
            doc.fileSize = Math.floor((liveSeconds * kbps * 1000) / 8);
            doc.fileSizeEstimated = true;
        }
        return doc;
    }

    private pickPlaybackUrl(rec: any): { url: string; source: 's3' | 'ec2' } | null {
        if (rec?.s3MasterManifestUrl) return { url: rec.s3MasterManifestUrl, source: 's3' };
        if (rec?.hlsManifestPath) {
            // hlsManifestPath is stored as a relative path like "/hls/{streamKey}/index.m3u8".
            // Prepend the playback host (MediaMTX HLS server) so the URL is usable by the browser.
            const playbackHost = this.configService.get<string>('CCTV_BETA_PLAYBACK_HOST');
            if (!playbackHost) return { url: rec.hlsManifestPath, source: 'ec2' };
            const cleanHost = playbackHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const cleanPath = rec.hlsManifestPath.startsWith('/')
                ? rec.hlsManifestPath
                : `/${rec.hlsManifestPath}`;
            return { url: `https://${cleanHost}${cleanPath}`, source: 'ec2' };
        }
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
     * Storage summary for the /admin/cctv-recordings dashboard.
     * Mirrors `CctvRecordingsService.getStorageInfo` so the page can sum the two.
     */
    async getStorageInfo(campaignId?: string): Promise<{ totalSize: number; count: number }> {
        const q: any = { recordingStatus: { $in: ['recording', 'completed', 'archived'] } };
        if (campaignId) q.campaignId = campaignId;
        // Need `serverIngestStart` + `resolution` for live size estimates too
        const recs = await this.recordingModel
            .find(q)
            .select('fileSize recordingStatus serverIngestStart resolution')
            .lean()
            .exec();
        const totalSize = recs.reduce((sum: number, r: any) => {
            // For in-progress recordings, contribute the estimated size instead of 0
            if (r.recordingStatus === 'recording' && (!r.fileSize || r.fileSize === 0) && r.serverIngestStart) {
                const liveSeconds = Math.max(0, Math.floor((Date.now() - new Date(r.serverIngestStart).getTime()) / 1000));
                const kbps = this.estimateBitrateKbps(r.resolution);
                return sum + Math.floor((liveSeconds * kbps * 1000) / 8);
            }
            return sum + (Number(r.fileSize) || 0);
        }, 0);
        return { totalSize, count: recs.length };
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
            // MediaMTX recordSegmentDuration rollover). Each segment is its own .mp4 file
            // covering [startedAt, endedAt]; the top-level s3Key only points at the LATEST
            // segment, which is wrong for any scan that landed in an earlier one.
            // Resolve the correct segment for THIS scanTime so the player opens the file
            // that actually contains the moment.
            const segment = recording ? this.pickSegmentForScan(recording, scanTime) : null;
            const playback = recording
                ? (segment
                    ? { url: segment.s3MasterManifestUrl, source: 's3' as const }
                    : this.pickPlaybackUrl(recording))
                : null;

            // Anchor the seek to whichever timeline the chosen file actually starts on.
            // - segment present → segment.startedAt
            // - no segments (single-file recording) → serverIngestStart of the session
            const fileStart = segment
                ? new Date(segment.startedAt)
                : recording ? new Date((recording as any).serverIngestStart) : null;
            const fileEnd = segment
                ? new Date(segment.endedAt || segment.startedAt)
                : recording
                    ? ((recording as any).serverIngestEnd ? new Date((recording as any).serverIngestEnd) : new Date())
                    : null;
            const seekSeconds = fileStart
                ? Math.max(0, Math.floor((scanTime.getTime() - fileStart.getTime()) / 1000))
                : 0;

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

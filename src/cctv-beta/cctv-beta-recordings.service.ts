import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { CctvBetaRecording, CctvBetaRecordingDocument } from './cctv-beta-recording.schema';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Event, EventDocument } from '../events/event.schema';

@Injectable()
export class CctvBetaRecordingsService {
    constructor(
        @InjectModel(CctvBetaRecording.name)
        private readonly recordingModel: Model<CctvBetaRecordingDocument>,
        @InjectModel(TimingRecord.name)
        private readonly timingModel: Model<TimingRecordDocument>,
        @InjectModel(Event.name)
        private readonly eventModel: Model<EventDocument>,
        private readonly configService: ConfigService,
    ) {}

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
        const doc = new this.recordingModel({
            ...payload,
            serverIngestStart: new Date(),
            recordingStatus: 'recording',
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
        active.serverIngestEnd = end;
        active.duration = Math.floor((end.getTime() - active.serverIngestStart.getTime()) / 1000);
        if (payload.fileSize != null) active.fileSize = payload.fileSize;
        if (payload.s3Bucket) active.s3Bucket = payload.s3Bucket;
        if (payload.s3Key) active.s3Key = payload.s3Key;
        if (payload.s3MasterManifestUrl) active.s3MasterManifestUrl = payload.s3MasterManifestUrl;
        active.recordingStatus = payload.s3Key ? 'archived' : 'completed';
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
        return this.recordingModel.find(q).sort({ serverIngestStart: -1 }).limit(500).exec();
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
        const res = await this.recordingModel.findByIdAndDelete(id).exec();
        if (!res) throw new NotFoundException('Recording not found');
    }

    /**
     * Storage summary for the /admin/cctv-recordings dashboard.
     * Mirrors `CctvRecordingsService.getStorageInfo` so the page can sum the two.
     */
    async getStorageInfo(campaignId?: string): Promise<{ totalSize: number; count: number }> {
        const q: any = { recordingStatus: { $in: ['recording', 'completed', 'archived'] } };
        if (campaignId) q.campaignId = campaignId;
        const recs = await this.recordingModel.find(q).select('fileSize recordingStatus').lean().exec();
        const totalSize = recs.reduce((sum: number, r: any) => sum + (Number(r.fileSize) || 0), 0);
        return { totalSize, count: recs.length };
    }

    /**
     * Bulk delete by IDs or by campaign. Mirrors `CctvRecordingsService.deleteAll`.
     * Note: only removes MongoDB metadata — the S3/HLS files themselves are pruned
     * by lifecycle policies (or the s3-sync container if you wipe disk).
     */
    async deleteMany(opts: { ids?: string[]; campaignId?: string }): Promise<{ deleted: number }> {
        const q: any = {};
        if (opts.ids?.length) q._id = { $in: opts.ids };
        else if (opts.campaignId) q.campaignId = opts.campaignId;
        else throw new NotFoundException('Specify either ids or campaignId');
        const res = await this.recordingModel.deleteMany(q).exec();
        return { deleted: res.deletedCount || 0 };
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

            const playback = recording ? this.pickPlaybackUrl(recording) : null;
            const startTime = recording ? new Date((recording as any).serverIngestStart) : null;
            const endTime = recording
                ? ((recording as any).serverIngestEnd ? new Date((recording as any).serverIngestEnd) : new Date())
                : null;
            const seekSeconds = startTime
                ? Math.max(0, Math.floor((scanTime.getTime() - startTime.getTime()) / 1000))
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
                    startTime,
                    endTime,
                    duration: (recording as any).duration || 0,
                    fileSize: (recording as any).fileSize || 0,
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
}

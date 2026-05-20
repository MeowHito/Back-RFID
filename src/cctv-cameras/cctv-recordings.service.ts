import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { CctvRecording, CctvRecordingDocument } from './cctv-recording.schema';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Event, EventDocument } from '../events/event.schema';
import { LiveCameraInfo } from './cctv.gateway';
import { CctvBetaS3Service } from '../cctv-beta/cctv-beta-s3.service';

const RECORDINGS_DIR = path.join(process.cwd(), 'uploads', 'recordings');

@Injectable()
export class CctvRecordingsService {
    private readonly logger = new Logger(CctvRecordingsService.name);
    // Map cameraId → { stream, recordId, startTime, mimeType }
    private activeRecordings = new Map<string, {
        stream: fs.WriteStream;
        recordId: string;
        fileName: string;
        filePath: string;
        startTime: Date;
        mimeType: string;
    }>();

    constructor(
        @InjectModel(CctvRecording.name)
        private recordingModel: Model<CctvRecordingDocument>,
        @InjectModel(TimingRecord.name)
        private timingModel: Model<TimingRecordDocument>,
        @InjectModel(Event.name)
        private eventModel: Model<EventDocument>,
        private readonly s3: CctvBetaS3Service,
    ) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
    }

    /** Build the S3 key for a Classic recording. Folder layout mirrors the Beta pipeline
     *  (`cctv-classic/{campaignId or 'unsorted'}/{filename}`) so a Lifecycle rule can
     *  cover both pipelines with a single prefix. */
    private buildS3Key(rec: { campaignId?: string; fileName: string }, basename: string, ext: string): string {
        const camp = rec.campaignId && rec.campaignId.trim() ? rec.campaignId : 'unsorted';
        return `cctv-classic/${camp}/${basename}.${ext}`;
    }

    /**
     * Walk every completed recording that still has a local file but no s3Key, and
     * archive it. Transcodes webm → mp4 on the fly if no .mp4 sibling exists yet.
     * Triggered manually from /admin/cctv-recordings ("Archive to S3 + free disk" button).
     * Returns counts so the UI can show progress.
     */
    async archiveAllPending(): Promise<{ uploaded: number; skipped: number; errors: number }> {
        if (!this.s3.isEnabled()) {
            return { uploaded: 0, skipped: 0, errors: 0 };
        }
        const recs = await this.recordingModel
            .find({ recordingStatus: 'completed', s3Key: { $in: [null, ''] as any } })
            .exec();
        let uploaded = 0;
        let skipped = 0;
        let errors = 0;
        for (const rec of recs) {
            try {
                const beforeS3Key = rec.s3Key;
                await this.archiveToS3(String(rec._id));
                const updated = await this.recordingModel.findById(rec._id).exec();
                if (updated?.s3Key && updated.s3Key !== beforeS3Key) uploaded++;
                else skipped++;
            } catch (err) {
                this.logger.warn(`archiveAllPending: failed for ${rec._id}: ${err}`);
                errors++;
            }
        }
        this.logger.log(`archiveAllPending complete: uploaded=${uploaded} skipped=${skipped} errors=${errors}`);
        return { uploaded, skipped, errors };
    }

    /**
     * Best-effort: upload the local file to S3 then delete the on-disk copies.
     * Called by the controller's background transcode after ffmpeg produces the mp4.
     * Safe to call when S3 isn't configured (no-op, leaves files local).
     *
     * Preserves DB row even if upload fails — playback then keeps using local file.
     */
    async archiveToS3(recordingId: string): Promise<void> {
        if (!this.s3.isEnabled()) return;
        const rec = await this.recordingModel.findById(recordingId).exec();
        if (!rec || rec.recordingStatus === 'recording') return;
        if (rec.s3Key) return; // already uploaded

        // Prefer the transcoded mp4 (browser-friendly + faststart) over the source webm.
        const baseName = rec.fileName.replace(/\.[^.]+$/, '');
        const cacheDir = path.dirname(rec.filePath);
        const mp4Path = path.join(cacheDir, `${baseName}.mp4`);
        const webmPath = rec.filePath;

        const hasMp4 = fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 0;
        const hasWebm = fs.existsSync(webmPath) && fs.statSync(webmPath).size > 0;
        if (!hasMp4 && !hasWebm) return;

        const sourcePath = hasMp4 ? mp4Path : webmPath;
        const ext = hasMp4 ? 'mp4' : 'webm';
        const contentType = hasMp4 ? 'video/mp4' : 'video/webm';
        const s3Key = this.buildS3Key(rec, baseName, ext);

        try {
            const result = await this.s3.uploadFile(sourcePath, s3Key, contentType);
            if (!result) return;
            await this.recordingModel.findByIdAndUpdate(rec._id, {
                s3Bucket: result.bucket,
                s3Key: result.key,
                s3MasterManifestUrl: result.url,
                mimeType: contentType,
                fileSize: fs.statSync(sourcePath).size,
            }).exec();
            // Local cleanup AFTER DB is updated — otherwise a crash mid-upload leaves the
            // DB pointing at a file that no longer exists.
            try { if (hasMp4) fs.unlinkSync(mp4Path); } catch { /* ignore */ }
            try { if (hasWebm) fs.unlinkSync(webmPath); } catch { /* ignore */ }
            this.logger.log(`Classic recording archived to S3: ${result.url}`);
        } catch (err) {
            this.logger.warn(`S3 upload failed for ${rec.fileName}: ${err} — keeping local file`);
        }
    }

    private normalizeCheckpointName(value?: string): string {
        return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    }

    private getRecordingSnapshot(recording: any) {
        const startTime = new Date(recording?.startTime);
        const endTime = recording?.recordingStatus === 'recording' || !recording?.endTime
            ? new Date()
            : new Date(recording.endTime);

        let fileSize = recording?.fileSize || 0;
        if (recording?.recordingStatus === 'recording') {
            try {
                fileSize = fs.statSync(recording.filePath).size;
            } catch {
                fileSize = recording?.fileSize || 0;
            }
        }

        const duration = Number.isFinite(recording?.duration)
            ? recording.duration
            : 0;

        return {
            startTime,
            endTime,
            fileSize,
            duration: recording?.recordingStatus === 'recording'
                ? Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000))
                : duration,
        };
    }

    async startRecording(cameraId: string, info: LiveCameraInfo): Promise<void> {
        if (this.activeRecordings.has(cameraId)) return;
        const startTime = new Date();
        const ts = startTime.toISOString().replace(/[:.]/g, '-');
        const fileName = `${cameraId}_${ts}.webm`;
        const filePath = path.join(RECORDINGS_DIR, fileName);

        const doc = await this.recordingModel.create({
            cameraId,
            cameraName: info.name,
            campaignId: info.campaignId,
            checkpointName: info.checkpointName || '',
            location: info.location || '',
            deviceId: info.deviceId || '',
            startTime,
            fileName,
            filePath,
            mimeType: 'video/webm',
            recordingStatus: 'recording',
        });

        const stream = fs.createWriteStream(filePath, { flags: 'a' });
        this.activeRecordings.set(cameraId, {
            stream,
            recordId: (doc as any)._id.toString(),
            fileName,
            filePath,
            startTime,
            mimeType: 'video/webm',
        });
        this.logger.log(`Recording started: ${fileName}`);
    }

    appendChunk(cameraId: string, chunk: Buffer | ArrayBuffer): void {
        const rec = this.activeRecordings.get(cameraId);
        if (!rec) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
        rec.stream.write(buf);
    }

    updateMimeType(cameraId: string, mimeType: string): void {
        const rec = this.activeRecordings.get(cameraId);
        if (rec) rec.mimeType = mimeType;
    }

    async finalizeRecording(cameraId: string): Promise<void> {
        const rec = this.activeRecordings.get(cameraId);
        if (!rec) return;
        this.activeRecordings.delete(cameraId);

        await new Promise<void>(resolve => rec.stream.end(resolve));

        const endTime = new Date();
        const duration = Math.floor((endTime.getTime() - rec.startTime.getTime()) / 1000);
        let fileSize = 0;
        try { fileSize = fs.statSync(rec.filePath).size; } catch { /* file may be empty */ }

        if (fileSize === 0) {
            // Nothing was recorded — remove empty file and DB record
            try { fs.unlinkSync(rec.filePath); } catch { /* ignore */ }
            await this.recordingModel.findByIdAndDelete(rec.recordId).exec();
            this.logger.log(`Recording discarded (empty): ${rec.fileName}`);
            return;
        }

        await this.recordingModel.findByIdAndUpdate(rec.recordId, {
            endTime,
            duration,
            fileSize,
            mimeType: rec.mimeType,
            recordingStatus: 'completed',
        }).exec();
        this.logger.log(`Recording finalized: ${rec.fileName} (${fileSize} bytes, ${duration}s)`);
    }

    /**
     * Close the current recording file and immediately open a new one for the
     * same cameraId. Keeps segments short (~10 min from the mobile) so each
     * file stays small, ffmpeg-transcodes quickly, and is seekable on disk.
     */
    async rotateSegment(cameraId: string, info: LiveCameraInfo): Promise<void> {
        if (this.activeRecordings.has(cameraId)) {
            await this.finalizeRecording(cameraId);
        }
        await this.startRecording(cameraId, info);
    }

    async findAll(campaignId?: string): Promise<CctvRecordingDocument[]> {
        const filter: any = { recordingStatus: { $in: ['completed', 'recording'] } };
        if (campaignId) filter.campaignId = campaignId;
        const recs = await this.recordingModel.find(filter).sort({ startTime: -1 }).exec();
        // For in-progress recordings, compute live duration and fileSize
        for (const rec of recs) {
            if (rec.recordingStatus === 'recording') {
                rec.duration = Math.floor((Date.now() - new Date(rec.startTime).getTime()) / 1000);
                try { rec.fileSize = fs.statSync(rec.filePath).size; } catch { rec.fileSize = 0; }
            }
        }
        return recs;
    }

    /**
     * Total bytes still resident on EC2 disk. S3-archived rows contribute 0 here
     * (they no longer occupy local space) so the /admin/cctv-recordings storage gauge
     * reflects the actual disk pressure on the server.
     */
    async getStorageInfo(campaignId?: string): Promise<{ totalSize: number; count: number; dirPath: string; s3Count: number; s3Size: number }> {
        const filter: any = { recordingStatus: { $in: ['completed', 'recording'] } };
        if (campaignId) filter.campaignId = campaignId;
        const recs = await this.recordingModel.find(filter).exec();
        let totalSize = 0;
        let s3Count = 0;
        let s3Size = 0;
        for (const r of recs) {
            if (r.s3Key) {
                // Local file has been deleted post-upload — no disk footprint.
                s3Count++;
                s3Size += r.fileSize || 0;
                continue;
            }
            if (r.recordingStatus === 'recording') {
                try { totalSize += fs.statSync(r.filePath).size; } catch { /* ignore */ }
            } else {
                totalSize += r.fileSize || 0;
            }
        }
        return { totalSize, count: recs.length, dirPath: RECORDINGS_DIR, s3Count, s3Size };
    }

    async deleteOne(id: string): Promise<void> {
        const rec = await this.recordingModel.findById(id).exec();
        if (!rec) throw new NotFoundException('Recording not found');
        // Delete on-disk file (if still present)
        try { fs.unlinkSync(rec.filePath); } catch { /* file already gone */ }
        // Delete cached mp4 transcode (if any)
        try {
            const baseName = rec.fileName.replace(/\.[^.]+$/, '');
            const mp4Path = path.join(path.dirname(rec.filePath), `${baseName}.mp4`);
            if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
        } catch { /* ignore */ }
        // Delete S3 object if archived
        if (rec.s3Key) {
            try { await this.s3.deleteKey(rec.s3Key); } catch (err) {
                this.logger.warn(`S3 delete failed for ${rec.s3Key}: ${err}`);
            }
        }
        await this.recordingModel.findByIdAndDelete(id).exec();
    }

    async deleteAll(): Promise<{ deleted: number }> {
        const recs = await this.recordingModel.find().exec();
        let deleted = 0;
        for (const rec of recs) {
            try { fs.unlinkSync(rec.filePath); } catch { /* ignore */ }
            try {
                const baseName = rec.fileName.replace(/\.[^.]+$/, '');
                const mp4Path = path.join(path.dirname(rec.filePath), `${baseName}.mp4`);
                if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
            } catch { /* ignore */ }
            if (rec.s3Key) {
                try { await this.s3.deleteKey(rec.s3Key); } catch { /* ignore */ }
            }
            deleted++;
        }
        await this.recordingModel.deleteMany({}).exec();
        return { deleted };
    }

    async saveClip(opts: {
        videoBase64: string;
        mimeType: string;
        cameraId: string;
        cameraName: string;
        campaignId?: string;
        checkpointName?: string;
        location?: string;
        deviceId?: string;
        durationSeconds?: number;
    }): Promise<CctvRecordingDocument> {
        const startTime = new Date();
        const ts = startTime.toISOString().replace(/[:.]/g, '-');
        const ext = opts.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const fileName = `clip_${opts.cameraId}_${ts}.${ext}`;
        const filePath = path.join(RECORDINGS_DIR, fileName);

        const buf = Buffer.from(opts.videoBase64, 'base64');
        fs.writeFileSync(filePath, buf);

        const doc = await this.recordingModel.create({
            cameraId: opts.cameraId,
            cameraName: opts.cameraName,
            campaignId: opts.campaignId || '',
            checkpointName: opts.checkpointName || '',
            location: opts.location || '',
            deviceId: opts.deviceId || '',
            startTime,
            endTime: new Date(),
            duration: opts.durationSeconds || 0,
            fileSize: buf.byteLength,
            fileName,
            filePath,
            mimeType: opts.mimeType || 'video/webm',
            recordingStatus: 'completed',
        });
        this.logger.log(`Clip saved: ${fileName} (${buf.byteLength} bytes)`);
        return doc;
    }

    /**
     * Given a runner bib + campaignId, find all checkpoint arrival times
     * and match them to CCTV recordings, returning seek offsets.
     * Optimized: single batch query for recordings instead of N per-checkpoint queries.
     */
    async runnerLookup(bib: string, campaignId: string): Promise<any[]> {
        // 1. Find all eventIds belonging to this campaign
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

        // 2. Find all TimingRecords for this bib in these events
        const timings = await this.timingModel
            .find({ bib, eventId: { $in: objectIds } })
            .sort({ scanTime: 1 })
            .lean()
            .exec();

        if (!timings.length) return [];

        // 3. Batch: fetch ALL relevant recordings for this campaign ONCE
        const earliestScan = new Date((timings[0] as any).scanTime);
        const latestScan = new Date((timings[timings.length - 1] as any).scanTime);
        const allRecordings = await this.recordingModel.find({
            campaignId: { $in: campaignIdsToMatch },
            recordingStatus: { $in: ['completed', 'recording'] },
            startTime: { $lte: latestScan },
            $or: [
                { endTime: { $gte: earliestScan } },
                { endTime: null },
                { recordingStatus: 'recording' },
            ],
        }).sort({ startTime: -1 }).lean().exec();

        // 4. For each timing record, match recording in memory
        const results: any[] = [];
        for (const t of timings) {
            const checkpoint = (t as any).checkpoint;
            const scanTime = new Date((t as any).scanTime);
            const normalizedCheckpoint = this.normalizeCheckpointName(checkpoint);

            // Filter recordings that cover this scanTime
            const candidates = allRecordings.filter((r: any) => {
                const recStart = new Date(r.startTime);
                if (recStart > scanTime) return false;
                if (r.recordingStatus === 'recording' || !r.endTime) return true;
                return new Date(r.endTime) >= scanTime;
            });

            // Match strictly by checkpoint name. The previous fallback "if there is exactly
            // one candidate, use it" caused CP1's recording to be returned for a CP2 timing
            // when only CP1 was rolling at that moment — leaking video across checkpoints.
            // If no recording for THIS checkpoint covers the scan, return null and let the UI
            // show "no video" instead of the wrong one.
            const recording = candidates.find((candidate: any) => {
                return this.normalizeCheckpointName(candidate?.checkpointName) === normalizedCheckpoint;
            }) || null;

            const snapshot = recording ? this.getRecordingSnapshot(recording) : null;

            const seekSeconds = snapshot
                ? Math.max(0, Math.floor((scanTime.getTime() - snapshot.startTime.getTime()) / 1000))
                : 0;

            results.push({
                checkpoint,
                scanTime: scanTime.toISOString(),
                elapsedTime: (t as any).elapsedTime || null,
                splitTime: (t as any).splitTime || null,
                recording: recording ? {
                    _id: (recording as any)._id,
                    cameraId: (recording as any).cameraId,
                    cameraName: (recording as any).cameraName,
                    checkpointName: (recording as any).checkpointName,
                    startTime: snapshot?.startTime,
                    endTime: snapshot?.endTime,
                    duration: snapshot?.duration,
                    fileSize: snapshot?.fileSize,
                    recordingStatus: (recording as any).recordingStatus,
                } : null,
                seekSeconds,
            });
        }
        return results;
    }

    getFilePath(id: string): Promise<{ filePath: string; mimeType: string; fileName: string; duration: number; startTime: Date; endTime?: Date; recordingStatus: string; s3Url?: string }> {
        return this.recordingModel.findById(id).exec().then(rec => {
            if (!rec) throw new NotFoundException('Recording not found');
            return {
                filePath: rec.filePath,
                mimeType: rec.mimeType,
                fileName: rec.fileName,
                duration: rec.duration || 0,
                startTime: rec.startTime,
                endTime: rec.endTime,
                recordingStatus: rec.recordingStatus,
                // Caller can redirect to this URL when the local file is gone (post-archive).
                s3Url: rec.s3MasterManifestUrl || undefined,
            };
        });
    }
}

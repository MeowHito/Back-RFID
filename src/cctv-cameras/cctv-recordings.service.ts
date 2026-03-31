import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { CctvRecording, CctvRecordingDocument } from './cctv-recording.schema';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Event, EventDocument } from '../events/event.schema';
import { LiveCameraInfo } from './cctv.gateway';

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
    ) {
        fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
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

    async findAll(): Promise<CctvRecordingDocument[]> {
        return this.recordingModel.find({ recordingStatus: 'completed' }).sort({ startTime: -1 }).exec();
    }

    async getStorageInfo(): Promise<{ totalSize: number; count: number; dirPath: string }> {
        const recs = await this.recordingModel.find({ recordingStatus: 'completed' }).exec();
        const totalSize = recs.reduce((sum, r) => sum + (r.fileSize || 0), 0);
        return { totalSize, count: recs.length, dirPath: RECORDINGS_DIR };
    }

    async deleteOne(id: string): Promise<void> {
        const rec = await this.recordingModel.findById(id).exec();
        if (!rec) throw new NotFoundException('Recording not found');
        try { fs.unlinkSync(rec.filePath); } catch { /* file already gone */ }
        await this.recordingModel.findByIdAndDelete(id).exec();
    }

    async deleteAll(): Promise<{ deleted: number }> {
        const recs = await this.recordingModel.find().exec();
        let deleted = 0;
        for (const rec of recs) {
            try { fs.unlinkSync(rec.filePath); } catch { /* ignore */ }
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

        // 2. Find all TimingRecords for this bib in these events
        const timings = await this.timingModel
            .find({ bib, eventId: { $in: objectIds } })
            .sort({ scanTime: 1 })
            .lean()
            .exec();

        if (!timings.length) return [];

        // 3. For each timing record, find matching CCTV recording
        const results: any[] = [];
        for (const t of timings) {
            const checkpoint = (t as any).checkpoint;
            const scanTime = new Date((t as any).scanTime);

            // Find recording covering this scanTime at this checkpoint
            const recording = await this.recordingModel.findOne({
                campaignId,
                checkpointName: checkpoint,
                recordingStatus: 'completed',
                startTime: { $lte: scanTime },
                $or: [
                    { endTime: { $gte: scanTime } },
                    { endTime: null },
                ],
            }).lean().exec();

            const seekSeconds = recording
                ? Math.max(0, Math.floor((scanTime.getTime() - new Date((recording as any).startTime).getTime()) / 1000))
                : 0;

            results.push({
                checkpoint,
                scanTime: scanTime.toISOString(),
                elapsedTime: (t as any).elapsedTime || null,
                splitTime: (t as any).splitTime || null,
                recording: recording ? {
                    _id: (recording as any)._id,
                    cameraName: (recording as any).cameraName,
                    startTime: (recording as any).startTime,
                    endTime: (recording as any).endTime,
                    duration: (recording as any).duration,
                    fileSize: (recording as any).fileSize,
                } : null,
                seekSeconds,
            });
        }
        return results;
    }

    getFilePath(id: string): Promise<{ filePath: string; mimeType: string; fileName: string }> {
        return this.recordingModel.findById(id).exec().then(rec => {
            if (!rec) throw new NotFoundException('Recording not found');
            return { filePath: rec.filePath, mimeType: rec.mimeType, fileName: rec.fileName };
        });
    }
}

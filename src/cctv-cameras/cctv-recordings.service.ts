import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { CctvRecording, CctvRecordingDocument } from './cctv-recording.schema';
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

    getFilePath(id: string): Promise<{ filePath: string; mimeType: string; fileName: string }> {
        return this.recordingModel.findById(id).exec().then(rec => {
            if (!rec) throw new NotFoundException('Recording not found');
            return { filePath: rec.filePath, mimeType: rec.mimeType, fileName: rec.fileName };
        });
    }
}

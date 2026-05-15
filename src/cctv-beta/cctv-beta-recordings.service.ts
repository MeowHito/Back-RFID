import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CctvBetaRecording, CctvBetaRecordingDocument } from './cctv-beta-recording.schema';

@Injectable()
export class CctvBetaRecordingsService {
    constructor(
        @InjectModel(CctvBetaRecording.name)
        private readonly recordingModel: Model<CctvBetaRecordingDocument>,
    ) {}

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
}

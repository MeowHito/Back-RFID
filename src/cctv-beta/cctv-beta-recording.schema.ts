import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CctvBetaRecordingDocument = CctvBetaRecording & Document;

@Schema({ timestamps: true, collection: 'cctvbetarecordings' })
export class CctvBetaRecording {
    @Prop({ type: Types.ObjectId, ref: 'CctvBetaCamera', required: true })
    cameraId: Types.ObjectId;

    @Prop({ required: true })
    cameraName: string;

    @Prop()
    campaignId: string;

    @Prop()
    checkpointName: string;

    @Prop({ required: true })
    streamKey: string;

    // Authoritative ingest start time (NTP-synced EC2 clock at on-publish webhook)
    @Prop({ required: true })
    serverIngestStart: Date;

    // Optional encoder-reported first frame time (for drift debugging only - NEVER use as authoritative)
    @Prop()
    encoderFirstFrameTime: Date;

    @Prop()
    serverIngestEnd: Date;

    @Prop({ default: 0 })
    duration: number;

    @Prop({ default: 0 })
    fileSize: number;

    // HLS manifest path served from EC2 (hot) or S3 (cold)
    @Prop()
    hlsManifestPath: string;

    // S3 archive
    @Prop()
    s3Bucket: string;

    @Prop()
    s3Key: string;

    @Prop()
    s3MasterManifestUrl: string;

    @Prop({ default: 'rtmp', enum: ['rtmp', 'srt'] })
    protocol: string;

    @Prop({ default: 'recording', enum: ['recording', 'completed', 'archived', 'error'] })
    recordingStatus: string;

    @Prop()
    errorMessage: string;
}

export const CctvBetaRecordingSchema = SchemaFactory.createForClass(CctvBetaRecording);

CctvBetaRecordingSchema.index({ campaignId: 1 });
CctvBetaRecordingSchema.index({ cameraId: 1 });
CctvBetaRecordingSchema.index({ streamKey: 1 });
CctvBetaRecordingSchema.index({ serverIngestStart: -1 });
CctvBetaRecordingSchema.index({ campaignId: 1, recordingStatus: 1, serverIngestStart: 1 });
CctvBetaRecordingSchema.index({ campaignId: 1, checkpointName: 1, serverIngestStart: 1, serverIngestEnd: 1 });

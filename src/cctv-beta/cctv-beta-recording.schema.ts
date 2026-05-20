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

    // s3Key now points at the fragmented-mp4 recording file (e.g.
    // "hls/live/{streamKey}/2026-05-20_07-13-33.mp4"). Older rows may still
    // hold the LL-HLS manifest path ("hls/live/{streamKey}/index.m3u8") — the
    // playback layer detects the extension and switches between progressive
    // mp4 and HLS accordingly.
    @Prop()
    s3Key: string;

    // Full https URL derived from bucket + s3Key. Despite the historic name
    // ("MasterManifest"), this may point to an .mp4 file now — players must
    // sniff by extension rather than trusting it's HLS.
    @Prop()
    s3MasterManifestUrl: string;

    @Prop({ default: 'rtmp', enum: ['rtmp', 'srt'] })
    protocol: string;

    @Prop({ default: 'recording', enum: ['recording', 'completed', 'archived', 'error'] })
    recordingStatus: string;

    @Prop()
    errorMessage: string;

    /**
     * Per-segment metadata for "merged" sessions.
     *
     * Larix / IRL Pro on flaky cell networks may drop + reconnect many times during a
     * single recording session, causing MediaMTX to fire multiple on-publish/on-unpublish
     * webhook pairs and write multiple .mp4 files to disk. Without merging, that one
     * session shows up as 5-10 separate rows in /admin/cctv-beta-recordings.
     *
     * When on-publish fires within RECORDING_MERGE_WINDOW_SECONDS (default 30s) of the
     * last unpublish for the same streamKey, the existing recording row is REUSED and a
     * new entry is appended here instead. Top-level fields (`s3Key`, `serverIngestEnd`,
     * `duration`, `fileSize`) always reflect the *most-recent* segment for playback,
     * while `segments` preserves the full history.
     */
    @Prop({ type: [Object], default: [] })
    segments: Array<{
        s3Bucket?: string;
        s3Key?: string;
        s3MasterManifestUrl?: string;
        startedAt: Date;
        endedAt?: Date;
        fileSize?: number;
        duration?: number;
    }>;
}

export const CctvBetaRecordingSchema = SchemaFactory.createForClass(CctvBetaRecording);

CctvBetaRecordingSchema.index({ campaignId: 1 });
CctvBetaRecordingSchema.index({ cameraId: 1 });
CctvBetaRecordingSchema.index({ streamKey: 1 });
CctvBetaRecordingSchema.index({ serverIngestStart: -1 });
CctvBetaRecordingSchema.index({ campaignId: 1, recordingStatus: 1, serverIngestStart: 1 });
CctvBetaRecordingSchema.index({ campaignId: 1, checkpointName: 1, serverIngestStart: 1, serverIngestEnd: 1 });

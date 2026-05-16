import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CctvBetaCameraDocument = CctvBetaCamera & Document;

@Schema({ timestamps: true, collection: 'cctvbetacameras' })
export class CctvBetaCamera {
    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
    campaignId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Checkpoint' })
    checkpointId: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop()
    coverageZone: string;

    @Prop()
    checkpointName: string;

    // Stream key = `${cameraId}_${randomBytes(16).hex}` - used to authenticate Larix push
    @Prop({ required: true, unique: true })
    streamKey: string;

    // Computed ingest URLs returned to Larix (server fills these on read)
    @Prop()
    ingestRtmpUrl: string;

    // RTMP server-only URL (without stream key) — used by IRL Pro which takes Server + Key in separate fields
    @Prop()
    ingestRtmpServer: string;

    @Prop()
    ingestSrtUrl: string;

    // Playback URLs (filled by MediaMTX webhooks)
    @Prop()
    hlsUrl: string;

    @Prop()
    llHlsUrl: string;

    @Prop()
    webrtcUrl: string;

    @Prop({ default: 'offline', enum: ['online', 'offline', 'publishing'] })
    status: string;

    @Prop({ default: '1080p', enum: ['720p', '1080p', '4K'] })
    resolution: string;

    @Prop({ default: 'srt', enum: ['srt', 'rtmp'] })
    preferredProtocol: string;

    @Prop({ default: 0 })
    viewerCount: number;

    @Prop()
    lastPublishAt: Date;

    @Prop()
    lastUnpublishAt: Date;

    @Prop({ default: true })
    autoRecord: boolean;
}

export const CctvBetaCameraSchema = SchemaFactory.createForClass(CctvBetaCamera);

CctvBetaCameraSchema.index({ campaignId: 1 });
CctvBetaCameraSchema.index({ checkpointId: 1 });
CctvBetaCameraSchema.index({ streamKey: 1 }, { unique: true });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CctvCameraDocument = CctvCamera & Document;

@Schema({ timestamps: true })
export class CctvCamera {
    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
    campaignId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Checkpoint' })
    checkpointId: Types.ObjectId;

    @Prop({ required: true })
    name: string;

    @Prop()
    streamUrl: string; // embed URL for live stream (YouTube, Facebook, etc.)

    @Prop()
    deviceId: string; // optional device identifier

    @Prop({ default: 'offline', enum: ['online', 'offline', 'paused'] })
    status: string;

    @Prop({ default: false })
    isLiveStreamEnabled: boolean;

    @Prop()
    coverageZone: string; // text description of the zone

    @Prop({ default: '1080p', enum: ['720p', '1080p', '4K'] })
    resolution: string;

    @Prop({ default: 0 })
    viewerCount: number;

    @Prop()
    lastSeenAt: Date;

    @Prop()
    checkpointName: string; // denormalized for quick display
}

export const CctvCameraSchema = SchemaFactory.createForClass(CctvCamera);

CctvCameraSchema.index({ campaignId: 1 });
CctvCameraSchema.index({ checkpointId: 1 });

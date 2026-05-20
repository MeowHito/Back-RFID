import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CctvSettingsDocument = CctvSettings & Document;

@Schema({ timestamps: true })
export class CctvSettings {
    @Prop({ default: 'singleton' }) key: string; // always "singleton"
    @Prop({ default: '1080p', enum: ['720p', '1080p', '4K'] }) resolution: string;
    @Prop({ default: true }) autoScale: boolean;
    @Prop({ default: 15 }) bufferMinutes: number;
    @Prop({ default: 30 }) preArrivalBuffer: number; // seconds for runner alert
    @Prop({ default: 10 }) clipBufferSeconds: number; // total clip length on /runner/[id]
    /** Seconds BEFORE the runner's checkpoint scan that the clip on /runner/[id] starts.
     *  Allowed values: 5, 10, 15, 20 (enforced in controller). Remainder of clipBufferSeconds plays after the scan. */
    @Prop({ default: 5 }) clipPreBufferSeconds: number;
    @Prop({ default: 800 }) videoBitrateKbps: number;
    /** When false, viewers (followers / public) see the recording but cannot download it.
     *  Admins always see the download button regardless. Applies to BOTH classic CCTV and CCTV Beta. */
    @Prop({ default: true }) allowDownload: boolean;
}

export const CctvSettingsSchema = SchemaFactory.createForClass(CctvSettings);
CctvSettingsSchema.index({ key: 1 }, { unique: true });

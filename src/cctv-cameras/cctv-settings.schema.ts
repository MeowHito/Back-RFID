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
    @Prop({ default: 10 }) clipBufferSeconds: number; // seconds to keep in rolling buffer for Save Clip
    @Prop({ default: 800 }) videoBitrateKbps: number;
}

export const CctvSettingsSchema = SchemaFactory.createForClass(CctvSettings);
CctvSettingsSchema.index({ key: 1 }, { unique: true });

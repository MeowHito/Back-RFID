import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CctvRecordingDocument = CctvRecording & Document;

@Schema({ timestamps: true })
export class CctvRecording {
    @Prop({ required: true }) cameraId: string;
    @Prop({ required: true }) cameraName: string;
    @Prop() campaignId: string;
    @Prop() checkpointName: string;
    @Prop() location: string;
    @Prop() deviceId: string;
    @Prop({ required: true }) startTime: Date;
    @Prop() endTime: Date;
    @Prop({ default: 0 }) duration: number;   // seconds
    @Prop({ default: 0 }) fileSize: number;   // bytes
    @Prop({ required: true }) fileName: string;
    @Prop({ required: true }) filePath: string;
    @Prop({ default: 'video/webm' }) mimeType: string;
    @Prop({ default: 'completed', enum: ['recording', 'completed', 'error'] }) recordingStatus: string;
}

export const CctvRecordingSchema = SchemaFactory.createForClass(CctvRecording);
CctvRecordingSchema.index({ campaignId: 1 });
CctvRecordingSchema.index({ cameraId: 1 });
CctvRecordingSchema.index({ startTime: -1 });

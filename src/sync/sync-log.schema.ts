import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SyncLogDocument = SyncLog & Document;

@Schema({ timestamps: true })
export class SyncLog {
    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
    campaignId: Types.ObjectId;

    @Prop({ required: true, enum: ['success', 'error', 'pending'] })
    status: string;

    @Prop()
    message: string;

    @Prop()
    recordsProcessed: number;

    @Prop()
    recordsFailed: number;

    @Prop()
    startTime: Date;

    @Prop()
    endTime: Date;

    @Prop({ type: Object })
    errorDetails: Record<string, any>;
}

export const SyncLogSchema = SchemaFactory.createForClass(SyncLog);

// Indexes
SyncLogSchema.index({ campaignId: 1, createdAt: -1 });
SyncLogSchema.index({ status: 1 });

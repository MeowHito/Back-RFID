import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TimingRecordDocument = TimingRecord & Document;

@Schema({ timestamps: true })
export class TimingRecord {
    @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
    eventId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Runner', required: true })
    runnerId: Types.ObjectId;

    @Prop({ required: true })
    bib: string;

    @Prop({ required: true })
    checkpoint: string; // e.g., 'START', 'CP1', 'CP2', 'FINISH'

    @Prop({ required: true })
    scanTime: Date;

    @Prop()
    rfidTag: string;

    @Prop({ default: 1 })
    order: number; // Order of this checkpoint for this runner

    @Prop()
    note: string; // e.g., 'Check-in', 'Manual entry'

    @Prop()
    splitTime: number; // Time from previous checkpoint in ms

    @Prop()
    elapsedTime: number; // Time from start in ms
}

export const TimingRecordSchema = SchemaFactory.createForClass(TimingRecord);

// Index for quick lookups
TimingRecordSchema.index({ eventId: 1, runnerId: 1 });
TimingRecordSchema.index({ eventId: 1, bib: 1, checkpoint: 1 });
TimingRecordSchema.index({ scanTime: -1 });
TimingRecordSchema.index({ eventId: 1, checkpoint: 1, scanTime: -1 }); // Per-checkpoint queries
TimingRecordSchema.index({ runnerId: 1, order: 1 }); // Runner timeline

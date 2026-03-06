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

    @Prop()
    distanceFromStart: number; // Distance from start in km

    @Prop()
    netTime: number; // Net time (chip time) in ms

    @Prop()
    gunTime: number; // Gun time in ms

    // === Additional RaceTiger Pass Time fields ===
    @Prop()
    splitNo: number; // Split number/order from RaceTiger

    @Prop()
    splitDesc: string; // Split description

    @Prop()
    netPace: string; // Net pace e.g. "05:25"

    @Prop()
    gunPace: string; // Gun pace e.g. "05:30"

    @Prop()
    splitPace: string; // Split pace

    @Prop()
    gunTimeMs: number; // Gun time in ms (raw RaceTiger value)

    @Prop()
    netTimeMs: number; // Net time in ms (raw RaceTiger value)

    @Prop()
    totalGunTime: number; // Total cumulative gun time in ms

    @Prop()
    totalNetTime: number; // Total cumulative net time in ms

    @Prop()
    totalGunTimeMs: number; // Total gun time in ms (raw)

    @Prop()
    totalNetTimeMs: number; // Total net time in ms (raw)

    @Prop()
    chipCode: string; // Chip code from RFID scan

    @Prop()
    printingCode: string; // Printing code on athlete shirt

    @Prop()
    supplement: string; // Supplement data

    @Prop()
    cutOff: string; // Cut-off status

    @Prop()
    legTime: number; // Leg time in ms

    @Prop()
    legPace: string; // Leg pace

    @Prop()
    legDistance: number; // Leg distance in km

    @Prop()
    lagMs: number; // Lag in ms
}
export const TimingRecordSchema = SchemaFactory.createForClass(TimingRecord);

// Index for quick lookups
TimingRecordSchema.index({ eventId: 1, runnerId: 1 });
TimingRecordSchema.index({ eventId: 1, bib: 1, checkpoint: 1 });
TimingRecordSchema.index({ scanTime: -1 });
TimingRecordSchema.index({ eventId: 1, checkpoint: 1, scanTime: -1 }); // Per-checkpoint queries
TimingRecordSchema.index({ runnerId: 1, order: 1 }); // Runner timeline
TimingRecordSchema.index({ eventId: 1, runnerId: 1, checkpoint: 1, order: 1 }, { unique: true }); // Upsert key (per-lap)
TimingRecordSchema.index({ eventId: 1, scanTime: -1, runnerId: 1 }); // Fast aggregation for getLatestPerRunner

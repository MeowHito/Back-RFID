import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CheckpointDocument = Checkpoint & Document;

@Schema({ timestamps: true })
export class Checkpoint {
    @Prop({ required: true, unique: true })
    uuid: string;

    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
    campaignId: Types.ObjectId;

    @Prop({ required: true })
    name: string; // e.g., "START", "CP1", "CP2", "FINISH"

    @Prop({ required: true, enum: ['start', 'checkpoint', 'finish'] })
    type: string;

    @Prop({ required: true })
    orderNum: number;

    @Prop({ default: true })
    active?: boolean;

    @Prop()
    description?: string; // timing method (e.g. 'rfid' | 'manual')

    @Prop()
    readerId?: string; // reader ID for RFID timing

    @Prop()
    location?: string;

    @Prop()
    latitude?: number;

    @Prop()
    longitude?: number;

    @Prop()
    kmCumulative?: number;

    @Prop()
    cutoffTime?: string; // e.g. "10:30" or "-"
}

export const CheckpointSchema = SchemaFactory.createForClass(Checkpoint);

// Indexes
CheckpointSchema.index({ campaignId: 1, orderNum: 1 });
CheckpointSchema.index({ uuid: 1 }, { unique: true });

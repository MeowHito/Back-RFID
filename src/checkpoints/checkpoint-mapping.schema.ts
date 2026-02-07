import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CheckpointMappingDocument = CheckpointMapping & Document;

@Schema({ timestamps: true })
export class CheckpointMapping {
    @Prop({ type: Types.ObjectId, ref: 'Checkpoint', required: true })
    checkpointId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
    eventId: Types.ObjectId;

    @Prop()
    distanceFromStart?: number; // in kilometers

    @Prop()
    cutoffTime?: number; // in minutes

    @Prop({ default: true })
    active?: boolean;

    @Prop()
    orderNum?: number;
}

export const CheckpointMappingSchema = SchemaFactory.createForClass(CheckpointMapping);

// Indexes
CheckpointMappingSchema.index({ checkpointId: 1, eventId: 1 }, { unique: true });
CheckpointMappingSchema.index({ eventId: 1, orderNum: 1 });

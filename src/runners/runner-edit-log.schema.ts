import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RunnerEditLogDocument = RunnerEditLog & Document;

@Schema({ timestamps: { createdAt: 'changedAt', updatedAt: false } })
export class RunnerEditLog {
    @Prop({ type: Types.ObjectId, ref: 'Runner', required: true })
    runnerId: Types.ObjectId;

    @Prop({ required: true })
    bib: string;

    @Prop({ required: true })
    changedBy: string; // admin email

    @Prop({
        type: [{ field: String, oldValue: String, newValue: String }],
        default: [],
    })
    changes: { field: string; oldValue: string; newValue: string }[];
}

export const RunnerEditLogSchema = SchemaFactory.createForClass(RunnerEditLog);

RunnerEditLogSchema.index({ runnerId: 1, changedAt: -1 });

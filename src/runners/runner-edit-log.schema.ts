import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RunnerEditLogDocument = RunnerEditLog & Document;

/**
 * Permanent audit trail of every manual admin edit to a runner.
 *
 * Entries are never deleted automatically — not by a RaceTiger sync, not by the
 * clean-slate runner delete/re-import. They only disappear when an admin explicitly
 * clears the log for an event/campaign from /admin/edit-history.
 *
 * `eventId` is denormalised onto the log so history stays scopeable (and deletable
 * per event) even when the runner row it points at has been wiped and re-created.
 */
@Schema({ timestamps: { createdAt: 'changedAt', updatedAt: false } })
export class RunnerEditLog {
    @Prop({ type: Types.ObjectId, ref: 'Runner', required: true })
    runnerId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Event' })
    eventId: Types.ObjectId; // denormalised — survives runner delete/re-import

    @Prop({ required: true })
    bib: string;

    // Name/category snapshot at edit time, so the log reads correctly even if the
    // runner is later renamed or removed entirely.
    @Prop()
    runnerName: string;

    @Prop()
    category: string;

    @Prop({ required: true })
    changedBy: string; // admin email

    /** Where the change came from — drives the badge on the history table. */
    @Prop({ default: 'edit', enum: ['edit', 'status', 'bulk-status', 'restore'] })
    source: string;

    @Prop()
    note: string; // optional context (e.g. status note "ขาเจ็บ", checkpoint)

    @Prop({
        type: [{ field: String, oldValue: String, newValue: String }],
        default: [],
    })
    changes: { field: string; oldValue: string; newValue: string }[];
}

export const RunnerEditLogSchema = SchemaFactory.createForClass(RunnerEditLog);

RunnerEditLogSchema.index({ runnerId: 1, changedAt: -1 });
RunnerEditLogSchema.index({ eventId: 1, changedAt: -1 });
RunnerEditLogSchema.index({ eventId: 1, bib: 1, changedAt: -1 });

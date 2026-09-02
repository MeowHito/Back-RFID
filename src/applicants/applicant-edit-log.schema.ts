import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicantEditLogDocument = ApplicantEditLog & Document;

/**
 * Permanent audit trail of admin changes to the applicant roster
 * (/admin/applicants-import). Mirrors RunnerEditLog, but scoped to a
 * campaign instead of an event — applicants aren't synced from RaceTiger,
 * so there's no drift/restore concept here, just a plain change log.
 */
@Schema({ timestamps: { createdAt: 'changedAt', updatedAt: false } })
export class ApplicantEditLog {
    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true, index: true })
    campaignId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Applicant' })
    applicantId: Types.ObjectId; // denormalised — survives applicant delete

    @Prop()
    bib: string;

    @Prop()
    applicantName: string; // snapshot at edit time

    @Prop({ required: true })
    changedBy: string; // admin email

    /** Where the change came from — drives the badge on the history table. */
    @Prop({ default: 'edit', enum: ['edit', 'delete', 'bulk-import', 'clear-all'] })
    source: string;

    @Prop()
    note: string; // e.g. "นำเข้า 581 รายการ (แทนที่ทั้งหมด)"

    @Prop({
        type: [{ field: String, oldValue: String, newValue: String }],
        default: [],
    })
    changes: { field: string; oldValue: string; newValue: string }[];
}

export const ApplicantEditLogSchema = SchemaFactory.createForClass(ApplicantEditLog);

ApplicantEditLogSchema.index({ campaignId: 1, changedAt: -1 });
ApplicantEditLogSchema.index({ campaignId: 1, bib: 1, changedAt: -1 });

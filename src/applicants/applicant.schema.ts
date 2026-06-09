import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicantDocument = Applicant & Document;

/**
 * Applicant = registration roster row uploaded from an Excel file by an admin.
 * Scoped to a Campaign. Used by the public "ตรวจสอบข้อมูลการสมัคร" search page,
 * which lets anyone look a person up by ID card / BIB / name / phone / surname.
 */
@Schema({ timestamps: true })
export class Applicant {
    @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true, index: true })
    campaignId: Types.ObjectId;

    @Prop({ default: '' })
    idCard: string; // เลขบัตรประชาชน

    @Prop({ default: '' })
    bib: string; // หมายเลข BIB

    @Prop({ default: '' })
    firstName: string; // ชื่อ

    @Prop({ default: '' })
    lastName: string; // นามสกุล

    @Prop({ default: '' })
    fullName: string; // ชื่อ-นามสกุล (combined, used for searching)

    @Prop({ default: '' })
    phone: string; // เบอร์โทร

    @Prop({ default: null })
    age: number; // อายุ

    @Prop({ default: '' })
    gender: string; // เพศ (raw text e.g. ชาย/หญิง/M/F)

    @Prop({ default: '' })
    ageGroup: string; // กลุ่มอายุ

    @Prop({ default: '' })
    shirtSize: string; // ขนาดเสื้อ

    @Prop({ default: '' })
    category: string; // ประเภท/ระยะ

    @Prop({ default: '' })
    team: string; // ทีม/กลุ่ม

    // Any extra columns from the uploaded sheet that don't map to a known field.
    @Prop({ type: Object, default: {} })
    extra: Record<string, string>;
}

export const ApplicantSchema = SchemaFactory.createForClass(Applicant);

// Search indexes — public lookup by any identifier
ApplicantSchema.index({ campaignId: 1, idCard: 1 });
ApplicantSchema.index({ campaignId: 1, bib: 1 });
ApplicantSchema.index({ campaignId: 1, phone: 1 });
ApplicantSchema.index({ campaignId: 1, fullName: 1 });
ApplicantSchema.index({ campaignId: 1, firstName: 1 });
ApplicantSchema.index({ campaignId: 1, lastName: 1 });

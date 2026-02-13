import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RunnerDocument = Runner & Document;

@Schema({ timestamps: true })
export class Runner {
    @Prop({ type: Types.ObjectId, ref: 'Event', required: true })
    eventId: Types.ObjectId;

    @Prop({ required: true })
    bib: string;

    @Prop({ required: true })
    firstName: string;

    @Prop({ required: true })
    lastName: string;

    @Prop()
    firstNameTh: string;

    @Prop()
    lastNameTh: string;

    @Prop({ required: true, enum: ['M', 'F'] })
    gender: string;

    @Prop()
    ageGroup: string; // e.g., '30-39', '40-49'

    @Prop()
    age: number;

    @Prop()
    box: string; // Starting box/group

    @Prop()
    team: string;

    @Prop({ required: true })
    category: string; // e.g., '21K', '10K', '5K'

    @Prop({ default: 'not_started' })
    status: string; // not_started, in_progress, finished, dnf, dns

    @Prop()
    rfidTag: string; // RFID chip ID

    @Prop()
    checkInTime: Date;

    @Prop()
    startTime: Date;

    @Prop()
    finishTime: Date;

    @Prop()
    netTime: number; // in milliseconds

    @Prop()
    elapsedTime: number; // in milliseconds

    @Prop({ default: 0 })
    overallRank: number;

    @Prop({ default: 0 })
    genderRank: number;

    @Prop({ default: 0 })
    ageGroupRank: number;

    @Prop()
    latestCheckpoint: string;

    // New fields from reference
    @Prop()
    chipCode: string; // Alternative RFID chip code

    @Prop()
    nationality: string;

    @Prop()
    birthDate: Date;

    @Prop()
    idNo: string; // ID number

    @Prop()
    shirtSize: string;

    @Prop()
    teamName: string;

    @Prop()
    registerDate: Date;

    @Prop({ default: false })
    isStarted: boolean;

    @Prop({ default: true })
    allowRFIDSync: boolean;

    @Prop()
    email: string;

    @Prop()
    phone: string;

    @Prop()
    emergencyContact: string;

    @Prop()
    emergencyPhone: string;

    @Prop()
    medicalInfo: string;

    @Prop()
    bloodType: string; // A, B, AB, O, A+, A-, B+, B-, AB+, AB-, O+, O-

    @Prop()
    chronicDiseases: string; // โรคประจำตัว

    @Prop()
    address: string; // ที่อยู่

    // Category ranking
    @Prop({ default: 0 })
    categoryRank: number;
}

export const RunnerSchema = SchemaFactory.createForClass(Runner);

// Compound index for quick lookups
RunnerSchema.index({ eventId: 1, bib: 1 }, { unique: true });
RunnerSchema.index({ eventId: 1, rfidTag: 1 });
RunnerSchema.index({ eventId: 1, chipCode: 1 });
RunnerSchema.index({ eventId: 1, status: 1 });
RunnerSchema.index({ eventId: 1, category: 1, netTime: 1 });
// Additional performance indexes
RunnerSchema.index({ eventId: 1, gender: 1, status: 1 }); // Gender + status filtering
RunnerSchema.index({ eventId: 1, overallRank: 1 }); // Sorted results by rank
RunnerSchema.index({ eventId: 1, category: 1, gender: 1, status: 1 }); // Combined filtering
RunnerSchema.index({ eventId: 1, latestCheckpoint: 1 }); // Checkpoint tracking
RunnerSchema.index({ eventId: 1, category: 1, status: 1, netTime: 1 }); // Ranking calculation
RunnerSchema.index({ eventId: 1, ageGroup: 1 }); // Age group aggregation
RunnerSchema.index({ eventId: 1, category: 1, ageGroup: 1, gender: 1 }); // Detailed ranking
RunnerSchema.index({ eventId: 1, status: 1, netTime: 1 }); // Finish-by-time aggregation
RunnerSchema.index({ createdAt: -1 }); // findAll sort

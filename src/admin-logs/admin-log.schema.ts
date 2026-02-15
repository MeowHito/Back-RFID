import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminLogDocument = AdminLog & Document;

@Schema({ timestamps: true })
export class AdminLog {
    @Prop({ required: true })
    loginAccount: string; // email used to login

    @Prop({ required: true })
    accountName: string; // firstName + lastName

    @Prop()
    clientIp: string;

    @Prop()
    countryRegion: string;

    @Prop()
    provinceStateCity: string;

    @Prop()
    city: string;

    @Prop()
    serviceProvider: string;

    @Prop({ required: true })
    startTime: Date;

    @Prop({ default: '' })
    remark: string;

    @Prop({ required: true })
    userUuid: string;

    @Prop({ required: true, enum: ['admin', 'organizer'] })
    role: string;
}

export const AdminLogSchema = SchemaFactory.createForClass(AdminLog);

// Indexes for efficient querying
AdminLogSchema.index({ startTime: -1 });
AdminLogSchema.index({ userUuid: 1 });
AdminLogSchema.index({ role: 1 });

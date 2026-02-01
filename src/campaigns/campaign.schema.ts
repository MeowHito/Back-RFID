import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignDocument = Campaign & Document;

@Schema({ timestamps: true })
export class Campaign {
    @Prop({ required: true, unique: true })
    uuid: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    shortName: string;

    @Prop()
    description: string;

    @Prop({ required: true })
    eventDate: Date;

    @Prop()
    location: string;

    @Prop()
    logoUrl: string;

    @Prop()
    pictureUrl: string;

    @Prop()
    bgUrl: string;

    @Prop()
    website: string;

    @Prop()
    facebook: string;

    @Prop()
    email: string;

    @Prop()
    contactName: string;

    @Prop()
    contactTel: string;

    @Prop({ default: 'draft' })
    status: string; // draft, active, finished

    @Prop({ default: true })
    isDraft: boolean;

    @Prop({ default: false })
    isApproveCertificate: boolean;

    @Prop({ default: true })
    allowRFIDSync: boolean;

    @Prop()
    rfidToken: string;

    @Prop()
    organizerName: string;

    @Prop()
    organizerUuid: string;

    // Theme customization
    @Prop()
    chipBgUrl: string;

    @Prop()
    chipBanner: string;

    @Prop()
    chipPrimaryColor: string;

    @Prop()
    chipSecondaryColor: string;

    @Prop()
    chipModeColor: string;

    @Prop()
    certTextColor: string;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// Indexes
CampaignSchema.index({ uuid: 1 }, { unique: true });
CampaignSchema.index({ eventDate: -1 });
CampaignSchema.index({ status: 1 });

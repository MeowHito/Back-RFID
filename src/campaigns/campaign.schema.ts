import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignDocument = Campaign & Document;

// Race category/type embedded in Campaign
export interface RaceCategory {
    name: string;       // e.g., "100M", "50K", "Full"
    distance: string;   // e.g., "175 KM"
    startTime: string;  // e.g., "10:00"
    cutoff: string;     // e.g., "48 ชม."
    elevation?: string; // e.g., "10,400 m+" (for trail races)
    raceType?: string;  // e.g., "Marathon", "Half Marathon" (for road races)
    badgeColor: string; // e.g., "#e60000"
    status: string;     // "live", "wait", "finished"
    itra?: number;      // ITRA points
    utmbIndex?: string; // UTMB Index
}

@Schema({ timestamps: true })
export class Campaign {
    @Prop({ required: true, unique: true })
    uuid: string;

    @Prop({ unique: true, sparse: true })
    slug: string;

    @Prop({ required: true })
    name: string;

    @Prop()
    nameTh: string; // Thai name

    @Prop()
    nameEn: string; // English name

    @Prop()
    shortName: string;

    @Prop()
    description: string;

    @Prop({ required: true })
    eventDate: Date;

    @Prop()
    eventEndDate: Date; // For multi-day events

    @Prop()
    location: string;

    @Prop()
    locationTh: string; // Thai location

    @Prop()
    locationEn: string; // English location

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
    status: string; // draft, active, live, finished

    @Prop({ default: true })
    isDraft: boolean;

    @Prop({ default: false })
    isApproveCertificate: boolean;

    /** Only one campaign can be featured (gold trophy); shown in admin header */
    @Prop({ default: false })
    isFeatured: boolean;

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

    // Race categories (100K, 50K, etc.)
    @Prop({ type: [Object], default: [] })
    categories: RaceCategory[];

    // Countdown settings
    @Prop()
    countdownDate: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// Indexes
CampaignSchema.index({ uuid: 1 }, { unique: true });
CampaignSchema.index({ slug: 1 }, { unique: true, sparse: true });
CampaignSchema.index({ eventDate: -1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ isDraft: 1, status: 1 }); // For filtering published campaigns
CampaignSchema.index({ isDraft: 1, eventDate: -1 }); // For sorted published campaigns
CampaignSchema.index({ isFeatured: 1 }); // For get-featured query (admin header, mapping, etc.)


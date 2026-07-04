import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, unique: true })
    uuid: string;

    @Prop({ required: true, unique: true })
    email: string;

    @Prop()
    username: string;

    @Prop({ required: true })
    password: string;

    @Prop()
    firstName: string;

    @Prop()
    lastName: string;

    @Prop({ default: 'user', enum: ['admin_master', 'admin', 'organizer', 'user', 'station'] })
    role: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop()
    lastLogin: Date;

    @Prop()
    phone: string;

    @Prop()
    avatarUrl: string;

    // For password reset
    @Prop()
    resetToken: string;

    @Prop()
    resetTokenExpiry: Date;

    // === Granular Permissions ===
    @Prop({ default: false })
    allEventsAccess: boolean;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Campaign' }], default: [] })
    allowedCampaigns: Types.ObjectId[];

    @Prop({ type: Object, default: () => ({}) })
    modulePermissions: Record<string, { view: boolean; create: boolean; delete: boolean; export: boolean }>;

    /**
     * The campaign this user is currently working on (their own "featured" / starred
     * event). Per-user so switching work in one admin account never affects others.
     * Empty → fall back to the global featured campaign.
     */
    @Prop({ default: '' })
    selectedCampaignId: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes
UserSchema.index({ username: 1 });

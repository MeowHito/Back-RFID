import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventDocument = Event & Document;

@Schema({ timestamps: true })
export class Event {
  @Prop({ required: true, unique: true })
  uuid: string;

  @Prop({ type: Types.ObjectId, ref: 'Campaign' })
  campaignId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ type: [String], default: [] })
  categories: string[]; // e.g., ['21K', '10K', '5K']

  @Prop({ default: 'upcoming' })
  status: string; // upcoming, live, finished

  @Prop()
  location: string;

  @Prop()
  bannerImage: string;

  @Prop()
  coverImage: string;

  @Prop()
  shortCode: string;

  @Prop()
  organizer: string;

  @Prop()
  organizerName: string;

  @Prop({ type: [String], default: [] })
  checkpoints: string[]; // Checkpoint names in order

  @Prop()
  startTime: Date;

  @Prop()
  shareToken: string; // For public sharing

  // New fields from reference
  @Prop()
  category: string; // Race category type

  @Prop()
  distance: number; // Distance in km

  @Prop()
  elevationGain: number;

  @Prop()
  timeLimit: number; // Time limit in minutes

  @Prop()
  price: number;

  @Prop()
  pictureUrl: string;

  @Prop()
  awardUrl: string;

  @Prop()
  souvenirUrl: string;

  @Prop()
  mapUrl: string;

  @Prop()
  scheduleUrl: string;

  @Prop()
  awardDetail: string;

  @Prop()
  souvenirDetail: string;

  @Prop()
  scheduleDetail: string;

  @Prop()
  dropOff: string;

  @Prop()
  contactName: string;

  @Prop()
  contactTel: string;

  @Prop()
  contactOwner: string;

  @Prop()
  rfidEventId: number;

  @Prop({ default: false })
  isFinished: boolean;

  @Prop({ default: false })
  isAutoFix: boolean;

  @Prop()
  finishTime: Date;

  // Age groups configuration
  @Prop({ type: [Object], default: [] })
  ageGroups: Array<{
    name: string;
    minAge: number;
    maxAge: number;
    gender?: string;
  }>;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// Indexes
EventSchema.index({ uuid: 1 }, { unique: true });
EventSchema.index({ campaignId: 1 });
EventSchema.index({ date: -1 });
EventSchema.index({ shareToken: 1 });
EventSchema.index({ status: 1 }); // findByFilter
EventSchema.index({ campaignId: 1, date: 1 }); // findByCampaign sorted

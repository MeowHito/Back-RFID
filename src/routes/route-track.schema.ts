import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RouteTrackDocument = RouteTrack & Document;

/** Where a checkpoint sits along the uploaded track, in kilometres from the start. */
export interface CheckpointMark {
    name: string;
    km: number;
}

/**
 * A GPX course line for one race category of one campaign.
 *
 * Stored in its own collection (not embedded in Campaign) because a track is
 * bulky and Campaign documents are fetched on nearly every page — embedding
 * would bloat every one of those responses.
 *
 * `coords` is downsampled by the uploader to a few thousand points, which is
 * plenty for drawing but keeps a doc well under the 16MB BSON limit.
 */
@Schema({ timestamps: true })
export class RouteTrack {
    /** Campaign _id (stored as a plain string — callers pass the raw id from the URL). */
    @Prop({ required: true, index: true })
    campaignId: string;

    /** RaceCategory.name this route belongs to, e.g. "100K". */
    @Prop({ required: true })
    category: string;

    /** Original .gpx filename, shown back to the admin. */
    @Prop()
    fileName: string;

    /** [[lat, lng, cumulativeKm], ...] */
    @Prop({ type: [[Number]], default: [] })
    coords: number[][];

    @Prop({ default: 0 })
    distanceKm: number;

    @Prop({ default: 0 })
    elevationGainM: number;

    /** Points kept after downsampling. */
    @Prop({ default: 0 })
    pointCount: number;

    /** Points in the original file, before downsampling. */
    @Prop({ default: 0 })
    rawPointCount: number;

    @Prop({ type: Object, default: null })
    bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;

    /**
     * Optional km markers for this category's checkpoints. When empty the map
     * falls back to spreading checkpoints evenly along the track.
     */
    @Prop({ type: [Object], default: [] })
    checkpointMarks: CheckpointMark[];
}

export const RouteTrackSchema = SchemaFactory.createForClass(RouteTrack);

// One track per campaign+category; upserts key off this pair.
RouteTrackSchema.index({ campaignId: 1, category: 1 }, { unique: true });

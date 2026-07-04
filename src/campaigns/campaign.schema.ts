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
    remoteEventNo?: string; // RaceTiger project number / remote event id
    itra?: number;      // ITRA points
    utmbIndex?: string; // UTMB Index
}

// One finish-time band, e.g. "sub 40" covering [0, 40) minutes
export interface TargetTimeBand {
    label: string;       // e.g. "sub 40"
    minMinutes: number;  // inclusive lower bound in minutes (0 = from start)
    maxMinutes: number;  // exclusive upper bound in minutes
}

// Target-time ranking bands defined per race category
export interface TargetTimeBandGroup {
    category: string;          // RaceCategory.name this config applies to
    bands: TargetTimeBand[];
}

// Public visibility of the results-page ranking menu, defined per race category.
// A category missing from this array defaults every item to visible (true).
export interface RankingMenuVisibility {
    category: string;   // RaceCategory.name this config applies to
    general?: boolean;   // "General [N]" — overall ranking
    bestOf?: boolean;     // "Best of [event name]" — fastest male + female
    nationality?: boolean; // "Nationality [N]" — top foreign ranking
    ageGroup?: boolean;   // "Age Group Top [N]"
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
    thumbnail: string; // Tiny blurry base64 placeholder (~1KB)
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
    raceId: string;

    @Prop()
    partnerCode: string;

    @Prop()
    raceTigerBaseUrl: string; // e.g. https://wx.racetigertiming.com (extracted from pasted URL)

    @Prop()
    organizerName: string;

    @Prop({ default: 'road_race' })
    themeType: string;

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

    @Prop()
    certBackgroundImage: string;

    /** Card strip color on homepage (hex). Falls back to first category badgeColor. */
    @Prop()
    cardColor: string;

    // Race categories (100K, 50K, etc.)
    @Prop({ type: [Object], default: [] })
    categories: RaceCategory[];

    // Countdown settings
    @Prop()
    countdownDate: Date;

    /** When true, RaceTiger data auto-syncs every 15 seconds */
    @Prop({ default: false })
    autoSync: boolean;

    /** Admin-controlled column visibility for public event page (Marathon mode).
     *  Array of column keys to display. Empty = show all. */
    @Prop({ type: [String], default: [] })
    displayColumns: string[];

    /** Admin-controlled column visibility for public event page (Lab mode).
     *  Array of column keys to display. Empty = show all. */
    @Prop({ type: [String], default: [] })
    displayColumnsLab: string[];

    /** Display mode for the live event page: 'marathon' or 'lab' */
    @Prop({ default: 'marathon' })
    displayMode: string;

    /** E-Slip template selected by admin: 'template1' | 'template2' | 'template3' | 'custom' */
    @Prop({ default: 'template1' })
    eslipTemplate: string;

    /** Custom E-Slip template HTML uploaded by admin (used when eslipTemplate='custom') */
    @Prop()
    eslipCustomHtml: string;

    /** Admin-selected E-Slip templates available for users. Array of template IDs.
     *  Empty = all templates available. e.g. ['template1', 'template2'] */
    @Prop({ type: [String], default: [] })
    eslipTemplates: string[];

    /** Admin-controlled visibility of data fields on E-Slip.
     *  Array of field keys to display. Empty = show all.
     *  Keys: 'overallRank','genderRank','categoryRank','gunTime','netTime','distance','pace' */
    @Prop({ type: [String], default: [] })
    eslipVisibleFields: string[];

    /** E-Slip version mode: 'v1' = original templates, 'v2' = custom Canva-like layout */
    @Prop({ default: 'v1' })
    eslipMode: string;

    /** Canva-like E-Slip 2 layout — JSON object with canvas size, background, and element array */
    @Prop({ type: Object })
    eslipV2Layout: any;

    /** Exclude top N overall winners from age group rankings on Result-Winners page.
     *  0 = no exclusion, 3 = exclude top 3, 5 = exclude top 5 */
    @Prop({ default: 0 })
    excludeOverallFromAgeGroup: number;

    @Prop({ default: false })
    disableAgeGroupRanking: boolean;

    /** Number of top ranks to display per age group on Result-Winners page. Default 5. */
    @Prop({ default: 5 })
    ageGroupDisplayCount: number;

    /** Number of top overall ranks to display on Overall-Winners page. Default 5. */
    @Prop({ default: 5 })
    overallDisplayCount: number;

    /** Race categories (by name) whose Overall ranking is split into Thai vs foreign
     *  (non-Thai) groups. Only the Overall rank is affected — gender and age-group
     *  rankings stay combined. Runners with empty/unknown nationality count as Thai.
     *  In split categories, Overall winners are excluded from age-group awards. */
    @Prop({ type: [String], default: [] })
    separateOverallNationalityCategories: string[];

    /** In nationality-split categories, how many top Thai / foreign overall winners
     *  (per gender) are excluded from age-group awards. Null/undefined = fall back
     *  to overallDisplayCount (the previous, coupled behavior). */
    @Prop({ type: Number, default: null })
    excludeOverallThaiFromAgeGroup: number | null;

    @Prop({ type: Number, default: null })
    excludeOverallForeignFromAgeGroup: number | null;

    /** Exclude runners with ageGroupRank <= N from Result-Winners page. 0 = no exclusion. */
    @Prop({ default: 0 })
    excludeAgeGroupTop: number;

    /** Target-time ranking bands, defined per race category.
     *  Each runner is grouped into a finish-time band (e.g. "sub 40") on the
     *  Target-Time-Winners page. */
    @Prop({ type: [Object], default: [] })
    targetTimeBands: TargetTimeBandGroup[];

    /** Per-category visibility of the results-page ranking menu (General / Best of /
     *  Nationality / Age Group). A category with no entry here defaults all 4 to
     *  visible — admins opt OUT per distance, not in. */
    @Prop({ type: [Object], default: [] })
    rankingMenuVisibility: RankingMenuVisibility[];

    /** When true, race is finished → show Finish List view.
     *  When false (default), race is ongoing → show Pass Time (live) view. */
    @Prop({ default: false })
    raceFinished: boolean;

    /** Canva-like certificate layout — array of CertElement JSON objects */
    @Prop({ type: Object })
    certLayout: any;

    /** Certificate paper size: 'a4-landscape' | 'a4-portrait' | 'hd-landscape' | 'hd-portrait' */
    @Prop({ default: 'a4-landscape' })
    certPaperSize: string;

    /** Background opacity (0-1) applied to certBackgroundImage on the certificate */
    @Prop({ default: 1 })
    certBgOpacity: number;

    /** Background color (hex) used when no background image, or behind a transparent BG image */
    @Prop()
    certBgColor: string;

    /** Scanning page display template: 'athletic' */
    @Prop({ default: 'athletic' })
    scanningTemplate: string;

    /** Background image for scanning page (base64 or URL) — landscape */
    @Prop()
    scanningBgImage: string;

    /** Background image for scanning page (base64 or URL) — portrait */
    @Prop()
    scanningBgImagePortrait: string;

    /** E-Slip scan display template: 'template3' (Default) | 'template2' (Photo) */
    @Prop({ default: 'template3' })
    slipScanTemplate: string;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);

// Indexes
CampaignSchema.index({ uuid: 1 });  // findById $or query
CampaignSchema.index({ eventDate: -1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ isDraft: 1, status: 1 }); // For filtering published campaigns
CampaignSchema.index({ isDraft: 1, eventDate: -1 }); // For sorted published campaigns
CampaignSchema.index({ isFeatured: 1 }); // For get-featured query (admin header, mapping, etc.)


export declare class CreateEventDto {
    name: string;
    description?: string;
    date: Date;
    categories?: string[];
    status?: string;
    location?: string;
    bannerImage?: string;
    coverImage?: string;
    shortCode?: string;
    organizer?: string;
    organizerName?: string;
    checkpoints?: string[];
    startTime?: Date;
    campaignId?: string;
    category?: string;
    distance?: number;
    elevationGain?: number;
    timeLimit?: number;
    price?: number;
    pictureUrl?: string;
    mapUrl?: string;
    contactName?: string;
    contactTel?: string;
    isAutoFix?: boolean;
    ageGroups?: Array<{
        name: string;
        minAge: number;
        maxAge: number;
        gender?: string;
    }>;
}

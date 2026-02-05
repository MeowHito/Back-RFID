export declare class RaceCategoryDto {
    name: string;
    distance: string;
    startTime: string;
    cutoff: string;
    elevation?: string;
    raceType?: string;
    badgeColor: string;
    status?: string;
    itra?: number;
    utmbIndex?: string;
}
export declare class CreateCampaignDto {
    name: string;
    shortName?: string;
    description?: string;
    eventDate: Date;
    eventEndDate?: Date;
    location?: string;
    logoUrl?: string;
    pictureUrl?: string;
    website?: string;
    facebook?: string;
    email?: string;
    contactName?: string;
    contactTel?: string;
    organizerName?: string;
    allowRFIDSync?: boolean;
    status?: string;
    categories?: RaceCategoryDto[];
    countdownDate?: Date;
}

export declare class CreateCheckpointDto {
    campaignId: string;
    name: string;
    type: string;
    orderNum: number;
    active?: boolean;
    description?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
}
export declare class CreateCheckpointMappingDto {
    checkpointId: string;
    eventId: string;
    distanceFromStart?: number;
    cutoffTime?: number;
    orderNum?: number;
}

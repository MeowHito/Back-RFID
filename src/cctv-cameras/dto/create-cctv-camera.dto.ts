export class CreateCctvCameraDto {
    campaignId: string;
    checkpointId?: string;
    name: string;
    streamUrl?: string;
    deviceId?: string;
    status?: string;
    isLiveStreamEnabled?: boolean;
    coverageZone?: string;
    resolution?: string;
    checkpointName?: string;
}

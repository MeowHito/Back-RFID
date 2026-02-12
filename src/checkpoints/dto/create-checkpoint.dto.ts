import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export class CreateCheckpointDto {
    @IsString()
    campaignId: string;

    @IsString()
    name: string;

    @IsEnum(['start', 'checkpoint', 'finish'])
    type: string;

    @IsNumber()
    orderNum: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsString()
    description?: string; // timing method (rfid | manual)

    @IsOptional()
    @IsString()
    readerId?: string;

    @IsOptional()
    @IsString()
    location?: string;

    @IsOptional()
    @IsNumber()
    latitude?: number;

    @IsOptional()
    @IsNumber()
    longitude?: number;

    @IsOptional()
    @IsNumber()
    kmCumulative?: number;

    @IsOptional()
    @IsString()
    cutoffTime?: string;

    @IsOptional()
    distanceMappings?: string[];
}

export class CreateCheckpointMappingDto {
    @IsString()
    checkpointId: string;

    @IsString()
    eventId: string;

    @IsOptional()
    @IsNumber()
    distanceFromStart?: number;

    @IsOptional()
    @IsNumber()
    cutoffTime?: number;

    @IsOptional()
    @IsNumber()
    orderNum?: number;
}

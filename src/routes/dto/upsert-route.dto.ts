import { IsString, IsOptional, IsArray, IsNumber, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckpointMarkDto {
    @IsString()
    name: string;

    @IsNumber()
    km: number;
}

export class RouteBoundsDto {
    @IsNumber()
    minLat: number;

    @IsNumber()
    minLng: number;

    @IsNumber()
    maxLat: number;

    @IsNumber()
    maxLng: number;
}

export class UpsertRouteDto {
    @IsString()
    campaignId: string;

    @IsString()
    category: string;

    @IsOptional()
    @IsString()
    fileName?: string;

    /** [[lat, lng, cumulativeKm], ...] — already downsampled by the client. */
    @IsArray()
    coords: number[][];

    @IsOptional()
    @IsNumber()
    distanceKm?: number;

    @IsOptional()
    @IsNumber()
    elevationGainM?: number;

    @IsOptional()
    @IsNumber()
    rawPointCount?: number;

    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => RouteBoundsDto)
    bounds?: RouteBoundsDto;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CheckpointMarkDto)
    checkpointMarks?: CheckpointMarkDto[];
}

/** Body for updating only the km markers of an already-uploaded route. */
export class UpdateMarksDto {
    @IsString()
    campaignId: string;

    @IsString()
    category: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CheckpointMarkDto)
    checkpointMarks: CheckpointMarkDto[];
}

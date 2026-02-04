import { IsString, IsOptional, IsDate, IsArray, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEventDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @Type(() => Date)
    @IsDate()
    date: Date;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    categories?: string[];

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    location?: string;

    @IsOptional()
    @IsString()
    bannerImage?: string;

    @IsOptional()
    @IsString()
    coverImage?: string;

    @IsOptional()
    @IsString()
    shortCode?: string;

    @IsOptional()
    @IsString()
    organizer?: string;

    @IsOptional()
    @IsString()
    organizerName?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    checkpoints?: string[];

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    startTime?: Date;

    // New fields
    @IsOptional()
    @IsString()
    campaignId?: string;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsNumber()
    distance?: number;

    @IsOptional()
    @IsNumber()
    elevationGain?: number;

    @IsOptional()
    @IsNumber()
    timeLimit?: number;

    @IsOptional()
    @IsNumber()
    price?: number;

    @IsOptional()
    @IsString()
    pictureUrl?: string;

    @IsOptional()
    @IsString()
    mapUrl?: string;

    @IsOptional()
    @IsString()
    contactName?: string;

    @IsOptional()
    @IsString()
    contactTel?: string;

    @IsOptional()
    @IsBoolean()
    isAutoFix?: boolean;

    @IsOptional()
    @IsArray()
    ageGroups?: Array<{
        name: string;
        minAge: number;
        maxAge: number;
        gender?: string;
    }>;
}

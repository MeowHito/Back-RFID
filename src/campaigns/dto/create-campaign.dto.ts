import { IsString, IsOptional, IsDate, IsBoolean, IsEmail, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for race category inside a campaign
export class RaceCategoryDto {
    @IsString()
    name: string;

    @IsString()
    distance: string;

    @IsString()
    startTime: string;

    @IsString()
    cutoff: string;

    @IsOptional()
    @IsString()
    elevation?: string;

    @IsOptional()
    @IsString()
    raceType?: string;

    @IsString()
    badgeColor: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsNumber()
    itra?: number;

    @IsOptional()
    @IsString()
    utmbIndex?: string;
}

export class CreateCampaignDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    slug?: string;

    @IsOptional()
    @IsString()
    shortName?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @Type(() => Date)
    @IsDate()
    eventDate: Date;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    eventEndDate?: Date;

    @IsOptional()
    @IsString()
    location?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsString()
    pictureUrl?: string;

    @IsOptional()
    @IsString()
    website?: string;

    @IsOptional()
    @IsString()
    facebook?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    contactName?: string;

    @IsOptional()
    @IsString()
    contactTel?: string;

    @IsOptional()
    @IsString()
    organizerName?: string;

    @IsOptional()
    @IsBoolean()
    allowRFIDSync?: boolean;

    @IsOptional()
    @IsBoolean()
    isApproveCertificate?: boolean;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RaceCategoryDto)
    categories?: RaceCategoryDto[];

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    countdownDate?: Date;
}

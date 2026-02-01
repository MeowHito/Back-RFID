import { IsString, IsOptional, IsDate, IsBoolean, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCampaignDto {
    @IsString()
    name: string;

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
}

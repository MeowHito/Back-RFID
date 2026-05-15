import { IsBoolean, IsIn, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateCctvBetaCameraDto {
    @IsMongoId()
    campaignId: string;

    @IsOptional()
    @IsMongoId()
    checkpointId?: string;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    coverageZone?: string;

    @IsOptional()
    @IsString()
    checkpointName?: string;

    @IsOptional()
    @IsString()
    resolution?: string;

    @IsOptional()
    @IsIn(['srt', 'rtmp'])
    preferredProtocol?: 'srt' | 'rtmp';

    @IsOptional()
    @IsBoolean()
    autoRecord?: boolean;
}

export class UpdateCctvBetaCameraDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    coverageZone?: string;

    @IsOptional()
    @IsMongoId()
    checkpointId?: string;

    @IsOptional()
    @IsString()
    checkpointName?: string;

    @IsOptional()
    @IsString()
    resolution?: string;

    @IsOptional()
    @IsIn(['srt', 'rtmp'])
    preferredProtocol?: 'srt' | 'rtmp';

    @IsOptional()
    @IsBoolean()
    autoRecord?: boolean;
}

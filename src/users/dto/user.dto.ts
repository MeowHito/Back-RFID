import { IsString, IsEmail, IsOptional, MinLength, IsEnum } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsEnum(['admin', 'organizer', 'user', 'station'])
    role?: string;

    @IsOptional()
    @IsString()
    phone?: string;
}

export class LoginDto {
    @IsEmail()
    email: string;

    @IsString()
    password: string;
}

export class LoginStationDto {
    @IsString()
    username: string;

    @IsString()
    password: string;

    @IsString()
    campaignUuid: string;
}

export class UpdatePasswordDto {
    @IsOptional()
    @IsString()
    uuid?: string;

    @IsOptional()
    @IsString()
    opw?: string; // old password

    @IsString()
    @MinLength(6)
    npw: string; // new password
}

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    avatarUrl?: string;
}

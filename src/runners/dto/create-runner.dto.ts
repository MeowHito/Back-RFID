import { IsString, IsOptional, IsNumber, IsEnum, IsDate, IsBoolean, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRunnerDto {
    @IsString()
    eventId: string;

    @IsString()
    bib: string;

    @IsString()
    firstName: string;

    @IsString()
    lastName: string;

    @IsOptional()
    @IsString()
    firstNameTh?: string;

    @IsOptional()
    @IsString()
    lastNameTh?: string;

    @IsEnum(['M', 'F'])
    gender: string;

    @IsOptional()
    @IsString()
    ageGroup?: string;

    @IsOptional()
    @IsNumber()
    age?: number;

    @IsOptional()
    @IsString()
    box?: string;

    @IsOptional()
    @IsString()
    team?: string;

    @IsString()
    category: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    rfidTag?: string;

    // New fields
    @IsOptional()
    @IsString()
    chipCode?: string;

    @IsOptional()
    @IsString()
    nationality?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    birthDate?: Date;

    @IsOptional()
    @IsString()
    idNo?: string;

    @IsOptional()
    @IsString()
    shirtSize?: string;

    @IsOptional()
    @IsString()
    teamName?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    registerDate?: Date;

    @IsOptional()
    @IsBoolean()
    isStarted?: boolean;

    @IsOptional()
    @IsBoolean()
    allowRFIDSync?: boolean;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    emergencyContact?: string;

    @IsOptional()
    @IsString()
    emergencyPhone?: string;

    @IsOptional()
    @IsString()
    medicalInfo?: string;

    @IsOptional()
    @IsString()
    bloodType?: string;

    @IsOptional()
    @IsString()
    chronicDiseases?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    sourceFile?: string;

    @IsOptional()
    @IsString()
    athleteId?: string; // RaceTiger AthleteId for matching with splitScore/score

    // === RaceTiger Score/Finish fields ===
    @IsOptional()
    @IsNumber()
    gunTime?: number;

    @IsOptional()
    @IsNumber()
    genderNetRank?: number;

    @IsOptional()
    @IsString()
    gunPace?: string;

    @IsOptional()
    @IsString()
    netPace?: string;

    @IsOptional()
    @IsNumber()
    totalFinishers?: number;

    @IsOptional()
    @IsNumber()
    genderFinishers?: number;
}

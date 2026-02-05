export declare class CreateUserDto {
    email: string;
    password: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    phone?: string;
}
export declare class LoginDto {
    email: string;
    password: string;
}
export declare class LoginStationDto {
    username: string;
    password: string;
    campaignUuid: string;
}
export declare class UpdatePasswordDto {
    uuid?: string;
    opw?: string;
    npw: string;
}
export declare class UpdateProfileDto {
    firstName?: string;
    lastName?: string;
    username?: string;
    phone?: string;
    avatarUrl?: string;
}

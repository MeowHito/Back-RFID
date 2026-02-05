import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { LoginDto, LoginStationDto, CreateUserDto } from '../users/dto/user.dto';
export interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    campaignUuid?: string;
}
export interface AuthResponse {
    access_token: string;
    user: {
        uuid: string;
        email: string;
        username: string;
        firstName: string;
        lastName: string;
        role: string;
    };
    campaign?: any;
    station?: any;
}
export declare class AuthService {
    private usersService;
    private campaignsService;
    private jwtService;
    constructor(usersService: UsersService, campaignsService: CampaignsService, jwtService: JwtService);
    register(createUserDto: CreateUserDto): Promise<AuthResponse>;
    login(loginDto: LoginDto): Promise<AuthResponse>;
    loginStation(loginDto: LoginStationDto): Promise<AuthResponse>;
    validateToken(token: string): Promise<JwtPayload | null>;
    getUserFromToken(token: string): Promise<any>;
}

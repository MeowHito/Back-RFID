import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { AdminLogsService } from '../admin-logs/admin-logs.service';
import { LoginDto, LoginStationDto, CreateUserDto } from '../users/dto/user.dto';

export interface JwtPayload {
    sub: string; // user uuid
    email: string;
    role: string;
    campaignUuid?: string; // for station login
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

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private campaignsService: CampaignsService,
        private jwtService: JwtService,
        private adminLogsService: AdminLogsService,
    ) { }

    async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
        // Force role to 'user' for public registration
        const userDto = { ...createUserDto, role: 'user' };
        const user = await this.usersService.create(userDto);

        const payload: JwtPayload = {
            sub: user.uuid,
            email: user.email,
            role: user.role,
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                uuid: user.uuid,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    async login(loginDto: LoginDto, clientIp?: string): Promise<AuthResponse> {
        const user = await this.usersService.validatePassword(loginDto.email, loginDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        await this.usersService.updateLastLogin(user._id.toString());

        // Log admin login
        if (user.role === 'admin' || user.role === 'organizer') {
            try {
                await this.adminLogsService.createLog({
                    loginAccount: user.email,
                    accountName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || user.email,
                    clientIp: clientIp || '-',
                    userUuid: user.uuid,
                    role: user.role,
                    remark: 'Login successful',
                });
            } catch (error) {
                console.error('Failed to create admin log:', error);
            }
        }

        const payload: JwtPayload = {
            sub: user.uuid,
            email: user.email,
            role: user.role,
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                uuid: user.uuid,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
        };
    }

    async loginStation(loginDto: LoginStationDto): Promise<AuthResponse> {
        // Find user by username
        const user = await this.usersService.findByUsername(loginDto.username);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Validate password
        const validUser = await this.usersService.validatePassword(user.email, loginDto.password);
        if (!validUser) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Validate campaign
        let campaign;
        try {
            campaign = await this.campaignsService.findByUuid(loginDto.campaignUuid);
        } catch {
            throw new UnauthorizedException('Campaign not found');
        }

        await this.usersService.updateLastLogin(user._id.toString());

        const payload: JwtPayload = {
            sub: user.uuid,
            email: user.email,
            role: 'station',
            campaignUuid: campaign.uuid,
        };

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                uuid: user.uuid,
                email: user.email,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                role: 'station',
            },
            campaign: campaign.toObject(),
        };
    }

    async validateToken(token: string): Promise<JwtPayload | null> {
        try {
            const payload = this.jwtService.verify<JwtPayload>(token);
            return payload;
        } catch {
            return null;
        }
    }

    async getUserFromToken(token: string): Promise<any> {
        const payload = await this.validateToken(token);
        if (!payload) return null;
        return this.usersService.findByUuid(payload.sub);
    }
}

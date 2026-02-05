"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const users_service_1 = require("../users/users.service");
const campaigns_service_1 = require("../campaigns/campaigns.service");
let AuthService = class AuthService {
    usersService;
    campaignsService;
    jwtService;
    constructor(usersService, campaignsService, jwtService) {
        this.usersService = usersService;
        this.campaignsService = campaignsService;
        this.jwtService = jwtService;
    }
    async register(createUserDto) {
        const userDto = { ...createUserDto, role: 'user' };
        const user = await this.usersService.create(userDto);
        const payload = {
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
    async login(loginDto) {
        const user = await this.usersService.validatePassword(loginDto.email, loginDto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await this.usersService.updateLastLogin(user._id.toString());
        const payload = {
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
    async loginStation(loginDto) {
        const user = await this.usersService.findByUsername(loginDto.username);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const validUser = await this.usersService.validatePassword(user.email, loginDto.password);
        if (!validUser) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        let campaign;
        try {
            campaign = await this.campaignsService.findByUuid(loginDto.campaignUuid);
        }
        catch {
            throw new common_1.UnauthorizedException('Campaign not found');
        }
        await this.usersService.updateLastLogin(user._id.toString());
        const payload = {
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
    async validateToken(token) {
        try {
            const payload = this.jwtService.verify(token);
            return payload;
        }
        catch {
            return null;
        }
    }
    async getUserFromToken(token) {
        const payload = await this.validateToken(token);
        if (!payload)
            return null;
        return this.usersService.findByUuid(payload.sub);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        campaigns_service_1.CampaignsService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
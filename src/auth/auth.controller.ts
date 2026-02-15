import { Controller, Post, Body, Get, Request, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, LoginStationDto, CreateUserDto } from '../users/dto/user.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    register(@Body() createUserDto: CreateUserDto) {
        return this.authService.register(createUserDto);
    }

    @Post('login')
    login(@Body() loginDto: LoginDto, @Req() req: any) {
        // Extract client IP from various headers (proxy-aware)
        const clientIp =
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.headers['x-real-ip'] ||
            req.connection?.remoteAddress ||
            req.ip ||
            '-';
        return this.authService.login(loginDto, clientIp);
    }

    @Post('login-station')
    loginStation(@Body() loginDto: LoginStationDto) {
        return this.authService.loginStation(loginDto);
    }

    @UseGuards(AuthGuard('jwt'))
    @Get('profile')
    getProfile(@Request() req: any) {
        return req.user;
    }

    @Post('validate')
    async validateToken(@Body('token') token: string) {
        const payload = await this.authService.validateToken(token);
        return { valid: !!payload, payload };
    }
}

import { Controller, Post, Body, Get, Request, UseGuards } from '@nestjs/common';
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
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
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

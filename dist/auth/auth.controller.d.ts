import { AuthService } from './auth.service';
import { LoginDto, LoginStationDto } from '../users/dto/user.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto): Promise<import("./auth.service").AuthResponse>;
    loginStation(loginDto: LoginStationDto): Promise<import("./auth.service").AuthResponse>;
    getProfile(req: any): any;
    validateToken(token: string): Promise<{
        valid: boolean;
        payload: import("./auth.service").JwtPayload | null;
    }>;
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { UsersModule } from '../users/users.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { AdminLogsModule } from '../admin-logs/admin-logs.module';
import { User, UserSchema } from '../users/user.schema';

@Module({
    imports: [
        UsersModule,
        CampaignsModule,
        AdminLogsModule,
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => {
                const secret = configService.get<string>('JWT_SECRET');
                if (!secret && process.env.NODE_ENV === 'production') {
                    throw new Error('JWT_SECRET must be set in production environment');
                }
                return {
                    secret: secret || 'dev-only-secret-change-in-production',
                    signOptions: { expiresIn: '7d' },
                };
            },
            inject: [ConfigService],
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, RolesGuard, PermissionsGuard],
    exports: [AuthService, JwtStrategy, RolesGuard, PermissionsGuard],
})
export class AuthModule { }

import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseInterceptors,
    UploadedFile,
    UseGuards,
    ForbiddenException,
    Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto, UpdatePasswordDto, UpdateProfileDto } from './dto/user.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AdminOnly } from '../auth/decorators/permissions.decorator';

/**
 * Users endpoints
 *
 * Role-based contract (enforced server-side):
 *   - Listing/searching/inspecting accounts:     admin / admin_master only
 *   - Creating / editing / deleting users:       admin / admin_master only
 *   - Reading own profile by uuid:               authenticated, must be self or admin
 *   - Updating own profile (name/phone/avatar):  authenticated, must be self or admin
 *   - Updating password:                         authenticated, self or admin
 *
 * `update-password` and `profile/:uuid` are intentionally NOT @AdminOnly so users
 * can edit their own data via /admin/settings.
 */
@Controller('users')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @AdminOnly()
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @Get()
    @AdminOnly()
    findAll(@Query('page') page: number, @Query('limit') limit: number) {
        return this.usersService.findAll({ page: page || 1, limit: limit || 20 });
    }

    @Get(':id')
    @AdminOnly()
    findOne(@Param('id') id: string) {
        return this.usersService.findById(id);
    }

    @Get('uuid/:uuid')
    findByUuid(@Param('uuid') uuid: string, @Req() req: any) {
        const jwtUser = req.user;
        const isAdmin = jwtUser?.role === 'admin' || jwtUser?.role === 'admin_master';
        if (!isAdmin && jwtUser?.sub !== uuid) {
            throw new ForbiddenException('Cannot view another user');
        }
        return this.usersService.findByUuid(uuid);
    }

    @Put(':id')
    @AdminOnly()
    update(@Param('id') id: string, @Body() updateData: Partial<CreateUserDto>) {
        return this.usersService.update(id, updateData);
    }

    @Put(':id/role')
    @AdminOnly()
    updateRole(@Param('id') id: string, @Body('role') role: string, @Req() req: any) {
        return this.usersService.updateRole(id, role, req.user?.role);
    }

    @Put(':id/permissions')
    @AdminOnly()
    updatePermissions(
        @Param('id') id: string,
        @Body() body: {
            allEventsAccess?: boolean;
            allowedCampaigns?: string[];
            modulePermissions?: Record<string, { view: boolean; create: boolean; delete: boolean; export: boolean }>;
        },
    ) {
        return this.usersService.updatePermissions(id, body);
    }

    @Post('update-password')
    updatePassword(@Body() data: UpdatePasswordDto, @Req() req: any) {
        const jwtUser = req.user;
        return this.usersService.updatePassword(data, {
            uuid: jwtUser.sub,
            role: jwtUser.role,
        });
    }

    @Put('profile/:uuid')
    updateProfile(@Param('uuid') uuid: string, @Body() updateData: UpdateProfileDto, @Req() req: any) {
        const jwtUser = req.user;
        const isAdmin = jwtUser?.role === 'admin' || jwtUser?.role === 'admin_master';
        if (!isAdmin && jwtUser?.sub !== uuid) {
            throw new ForbiddenException('Cannot edit another user\'s profile');
        }
        return this.usersService.updateProfile(uuid, updateData);
    }

    @Post('avatar/:uuid')
    @UseInterceptors(FileInterceptor('avatar'))
    async uploadAvatar(@Param('uuid') uuid: string, @UploadedFile() file: any, @Req() req: any) {
        const jwtUser = req.user;
        const isAdmin = jwtUser?.role === 'admin' || jwtUser?.role === 'admin_master';
        if (!isAdmin && jwtUser?.sub !== uuid) {
            throw new ForbiddenException('Cannot change another user\'s avatar');
        }
        return this.usersService.updateAvatar(uuid, file);
    }

    @Delete(':id')
    @AdminOnly()
    delete(
        @Param('id') id: string,
        @Req() req: any,
        @Body() body?: { confirmAdminEmail?: string; confirmAdminPassword?: string },
    ) {
        return this.usersService.delete(
            id,
            { uuid: req.user.sub, role: req.user.role },
            body
                ? { email: body.confirmAdminEmail, password: body.confirmAdminPassword }
                : undefined,
        );
    }
}

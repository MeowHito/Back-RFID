import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto, UpdatePasswordDto, UpdateProfileDto } from './dto/user.dto';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/permissions.decorator';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('userManagement', 'create')
    create(@Body() createUserDto: CreateUserDto) {
        return this.usersService.create(createUserDto);
    }

    @Get()
    findAll(@Query('page') page: number, @Query('limit') limit: number) {
        return this.usersService.findAll({ page: page || 1, limit: limit || 20 });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.usersService.findById(id);
    }

    @Get('uuid/:uuid')
    findByUuid(@Param('uuid') uuid: string) {
        return this.usersService.findByUuid(uuid);
    }

    @Put(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('userManagement', 'create')
    update(@Param('id') id: string, @Body() updateData: Partial<CreateUserDto>) {
        return this.usersService.update(id, updateData);
    }

    @Put(':id/role')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('userManagement', 'create')
    updateRole(@Param('id') id: string, @Body('role') role: string, @Body('requestorRole') requestorRole?: string) {
        return this.usersService.updateRole(id, role, requestorRole);
    }

    @Put(':id/permissions')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('userManagement', 'create')
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
    updatePassword(@Body() data: UpdatePasswordDto) {
        return this.usersService.updatePassword(data);
    }

    @Put('profile/:uuid')
    updateProfile(@Param('uuid') uuid: string, @Body() updateData: UpdateProfileDto) {
        return this.usersService.updateProfile(uuid, updateData);
    }

    @Post('avatar/:uuid')
    @UseInterceptors(FileInterceptor('avatar'))
    async uploadAvatar(@Param('uuid') uuid: string, @UploadedFile() file: any) {
        return this.usersService.updateAvatar(uuid, file);
    }

    @Delete(':id')
    @UseGuards(AuthGuard('jwt'), PermissionsGuard)
    @RequirePermission('userManagement', 'delete')
    delete(@Param('id') id: string) {
        return this.usersService.delete(id);
    }
}

import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto, UpdatePasswordDto, UpdateProfileDto } from './dto/user.dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Post()
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
    update(@Param('id') id: string, @Body() updateData: Partial<CreateUserDto>) {
        return this.usersService.update(id, updateData);
    }

    @Put(':id/role')
    updateRole(@Param('id') id: string, @Body('role') role: string) {
        return this.usersService.updateRole(id, role);
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
    delete(@Param('id') id: string) {
        return this.usersService.delete(id);
    }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminLogsService } from './admin-logs.service';

@Controller('admin-logs')
export class AdminLogsController {
    constructor(private readonly adminLogsService: AdminLogsService) { }

    @UseGuards(AuthGuard('jwt'))
    @Get()
    async getAdminLogs(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const paging = {
            page: page ? parseInt(page, 10) : 1,
            limit: limit ? parseInt(limit, 10) : 50,
        };
        return this.adminLogsService.findAll(paging);
    }
}

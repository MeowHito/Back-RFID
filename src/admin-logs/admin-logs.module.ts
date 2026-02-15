import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';
import { AdminLog, AdminLogSchema } from './admin-log.schema';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: AdminLog.name, schema: AdminLogSchema }]),
    ],
    controllers: [AdminLogsController],
    providers: [AdminLogsService],
    exports: [AdminLogsService],
})
export class AdminLogsModule { }

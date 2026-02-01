import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncLog, SyncLogSchema } from './sync-log.schema';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: SyncLog.name, schema: SyncLogSchema }]),
    ],
    controllers: [SyncController],
    providers: [SyncService],
    exports: [SyncService],
})
export class SyncModule { }

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncLog, SyncLogSchema } from './sync-log.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: SyncLog.name, schema: SyncLogSchema },
            { name: Campaign.name, schema: CampaignSchema },
        ]),
    ],
    controllers: [SyncController],
    providers: [SyncService],
    exports: [SyncService],
})
export class SyncModule { }

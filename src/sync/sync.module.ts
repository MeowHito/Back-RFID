import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import { Event, EventSchema } from '../events/event.schema';
import { RunnersModule } from '../runners/runners.module';
import { CheckpointsModule } from '../checkpoints/checkpoints.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncLog, SyncLogSchema } from './sync-log.schema';

@Module({
    imports: [
        RunnersModule,
        CheckpointsModule,
        MongooseModule.forFeature([
            { name: SyncLog.name, schema: SyncLogSchema },
            { name: Campaign.name, schema: CampaignSchema },
            { name: Event.name, schema: EventSchema },
        ]),
    ],
    controllers: [SyncController],
    providers: [SyncService],
    exports: [SyncService],
})
export class SyncModule { }

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Event, EventSchema } from '../events/event.schema';
import { TimingRecord, TimingRecordSchema } from '../timing/timing-record.schema';
import { Runner, RunnerSchema } from '../runners/runner.schema';
import { RunnersModule } from '../runners/runners.module';
import { CheckpointsModule } from '../checkpoints/checkpoints.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncSchedulerService } from './sync-scheduler.service';
import { SyncLog, SyncLogSchema } from './sync-log.schema';

@Module({
    imports: [
        RunnersModule,
        CheckpointsModule,
        MongooseModule.forFeature([
            { name: SyncLog.name, schema: SyncLogSchema },
            { name: Campaign.name, schema: CampaignSchema },
            { name: User.name, schema: UserSchema },
            { name: Event.name, schema: EventSchema },
            { name: TimingRecord.name, schema: TimingRecordSchema },
            { name: Runner.name, schema: RunnerSchema },
        ]),
    ],
    controllers: [SyncController],
    providers: [SyncService, SyncSchedulerService, PermissionsGuard],
    exports: [SyncService, SyncSchedulerService],
})
export class SyncModule { }


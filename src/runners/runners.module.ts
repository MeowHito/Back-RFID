import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';
import { Runner, RunnerSchema } from './runner.schema';
import { RunnerEditLog, RunnerEditLogSchema } from './runner-edit-log.schema';
import { User, UserSchema } from '../users/user.schema';
import { Event, EventSchema } from '../events/event.schema';
import { TimingRecord, TimingRecordSchema } from '../timing/timing-record.schema';
import { Campaign, CampaignSchema } from '../campaigns/campaign.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Runner.name, schema: RunnerSchema },
            { name: RunnerEditLog.name, schema: RunnerEditLogSchema },
            { name: User.name, schema: UserSchema },
            { name: Event.name, schema: EventSchema },
            { name: TimingRecord.name, schema: TimingRecordSchema },
            { name: Campaign.name, schema: CampaignSchema },
        ]),
    ],
    controllers: [RunnersController],
    providers: [RunnersService, PermissionsGuard],
    exports: [RunnersService],
})
export class RunnersModule { }

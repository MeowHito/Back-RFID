import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { CheckpointSchedulerService } from './checkpoint-scheduler.service';
import { Checkpoint, CheckpointSchema } from './checkpoint.schema';
import { CheckpointMapping, CheckpointMappingSchema } from './checkpoint-mapping.schema';
import { Runner, RunnerSchema } from '../runners/runner.schema';
import { Event, EventSchema } from '../events/event.schema';
import { User, UserSchema } from '../users/user.schema';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Checkpoint.name, schema: CheckpointSchema },
            { name: CheckpointMapping.name, schema: CheckpointMappingSchema },
            { name: Runner.name, schema: RunnerSchema },
            { name: Event.name, schema: EventSchema },
            { name: User.name, schema: UserSchema },
        ]),
        CampaignsModule,
    ],
    controllers: [CheckpointsController],
    providers: [CheckpointsService, CheckpointSchedulerService, PermissionsGuard],
    exports: [CheckpointsService, CheckpointSchedulerService],
})
export class CheckpointsModule { }

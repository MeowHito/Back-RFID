import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { CheckpointSchedulerService } from './checkpoint-scheduler.service';
import { Checkpoint, CheckpointSchema } from './checkpoint.schema';
import { CheckpointMapping, CheckpointMappingSchema } from './checkpoint-mapping.schema';
import { Runner, RunnerSchema } from '../runners/runner.schema';
import { Event, EventSchema } from '../events/event.schema';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Checkpoint.name, schema: CheckpointSchema },
            { name: CheckpointMapping.name, schema: CheckpointMappingSchema },
            { name: Runner.name, schema: RunnerSchema },
            { name: Event.name, schema: EventSchema },
        ]),
        CampaignsModule,
    ],
    controllers: [CheckpointsController],
    providers: [CheckpointsService, CheckpointSchedulerService],
    exports: [CheckpointsService, CheckpointSchedulerService],
})
export class CheckpointsModule { }

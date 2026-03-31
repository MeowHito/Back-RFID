import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { RunnersModule } from '../runners/runners.module';
import { CheckpointsModule } from '../checkpoints/checkpoints.module';
import { TimingModule } from '../timing/timing.module';
import { EventsModule } from '../events/events.module';
import { CctvCamerasModule } from '../cctv-cameras/cctv-cameras.module';

@Module({
    imports: [
        UsersModule,
        AuthModule,
        CampaignsModule,
        EventsModule,
        RunnersModule,
        CheckpointsModule,
        TimingModule,
        CctvCamerasModule,
    ],
    controllers: [PublicApiController],
})
export class PublicApiModule { }

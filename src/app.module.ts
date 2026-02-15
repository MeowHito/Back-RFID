import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { RunnersModule } from './runners/runners.module';
import { TimingModule } from './timing/timing.module';
import { SharedModule } from './shared/shared.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CheckpointsModule } from './checkpoints/checkpoints.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PublicApiModule } from './public-api/public-api.module';
import { SyncModule } from './sync/sync.module';
import { SeedService } from './seed.service';
import { Campaign, CampaignSchema } from './campaigns/campaign.schema';
import { Event, EventSchema } from './events/event.schema';
import { Runner, RunnerSchema } from './runners/runner.schema';
import { Checkpoint, CheckpointSchema } from './checkpoints/checkpoint.schema';
import { User, UserSchema } from './users/user.schema';
import { AdminLogsModule } from './admin-logs/admin-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') || 'mongodb://localhost:27017/rfid-timing',
      }),
      inject: [ConfigService],
    }),
    // Schema imports for SeedService
    MongooseModule.forFeature([
      { name: Campaign.name, schema: CampaignSchema },
      { name: Event.name, schema: EventSchema },
      { name: Runner.name, schema: RunnerSchema },
      { name: Checkpoint.name, schema: CheckpointSchema },
      { name: User.name, schema: UserSchema },
    ]),
    // Core modules
    EventsModule,
    RunnersModule,
    TimingModule,
    SharedModule,
    // New modules
    CampaignsModule,
    CheckpointsModule,
    UsersModule,
    AuthModule,
    PublicApiModule,
    SyncModule,
    AdminLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService, SeedService],
})
export class AppModule { }


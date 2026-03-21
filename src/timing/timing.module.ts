import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimingController } from './timing.controller';
import { TimingService } from './timing.service';
import { TimingGateway } from './timing.gateway';
import { TimingRecord, TimingRecordSchema } from './timing-record.schema';
import { RunnersModule } from '../runners/runners.module';
import { EventsModule } from '../events/events.module';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: TimingRecord.name, schema: TimingRecordSchema }]),
        RunnersModule,
        EventsModule,
        CampaignsModule,
    ],
    controllers: [TimingController],
    providers: [TimingService, TimingGateway],
    exports: [TimingService, TimingGateway],
})
export class TimingModule { }

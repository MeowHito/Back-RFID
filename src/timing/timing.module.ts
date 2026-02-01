import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimingController } from './timing.controller';
import { TimingService } from './timing.service';
import { TimingGateway } from './timing.gateway';
import { TimingRecord, TimingRecordSchema } from './timing-record.schema';
import { RunnersModule } from '../runners/runners.module';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: TimingRecord.name, schema: TimingRecordSchema }]),
        RunnersModule,
    ],
    controllers: [TimingController],
    providers: [TimingService, TimingGateway],
    exports: [TimingService, TimingGateway],
})
export class TimingModule { }

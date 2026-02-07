import { Module } from '@nestjs/common';
import { SharedController } from './shared.controller';
import { EventsModule } from '../events/events.module';
import { RunnersModule } from '../runners/runners.module';
import { TimingModule } from '../timing/timing.module';

@Module({
    imports: [EventsModule, RunnersModule, TimingModule],
    controllers: [SharedController],
})
export class SharedModule { }

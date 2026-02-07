import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';
import { Runner, RunnerSchema } from './runner.schema';

@Module({
    imports: [
        MongooseModule.forFeature([{ name: Runner.name, schema: RunnerSchema }]),
    ],
    controllers: [RunnersController],
    providers: [RunnersService],
    exports: [RunnersService],
})
export class RunnersModule { }

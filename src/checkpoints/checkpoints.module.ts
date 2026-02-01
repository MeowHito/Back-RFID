import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CheckpointsController } from './checkpoints.controller';
import { CheckpointsService } from './checkpoints.service';
import { Checkpoint, CheckpointSchema } from './checkpoint.schema';
import { CheckpointMapping, CheckpointMappingSchema } from './checkpoint-mapping.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Checkpoint.name, schema: CheckpointSchema },
            { name: CheckpointMapping.name, schema: CheckpointMappingSchema },
        ]),
    ],
    controllers: [CheckpointsController],
    providers: [CheckpointsService],
    exports: [CheckpointsService],
})
export class CheckpointsModule { }

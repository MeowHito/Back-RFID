import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';
import { Runner, RunnerSchema } from './runner.schema';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Runner.name, schema: RunnerSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [RunnersController],
    providers: [RunnersService, PermissionsGuard],
    exports: [RunnersService],
})
export class RunnersModule { }

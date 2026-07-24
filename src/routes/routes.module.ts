import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RouteTrack, RouteTrackSchema } from './route-track.schema';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: RouteTrack.name, schema: RouteTrackSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [RoutesController],
    providers: [RoutesService, PermissionsGuard],
    exports: [RoutesService],
})
export class RoutesModule { }

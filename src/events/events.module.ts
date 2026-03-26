import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { Event, EventSchema } from './event.schema';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Event.name, schema: EventSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [EventsController],
    providers: [EventsService, PermissionsGuard],
    exports: [EventsService],
})
export class EventsModule { }

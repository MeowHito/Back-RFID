import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CctvCamera, CctvCameraSchema } from './cctv-camera.schema';
import { CctvCamerasService } from './cctv-cameras.service';
import { CctvCamerasController } from './cctv-cameras.controller';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: CctvCamera.name, schema: CctvCameraSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [CctvCamerasController],
    providers: [CctvCamerasService, PermissionsGuard],
    exports: [CctvCamerasService],
})
export class CctvCamerasModule {}

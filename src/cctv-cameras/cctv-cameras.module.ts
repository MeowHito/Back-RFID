import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CctvCamera, CctvCameraSchema } from './cctv-camera.schema';
import { CctvRecording, CctvRecordingSchema } from './cctv-recording.schema';
import { CctvSettings, CctvSettingsSchema } from './cctv-settings.schema';
import { CctvCamerasService } from './cctv-cameras.service';
import { CctvCamerasController } from './cctv-cameras.controller';
import { CctvRecordingsController } from './cctv-recordings.controller';
import { CctvRecordingsService } from './cctv-recordings.service';
import { CctvSettingsService } from './cctv-settings.service';
import { CctvSettingsController } from './cctv-settings.controller';
import { CctvGateway } from './cctv.gateway';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: CctvCamera.name, schema: CctvCameraSchema },
            { name: CctvRecording.name, schema: CctvRecordingSchema },
            { name: CctvSettings.name, schema: CctvSettingsSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [CctvCamerasController, CctvRecordingsController, CctvSettingsController],
    providers: [CctvCamerasService, CctvRecordingsService, CctvSettingsService, PermissionsGuard, CctvGateway],
    exports: [CctvCamerasService, CctvRecordingsService, CctvSettingsService, CctvGateway],
})
export class CctvCamerasModule {}

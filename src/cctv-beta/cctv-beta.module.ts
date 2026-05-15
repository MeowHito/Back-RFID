import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { CctvBetaCamera, CctvBetaCameraSchema } from './cctv-beta-camera.schema';
import { CctvBetaRecording, CctvBetaRecordingSchema } from './cctv-beta-recording.schema';
import { CctvBetaCamerasService } from './cctv-beta-cameras.service';
import { CctvBetaRecordingsService } from './cctv-beta-recordings.service';
import { CctvBetaCamerasController } from './cctv-beta-cameras.controller';
import { CctvBetaRecordingsController } from './cctv-beta-recordings.controller';
import { CctvBetaIngestController } from './cctv-beta-ingest.controller';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: CctvBetaCamera.name, schema: CctvBetaCameraSchema },
            { name: CctvBetaRecording.name, schema: CctvBetaRecordingSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [
        CctvBetaCamerasController,
        CctvBetaRecordingsController,
        CctvBetaIngestController,
    ],
    providers: [CctvBetaCamerasService, CctvBetaRecordingsService, PermissionsGuard],
    exports: [CctvBetaCamerasService, CctvBetaRecordingsService],
})
export class CctvBetaModule {}

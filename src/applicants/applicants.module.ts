import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApplicantsController } from './applicants.controller';
import { ApplicantsService } from './applicants.service';
import { Applicant, ApplicantSchema } from './applicant.schema';
import { ApplicantEditLog, ApplicantEditLogSchema } from './applicant-edit-log.schema';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Applicant.name, schema: ApplicantSchema },
            { name: ApplicantEditLog.name, schema: ApplicantEditLogSchema },
            { name: User.name, schema: UserSchema },
        ]),
        CampaignsModule,
    ],
    controllers: [ApplicantsController],
    providers: [ApplicantsService, PermissionsGuard],
    exports: [ApplicantsService],
})
export class ApplicantsModule { }

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign, CampaignSchema } from './campaign.schema';
import { User, UserSchema } from '../users/user.schema';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Campaign.name, schema: CampaignSchema },
            { name: User.name, schema: UserSchema },
        ]),
    ],
    controllers: [CampaignsController],
    providers: [CampaignsService, PermissionsGuard],
    exports: [CampaignsService],
})
export class CampaignsModule { }

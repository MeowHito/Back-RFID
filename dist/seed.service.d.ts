import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { CampaignDocument } from './campaigns/campaign.schema';
import { EventDocument } from './events/event.schema';
import { RunnerDocument } from './runners/runner.schema';
import { CheckpointDocument } from './checkpoints/checkpoint.schema';
import { UserDocument } from './users/user.schema';
export declare class SeedService implements OnModuleInit {
    private campaignModel;
    private eventModel;
    private runnerModel;
    private checkpointModel;
    private userModel;
    constructor(campaignModel: Model<CampaignDocument>, eventModel: Model<EventDocument>, runnerModel: Model<RunnerDocument>, checkpointModel: Model<CheckpointDocument>, userModel: Model<UserDocument>);
    onModuleInit(): Promise<void>;
    seed(): Promise<void>;
}

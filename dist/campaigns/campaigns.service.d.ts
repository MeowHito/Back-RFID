import { Model } from 'mongoose';
import { CampaignDocument } from './campaign.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
export interface PagingData {
    page: number;
    limit: number;
    search?: string;
}
export interface CampaignFilter {
    type?: string;
    user?: string;
    role?: string;
    status?: string;
}
export declare class CampaignsService {
    private campaignModel;
    constructor(campaignModel: Model<CampaignDocument>);
    create(createCampaignDto: CreateCampaignDto): Promise<CampaignDocument>;
    findAll(paging?: PagingData): Promise<{
        data: CampaignDocument[];
        total: number;
    }>;
    findById(id: string): Promise<CampaignDocument>;
    findByUuid(uuid: string): Promise<CampaignDocument>;
    findByDate(filter: CampaignFilter, paging?: PagingData): Promise<{
        data: CampaignDocument[];
        total: number;
    }>;
    update(id: string, updateData: Partial<CreateCampaignDto>): Promise<CampaignDocument>;
    updateStatus(id: string, status: string): Promise<CampaignDocument>;
    updateByUuid(uuid: string, updateData: Partial<CreateCampaignDto>): Promise<CampaignDocument>;
    delete(id: string): Promise<void>;
    getDetailById(id: string): Promise<any>;
}

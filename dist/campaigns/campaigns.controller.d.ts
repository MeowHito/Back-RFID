import { CampaignsService } from './campaigns.service';
import type { PagingData } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
export declare class CampaignsController {
    private readonly campaignsService;
    constructor(campaignsService: CampaignsService);
    create(createCampaignDto: CreateCampaignDto): Promise<import("./campaign.schema").CampaignDocument>;
    findAll(paging: PagingData): Promise<{
        data: import("./campaign.schema").CampaignDocument[];
        total: number;
    }>;
    findByDate(type: string, status: string, page: number, limit: number, search: string): Promise<{
        data: import("./campaign.schema").CampaignDocument[];
        total: number;
    }>;
    findOne(id: string): Promise<import("./campaign.schema").CampaignDocument>;
    findByUuid(uuid: string): Promise<import("./campaign.schema").CampaignDocument>;
    getDetail(id: string): Promise<any>;
    update(id: string, updateData: Partial<CreateCampaignDto>): Promise<import("./campaign.schema").CampaignDocument>;
    updateStatus(id: string, status: string): Promise<import("./campaign.schema").CampaignDocument>;
    delete(id: string): Promise<void>;
}

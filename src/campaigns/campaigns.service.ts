import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument } from './campaign.schema';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { v4 as uuidv4 } from 'uuid';

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

@Injectable()
export class CampaignsService {
    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
    ) { }

    async create(createCampaignDto: CreateCampaignDto): Promise<CampaignDocument> {
        const campaign = new this.campaignModel({
            ...createCampaignDto,
            uuid: uuidv4(),
            rfidToken: uuidv4(),
        });
        return campaign.save();
    }

    async findAll(paging?: PagingData): Promise<{ data: CampaignDocument[]; total: number }> {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;

        const query: any = {};
        if (paging?.search) {
            query.$or = [
                { name: { $regex: paging.search, $options: 'i' } },
                { shortName: { $regex: paging.search, $options: 'i' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.campaignModel.find(query).sort({ eventDate: -1 }).skip(skip).limit(limit).exec(),
            this.campaignModel.countDocuments(query).exec(),
        ]);

        return { data, total };
    }

    /**
     * Find campaign by ID - handles both MongoDB ObjectId and UUID formats
     * First tries _id lookup, then falls back to uuid lookup
     */
    async findById(id: string): Promise<CampaignDocument> {
        let campaign: CampaignDocument | null = null;

        // Try MongoDB ObjectId first (24 hex characters)
        if (/^[0-9a-fA-F]{24}$/.test(id)) {
            campaign = await this.campaignModel.findById(id).exec();
        }

        // If not found by _id, try uuid lookup
        if (!campaign) {
            campaign = await this.campaignModel.findOne({ uuid: id }).exec();
        }

        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        return campaign;
    }

    async findByUuid(uuid: string): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findOne({ uuid }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    async findByDate(filter: CampaignFilter, paging?: PagingData): Promise<{ data: CampaignDocument[]; total: number }> {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;

        const query: any = {};

        if (filter.type === 'upcoming') {
            query.eventDate = { $gte: new Date() };
        } else if (filter.type === 'past') {
            query.eventDate = { $lt: new Date() };
        }

        if (filter.status) {
            query.status = filter.status;
        }

        if (paging?.search) {
            query.$or = [
                { name: { $regex: paging.search, $options: 'i' } },
                { location: { $regex: paging.search, $options: 'i' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.campaignModel.find(query).sort({ eventDate: -1 }).skip(skip).limit(limit).exec(),
            this.campaignModel.countDocuments(query).exec(),
        ]);

        return { data, total };
    }

    async update(id: string, updateData: Partial<CreateCampaignDto>): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    /** Get the single featured campaign (for admin header) */
    async findFeatured(): Promise<CampaignDocument | null> {
        return this.campaignModel.findOne({ isFeatured: true }).exec();
    }

    /** Set one campaign as featured; all others are unset. Only one can be featured. */
    async setFeatured(id: string): Promise<CampaignDocument> {
        await this.campaignModel.updateMany({}, { isFeatured: false }).exec();
        const campaign = await this.campaignModel.findByIdAndUpdate(id, { isFeatured: true }, { new: true }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    /** Unset featured from a campaign (e.g. toggle off) */
    async unsetFeatured(id: string): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findByIdAndUpdate(id, { isFeatured: false }, { new: true }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    async updateStatus(id: string, status: string): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findByIdAndUpdate(
            id,
            { status, isDraft: status === 'draft' },
            { new: true }
        ).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    async updateByUuid(uuid: string, updateData: Partial<CreateCampaignDto>): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findOneAndUpdate({ uuid }, updateData, { new: true }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    async delete(id: string): Promise<void> {
        const result = await this.campaignModel.findByIdAndDelete(id).exec();
        if (!result) throw new NotFoundException('Campaign not found');
    }

    async getDetailById(id: string): Promise<any> {
        const campaign = await this.findById(id);
        // In a real implementation, this would also fetch related events, checkpoints, etc.
        return {
            ...campaign.toObject(),
            eventTotal: 0, // Will be populated by events module
        };
    }
}

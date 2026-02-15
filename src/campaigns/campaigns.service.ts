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

    private slugify(value: string): string {
        const normalized = (value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9ก-๙]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return normalized || 'event';
    }

    private async generateUniqueSlug(source: string, excludeId?: string): Promise<string> {
        const base = this.slugify(source);
        let candidate = base;
        let suffix = 2;

        while (true) {
            const query: any = { slug: candidate };
            if (excludeId) query._id = { $ne: excludeId };

            const exists = await this.campaignModel.exists(query);
            if (!exists) return candidate;

            candidate = `${base}-${suffix}`;
            suffix += 1;
        }
    }

    private async backfillMissingSlugs(): Promise<void> {
        const missing = await this.campaignModel
            .find({ $or: [{ slug: { $exists: false } }, { slug: '' }, { slug: null }] })
            .select('_id name')
            .exec();

        for (const campaign of missing) {
            const slug = await this.generateUniqueSlug(campaign.name || String(campaign._id), String(campaign._id));
            await this.campaignModel.updateOne({ _id: campaign._id }, { $set: { slug } }).exec();
        }
    }

    async create(createCampaignDto: CreateCampaignDto): Promise<CampaignDocument> {
        const slugSource = createCampaignDto.slug || createCampaignDto.name;
        const slug = await this.generateUniqueSlug(slugSource);

        const campaign = new this.campaignModel({
            ...createCampaignDto,
            slug,
            uuid: uuidv4(),
            rfidToken: uuidv4(),
        });
        return campaign.save();
    }

    async findAll(paging?: PagingData): Promise<{ data: CampaignDocument[]; total: number }> {
        await this.backfillMissingSlugs();

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
            this.campaignModel.find(query).sort({ eventDate: -1 }).skip(skip).limit(limit).lean().exec(),
            this.campaignModel.countDocuments(query).exec(),
        ]);

        return { data: data as CampaignDocument[], total };
    }

    /**
     * Find campaign by ID - handles MongoDB ObjectId, UUID and slug formats
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

        // If not found by uuid, try slug lookup
        if (!campaign) {
            campaign = await this.campaignModel.findOne({ slug: id }).exec();
        }

        // Ensure older records always get slug assigned once accessed
        if (campaign && !campaign.slug) {
            campaign.slug = await this.generateUniqueSlug(campaign.name || String(campaign._id), String(campaign._id));
            await campaign.save();
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
        await this.backfillMissingSlugs();

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
            this.campaignModel.find(query).sort({ eventDate: -1 }).skip(skip).limit(limit).lean().exec(),
            this.campaignModel.countDocuments(query).exec(),
        ]);

        return { data: data as CampaignDocument[], total };
    }

    async update(id: string, updateData: Partial<CreateCampaignDto>): Promise<CampaignDocument> {
        const nextData = { ...updateData };
        if (updateData.slug || updateData.name) {
            nextData.slug = await this.generateUniqueSlug(updateData.slug || updateData.name || 'event', id);
        }

        const campaign = await this.campaignModel.findByIdAndUpdate(id, nextData, { new: true }).exec();
        if (!campaign) throw new NotFoundException('Campaign not found');
        return campaign;
    }

    /** Get the single featured campaign (for admin header) */
    async findFeatured(): Promise<CampaignDocument | null> {
        return this.campaignModel.findOne({ isFeatured: true }).lean().exec() as Promise<CampaignDocument | null>;
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
        const existing = await this.campaignModel.findOne({ uuid }).exec();
        if (!existing) throw new NotFoundException('Campaign not found');

        const nextData = { ...updateData };
        if (updateData.slug || updateData.name) {
            nextData.slug = await this.generateUniqueSlug(updateData.slug || updateData.name || 'event', String(existing._id));
        }

        const campaign = await this.campaignModel.findOneAndUpdate({ uuid }, nextData, { new: true }).exec();
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

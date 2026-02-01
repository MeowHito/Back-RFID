"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const campaign_schema_1 = require("./campaign.schema");
const uuid_1 = require("uuid");
let CampaignsService = class CampaignsService {
    campaignModel;
    constructor(campaignModel) {
        this.campaignModel = campaignModel;
    }
    async create(createCampaignDto) {
        const campaign = new this.campaignModel({
            ...createCampaignDto,
            uuid: (0, uuid_1.v4)(),
            rfidToken: (0, uuid_1.v4)(),
        });
        return campaign.save();
    }
    async findAll(paging) {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;
        const query = {};
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
    async findById(id) {
        const campaign = await this.campaignModel.findById(id).exec();
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async findByUuid(uuid) {
        const campaign = await this.campaignModel.findOne({ uuid }).exec();
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async findByDate(filter, paging) {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;
        const query = {};
        if (filter.type === 'upcoming') {
            query.eventDate = { $gte: new Date() };
        }
        else if (filter.type === 'past') {
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
    async update(id, updateData) {
        const campaign = await this.campaignModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async updateStatus(id, status) {
        const campaign = await this.campaignModel.findByIdAndUpdate(id, { status, isDraft: status === 'draft' }, { new: true }).exec();
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async updateByUuid(uuid, updateData) {
        const campaign = await this.campaignModel.findOneAndUpdate({ uuid }, updateData, { new: true }).exec();
        if (!campaign)
            throw new common_1.NotFoundException('Campaign not found');
        return campaign;
    }
    async delete(id) {
        const result = await this.campaignModel.findByIdAndDelete(id).exec();
        if (!result)
            throw new common_1.NotFoundException('Campaign not found');
    }
    async getDetailById(id) {
        const campaign = await this.findById(id);
        return {
            ...campaign.toObject(),
            eventTotal: 0,
        };
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(campaign_schema_1.Campaign.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map
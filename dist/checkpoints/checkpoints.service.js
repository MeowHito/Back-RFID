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
exports.CheckpointsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const checkpoint_schema_1 = require("./checkpoint.schema");
const checkpoint_mapping_schema_1 = require("./checkpoint-mapping.schema");
const uuid_1 = require("uuid");
let CheckpointsService = class CheckpointsService {
    checkpointModel;
    mappingModel;
    constructor(checkpointModel, mappingModel) {
        this.checkpointModel = checkpointModel;
        this.mappingModel = mappingModel;
    }
    async create(createDto) {
        const checkpoint = new this.checkpointModel({
            ...createDto,
            uuid: (0, uuid_1.v4)(),
            campaignId: new mongoose_2.Types.ObjectId(createDto.campaignId),
        });
        return checkpoint.save();
    }
    async createMany(checkpoints) {
        const docs = checkpoints.map(cp => ({
            ...cp,
            uuid: (0, uuid_1.v4)(),
            campaignId: new mongoose_2.Types.ObjectId(cp.campaignId),
        }));
        return this.checkpointModel.insertMany(docs);
    }
    async findById(id) {
        const checkpoint = await this.checkpointModel.findById(id).exec();
        if (!checkpoint)
            throw new common_1.NotFoundException('Checkpoint not found');
        return checkpoint;
    }
    async findByUuid(uuid) {
        const checkpoint = await this.checkpointModel.findOne({ uuid }).exec();
        if (!checkpoint)
            throw new common_1.NotFoundException('Checkpoint not found');
        return checkpoint;
    }
    async findByCampaign(campaignId) {
        return this.checkpointModel
            .find({ campaignId: new mongoose_2.Types.ObjectId(campaignId) })
            .sort({ orderNum: 1 })
            .exec();
    }
    async update(id, updateData) {
        const checkpoint = await this.checkpointModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
        if (!checkpoint)
            throw new common_1.NotFoundException('Checkpoint not found');
        return checkpoint;
    }
    async updateMany(checkpoints) {
        for (const cp of checkpoints) {
            const { id, ...updateData } = cp;
            await this.checkpointModel.findByIdAndUpdate(id, updateData).exec();
        }
    }
    async delete(id) {
        await this.checkpointModel.findByIdAndDelete(id).exec();
    }
    async deleteByCampaign(campaignId) {
        await this.checkpointModel.deleteMany({ campaignId: new mongoose_2.Types.ObjectId(campaignId) }).exec();
    }
    async createMapping(createDto) {
        const mapping = new this.mappingModel({
            ...createDto,
            checkpointId: new mongoose_2.Types.ObjectId(createDto.checkpointId),
            eventId: new mongoose_2.Types.ObjectId(createDto.eventId),
        });
        return mapping.save();
    }
    async createManyMappings(mappings) {
        const docs = mappings.map(m => ({
            ...m,
            checkpointId: new mongoose_2.Types.ObjectId(m.checkpointId),
            eventId: new mongoose_2.Types.ObjectId(m.eventId),
        }));
        return this.mappingModel.insertMany(docs);
    }
    async findMappingsByEvent(eventId) {
        return this.mappingModel
            .find({ eventId: new mongoose_2.Types.ObjectId(eventId) })
            .populate('checkpointId')
            .sort({ orderNum: 1 })
            .exec();
    }
    async findMappingsByCampaignAndEvent(campaignId, eventId) {
        const checkpoints = await this.findByCampaign(campaignId);
        const mappings = await this.findMappingsByEvent(eventId);
        return checkpoints.map(cp => {
            const mapping = mappings.find(m => m.checkpointId.toString() === cp._id.toString());
            return {
                ...cp.toObject(),
                mapping: mapping ? mapping.toObject() : null,
            };
        });
    }
    async updateMappings(mappings) {
        for (const mapping of mappings) {
            await this.mappingModel.findOneAndUpdate({
                checkpointId: new mongoose_2.Types.ObjectId(mapping.checkpointId),
                eventId: new mongoose_2.Types.ObjectId(mapping.eventId),
            }, { $set: mapping }, { upsert: true, new: true }).exec();
        }
    }
    async deleteMappingsByEvent(eventId) {
        await this.mappingModel.deleteMany({ eventId: new mongoose_2.Types.ObjectId(eventId) }).exec();
    }
};
exports.CheckpointsService = CheckpointsService;
exports.CheckpointsService = CheckpointsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(checkpoint_schema_1.Checkpoint.name)),
    __param(1, (0, mongoose_1.InjectModel)(checkpoint_mapping_schema_1.CheckpointMapping.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], CheckpointsService);
//# sourceMappingURL=checkpoints.service.js.map
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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const event_schema_1 = require("./event.schema");
const uuid_1 = require("uuid");
let EventsService = class EventsService {
    eventModel;
    constructor(eventModel) {
        this.eventModel = eventModel;
    }
    async create(createEventDto) {
        const event = new this.eventModel({
            ...createEventDto,
            uuid: (0, uuid_1.v4)(),
            shareToken: (0, uuid_1.v4)(),
            campaignId: createEventDto.campaignId ? new mongoose_2.Types.ObjectId(createEventDto.campaignId) : undefined,
        });
        return event.save();
    }
    async findAll() {
        return this.eventModel.find().sort({ date: -1 }).exec();
    }
    async findOne(id) {
        return this.eventModel.findById(id).exec();
    }
    async findByUuid(uuid) {
        return this.eventModel.findOne({ uuid }).exec();
    }
    async findByShareToken(token) {
        return this.eventModel.findOne({ shareToken: token }).exec();
    }
    async findByCampaign(campaignId) {
        return this.eventModel
            .find({ campaignId: new mongoose_2.Types.ObjectId(campaignId) })
            .sort({ date: 1 })
            .exec();
    }
    async findByFilter(filter) {
        const query = {};
        if (filter.campaignId) {
            query.campaignId = new mongoose_2.Types.ObjectId(filter.campaignId);
        }
        if (filter.status) {
            query.status = filter.status;
        }
        if (filter.category) {
            query.category = filter.category;
        }
        return this.eventModel.find(query).sort({ date: -1 }).exec();
    }
    async update(id, updateEventDto) {
        return this.eventModel.findByIdAndUpdate(id, updateEventDto, { new: true }).exec();
    }
    async updateStatus(id, status) {
        return this.eventModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    }
    async updateActive(id, isActive) {
        return this.eventModel.findByIdAndUpdate(id, { status: isActive ? 'live' : 'upcoming' }, { new: true }).exec();
    }
    async updateAutoFix(id, isAutoFix) {
        return this.eventModel.findByIdAndUpdate(id, { isAutoFix }, { new: true }).exec();
    }
    async updateFinished(id, isFinished) {
        return this.eventModel.findByIdAndUpdate(id, {
            isFinished,
            status: isFinished ? 'finished' : 'live',
            finishTime: isFinished ? new Date() : null,
        }, { new: true }).exec();
    }
    async getEventById(id) {
        const event = await this.findOne(id);
        if (!event)
            throw new common_1.NotFoundException('Event not found');
        return event.toObject();
    }
    async getEventDetailById(id) {
        const event = await this.eventModel.findById(id).populate('campaignId').exec();
        if (!event)
            throw new common_1.NotFoundException('Event not found');
        return event.toObject();
    }
    async delete(id) {
        await this.eventModel.findByIdAndDelete(id).exec();
    }
    async deleteByCampaign(campaignId) {
        await this.eventModel.deleteMany({ campaignId: new mongoose_2.Types.ObjectId(campaignId) }).exec();
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(event_schema_1.Event.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], EventsService);
//# sourceMappingURL=events.service.js.map
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event, EventDocument } from './event.schema';
import { CreateEventDto } from './dto/create-event.dto';
import { v4 as uuidv4 } from 'uuid';

export interface EventFilter {
    campaignId?: string;
    status?: string;
    category?: string;
}

@Injectable()
export class EventsService {
    constructor(
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
    ) { }

    async create(createEventDto: CreateEventDto): Promise<EventDocument> {
        const event = new this.eventModel({
            ...createEventDto,
            uuid: uuidv4(),
            shareToken: uuidv4(),
            campaignId: createEventDto.campaignId ? new Types.ObjectId(createEventDto.campaignId) : undefined,
        });
        return event.save();
    }

    async findAll(limit: number = 500): Promise<EventDocument[]> {
        return this.eventModel.find().sort({ date: -1 }).limit(limit).lean().exec() as Promise<EventDocument[]>;
    }

    async findOne(id: string): Promise<EventDocument | null> {
        return this.eventModel.findById(id).exec();
    }

    async findByUuid(uuid: string): Promise<EventDocument | null> {
        return this.eventModel.findOne({ uuid }).lean().exec() as Promise<EventDocument | null>;
    }

    async findByShareToken(token: string): Promise<EventDocument | null> {
        return this.eventModel.findOne({ shareToken: token }).lean().exec() as Promise<EventDocument | null>;
    }

    async findByCampaign(campaignId: string): Promise<EventDocument[]> {
        return this.eventModel
            .find({ campaignId: new Types.ObjectId(campaignId) })
            .sort({ date: 1 })
            .lean()
            .exec() as Promise<EventDocument[]>;
    }

    async findByFilter(filter: EventFilter): Promise<EventDocument[]> {
        const query: any = {};
        if (filter.campaignId) {
            query.campaignId = new Types.ObjectId(filter.campaignId);
        }
        if (filter.status) {
            query.status = filter.status;
        }
        if (filter.category) {
            query.category = filter.category;
        }
        return this.eventModel.find(query).sort({ date: -1 }).limit(500).lean().exec() as Promise<EventDocument[]>;
    }

    async update(id: string, updateEventDto: Partial<CreateEventDto>): Promise<EventDocument | null> {
        return this.eventModel.findByIdAndUpdate(id, updateEventDto, { new: true }).exec();
    }

    async updateStatus(id: string, status: string): Promise<EventDocument | null> {
        return this.eventModel.findByIdAndUpdate(id, { status }, { new: true }).exec();
    }

    async updateActive(id: string, isActive: boolean): Promise<EventDocument | null> {
        return this.eventModel.findByIdAndUpdate(
            id,
            { status: isActive ? 'live' : 'upcoming' },
            { new: true }
        ).exec();
    }

    async updateAutoFix(id: string, isAutoFix: boolean): Promise<EventDocument | null> {
        return this.eventModel.findByIdAndUpdate(id, { isAutoFix }, { new: true }).exec();
    }

    async updateFinished(id: string, isFinished: boolean): Promise<EventDocument | null> {
        return this.eventModel.findByIdAndUpdate(
            id,
            {
                isFinished,
                status: isFinished ? 'finished' : 'live',
                finishTime: isFinished ? new Date() : null,
            },
            { new: true }
        ).exec();
    }

    async getEventById(id: string): Promise<any> {
        const event = await this.findOne(id);
        if (!event) throw new NotFoundException('Event not found');
        return event.toObject();
    }

    async getEventDetailById(id: string): Promise<any> {
        const event = await this.eventModel.findById(id).populate('campaignId').exec();
        if (!event) throw new NotFoundException('Event not found');
        return event.toObject();
    }

    async delete(id: string): Promise<void> {
        await this.eventModel.findByIdAndDelete(id).exec();
    }

    async deleteByCampaign(campaignId: string): Promise<void> {
        await this.eventModel.deleteMany({ campaignId: new Types.ObjectId(campaignId) }).exec();
    }
}

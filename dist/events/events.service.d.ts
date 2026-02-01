import { Model } from 'mongoose';
import { EventDocument } from './event.schema';
import { CreateEventDto } from './dto/create-event.dto';
export interface EventFilter {
    campaignId?: string;
    status?: string;
    category?: string;
}
export declare class EventsService {
    private eventModel;
    constructor(eventModel: Model<EventDocument>);
    create(createEventDto: CreateEventDto): Promise<EventDocument>;
    findAll(): Promise<EventDocument[]>;
    findOne(id: string): Promise<EventDocument | null>;
    findByUuid(uuid: string): Promise<EventDocument | null>;
    findByShareToken(token: string): Promise<EventDocument | null>;
    findByCampaign(campaignId: string): Promise<EventDocument[]>;
    findByFilter(filter: EventFilter): Promise<EventDocument[]>;
    update(id: string, updateEventDto: Partial<CreateEventDto>): Promise<EventDocument | null>;
    updateStatus(id: string, status: string): Promise<EventDocument | null>;
    updateActive(id: string, isActive: boolean): Promise<EventDocument | null>;
    updateAutoFix(id: string, isAutoFix: boolean): Promise<EventDocument | null>;
    updateFinished(id: string, isFinished: boolean): Promise<EventDocument | null>;
    getEventById(id: string): Promise<any>;
    getEventDetailById(id: string): Promise<any>;
    delete(id: string): Promise<void>;
    deleteByCampaign(campaignId: string): Promise<void>;
}

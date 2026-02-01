import { EventsService } from './events.service';
import type { EventFilter } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
export declare class EventsController {
    private readonly eventsService;
    constructor(eventsService: EventsService);
    create(createEventDto: CreateEventDto): Promise<import("./event.schema").EventDocument>;
    findAll(): Promise<import("./event.schema").EventDocument[]>;
    findByCampaign(campaignId: string): Promise<import("./event.schema").EventDocument[]>;
    findByFilter(filter: EventFilter): Promise<import("./event.schema").EventDocument[]>;
    findOne(id: string): Promise<import("./event.schema").EventDocument | null>;
    findByUuid(uuid: string): Promise<import("./event.schema").EventDocument | null>;
    findByShareToken(token: string): Promise<import("./event.schema").EventDocument | null>;
    getDetail(id: string): Promise<any>;
    update(id: string, updateEventDto: Partial<CreateEventDto>): Promise<import("./event.schema").EventDocument | null>;
    updateStatus(id: string, status: string): Promise<import("./event.schema").EventDocument | null>;
    updateActive(id: string, active: boolean): Promise<import("./event.schema").EventDocument | null>;
    updateAutoFix(id: string, isAutoFix: boolean): Promise<import("./event.schema").EventDocument | null>;
    updateFinished(id: string, isFinished: boolean): Promise<import("./event.schema").EventDocument | null>;
    delete(id: string): Promise<void>;
    getUpcomingEvents(): Promise<import("./event.schema").EventDocument[]>;
    getActiveEvents(): Promise<import("./event.schema").EventDocument[]>;
    getPublicEventDetail(id: string): Promise<any>;
}

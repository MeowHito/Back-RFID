import { Model } from 'mongoose';
import { CheckpointDocument } from './checkpoint.schema';
import { CheckpointMappingDocument } from './checkpoint-mapping.schema';
import { CreateCheckpointDto, CreateCheckpointMappingDto } from './dto/create-checkpoint.dto';
export declare class CheckpointsService {
    private checkpointModel;
    private mappingModel;
    constructor(checkpointModel: Model<CheckpointDocument>, mappingModel: Model<CheckpointMappingDocument>);
    create(createDto: CreateCheckpointDto): Promise<CheckpointDocument>;
    createMany(checkpoints: CreateCheckpointDto[]): Promise<any[]>;
    findById(id: string): Promise<CheckpointDocument>;
    findByUuid(uuid: string): Promise<CheckpointDocument>;
    findByCampaign(campaignId: string): Promise<CheckpointDocument[]>;
    update(id: string, updateData: Partial<CreateCheckpointDto>): Promise<CheckpointDocument>;
    updateMany(checkpoints: Array<{
        id: string;
    } & Partial<CreateCheckpointDto>>): Promise<void>;
    delete(id: string): Promise<void>;
    deleteByCampaign(campaignId: string): Promise<void>;
    createMapping(createDto: CreateCheckpointMappingDto): Promise<CheckpointMappingDocument>;
    createManyMappings(mappings: CreateCheckpointMappingDto[]): Promise<any[]>;
    findMappingsByEvent(eventId: string): Promise<CheckpointMappingDocument[]>;
    findMappingsByCampaignAndEvent(campaignId: string, eventId: string): Promise<any[]>;
    updateMappings(mappings: Array<{
        checkpointId: string;
        eventId: string;
    } & Partial<CreateCheckpointMappingDto>>): Promise<void>;
    deleteMappingsByEvent(eventId: string): Promise<void>;
}

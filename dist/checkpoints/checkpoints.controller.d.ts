import { CheckpointsService } from './checkpoints.service';
import { CreateCheckpointDto, CreateCheckpointMappingDto } from './dto/create-checkpoint.dto';
export declare class CheckpointsController {
    private readonly checkpointsService;
    constructor(checkpointsService: CheckpointsService);
    create(createDto: CreateCheckpointDto): Promise<import("./checkpoint.schema").CheckpointDocument>;
    createMany(checkpoints: CreateCheckpointDto[]): Promise<any[]>;
    findOne(id: string): Promise<import("./checkpoint.schema").CheckpointDocument>;
    findByUuid(uuid: string): Promise<import("./checkpoint.schema").CheckpointDocument>;
    findByCampaign(campaignId: string): Promise<import("./checkpoint.schema").CheckpointDocument[]>;
    update(id: string, updateData: Partial<CreateCheckpointDto>): Promise<import("./checkpoint.schema").CheckpointDocument>;
    updateMany(checkpoints: Array<{
        id: string;
    } & Partial<CreateCheckpointDto>>): Promise<void>;
    delete(id: string): Promise<void>;
    createMapping(createDto: CreateCheckpointMappingDto): Promise<import("./checkpoint-mapping.schema").CheckpointMappingDocument>;
    createManyMappings(mappings: CreateCheckpointMappingDto[]): Promise<any[]>;
    findMappingsByEvent(eventId: string): Promise<import("./checkpoint-mapping.schema").CheckpointMappingDocument[]>;
    findMappingsByCampaignAndEvent(campaignId: string, eventId: string): Promise<any[]>;
    updateMappings(mappings: Array<{
        checkpointId: string;
        eventId: string;
    } & Partial<CreateCheckpointMappingDto>>): Promise<void>;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkpoint, CheckpointDocument } from './checkpoint.schema';
import { CheckpointMapping, CheckpointMappingDocument } from './checkpoint-mapping.schema';
import { CreateCheckpointDto, CreateCheckpointMappingDto } from './dto/create-checkpoint.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CheckpointsService {
    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(CheckpointMapping.name) private mappingModel: Model<CheckpointMappingDocument>,
    ) { }

    async create(createDto: CreateCheckpointDto): Promise<CheckpointDocument> {
        const checkpoint = new this.checkpointModel({
            ...createDto,
            uuid: uuidv4(),
            campaignId: new Types.ObjectId(createDto.campaignId),
        });
        return checkpoint.save();
    }

    async createMany(checkpoints: CreateCheckpointDto[]): Promise<any[]> {
        const docs = checkpoints.map(cp => ({
            ...cp,
            uuid: uuidv4(),
            campaignId: new Types.ObjectId(cp.campaignId),
        }));
        return this.checkpointModel.insertMany(docs);
    }

    async findById(id: string): Promise<CheckpointDocument> {
        const checkpoint = await this.checkpointModel.findById(id).exec();
        if (!checkpoint) throw new NotFoundException('Checkpoint not found');
        return checkpoint;
    }

    async findByUuid(uuid: string): Promise<CheckpointDocument> {
        const checkpoint = await this.checkpointModel.findOne({ uuid }).exec();
        if (!checkpoint) throw new NotFoundException('Checkpoint not found');
        return checkpoint;
    }

    async findByCampaign(campaignId: string): Promise<CheckpointDocument[]> {
        return this.checkpointModel
            .find({ campaignId: new Types.ObjectId(campaignId) })
            .sort({ orderNum: 1 })
            .exec();
    }

    async update(id: string, updateData: Partial<CreateCheckpointDto>): Promise<CheckpointDocument> {
        const checkpoint = await this.checkpointModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
        if (!checkpoint) throw new NotFoundException('Checkpoint not found');
        return checkpoint;
    }

    async updateMany(checkpoints: Array<{ id: string } & Partial<CreateCheckpointDto>>): Promise<void> {
        for (const cp of checkpoints) {
            const { id, ...updateData } = cp;
            await this.checkpointModel.findByIdAndUpdate(id, updateData).exec();
        }
    }

    async delete(id: string): Promise<void> {
        await this.checkpointModel.findByIdAndDelete(id).exec();
    }

    async deleteByCampaign(campaignId: string): Promise<void> {
        await this.checkpointModel.deleteMany({ campaignId: new Types.ObjectId(campaignId) }).exec();
    }

    // Checkpoint Mapping methods
    async createMapping(createDto: CreateCheckpointMappingDto): Promise<CheckpointMappingDocument> {
        const mapping = new this.mappingModel({
            ...createDto,
            checkpointId: new Types.ObjectId(createDto.checkpointId),
            eventId: new Types.ObjectId(createDto.eventId),
        });
        return mapping.save();
    }

    async createManyMappings(mappings: CreateCheckpointMappingDto[]): Promise<any[]> {
        const docs = mappings.map(m => ({
            ...m,
            checkpointId: new Types.ObjectId(m.checkpointId),
            eventId: new Types.ObjectId(m.eventId),
        }));
        return this.mappingModel.insertMany(docs);
    }

    async findMappingsByEvent(eventId: string): Promise<CheckpointMappingDocument[]> {
        return this.mappingModel
            .find({ eventId: new Types.ObjectId(eventId) })
            .populate('checkpointId')
            .sort({ orderNum: 1 })
            .exec();
    }

    async findMappingsByCampaignAndEvent(campaignId: string, eventId: string): Promise<any[]> {
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

    async updateMappings(mappings: Array<{ checkpointId: string; eventId: string } & Partial<CreateCheckpointMappingDto>>): Promise<void> {
        for (const mapping of mappings) {
            await this.mappingModel.findOneAndUpdate(
                {
                    checkpointId: new Types.ObjectId(mapping.checkpointId),
                    eventId: new Types.ObjectId(mapping.eventId),
                },
                { $set: mapping },
                { upsert: true, new: true }
            ).exec();
        }
    }

    async deleteMappingsByEvent(eventId: string): Promise<void> {
        await this.mappingModel.deleteMany({ eventId: new Types.ObjectId(eventId) }).exec();
    }
}

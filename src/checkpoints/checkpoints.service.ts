import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Checkpoint, CheckpointDocument } from './checkpoint.schema';
import { CheckpointMapping, CheckpointMappingDocument } from './checkpoint-mapping.schema';
import { CreateCheckpointDto, CreateCheckpointMappingDto } from './dto/create-checkpoint.dto';
import { CheckpointSchedulerService } from './checkpoint-scheduler.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CheckpointsService {
    private readonly logger = new Logger(CheckpointsService.name);

    constructor(
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(CheckpointMapping.name) private mappingModel: Model<CheckpointMappingDocument>,
        private readonly schedulerService: CheckpointSchedulerService,
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
            .lean()
            .exec() as Promise<CheckpointDocument[]>;
    }

    async update(id: string, updateData: Partial<CreateCheckpointDto>): Promise<CheckpointDocument> {
        // Read old checkpoint before updating to detect cutoff extension
        const cutoffTouched = updateData.cutoffTime !== undefined || updateData.cutoffTimes !== undefined;
        const oldCp = cutoffTouched
            ? await this.checkpointModel.findById(id).lean().exec()
            : null;

        const checkpoint = await this.checkpointModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
        if (!checkpoint) throw new NotFoundException('Checkpoint not found');

        // Detect cutoff extension → revert auto-DNF'd runners
        if (oldCp && updateData.cutoffTime !== undefined) {
            await this.handleCutoffExtension(
                (oldCp as any).cutoffTime,
                updateData.cutoffTime,
                (oldCp as any).name,
                String((oldCp as any).campaignId),
                (oldCp as any).type,
            );
        }
        if (oldCp && updateData.cutoffTimes !== undefined) {
            await this.handleCutoffTimesExtension(
                (oldCp as any).cutoffTimes || {},
                updateData.cutoffTimes || {},
                (oldCp as any).name,
                String((oldCp as any).campaignId),
                (oldCp as any).type,
            );
        }

        return checkpoint;
    }

    async updateMany(checkpoints: Array<{ id: string } & Partial<CreateCheckpointDto>>): Promise<void> {
        if (checkpoints.length === 0) return;

        // Pre-read old cutoff values for checkpoints that have cutoffTime or cutoffTimes changes
        const cutoffChanges = checkpoints.filter(cp => cp.cutoffTime !== undefined || cp.cutoffTimes !== undefined);
        const oldCpMap = new Map<string, any>();
        if (cutoffChanges.length > 0) {
            const ids = cutoffChanges.map(cp => new Types.ObjectId(cp.id));
            const oldCps = await this.checkpointModel.find({ _id: { $in: ids } }).lean().exec();
            for (const oc of oldCps) oldCpMap.set(String((oc as any)._id), oc);
        }

        const bulkOps = checkpoints.map(cp => {
            const { id, ...updateData } = cp;
            return {
                updateOne: {
                    filter: { _id: new Types.ObjectId(id) },
                    update: { $set: updateData },
                },
            };
        });
        await this.checkpointModel.bulkWrite(bulkOps as any, { ordered: false });

        // After bulk write, check for cutoff extensions and revert auto-DNF'd runners
        for (const cp of cutoffChanges) {
            const oldCp = oldCpMap.get(cp.id);
            if (!oldCp) continue;
            if (cp.cutoffTime !== undefined) {
                await this.handleCutoffExtension(
                    (oldCp as any).cutoffTime,
                    cp.cutoffTime,
                    (oldCp as any).name,
                    String((oldCp as any).campaignId),
                    (oldCp as any).type,
                );
            }
            if (cp.cutoffTimes !== undefined) {
                await this.handleCutoffTimesExtension(
                    (oldCp as any).cutoffTimes || {},
                    cp.cutoffTimes || {},
                    (oldCp as any).name,
                    String((oldCp as any).campaignId),
                    (oldCp as any).type,
                );
            }
        }
    }

    async delete(id: string): Promise<void> {
        await this.checkpointModel.findByIdAndDelete(id).exec();
    }

    async deleteByCampaign(campaignId: string): Promise<void> {
        await this.checkpointModel.deleteMany({ campaignId: new Types.ObjectId(campaignId) }).exec();
    }

    /**
     * Compare old and new cutoff times. If cutoff was EXTENDED (new > old),
     * revert auto-DNF'd/DNS'd runners for that checkpoint back to running.
     */
    private async handleCutoffExtension(
        oldCutoff: string | undefined,
        newCutoff: string | undefined,
        cpName: string,
        campaignId: string,
        cpType: string,
    ): Promise<void> {
        if (!newCutoff || newCutoff === '-' || newCutoff === '') return;

        const newDate = new Date(newCutoff);
        if (isNaN(newDate.getTime())) return;

        // If there was no old cutoff, or it's being set for the first time, no revert needed
        if (!oldCutoff || oldCutoff === '-' || oldCutoff === '') return;

        const oldDate = new Date(oldCutoff);
        if (isNaN(oldDate.getTime())) return;

        // Only revert if the new cutoff is LATER than the old one (extension)
        if (newDate.getTime() <= oldDate.getTime()) {
            this.logger.debug(
                `CP "${cpName}": cutoff not extended (old=${oldDate.toISOString()}, new=${newDate.toISOString()})`
            );
            return;
        }

        this.logger.log(
            `CP "${cpName}": cutoff EXTENDED from ${oldDate.toISOString()} → ${newDate.toISOString()}, reverting auto-DNF'd runners`
        );
        const { revertedCount } = await this.schedulerService.revertCutoffRunners(cpName, campaignId, cpType);
        if (revertedCount > 0) {
            this.logger.log(`CP "${cpName}": ${revertedCount} runner(s) reverted to running/not_started`);
        }
    }

    /**
     * Per-category version of cutoff extension. Iterates each category key in the new
     * cutoffTimes map and, when the cutoff was extended (or removed), reverts only the
     * runners that belong to events in that category.
     */
    private async handleCutoffTimesExtension(
        oldMap: Record<string, string>,
        newMap: Record<string, string>,
        cpName: string,
        campaignId: string,
        cpType: string,
    ): Promise<void> {
        const allKeys = new Set<string>([...Object.keys(oldMap || {}), ...Object.keys(newMap || {})]);
        for (const category of allKeys) {
            const oldVal = oldMap?.[category];
            const newVal = newMap?.[category];
            // Removed or cleared cutoff → revert everything we auto-changed for this category
            if (!newVal || newVal === '-' || newVal === '') {
                if (oldVal && oldVal !== '-' && oldVal !== '') {
                    this.logger.log(`CP "${cpName}" [${category}]: cutoff REMOVED, reverting`);
                    await this.schedulerService.revertCutoffRunners(cpName, campaignId, cpType, category);
                }
                continue;
            }
            const newDate = new Date(newVal);
            if (isNaN(newDate.getTime())) continue;
            if (!oldVal || oldVal === '-' || oldVal === '') continue; // first-time set, no revert
            const oldDate = new Date(oldVal);
            if (isNaN(oldDate.getTime())) continue;
            if (newDate.getTime() <= oldDate.getTime()) continue; // shortened, not extended
            this.logger.log(
                `CP "${cpName}" [${category}]: cutoff EXTENDED ${oldDate.toISOString()} → ${newDate.toISOString()}`
            );
            await this.schedulerService.revertCutoffRunners(cpName, campaignId, cpType, category);
        }
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
            .lean()
            .exec();
    }

    async findMappingsByCampaignAndEvent(campaignId: string, eventId: string): Promise<any[]> {
        const checkpoints = await this.findByCampaign(campaignId);
        const mappings = await this.findMappingsByEvent(eventId);

        return checkpoints.map(cp => {
            const cpObj = typeof (cp as any).toObject === 'function' ? (cp as any).toObject() : cp;
            const cpIdStr = cpObj._id?.toString?.();
            const mapping = mappings.find(m => {
                const cid = (m as any).checkpointId;
                const cidStr = cid?._id?.toString?.() ?? cid?.toString?.();
                return cidStr === cpIdStr;
            });
            const mappingObj = mapping && (typeof (mapping as any).toObject === 'function' ? (mapping as any).toObject() : mapping);
            return { ...cpObj, mapping: mappingObj || null };
        });
    }

    async updateMappings(mappings: Array<{ checkpointId: string; eventId: string } & Partial<CreateCheckpointMappingDto>>): Promise<void> {
        if (mappings.length === 0) return;
        const bulkOps = mappings.map(mapping => {
            const { checkpointId, eventId, ...rest } = mapping;
            const cpObjId = new Types.ObjectId(checkpointId);
            const evObjId = new Types.ObjectId(eventId);
            return {
                updateOne: {
                    filter: { checkpointId: cpObjId, eventId: evObjId },
                    update: {
                        $set: { ...rest },
                        $setOnInsert: { checkpointId: cpObjId, eventId: evObjId },
                    },
                    upsert: true,
                },
            };
        });
        await this.mappingModel.bulkWrite(bulkOps as any, { ordered: false });
    }

    async deleteMappingsByEvent(eventId: string): Promise<void> {
        await this.mappingModel.deleteMany({ eventId: new Types.ObjectId(eventId) }).exec();
    }
}

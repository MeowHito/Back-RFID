import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CctvCamera, CctvCameraDocument } from './cctv-camera.schema';
import { CreateCctvCameraDto } from './dto/create-cctv-camera.dto';

@Injectable()
export class CctvCamerasService {
    constructor(
        @InjectModel(CctvCamera.name)
        private readonly cameraModel: Model<CctvCameraDocument>,
    ) {}

    async create(dto: CreateCctvCameraDto): Promise<CctvCameraDocument> {
        const camera = new this.cameraModel(dto);
        return camera.save();
    }

    async findAll(): Promise<CctvCameraDocument[]> {
        return this.cameraModel.find().sort({ createdAt: -1 }).exec();
    }

    async findById(id: string): Promise<CctvCameraDocument> {
        const camera = await this.cameraModel.findById(id).exec();
        if (!camera) throw new NotFoundException('Camera not found');
        return camera;
    }

    async findByCampaign(campaignId: string): Promise<CctvCameraDocument[]> {
        return this.cameraModel
            .find({ campaignId })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(
        id: string,
        updateData: Partial<CreateCctvCameraDto>,
    ): Promise<CctvCameraDocument> {
        const camera = await this.cameraModel
            .findByIdAndUpdate(id, { $set: updateData }, { new: true })
            .exec();
        if (!camera) throw new NotFoundException('Camera not found');
        return camera;
    }

    async updateStatus(
        id: string,
        status: string,
    ): Promise<CctvCameraDocument> {
        const camera = await this.cameraModel
            .findByIdAndUpdate(
                id,
                { $set: { status, lastSeenAt: new Date() } },
                { new: true },
            )
            .exec();
        if (!camera) throw new NotFoundException('Camera not found');
        return camera;
    }

    async delete(id: string): Promise<{ deleted: boolean }> {
        const result = await this.cameraModel.findByIdAndDelete(id).exec();
        if (!result) throw new NotFoundException('Camera not found');
        return { deleted: true };
    }

    async getStats(campaignId?: string): Promise<{
        total: number;
        online: number;
        offline: number;
        totalViewers: number;
    }> {
        const filter = campaignId ? { campaignId } : {};
        const cameras = await this.cameraModel.find(filter).exec();
        return {
            total: cameras.length,
            online: cameras.filter((c) => c.status === 'online').length,
            offline: cameras.filter((c) => c.status !== 'online').length,
            totalViewers: cameras.reduce((sum, c) => sum + (c.viewerCount || 0), 0),
        };
    }
}

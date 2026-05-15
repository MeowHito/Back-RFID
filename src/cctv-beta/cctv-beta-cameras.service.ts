import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { CctvBetaCamera, CctvBetaCameraDocument } from './cctv-beta-camera.schema';
import { CreateCctvBetaCameraDto, UpdateCctvBetaCameraDto } from './dto/create-cctv-beta-camera.dto';

@Injectable()
export class CctvBetaCamerasService {
    constructor(
        @InjectModel(CctvBetaCamera.name)
        private readonly cameraModel: Model<CctvBetaCameraDocument>,
        private readonly config: ConfigService,
    ) {}

    private ingestHost(): string {
        return this.config.get<string>('CCTV_BETA_INGEST_HOST') || 'ingest.example.com';
    }

    private playbackHost(): string {
        return this.config.get<string>('CCTV_BETA_PLAYBACK_HOST') || 'play.example.com';
    }

    private buildUrls(streamKey: string) {
        const ingest = this.ingestHost();
        const play = this.playbackHost();
        return {
            ingestRtmpUrl: `rtmp://${ingest}:1935/live/${streamKey}`,
            ingestSrtUrl: `srt://${ingest}:8890?streamid=publish:live/${streamKey}&pkt_size=1316`,
            hlsUrl: `https://${play}/hls/${streamKey}/index.m3u8`,
            llHlsUrl: `https://${play}/hls/${streamKey}/index.m3u8`, // MediaMTX LL-HLS uses same path
            webrtcUrl: `https://${play}/whep/${streamKey}`,
        };
    }

    async create(dto: CreateCctvBetaCameraDto): Promise<CctvBetaCameraDocument> {
        const streamKey = `${dto.campaignId.slice(-6)}_${randomBytes(12).toString('hex')}`;
        const urls = this.buildUrls(streamKey);
        const camera = new this.cameraModel({
            ...dto,
            streamKey,
            ...urls,
        });
        return camera.save();
    }

    async findAll(): Promise<CctvBetaCameraDocument[]> {
        return this.cameraModel.find().sort({ createdAt: -1 }).exec();
    }

    async findById(id: string): Promise<CctvBetaCameraDocument> {
        const camera = await this.cameraModel.findById(id).exec();
        if (!camera) throw new NotFoundException('Beta camera not found');
        return camera;
    }

    async findByCampaign(campaignId: string): Promise<CctvBetaCameraDocument[]> {
        return this.cameraModel.find({ campaignId }).sort({ createdAt: -1 }).exec();
    }

    async findByStreamKey(streamKey: string): Promise<CctvBetaCameraDocument | null> {
        return this.cameraModel.findOne({ streamKey }).exec();
    }

    async update(id: string, dto: UpdateCctvBetaCameraDto): Promise<CctvBetaCameraDocument> {
        const camera = await this.cameraModel
            .findByIdAndUpdate(id, { $set: dto }, { new: true })
            .exec();
        if (!camera) throw new NotFoundException('Beta camera not found');
        return camera;
    }

    async rotateStreamKey(id: string): Promise<CctvBetaCameraDocument> {
        const existing = await this.findById(id);
        const streamKey = `${String(existing.campaignId).slice(-6)}_${randomBytes(12).toString('hex')}`;
        const urls = this.buildUrls(streamKey);
        Object.assign(existing, { streamKey, ...urls });
        return existing.save();
    }

    async remove(id: string): Promise<void> {
        const res = await this.cameraModel.findByIdAndDelete(id).exec();
        if (!res) throw new NotFoundException('Beta camera not found');
    }

    async markPublishing(streamKey: string): Promise<CctvBetaCameraDocument> {
        const cam = await this.cameraModel.findOneAndUpdate(
            { streamKey },
            { $set: { status: 'publishing', lastPublishAt: new Date() } },
            { new: true },
        ).exec();
        if (!cam) throw new ConflictException('Unknown streamKey');
        return cam;
    }

    async markOffline(streamKey: string): Promise<void> {
        await this.cameraModel.findOneAndUpdate(
            { streamKey },
            { $set: { status: 'offline', lastUnpublishAt: new Date() } },
        ).exec();
    }
}

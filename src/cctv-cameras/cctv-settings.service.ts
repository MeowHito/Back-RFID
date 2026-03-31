import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CctvSettings, CctvSettingsDocument } from './cctv-settings.schema';

@Injectable()
export class CctvSettingsService {
    constructor(
        @InjectModel(CctvSettings.name)
        private model: Model<CctvSettingsDocument>,
    ) {}

    async get(): Promise<CctvSettingsDocument> {
        let doc = await this.model.findOne({ key: 'singleton' }).exec();
        if (!doc) {
            doc = await this.model.create({ key: 'singleton' });
        }
        return doc;
    }

    async update(patch: Partial<CctvSettings>): Promise<CctvSettingsDocument> {
        const doc = await this.model.findOneAndUpdate(
            { key: 'singleton' },
            { $set: patch },
            { upsert: true, new: true },
        ).exec();
        return doc!;
    }
}

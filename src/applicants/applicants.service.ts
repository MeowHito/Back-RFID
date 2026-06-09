import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Applicant, ApplicantDocument } from './applicant.schema';

export interface ApplicantInput {
    idCard?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    phone?: string;
    age?: number | string | null;
    gender?: string;
    ageGroup?: string;
    shirtSize?: string;
    category?: string;
    team?: string;
    extra?: Record<string, string>;
}

/** Escape a user-provided string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ApplicantsService {
    constructor(
        @InjectModel(Applicant.name)
        private readonly applicantModel: Model<ApplicantDocument>,
    ) { }

    private normalize(campaignId: string, row: ApplicantInput) {
        const firstName = (row.firstName || '').toString().trim();
        const lastName = (row.lastName || '').toString().trim();
        const fullName = (row.fullName || `${firstName} ${lastName}`).toString().trim();
        const ageRaw = row.age;
        const age = ageRaw === '' || ageRaw === null || ageRaw === undefined ? null : Number(ageRaw);
        return {
            campaignId,
            idCard: (row.idCard || '').toString().trim(),
            bib: (row.bib || '').toString().trim(),
            firstName,
            lastName,
            fullName,
            phone: (row.phone || '').toString().trim(),
            age: Number.isFinite(age as number) ? (age as number) : null,
            gender: (row.gender || '').toString().trim(),
            ageGroup: (row.ageGroup || '').toString().trim(),
            shirtSize: (row.shirtSize || '').toString().trim(),
            category: (row.category || '').toString().trim(),
            team: (row.team || '').toString().trim(),
            extra: row.extra || {},
        };
    }

    /**
     * Bulk import applicants for a campaign.
     * mode 'replace' clears existing rows first; 'append' keeps them.
     */
    async bulkImport(campaignId: string, rows: ApplicantInput[], mode: 'replace' | 'append' = 'replace') {
        if (mode === 'replace') {
            await this.applicantModel.deleteMany({ campaignId }).exec();
        }
        const docs = (rows || []).map((r) => this.normalize(campaignId, r));
        if (docs.length === 0) {
            return { inserted: 0, mode };
        }
        const result = await this.applicantModel.insertMany(docs, { ordered: false });
        return { inserted: result.length, mode };
    }

    async findByCampaign(campaignId: string, limit = 0) {
        const q = this.applicantModel.find({ campaignId }).sort({ bib: 1, fullName: 1 }).lean();
        if (limit > 0) q.limit(limit);
        return q.exec();
    }

    async countByCampaign(campaignId: string) {
        return this.applicantModel.countDocuments({ campaignId }).exec();
    }

    async clearCampaign(campaignId: string) {
        const res = await this.applicantModel.deleteMany({ campaignId }).exec();
        return { deleted: res.deletedCount || 0 };
    }

    /**
     * Public search across identifiers. Returns every matching row (duplicates included).
     * Matches idCard / bib / phone (substring), and name fields (substring, case-insensitive).
     */
    async search(campaignId: string, query: string) {
        const term = (query || '').trim();
        if (!term) return [];
        const rx = new RegExp(escapeRegex(term), 'i');
        return this.applicantModel
            .find({
                campaignId,
                $or: [
                    { idCard: rx },
                    { bib: rx },
                    { phone: rx },
                    { firstName: rx },
                    { lastName: rx },
                    { fullName: rx },
                ],
            })
            .sort({ fullName: 1, bib: 1 })
            .limit(200)
            .lean()
            .exec();
    }
}

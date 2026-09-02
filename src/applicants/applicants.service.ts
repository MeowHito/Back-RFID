import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Applicant, ApplicantDocument } from './applicant.schema';
import { ApplicantEditLog, ApplicantEditLogDocument } from './applicant-edit-log.schema';

export interface ApplicantInput {
    idCard?: string;
    bib?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    fullNameEn?: string;
    phone?: string;
    age?: number | string | null;
    gender?: string;
    ageGroup?: string;
    shirtSize?: string;
    category?: string;
    team?: string;
    challenge?: string;
    extra?: Record<string, string>;
}

/** Escape a user-provided string for safe use inside a RegExp. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Separators that carry no meaning inside an ID card / BIB / phone number.
 * Two flavours on purpose:
 *  - QUERY_SEPARATOR_RE runs in Node, so it can use full unicode escapes
 *    (typographic dashes, non-breaking space) to clean up what the user typed.
 *  - STORED_SEPARATOR_CLASS goes into the regex MongoDB evaluates, and Mongo's
 *    PCRE2 engine rejects \u escapes — keep it plain ASCII.
 */
const QUERY_SEPARATOR_RE = /[\s\u00A0\u2010-\u2015\u2212\-./_,()]+/g;
const STORED_SEPARATOR_CLASS = '[\\s\\-./_,()]*';

/**
 * Build a regex that ignores separators on BOTH sides of the comparison:
 * the query is stripped of them, and the stored value may carry them anywhere.
 * So "1234567890123" finds a roster row saved as "1 2345 67890 12 3", and
 * "0636493623" finds "063-649-3623" (and vice versa).
 * Returns null when the term is nothing but separators.
 */
function looseRegex(term: string): RegExp | null {
    const compact = term.replace(QUERY_SEPARATOR_RE, '');
    if (!compact) return null;
    const pattern = Array.from(compact)
        .map(escapeRegex)
        .join(STORED_SEPARATOR_CLASS);
    return new RegExp(pattern, 'i');
}

@Injectable()
export class ApplicantsService {
    constructor(
        @InjectModel(Applicant.name)
        private readonly applicantModel: Model<ApplicantDocument>,
        @InjectModel(ApplicantEditLog.name)
        private readonly editLogModel: Model<ApplicantEditLogDocument>,
    ) { }

    private normalize(campaignId: string, row: ApplicantInput) {
        const firstName = (row.firstName || '').toString().trim();
        const lastName = (row.lastName || '').toString().trim();
        const fullName = (row.fullName || `${firstName} ${lastName}`).toString().trim();
        const firstNameEn = (row.firstNameEn || '').toString().trim();
        const lastNameEn = (row.lastNameEn || '').toString().trim();
        const fullNameEn = (row.fullNameEn || `${firstNameEn} ${lastNameEn}`).toString().trim();
        const ageRaw = row.age;
        const age = ageRaw === '' || ageRaw === null || ageRaw === undefined ? null : Number(ageRaw);
        return {
            campaignId,
            idCard: (row.idCard || '').toString().trim(),
            bib: (row.bib || '').toString().trim(),
            firstName,
            lastName,
            fullName,
            firstNameEn,
            lastNameEn,
            fullNameEn,
            phone: (row.phone || '').toString().trim(),
            age: Number.isFinite(age as number) ? (age as number) : null,
            gender: (row.gender || '').toString().trim(),
            ageGroup: (row.ageGroup || '').toString().trim(),
            shirtSize: (row.shirtSize || '').toString().trim(),
            category: (row.category || '').toString().trim(),
            team: (row.team || '').toString().trim(),
            challenge: (row.challenge || '').toString().trim(),
            extra: row.extra || {},
        };
    }

    /**
     * Bulk import applicants for a campaign.
     * mode 'replace' clears existing rows first; 'append' keeps them.
     * Logged as one summary entry per call — logging every row of a
     * multi-hundred-row roster would drown out the manual edits it exists to track.
     */
    async bulkImport(campaignId: string, rows: ApplicantInput[], mode: 'replace' | 'append' = 'replace', changedBy = 'admin') {
        if (mode === 'replace') {
            await this.applicantModel.deleteMany({ campaignId }).exec();
        }
        const docs = (rows || []).map((r) => this.normalize(campaignId, r));
        if (docs.length === 0) {
            return { inserted: 0, mode };
        }
        const result = await this.applicantModel.insertMany(docs, { ordered: false });
        await this.editLogModel.create({
            campaignId,
            changedBy,
            source: 'bulk-import',
            note: `${mode === 'replace' ? 'แทนที่ทั้งหมด' : 'เพิ่มต่อ'} ${result.length.toLocaleString()} รายการ`,
        });
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

    async clearCampaign(campaignId: string, changedBy = 'admin') {
        const res = await this.applicantModel.deleteMany({ campaignId }).exec();
        await this.editLogModel.create({
            campaignId,
            changedBy,
            source: 'clear-all',
            note: `ล้างทั้งหมด ${(res.deletedCount || 0).toLocaleString()} รายการ`,
        });
        return { deleted: res.deletedCount || 0 };
    }

    /** Patch a single field/set of fields on one applicant row (inline edit from the admin table). */
    async updateOne(id: string, patch: Partial<ApplicantInput>, changedBy = 'admin') {
        const before = await this.applicantModel.findById(id).lean();
        if (!before) return null;

        const set: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            if (key === 'age') {
                set.age = value === '' || value === null || value === undefined ? null : Number(value);
            } else if (key !== 'extra') {
                set[key] = (value ?? '').toString().trim();
            }
        }
        if (set.firstName !== undefined || set.lastName !== undefined) {
            const firstName = set.firstName !== undefined ? (set.firstName as string) : before.firstName || '';
            const lastName = set.lastName !== undefined ? (set.lastName as string) : before.lastName || '';
            if (set.fullName === undefined) set.fullName = `${firstName} ${lastName}`.trim();
        }

        const changes = Object.entries(set)
            .filter(([field, newValue]) => String((before as unknown as Record<string, unknown>)[field] ?? '') !== String(newValue ?? ''))
            .map(([field, newValue]) => ({
                field,
                oldValue: String((before as unknown as Record<string, unknown>)[field] ?? ''),
                newValue: String(newValue ?? ''),
            }));

        const updated = await this.applicantModel.findByIdAndUpdate(id, { $set: set }, { new: true }).lean().exec();

        if (changes.length > 0) {
            await this.editLogModel.create({
                campaignId: before.campaignId,
                applicantId: id,
                bib: updated?.bib || before.bib,
                applicantName: updated?.fullName || before.fullName,
                changedBy,
                source: 'edit',
                changes,
            });
        }

        return updated;
    }

    async deleteOne(id: string, changedBy = 'admin') {
        const res = await this.applicantModel.findByIdAndDelete(id).lean().exec();
        if (res) {
            await this.editLogModel.create({
                campaignId: res.campaignId,
                applicantId: id,
                bib: res.bib,
                applicantName: res.fullName,
                changedBy,
                source: 'delete',
                note: `ลบ ${res.fullName || res.bib || 'รายการ'}`,
            });
        }
        return { deleted: res ? 1 : 0 };
    }

    async getEditLogs(campaignId: string, limit = 3000) {
        return this.editLogModel
            .find({ campaignId })
            .sort({ changedAt: -1 })
            .limit(limit)
            .lean()
            .exec();
    }

    async deleteEditLogs(campaignId: string, logId?: string) {
        const filter = logId ? { _id: logId } : { campaignId };
        const res = await this.editLogModel.deleteMany(filter).exec();
        return { deleted: res.deletedCount || 0 };
    }

    /**
     * Public search across identifiers. Returns every matching row (duplicates included).
     * Matches idCard / bib / phone (substring), and name fields (substring, case-insensitive).
     */
    async search(campaignId: string, query: string) {
        const term = (query || '').trim();
        if (!term) return [];
        const rx = looseRegex(term);
        if (!rx) return [];
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
                    { firstNameEn: rx },
                    { lastNameEn: rx },
                    { fullNameEn: rx },
                ],
            })
            .sort({ fullName: 1, bib: 1 })
            .limit(200)
            .lean()
            .exec();
    }
}

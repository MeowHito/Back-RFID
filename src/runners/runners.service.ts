import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Runner, RunnerDocument } from './runner.schema';
import { RunnerEditLog, RunnerEditLogDocument } from './runner-edit-log.schema';
import { CreateRunnerDto } from './dto/create-runner.dto';
import { Event, EventDocument } from '../events/event.schema';
import { TimingRecord, TimingRecordDocument } from '../timing/timing-record.schema';
import { Campaign, CampaignDocument } from '../campaigns/campaign.schema';
import { isThaiNationality } from '../common/nationality.util';

// Bio fields an admin can hand-edit via PUT /runners/:id that a RaceTiger re-import would otherwise clobber
export const PROTECTED_BIO_FIELDS = [
    'firstName', 'lastName', 'firstNameTh', 'lastNameTh', 'gender', 'category',
    'ageGroup', 'age', 'nationality', 'birthDate', 'idNo', 'team', 'teamName',
    'chipCode', 'rfidTag', 'printingCode', 'email', 'phone',
];

export interface RunnerFilter {
    eventId?: string;
    campaignId?: string;
    category?: string;
    gender?: string;
    ageGroup?: string;
    box?: string;
    status?: string;
    search?: string;
    checkpoint?: string;
    chipStatus?: string;
    runnerStatus?: string; // comma-separated: no_bib,dup_bib,no_chip,dup_chip,ready,no_name,no_gender,no_nat,no_age
    nationality?: string; // 'thai' | 'foreign' — filter by nationality group
    sortBy?: string; // bib, firstName, ageGroup, chipCode
    sortOrder?: string; // asc, desc
}

/** Case-insensitive match for Thailand nationality tokens (mirrors isThaiNationality). */
const THAI_NATIONALITY_REGEX = /^\s*(tha|th|thai|thailand|ไทย)\s*$/i;

/** Mongo condition for a nationality group ('thai' includes empty/unknown, per app convention). */
function nationalityGroupCondition(kind?: string): Record<string, any> | null {
    if (kind === 'thai') {
        return { $or: [{ nationality: { $exists: false } }, { nationality: { $in: ['', null] } }, { nationality: THAI_NATIONALITY_REGEX }] };
    }
    if (kind === 'foreign') {
        return { nationality: { $exists: true, $nin: ['', null], $not: THAI_NATIONALITY_REGEX } };
    }
    return null;
}

export interface PagingData {
    page: number;
    limit: number;
    search?: string;
}

@Injectable()
export class RunnersService {
    constructor(
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
        @InjectModel(TimingRecord.name) private timingModel: Model<TimingRecordDocument>,
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        @InjectModel(RunnerEditLog.name) private runnerEditLogModel: Model<RunnerEditLogDocument>,
    ) { }

    // Get all runners without filter (for debugging/checking data)
    async findAll(limit: number = 100): Promise<RunnerDocument[]> {
        return this.runnerModel.find().limit(limit).sort({ createdAt: -1 }).lean().exec() as Promise<RunnerDocument[]>;
    }

    async create(createRunnerDto: CreateRunnerDto): Promise<RunnerDocument> {
        const runner = new this.runnerModel({
            ...createRunnerDto,
            eventId: new Types.ObjectId(createRunnerDto.eventId),
        });
        return runner.save();
    }

    async createMany(runners: CreateRunnerDto[], updateExisting = false): Promise<{ inserted: number; updated: number; errors: string[] }> {
        const result = { inserted: 0, updated: 0, errors: [] as string[] };
        if (!runners || runners.length === 0) return result;

        if (updateExisting) {
            // Use bulkWrite with upsert — update bio fields, but NEVER overwrite status/timing
            const bulkOps = runners.map(r => {
                const bioFields: Record<string, any> = {
                    firstName: r.firstName,
                    lastName: r.lastName,
                    gender: r.gender,
                    category: r.category,
                    eventId: new Types.ObjectId(r.eventId),
                };
                // Only set optional bio fields if they have a value
                if (r.firstNameTh) bioFields.firstNameTh = r.firstNameTh;
                if (r.lastNameTh) bioFields.lastNameTh = r.lastNameTh;
                if (r.age) bioFields.age = r.age;
                if (r.ageGroup) bioFields.ageGroup = r.ageGroup;
                if (r.team) bioFields.team = r.team;
                if (r.teamName) bioFields.teamName = r.teamName;
                if (r.chipCode) bioFields.chipCode = r.chipCode;
                if (r.rfidTag) bioFields.rfidTag = r.rfidTag;
                if (r.nationality) bioFields.nationality = r.nationality;
                if (r.province) bioFields.province = r.province;
                if (r.address) bioFields.address = r.address;
                if (r.phone) bioFields.phone = r.phone;
                if (r.birthDate) bioFields.birthDate = r.birthDate;
                if (r.idNo) bioFields.idNo = r.idNo;
                if (r.email) bioFields.email = r.email;
                if ((r as any).athleteId) bioFields.athleteId = (r as any).athleteId;
                if (r.sourceFile) bioFields.sourceFile = r.sourceFile;

                // Pipeline update: skip any field an admin has manually edited (tracked in
                // manuallyEditedFields), and only apply insert-only defaults when the field
                // doesn't already exist (equivalent to $setOnInsert, which pipeline updates don't support).
                const setStage: Record<string, any> = {};
                for (const [key, value] of Object.entries(bioFields)) {
                    setStage[key] = PROTECTED_BIO_FIELDS.includes(key)
                        ? { $cond: [{ $in: [key, { $ifNull: ['$manuallyEditedFields', []] }] }, `$${key}`, value] }
                        : value;
                }
                const insertOnlyDefaults: Record<string, any> = {
                    status: 'not_started',
                    isStarted: false,
                    isManualStatus: false,
                    netTime: 0,
                    elapsedTime: 0,
                    overallRank: 0,
                    genderRank: 0,
                    ageGroupRank: 0,
                    categoryRank: 0,
                };
                for (const [key, value] of Object.entries(insertOnlyDefaults)) {
                    setStage[key] = { $ifNull: [`$${key}`, value] };
                }

                return {
                    updateOne: {
                        filter: { eventId: new Types.ObjectId(r.eventId), bib: r.bib },
                        update: [{ $set: setStage }],
                        upsert: true,
                    },
                };
            });
            const bulkResult = await this.runnerModel.bulkWrite(bulkOps as any, { ordered: false });
            result.inserted = bulkResult.upsertedCount || 0;
            result.updated = bulkResult.modifiedCount || 0;
        } else {
            // Insert only, skip duplicates (ordered: false continues past errors)
            try {
                const docs = runners.map(r => ({
                    ...r,
                    eventId: new Types.ObjectId(r.eventId),
                }));
                const inserted = await this.runnerModel.insertMany(docs, { ordered: false });
                result.inserted = inserted.length;
            } catch (err: any) {
                // MongoDB duplicate key errors (code 11000) — partial success
                if (err.code === 11000 || err.writeErrors) {
                    const successCount = err.insertedDocs?.length ?? err.result?.nInserted ?? 0;
                    result.inserted = successCount;
                    const dupCount = runners.length - successCount;
                    if (dupCount > 0) {
                        result.errors.push(`${dupCount} BIB ซ้ำ (duplicate) — ข้ามไป`);
                    }
                } else {
                    throw err;
                }
            }
        }
        return result;
    }

    /** Count runners by event (fast, uses index) – use this instead of findByEvent().length */
    async countByEvent(eventId: string): Promise<number> {
        return this.runnerModel.countDocuments({
            eventId: new Types.ObjectId(eventId),
        }).exec();
    }

    /** Count runners grouped by category for a campaign — single aggregation instead of N requests */
    async countByEventGrouped(campaignId: string): Promise<Record<string, number>> {
        const campaignOid = new Types.ObjectId(campaignId);
        const events = await (this.runnerModel.db.model('Event') as any)
            .find({ $or: [{ campaignId: campaignOid }, { campaignId: campaignId }] })
            .select('_id').lean().exec();
        const eventIds = events.map((e: any) => new Types.ObjectId(String(e._id)));
        eventIds.push(campaignOid);

        const results = await this.runnerModel.aggregate([
            { $match: { eventId: { $in: eventIds } } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
        ]).exec();

        const counts: Record<string, number> = {};
        let total = 0;
        for (const r of results) {
            counts[r._id] = r.count;
            total += r.count;
        }
        counts['__all__'] = total;
        return counts;
    }

    /** List runners by event – capped at 2000 to avoid slow responses. Use findByEventWithPaging for large lists. */
    async findByEvent(filter: RunnerFilter, limitCap: number = 2000): Promise<RunnerDocument[]> {
        const query: any = { eventId: new Types.ObjectId(filter.eventId) };

        if (filter.category) query.category = filter.category;
        if (filter.gender) query.gender = filter.gender;
        if (filter.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter.box) query.box = filter.box;
        if (filter.status) query.status = filter.status;
        if (filter.checkpoint) query.latestCheckpoint = filter.checkpoint;

        if (filter.search) {
            query.$or = [
                { bib: { $regex: filter.search, $options: 'i' } },
                { firstName: { $regex: filter.search, $options: 'i' } },
                { lastName: { $regex: filter.search, $options: 'i' } },
                { firstNameTh: { $regex: filter.search, $options: 'i' } },
                { lastNameTh: { $regex: filter.search, $options: 'i' } },
            ];
        }

        return this.runnerModel
            .find(query)
            .sort({ overallRank: 1, bib: 1 })
            .limit(limitCap)
            .lean()
            .exec() as Promise<RunnerDocument[]>;
    }

    async findByEventIds(
        eventIds: string[],
        filter?: Pick<RunnerFilter, 'category' | 'gender' | 'ageGroup' | 'status' | 'checkpoint' | 'search'>,
        limitCap: number = 5000,
    ): Promise<RunnerDocument[]> {
        const objectIds = eventIds
            .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id));

        if (!objectIds.length) {
            return [];
        }

        const query: any = { eventId: { $in: objectIds } };
        if (filter?.category) query.category = filter.category;
        if (filter?.gender) query.gender = filter.gender;
        if (filter?.ageGroup) query.ageGroup = filter.ageGroup;
        if (filter?.status) query.status = filter.status;
        if (filter?.checkpoint) query.latestCheckpoint = filter.checkpoint;

        if (filter?.search) {
            query.$or = [
                { bib: { $regex: filter.search, $options: 'i' } },
                { firstName: { $regex: filter.search, $options: 'i' } },
                { lastName: { $regex: filter.search, $options: 'i' } },
                { firstNameTh: { $regex: filter.search, $options: 'i' } },
                { lastNameTh: { $regex: filter.search, $options: 'i' } },
            ];
        }

        return this.runnerModel
            .find(query)
            .sort({ overallRank: 1, bib: 1 })
            .limit(limitCap)
            .lean()
            .exec() as Promise<RunnerDocument[]>;
    }

    async findByEventWithPaging(filter: RunnerFilter, paging?: PagingData, skipStatusCounts = false): Promise<{ data: RunnerDocument[]; total: number; dupBibs?: string[]; dupChips?: string[]; statusCounts?: Record<string, number> }> {
        const t0 = Date.now();

        // --- 1. Resolve event IDs (1 DB call) ---
        let eventOidFilter: any;
        if (filter.campaignId && Types.ObjectId.isValid(filter.campaignId)) {
            const campaignOid = new Types.ObjectId(filter.campaignId);
            const events = await (this.runnerModel.db.model('Event') as any)
                .find({ $or: [{ campaignId: campaignOid }, { campaignId: filter.campaignId }] })
                .select('_id').lean().exec();
            const eventIds = events.map((e: any) => new Types.ObjectId(String(e._id)));
            eventIds.push(campaignOid);
            eventOidFilter = { $in: eventIds };
        } else {
            eventOidFilter = new Types.ObjectId(filter.eventId);
        }
        const baseMatch: any = { eventId: eventOidFilter };
        if (filter.category) baseMatch.category = filter.category;

        const emptyCond = (field: string) => ({ $or: [{ [field]: { $exists: false } }, { [field]: '' }, { [field]: null }] });

        // Build query filters (search, gender, status, etc.)
        const queryMatch: any = { ...baseMatch };
        if (filter.gender) queryMatch.gender = filter.gender;
        if (filter.ageGroup) queryMatch.ageGroup = filter.ageGroup;
        if (filter.status) queryMatch.status = filter.status;
        const natCond = nationalityGroupCondition(filter.nationality);
        if (natCond) {
            if (!queryMatch.$and) queryMatch.$and = [];
            queryMatch.$and.push(natCond);
        }
        if (filter.chipStatus === 'has') {
            queryMatch.chipCode = { $exists: true, $nin: ['', null] };
        } else if (filter.chipStatus === 'missing') {
            if (!queryMatch.$and) queryMatch.$and = [];
            queryMatch.$and.push({ $or: [{ chipCode: { $exists: false } }, { chipCode: '' }, { chipCode: null }] });
        }
        if (paging?.search || filter.search) {
            const searchTerm = paging?.search || filter.search;
            if (!queryMatch.$and) queryMatch.$and = [];
            queryMatch.$and.push({
                $or: [
                    { bib: { $regex: searchTerm, $options: 'i' } },
                    { firstName: { $regex: searchTerm, $options: 'i' } },
                    { lastName: { $regex: searchTerm, $options: 'i' } },
                ],
            });
        }

        const page = paging?.page || 1;
        const limit = paging?.limit || 50;
        const skip = (page - 1) * limit;
        let sortObj: any = { overallRank: 1, bib: 1 };
        if (filter.sortBy) {
            const dir = filter.sortOrder === 'desc' ? -1 : 1;
            sortObj = { [filter.sortBy]: dir };
        }

        const selectFields = {
            bib: 1, firstName: 1, lastName: 1, firstNameTh: 1, lastNameTh: 1,
            gender: 1, category: 1, ageGroup: 1, age: 1, nationality: 1,
            chipCode: 1, printingCode: 1, rfidTag: 1, status: 1,
            team: 1, teamName: 1, box: 1, shirtSize: 1,
            email: 1, phone: 1, idNo: 1, birthDate: 1,
            emergencyContact: 1, emergencyPhone: 1, medicalInfo: 1,
            bloodType: 1, chronicDiseases: 1, address: 1, province: 1, sourceFile: 1,
            netTime: 1, gunTime: 1, netTimeStr: 1, gunTimeStr: 1, finishTime: 1, lastPassTime: 1,
            overallRank: 1, genderRank: 1, ageGroupRank: 1, categoryRank: 1,
        };

        // --- FAST PATH: skipStatusCounts & no runnerStatus filter → 1 DB call ---
        if (skipStatusCounts && !filter.runnerStatus) {
            const result = await this.runnerModel.aggregate([
                { $match: queryMatch },
                {
                    $facet: {
                        data: [{ $sort: sortObj }, { $skip: skip }, { $limit: limit }, { $project: selectFields }],
                        total: [{ $count: 'c' }],
                    },
                },
            ]).exec();
            const rf = result[0] || {};
            console.log(`[paged] fast: ${Date.now() - t0}ms`);
            return { data: (rf.data || []) as RunnerDocument[], total: rf.total?.[0]?.c || 0 };
        }

        // --- FULL PATH: dups + status counts + data in 1 $facet (1 DB call) ---
        const facetResult = await this.runnerModel.aggregate([
            { $match: baseMatch },
            {
                $facet: {
                    dupBibs: [
                        { $match: { bib: { $exists: true, $nin: ['', null] } } },
                        { $group: { _id: '$bib', count: { $sum: 1 } } },
                        { $match: { count: { $gt: 1 } } },
                    ],
                    dupChips: [
                        { $match: { chipCode: { $exists: true, $nin: ['', null] } } },
                        { $group: { _id: '$chipCode', count: { $sum: 1 } } },
                        { $match: { count: { $gt: 1 } } },
                    ],
                    totalAll: [{ $count: 'c' }],
                    noBib: [{ $match: { $or: [{ bib: { $exists: false } }, { bib: '' }, { bib: null }] } }, { $count: 'c' }],
                    noChip: [{ $match: { $or: [{ chipCode: { $exists: false } }, { chipCode: '' }, { chipCode: null }] } }, { $count: 'c' }],
                    noName: [{ $match: { $or: [{ firstName: { $exists: false } }, { firstName: '' }, { firstName: null }] } }, { $count: 'c' }],
                    noGender: [{ $match: { $or: [{ gender: { $exists: false } }, { gender: '' }, { gender: null }] } }, { $count: 'c' }],
                    noNat: [{ $match: { $or: [{ nationality: { $exists: false } }, { nationality: '' }, { nationality: null }] } }, { $count: 'c' }],
                    noAge: [{ $match: { $or: [{ ageGroup: { $exists: false } }, { ageGroup: '' }, { ageGroup: null }] } }, { $count: 'c' }],
                },
            },
        ]).exec();

        const fc = (arr: any[]) => arr?.[0]?.c || 0;
        const f = facetResult[0] || {};
        const dupBibs = (f.dupBibs || []).map((d: any) => d._id);
        const dupChips = (f.dupChips || []).map((d: any) => d._id);
        const totalAll = fc(f.totalAll);
        const noBibCount = fc(f.noBib);
        const noChipCount = fc(f.noChip);

        // Count dup documents (need actual count of runners with dup bibs, not just unique dup bibs)
        // Use the dup aggregation results to compute counts
        const dupBibCount = (f.dupBibs || []).reduce((sum: number, d: any) => sum + d.count, 0);
        const dupChipCount = (f.dupChips || []).reduce((sum: number, d: any) => sum + d.count, 0);

        const readyCount = totalAll - noBibCount - dupBibCount - noChipCount - dupChipCount;
        const statusCounts: Record<string, number> = {
            no_bib: noBibCount, dup_bib: dupBibCount, no_chip: noChipCount, dup_chip: dupChipCount,
            no_name: fc(f.noName), no_gender: fc(f.noGender), no_nat: fc(f.noNat), no_age: fc(f.noAge),
            ready: Math.max(0, readyCount),
        };

        // Apply runnerStatus filter
        const statuses = filter.runnerStatus ? filter.runnerStatus.split(',').map(s => s.trim()) : [];
        if (statuses.length > 0) {
            const statusConditions: any[] = [];
            for (const s of statuses) {
                if (s === 'no_bib') statusConditions.push(emptyCond('bib'));
                if (s === 'dup_bib' && dupBibs.length > 0) statusConditions.push({ bib: { $in: dupBibs } });
                if (s === 'dup_bib' && dupBibs.length === 0) statusConditions.push({ _id: null });
                if (s === 'no_chip') statusConditions.push(emptyCond('chipCode'));
                if (s === 'dup_chip' && dupChips.length > 0) statusConditions.push({ chipCode: { $in: dupChips } });
                if (s === 'dup_chip' && dupChips.length === 0) statusConditions.push({ _id: null });
                if (s === 'no_name') statusConditions.push({ $or: [{ firstName: { $exists: false } }, { firstName: '' }, { firstName: null }] });
                if (s === 'no_gender') statusConditions.push({ $or: [{ gender: { $exists: false } }, { gender: '' }, { gender: null }] });
                if (s === 'no_nat') statusConditions.push(emptyCond('nationality'));
                if (s === 'no_age') statusConditions.push(emptyCond('ageGroup'));
                if (s === 'ready') {
                    statusConditions.push({
                        bib: { $exists: true, $nin: ['', null, ...dupBibs] },
                        chipCode: { $exists: true, $nin: ['', null, ...dupChips] },
                    });
                }
            }
            if (statusConditions.length > 0) {
                if (!queryMatch.$and) queryMatch.$and = [];
                queryMatch.$and.push(...statusConditions);
            }
        }

        // Get filtered data + total (1 more DB call)
        const dataResult = await this.runnerModel.aggregate([
            { $match: queryMatch },
            {
                $facet: {
                    data: [{ $sort: sortObj }, { $skip: skip }, { $limit: limit }, { $project: selectFields }],
                    total: [{ $count: 'c' }],
                },
            },
        ]).exec();

        const df = dataResult[0] || {};
        console.log(`[paged] full: ${Date.now() - t0}ms`);
        return {
            data: (df.data || []) as RunnerDocument[],
            total: df.total?.[0]?.c || 0,
            dupBibs, dupChips, statusCounts,
        };
    }

    /** Count runners by nationality group (Thai vs foreign) for a campaign, optionally scoped to a category. */
    async getNationalityCounts(
        campaignId: string,
        category?: string,
    ): Promise<{ thai: number; foreign: number; total: number }> {
        if (!campaignId || !Types.ObjectId.isValid(campaignId)) {
            return { thai: 0, foreign: 0, total: 0 };
        }
        const campaignOid = new Types.ObjectId(campaignId);
        const events = await (this.runnerModel.db.model('Event') as any)
            .find({ $or: [{ campaignId: campaignOid }, { campaignId: campaignId }] })
            .select('_id').lean().exec();
        const eventIds = events.map((e: any) => new Types.ObjectId(String(e._id)));
        eventIds.push(campaignOid);

        const match: any = { eventId: { $in: eventIds } };
        if (category) match.category = category;

        const grouped = await this.runnerModel.aggregate([
            { $match: match },
            { $group: { _id: '$nationality', count: { $sum: 1 } } },
        ]).exec();

        let thai = 0, foreign = 0, total = 0;
        for (const g of grouped) {
            const n = g.count || 0;
            total += n;
            if (isThaiNationality(g._id)) thai += n; else foreign += n;
        }
        return { thai, foreign, total };
    }

    async deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
        const result = await this.runnerModel.deleteMany({ _id: { $in: ids.map(id => new Types.ObjectId(id)) } }).exec();
        return { deletedCount: result.deletedCount || 0 };
    }

    async findOne(id: string): Promise<RunnerDocument> {
        const runner = await this.runnerModel.findById(id).exec();
        if (!runner) throw new NotFoundException('Runner not found');
        return runner;
    }

    async findByBib(eventId: string, bib: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            bib,
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async findByAthleteId(eventId: string, athleteId: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            athleteId,
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async findByRfid(eventId: string, rfidTag: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            $or: [{ rfidTag }, { chipCode: rfidTag }],
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    async findByChipCode(eventId: string, chipCode: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findOne({
            eventId: new Types.ObjectId(eventId),
            chipCode,
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    /** Lookup runner by BIB, chipCode, or printingCode across all events in a campaign */
    async findByAnyCode(
        eventIds: string[],
        code: string,
    ): Promise<RunnerDocument | null> {
        const objectIds = eventIds
            .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id));
        if (!objectIds.length) return null;

        return this.runnerModel.findOne({
            eventId: { $in: objectIds },
            $or: [
                { bib: code },
                { chipCode: code },
                { printingCode: code },
                { rfidTag: code },
                { idNo: code },
            ],
        }).lean().exec() as Promise<RunnerDocument | null>;
    }

    private async resolveLookupEventIds(campaignOrEventId?: string): Promise<Types.ObjectId[]> {
        if (!campaignOrEventId || !Types.ObjectId.isValid(campaignOrEventId)) return [];
        const id = new Types.ObjectId(campaignOrEventId);
        const eventIds = [id];
        const events = await this.eventModel
            .find({ $or: [{ campaignId: id }, { campaignId: campaignOrEventId }] })
            .select('_id')
            .lean()
            .exec();
        for (const event of events) {
            const eventId = (event as any)._id;
            if (Types.ObjectId.isValid(eventId)) eventIds.push(new Types.ObjectId(eventId));
        }
        const seen = new Set<string>();
        return eventIds.filter(eventId => {
            const key = eventId.toString();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /** Record an e-slip download for a runner: bump the counter and stamp the time.
     *  Returns the new download count (0 if the runner id is invalid/not found). */
    async incrementEslipDownload(runnerId: string): Promise<number> {
        if (!runnerId || !Types.ObjectId.isValid(runnerId)) return 0;
        const updated = await this.runnerModel
            .findByIdAndUpdate(
                runnerId,
                { $inc: { eslipDownloadCount: 1 }, $set: { eslipLastDownloadedAt: new Date() } },
                { new: true },
            )
            .select('eslipDownloadCount')
            .lean()
            .exec();
        return (updated as any)?.eslipDownloadCount || 0;
    }

    /** Aggregate e-slip download stats across every event in a campaign (or a single event).
     *  totalDownloads = sum of all downloads; uniqueRunners = distinct runners downloaded ≥1. */
    async getEslipDownloadStats(
        campaignOrEventId: string,
    ): Promise<{ totalDownloads: number; uniqueRunners: number }> {
        const eventIds = await this.resolveLookupEventIds(campaignOrEventId);
        if (!eventIds.length) return { totalDownloads: 0, uniqueRunners: 0 };
        const result = await this.runnerModel.aggregate([
            { $match: { eventId: { $in: eventIds }, eslipDownloadCount: { $gt: 0 } } },
            {
                $group: {
                    _id: null,
                    totalDownloads: { $sum: '$eslipDownloadCount' },
                    uniqueRunners: { $sum: 1 },
                },
            },
        ]);
        const row = result[0] || {};
        return {
            totalDownloads: row.totalDownloads || 0,
            uniqueRunners: row.uniqueRunners || 0,
        };
    }

    /** Global lookup: find runner by BIB, chipCode, printingCode or rfidTag (case-insensitive).
     *  RFID scanners output the full tag (e.g. 24 hex chars) but the DB may store
     *  only the last 8 chars as chipCode. Handles both directions of partial matching.
     *  When campaign/event scope is provided, results are scoped to that campaign's events
     *  so RaceTiger-synced runners stored under sub-events are also discoverable. */
    async findByAnyCodeGlobal(code: string, campaignOrEventId?: string): Promise<RunnerDocument | null> {
        if (!code) return null;
        const normalizedCode = code.trim();
        if (!normalizedCode) return null;
        const escaped = normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactCI = new RegExp(`^${escaped}$`, 'i');

        const eventScope: Record<string, any> = {};
        if (campaignOrEventId) {
            const eventIds = await this.resolveLookupEventIds(campaignOrEventId);
            if (!eventIds.length) return null;
            eventScope.eventId = { $in: eventIds };
        }

        // 1. Try exact match first (BIB, full chipCode, printingCode, rfidTag)
        const exact = await this.runnerModel.findOne({
            ...eventScope,
            $or: [
                { bib: normalizedCode },
                { chipCode: exactCI },
                { printingCode: exactCI },
                { rfidTag: exactCI },
                { idNo: normalizedCode },
            ],
        }).lean().exec() as RunnerDocument | null;
        if (exact) return exact;

        // 2. Partial matching for hex codes (scanner ↔ DB partial match)
        if (normalizedCode.length >= 6 && /^[0-9A-Fa-f]+$/.test(normalizedCode)) {
            // 2a. Extract last 8 chars from scanned code, match against shorter chipCode in DB
            //     e.g. scanned "026F86D3E49528760204FE69" → try chipCode = "0204FE69"
            if (normalizedCode.length > 8) {
                const last8 = normalizedCode.slice(-8);
                const last8Escaped = last8.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const last8CI = new RegExp(`^${last8Escaped}$`, 'i');
                const byLast8 = await this.runnerModel.findOne({
                    ...eventScope,
                    $or: [
                        { chipCode: last8CI },
                        { printingCode: last8CI },
                        { rfidTag: last8CI },
                    ],
                }).lean().exec() as RunnerDocument | null;
                if (byLast8) return byLast8;
            }

            // 2b. Also try: DB chipCode ends with scanned code (opposite direction)
            const endsWith = new RegExp(`${escaped}$`, 'i');
            const partial = await this.runnerModel.findOne({
                ...eventScope,
                $or: [
                    { chipCode: endsWith },
                    { rfidTag: endsWith },
                ],
            }).lean().exec() as RunnerDocument | null;
            if (partial) return partial;
        }

        return null;
    }

    /** Batch-update timing/score fields for multiple runners in a single bulkWrite */
    async bulkUpdateTiming(ops: Array<{ id: any; data: Record<string, any> }>): Promise<number> {
        if (!ops.length) return 0;
        const bulkOps = ops.map(op => ({
            updateOne: {
                filter: { _id: op.id },
                update: { $set: op.data },
            },
        }));
        const BATCH_SIZE = 500;
        let modified = 0;
        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
            const batch = bulkOps.slice(i, i + BATCH_SIZE);
            const res = await this.runnerModel.bulkWrite(batch as any, { ordered: false });
            modified += res.modifiedCount || 0;
        }
        return modified;
    }

    /**
     * Auto-DQ finishers who never crossed the START line — the automatic equivalent of an
     * admin manually setting DQ for a "finished but no Start" runner.
     *
     * A runner is set to 'dq' when their status is an AUTO 'finished' (isManualStatus !== true)
     * and they have no timing record at a START checkpoint. Manually-set statuses are never
     * touched, and we intentionally do NOT set isManualStatus, so if a START record arrives
     * later the normal sync/scan promotion restores them to 'finished'.
     *
     * Safety guard: if not a single runner in the event has a START record (e.g. a gun-start
     * event with no START mat, or RaceTiger naming the start split something else), the rule is
     * skipped entirely so we never disqualify a whole field.
     *
     * @param startNames START checkpoint names to match, case-insensitive (defaults to ['START'])
     * @returns number of runners newly set to DQ
     */
    async autoDqFinishersWithoutStart(eventId: string, startNames: string[] = ['START']): Promise<number> {
        if (!Types.ObjectId.isValid(eventId)) return 0;
        const eventOid = new Types.ObjectId(eventId);
        const upperNames = Array.from(new Set(startNames.map(n => String(n || '').toUpperCase()).filter(Boolean)));
        if (upperNames.length === 0) upperNames.push('START');

        // runnerIds that have a START timing record (checkpoint name matched case-insensitively)
        const started = await this.timingModel.aggregate([
            { $match: { eventId: eventOid } },
            { $project: { runnerId: 1, cp: { $toUpper: '$checkpoint' } } },
            { $match: { cp: { $in: upperNames } } },
            { $group: { _id: '$runnerId' } },
        ]);
        const startedIds = new Set(started.map((r: { _id: unknown }) => String(r._id)));
        // No START records anywhere → this event has no start line to miss. Never DQ.
        if (startedIds.size === 0) return 0;

        const finishers = await this.runnerModel.find({
            eventId: eventOid,
            status: 'finished',
            isManualStatus: { $ne: true },
        }).select('_id').lean().exec() as Array<{ _id: Types.ObjectId }>;

        const toDqIds = finishers
            .map(r => r._id)
            .filter(id => !startedIds.has(String(id)));
        if (toDqIds.length === 0) return 0;

        const res = await this.runnerModel.updateMany(
            { _id: { $in: toDqIds } },
            {
                $set: {
                    status: 'dq',
                    statusChangedBy: 'auto-dq-no-start',
                    statusChangedAt: new Date(),
                    statusNote: 'Auto DQ: finished without a START record',
                },
            },
        ).exec();
        return res.modifiedCount || 0;
    }

    /**
     * Direct $set of derived/aggregate fields without triggering the FINISH
     * TimingRecord mirror logic that update() performs. Intended for callers
     * (e.g. TimingService) that are already the source of truth for these
     * fields and just need to push them onto the Runner doc.
     */
    async setAggregates(id: string, fields: Record<string, unknown>): Promise<void> {
        if (!fields || Object.keys(fields).length === 0) return;
        await this.runnerModel.findByIdAndUpdate(id, { $set: fields }).exec();
    }

    async update(id: string, updateData: any, changedBy?: string): Promise<RunnerDocument | null> {
        const before = await this.runnerModel.findById(id).lean().exec();
        if (!before) return null;

        // Diff against the whitelist of fields RaceTiger sync would otherwise overwrite —
        // only fields that actually changed get flagged as manually-edited & logged,
        // since the edit form re-submits the whole record on every save.
        const logChanges: { field: string; oldValue: string; newValue: string }[] = [];
        const toComparable = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ''));
        for (const field of PROTECTED_BIO_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(updateData, field)) continue;
            const oldStr = toComparable((before as any)[field]);
            const newStr = toComparable(updateData[field]);
            if (oldStr === newStr) continue;
            logChanges.push({ field, oldValue: oldStr, newValue: newStr });
        }

        const finalUpdate: Record<string, any> = { ...updateData };
        if (logChanges.length > 0) {
            const protectedFields = new Set<string>((before as any).manuallyEditedFields || []);
            logChanges.forEach(c => protectedFields.add(c.field));
            finalUpdate.manuallyEditedFields = [...protectedFields];
            finalUpdate.lastEditedBy = changedBy || 'admin';
            finalUpdate.lastEditedAt = new Date();
        }

        const updated = await this.runnerModel.findByIdAndUpdate(id, finalUpdate, { new: true }).exec();

        if (updated && logChanges.length > 0) {
            try {
                await this.runnerEditLogModel.create({
                    runnerId: updated._id,
                    bib: updated.bib,
                    changedBy: changedBy || 'admin',
                    changes: logChanges,
                });
            } catch { /* non-fatal */ }
        }

        // When the runner's net/gun finish time is edited, mirror it onto the
        // FINISH TimingRecord so /runner/[id]'s checkpoint table shows the same value.
        const touchedFinishFields = ['netTime', 'gunTime', 'elapsedTime', 'finishTime'].some(
            k => Object.prototype.hasOwnProperty.call(updateData, k),
        );
        if (updated && touchedFinishFields) {
            try {
                const finishUpdate: Record<string, unknown> = {};
                let newNetTime: number | null = null;
                if (Object.prototype.hasOwnProperty.call(updateData, 'netTime')) {
                    const v = Number(updateData.netTime) || 0;
                    finishUpdate.netTime = v;
                    finishUpdate.elapsedTime = v;
                    newNetTime = v;
                }
                if (Object.prototype.hasOwnProperty.call(updateData, 'gunTime')) {
                    finishUpdate.gunTime = Number(updateData.gunTime) || 0;
                }
                if (Object.prototype.hasOwnProperty.call(updateData, 'elapsedTime')
                    && !Object.prototype.hasOwnProperty.call(updateData, 'netTime')) {
                    const v = Number(updateData.elapsedTime) || 0;
                    finishUpdate.elapsedTime = v;
                    if (newNetTime == null) newNetTime = v;
                }
                if (Object.prototype.hasOwnProperty.call(updateData, 'finishTime') && updateData.finishTime) {
                    finishUpdate.scanTime = new Date(updateData.finishTime);
                    // If only finishTime was edited (no explicit netTime/elapsedTime),
                    // derive net time from finishTime - runner.startTime so the runner's
                    // displayed Net/Gun times update automatically.
                    if (newNetTime == null) {
                        const startMs = updated.startTime ? new Date(updated.startTime).getTime() : 0;
                        const finishMs = new Date(updateData.finishTime).getTime();
                        if (startMs > 0 && Number.isFinite(finishMs) && finishMs >= startMs) {
                            const derived = finishMs - startMs;
                            newNetTime = derived;
                            finishUpdate.netTime = derived;
                            finishUpdate.elapsedTime = derived;
                            await this.runnerModel.findByIdAndUpdate(id, {
                                $set: { netTime: derived, elapsedTime: derived },
                            }).exec();
                        }
                    }
                }
                if (Object.keys(finishUpdate).length > 0) {
                    // Load all timing records for this runner so we can recompute
                    // splitTime on the FINISH row relative to the previous checkpoint,
                    // and refresh pace strings that depend on the new net time.
                    const records = await this.timingModel
                        .find({ eventId: updated.eventId, runnerId: updated._id })
                        .sort({ order: 1 })
                        .lean()
                        .exec() as any[];
                    const finishIdx = records.findIndex(r => /^finish$/i.test(String(r.checkpoint || '')));
                    const finishRec = finishIdx >= 0 ? records[finishIdx] : null;
                    const prevRec = finishIdx > 0 ? records[finishIdx - 1] : null;

                    if (newNetTime != null && finishRec) {
                        const prevNet = prevRec ? Number(prevRec.netTime ?? prevRec.elapsedTime ?? 0) : 0;
                        const split = Math.max(0, newNetTime - prevNet);
                        finishUpdate.splitTime = split;

                        // Recompute pace strings when distance is known. If not, clear
                        // them so the frontend falls back to its own computation.
                        const finishDist = Number(finishRec.distanceFromStart) || 0;
                        const legDist = Number(finishRec.legDistance)
                            || (prevRec && finishRec.distanceFromStart != null && prevRec.distanceFromStart != null
                                ? Math.max(0, Number(finishRec.distanceFromStart) - Number(prevRec.distanceFromStart))
                                : 0);
                        const fmtPace = (ms: number, km: number): string => {
                            if (!(ms > 0) || !(km > 0)) return '';
                            const totalSec = ms / 1000 / km;
                            const m = Math.floor(totalSec / 60);
                            const s = Math.round(totalSec - m * 60);
                            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                        };
                        finishUpdate.netPace = fmtPace(newNetTime, finishDist);
                        finishUpdate.splitPace = fmtPace(split, legDist);
                        const gunMs = Object.prototype.hasOwnProperty.call(updateData, 'gunTime')
                            ? Number(updateData.gunTime) || 0
                            : Number(finishRec.gunTime) || 0;
                        finishUpdate.gunPace = fmtPace(gunMs, finishDist);
                    }

                    await this.timingModel.updateOne(
                        {
                            eventId: updated.eventId,
                            runnerId: updated._id,
                            checkpoint: { $regex: /^finish$/i },
                        },
                        { $set: finishUpdate },
                    ).exec();
                }
            } catch { /* non-fatal */ }
        }

        return updated;
    }

    async getEditLogs(runnerId: string): Promise<RunnerEditLogDocument[]> {
        return this.runnerEditLogModel
            .find({ runnerId: new Types.ObjectId(runnerId) })
            .sort({ changedAt: -1 })
            .limit(100)
            .lean()
            .exec() as unknown as Promise<RunnerEditLogDocument[]>;
    }

    /** All edit-log entries for every runner in a campaign (or a single event), newest first, with runner name/bib attached. */
    async getEditLogsByScope(campaignId?: string, eventId?: string): Promise<any[]> {
        let eventOidFilter: any;
        if (campaignId && Types.ObjectId.isValid(campaignId)) {
            const campaignOid = new Types.ObjectId(campaignId);
            const events = await (this.runnerModel.db.model('Event') as any)
                .find({ $or: [{ campaignId: campaignOid }, { campaignId: campaignId }] })
                .select('_id').lean().exec();
            const eventIds = events.map((e: any) => new Types.ObjectId(String(e._id)));
            eventIds.push(campaignOid);
            eventOidFilter = { $in: eventIds };
        } else if (eventId && Types.ObjectId.isValid(eventId)) {
            eventOidFilter = new Types.ObjectId(eventId);
        } else {
            return [];
        }

        const runnerIds = await this.runnerModel
            .find({ eventId: eventOidFilter })
            .select('_id')
            .lean()
            .exec();

        return this.runnerEditLogModel
            .find({ runnerId: { $in: runnerIds.map(r => r._id) } })
            .sort({ changedAt: -1 })
            .limit(500)
            .populate('runnerId', 'bib firstName lastName firstNameTh lastNameTh category')
            .lean()
            .exec();
    }

    /**
     * Re-point edit logs at the freshly re-imported runners after a clean-slate sync.
     *
     * The RaceTiger sync deletes every runner and re-inserts them, so each runner gets a
     * brand-new `_id`. Edit logs reference runners by `runnerId`, which would leave them
     * orphaned (and invisible in the "Edited List") after every sync. We heal the link by
     * matching on `bib` — stable across syncs — but only for logs that belonged to the runners
     * we just deleted (`oldRunnerIds`), so we never touch logs from other events/campaigns that
     * happen to reuse the same bib number.
     */
    async relinkEditLogsByBib(oldRunnerIds: Types.ObjectId[], eventOids: Types.ObjectId[]): Promise<number> {
        if (!oldRunnerIds.length || !eventOids.length) return 0;

        const logs = await this.runnerEditLogModel
            .find({ runnerId: { $in: oldRunnerIds } })
            .select('_id bib')
            .lean()
            .exec();
        if (!logs.length) return 0;

        const runners = await this.runnerModel
            .find({ eventId: { $in: eventOids } })
            .select('_id bib')
            .lean()
            .exec();
        const bibToId = new Map<string, Types.ObjectId>();
        for (const r of runners) {
            if (r.bib != null) bibToId.set(String(r.bib), r._id as Types.ObjectId);
        }

        const ops: any[] = [];
        for (const log of logs) {
            const newId = bibToId.get(String(log.bib));
            if (newId && String((log as any).runnerId) !== String(newId)) {
                ops.push({ updateOne: { filter: { _id: log._id }, update: { $set: { runnerId: newId } } } });
            }
        }
        if (!ops.length) return 0;

        await this.runnerEditLogModel.bulkWrite(ops, { ordered: false });
        return ops.length;
    }

    // Old updateStatus removed — replaced by new version at bottom with checkpoint + note support

    async updateTiming(
        id: string,
        data: {
            latestCheckpoint?: string;
            netTime?: number;
            elapsedTime?: number;
            finishTime?: Date;
            status?: string;
        }
    ): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }

    async updateRankings(eventId: string, category: string): Promise<void> {
        // Fetch all finished runners (lean for speed)
        const runners = await this.runnerModel
            .find({
                eventId: new Types.ObjectId(eventId),
                category,
                status: 'finished',
            })
            .lean()
            .exec();

        if (runners.length === 0) return;

        // Ranking convention: Overall + Gender placings are decided by GUN time, while
        // Age-group placing is decided by NET (chip) time. Overall is a single combined
        // list (no gender / nationality split). Locally-timed events only store netTime,
        // so each key falls back to the other time when its own is 0.
        const gunKey = (r: any) => (r.gunTime && r.gunTime > 0 ? r.gunTime : (r.netTime && r.netTime > 0 ? r.netTime : Infinity));
        const netKey = (r: any) => (r.netTime && r.netTime > 0 ? r.netTime : (r.gunTime && r.gunTime > 0 ? r.gunTime : Infinity));
        const byGun = [...runners].sort((a, b) => gunKey(a) - gunKey(b));
        const byNet = [...runners].sort((a, b) => netKey(a) - netKey(b));

        // Build a map: runnerId -> { overallRank, genderRank, ageGroupRank }
        const rankMap = new Map<string, { overallRank: number; genderRank: number; ageGroupRank: number }>();
        for (const runner of runners) {
            rankMap.set(runner._id.toString(), { overallRank: 0, genderRank: 0, ageGroupRank: 0 });
        }

        // Overall ranking — by GUN time, combined across both genders and all nationalities
        for (let i = 0; i < byGun.length; i++) {
            rankMap.get(byGun[i]._id.toString())!.overallRank = i + 1;
        }

        // Gender rankings — by GUN time
        for (const gender of ['M', 'F']) {
            const genderRunners = byGun.filter(r => r.gender === gender);
            for (let i = 0; i < genderRunners.length; i++) {
                rankMap.get(genderRunners[i]._id.toString())!.genderRank = i + 1;
            }
        }

        // Age group rankings — by NET time, scoped per gender so M40-49 and F40-49 rank separately
        const ageGroupGenderKeys = [...new Set(byNet.map(r => `${r.gender || ''}::${r.ageGroup || ''}`))];
        for (const key of ageGroupGenderKeys) {
            const [gender, ageGroup] = key.split('::');
            const groupRunners = byNet.filter(r => (r.gender || '') === gender && (r.ageGroup || '') === ageGroup);
            for (let i = 0; i < groupRunners.length; i++) {
                rankMap.get(groupRunners[i]._id.toString())!.ageGroupRank = i + 1;
            }
        }

        // Single bulkWrite instead of N individual updates
        const bulkOps = Array.from(rankMap.entries()).map(([id, ranks]) => ({
            updateOne: {
                filter: { _id: new Types.ObjectId(id) },
                update: { $set: ranks },
            },
        }));

        await this.runnerModel.bulkWrite(bulkOps, { ordered: false });
    }

    /** Category names whose Overall ranking is split by nationality, from the event's campaign. */
    private async getNationalitySplitCategories(eventId: string): Promise<string[]> {
        try {
            const event = await this.eventModel
                .findById(eventId)
                .select({ campaignId: 1 })
                .lean()
                .exec();
            if (!event?.campaignId) return [];
            const campaign = await this.campaignModel
                .findById(event.campaignId)
                .select({ separateOverallNationalityCategories: 1 })
                .lean()
                .exec();
            return Array.isArray(campaign?.separateOverallNationalityCategories)
                ? campaign.separateOverallNationalityCategories
                : [];
        } catch {
            return [];
        }
    }

    // Statistics methods from reference
    async getAllStatusByEvent(eventId: string): Promise<Array<{ status: string; count: number }>> {
        const result = await this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]).exec();
        return result.map(r => ({ status: r._id, count: r.count }));
    }

    async getStartersByAge(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: { $in: ['in_progress', 'finished'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getWithdrawalByAge(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: { $in: ['dnf', 'dns'] } } },
            { $group: { _id: '$ageGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getWithdrawalByCheckpoint(eventId: string): Promise<any[]> {
        return this.runnerModel.aggregate([
            { $match: { eventId: new Types.ObjectId(eventId), status: 'dnf' } },
            { $group: { _id: '$latestCheckpoint', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).exec();
    }

    async getFinishByTime(eventId: string): Promise<any[]> {
        // Use aggregation instead of loading all runners into memory
        return this.runnerModel.aggregate([
            {
                $match: {
                    eventId: new Types.ObjectId(eventId),
                    status: 'finished',
                    netTime: { $exists: true, $gt: 0 },
                },
            },
            {
                $project: {
                    hourBucket: { $floor: { $divide: ['$netTime', 3600000] } },
                },
            },
            {
                $group: {
                    _id: '$hourBucket',
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    timeRange: {
                        $concat: [
                            { $toString: '$_id' }, 'h-',
                            { $toString: { $add: ['$_id', 1] } }, 'h',
                        ],
                    },
                    count: 1,
                },
            },
        ]).exec();
    }

    async getParticipantWithStationByEvent(eventId: string): Promise<RunnerDocument[]> {
        return this.runnerModel.find({
            eventId: new Types.ObjectId(eventId),
            latestCheckpoint: { $exists: true, $ne: null },
        }).sort({ latestCheckpoint: 1, elapsedTime: 1 }).limit(2000).lean().exec() as Promise<RunnerDocument[]>;
    }

    async getLatestParticipantByCheckpoint(
        eventId: string,
        checkpoint: string,
        gender?: string,
        ageGroup?: string,
    ): Promise<RunnerDocument[]> {
        const query: any = {
            eventId: new Types.ObjectId(eventId),
            latestCheckpoint: checkpoint,
        };
        if (gender) query.gender = gender;
        if (ageGroup) query.ageGroup = ageGroup;

        return this.runnerModel.find(query).sort({ elapsedTime: -1 }).limit(50).lean().exec() as Promise<RunnerDocument[]>;
    }

    async delete(id: string): Promise<void> {
        await this.runnerModel.findByIdAndDelete(id).exec();
    }

    async deleteByEvent(eventId: string): Promise<void> {
        await this.runnerModel.deleteMany({ eventId: new Types.ObjectId(eventId) }).exec();
    }

    async deleteAllParticipants(eventId: string): Promise<void> {
        await this.deleteByEvent(eventId);
    }

    async deleteNonFinishedBySource(eventIds: string[], sourceFile: string): Promise<number> {
        const result = await this.runnerModel.deleteMany({
            eventId: { $in: eventIds.map(id => new Types.ObjectId(id)) },
            status: { $nin: ['finished'] },
            sourceFile,
        }).exec();
        return result.deletedCount || 0;
    }

    async deleteAllBySource(eventIds: string[], sourceFile: string): Promise<number> {
        const result = await this.runnerModel.deleteMany({
            eventId: { $in: eventIds.map(id => new Types.ObjectId(id)) },
            sourceFile,
        }).exec();
        return result.deletedCount || 0;
    }

    /** Update runner status with optional checkpoint + note (admin live edit) */
    async updateStatus(
        runnerId: string,
        data: {
            status: string;
            statusCheckpoint?: string;
            statusNote?: string;
            changedBy?: string;
        },
    ): Promise<RunnerDocument | null> {
        const validStatuses = ['not_started', 'in_progress', 'finished', 'dnf', 'dns', 'dq'];
        if (!validStatuses.includes(data.status)) {
            throw new NotFoundException(`Invalid status: ${data.status}`);
        }
        const isManualStop = ['dnf', 'dns', 'dq'].includes(data.status);
        let targetStatus = data.status;
        // Check if we're reverting FROM a stopped status (DNF/DNS/DQ)
        let isRevertFromStopped = false;
        // When reverting to in_progress, check if runner already has timing at FINISH checkpoint
        // If so, auto-promote to 'finished' (matching racetimingms_reference revertDNFToRunning logic)
        if (targetStatus === 'in_progress') {
            try {
                const runner = await this.runnerModel.findById(runnerId).lean().exec();
                if (runner) {
                    const curStatus = ((runner as any).status || '').toLowerCase();
                    isRevertFromStopped = ['dnf', 'dns', 'dq'].includes(curStatus);
                    const TimingModel = this.runnerModel.db.model('TimingRecord');
                    const CheckpointModel = this.runnerModel.db.model('Checkpoint');
                    // Find FINISH-type checkpoints for this runner's campaign
                    const finishCps = await CheckpointModel.find({ type: 'finish' }).select('name').lean().exec();
                    const finishNames = finishCps.map((cp: any) => (cp.name || '').toUpperCase());
                    if (finishNames.length === 0) finishNames.push('FINISH');
                    // Check if runner has any timing record at a FINISH checkpoint
                    const finishTiming = await TimingModel.findOne({
                        eventId: runner.eventId,
                        bib: runner.bib,
                        checkpoint: { $regex: new RegExp(`^(${finishNames.join('|')})$`, 'i') },
                    }).lean().exec();
                    if (finishTiming) {
                        targetStatus = 'finished';
                    }
                }
            } catch { /* If check fails, fall back to in_progress */ }
        }
        const update: any = {
            status: targetStatus,
            statusChangedAt: new Date(),
            // isManualStatus = true for: DNF/DNS/DQ set by staff, OR revert from stopped status
            // (revert needs protection from cutoff scheduler re-marking them DNF/DNS)
            isManualStatus: isManualStop || isRevertFromStopped,
        };
        if (data.statusCheckpoint !== undefined) update.statusCheckpoint = data.statusCheckpoint;
        if (data.statusNote !== undefined) update.statusNote = data.statusNote;
        if (data.changedBy) update.statusChangedBy = data.changedBy;
        // Clear manual status fields when reverting to running/not_started
        // (but keep them for 'finished' — admin uses statusCheckpoint='FINISH' to override
        //  a stale latestCheckpoint set by an earlier scan like CP4)
        if (!isManualStop && targetStatus !== 'finished') {
            update.statusCheckpoint = '';
            update.statusNote = '';
        }
        // When manually marking as finished, also push latestCheckpoint forward to the
        // FINISH checkpoint so the /event/[slug] STATUS column doesn't keep falling
        // back to splitDesc (e.g. 'CP4') from the last RaceTiger pass-time sync.
        if (targetStatus === 'finished') {
            try {
                const runner = await this.runnerModel.findById(runnerId).lean().exec();
                if (runner) {
                    const TimingModel = this.runnerModel.db.model('TimingRecord');
                    const finishTiming = await TimingModel.findOne({
                        eventId: (runner as any).eventId,
                        bib: (runner as any).bib,
                        checkpoint: { $regex: /^finish$/i },
                    }).select('checkpoint scanTime order splitNo splitDesc').sort({ order: -1 }).lean().exec() as any;
                    const finishName = (data.statusCheckpoint && data.statusCheckpoint.trim())
                        || finishTiming?.checkpoint
                        || 'FINISH';
                    update.latestCheckpoint = finishName;
                    update.splitDesc = finishName;
                    if (finishTiming?.order != null) update.splitNo = finishTiming.order;
                    if (finishTiming?.scanTime) update.finishTime = finishTiming.scanTime;
                }
            } catch { /* non-fatal */ }
        }
        return this.runnerModel.findByIdAndUpdate(runnerId, { $set: update }, { new: true }).lean().exec() as Promise<RunnerDocument | null>;
    }

    /** Bulk-update status for multiple runners (admin bulk action) */
    async bulkUpdateStatus(
        updates: Array<{
            id: string;
            status: string;
            statusCheckpoint?: string;
            statusNote?: string;
            changedBy?: string;
        }>,
    ): Promise<{ updated: number; errors: string[] }> {
        const validStatuses = ['not_started', 'in_progress', 'finished', 'dnf', 'dns', 'dq'];
        const result = { updated: 0, errors: [] as string[] };
        if (!updates || updates.length === 0) return result;

        // Pre-load runners to check current status and determine auto-promote logic
        const runnerIds = updates.map(u => new Types.ObjectId(u.id));
        const runners = await this.runnerModel.find({ _id: { $in: runnerIds } }).lean().exec();
        const runnerMap = new Map<string, any>();
        for (const r of runners) {
            runnerMap.set(String(r._id), r);
        }

        // Pre-load finish checkpoint names for auto-promote check
        let finishNames: string[] = ['FINISH'];
        try {
            const CheckpointModel = this.runnerModel.db.model('Checkpoint');
            const finishCps = await CheckpointModel.find({ type: 'finish' }).select('name').lean().exec();
            if (finishCps.length > 0) {
                finishNames = finishCps.map((cp: any) => (cp.name || '').toUpperCase());
            }
        } catch { /* fallback to ['FINISH'] */ }

        // Check which runners have finish timing (for auto-promote from in_progress
        // AND to push latestCheckpoint forward when manually marking 'finished').
        const TimingModel = this.runnerModel.db.model('TimingRecord');
        const runnersNeedingFinishCheck = updates.filter(u => u.status === 'in_progress' || u.status === 'finished');
        const finishBibs = new Set<string>();
        const finishTimingByBib = new Map<string, any>();
        if (runnersNeedingFinishCheck.length > 0) {
            const bibs = runnersNeedingFinishCheck
                .map(u => runnerMap.get(u.id)?.bib)
                .filter(Boolean);
            const eventIds = [...new Set(runnersNeedingFinishCheck
                .map(u => runnerMap.get(u.id)?.eventId)
                .filter(Boolean)
                .map((id: any) => new Types.ObjectId(String(id))))];
            if (bibs.length > 0 && eventIds.length > 0) {
                const finishTimings = await TimingModel.find({
                    eventId: { $in: eventIds },
                    bib: { $in: bibs },
                    checkpoint: { $regex: new RegExp(`^(${finishNames.join('|')})$`, 'i') },
                }).select('bib checkpoint scanTime order').sort({ order: -1 }).lean().exec();
                for (const ft of finishTimings) {
                    const bib = String((ft as any).bib);
                    finishBibs.add(bib);
                    if (!finishTimingByBib.has(bib)) finishTimingByBib.set(bib, ft);
                }
            }
        }

        const bulkOps: any[] = [];
        for (const u of updates) {
            if (!validStatuses.includes(u.status)) {
                result.errors.push(`Invalid status "${u.status}" for runner ${u.id}`);
                continue;
            }

            const runner = runnerMap.get(u.id);
            if (!runner) {
                result.errors.push(`Runner not found: ${u.id}`);
                continue;
            }

            const curStatus = ((runner.status || '') as string).toLowerCase();
            const isManualStop = ['dnf', 'dns', 'dq'].includes(u.status);
            const isRevertFromStopped = u.status === 'in_progress' && ['dnf', 'dns', 'dq'].includes(curStatus);

            // Auto-promote to finished if runner has FINISH timing
            let targetStatus = u.status;
            if (u.status === 'in_progress' && runner.bib && finishBibs.has(String(runner.bib))) {
                targetStatus = 'finished';
            }

            const update: any = {
                status: targetStatus,
                statusChangedAt: new Date(),
                isManualStatus: isManualStop || isRevertFromStopped,
            };
            if (isManualStop) {
                if (u.statusCheckpoint !== undefined) update.statusCheckpoint = u.statusCheckpoint;
                if (u.statusNote !== undefined) update.statusNote = u.statusNote;
            } else if (targetStatus === 'finished') {
                // Keep statusCheckpoint/statusNote if provided; admin uses them to
                // override stale RaceTiger splitDesc on the /event/[slug] STATUS column.
                if (u.statusCheckpoint !== undefined) update.statusCheckpoint = u.statusCheckpoint;
                if (u.statusNote !== undefined) update.statusNote = u.statusNote;
            } else {
                update.statusCheckpoint = '';
                update.statusNote = '';
            }
            if (u.changedBy) update.statusChangedBy = u.changedBy;

            // For runners being marked 'finished' (manually or auto-promoted),
            // align latestCheckpoint/splitDesc with the FINISH timing record so the
            // /event/[slug] STATUS column doesn't fall back to a stale 'CP4'.
            if (targetStatus === 'finished') {
                const ft = runner?.bib ? finishTimingByBib.get(String(runner.bib)) : null;
                const finishName = (u.statusCheckpoint && u.statusCheckpoint.trim())
                    || ft?.checkpoint
                    || 'FINISH';
                update.latestCheckpoint = finishName;
                update.splitDesc = finishName;
                if (ft?.order != null) update.splitNo = ft.order;
                if (ft?.scanTime) update.finishTime = ft.scanTime;
            }

            bulkOps.push({
                updateOne: {
                    filter: { _id: new Types.ObjectId(u.id) },
                    update: { $set: update },
                },
            });
        }

        if (bulkOps.length > 0) {
            const res = await this.runnerModel.bulkWrite(bulkOps, { ordered: false });
            result.updated = res.modifiedCount || 0;
        }

        return result;
    }

    /** Save photo (base64 data URI) to runner */
    async updatePhoto(runnerId: string, photoUrl: string): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(
            runnerId,
            { $set: { photoUrl } },
            { new: true },
        ).lean().exec() as Promise<RunnerDocument | null>;
    }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Runner, RunnerDocument } from './runner.schema';
import { CreateRunnerDto } from './dto/create-runner.dto';
import { Event, EventDocument } from '../events/event.schema';

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
    sortBy?: string; // bib, firstName, ageGroup, chipCode
    sortOrder?: string; // asc, desc
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
                if (r.phone) bioFields.phone = r.phone;
                if (r.birthDate) bioFields.birthDate = r.birthDate;
                if (r.idNo) bioFields.idNo = r.idNo;
                if (r.email) bioFields.email = r.email;
                if ((r as any).athleteId) bioFields.athleteId = (r as any).athleteId;
                if (r.sourceFile) bioFields.sourceFile = r.sourceFile;

                return {
                    updateOne: {
                        filter: { eventId: new Types.ObjectId(r.eventId), bib: r.bib },
                        update: {
                            $set: bioFields,
                            // status, timing, and rank fields only set on FIRST INSERT
                            // DNF/DNS/DQ statuses are NOT imported — managed manually by checkpoint staff
                            $setOnInsert: {
                                status: 'not_started',
                                isStarted: false,
                                isManualStatus: false,
                                netTime: 0,
                                elapsedTime: 0,
                                overallRank: 0,
                                genderRank: 0,
                                ageGroupRank: 0,
                                categoryRank: 0,
                            },
                        },
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
            bloodType: 1, chronicDiseases: 1, address: 1, sourceFile: 1,
            netTime: 1, gunTime: 1, netTimeStr: 1, gunTimeStr: 1,
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

    async update(id: string, updateData: any): Promise<RunnerDocument | null> {
        return this.runnerModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
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
            .sort({ netTime: 1 })
            .lean()
            .exec();

        if (runners.length === 0) return;

        // Build a map: runnerId -> { overallRank, genderRank, ageGroupRank }
        const rankMap = new Map<string, { overallRank: number; genderRank: number; ageGroupRank: number }>();

        // Overall ranking
        for (let i = 0; i < runners.length; i++) {
            rankMap.set(runners[i]._id.toString(), { overallRank: i + 1, genderRank: 0, ageGroupRank: 0 });
        }

        // Gender rankings
        for (const gender of ['M', 'F']) {
            const genderRunners = runners.filter(r => r.gender === gender);
            for (let i = 0; i < genderRunners.length; i++) {
                const entry = rankMap.get(genderRunners[i]._id.toString())!;
                entry.genderRank = i + 1;
            }
        }

        // Age group rankings
        const ageGroups = [...new Set(runners.map(r => r.ageGroup))];
        for (const ageGroup of ageGroups) {
            const ageGroupRunners = runners.filter(r => r.ageGroup === ageGroup);
            for (let i = 0; i < ageGroupRunners.length; i++) {
                const entry = rankMap.get(ageGroupRunners[i]._id.toString())!;
                entry.ageGroupRank = i + 1;
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
        if (!isManualStop) {
            update.statusCheckpoint = '';
            update.statusNote = '';
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

        // Check which runners have finish timing (for auto-promote from in_progress)
        const TimingModel = this.runnerModel.db.model('TimingRecord');
        const runnersNeedingFinishCheck = updates.filter(u => u.status === 'in_progress');
        const finishBibs = new Set<string>();
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
                }).select('bib').lean().exec();
                for (const ft of finishTimings) {
                    finishBibs.add(String((ft as any).bib));
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
            } else {
                update.statusCheckpoint = '';
                update.statusNote = '';
            }
            if (u.changedBy) update.statusChangedBy = u.changedBy;

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

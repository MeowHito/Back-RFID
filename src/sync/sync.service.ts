import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Campaign, CampaignDocument } from '../campaigns/campaign.schema';
import { Event, EventDocument } from '../events/event.schema';
import { CreateRunnerDto } from '../runners/dto/create-runner.dto';
import { RunnersService } from '../runners/runners.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { SyncLog, SyncLogDocument } from './sync-log.schema';

type RaceTigerRequestType = 'info' | 'bio' | 'split' | 'score';

interface EventResolver {
    eventIdByRaceTigerEventId: Map<number, string>;
    fallbackEventId: string | null;
    categoryByEventId: Map<string, string>; // local eventId → category name for runner.category
}

interface RaceTigerRequestResult {
    endpoint: string;
    requestParams: {
        pc: string;
        rid: string;
        page?: number;
        token: string;
    };
    response: Response;
    rawBody: string;
    parsedBody: any;
}

@Injectable()
export class SyncService {
    constructor(
        @InjectModel(SyncLog.name) private syncLogModel: Model<SyncLogDocument>,
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
        private readonly runnersService: RunnersService,
        private readonly checkpointsService: CheckpointsService,
        private readonly configService: ConfigService,
    ) { }

    private toCampaignObjectId(campaignId: string): Types.ObjectId {
        if (!Types.ObjectId.isValid(campaignId)) {
            throw new BadRequestException('Invalid campaign id');
        }
        return new Types.ObjectId(campaignId);
    }

    private maskToken(token: string): string {
        if (!token) return '';
        if (token.length <= 8) return '********';
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    }

    private getRaceTigerBaseUrl(): string {
        return this.configService.get<string>('RACE_TIGER_BASE_URL') || 'https://rqs.racetigertiming.com';
    }

    private getRaceTigerPath(type: RaceTigerRequestType): string {
        if (type === 'info') return this.configService.get<string>('RACE_TIGER_INFO_PATH') || '/Dif/info';
        if (type === 'bio') return this.configService.get<string>('RACE_TIGER_BIO_PATH') || '/Dif/bio';
        if (type === 'score') return this.configService.get<string>('RACE_TIGER_SCORE_PATH') || '/Dif/score';
        return this.configService.get<string>('RACE_TIGER_SPLIT_PATH') || '/Dif/splitScore';
    }

    private getPayloadSample(parsedBody: any): any {
        const rows = this.extractRowsFromPayload(parsedBody);
        if (rows.length) {
            return rows.slice(0, 3);
        }

        const data = parsedBody?.data;
        if (data && typeof data === 'object') {
            const entries = Object.entries(data).slice(0, 12);
            return Object.fromEntries(entries);
        }
        return parsedBody;
    }

    private extractRowsFromPayload(parsedBody: any): any[] {
        if (!parsedBody || typeof parsedBody !== 'object') {
            return [];
        }

        const queue: any[] = [parsedBody];
        const visited = new Set<any>();
        const preferredKeys = new Set([
            'data',
            'rows',
            'list',
            'items',
            'result',
            'records',
            'eventlist',
            'participantlist',
        ]);

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || typeof current !== 'object' || visited.has(current)) {
                continue;
            }
            visited.add(current);

            if (Array.isArray(current)) {
                return current;
            }

            const entries = Object.entries(current as Record<string, any>);

            for (const [key, value] of entries) {
                if (!Array.isArray(value)) {
                    continue;
                }

                const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
                if (preferredKeys.has(normalizedKey)) {
                    return value;
                }
            }

            for (const [, value] of entries) {
                if (Array.isArray(value)) {
                    return value;
                }
            }

            for (const [, value] of entries) {
                if (value && typeof value === 'object') {
                    queue.push(value);
                }
            }
        }

        return [];
    }

    private findRowValueByNormalizedKeys(row: any, normalizedKeys: string[]): unknown {
        if (!row || typeof row !== 'object') {
            return undefined;
        }

        const targets = new Set(normalizedKeys);
        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (targets.has(normalizedKey)) {
                return value;
            }
        }

        return undefined;
    }

    private resolveRaceTigerEventIdFromInfoRow(row: any): number | null {
        const direct = this.parseNumericValue(
            row?.EventId
            ?? row?.eventId
            ?? row?.eventid
            ?? row?.EventNo
            ?? row?.eventNo
            ?? row?.eventno
            ?? row?.ProjectNo
            ?? row?.projectNo
            ?? row?.projectno
            ?? row?.RaceNo
            ?? row?.raceNo
            ?? row?.raceno,
        );
        if (direct !== null) {
            return direct;
        }

        const fallback = this.findRowValueByNormalizedKeys(row, [
            'eventid',
            'eventno',
            'projectno',
            'projectnumber',
            'raceno',
        ]);
        return this.parseNumericValue(fallback);
    }

    private parseNumericValue(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }

    private resolveRaceTigerEventIdFromTimingPoint(tp: any): number | null {
        const direct = this.parseNumericValue(
            tp?.EventId
            ?? tp?.eventId
            ?? tp?.eventid
            ?? tp?.EventNo
            ?? tp?.eventNo
            ?? tp?.eventno
            ?? tp?.ProjectNo
            ?? tp?.projectNo
            ?? tp?.projectno
            ?? tp?.RaceNo
            ?? tp?.raceNo
            ?? tp?.raceno,
        );
        if (direct !== null) {
            return direct;
        }

        const fallback = this.findRowValueByNormalizedKeys(tp, [
            'eventid',
            'eventno',
            'projectno',
            'projectnumber',
            'raceno',
        ]);
        return this.parseNumericValue(fallback);
    }

    private normalizeComparableText(value: unknown): string {
        return this.toSafeString(value)
            .toLowerCase()
            .replace(/[^a-z0-9ก-๙]+/g, '');
    }

    private parseDistanceValue(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        const raw = this.toSafeString(value).replace(/,/g, '');
        if (!raw) {
            return null;
        }

        const match = raw.match(/-?\d+(?:\.\d+)?/);
        if (!match) {
            return null;
        }

        const parsed = Number(match[0]);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private resolveRaceTigerEventIdFromCategory(
        event: any,
        categories: any[],
        eventIndex: number,
    ): number | null {
        if (!categories.length) {
            return null;
        }

        const eventCategoryKey = this.normalizeComparableText(event?.category ?? event?.name);
        if (eventCategoryKey) {
            for (const category of categories) {
                const candidate = this.parseNumericValue(category?.remoteEventNo);
                if (candidate === null) {
                    continue;
                }

                const categoryKey = this.normalizeComparableText(category?.name);
                if (!categoryKey) {
                    continue;
                }

                if (categoryKey === eventCategoryKey || eventCategoryKey.includes(categoryKey) || categoryKey.includes(eventCategoryKey)) {
                    return candidate;
                }
            }
        }

        const eventDistance = this.parseDistanceValue(event?.distance);
        if (eventDistance !== null) {
            for (const category of categories) {
                const candidate = this.parseNumericValue(category?.remoteEventNo);
                const categoryDistance = this.parseDistanceValue(category?.distance);
                if (candidate === null || categoryDistance === null) {
                    continue;
                }

                if (Math.abs(categoryDistance - eventDistance) < 0.001) {
                    return candidate;
                }
            }
        }

        const indexedCategory = categories[eventIndex];
        return this.parseNumericValue(indexedCategory?.remoteEventNo);
    }

    private classifyTimingPointType(
        name: string,
        sortOrder: number | null,
    ): 'start' | 'checkpoint' | 'finish' {
        const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (normalized === 'start' || normalized === 'startline' || sortOrder === 1) {
            return 'start';
        }
        if (normalized === 'finish' || normalized === 'finishline' || normalized === 'end' || sortOrder === 9999) {
            return 'finish';
        }
        return 'checkpoint';
    }

    /**
     * Extract TimingPoints from the Info response's Events array.
     * Each event row may contain a "TimingPoints" array with TpName/SortOrder/Km.
     * Returns timing points PER event (by RaceTiger event ID) with km distance.
     */
    private extractTimingPointsPerEventFromInfoRows(
        eventRows: any[],
    ): Map<string, Array<{ name: string; type: 'start' | 'checkpoint' | 'finish'; orderNum: number; km: number | undefined }>> {
        const result = new Map<string, Array<{ name: string; type: 'start' | 'checkpoint' | 'finish'; orderNum: number; km: number | undefined }>>();
        const seenByEvent = new Map<string, Map<string, { name: string; sortOrder: number; km: number | null }>>();

        for (const row of eventRows) {
            const rowEventId = this.resolveRaceTigerEventIdFromInfoRow(row);

            const timingPoints = row?.TimingPoints ?? row?.timingPoints ?? row?.timingpoints;
            if (!Array.isArray(timingPoints)) continue;

            for (const tp of timingPoints) {
                const tpName = this.toSafeString(tp?.TpName ?? tp?.tpName ?? tp?.Name ?? tp?.name);
                if (!tpName) continue;

                const tpEventId = this.resolveRaceTigerEventIdFromTimingPoint(tp) ?? rowEventId;
                if (tpEventId === null) continue;

                const sortOrder = this.parseNumericValue(tp?.SortOrder ?? tp?.sortOrder) ?? 500;
                const tpKm = this.parseDistanceValue(tp?.Km ?? tp?.km ?? tp?.Distance ?? tp?.distance ?? tp?.TpKm ?? tp?.tpKm) ?? null;

                const eventKey = String(tpEventId);
                if (!seenByEvent.has(eventKey)) {
                    seenByEvent.set(eventKey, new Map());
                }

                const byName = seenByEvent.get(eventKey)!;
                const comparableName = this.normalizeComparableText(tpName);
                const prev = byName.get(comparableName);
                if (!prev || sortOrder < prev.sortOrder) {
                    byName.set(comparableName, {
                        name: tpName,
                        sortOrder,
                        km: tpKm ?? prev?.km ?? null,
                    });
                } else if (prev.km === null && tpKm !== null) {
                    prev.km = tpKm;
                    byName.set(comparableName, prev);
                }
            }
        }

        for (const [eventKey, byName] of seenByEvent.entries()) {
            const points = [...byName.values()]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((tp, idx) => ({
                    name: tp.name,
                    type: this.classifyTimingPointType(tp.name, tp.sortOrder),
                    orderNum: idx + 1,
                    km: tp.km ?? undefined,
                }));
            if (points.length > 0) {
                result.set(eventKey, points);
            }
        }

        return result;
    }

    /**
     * Extract TimingPoints from the Info response's Events array.
     * Each event row may contain a "TimingPoints" array with TpName/SortOrder.
     * We merge all timing points across events into a deduplicated, sorted list.
     */
    private extractTimingPointsFromInfoRows(
        eventRows: any[],
    ): Array<{ name: string; type: 'start' | 'checkpoint' | 'finish'; orderNum: number }> {
        const seen = new Map<string, { sortOrder: number; name: string }>();

        for (const row of eventRows) {
            const timingPoints = row?.TimingPoints ?? row?.timingPoints ?? row?.timingpoints;
            if (!Array.isArray(timingPoints)) {
                continue;
            }
            for (const tp of timingPoints) {
                const tpName = this.toSafeString(tp?.TpName ?? tp?.tpName ?? tp?.Name ?? tp?.name);
                if (!tpName) continue;
                const sortOrder = this.parseNumericValue(tp?.SortOrder ?? tp?.sortOrder) ?? 500;
                if (!seen.has(tpName) || sortOrder < (seen.get(tpName)!.sortOrder)) {
                    seen.set(tpName, { sortOrder, name: tpName });
                }
            }
        }

        if (seen.size === 0) {
            return [];
        }

        const sorted = [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        return sorted.map((tp, idx) => ({
            name: tp.name,
            type: this.classifyTimingPointType(tp.name, tp.sortOrder),
            orderNum: idx + 1,
        }));
    }

    /**
     * Extract checkpoint/timing-point names from splitScore rows.
     * The RaceTiger splitScore response uses "TpName" for the checkpoint name.
     */
    private extractTimingPointsFromSplitRows(
        splitRows: any[],
    ): Array<{ name: string; type: 'start' | 'checkpoint' | 'finish'; orderNum: number }> {
        const seen = new Map<string, { sortOrder: number; name: string }>();

        for (const row of splitRows) {
            const cpName = this.toSafeString(
                row?.TpName ?? row?.tpName ?? row?.tpname
                ?? row?.CheckPoint ?? row?.Checkpoint ?? row?.checkpoint
                ?? row?.CheckpointName ?? row?.checkpointName
                ?? row?.CPName ?? row?.cpName
                ?? row?.StationName ?? row?.stationName
                ?? this.findRowValueByNormalizedKeys(row, [
                    'tpname', 'checkpoint', 'checkpointname', 'cpname', 'stationname', 'station',
                ]),
            );
            if (!cpName) continue;

            const sortOrder = this.parseNumericValue(row?.SortOrder ?? row?.sortOrder) ?? 500;
            if (!seen.has(cpName) || sortOrder < (seen.get(cpName)!.sortOrder)) {
                seen.set(cpName, { sortOrder, name: cpName });
            }
        }

        if (seen.size === 0) {
            return [];
        }

        const sorted = [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder);
        return sorted.map((tp, idx) => ({
            name: tp.name,
            type: this.classifyTimingPointType(tp.name, tp.sortOrder),
            orderNum: idx + 1,
        }));
    }

    private resolveRaceTigerEventIdFromBioRow(row: any): number | null {
        const direct = this.parseNumericValue(
            row?.EventId
            ?? row?.eventId
            ?? row?.eventid
            ?? row?.EventNo
            ?? row?.eventNo
            ?? row?.eventno
            ?? row?.ProjectNo
            ?? row?.projectNo
            ?? row?.projectno
            ?? row?.RaceNo
            ?? row?.raceNo
            ?? row?.raceno,
        );
        if (direct !== null) {
            return direct;
        }

        if (!row || typeof row !== 'object') {
            return null;
        }

        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (
                normalizedKey === 'eventid'
                || normalizedKey === 'eventno'
                || normalizedKey === 'projectno'
                || normalizedKey === 'projectnumber'
                || normalizedKey === 'raceno'
            ) {
                const parsed = this.parseNumericValue(value);
                if (parsed !== null) {
                    return parsed;
                }
            }
        }

        return null;
    }

    private toSafeString(value: unknown): string {
        if (typeof value === 'string') {
            return value.trim();
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }
        return '';
    }

    private normalizeRaceTigerTime(value: unknown): string {
        const raw = this.toSafeString(value);
        if (!raw) {
            return '';
        }

        const directTimeMatch = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (directTimeMatch) {
            const hh = directTimeMatch[1].padStart(2, '0');
            const mm = directTimeMatch[2];
            return `${hh}:${mm}`;
        }

        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            const hh = String(parsed.getHours()).padStart(2, '0');
            const mm = String(parsed.getMinutes()).padStart(2, '0');
            return `${hh}:${mm}`;
        }

        return raw;
    }

    private toDateFromTimeString(value: unknown): Date | undefined {
        const time = this.normalizeRaceTigerTime(value);
        const match = time.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) {
            return undefined;
        }

        const hh = Number(match[1]);
        const mm = Number(match[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            return undefined;
        }

        const date = new Date();
        date.setHours(hh, mm, 0, 0);
        return date;
    }

    private toOptionalDate(value: unknown): Date | undefined {
        const raw = this.toSafeString(value);
        if (!raw) {
            return undefined;
        }
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
            return undefined;
        }
        return parsed;
    }

    private normalizeGender(value: unknown): 'M' | 'F' {
        const normalized = this.toSafeString(value).toLowerCase();
        if (
            normalized === 'f'
            || normalized === 'female'
            || normalized === 'woman'
            || normalized === '2'
            || normalized === 'หญิง'
            || normalized === 'female(หญิง)'
        ) {
            return 'F';
        }
        return 'M';
    }

    private splitName(fullName: string): { firstName: string; lastName: string } {
        const cleaned = fullName.replace(/\s+/g, ' ').trim();
        if (!cleaned) {
            return { firstName: 'Unknown', lastName: 'Runner' };
        }

        const parts = cleaned.split(' ');
        if (parts.length === 1) {
            return { firstName: parts[0], lastName: '-' };
        }

        return {
            firstName: parts.slice(0, -1).join(' '),
            lastName: parts[parts.length - 1],
        };
    }

    private resolveEventIdFromBioRow(
        row: any,
        eventResolver: EventResolver,
        forcedEventId?: string | null,
    ): string | null {
        const raceTigerEventId = this.resolveRaceTigerEventIdFromBioRow(row);
        if (raceTigerEventId !== null && eventResolver.eventIdByRaceTigerEventId.has(raceTigerEventId)) {
            return eventResolver.eventIdByRaceTigerEventId.get(raceTigerEventId) || null;
        }

        if (forcedEventId) {
            return forcedEventId;
        }

        return eventResolver.fallbackEventId;
    }

    private mapBioRowToRunner(
        row: any,
        eventResolver: EventResolver,
        forcedEventId?: string | null,
    ): CreateRunnerDto | null {
        const eventId = this.resolveEventIdFromBioRow(row, eventResolver, forcedEventId);
        if (!eventId) {
            return null;
        }

        const bib = this.toSafeString(row?.BIB ?? row?.Bib ?? row?.bib ?? row?.AthleteId ?? row?.athleteId);
        if (!bib) {
            return null;
        }

        // Prefer explicit FirstName/LastName from BIO, fall back to splitting EnName/Name
        const explicitFirstName = this.toSafeString(row?.FirstName ?? row?.firstName);
        const explicitLastName = this.toSafeString(row?.LastName ?? row?.lastName);
        const englishName = this.toSafeString(row?.EnName ?? row?.enName);
        const localName = this.toSafeString(row?.Name ?? row?.name);
        const baseName = englishName || localName;
        const { firstName: splitFirst, lastName: splitLast } = this.splitName(baseName);
        const firstName = explicitFirstName || splitFirst;
        const lastName = explicitLastName || splitLast;
        const { firstName: firstNameTh, lastName: lastNameTh } = localName && localName !== baseName
            ? this.splitName(localName)
            : { firstName: '', lastName: '' };

        const parsedAge = this.parseDistanceValue(row?.Age ?? row?.age);
        const rawCategory = this.toSafeString(row?.Category ?? row?.category ?? row?.Category2 ?? row?.category2);
        // If RaceTiger sends category as a number (event ID) or empty, fall back to local event name
        const categoryIsUseless = !rawCategory || /^\d+$/.test(rawCategory);
        const category = categoryIsUseless
            ? (eventResolver.categoryByEventId.get(eventId) || rawCategory || 'General')
            : rawCategory;
        const chipCode = this.toSafeString(row?.ChipCode ?? row?.chipCode);
        const teamName = this.toSafeString(row?.TeamName ?? row?.teamName);
        const athleteId = this.toSafeString(
            row?.AthleteId ?? row?.athleteId ?? row?.athleteid ?? row?.ATHLETEID,
        );
        const idNo = this.toSafeString(
            row?.IDNo ?? row?.IdNo ?? row?.idNo ?? row?.IDNO
            ?? row?.CardId ?? row?.cardId ?? row?.CardID
            ?? this.findRowValueByNormalizedKeys(row, ['idno', 'cardid', 'cardno', 'identityno']),
        ) || undefined;
        const email = this.toSafeString(
            row?.Email ?? row?.email ?? row?.EMAIL
            ?? this.findRowValueByNormalizedKeys(row, ['email', 'mail']),
        ) || undefined;

        return {
            eventId,
            bib,
            firstName,
            lastName,
            firstNameTh: firstNameTh || undefined,
            lastNameTh: lastNameTh || undefined,
            gender: this.normalizeGender(row?.Gender ?? row?.gender),
            category,
            age: parsedAge ?? undefined,
            ageGroup: this.toSafeString(
                row?.Category2 ?? row?.category2 ?? row?.AgeGroup ?? row?.ageGroup,
            ) || undefined,
            team: teamName || undefined,
            teamName: teamName || undefined,
            chipCode: chipCode || undefined,
            rfidTag: chipCode || undefined,
            nationality: this.toSafeString(
                row?.CountryRegion ?? row?.countryRegion
                ?? row?.Country ?? row?.country
                ?? row?.Nation ?? row?.nation
                ?? row?.Nationality ?? row?.nationality
                ?? row?.Nat ?? row?.nat
                ?? row?.CountryCode ?? row?.countryCode
                ?? this.findRowValueByNormalizedKeys(row, ['country', 'nation', 'nationality', 'countryregion', 'countrycode', 'nat']),
            ) || undefined,
            phone: this.toSafeString(row?.Phone ?? row?.phone) || undefined,
            birthDate: this.toOptionalDate(row?.Birthday ?? row?.birthday),
            idNo,
            email,
            status: 'not_started',
            isStarted: false,
            allowRFIDSync: true,
            sourceFile: 'RaceTiger BIO sync',
            ...(athleteId ? { athleteId } : {}),
        };
    }

    private async buildEventResolver(campaignId: string): Promise<EventResolver> {
        const campaignQuery: any[] = [{ campaignId }];
        if (Types.ObjectId.isValid(campaignId)) {
            campaignQuery.push({ campaignId: this.toCampaignObjectId(campaignId) });
        }

        const [events, campaign] = await Promise.all([
            this.eventModel
                .find({ $or: campaignQuery })
                .select('_id rfidEventId category distance name')
                .lean()
                .exec(),
            this.campaignModel
                .findById(this.toCampaignObjectId(campaignId))
                .select('categories')
                .lean()
                .exec(),
        ]);

        if (!events.length) {
            throw new BadRequestException('Campaign has no events for runner mapping');
        }

        const categoryMappings = Array.isArray((campaign as any)?.categories)
            ? (campaign as any).categories
            : [];

        const eventIdByRaceTigerEventId = new Map<number, string>();
        events.forEach((event: any, index: number) => {
            const raceTigerEventId = this.parseNumericValue(event?.rfidEventId)
                ?? this.resolveRaceTigerEventIdFromCategory(event, categoryMappings, index);
            if (raceTigerEventId !== null) {
                eventIdByRaceTigerEventId.set(raceTigerEventId, String(event._id));
            }
        });

        const hasMappedEvents = eventIdByRaceTigerEventId.size > 0;
        const fallbackEventId = !hasMappedEvents
            ? String(events[0]._id)
            : (events.length === 1 ? String(events[0]._id) : null);

        // Build category name map: local eventId → category/name to use for runner.category
        const categoryByEventId = new Map<string, string>();
        events.forEach((event: any) => {
            const name = this.toSafeString(event?.category ?? event?.name);
            if (name) categoryByEventId.set(String(event._id), name);
        });

        return {
            eventIdByRaceTigerEventId,
            fallbackEventId,
            categoryByEventId,
        };
    }

    private async requestRaceTiger(
        campaign: CampaignDocument,
        type: RaceTigerRequestType,
        page: number,
        eid?: number,
    ): Promise<RaceTigerRequestResult> {
        const raceId = campaign.raceId.trim();
        const token = campaign.rfidToken.trim();
        const baseUrl = (campaign as any).raceTigerBaseUrl?.trim() || this.getRaceTigerBaseUrl();
        const path = this.getRaceTigerPath(type);
        const endpoint = `${baseUrl}${path}`;
        const partnerCode = (campaign as any).partnerCode?.trim() || this.configService.get<string>('RACE_TIGER_PARTNER_CODE') || '000001';
        const timeoutMs = Number(this.configService.get<string>('RACE_TIGER_TIMEOUT_MS') || 15000);

        const form = new URLSearchParams({
            pc: partnerCode,
            rid: raceId,
            token,
        });
        if (type !== 'info') {
            form.set('page', String(page));
        }
        if (eid !== undefined) {
            form.set('eid', String(eid));
        }

        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutHandle);
        }

        const rawBody = await response.text();
        let parsedBody: any = null;
        try {
            parsedBody = JSON.parse(rawBody);
        } catch {
            parsedBody = null;
        }

        return {
            endpoint,
            requestParams: {
                pc: partnerCode,
                rid: raceId,
                page: type === 'info' ? undefined : page,
                ...(eid !== undefined ? { eid } : {}),
                token: this.maskToken(token),
            },
            response,
            rawBody,
            parsedBody,
        };
    }

    private async getSyncEnabledCampaign(campaignId: string): Promise<CampaignDocument> {
        const campaign = await this.campaignModel.findById(this.toCampaignObjectId(campaignId)).exec();
        if (!campaign) {
            throw new NotFoundException('Campaign not found');
        }

        if (!campaign.allowRFIDSync) {
            throw new BadRequestException('RFID sync is disabled for this campaign');
        }

        if (!campaign.rfidToken?.trim() || !campaign.raceId?.trim()) {
            throw new BadRequestException('Missing rfidToken or raceId for this campaign');
        }

        return campaign;
    }

    async wasLastSyncError(campaignId: string): Promise<boolean> {
        const lastSync = await this.syncLogModel
            .findOne({ campaignId: this.toCampaignObjectId(campaignId) })
            .sort({ createdAt: -1 })
            .exec();
        return lastSync?.status === 'error';
    }

    async getAllCampaignSyncErrors(): Promise<any[]> {
        const errorLogs = await this.syncLogModel
            .aggregate([
                { $match: { status: 'error' } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$campaignId',
                        lastError: { $first: '$$ROOT' },
                    },
                },
                {
                    $lookup: {
                        from: 'campaigns',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'campaign',
                    },
                },
                { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
            ])
            .exec();

        return errorLogs.map(log => ({
            campaignId: log._id,
            campaignName: log.campaign?.name,
            error: log.lastError,
        }));
    }

    async getSyncData(campaignId: string): Promise<any> {
        const cid = this.toCampaignObjectId(campaignId);

        // Run all queries in parallel instead of sequential
        const [logs, totalRecords, successCount, errorCount] = await Promise.all([
            this.syncLogModel.find({ campaignId: cid }).sort({ createdAt: -1 }).limit(10).lean().exec(),
            this.syncLogModel.countDocuments({ campaignId: cid }).exec(),
            this.syncLogModel.countDocuments({ campaignId: cid, status: 'success' }).exec(),
            this.syncLogModel.countDocuments({ campaignId: cid, status: 'error' }).exec(),
        ]);

        return {
            recentLogs: logs,
            statistics: {
                total: totalRecords,
                success: successCount,
                error: errorCount,
            },
        };
    }

    async getLatestPayload(campaignId: string): Promise<any> {
        const latest = await this.syncLogModel
            .findOne({ campaignId: this.toCampaignObjectId(campaignId), 'errorDetails.preview': { $exists: true } })
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        if (!latest) return null;

        return {
            status: latest.status,
            message: latest.message,
            createdAt: (latest as any).createdAt,
            preview: latest.errorDetails?.preview,
        };
    }

    async previewRaceTigerData(
        campaignId: string,
        type: RaceTigerRequestType = 'info',
        page: number = 1,
    ): Promise<any> {
        if (!['info', 'bio', 'split', 'score'].includes(type)) {
            throw new BadRequestException('type must be one of: info, bio, split, score');
        }

        const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
        const startTime = new Date();

        const syncLog = await this.createSyncLog({
            campaignId,
            status: 'pending',
            message: `RaceTiger ${type} preview started`,
            startTime,
        });

        const previewRequest: Record<string, any> = { type, page: safePage };

        try {
            const campaign = await this.getSyncEnabledCampaign(campaignId);
            const raceTigerResult = await this.requestRaceTiger(campaign, type, safePage);
            const { endpoint, requestParams, response, rawBody, parsedBody } = raceTigerResult;

            previewRequest.endpoint = endpoint;
            previewRequest.requestParams = requestParams;

            const itemCount = this.extractRowsFromPayload(parsedBody).length;
            const preview = {
                fetchedAt: new Date().toISOString(),
                request: previewRequest,
                response: {
                    ok: response.ok,
                    httpStatus: response.status,
                    contentType: response.headers.get('content-type'),
                    bodySize: rawBody.length,
                    rawSnippet: rawBody.slice(0, 5000),
                    rawSnippetTruncated: rawBody.length > 5000,
                    itemCount,
                    payloadSample: this.getPayloadSample(parsedBody),
                },
            };

            if (!response.ok) {
                throw new BadGatewayException(`RaceTiger returned status ${response.status}`);
            }

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'success',
                message: `RaceTiger ${type} preview success`,
                recordsProcessed: itemCount,
                recordsFailed: 0,
                endTime: new Date(),
                errorDetails: { preview },
            });

            return preview;
        } catch (error: any) {
            const timeoutError = error?.name === 'AbortError';
            const errorMessage = timeoutError
                ? 'RaceTiger request timeout'
                : (error?.message || 'RaceTiger preview failed');

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'error',
                message: `RaceTiger ${type} preview failed: ${errorMessage}`,
                recordsProcessed: 0,
                recordsFailed: 1,
                endTime: new Date(),
                errorDetails: {
                    previewRequest,
                    error: {
                        message: errorMessage,
                        name: error?.name,
                    },
                },
            });

            if (
                error instanceof BadRequestException
                || error instanceof NotFoundException
                || error instanceof BadGatewayException
            ) {
                throw error;
            }

            throw new BadGatewayException(errorMessage);
        }
    }

    async importEventsFromRaceTiger(campaignId: string): Promise<any> {
        const campaign = await this.getSyncEnabledCampaign(campaignId);
        const { parsedBody, response } = await this.requestRaceTiger(campaign, 'info', 1);

        if (!response.ok) {
            throw new BadGatewayException(`RaceTiger INFO returned status ${response.status}`);
        }

        if (!parsedBody || typeof parsedBody !== 'object') {
            throw new BadGatewayException('RaceTiger INFO returned invalid JSON');
        }

        const rows = this.extractRowsFromPayload(parsedBody);

        if (!rows.length) {
            return { imported: 0, updated: 0, events: [], raw: parsedBody };
        }

        const campaignObjId = this.toCampaignObjectId(campaignId);
        const campaignDoc = await this.campaignModel.findById(campaignObjId).select('eventDate location name').lean().exec();
        const fallbackDate = (campaignDoc as any)?.eventDate ?? new Date();
        const fallbackLocation = (campaignDoc as any)?.location ?? '';

        let imported = 0;
        let updated = 0;
        const events: any[] = [];
        const distanceStrByRaceTigerId = new Map<string, string>();
        const startTimeByRaceTigerId = new Map<string, string>();

        for (const row of rows) {
            const raceTigerEventId = this.resolveRaceTigerEventIdFromInfoRow(row);

            const nameFromNormalizedKey = this.findRowValueByNormalizedKeys(row, [
                'eventname',
                'name',
                'projectname',
                'racename',
            ]);

            const name = this.toSafeString(
                row?.EventName
                ?? row?.eventName
                ?? row?.Name
                ?? row?.name
                ?? row?.ProjectName
                ?? row?.projectName
                ?? nameFromNormalizedKey,
            ) || (raceTigerEventId !== null ? `Event ${raceTigerEventId}` : 'Unnamed Event');

            const distanceFromNormalizedKey = this.findRowValueByNormalizedKeys(row, [
                'distance',
                'km',
                'kilometer',
                'kilometers',
            ]);

            const distanceRaw = this.toSafeString(
                row?.Distance ?? row?.distance ?? row?.Km ?? row?.km ?? distanceFromNormalizedKey,
            );
            const distance = this.parseDistanceValue(distanceRaw) ?? undefined;
            const distanceForCat = distance !== undefined ? `${distance} KM` : (distanceRaw || '');
            if (raceTigerEventId !== null) distanceStrByRaceTigerId.set(String(raceTigerEventId), distanceForCat);

            const waveTimeRaw = this.normalizeRaceTigerTime(
                row?.WaveTime ?? row?.waveTime ?? row?.wavetime
                ?? row?.GunTime ?? row?.gunTime ?? row?.guntime
                ?? row?.StartTime ?? row?.startTime ?? row?.starttime
                ?? this.findRowValueByNormalizedKeys(row, ['wavetime', 'guntime', 'starttime', 'wavestart']),
            );
            if (waveTimeRaw && raceTigerEventId !== null) startTimeByRaceTigerId.set(String(raceTigerEventId), waveTimeRaw);

            const dateFromNormalizedKey = this.findRowValueByNormalizedKeys(row, [
                'eventdate',
                'date',
                'racedate',
                'startdate',
            ]);

            const dateRaw = this.toSafeString(row?.EventDate ?? row?.eventDate ?? row?.Date ?? row?.date ?? dateFromNormalizedKey);
            const date = dateRaw ? (new Date(dateRaw).getTime() ? new Date(dateRaw) : fallbackDate) : fallbackDate;

            const existing = raceTigerEventId !== null
                ? await this.eventModel.findOne({ campaignId: campaignObjId, rfidEventId: raceTigerEventId }).exec()
                : null;

            if (existing) {
                await this.eventModel.findByIdAndUpdate(existing._id, {
                    name,
                    ...(distance !== undefined ? { distance } : {}),
                    date,
                }).exec();
                updated += 1;
                events.push({ action: 'updated', id: String(existing._id), name, rfidEventId: raceTigerEventId });
            } else {
                const { v4: uuidv4 } = await import('uuid');
                const created = await this.eventModel.create({
                    uuid: uuidv4(),
                    shareToken: uuidv4(),
                    campaignId: campaignObjId,
                    name,
                    date,
                    location: fallbackLocation,
                    status: 'upcoming',
                    ...(raceTigerEventId !== null ? { rfidEventId: raceTigerEventId } : {}),
                    ...(distance !== undefined ? { distance } : {}),
                });
                imported += 1;
                events.push({ action: 'created', id: String(created._id), name, rfidEventId: raceTigerEventId });
            }
        }

        // Upsert campaign.categories from imported RaceTiger events
        const campaignForCats = await this.campaignModel.findById(campaignObjId).exec();
        if (campaignForCats) {
            const existingCategories: any[] = [...((campaignForCats as any).categories || [])];
            let categoriesChanged = false;
            for (const ev of events) {
                const remoteNo = ev.rfidEventId !== null ? String(ev.rfidEventId) : '';
                const distStr = distanceStrByRaceTigerId.get(remoteNo) || '';
                const matchIdx = existingCategories.findIndex(
                    (c: any) => remoteNo && String(c.remoteEventNo) === remoteNo,
                );
                const startTimeStr = startTimeByRaceTigerId.get(remoteNo) || '';
                if (matchIdx >= 0) {
                    if (ev.name) existingCategories[matchIdx].name = ev.name;
                    if (distStr) existingCategories[matchIdx].distance = distStr;
                    if (startTimeStr) existingCategories[matchIdx].startTime = startTimeStr;
                    categoriesChanged = true;
                } else if (remoteNo) {
                    existingCategories.push({
                        name: ev.name || 'Unnamed',
                        distance: distStr || '0 KM',
                        startTime: startTimeStr || '06:00',
                        cutoff: '-',
                        badgeColor: '#dc2626',
                        status: 'live',
                        remoteEventNo: remoteNo,
                    });
                    categoriesChanged = true;
                }
            }
            if (categoriesChanged) {
                await this.campaignModel.findByIdAndUpdate(campaignObjId, { categories: existingCategories }).exec();
            }
        }

        const syncResult: any = { imported, updated, events, runners: { inserted: 0, updated: 0, skipped: 0 }, checkpoints: { created: 0 } };

        if (events.length > 0) {
            const eventResolver = await this.buildEventResolver(campaignId);
            const maxPages = Number(this.configService.get<string>('RACE_TIGER_MAX_BIO_PAGES') || 200);
            let bioInserted = 0;
            let bioUpdated = 0;
            let bioSkipped = 0;

            // Collect RaceTiger event IDs from imported events to fetch BIO per-event with eid
            const raceTigerEids = [...new Set(
                events
                    .map(ev => ev.rfidEventId)
                    .filter((eid): eid is number => eid !== null && eid !== undefined),
            )];

            const fetchBioForEid = async (eid: number | undefined) => {
                const forcedEventId = eid !== undefined
                    ? (eventResolver.eventIdByRaceTigerEventId.get(eid) || null)
                    : null;
                let totalExpected = Infinity;
                let totalFetched = 0;
                for (let page = 1; page <= maxPages; page++) {
                    const { response: bioRes, parsedBody: bioParsed } = await this.requestRaceTiger(campaign, 'bio', page, eid);
                    if (!bioRes.ok) break;
                    const bioRows = this.extractRowsFromPayload(bioParsed);
                    if (!bioRows.length) break;

                    // Use total from API response to determine expected item count
                    const apiTotal = this.parseNumericValue(bioParsed?.total);
                    if (apiTotal !== null && apiTotal > 0) totalExpected = apiTotal;
                    totalFetched += bioRows.length;

                    const mapped: CreateRunnerDto[] = [];
                    for (const row of bioRows) {
                        const runner = this.mapBioRowToRunner(row, eventResolver, forcedEventId);
                        if (runner) mapped.push(runner);
                        else bioSkipped++;
                    }

                    if (mapped.length) {
                        const pageResult = await this.runnersService.createMany(mapped, true);
                        bioInserted += pageResult.inserted || 0;
                        bioUpdated += pageResult.updated || 0;
                    }

                    // Stop if we've fetched all expected items
                    if (totalFetched >= totalExpected) break;
                }
            };

            if (raceTigerEids.length > 0) {
                for (const eid of raceTigerEids) {
                    await fetchBioForEid(eid);
                }
            } else {
                await fetchBioForEid(undefined);
            }

            syncResult.runners = { inserted: bioInserted, updated: bioUpdated, skipped: bioSkipped };

            // Extract TimingPoints PER EVENT from Info response (with km distances)
            const timingPointsPerEvent = this.extractTimingPointsPerEventFromInfoRows(rows);

            // Also extract merged timing points for checkpoint creation
            const timingPointDefs = this.extractTimingPointsFromInfoRows(rows);

            // Fallback: fetch checkpoint names from splitScore page 1
            let splitTimingPointDefs: Array<{ name: string; type: 'start' | 'checkpoint' | 'finish'; orderNum: number }> = [];
            if (timingPointDefs.length === 0) {
                try {
                    const { response: splitRes, parsedBody: splitParsed } = await this.requestRaceTiger(campaign, 'split', 1);
                    if (splitRes.ok && splitParsed) {
                        splitTimingPointDefs = this.extractTimingPointsFromSplitRows(
                            this.extractRowsFromPayload(splitParsed),
                        );
                    }
                } catch {
                    // splitScore unavailable — fall back to defaults
                }
            }

            const checkpointDefs = timingPointDefs.length > 0
                ? timingPointDefs
                : splitTimingPointDefs.length > 0
                    ? splitTimingPointDefs
                    : [
                        { name: 'START', type: 'start' as const, orderNum: 1 },
                        { name: 'FINISH', type: 'finish' as const, orderNum: 2 },
                    ];

            let checkpointsCreated = 0;
            const existingCps = await this.checkpointsService.findByCampaign(campaignId);
            if (existingCps.length === 0) {
                await this.checkpointsService.createMany(
                    checkpointDefs.map(cp => ({ ...cp, campaignId })),
                );
                checkpointsCreated += checkpointDefs.length;
            } else {
                // Update existing checkpoints if they only have defaults (START/FINISH)
                // and we now have more detailed timing points
                const existingNames = new Set(existingCps.map((cp: any) => cp.name));
                const onlyDefaults = existingCps.length <= 2
                    && existingNames.has('START')
                    && existingNames.has('FINISH')
                    && checkpointDefs.length > 2;
                if (onlyDefaults) {
                    await this.checkpointsService.deleteByCampaign(campaignId);
                    await this.checkpointsService.createMany(
                        checkpointDefs.map(cp => ({ ...cp, campaignId })),
                    );
                    checkpointsCreated += checkpointDefs.length;
                }
            }

            const cps = await this.checkpointsService.findByCampaign(campaignId);
            const cpIdByName = new Map(
                cps.map((cp: any) => [this.normalizeComparableText(cp.name), String(cp._id)]),
            );

            // Create mappings for ALL campaign events with per-event km distances
            const campaignQuery2: any[] = [{ campaignId }];
            if (Types.ObjectId.isValid(campaignId)) campaignQuery2.push({ campaignId: this.toCampaignObjectId(campaignId) });
            const allCampaignEvents = await this.eventModel.find({ $or: campaignQuery2 }).select('_id name category rfidEventId').lean().exec();

            for (const ev of allCampaignEvents) {
                const evId = String(ev._id);
                const rfidEid = ev.rfidEventId;
                const eventTimingPoints = rfidEid ? timingPointsPerEvent.get(String(rfidEid)) : undefined;

                // Build mapping docs with distanceFromStart from per-event timing points
                const mappingDocs: Array<{ checkpointId: string; eventId: string; orderNum: number; distanceFromStart?: number }> = [];

                if (eventTimingPoints && eventTimingPoints.length > 0) {
                    // Use per-event timing points with km distances
                    for (let idx = 0; idx < eventTimingPoints.length; idx++) {
                        const tp = eventTimingPoints[idx];
                        const cpId = cpIdByName.get(this.normalizeComparableText(tp.name));
                        if (!cpId) continue;
                        mappingDocs.push({
                            checkpointId: cpId,
                            eventId: evId,
                            orderNum: idx + 1,
                            distanceFromStart: tp.km,
                        });
                    }
                } else {
                    // Fallback: use global checkpoint list without distances
                    for (let idx = 0; idx < cps.length; idx++) {
                        mappingDocs.push({
                            checkpointId: String(cps[idx]._id),
                            eventId: evId,
                            orderNum: idx + 1,
                        });
                    }
                }

                // Replace existing rows so each event keeps only its own checkpoint mappings from RaceTiger
                await this.checkpointsService.deleteMappingsByEvent(evId);
                if (mappingDocs.length) {
                    await this.checkpointsService.updateMappings(mappingDocs);
                }

                // Update Event document with startTime if available
                const startTimeForEvent = rfidEid ? startTimeByRaceTigerId.get(String(rfidEid)) : undefined;
                if (startTimeForEvent) {
                    const startTimeDate = this.toDateFromTimeString(startTimeForEvent);
                    if (startTimeDate) {
                        await this.eventModel.findByIdAndUpdate(evId, { startTime: startTimeDate }).exec();
                    }
                }
            }

            // Auto-populate distanceMappings per checkpoint based on which events actually use it
            const cpEventMap = new Map<string, Set<string>>();
            for (const ev of allCampaignEvents) {
                const evName = this.toSafeString((ev as any).category || (ev as any).name);
                const rfidEid = (ev as any).rfidEventId;
                const eventTps = rfidEid ? timingPointsPerEvent.get(String(rfidEid)) : undefined;
                if (eventTps) {
                    // Only assign this event to the checkpoints it actually uses
                    for (const tp of eventTps) {
                        const cpId = cpIdByName.get(this.normalizeComparableText(tp.name));
                        if (cpId && evName) {
                            if (!cpEventMap.has(cpId)) cpEventMap.set(cpId, new Set());
                            cpEventMap.get(cpId)!.add(evName);
                        }
                    }
                } else if (evName) {
                    // Fallback: assign all checkpoints for events without timing points
                    for (const cp of cps) {
                        const cpId = String(cp._id);
                        if (!cpEventMap.has(cpId)) cpEventMap.set(cpId, new Set());
                        cpEventMap.get(cpId)!.add(evName);
                    }
                }
            }
            if (cpEventMap.size > 0) {
                await this.checkpointsService.updateMany(
                    [...cpEventMap.entries()].map(([cpId, names]) => ({
                        id: cpId, distanceMappings: [...names],
                    })),
                );
            }
            syncResult.checkpoints = { created: checkpointsCreated, names: cps.map((cp: any) => cp.name) };
        }

        return syncResult;
    }

    async syncAllRunners(campaignId: string): Promise<any> {
        const startTime = new Date();
        const syncLog = await this.createSyncLog({
            campaignId,
            status: 'pending',
            message: 'RaceTiger full runner sync started',
            startTime,
        });

        const maxPages = Number(this.configService.get<string>('RACE_TIGER_MAX_BIO_PAGES') || 200);

        try {
            const campaign = await this.getSyncEnabledCampaign(campaignId);
            const eventResolver = await this.buildEventResolver(campaignId);

            let pagesFetched = 0;
            let rowsFetched = 0;
            let rowsMapped = 0;
            let rowsSkipped = 0;
            let inserted = 0;
            let updated = 0;
            const processingErrors: string[] = [];

            // Get all rfidEventIds so we can fetch BIO per-event with eid
            const campaignEventsForSync = await this.eventModel
                .find({ $or: [{ campaignId }, { campaignId: this.toCampaignObjectId(campaignId) }] })
                .select('rfidEventId')
                .lean()
                .exec();
            const raceTigerEids = campaignEventsForSync
                .map((ev: any) => this.parseNumericValue(ev.rfidEventId))
                .filter((eid): eid is number => eid !== null);
            const uniqueRaceTigerEids = [...new Set(raceTigerEids)];

            const eidsToFetch: Array<number | undefined> = uniqueRaceTigerEids.length > 0
                ? uniqueRaceTigerEids
                : [undefined];

            for (const eid of eidsToFetch) {
                const forcedEventId = eid !== undefined
                    ? (eventResolver.eventIdByRaceTigerEventId.get(eid) || null)
                    : null;
                for (let page = 1; page <= maxPages; page += 1) {
                    const { response, parsedBody } = await this.requestRaceTiger(campaign, 'bio', page, eid);
                    if (!response.ok) {
                        throw new BadGatewayException(`RaceTiger BIO eid=${eid ?? 'all'} page ${page} returned status ${response.status}`);
                    }

                    if (parsedBody === null || typeof parsedBody !== 'object') {
                        throw new BadGatewayException(`RaceTiger BIO eid=${eid ?? 'all'} page ${page} returned invalid JSON`);
                    }

                    pagesFetched += 1;

                    const rows = this.extractRowsFromPayload(parsedBody);
                    if (!rows.length) {
                        break;
                    }

                    rowsFetched += rows.length;

                    const mapped: CreateRunnerDto[] = [];
                    for (const row of rows) {
                        const runner = this.mapBioRowToRunner(row, eventResolver, forcedEventId);
                        if (runner) {
                            mapped.push(runner);
                        } else {
                            rowsSkipped += 1;
                        }
                    }

                    rowsMapped += mapped.length;

                    if (!mapped.length) {
                        continue;
                    }

                    const pageResult = await this.runnersService.createMany(mapped, true);
                    inserted += pageResult.inserted || 0;
                    updated += pageResult.updated || 0;
                    if (Array.isArray(pageResult.errors) && pageResult.errors.length) {
                        processingErrors.push(...pageResult.errors.slice(0, 20 - processingErrors.length));
                    }
                }
            }

            if (rowsFetched > 0 && rowsMapped === 0) {
                throw new BadRequestException(
                    'Unable to map BIO rows to local events. Verify RaceTiger EventId/EventNo fields match local Event RFID Event ID or campaign category Remote Event No.',
                );
            }

            const result = {
                fetchedAt: new Date().toISOString(),
                summary: {
                    pagesFetched,
                    rowsFetched,
                    rowsMapped,
                    rowsSkipped,
                    inserted,
                    updated,
                    errors: processingErrors,
                },
            };

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'success',
                message: `RaceTiger full runner sync success (inserted ${inserted}, updated ${updated})`,
                recordsProcessed: rowsMapped,
                recordsFailed: rowsSkipped + processingErrors.length,
                endTime: new Date(),
                errorDetails: { fullSync: result },
            });

            return result;
        } catch (error: any) {
            const timeoutError = error?.name === 'AbortError';
            const errorMessage = timeoutError
                ? 'RaceTiger request timeout'
                : (error?.message || 'RaceTiger full sync failed');

            await this.updateSyncLog(syncLog._id.toString(), {
                status: 'error',
                message: `RaceTiger full runner sync failed: ${errorMessage}`,
                recordsProcessed: 0,
                recordsFailed: 1,
                endTime: new Date(),
                errorDetails: {
                    error: {
                        message: errorMessage,
                        name: error?.name,
                    },
                },
            });

            if (
                error instanceof BadRequestException
                || error instanceof NotFoundException
                || error instanceof BadGatewayException
            ) {
                throw error;
            }

            throw new BadGatewayException(errorMessage);
        }
    }

    async createSyncLog(data: {
        campaignId: string;
        status: 'success' | 'error' | 'pending';
        message?: string;
        recordsProcessed?: number;
        recordsFailed?: number;
        startTime?: Date;
        endTime?: Date;
        errorDetails?: Record<string, any>;
    }): Promise<SyncLogDocument> {
        const log = new this.syncLogModel({
            ...data,
            campaignId: this.toCampaignObjectId(data.campaignId),
        });
        return log.save();
    }

    async updateSyncLog(
        id: string,
        data: Partial<{
            status: string;
            message: string;
            recordsProcessed: number;
            recordsFailed: number;
            endTime: Date;
            errorDetails: Record<string, any>;
        }>,
    ): Promise<SyncLogDocument | null> {
        return this.syncLogModel.findByIdAndUpdate(id, data, { new: true }).exec();
    }
}

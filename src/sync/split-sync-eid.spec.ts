import { Types } from 'mongoose';

// CheckpointsService (pulled in through SyncService) imports uuid, which ships ESM-only.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { SyncService } from './sync.service';

/**
 * RaceTiger ignores `eid`: asking for distance 1, 2 or 3 returns the whole race every time.
 * The split sync looped over every distance anyway, so at SPONSOR RUN 2026 (3 distances) it
 * fetched and wrote every pass 3× per cycle — the live checkpoint lists only moved every
 * 1–2 min, and each runner's lapCount came out 3× too high (21 for 7 checkpoints).
 */

const CAMPAIGN = new Types.ObjectId().toHexString();
const EV = { 1: new Types.ObjectId().toHexString(), 2: new Types.ObjectId().toHexString(), 3: new Types.ObjectId().toHexString() } as Record<number, string>;

function makeService(opts: { filtersByEid: boolean; failFirstPage2?: boolean }) {
    const runners = [
        { _id: new Types.ObjectId(), eventId: EV[1], bib: '21654', athleteId: 'A1', status: 'in_progress' },
        { _id: new Types.ObjectId(), eventId: EV[2], bib: '10064', athleteId: 'A2', status: 'in_progress' },
        { _id: new Types.ObjectId(), eventId: EV[3], bib: '50001', athleteId: 'A3', status: 'in_progress' },
    ];
    const allRows = [
        { EventId: 1, AthleteId: 'A1', TpName: 'START', SortOrder: 1, PassTime: '2026-10-04 03:00:00' },
        { EventId: 1, AthleteId: 'A1', TpName: 'CP1', SortOrder: 2, PassTime: '2026-10-04 03:34:22' },
        { EventId: 2, AthleteId: 'A2', TpName: 'START', SortOrder: 1, PassTime: '2026-10-04 03:05:00' },
        { EventId: 3, AthleteId: 'A3', TpName: 'START', SortOrder: 1, PassTime: '2026-10-04 05:00:00' },
    ];
    const requests: Array<{ page: number; eid?: number }> = [];
    const bulkOps: any[] = [];
    const runnerOps: any[] = [];

    const service = Object.create(SyncService.prototype) as any;
    service.logger = { log: () => undefined, warn: () => undefined, debug: () => undefined, error: () => undefined };
    service.getSyncEnabledCampaign = async () => ({});
    service.buildEventResolver = async () => ({
        eventIdByRaceTigerEventId: new Map([[1, EV[1]], [2, EV[2]], [3, EV[3]]]),
        fallbackEventId: null,
    });
    const chain = (value: any) => ({ select: () => ({ lean: () => ({ exec: async () => value }) }) });
    service.eventModel = { find: () => chain([1, 2, 3].map(n => ({ _id: EV[n], rfidEventId: n }))) };
    service.timingRecordModel = {
        find: () => chain([]),
        bulkWrite: async (ops: any[]) => { bulkOps.push(...ops); },
    };
    service.runnersService = {
        findByEventIds: async () => runners,
        bulkUpdateTiming: async (ops: any[]) => { runnerOps.push(...ops); },
        autoDqFinishersWithoutStart: async () => 0,
    };
    service.checkpointsService = { findByCampaign: async () => [] };
    service.timingService = { recomputeRunnerAggregates: async () => undefined };
    // Two rows per page so the "whole race" answer spans two pages.
    service.requestRaceTiger = async (_c: any, _type: string, page: number, eid?: number) => {
        requests.push({ page, eid });
        if (opts.failFirstPage2 && eid === 1 && page === 2) throw new Error('timeout');
        const rows = opts.filtersByEid ? allRows.filter(r => r.EventId === eid) : allRows;
        return { response: { ok: true }, parsedBody: { total: rows.length, data: rows.slice((page - 1) * 2, page * 2) } };
    };
    service.extractRowsFromPayload = (body: any) => body.data;
    return { service, requests, bulkOps, runnerOps, runners };
}

describe('SyncService split sync — RaceTiger ignores eid', () => {
    it('fetches the race once when the first answer already holds every distance', async () => {
        const { service, requests, bulkOps } = makeService({ filtersByEid: false });
        const res = await service.syncSplitTimingRecords(CAMPAIGN, new Map());
        expect(res.errors).toEqual([]);
        expect(requests).toEqual([{ page: 1, eid: 1 }, { page: 2, eid: 1 }]);
        expect(bulkOps).toHaveLength(4);
    });

    it('counts each pass once in lapCount', async () => {
        const { service, runnerOps, runners } = makeService({ filtersByEid: false });
        await service.syncSplitTimingRecords(CAMPAIGN, new Map());
        const op = runnerOps.find(o => String(o.id) === String(runners[0]._id));
        expect(op?.data?.lapCount).toBe(2);
    });

    it('still asks for every distance when RaceTiger does filter by eid', async () => {
        const { service, requests, bulkOps } = makeService({ filtersByEid: true });
        await service.syncSplitTimingRecords(CAMPAIGN, new Map());
        expect(requests.map(r => r.eid)).toEqual([1, 2, 3]);
        expect(bulkOps).toHaveLength(4);
    });

    it('a half-finished answer does not stop the next distance from fetching', async () => {
        const { service, requests } = makeService({ filtersByEid: false, failFirstPage2: true });
        await service.syncSplitTimingRecords(CAMPAIGN, new Map());
        expect(requests.filter(r => r.eid === 2).length).toBeGreaterThan(0);
    });
});

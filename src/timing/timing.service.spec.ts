import { Types } from 'mongoose';

// CheckpointsService (pulled in through TimingService) imports uuid, which ships ESM-only.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { TimingService } from './timing.service';

/**
 * Live-scan side of the cut-off rule: a mat read that lands after the checkpoint's cut-off
 * must not turn the runner into a finisher, and must not quietly undo an earlier auto-DNF.
 */

const EVENT_ID = '69c152af0b9f6c7c5d676ccc';
const CAMPAIGN_ID = '69c152af0b9f6c7c5d676cbb';
const day = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00`);

const CHECKPOINTS = [
    { name: 'START', type: 'start', orderNum: 1, active: true },
    { name: 'A5', type: 'checkpoint', orderNum: 2, active: true },
    { name: 'A6', type: 'checkpoint', orderNum: 3, active: true, cutoffTimes: { '10K': '2026-09-06T09:00' } },
    { name: 'FINISH', type: 'finish', orderNum: 4, active: true, cutoffTimes: { '10K': '2026-09-06T11:00' } },
];

function buildService(runner: any, records: any[] = []) {
    const timingModel: any = function (doc: any) { Object.assign(this, doc); this.save = async () => this; };
    timingModel.find = () => ({ sort: () => ({ lean: () => ({ exec: async () => records }) }) });
    timingModel.bulkWrite = jest.fn(async () => undefined);
    const runnersService: any = {
        findByBib: async () => runner,
        findOne: async () => runner,
        update: jest.fn(async () => runner),
        setAggregates: jest.fn(async () => undefined),
        updateRankings: jest.fn(async () => undefined),
    };
    const timingGateway: any = { broadcastRunnerUpdate: jest.fn() };
    const eventsService: any = { findOne: async () => ({ campaignId: CAMPAIGN_ID }) };
    const checkpointsService: any = { findByCampaign: async () => CHECKPOINTS };

    const service = new TimingService(timingModel, runnersService, timingGateway, eventsService, checkpointsService);
    jest.spyOn(service, 'getRunnerRecords').mockResolvedValue([] as any);
    jest.spyOn(service, 'recomputeRunnerAggregates').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'scheduleRankingUpdate').mockImplementation(() => undefined);
    return { service, runnersService };
}

const runnerDoc = (over: any = {}) => ({
    _id: new Types.ObjectId(),
    bib: '1145',
    category: '10K',
    status: 'in_progress',
    startTime: day('06:00'),
    ...over,
});

describe('TimingService.processScan — cut-off', () => {
    it('DNFs a FINISH scan that lands after the cut-off instead of finishing the runner', async () => {
        const runner = runnerDoc();
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'FINISH', scanTime: day('12:39'),
        });

        const [, update] = runnersService.update.mock.calls[0];
        expect(update.status).toBe('dnf');
        expect(update.statusCheckpoint).toBe('FINISH');
        // The time is still recorded — staff need to see when they came in.
        expect(update.finishTime).toEqual(day('12:39'));
    });

    it('finishes a FINISH scan that lands before the cut-off', async () => {
        const runner = runnerDoc();
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'FINISH', scanTime: day('10:30'),
        });

        expect(runnersService.update.mock.calls[0][1].status).toBe('finished');
    });

    it('keeps a cut-off DNF when a later scan cannot clear that cut-off', async () => {
        const runner = runnerDoc({
            status: 'dnf', statusChangedBy: 'cutoff-scheduler', statusCheckpoint: 'FINISH',
        });
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'FINISH', scanTime: day('12:45'),
        });

        expect(runnersService.update.mock.calls[0][1].status).toBe('dnf');
    });

    it('reinstates a cut-off DNF when the crossing turns out to have been in time', async () => {
        // Same runner, but the mat read that finally reaches us is stamped before the cut-off.
        const runner = runnerDoc({
            status: 'dnf', statusChangedBy: 'cutoff-scheduler', statusCheckpoint: 'FINISH',
        });
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'FINISH', scanTime: day('10:45'),
        });

        expect(runnersService.update.mock.calls[0][1].status).toBe('finished');
    });

    it('leaves a checkpoint without a cut-off behaving as before', async () => {
        const runner = runnerDoc({ status: 'not_started' });
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'A5', scanTime: day('12:13'),
        });

        expect(runnersService.update.mock.calls[0][1].status).toBe('in_progress');
    });

    it('does not touch a status staff set by hand', async () => {
        const runner = runnerDoc({ status: 'dnf', isManualStatus: true });
        const { service, runnersService } = buildService(runner);

        await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'FINISH', scanTime: day('12:39'),
        });

        expect(runnersService.update.mock.calls[0][1].status).toBeUndefined();
    });
});

describe('TimingService.recomputeRunnerAggregates — cut-off', () => {
    // This is the write that actually stamps 'finished' after a scan or a staff time edit,
    // so the cut-off has to hold here too or it would immediately undo itself.
    const RUNNER_ID = new Types.ObjectId().toHexString();
    const recordsFor = (finishAt: Date) => [
        { _id: 'r1', checkpoint: 'START', scanTime: day('06:00'), order: 1 },
        { _id: 'r2', checkpoint: 'FINISH', scanTime: finishAt, order: 2 },
    ];

    it('writes DNF for a finish stamped after the cut-off', async () => {
        const runner = runnerDoc({ _id: RUNNER_ID });
        const { service, runnersService } = buildService(runner, recordsFor(day('12:39')));
        jest.restoreAllMocks();

        await service.recomputeRunnerAggregates(EVENT_ID, RUNNER_ID);

        const [, update] = runnersService.setAggregates.mock.calls[0];
        expect(update.status).toBe('dnf');
        expect(update.finishTime).toEqual(day('12:39'));
    });

    it('writes finished for a finish stamped before the cut-off', async () => {
        const runner = runnerDoc({ _id: RUNNER_ID });
        const { service, runnersService } = buildService(runner, recordsFor(day('10:30')));
        jest.restoreAllMocks();

        await service.recomputeRunnerAggregates(EVENT_ID, RUNNER_ID);

        expect(runnersService.setAggregates.mock.calls[0][1].status).toBe('finished');
    });

    it('leaves a staff-set DNF alone even though a FINISH record exists', async () => {
        const runner = runnerDoc({ _id: RUNNER_ID, status: 'dnf', isManualStatus: true });
        const { service, runnersService } = buildService(runner, recordsFor(day('10:30')));
        jest.restoreAllMocks();

        await service.recomputeRunnerAggregates(EVENT_ID, RUNNER_ID);

        expect(runnersService.setAggregates.mock.calls[0][1].status).toBeUndefined();
    });

    it('keeps a cut-off DNF from an earlier checkpoint even when the finish itself was in time', async () => {
        // Cut at A6 (closed 09:00, crossed 10:00). Reaching the line by 11:00 doesn't undo that.
        const runner = runnerDoc({
            _id: RUNNER_ID, status: 'dnf', statusChangedBy: 'cutoff-scheduler', statusCheckpoint: 'A6',
        });
        const { service, runnersService } = buildService(runner, [
            { _id: 'r1', checkpoint: 'START', scanTime: day('06:00'), order: 1 },
            { _id: 'r2', checkpoint: 'A6', scanTime: day('10:00'), order: 2 },
            { _id: 'r3', checkpoint: 'FINISH', scanTime: day('10:30'), order: 3 },
        ]);
        jest.restoreAllMocks();

        await service.recomputeRunnerAggregates(EVENT_ID, RUNNER_ID);

        expect(runnersService.setAggregates.mock.calls[0][1].status).toBeUndefined();
    });
});

/**
 * A hand-entered checkpoint has no RaceTiger gun/net time of its own, and it becomes the
 * runner's newest record — which is where the public table reads those clocks from. The
 * scan stamps them itself, anchored on the newest record that does carry them.
 */
describe('TimingService.processScan — gun/net time on the new record', () => {
    it('stamps gun time measured from the gun and net time measured from the runner start', async () => {
        const runner = runnerDoc(); // startTime 06:00
        const { service } = buildService(runner);
        // Gun went off at 05:55: A5 was crossed at 07:00 on a 01:05:00 gun clock.
        jest.spyOn(service, 'getRunnerRecords').mockResolvedValue([
            { checkpoint: 'A5', scanTime: day('07:00'), order: 1, gunTime: 65 * 60_000, netTime: 60 * 60_000 },
        ] as any);

        const record: any = await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'A6', scanTime: day('08:00'), isManual: true,
        } as any);

        expect(record.gunTime).toBe(125 * 60_000); // 08:00 − 05:55
        expect(record.netTime).toBe(120 * 60_000); // 08:00 − 06:00 (typed START owns the net clock)
        expect(record.isManualTime).toBe(true);
    });

    it('leaves gun time off when no earlier record carries one', async () => {
        const runner = runnerDoc();
        const { service } = buildService(runner);

        const record: any = await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'A5', scanTime: day('07:30'),
        });

        expect(record.gunTime).toBeUndefined();
        expect(record.netTime).toBe(90 * 60_000);
    });

    it('falls back to the net-time anchor when the runner has no start time', async () => {
        const runner = runnerDoc({ startTime: undefined });
        const { service } = buildService(runner);
        jest.spyOn(service, 'getRunnerRecords').mockResolvedValue([
            { checkpoint: 'A5', scanTime: day('07:00'), order: 1, netTime: 60 * 60_000 },
        ] as any);

        const record: any = await service.processScan({
            eventId: EVENT_ID, bib: '1145', checkpoint: 'A6', scanTime: day('08:00'),
        });

        expect(record.netTime).toBe(120 * 60_000); // 08:00 − 06:00 (anchor 07:00 − 01:00:00)
    });
});

/**
 * BIB 2143, Legacy Doi Chang 2026: staff typed his START at 06:00 while he was still on
 * course, then RaceTiger delivered his FINISH 45 minutes later through the split sync.
 * Nothing re-anchored the Runner doc, so it froze at that moment — no finishTime, gunTime
 * 0, and a net time measured to A6 instead of the finish. /event hid it (it derives both
 * clocks from these very records) while the winners boards ranked him off the stale net.
 */
describe('TimingService.isFrozenMidRace', () => {
    const frozen = {
        bib: '2143',
        manualCheckpoints: ['START'],
        startTime: day('06:00'),
        netTime: 5 * 3600000,   // measured to A6, not to the finish
        gunTime: 0,
        gunTimeStr: '',
    };
    const opts = { hasFinishRecord: true, hasManualCheckpoint: true };

    it('flags a doc with no finishTime', () => {
        expect(TimingService.isFrozenMidRace(frozen, opts)).toBe(true);
    });

    it('flags a doc that has a finishTime but no gun time', () => {
        expect(TimingService.isFrozenMidRace({ ...frozen, finishTime: day('12:12') }, opts)).toBe(true);
    });

    it('flags a typed START whose net time stops before the finish', () => {
        expect(TimingService.isFrozenMidRace(
            { ...frozen, finishTime: day('12:12'), gunTime: 6 * 3600000 + 14 * 60000 },
            opts,
        )).toBe(true);
    });

    // 06:00 → 12:12 is exactly what a re-anchored doc must record as its chip time.
    const repaired = {
        ...frozen,
        finishTime: day('12:12'),
        gunTime: 6 * 3600000 + 14 * 60000 + 42000,  // 6:14:42, off the FINISH record
        netTime: 6 * 3600000 + 12 * 60000,          // 6:12:00 = FINISH − typed START
    };

    it('clears the same runner once the times are re-anchored', () => {
        expect(TimingService.isFrozenMidRace(repaired, opts)).toBe(false);
    });

    it('ignores runners with no staff-typed checkpoint and runners still out on course', () => {
        expect(TimingService.isFrozenMidRace(frozen, { ...opts, hasManualCheckpoint: false })).toBe(false);
        expect(TimingService.isFrozenMidRace(frozen, { ...opts, hasFinishRecord: false })).toBe(false);
        expect(TimingService.isFrozenMidRace(repaired, { ...opts, hasManualCheckpoint: false })).toBe(false);
    });
});

/**
 * The repair the frozen doc actually needs: net measured from the typed START to the
 * FINISH, and gun lifted off the FINISH record rather than falling back to net.
 */
describe('TimingService.recomputeRunnerAggregates — re-anchoring a frozen runner', () => {
    it('writes net = FINISH − typed START and gun from the FINISH record', async () => {
        const RUNNER_ID = new Types.ObjectId().toHexString();
        const runner = runnerDoc({
            _id: RUNNER_ID, status: 'in_progress', manualCheckpoints: ['START'],
            startTime: day('06:00'), netTime: 5 * 3600000, gunTime: 0, gunTimeStr: '',
        });
        const { service, runnersService } = buildService(runner, [
            { _id: 'r1', checkpoint: 'START', scanTime: day('06:00'), order: 1, isManualTime: true },
            { _id: 'r2', checkpoint: 'A6', scanTime: day('09:30'), order: 2, gunTime: 12900000 },
            { _id: 'r3', checkpoint: 'FINISH', scanTime: day('10:30'), order: 3, gunTime: 16500000 },
        ]);
        jest.restoreAllMocks();

        await service.recomputeRunnerAggregates(EVENT_ID, RUNNER_ID);

        const [, update] = runnersService.setAggregates.mock.calls[0];
        expect(update.finishTime).toEqual(day('10:30'));
        expect(update.netTime).toBe(4 * 3600000 + 30 * 60000);   // 06:00 → 10:30
        expect(update.gunTime).toBe(16500000);                    // 04:35:00, off the FINISH record
        expect(update.gunTimeStr).toBe('4:35:00');               // the blank string gets filled too
        expect(update.status).toBe('finished');
    });
});

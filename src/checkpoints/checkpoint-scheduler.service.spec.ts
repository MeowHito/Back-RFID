import { Types } from 'mongoose';
import { CheckpointSchedulerService } from './checkpoint-scheduler.service';

/**
 * Cut-off behaviour, with the three models faked in memory.
 *
 * The case that started this: a FINISH cut-off at 11:00 and a runner whose FINISH crossing
 * is stamped 12:39. The crossing arrives after the cut-off has already passed, so nothing
 * was "still racing" for the old rule to catch and the runner stayed FINISH.
 */

const CAMPAIGN_ID = '69c152af0b9f6c7c5d676cbb';
const EVENT_ID = new Types.ObjectId('69c152af0b9f6c7c5d676ccc');

const CUTOFF = '2026-09-06T11:00';
const day = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00`);

interface Runner {
    _id: Types.ObjectId;
    status: string;
    category?: string;
    latestCheckpoint?: string;
    finishTime?: Date | null;
    isManualStatus?: boolean;
    statusChangedBy?: string;
}

interface Record_ { runnerId: Types.ObjectId; checkpoint: string; scanTime: Date }

function checkpoints(finishCutoff: string | undefined = CUTOFF) {
    return [
        { _id: 'cp-start', campaignId: CAMPAIGN_ID, name: 'START', type: 'start', orderNum: 1, active: true },
        { _id: 'cp-a5', campaignId: CAMPAIGN_ID, name: 'A5', type: 'checkpoint', orderNum: 2, active: true },
        {
            _id: 'cp-finish', campaignId: CAMPAIGN_ID, name: 'FINISH', type: 'finish', orderNum: 3,
            active: true, cutoffTime: finishCutoff,
        },
    ];
}

/** Minimal stand-ins for the mongoose models the scheduler drives. */
function buildService(opts: { cps: any[]; runners: Runner[]; records: Record_[] }) {
    const updates: Array<{ filter: any; set: any }> = [];
    const thenable = (value: any) => ({ exec: async () => value });
    const leanable = (value: any) => ({ lean: () => thenable(value), select: () => leanable(value) });

    const checkpointModel: any = {
        find: (query: any) => leanable(query?.$or ? opts.cps.filter(cp => cp.cutoffTime || cp.cutoffTimes) : opts.cps),
    };
    const eventModel: any = { find: () => leanable([{ _id: EVENT_ID }]) };
    // The scheduler scopes runners by category (per-distance cut-off, or the checkpoint's
    // distanceMappings), so the fake has to honour that filter for those tests to mean anything.
    const inScope = (query: any, r: Runner) => {
        const cat = query.category;
        if (!cat) return true;
        const patterns: RegExp[] = cat.$in || [cat.$regex];
        return patterns.some(re => re.test(r.category || ''));
    };
    const runnerModel: any = {
        find: (query: any) => leanable(
            opts.runners.filter(r => (query.status?.$in || []).includes(r.status)
                && r.isManualStatus !== true && inScope(query, r)),
        ),
        countDocuments: (query: any) => thenable(
            opts.runners.filter(r => (query.status?.$in || [query.status]).includes(r.status)
                && inScope(query, r)).length,
        ),
        updateMany: (filter: any, update: any) => {
            const ids: string[] = (filter._id?.$in || []).map(String);
            const matched = filter._id
                ? opts.runners.filter(r => ids.includes(String(r._id)))
                : opts.runners.filter(r => r.status === filter.status && r.isManualStatus !== true
                    && inScope(filter, r));
            for (const r of matched) Object.assign(r, update.$set);
            if (matched.length > 0) updates.push({ filter, set: update.$set });
            return thenable({ modifiedCount: matched.length });
        },
    };
    const timingRecordModel: any = {
        countDocuments: () => thenable(opts.records.length),
        aggregate: (pipeline: any[]) => {
            // $match keeps this checkpoint and everything past it; $group then splits the two.
            const scope: RegExp[] = pipeline[0].$match.checkpoint.$in;
            const cpName = pipeline[1].$group.atCp.$min.$cond[0].$eq[1];
            const grouped = new Map<string, { _id: any; atCp: Date | null; beyond: Date | null }>();
            for (const rec of opts.records.filter(r => scope.some(re => re.test(r.checkpoint)))) {
                const key = String(rec.runnerId);
                const row = grouped.get(key) || { _id: rec.runnerId, atCp: null, beyond: null };
                const field = rec.checkpoint.toUpperCase() === cpName ? 'atCp' : 'beyond';
                if (!row[field] || rec.scanTime < row[field]!) row[field] = rec.scanTime;
                grouped.set(key, row);
            }
            return thenable([...grouped.values()]);
        },
    };

    const service = new CheckpointSchedulerService(checkpointModel, runnerModel, eventModel, timingRecordModel);
    return { service, updates };
}

const runner = (over: Partial<Runner> = {}): Runner => ({
    _id: new Types.ObjectId(),
    status: 'finished',
    category: '10K',
    ...over,
});

describe('CheckpointSchedulerService — cut-off enforcement', () => {
    it('DNFs a runner whose FINISH crossing is stamped after the cut-off', async () => {
        const late = runner({ latestCheckpoint: 'FINISH', finishTime: day('12:39') });
        const { service } = buildService({
            cps: checkpoints(),
            runners: [late],
            records: [
                { runnerId: late._id, checkpoint: 'START', scanTime: day('06:00') },
                { runnerId: late._id, checkpoint: 'A5', scanTime: day('08:21') },
                { runnerId: late._id, checkpoint: 'FINISH', scanTime: day('12:39') },
            ],
        });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(1);
        expect(late.status).toBe('dnf');
        expect((late as any).statusCheckpoint).toBe('FINISH');
    });

    it('leaves a runner who crossed the line before the cut-off alone', async () => {
        const inTime = runner({ latestCheckpoint: 'FINISH', finishTime: day('10:30') });
        const { service } = buildService({
            cps: checkpoints(),
            runners: [inTime],
            records: [{ runnerId: inTime._id, checkpoint: 'FINISH', scanTime: day('10:30') }],
        });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(0);
        expect(inTime.status).toBe('finished');
    });

    it('does not DNF a finisher on an intermediate cut-off the mat missed', async () => {
        // A5 closes at 11:00; this runner has no A5 read at all, but was at FINISH by 10:30.
        const cps = checkpoints(undefined);
        (cps[1] as any).cutoffTime = CUTOFF;
        const missedMat = runner({ latestCheckpoint: 'FINISH', finishTime: day('10:30') });
        const { service } = buildService({
            cps,
            runners: [missedMat],
            records: [{ runnerId: missedMat._id, checkpoint: 'FINISH', scanTime: day('10:30') }],
        });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(0);
        expect(missedMat.status).toBe('finished');
    });

    it('DNFs a runner still out on course when the cut-off passes', async () => {
        const stillRacing = runner({ status: 'in_progress', latestCheckpoint: 'A5' });
        const { service } = buildService({
            cps: checkpoints(),
            runners: [stillRacing],
            records: [{ runnerId: stillRacing._id, checkpoint: 'A5', scanTime: day('08:21') }],
        });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(1);
        expect(stillRacing.status).toBe('dnf');
    });

    it('DNFs a late finisher on a score-only event that has no FINISH record', async () => {
        const scoreOnly = runner({ finishTime: day('12:39') });
        const { service } = buildService({ cps: checkpoints(), runners: [scoreOnly], records: [] });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(1);
        expect(scoreOnly.status).toBe('dnf');
    });

    it('never overrides a status staff set by hand', async () => {
        const manual = runner({ finishTime: day('12:39'), isManualStatus: true });
        const adminSet = runner({ finishTime: day('12:39'), statusChangedBy: 'admin@rfidtiming.com' });
        const { service } = buildService({
            cps: checkpoints(),
            runners: [manual, adminSet],
            records: [
                { runnerId: manual._id, checkpoint: 'FINISH', scanTime: day('12:39') },
                { runnerId: adminSet._id, checkpoint: 'FINISH', scanTime: day('12:39') },
            ],
        });

        const result = await service.checkCutOffTimes();

        expect(result.dnfCount).toBe(0);
        expect(manual.status).toBe('finished');
        expect(adminSet.status).toBe('finished');
    });

    it('applies a legacy all-distance cut-off only to the distances the checkpoint is mapped to', async () => {
        const cps = checkpoints();
        (cps[2] as any).cutoffTime = CUTOFF;
        (cps[2] as any).distanceMappings = ['21K'];
        const tenK = runner({ category: '10K', finishTime: day('12:39') });
        const { service } = buildService({
            cps,
            runners: [tenK],
            records: [{ runnerId: tenK._id, checkpoint: 'FINISH', scanTime: day('12:39') }],
        });

        const result = await service.checkCutOffTimes();

        // The 10K field never runs through this checkpoint, so its cut-off says nothing about them.
        expect(result.dnfCount).toBe(0);
        expect(tenK.status).toBe('finished');
    });

    it('ignores a cut-off that has not been reached yet', async () => {
        const soon = new Date(Date.now() + 3600_000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const future = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`
            + `T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
        const running = runner({ status: 'in_progress', latestCheckpoint: 'A5' });
        const { service } = buildService({ cps: checkpoints(future), runners: [running], records: [] });

        const result = await service.checkCutOffTimes();

        expect(result.processed).toBe(0);
        expect(running.status).toBe('in_progress');
    });
});

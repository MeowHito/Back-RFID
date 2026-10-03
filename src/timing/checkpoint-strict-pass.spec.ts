import { Types } from 'mongoose';

// CheckpointsService (pulled in through TimingService) imports uuid, which ships ESM-only.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { TimingService } from './timing.service';

/**
 * /share-live (strict mode): a read a runner cannot really have made must not show them
 * as "passed". Seen live at SPONSOR RUN 2026 — the FINISH mat sat before START under one
 * arch, so 10K runners walking to the corral were read at FINISH and got "finished" in 6 min.
 */

const EVENT_10K = new Types.ObjectId();
const EVENT_21K = new Types.ObjectId();
const t = (hhmmss: string) => new Date(`2026-10-04T${hhmmss}+07:00`);

const CHECKPOINTS = [
    { name: 'START', type: 'start', orderNum: 1 },
    { name: 'CP1', type: 'checkpoint', orderNum: 2 },
    { name: 'FINISH', type: 'finish', orderNum: 3 },
];
const EVENTS = [
    { _id: EVENT_10K, distance: 10 },
    { _id: EVENT_21K, distance: 21 },
];

function run(checkpoint: string, records: any[], startReads: { bib: string; scanTime: Date }[], reads: any[], runners: any[]) {
    const timingModel: any = {
        aggregate: () => ({
            exec: async () => {
                const byBib = new Map<string, Date>();
                for (const r of startReads) {
                    const prev = byBib.get(r.bib);
                    if (!prev || r.scanTime < prev) byBib.set(r.bib, r.scanTime);
                }
                return Array.from(byBib.entries()).map(([bib, scanTime]) => ({ _id: bib, scanTime }));
            },
        }),
        find: () => ({
            select: () => ({
                sort: () => ({
                    lean: () => ({
                        exec: async () => [...reads].sort((a, b) => a.scanTime.getTime() - b.scanTime.getTime()),
                    }),
                }),
            }),
        }),
    };
    const service = new TimingService(timingModel, {} as any, {} as any, {} as any, {} as any);
    const runnerByBib = new Map(runners.map(r => [r.bib, r]));
    return (service as any).clearImpossibleCheckpointPasses(records, {
        eventIds: [EVENT_10K, EVENT_21K],
        checkpoint,
        checkpoints: CHECKPOINTS,
        events: EVENTS,
        runnerByBib,
    }).then(() => records);
}

describe('TimingService strict checkpoint passes', () => {
    it('clears a FINISH read made before the runner crossed START', async () => {
        const rec = { bib: '11759', scanTime: t('04:10:55'), gunTime: 361000, netTime: null, status: 'finished' };
        await run('FINISH', [rec],
            [{ bib: '11759', scanTime: t('04:12:11') }],
            [{ bib: '11759', scanTime: t('04:10:55'), gunTime: 361000 }],
            [{ bib: '11759', eventId: EVENT_10K }]);
        expect(rec.scanTime).toBeNull();
        expect(rec.gunTime).toBeNull();
        expect(rec.status).toBe('in_progress');
    });

    it('falls back to the later real FINISH read', async () => {
        const later = { bib: '11759', scanTime: t('05:01:00'), gunTime: 3366000, netTime: 3290000, elapsedTime: 3290000 };
        const rec: any = { bib: '11759', scanTime: t('04:10:55'), gunTime: 361000, status: 'finished' };
        await run('FINISH', [rec],
            [{ bib: '11759', scanTime: t('04:12:11') }],
            [{ bib: '11759', scanTime: t('04:10:55'), gunTime: 361000 }, later],
            [{ bib: '11759', eventId: EVENT_10K }]);
        expect(rec.scanTime).toEqual(later.scanTime);
        expect(rec.gunTime).toBe(3366000);
        expect(rec.netTime).toBe(3290000);
        expect(rec.status).toBe('finished');
    });

    it('clears an impossible finish time when there is no START read', async () => {
        const rec: any = { bib: '10434', scanTime: t('04:15:31'), gunTime: 637000, status: 'finished' };
        await run('FINISH', [rec], [],
            [{ bib: '10434', scanTime: t('04:15:31'), gunTime: 637000 }],
            [{ bib: '10434', eventId: EVENT_10K }]);
        expect(rec.scanTime).toBeNull();
    });

    it('keeps a real 21K finish', async () => {
        const scan = t('04:11:50');
        const rec: any = { bib: '21654', scanTime: scan, gunTime: 4317000, netTime: 4316000, status: 'finished' };
        await run('FINISH', [rec],
            [{ bib: '21654', scanTime: t('02:59:55') }],
            [{ bib: '21654', scanTime: scan, gunTime: 4317000 }],
            [{ bib: '21654', eventId: EVENT_21K }]);
        expect(rec.scanTime).toBe(scan);
        expect(rec.gunTime).toBe(4317000);
        expect(rec.status).toBe('finished');
    });

    it('trusts a staff-typed time even before START', async () => {
        const scan = t('04:10:00');
        const rec: any = { bib: '1', scanTime: scan, gunTime: 300000, status: 'finished' };
        await run('FINISH', [rec],
            [{ bib: '1', scanTime: t('04:12:00') }],
            [{ bib: '1', scanTime: scan, gunTime: 300000, isManualTime: true }],
            [{ bib: '1', eventId: EVENT_10K }]);
        expect(rec.scanTime).toBe(scan);
    });

    it('mid-course: keeps a plausible pass with no START read, clears one before START without touching status', async () => {
        const ok: any = { bib: '21299', scanTime: t('03:55:43'), status: 'in_progress' };
        const early: any = { bib: '21000', scanTime: t('02:50:00'), status: 'finished' };
        await run('CP1', [ok, early],
            [{ bib: '21000', scanTime: t('02:59:00') }],
            [{ bib: '21299', scanTime: t('03:55:43') }, { bib: '21000', scanTime: t('02:50:00') }],
            [{ bib: '21299', eventId: EVENT_21K }, { bib: '21000', eventId: EVENT_21K }]);
        expect(ok.scanTime).toEqual(t('03:55:43'));
        expect(early.scanTime).toBeNull();
        expect(early.status).toBe('finished');
    });

    it('leaves the START list alone', async () => {
        const scan = t('02:51:03');
        const rec: any = { bib: '10006', scanTime: scan, status: 'in_progress' };
        await run('START', [rec], [], [], [{ bib: '10006', eventId: EVENT_10K }]);
        expect(rec.scanTime).toBe(scan);
    });
});

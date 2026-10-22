// CheckpointsService (pulled in through TimingService) imports uuid, which ships ESM-only.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { TimingService } from './timing.service';

/**
 * /share-live polls checkpoint-by-campaign every 10 s per viewer, and on the live server a
 * FINISH list took ~4.7 s to build. Every poll that landed during a rebuild used to start
 * its own rebuild. Strict (share-live) requests now share one rebuild and keep getting the
 * previous list meanwhile; admin (non-strict) requests still wait for a fresh build.
 */

function makeService() {
    const service = new TimingService({} as any, {} as any, {} as any, {} as any, {} as any) as any;
    let version = 0;
    const release: Array<() => void> = [];
    service.buildCheckpointRecordsByCampaign = jest.fn(() => {
        const v = ++version;
        return new Promise<any[]>(resolve => release.push(() => resolve([{ bib: `v${v}` }])));
    });
    const finishBuilds = async () => {
        while (release.length) release.shift()!();
        await new Promise(r => setImmediate(r));
    };
    const expire = (key: string, agoMs: number) => {
        service.checkpointByCampaignCache.get(key).expiry = Date.now() - agoMs;
    };
    return { service, finishBuilds, expire };
}

const KEY = 'c1::FINISH::strict';

describe('TimingService checkpoint list cache (share-live)', () => {
    it('concurrent first requests share one build', async () => {
        const { service, finishBuilds } = makeService();
        const calls = Array.from({ length: 20 }, () => service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true }));
        await finishBuilds();
        const results = await Promise.all(calls);
        expect(service.buildCheckpointRecordsByCampaign).toHaveBeenCalledTimes(1);
        expect(results.every((r: any[]) => r[0].bib === 'v1')).toBe(true);
    });

    it('after the TTL, answers with the previous list at once and rebuilds once in the background', async () => {
        const { service, finishBuilds, expire } = makeService();
        const first = service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true });
        await finishBuilds();
        await first;
        expire(KEY, 1000);

        const during = await Promise.all(Array.from({ length: 10 }, () =>
            service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true })));
        expect(during.every((r: any[]) => r[0].bib === 'v1')).toBe(true);
        expect(service.buildCheckpointRecordsByCampaign).toHaveBeenCalledTimes(2);

        await finishBuilds();
        const after = await service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true });
        expect(after[0].bib).toBe('v2');
    });

    it('a list nobody asked for in over a minute is rebuilt before answering', async () => {
        const { service, finishBuilds, expire } = makeService();
        const first = service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true });
        await finishBuilds();
        await first;
        expire(KEY, 120_000);

        const pending = service.getCheckpointRecordsByCampaign('c1', 'FINISH', { strict: true });
        await finishBuilds();
        expect((await pending)[0].bib).toBe('v2');
    });

    it('admin (non-strict) requests still wait for a fresh build after the TTL', async () => {
        const { service, finishBuilds, expire } = makeService();
        const first = service.getCheckpointRecordsByCampaign('c1', 'FINISH');
        await finishBuilds();
        await first;
        expire('c1::FINISH', 1000);

        const pending = service.getCheckpointRecordsByCampaign('c1', 'FINISH');
        await finishBuilds();
        expect((await pending)[0].bib).toBe('v2');
    });
});

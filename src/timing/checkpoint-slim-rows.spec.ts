// CheckpointsService (pulled in through TimingService) imports uuid, which ships ESM-only.
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { slimCheckpointRows } from './timing.service';

/** `slim=1` (/share-live): only the fields that page reads, and never the staff note. */
describe('slimCheckpointRows', () => {
    const full = {
        _id: '6ac167fc9e7dd06d67dc0496', bib: '21654', firstName: 'ANUCHA', lastName: 'PADA', firstNameTh: '',
        gender: 'M', category: '21K', ageGroup: '17 - 29', status: 'finished', statusCheckpoint: '',
        statusNote: 'Auto DQ — no START read', scanTime: new Date('2026-10-03T21:11:50.259Z'),
        gunTime: 4317000, netTime: 4316000, elapsedTime: 4316000, netPace: '03:25', gunPace: '03:25',
        overallRank: 1, genderRank: 1, categoryRank: 1, splitTime: 61000, order: 9999, team: '', nationality: 'THA',
    };

    it('keeps what share-live reads and drops the rest', () => {
        expect(slimCheckpointRows([full])).toEqual([{
            bib: '21654', firstName: 'ANUCHA', lastName: 'PADA', gender: 'M', category: '21K', status: 'finished',
            ageGroup: '17 - 29', scanTime: full.scanTime, gunTime: 4317000, netTime: 4316000, netPace: '03:25',
        }]);
    });

    it('never sends the staff-only status note', () => {
        expect(JSON.stringify(slimCheckpointRows([full]))).not.toContain('Auto DQ');
    });

    it('keeps runners on their way and stopped runners, drops finishers with no read here', () => {
        const coming = { bib: '1', status: 'in_progress', scanTime: null, statusCheckpoint: 'CP3' };
        const dns = { bib: '2', status: 'dns', scanTime: null };
        const missedMat = { bib: '3', status: 'finished', scanTime: null };
        expect(slimCheckpointRows([coming, dns, missedMat]).map(r => r.bib)).toEqual(['1', '2']);
    });

    it('sends _id only when there is no BIB to key the row by', () => {
        const [row] = slimCheckpointRows([{ _id: 'abc', bib: '', status: 'dns' }]);
        expect(row._id).toBe('abc');
        expect(row.firstName).toBe('');
    });
});

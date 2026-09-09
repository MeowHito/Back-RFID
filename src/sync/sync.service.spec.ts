import { SyncService } from './sync.service';

/**
 * The RaceTiger `Category` column carries either a race distance or an age
 * group, and some races name age brackets with a bare number ("30", "40",
 * "50") that reads exactly like a distance. These cover the rule that tells
 * them apart — see `buildAgeGroupVocabulary`.
 */
describe('SyncService age-group vocabulary', () => {
    // Constructed without the Nest container: the methods under test are pure
    // and touch none of the injected models.
    const service = Object.create(SyncService.prototype) as any;
    const row = (eventId: number, category: string) => ({ EventId: eventId, Category: category });

    const ageGroupOf = (rows: any[], target: any) =>
        service.extractAgeGroupFromBioRow(target, service.buildAgeGroupVocabulary(rows));

    it('reads bare numbers as age groups when the event also uses an unmistakable bracket', () => {
        // Khao Kradong Trail 2026, 25K: "40 / 30 / 50 / 60+ / U29"
        const rows = [row(1, '40'), row(1, '30'), row(1, '50'), row(1, '60+'), row(1, 'U29')];
        expect(rows.map(r => ageGroupOf(rows, r))).toEqual(['40', '30', '50', '60+', 'U29']);
    });

    it('leaves bare numbers alone when nothing in the event proves it brackets by age', () => {
        // Category holding distances — "10" and "21" are not age groups here.
        const rows = [row(1, '10'), row(1, '21'), row(1, '42')];
        expect(rows.map(r => ageGroupOf(rows, r))).toEqual(['', '', '']);
    });

    it('scopes the verdict to the event that earned it', () => {
        const rows = [row(1, '40'), row(1, '60+'), row(2, '10')];
        expect(ageGroupOf(rows, row(1, '40'))).toBe('40');
        expect(ageGroupOf(rows, row(2, '10'))).toBe('');
    });

    it('still prefers RaceTiger\'s own age-group columns over the Category guess', () => {
        const rows = [{ EventId: 1, Category: '10', Category2: '40-49' }, row(1, '60+')];
        expect(ageGroupOf(rows, rows[0])).toBe('40-49');
    });

    it('ignores numbers that cannot be an age', () => {
        const rows = [row(1, '0'), row(1, '250'), row(1, '60+')];
        expect(rows.map(r => ageGroupOf(rows, r))).toEqual(['', '', '60+']);
    });
});

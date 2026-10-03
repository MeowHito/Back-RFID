/**
 * Which clock the age-group (AGE / CAT) placings of a distance run on.
 *
 * Age-group placings are NET by default. An event that publishes its awards from
 * /admin/award-builder (the "awards" column is on in /admin/display) follows the
 * Gun/Net choice of that distance's age-group award instead — a trophy award
 * (`showOnEvent`) first, else the first one listed — so the AGE number agrees with
 * the award the organizer actually hands out.
 *
 * Mirrors `ageGroupRankByFor` in frontend/src/lib/custom-awards.ts.
 */

import { normalizeCategoryName } from './nationality.util';

export type AgeGroupRankBy = 'gun' | 'net';

/** Normalized names of the distances whose age-group placings rank by GUN time. */
export function ageGroupGunCategories(campaign: any): string[] {
    const columns = campaign?.displayColumns;
    if (!Array.isArray(columns) || !columns.includes('awards')) return [];
    const awards = Array.isArray(campaign?.customAwards) ? campaign.customAwards : [];
    const decided = new Map<string, AgeGroupRankBy>();
    const ageGroupAwards = awards.filter((a: any) => a && a.type === 'ageGroup' && a.category);
    // Trophy awards first so they win over a hidden draft of the same distance.
    const ordered = [
        ...ageGroupAwards.filter((a: any) => a.showOnEvent === true),
        ...ageGroupAwards.filter((a: any) => a.showOnEvent !== true),
    ];
    for (const award of ordered) {
        const key = normalizeCategoryName(award.category);
        if (!key || decided.has(key)) continue;
        // Award Builder saves 'gun' unless 'net' was picked (normalizeCustomAwards).
        decided.set(key, award.rankBy === 'net' ? 'net' : 'gun');
    }
    return [...decided].filter(([, by]) => by === 'gun').map(([key]) => key);
}

/** True when `category`'s age-group placings rank by GUN time. */
export function isAgeGroupGunCategory(gunCategories: string[], category?: string | null): boolean {
    if (!gunCategories.length) return false;
    const target = normalizeCategoryName(category);
    return !!target && gunCategories.includes(target);
}

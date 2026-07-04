/**
 * Nationality grouping helpers used by the "separate Overall ranking by nationality"
 * feature. When a race category is listed in the campaign's
 * `separateOverallNationalityCategories`, its Overall ranking is split into two
 * buckets: Thai and foreign (all non-Thai countries).
 *
 * Runners with an empty/unknown nationality are counted as Thai (domestic default —
 * imports default the field to "THA").
 */

const THAI_TOKENS = new Set(['THA', 'TH', 'THAI', 'THAILAND', 'ไทย']);

/** True when the nationality string represents Thailand (or is empty/unknown). */
export function isThaiNationality(nationality?: string | null): boolean {
    const value = String(nationality ?? '').trim();
    if (!value) return true; // empty/unknown → Thai
    return THAI_TOKENS.has(value.toUpperCase());
}

/** Stable bucket key for grouping: 'thai' | 'foreign'. */
export function nationalityGroupKey(nationality?: string | null): 'thai' | 'foreign' {
    return isThaiNationality(nationality) ? 'thai' : 'foreign';
}

/** Normalize a category name for tolerant matching ("10 KM." → "10km"). */
export function normalizeCategoryName(value?: string | null): string {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
}

/** True when `category` is one of the campaign's nationality-split categories. */
export function isNationalitySplitCategory(
    splitCategories: string[] | undefined | null,
    category?: string | null,
): boolean {
    if (!Array.isArray(splitCategories) || splitCategories.length === 0) return false;
    const target = normalizeCategoryName(category);
    if (!target) return false;
    return splitCategories.some(c => normalizeCategoryName(c) === target);
}

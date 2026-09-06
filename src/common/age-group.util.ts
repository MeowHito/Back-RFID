/**
 * Age-group label canonicalization — backend mirror of
 * `frontend/src/lib/age-groups.ts`. RaceTiger sometimes tags a handful of
 * runners in the same real bracket with a differently-shaped ageGroup string
 * than the rest of the field (e.g. "0-19" for 2 runners vs "U 19" for the
 * other 44). Treating every literal string as its own bucket fragments the
 * age-group rank so a minority-spelling runner lands nearly alone in a
 * one-off bucket and gets an inflated rank. Keep this in sync with the
 * frontend module if the parsing rules change.
 */

export interface AgeGroupBucket {
    label: string;
    min: number;
    max: number;
}

/** Strip gender prefix ("M30-39") and Thai "ปี" suffix so labels group consistently. */
export function normalizeAgeGroupLabel(value?: string | null): string {
    return String(value || '')
        .replace(/^[MF]\s*/i, '')
        .replace(/\s*ปี$/i, '')
        .trim();
}

/**
 * Numeric bracket bounds, with the unit suffixes RaceTiger appends when a race
 * brackets by something other than age. DOX RACE (dog trail) sends weight
 * classes in the same Category field — "1-4KG", "4-13KG", "13KG+" — so the
 * bracket parser has to survive a unit between the number and the -/+ and
 * decimal bounds like "4.01-13 kg".
 */
const BOUND = String.raw`\d{1,3}(?:\.\d+)?`;
const UNIT = String.raw`(?:\s*(?:kgs?|กก\.?|กิโลกรัม|กิโล))?`;

const RANGE_RE = new RegExp(`(${BOUND})${UNIT}\\s*-\\s*(${BOUND})${UNIT}`, 'i');
const PLUS_RE = new RegExp(`(${BOUND})${UNIT}\\s*\\+`, 'i');
const OVER_RE = new RegExp(`(${BOUND})${UNIT}\\s*(?:&|and\\b)?\\s*(?:over|up|ขึ้นไป)`, 'i');

export function parseAgeGroupBucket(value?: string | null): AgeGroupBucket | null {
    const label = normalizeAgeGroupLabel(value);
    if (!label) return null;

    const rangeMatch = label.match(RANGE_RE);
    if (rangeMatch) {
        return { label, min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
    }

    const underMatch = label.match(/(?:u|under)\s*(\d+)/i);
    if (underMatch) {
        const max = parseInt(underMatch[1]) - 1;
        return { label, min: 0, max: max >= 0 ? max : 0 };
    }

    // "70+", "13KG+"
    const plusMatch = label.match(PLUS_RE);
    if (plusMatch) {
        return { label, min: parseFloat(plusMatch[1]), max: 999 };
    }

    // "60&Over", "60 & Up", "60 and over", "60 ขึ้นไป", "13.01 kg ขึ้นไป", "Over 60"
    const overMatch = label.match(OVER_RE)
        || label.match(/\b(?:over|above)\s*(\d+)/i);
    if (overMatch) {
        return { label, min: parseFloat(overMatch[1]), max: 999 };
    }

    return null;
}

const overlapAmount = (a: AgeGroupBucket, b: AgeGroupBucket) => Math.min(a.max, b.max) - Math.max(a.min, b.min);

/**
 * Given every runner's raw ageGroup string for a pool, returns a lookup to
 * map any raw label — including minority variants — to its canonical label.
 */
export function buildCanonicalAgeGroupLookup(rawLabels: Array<string | undefined | null>): Map<string, string> {
    const stats = new Map<string, { bucket: AgeGroupBucket; count: number }>();
    for (const raw of rawLabels) {
        const bucket = parseAgeGroupBucket(raw);
        if (!bucket) continue;
        const key = bucket.label.toLowerCase();
        const existing = stats.get(key);
        if (existing) existing.count += 1;
        else stats.set(key, { bucket, count: 1 });
    }

    const entries = Array.from(stats.values()).sort((a, b) => b.count - a.count);

    const dominant: { bucket: AgeGroupBucket; count: number }[] = [];
    for (const entry of entries) {
        const overlapsExisting = dominant.some(d => overlapAmount(entry.bucket, d.bucket) > 0);
        if (!overlapsExisting) dominant.push(entry);
    }

    const canonicalLabelOf = new Map<string, string>();
    for (const entry of entries) {
        const key = entry.bucket.label.toLowerCase();
        if (dominant.includes(entry)) {
            canonicalLabelOf.set(key, entry.bucket.label);
            continue;
        }
        let best: AgeGroupBucket | null = null;
        let bestOverlap = -Infinity;
        for (const d of dominant) {
            const overlap = overlapAmount(entry.bucket, d.bucket);
            if (overlap > bestOverlap) { bestOverlap = overlap; best = d.bucket; }
        }
        canonicalLabelOf.set(key, best ? best.label : entry.bucket.label);
    }

    return canonicalLabelOf;
}

/** Maps one raw ageGroup string to its canonical label using a lookup built by `buildCanonicalAgeGroupLookup`. */
export function canonicalizeAgeGroup(raw: string | undefined | null, canonicalLabelOf: Map<string, string>): string {
    const bucket = parseAgeGroupBucket(raw);
    if (!bucket) return normalizeAgeGroupLabel(raw);
    return canonicalLabelOf.get(bucket.label.toLowerCase()) ?? bucket.label;
}

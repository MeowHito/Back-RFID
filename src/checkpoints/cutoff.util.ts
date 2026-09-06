/**
 * Cut-off helpers shared by the cut-off scheduler, live scan ingestion (TimingService)
 * and anything else that has to decide whether a crossing counts.
 *
 * The rule all of them follow: a crossing recorded AFTER a checkpoint's cut-off does not
 * put the runner through that checkpoint. They are out of the race (DNF) even though the
 * mat read them — a late finisher is not a finisher.
 */

/** One resolved cut-off: a checkpoint + the distance it applies to. */
export interface CutoffEntry {
    /** Distance (category) this cut-off applies to; null = legacy cut-off shared by all distances. */
    category: string | null;
    cutoffStr: string;
    cutoff: Date;
    cacheKey: string;
}

/**
 * Automated actors that write `statusChangedBy`. A status stamped by one of these is a
 * computed result the cut-off rule may recompute; anything else was a human decision and
 * is left alone. Mirrors SyncService.SYSTEM_STATUS_ACTORS.
 */
export const SYSTEM_STATUS_ACTORS = new Set([
    'cutoff-scheduler', 'cutoff-extension', 'timing-scan', 'auto-dq-no-start',
]);

/** True when staff (not an automated rule) own this runner's status. */
export function isAdminOwnedStatus(runner: any): boolean {
    if (runner?.isManualStatus === true) return true;
    const by = String(runner?.statusChangedBy || '').trim().toLowerCase();
    if (by === '') return false;
    return !SYSTEM_STATUS_ACTORS.has(by) && !by.startsWith('auto-');
}

/**
 * Parse a stored cutoff string into a Date.
 * Supports ISO datetime ("2026-09-06T11:00", "2026-09-06T11:00+07:00") and
 * time-only "11:00" (interpreted as today).
 */
export function parseCutoffTime(timeStr?: string | null): Date | null {
    const str = String(timeStr ?? '').trim();
    if (!str || str === '-') return null;

    // Time-only first: new Date('11:00') is invalid, but be explicit about the intent.
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10));
    }

    const isoDate = new Date(str);
    return isNaN(isoDate.getTime()) ? null : isoDate;
}

/** Per-distance cut-off entries stored on a checkpoint, ignoring blanks and "-". */
function perCategoryEntries(cp: any): Array<[string, string]> {
    const map = (cp?.cutoffTimes || {}) as Record<string, string>;
    return Object.entries(map).filter(
        ([, val]) => !!String(val ?? '').trim() && String(val) !== '-',
    ) as Array<[string, string]>;
}

/**
 * Expand a checkpoint into its cut-off entries.
 * If per-distance `cutoffTimes` holds anything it fully replaces the legacy `cutoffTime`,
 * so a checkpoint migrated to per-distance cut-offs isn't also billed by the old global one.
 */
export function getCutoffEntries(cp: any): CutoffEntry[] {
    const cpId = String(cp?._id || '');
    const entries: CutoffEntry[] = [];
    const perCategory = perCategoryEntries(cp);
    if (perCategory.length > 0) {
        for (const [category, val] of perCategory) {
            const cutoffStr = String(val);
            const cutoff = parseCutoffTime(cutoffStr);
            if (cutoff) entries.push({ category, cutoffStr, cutoff, cacheKey: `${cpId}:${category}` });
        }
        return entries;
    }
    const legacyStr = cp?.cutoffTime;
    if (legacyStr && legacyStr !== '-' && legacyStr !== '') {
        const cutoff = parseCutoffTime(legacyStr);
        if (cutoff) entries.push({ category: null, cutoffStr: String(legacyStr), cutoff, cacheKey: cpId });
    }
    return entries;
}

/**
 * The cut-off that applies to one runner at one checkpoint, or null when there is none.
 * A legacy (all-distance) cut-off is skipped for distances the checkpoint isn't mapped to,
 * so a cut-off on a 100K-only checkpoint can never cut a 10K runner.
 */
export function resolveCutoffForCategory(cp: any, category?: string | null): Date | null {
    const cat = String(category ?? '').trim().toLowerCase();
    const perCategory = perCategoryEntries(cp);
    if (perCategory.length > 0) {
        if (!cat) return null;
        const hit = perCategory.find(([key]) => key.trim().toLowerCase() === cat);
        return hit ? parseCutoffTime(hit[1]) : null;
    }
    const mappings: string[] = Array.isArray(cp?.distanceMappings) ? cp.distanceMappings : [];
    if (mappings.length > 0 && cat
        && !mappings.some(name => String(name).trim().toLowerCase() === cat)) {
        return null;
    }
    return parseCutoffTime(cp?.cutoffTime);
}

/**
 * "06/09/2026 11:00" — how a cut-off reads in the admin UI, for status notes.
 * Rendered in race time (Asia/Bangkok) so the note matches the mapping screen even though
 * the server itself runs on UTC.
 */
export function formatCutoffForNote(cutoff: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(cutoff).reduce<Record<string, string>>((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/**
 * True when the cut-off rule (not a human) is what stopped this runner.
 *
 * Such a stop is owned by the cut-off evaluation alone: only the scheduler re-examining the
 * crossings, an extended cut-off, or staff may lift it. In particular the RaceTiger sync must
 * NOT promote these runners back to 'finished' just because a finish time exists — that is
 * exactly the tug-of-war that made a late finisher flip between FINISH and DNF every minute.
 */
export function isCutoffStopped(runner: any): boolean {
    if (runner?.isManualStatus === true) return false;
    const status = String(runner?.status || '').toLowerCase();
    if (status !== 'dnf' && status !== 'dns') return false;
    return String(runner?.statusChangedBy || '').trim().toLowerCase() === 'cutoff-scheduler';
}

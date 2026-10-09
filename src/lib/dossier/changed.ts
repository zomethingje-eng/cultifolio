/**
 * The day a dossier last changed in substance, for the sitemap's `<lastmod>` (round sixty-three; REVIEW-TRIAGE-61's
 * deferred list). Not `built`: every rederive rewrites `built` and every source's `at`, and a page whose figures are
 * the same is not a changed page; a `lastmod` that moves on every refresh teaches a crawler to discount it (round
 * sixty-one; the corpus review, 15). So the dossier keeps a fingerprint of what its page shows (`changed.h`) beside the
 * day that fingerprint first appeared (`changed.on`); a build or a fill that leaves the fingerprint as it was keeps the
 * day, and one that changes it moves the day to the day of the change.
 *
 * Left out of the fingerprint: `built` and `builtBy` (when, by what), `changed` itself, and each source row's `at` and
 * `detail` (when it was asked, and the build's own note, "carried from build of …"): the row's status stays in, since a
 * source that answered where it had refused is a change the page shows.
 */
import { md5 } from './md5';

export interface Changed {
  /** The day (YYYY-MM-DD, UTC) the fingerprint first appeared. */
  on: string;
  /** The fingerprint: a hash of the dossier's substance, as `substanceOf` gives it. */
  h: string;
}

type Obj = Record<string, unknown>;
const LEFT_OUT = new Set(['built', 'builtBy', 'changed']);

/** The value with every object's keys sorted, so two builds that wrote the same fields in another order agree. */
function canon(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') {
    const o: Obj = {};
    for (const k of Object.keys(x as Obj).sort()) o[k] = canon((x as Obj)[k]);
    return o;
  }
  return x;
}

/** The dossier's substance as one string: everything its page shows, without the build's dates and notes. */
export function substanceOf(d: object): string {
  const o: Obj = {};
  for (const [k, v] of Object.entries(d as Obj)) {
    if (LEFT_OUT.has(k)) continue;
    o[k] = k === 'upstream' && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Obj).map(([s, u]) => [s, (u as { status?: unknown } | null)?.status ?? null])) : v;
  }
  return JSON.stringify(canon(o));
}

/** The fingerprint, sixteen hex characters. The build passes node's own hash, which is faster on nine thousand files. */
export function substanceHash(d: object, hash: (s: string) => string = md5): string {
  return hash(substanceOf(d)).slice(0, 16);
}

const dayOfIso = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/**
 * The latest day the dossier records reading anything: its build, or a source asked since (a fill stamps the rows it
 * asks). For a dossier with no stamp yet, the day its substance last changed is no later than this, and no earlier day
 * is known.
 */
export function lastReading(d: object): string | null {
  const o = d as { built?: unknown; upstream?: Record<string, { at?: unknown } | null> };
  let best = dayOfIso(o.built);
  for (const u of Object.values(o.upstream ?? {})) {
    const day = dayOfIso(u?.at);
    if (day && (!best || day > best)) best = day;
  }
  return best;
}

/**
 * The stamp for a dossier about to be written by a build, given the file it replaces: the previous day when the
 * substance is unchanged, else the build's day.
 */
export function stampOnBuild(d: object, prev: object | null, hash?: (s: string) => string): Changed {
  const h = substanceHash(d, hash);
  const built = dayOfIso((d as { built?: unknown }).built) ?? new Date().toISOString().slice(0, 10);
  if (prev && substanceHash(prev, hash) === h) {
    const pc = (prev as { changed?: Changed }).changed;
    return { on: pc && pc.h === h && dayOfIso(pc.on) ? pc.on : (lastReading(prev) ?? built), h };
  }
  return { on: built, h };
}

/**
 * The stamp for a dossier read from disk when the index is written, or null when its stamp still holds. A dossier
 * changed since its stamp (by a fill, a prune, or a hand edit) is stamped `today`; one never stamped (built before
 * round sixty-three) is stamped with its last reading, the latest day it can have changed.
 */
export function restamp(d: object, today: string, hash?: (s: string) => string): Changed | null {
  const h = substanceHash(d, hash);
  const pc = (d as { changed?: Changed }).changed;
  if (pc && pc.h === h && dayOfIso(pc.on)) return null;
  return { on: pc ? today : (lastReading(d) ?? today), h };
}

/** A stamp's day as the index carries it: whole days since 1970-01-01, UTC (five digits, against ten for the date). */
export function dayNumber(on: string | null | undefined): number | undefined {
  if (!on) return undefined;
  const t = Date.parse(`${on.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : undefined;
}

/** An index day number as a sitemap date (YYYY-MM-DD), or null for none. */
export function dayIso(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? new Date(n * 86_400_000).toISOString().slice(0, 10) : null;
}

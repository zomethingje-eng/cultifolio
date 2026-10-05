/**
 * Each imported name checked against the reference (round sixty; the grower review's 2). First by hash group, the way
 * the plants list asks (no name leaves the device, a few requests for any number of names); a name the groups do not
 * hold is then put to this site's own search, the lookup the add form's species picker makes, which finds an older name
 * or a spelling one letter out. A name the reference does not hold can still be added as typed and is marked "not in the
 * reference"; a search that did not answer leaves the name "not checked", never "not in the reference" (rule 2).
 */
import { parseName, speciesOf, speciesSlug } from '$core/names';

export type NameCheck =
  /** The reference has the species: its page exists. `key` only when the name is at species rank (a subspecies keeps none rather than its species'). */
  | { s: 'found'; slug: string; refName: string; key: number | null }
  /** Not under this name; the search offers another, for the grower to take or not: never taken on its own. */
  | { s: 'near'; suggestion: string; key: number; why: 'older name' | 'spelling' | 'similar' }
  | { s: 'missing' }
  /** The reference was not reached, or the search allowance was spent: not checked, which is not "missing". */
  | { s: 'unchecked' }
  /** A cross is filed under its genus, as the add form files it; there is no species to check. */
  | { s: 'hybrid' };

type Entry = { slug: string; name: string; key: number; syn?: string[] };
export interface Lookup {
  entries(slugs: string[]): Promise<Map<string, Entry> | null>;
  search(q: string): Promise<Entry[] | { limited: number } | null>;
}

/** The part of a typed name the reference is asked about: the scientific name without the cultivar. */
export const checkKey = (typed: string): string => parseName(typed).scientific;

export async function checkNames(typed: string[], look: Lookup, concurrency = 4): Promise<Map<string, NameCheck>> {
  const out = new Map<string, NameCheck>();
  const todo = new Map<string, { scientific: string; slug: string; rankSpecies: boolean }>();
  for (const t of typed) {
    const p = parseName(t);
    const k = p.scientific;
    if (!k || out.has(k) || todo.has(k)) continue;
    if (p.kind === 'hybrid') { out.set(k, { s: 'hybrid' }); continue; }
    todo.set(k, { scientific: k, slug: speciesSlug(k), rankSpecies: speciesOf(k) === k });
  }
  if (!todo.size) return out;
  const got = await look.entries([...new Set([...todo.values()].map((x) => x.slug))]).catch(() => null);
  const ask: string[] = [];
  for (const [k, x] of todo) {
    const e = got?.get(x.slug);
    if (e) out.set(k, { s: 'found', slug: e.slug, refName: e.name, key: x.rankSpecies ? e.key : null });
    else ask.push(k);
  }
  let stopped = false;
  let i = 0;
  const worker = async () => {
    while (i < ask.length) {
      const k = ask[i++];
      if (stopped) { out.set(k, { s: 'unchecked' }); continue; }
      const x = todo.get(k)!;
      let r: Awaited<ReturnType<Lookup['search']>>;
      try { r = await look.search(speciesOf(x.scientific)); } catch { r = null; }
      if (r === null) { out.set(k, { s: 'unchecked' }); continue; }
      if (!Array.isArray(r)) { stopped = true; out.set(k, { s: 'unchecked' }); continue; }
      out.set(k, readSearch(x.scientific, x.rankSpecies, r));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ask.length) }, worker));
  return out;
}

/** What one search answer says about a name the hash group did not hold. */
export function readSearch(scientific: string, rankSpecies: boolean, hits: Entry[]): NameCheck {
  const want = speciesOf(scientific).toLowerCase();
  const exact = hits.find((h) => h.name.toLowerCase() === want);
  if (exact) return { s: 'found', slug: exact.slug, refName: exact.name, key: rankSpecies ? exact.key : null };
  const older = hits.find((h) => (h.syn ?? []).some((n) => n.toLowerCase() === want));
  if (older) return { s: 'near', suggestion: older.name, key: older.key, why: 'older name' };
  const genus = want.split(' ')[0];
  const close = hits.find((h) => h.name.toLowerCase().split(' ')[0] === genus && editDistance(h.name.toLowerCase(), want) <= 2);
  if (close) return { s: 'near', suggestion: close.name, key: close.key, why: 'spelling' };
  return { s: 'missing' };
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

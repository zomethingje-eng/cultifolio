/**
 * Writing an import (round sixty; the grower review's 2): the places the grower agreed to make, the species records the
 * add form would make, then each row through the collection's own `addAccessions`, one commit per row (a row of three is
 * three plants in one commit, as the add form's "How many" is). An import is only more ordinary changes: nothing new for
 * the fold, sync or a backup. Each plant gets the number the review showed (the plan, frozen while this runs); a number
 * taken meanwhile (another tab) gets the next free one and says so. A failure before the first plant (making the places
 * or the species records) is caught and said with what was made; the page then keeps every row (round sixty-one; the
 * records review, 8).
 */
import { collection } from '$lib/db/collection.svelte';
import { accNo, type Accession, type Provenance } from '$lib/db/types';
import { parseName, speciesOf, speciesSlug } from '$core/names';
import type { NameCheck } from './check';
import { checkKey } from './check';
import { resolvePlace, type ImportRow, type NumberPlan } from './plan';

export interface ImportResult {
  added: Accession[];
  renumbered: Array<{ line: number; given: string; got: string }>;
  /** The row that could not be written, and why; `line` is null when it stopped before the first plant. */
  failed: { line: number | null; error: string } | null;
  /** The rows written whole, by key: after a failure the page keeps the rest for a second try. */
  doneKeys: string[];
  /** A row of several plants stopped partway: how many of its plants were written (the page keeps the rest of the row). */
  partial: { key: string; written: number } | null;
  placesMade: number;
  /** The last watering given for the whole sheet: how many lines were written, and whether that write failed. */
  watered: { lines: number; failed: string | null } | null;
  ms: number;
}

/** The fields one row files, as the add form files them. */
export function recordOf(row: ImportRow, check: NameCheck | undefined, placeId: string | null) {
  const p = parseName(row.name);
  const cultivar = row.cultivar ?? p.cultivar ?? null;
  const nameKind = row.nameKind ?? (p.kind === 'hybrid' ? 'hybrid' : cultivar ? (p.epithet ? 'cultivar' : 'hybrid') : 'species');
  const taxonKey = check?.s === 'found' ? check.key : null;
  return {
    taxonName: p.scientific,
    taxonKey,
    cultivar,
    nameKind,
    parentage: nameKind === 'hybrid' ? (row.parentage ?? p.parentage ?? null) : null,
    // "Mammillaria theresae (white flower)": the part in brackets is not the name, and not thrown away either; the name as
    // the sheet gave it is kept whole (round sixty-one; the grower review, 3).
    nameAsReceived: row.nameAsReceived ?? (p.aside ? row.name.trim() : null),
    fieldNumber: row.fieldNumber,
    provenance: (row.provenance ?? 'unknown') as Provenance,
    status: row.status,
    acquired: row.acquired,
    sourceFrom: row.source,
    sourceRef: row.lot,
    sourceForm: row.form,
    price: row.price,
    locationId: placeId,
    notes: row.notes
  };
}

/** The year the collection itself mints for when it is given no number: the date's, written in full or to the month, else this year. */
const mintYear = (acquired: string | null, thisYear: number) => (acquired && /^\d{4}-/.test(acquired) ? Number(acquired.slice(0, 4)) : thisYear);
const yearOfNo = (no: string) => /^(\d{4})-\d+$/.exec(no)?.[1];

export async function commitImport(rows: ImportRow[], checks: Map<string, NameCheck>, plan: NumberPlan, opts: { makePlaces: boolean; onProgress?: (done: number, total: number) => void; lastWatered?: string | null; thisYear?: number }): Promise<ImportResult> {
  const t0 = performance.now();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const todo = plan.order.map((k) => byKey.get(k)!).filter((r) => r && !r.drop);
  const result: ImportResult = { added: [], renumbered: [], failed: null, doneKeys: [], partial: null, placesMade: 0, watered: null, ms: 0 };
  const stop = (line: number | null, e: unknown) => { result.failed = { line, error: collection.lastWriteError ?? (e instanceof Error ? e.message : String(e)) }; result.ms = Math.round(performance.now() - t0); return result; };
  // Places by path: those already here, then those made, parents first.
  const pathIds = new Map<string, string | null>();
  const node = () => collection.locations.map((l) => ({ id: l.id, name: l.name, parentId: (collection.locationPath(l.id).at(-2)?.id ?? null) as string | null }));
  try {
    for (const r of todo) {
      if (!r.placePath || pathIds.has(r.placePath)) continue;
      let hit = resolvePlace(r.placePath, node());
      if (!('id' in hit) && hit.make.length && opts.makePlaces) {
        let parent = hit.under;
        for (const name of hit.make) {
          const made = await collection.addLocation({ name, parentId: parent });
          result.placesMade++;
          parent = made.id;
        }
        hit = { id: parent! };
      }
      pathIds.set(r.placePath, 'id' in hit ? hit.id : null);
    }
    // The species records the add form makes for each new name, in one commit.
    const taxa = new Map<string, { name: string; gbifKey: number | null }>();
    for (const r of todo) {
      const rec = recordOf(r, checks.get(checkKey(r.name)), null);
      const slug = speciesSlug(rec.taxonName);
      if (slug && !collection.taxon(slug) && !taxa.has(slug)) taxa.set(slug, { name: speciesOf(rec.taxonName), gbifKey: rec.taxonKey });
    }
    if (taxa.size) {
      const [first, ...rest] = [...taxa.entries()];
      await collection.putWith('taxon', first[0], first[1], [], rest.map(([id, fields]) => ({ kind: 'taxon' as const, id, fields })));
    }
  } catch (e) {
    // Nothing of a plant was written; what was made is said with the stop (the places stay: they are places, and a second try finds them).
    return stop(null, e);
  }
  const thisYear = opts.thisYear ?? new Date().getFullYear();
  let done = 0;
  for (const r of todo) {
    const placeId = r.placeId ?? (r.placePath ? (pathIds.get(r.placePath) ?? null) : null);
    const rec = recordOf(r, checks.get(checkKey(r.name)), placeId);
    const planned = plan.byRow.get(r.key);
    const numbers = planned?.numbers ?? [];
    // One commit for the row when the collection would mint the row's later numbers for the same year as the plan; one
    // per plant otherwise (a year-only or unread date: the collection mints those for this year).
    const perPlant = r.qty > 1 && numbers.slice(1).some((n) => { const y = yearOfNo(n); return y !== undefined && Number(y) !== mintYear(r.acquired, thisYear); });
    let written = 0;
    try {
      const made: Accession[] = [];
      // Taken since the review list was drawn (another tab, a pull): the next free number, said. Looked up first, so a
      // number already known to be taken is not offered to the vault only to be refused.
      const instead = async (n: number, acc: string) => {
        const got = await collection.addAccessions(n, rec);
        result.renumbered.push({ line: r.line, given: acc, got: accNo(got[0]) });
        return got;
      };
      const one = async (n: number, acc: string | undefined) => {
        if (acc && collection.isNumberTaken(acc)) return instead(n, acc);
        try {
          return await collection.addAccessions(n, { ...rec, acc });
        } catch (e) {
          if (!acc || !collection.isNumberTaken(acc)) throw e;
          return instead(n, acc);
        }
      };
      if (perPlant) for (const n of numbers) { const got = await one(1, n); made.push(...got); result.added.push(...got); written++; }
      else { made.push(...(await one(r.qty, numbers[0]))); result.added.push(...made); }
      result.doneKeys.push(r.key);
      if (planned && !planned.kept && planned.given) result.renumbered.push({ line: r.line, given: planned.given, got: accNo(made[0]) });
    } catch (e) {
      if (written) result.partial = { key: r.key, written };
      stop(r.line, e);
      break;
    }
    opts.onProgress?.(++done, todo.length);
  }
  // The last watering the grower gave for the whole sheet: one line per plant, as Water writes it, in one commit after the plants exist (as the add form does).
  if (opts.lastWatered && result.added.length) {
    try {
      const ids = await collection.addEventsIds(result.added.map((a) => ({ acc: a.id, d: opts.lastWatered!, t: 'water' as const, note: 'as given when the plant was imported' })));
      result.watered = { lines: ids.length, failed: null };
    } catch (e) {
      result.watered = { lines: 0, failed: collection.lastWriteError ?? (e instanceof Error ? e.message : String(e)) };
    }
  }
  result.ms = Math.round(performance.now() - t0);
  return result;
}

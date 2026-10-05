/**
 * Writing an import (round sixty; the grower review's 2): the places the grower agreed to make, the species records the
 * add form would make, then each row through the collection's own `addAccessions`, one commit per row (a row of three is
 * three plants in one commit, as the add form's "How many" is). An import is only more ordinary changes: nothing new for
 * the fold, sync or a backup. A row whose kept number was taken meanwhile (another tab) gets the next free one and says so.
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
  failed: { line: number; error: string } | null;
  /** The rows written, by key: after a failure the page keeps the rest for a second try. */
  doneKeys: string[];
  placesMade: number;
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
    nameAsReceived: row.nameAsReceived,
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

export async function commitImport(rows: ImportRow[], checks: Map<string, NameCheck>, plan: NumberPlan, opts: { makePlaces: boolean; onProgress?: (done: number, total: number) => void }): Promise<ImportResult> {
  const t0 = performance.now();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const todo = plan.order.map((k) => byKey.get(k)!).filter((r) => r && !r.drop);
  const result: ImportResult = { added: [], renumbered: [], failed: null, doneKeys: [], placesMade: 0, ms: 0 };
  // Places by path: those already here, then those made, parents first.
  const pathIds = new Map<string, string | null>();
  const node = () => collection.locations.map((l) => ({ id: l.id, name: l.name, parentId: (collection.locationPath(l.id).at(-2)?.id ?? null) as string | null }));
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
  let done = 0;
  for (const r of todo) {
    const placeId = r.placeId ?? (r.placePath ? (pathIds.get(r.placePath) ?? null) : null);
    const rec = recordOf(r, checks.get(checkKey(r.name)), placeId);
    const keep = plan.byRow.get(r.key);
    const acc = keep?.kept ? keep.numbers[0] : undefined;
    try {
      let made: Accession[];
      try {
        made = await collection.addAccessions(r.qty, { ...rec, acc });
      } catch (e) {
        // Taken since the review list was drawn (another tab, a pull): the next free number, said.
        if (!acc || !collection.isNumberTaken(acc)) throw e;
        made = await collection.addAccessions(r.qty, rec);
        result.renumbered.push({ line: r.line, given: acc, got: accNo(made[0]) });
      }
      result.added.push(...made);
      result.doneKeys.push(r.key);
      if (keep && !keep.kept && keep.given) result.renumbered.push({ line: r.line, given: keep.given, got: accNo(made[0]) });
    } catch (e) {
      result.failed = { line: r.line, error: collection.lastWriteError ?? (e instanceof Error ? e.message : String(e)) };
      break;
    }
    opts.onProgress?.(++done, todo.length);
  }
  result.ms = Math.round(performance.now() - t0);
  return result;
}

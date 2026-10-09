/**
 * Writing an import (round sixty; the grower review's 2): the places the grower agreed to make, the species records the
 * add form would make, then the rows through the collection's own `addAccessions`, in groups of up to 50 plants, one
 * commit each (a row of three is three plants in one commit, as the add form's "How many" is; round sixty-two groups the
 * rows, see below). An import is only more ordinary changes: nothing new for
 * the fold, sync or a backup. Each plant gets the number the review showed (the plan, frozen while this runs); a number
 * taken meanwhile (another tab) gets the next free one and says so. A failure before the first plant (making the places
 * or the species records) is caught and said with what was made; the page then keeps every row (round sixty-one; the
 * records review, 8).
 */
import { collection } from '$lib/db/collection.svelte';
import { accNo, type Accession, type Provenance } from '$lib/db/types';
import { parseName, speciesOf, speciesSlug, tidyName } from '$core/names';
import type { NameCheck } from './check';
import { checkKey } from './check';
import { resolvePlace, type ImportRow, type NumberPlan } from './plan';
import { cleanName } from './rows';

export interface ImportResult {
  added: Accession[];
  renumbered: Array<{ line: number; given: string; got: string }>;
  /** The row that could not be written, and why; `line` is null when it stopped before the first plant. */
  failed: { line: number | null; error: string } | null;
  /** The rows written whole, by key: after a failure the page keeps the rest for a second try. */
  doneKeys: string[];
  /**
   * Lines another tab imported after this review was drawn, found by their import keys when the plants were about to be
   * written, and left out: the line and how many of its plants were here already (all of them, or some, the rest added).
   */
  alreadyHere: Array<{ line: number; plants: number; whole: boolean }>;
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
  const taxonKey = check?.s === 'found' && !p.qualifier ? check.key : null; // a key would say the plant is that species, which "cf." or "nr." says it may not be
  return {
    taxonName: p.scientific,
    taxonKey,
    cultivar,
    nameKind,
    parentage: nameKind === 'hybrid' ? (row.parentage ?? p.parentage ?? null) : null,
    // "Mammillaria theresae (white flower)": the part in brackets is not the name, and not thrown away either; the name as
    // the sheet gave it is kept whole (round sixty-one; the grower review, 3). So is any name the plant is filed under
    // other than the sheet's: a "Use it", an edit in the review, a word the reader left out ("Mammillaria ssp.
    // bombycina") (round sixty-two; the records review, 2 and 3).
    nameAsReceived: row.nameAsReceived ?? receivedAs(row.originalName ?? row.name, p.scientific, cultivar, !!p.aside),
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

/** A name as compared: its quotes one way, "cv." and its case and spacing set aside. */
const nameText = (s: string) => tidyName(s).replace(/[‘’"]/g, "'").replace(/\bcv\.?\s+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
/** The sheet's text, when the plant is filed under another name; null when it is filed as the sheet wrote it. */
function receivedAs(sheet: string, scientific: string, cultivar: string | null, aside: boolean): string | null {
  const t = sheet.trim();
  if (!t) return null;
  if (aside) return t;
  // A cell the import had to clean (a soft hyphen, a zero-width space, full-width letters) keeps its text as received: the
  // name compare below cleans both sides alike since round sixty-two's second pass, and kept nothing (the merge). A byte
  // order mark or a no-break space is only trimming, and keeps nothing.
  const plain = (s: string) => s.replace(/^\ufeff/, '').replace(/\s+/g, ' ').trim();
  if (plain(t) !== cleanName(t)) return t;
  const filed = `${scientific}${cultivar ? ` '${cultivar}'` : ''}`;
  return nameText(t) === nameText(filed) || nameText(t) === nameText(scientific) ? null : t;
}

/**
 * One import at a time in this browser (round sixty-two, second pass; the verification data review, 4): two tabs
 * importing the same sheet each drew their review before either wrote, and each added every plant, the second under new
 * numbers with the same import keys. Each import now holds this lock while it writes, and inside it first brings this
 * tab's fold up to date with what the other tabs wrote (`current`), then leaves out the plants whose import key is on a
 * plant here (`stillToWrite`), and says so. Without Web Locks it runs as it is.
 */
const IMPORT_LOCK = 'cultifolio-import';
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? (locks.request(IMPORT_LOCK, work) as Promise<T>) : work();
}
/** This tab's fold with every change the other tabs stored, before the import reads which keys are here. */
async function current(): Promise<void> {
  // The collection's catch-up is what its 'written' notice runs; awaited here so nothing another tab wrote is missed.
  const c = collection as unknown as { catchUp?: () => Promise<void> };
  if (typeof c.catchUp === 'function') await c.catchUp();
  else await collection.rebuild();
}
/**
 * The rows still to write, by the import keys on the live plants here now: a row whose every plant is here is left out,
 * a row some of whose plants are here writes only the rest, each with the number the review showed it.
 */
function stillToWrite(rows: ImportRow[], plan: NumberPlan, result: ImportResult): { rows: ImportRow[]; plan: NumberPlan } {
  const here = new Set<string>();
  for (const a of collection.accessions) if (a.importKey) here.add(a.importKey);
  if (!here.size) return { rows, plan };
  const byRow = new Map(plan.byRow);
  const out: ImportRow[] = [];
  for (const r of rows) {
    const keys = r.importKeys ?? [];
    const keep = keys.map((k) => !here.has(k));
    const n = keep.filter((x) => !x).length;
    if (!n || r.drop) { out.push(r); continue; }
    result.alreadyHere.push({ line: r.line, plants: n, whole: n === keys.length });
    if (n === keys.length) { result.doneKeys.push(r.key); continue; }
    const p = plan.byRow.get(r.key);
    // The sheet's own number went with the first plant: when that one is here, the rest are not said as renumbered.
    if (p) byRow.set(r.key, { ...p, numbers: p.numbers.filter((_, i) => keep[i]), kept: p.kept && keep[0], given: keep[0] ? p.given : null });
    out.push({ ...r, qty: keys.length - n, importKeys: keys.filter((_, i) => keep[i]) });
  }
  return { rows: out, plan: { ...plan, byRow } };
}

export function commitImport(rows: ImportRow[], checks: Map<string, NameCheck>, plan: NumberPlan, opts: Parameters<typeof commitNow>[3]): Promise<ImportResult> {
  return oneAtATime(async () => {
    const t0 = performance.now();
    const found = { alreadyHere: [], doneKeys: [] } as unknown as ImportResult;
    try { await current(); } catch { /* the fold as it is: the vault still refuses a number taken */ }
    const still = stillToWrite(rows, plan, found);
    const res = await commitNow(still.rows, checks, still.plan, opts);
    res.alreadyHere = found.alreadyHere;
    res.doneKeys.push(...found.doneKeys); // a line wholly here is done: after a stop, it is not offered again
    res.ms = Math.round(performance.now() - t0);
    return res;
  });
}

async function commitNow(rows: ImportRow[], checks: Map<string, NameCheck>, plan: NumberPlan, opts: { makePlaces: boolean; /** Plants written so far, of all the plants to write. */ onProgress?: (done: number, total: number) => void; lastWatered?: string | null; thisYear?: number; chunk?: number }): Promise<ImportResult> {
  const t0 = performance.now();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const todo = plan.order.map((k) => byKey.get(k)!).filter((r) => r && !r.drop);
  const result: ImportResult = { added: [], renumbered: [], failed: null, doneKeys: [], alreadyHere: [], placesMade: 0, watered: null, ms: 0 };
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
  // Lines are written in groups of up to `chunk` plants, one commit each (round sixty-two; A, decision 3): every commit
  // that gives numbers reads the vault's list of numbers ever given and writes it back whole, so 2,000 commits slowed from
  // about 30 to 10 a second as the list grew; 40 commits do not. A group that fails is written again a line at a time,
  // so the lines before the failure land and the failure names its line; a line cut off with its group is offered
  // again by its import keys.
  const CHUNK = Math.max(1, opts.chunk ?? 50);
  // Progress is counted in plants, as the button that started it ("Add 2667 plants") counts them: it said "37 of 2000"
  // in lines (round sixty-two, second pass; the verification grower review).
  let done = 0;
  const total = todo.reduce((n, r) => n + r.qty, 0);
  const prep = (r: ImportRow) => {
    const placeId = r.placeId ?? (r.placePath ? (pathIds.get(r.placePath) ?? null) : null);
    const planned = plan.byRow.get(r.key);
    return { r, rec: recordOf(r, checks.get(checkKey(r.name)), placeId), planned, numbers: planned?.numbers ?? [] };
  };
  const landed = (c: ReturnType<typeof prep>, made: Accession[]) => {
    result.added.push(...made);
    result.doneKeys.push(c.r.key);
    if (c.planned && !c.planned.kept && c.planned.given) result.renumbered.push({ line: c.r.line, given: c.planned.given, got: accNo(made[0]) });
  };
  let i = 0;
  outer: while (i < todo.length) {
    const group: Array<ReturnType<typeof prep>> = [];
    let plants = 0;
    while (i < todo.length && (!group.length || plants + todo[i].qty <= CHUNK)) { plants += todo[i].qty; group.push(prep(todo[i++])); }
    let whole = false;
    if (group.length > 1) {
      try {
        const each = group.flatMap((c) => plantsOf(c.r, c.rec, c.numbers).map((own) => ({ ...c.rec, ...own })));
        const got = await collection.addAccessions(each.length, group[0].rec, each);
        let k = 0;
        for (const c of group) { landed(c, got.slice(k, k + c.r.qty)); k += c.r.qty; }
        whole = true;
      } catch { /* written again a line at a time, below */ }
    }
    // A line by itself, or a group that failed: a line at a time, where a number taken meanwhile is found and the failure has its line.
    if (!whole) for (const c of group) {
      try { landed(c, await writeRow(c.r, c.rec, c.numbers, result.renumbered)); } catch (e) { stop(c.r.line, e); break outer; }
    }
    done += plants;
    opts.onProgress?.(done, total);
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

/**
 * One line's plants in one commit, each with the number the review showed it and its import key (round sixty-two; the
 * grower review, 2): the collection mints nothing for an import, so the numbers given are the numbers shown, plant by
 * plant. A number taken since the review was drawn (another tab, a pull) is found when the vault refuses it; only then is
 * each number looked up, and a taken one gets the next free number, said in `renumbered`. A line of several plants bought
 * together at one price keeps the price on its first plant; the others say where it is (round sixty-two; the grower
 * review, 8, A39), so the spending summary counts it once.
 */
/** Each plant of a line, its own fields over the line's: its number, its import key, and the price on the first only. */
function plantsOf(r: ImportRow, rec: ReturnType<typeof recordOf>, nos: Array<string | null>): Array<Partial<Accession>> {
  const keys = r.importKeys ?? [];
  return Array.from({ length: r.qty }, (_, i) => {
    const own: Partial<Accession> = { acc: nos[i] ?? null, importKey: keys[i] ?? null };
    if (i > 0 && rec.price) {
      const line = nos[0] ? `Bought with ${nos[0]}, whose record holds the price.` : 'Bought with the first plant of its line, whose record holds the price.';
      Object.assign(own, { price: null, notes: rec.notes ? `${rec.notes}${/\n$/.test(rec.notes) ? '' : '\n'}${line}` : line });
    }
    return own;
  });
}

async function writeRow(r: ImportRow, rec: ReturnType<typeof recordOf>, numbers: string[], renumbered: ImportResult['renumbered']): Promise<Accession[]> {
  const each = (nos: Array<string | null>) => plantsOf(r, rec, nos);
  try {
    return await collection.addAccessions(r.qty, rec, each(numbers));
  } catch (e) {
    const taken = numbers.map((n) => !!n && collection.isNumberTaken(n));
    if (!taken.some(Boolean)) throw e;
    const nos = numbers.map((n, i) => (taken[i] ? null : n));
    const got = await collection.addAccessions(r.qty, rec, each(nos));
    got.forEach((a, i) => { if (taken[i]) renumbered.push({ line: r.line, given: numbers[i], got: accNo(a) }); });
    return got;
  }
}

/**
 * The numbers an import gave, by scheme: "0001 to 0300 and A1 to A95", in number order within each, not a string sort
 * over all of them, which said "0001 to A95" (round sixty-one; the grower review, 10). Three runs are named and the rest
 * counted: "and others" stood for a single plant (round sixty-two, second pass; the verification grower review), so a
 * fourth run is named too, and past that the plants left are counted, "and 5 other plants".
 */
export function numbersSaid(nos: string[]): string {
  const groups = new Map<string, string[]>();
  for (const no of nos) { const k = no.replace(/\d+$/, ''); const g = groups.get(k); if (g) g.push(no); else groups.set(k, [no]); }
  const runs = [...groups.values()].map((ns) => { ns.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); return { n: ns.length, text: ns.length > 1 ? `${ns[0]} to ${ns[ns.length - 1]}` : ns[0] }; });
  if (runs.length > 4) {
    const rest = runs.slice(3).reduce((n, r) => n + r.n, 0);
    return `${runs.slice(0, 3).map((r) => r.text).join(', ')} and ${rest} other plant${rest === 1 ? '' : 's'}`;
  }
  return runs.length > 1 ? `${runs.slice(0, -1).map((r) => r.text).join(', ')} and ${runs.at(-1)!.text}` : (runs[0]?.text ?? '');
}

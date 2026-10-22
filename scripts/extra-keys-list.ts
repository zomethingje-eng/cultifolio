/**
 * `--list-extra-keys --bulk <dir> --backbone <simple.txt.gz>` (round seventy-three): every page's extra GBIF keys by the
 * rule (`src/lib/dossier/extra-keys.ts`), read from Kew's names file and GBIF's backbone export, offline. Node only; the
 * rule is the pure module's, and the tests run it on rows. Kew's file is read in passes that keep only the rows the rule
 * reads (the whole file held as rows is over two gigabytes): each page's entry is its `name.kew.entry` (`--fill kew-names`).
 */
import { scan } from './kew-names-load';
import { loadBackbone } from './backbone-load';
import { KewNamesIndex, words, type KewRow } from '../src/lib/dossier/kew-names';
import { extraKeysFor, noKeyFor, kewForm, mergeKeys, mergeTarget, mergedExcept, type ExtraKey, type Refused, type Merge, type NoKeyReading } from '../src/lib/dossier/extra-keys';
import { slugify } from '../src/lib/core/names';

/** A page: its GBIF key, or (round seventy-nine) none and its id `k<plant_name_id>`; its Kew entry. */
type Page = { key: number | null; id?: string; name: { scientific: string; kew?: { entry: string } } };
/** A row's text copied out of the line it was split from, so a kept row does not keep the whole line alive. */
const own = (s: string) => Buffer.from(s, 'utf8').toString('utf8');
const kept = (r: KewRow): KewRow => ({ id: own(r.id), name: own(r.name), authors: own(r.authors), status: own(r.status), rank: own(r.rank), accepted: own(r.accepted), parent: own(r.parent), powo: '', ...(r.homotypic ? { homotypic: true } : {}) });

export async function listExtraKeys(o: { bulk: string; backbone: string; pages: Page[]; merges: Merge[]; reference?: ReadonlySet<number> }): Promise<{ keys: ExtraKey[]; refused: Refused[]; pages: number; usages: number; noEntry: number; none: NoKeyReading[] } | null> {
  const csv = `${o.bulk}/wcvp_names.csv`;
  const away = new Set(o.merges.map((m) => m.from));
  const pages = o.pages.filter((p) => p.key == null || !away.has(p.key));
  const entries = new Set(pages.map((p) => p.name.kew?.entry ?? '').filter(Boolean));
  console.log(`Reading Kew's rows for the ${entries.size} entries of ${pages.length} pages from ${csv}…`);
  // The plant: the entries, the species of an entry below species, the taxa Kew accepts under those, and every name filed under them.
  const up = new Set(entries);
  await scan(csv, (r) => entries.has(r.id) && r.rank !== 'Species' && !!r.parent, (r) => up.add(r.parent));
  const children = new Set<string>();
  await scan(csv, (r) => r.status === 'Accepted' && up.has(r.parent) && r.rank !== 'Species', (r) => children.add(r.id));
  const plant = new Set([...up, ...children]);
  const wanted = new Set<string>();
  await scan(csv, (r) => plant.has(r.id) || (!!r.accepted && plant.has(r.accepted)), (r) => wanted.add(words(r.name)));
  for (const n of [...wanted]) { const w = n.split(' '); if (w.length === 2) for (const m of ['subsp.', 'var.', 'f.']) wanted.add(`${w[0]} ${w[1]} ${m} ${w[1]}`); }
  // Every row of those words, so a usage's author is read against all of them, not the plant's alone.
  const idx = new KewNamesIndex();
  await scan(csv, (r) => wanted.has(words(r.name)) || plant.has(r.id), (r) => idx.add(kept(r)));
  console.log(`  ${wanted.size} names, ${idx.byId.size} of Kew's rows`);
  console.log(`Reading GBIF's backbone from ${o.backbone}…`);
  const bb = await loadBackbone(o.backbone, wanted);
  if (!bb) return null;
  // The reference's page keys: the pages' own, or (round seventy-nine) those given, the keys of the whole species list.
  const reference = new Set(o.reference ?? pages.flatMap((p) => (p.key != null ? [p.key] : [])));
  const holders = new Map<number, number[]>();
  for (const k of reference) for (const a of bb.lineage(k).slice(1)) holders.set(a, [...(holders.get(a) ?? []), k]);
  const merged = new Map(o.merges.map((m) => [m.from, slugify(m.name)]));
  const into = new Map(o.merges.map((m) => [m.from, mergeTarget(m)]));
  const run = () => pages.map((p) => extraKeysFor({ key: p.key, entry: p.name.kew?.entry ?? '', ...(p.id ? { id: p.id } : {}) }, idx, bb, reference, holders, merged, into));
  // First without what GBIF files under each candidate; then that is read, with Kew's rows of its words, and the rule run again.
  // The merged keys too (round eighty, A): each is read by the page it joins whatever the rule makes of it.
  const candidates = new Set([...run().flatMap((r) => r.keys.map((k) => k.key)), ...o.merges.map((m) => m.from)]);
  console.log(`  ${candidates.size} candidate keys; reading what GBIF files under them…`);
  await bb.readUnder(candidates);
  const more = new Set<string>();
  for (const k of candidates) for (const u of bb.under!(k)) { const w = kewForm(u); if (w && !wanted.has(w)) more.add(w); }
  if (more.size) await scan(csv, (r) => more.has(words(r.name)), (r) => idx.add(kept(r)));
  const all = run();
  // A merge the rule gave no line is read all the same (round eighty, A; X's need): the owner's decision is the claim.
  const entryOf = new Map(pages.flatMap((p) => [[String(p.key ?? p.id), p.name.kew?.entry ?? ''] as const]));
  // Only for a page of this listing (the merge, round eighty): `scripts/kew-extra-keys.ts` lists the pages without a GBIF
  // key, and a merge into a keyed page is not one of its lines (the build adds every merge's line itself).
  const listed = new Set(pages.map((p) => String(p.key ?? p.id)));
  const forced = mergeKeys(o.merges, all.flatMap((r) => r.keys), slugify, (k) => bb.usage(k), (m) => { const e = entryOf.get(String(mergeTarget(m))); return e ? mergedExcept(m.from, e, idx, bb) : []; }).filter((k) => listed.has(k.pageId ?? String(k.page)));
  if (forced.length) console.log(`  ${forced.length} merged key${forced.length === 1 ? '' : 's'} the rule gave no line, read by the page each joins (the owner's merges): ${forced.map((k) => `${k.key} into ${k.pageId ?? k.page}`).join(', ')}`);
  // Round eighty (R): why each page without a GBIF key that the rule gives no key reads none, by the same rule's steps
  // (a page that reads a merged key, A's `forced`, reads a key, so it is not one of them; M).
  const forcedPages = new Set(forced.flatMap((k) => (k.pageId ? [k.pageId] : [])));
  const none = pages.flatMap((p, i) => (p.key == null && p.id && !all[i].keys.length && !forcedPages.has(p.id) ? [noKeyFor({ key: null, entry: p.name.kew?.entry ?? '', id: p.id }, idx, bb, reference, holders, merged, into)] : [])).filter((x): x is NoKeyReading => !!x);
  return { keys: [...all.flatMap((r) => r.keys), ...forced], refused: all.flatMap((r) => r.refused), pages: pages.length, usages: bb.size, noEntry: pages.filter((p) => !p.name.kew?.entry).length, none };
}

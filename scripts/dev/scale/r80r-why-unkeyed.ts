/**
 * Round eighty (R), a dev measure: why the pages without a GBIF key that `scripts/extra-keys-kew.txt` gives no key read
 * none. The same rule as `scripts/kew-extra-keys.ts` (`extraKeysFor`, round seventy-three's, the same Kew rows and
 * backbone usages read), run again with every usage of every name of the plant traced: taken, refused (and the rule's
 * why), or passed by in silence (Kew holds no row of its words, only by another author, or as another plant). Offline.
 *
 *   npx tsx scripts/dev/scale/r80r-why-unkeyed.ts --bulk <dir with wcvp_names.csv> --backbone <simple.txt.gz> --out <dir>
 *
 * Writes `<out>/why-unkeyed.tsv` (a line a usage of a page that read no key), `<out>/why-unkeyed-pages.tsv` (a line a
 * page: its class and its first examples) and `<out>/why-unkeyed.json` (the counts).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { scan } from '../../kew-names-load';
import { loadBackbone } from '../../backbone-load';
import { KewNamesIndex, words, type KewRow } from '../../../src/lib/dossier/kew-names';
import { extraKeysFor, kewForm, kewReading, plantOf, ofPlant, elsewhere, typeWhy, parseExtraKeys, parseMerges, type Usage } from '../../../src/lib/dossier/extra-keys';
import { parseSpeciesList } from '../../select-species-lib';

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const bulk = arg('--bulk')!, backbone = arg('--backbone')!, out = arg('--out')!;
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const list = parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8'));
const keyless = list.filter((e) => e.gbifKey == null && e.kewId);
const keyed = new Set(parseExtraKeys(readFileSync('scripts/extra-keys-kew.txt', 'utf8')).map((k) => k.pageId));
const pages = keyless.filter((e) => !keyed.has(e.pageId));
console.log(`${keyless.length} keyless pages, ${keyed.size} read keys, ${pages.length} read none`);
const reference = new Set(list.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : [])));
const byKey = new Map(list.flatMap((e) => (e.gbifKey != null ? [[e.gbifKey, e] as const] : [])));
const csv = `${bulk}/wcvp_names.csv`;
const own = (s: string) => Buffer.from(s, 'utf8').toString('utf8');
const kept = (r: KewRow): KewRow => ({ id: own(r.id), name: own(r.name), authors: own(r.authors), status: own(r.status), rank: own(r.rank), accepted: own(r.accepted), parent: own(r.parent), powo: '', ...(r.homotypic ? { homotypic: true } : {}) });

// The same reading as listExtraKeys, for every keyless page (so `wanted` and the index are the same as the rule's), plus the
// Kew rows of the reference pages GBIF files these under (their entries), to say what Kew holds them as.
const entries = new Set(keyless.map((e) => e.kewId!));
const up = new Set(entries);
await scan(csv, (r) => entries.has(r.id) && r.rank !== 'Species' && !!r.parent, (r) => up.add(r.parent));
const children = new Set<string>();
await scan(csv, (r) => r.status === 'Accepted' && up.has(r.parent) && r.rank !== 'Species', (r) => children.add(r.id));
const plant = new Set([...up, ...children]);
const wanted = new Set<string>();
await scan(csv, (r) => plant.has(r.id) || (!!r.accepted && plant.has(r.accepted)), (r) => wanted.add(words(r.name)));
for (const n of [...wanted]) { const w = n.split(' '); if (w.length === 2) for (const m of ['subsp.', 'var.', 'f.']) wanted.add(`${w[0]} ${w[1]} ${m} ${w[1]}`); }
const idx = new KewNamesIndex();
const refIds = new Set(list.flatMap((e) => (e.gbifKey != null && e.kewId ? [e.kewId] : [])));
const refRows = new Map<string, KewRow>();
await scan(csv, (r) => wanted.has(words(r.name)) || plant.has(r.id) || refIds.has(r.id), (r) => { if (refIds.has(r.id)) refRows.set(r.id, kept(r)); if (wanted.has(words(r.name)) || plant.has(r.id)) idx.add(kept(r)); });
console.log(`  ${wanted.size} names, ${idx.byId.size} of Kew's rows`);
const bb = (await loadBackbone(backbone, wanted))!;
const holders = new Map<number, number[]>();
for (const k of reference) for (const a of bb.lineage(k).slice(1)) holders.set(a, [...(holders.get(a) ?? []), k]);
const merges = parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8'));
const merged = new Map(merges.map((m) => [m.from, m.name]));
const into = new Map(merges.map((m) => [m.from, m.into]));
// The rule needs what GBIF files under each candidate; the 912 have no candidate, but the second pass is the rule's, so run it.
const run1 = keyless.map((e) => extraKeysFor({ key: null, entry: e.kewId!, id: e.pageId }, idx, bb, reference, holders, merged, into));
const candidates = new Set(run1.flatMap((r) => r.keys.map((k) => k.key)));
await bb.readUnder(candidates);

type Trace = { page: string; pageName: string; name: string; key: number; label: string; status: string; rank: string; verdict: string; why: string; holder?: number; holderName?: string; holderKew?: string; kewRow?: string };
const traces: Trace[] = [];
const pageClass = new Map<string, { cls: string; ex: string[] }>();
const lbl = (r: KewRow) => `${r.name}${r.authors ? ` ${r.authors}` : ''}`;
let mismatchTaken = 0;
for (const e of pages) {
  const r = extraKeysFor({ key: null, entry: e.kewId!, id: e.pageId }, idx, bb, reference, holders, merged, into);
  if (r.keys.length) mismatchTaken++;
  const refused = new Map(r.refused.map((x) => [x.key, x.why]));
  const pl = plantOf(e.kewId!, idx);
  const names = new Set<string>();
  for (const id of pl) { const x = idx.byId.get(id); if (x) names.add(words(x.name)); for (const s of idx.under.get(id) ?? []) if (s.status !== 'Misapplied') names.add(words(s.name)); }
  for (const n of [...names]) { const w = n.split(' '); if (w.length === 2) for (const m of ['subsp.', 'var.', 'f.']) names.add(`${w[0]} ${w[1]} ${m} ${w[1]}`); }
  const seen = new Set<number>();
  const mine: Trace[] = [];
  for (const n of [...names].sort()) for (const u of bb.usagesOf(n)) {
    if (seen.has(u.key)) continue;
    seen.add(u.key);
    const t: Trace = { page: e.pageId, pageName: `${e.name} ${e.author}`, name: n, key: u.key, label: u.label, status: u.status, rank: u.rank, verdict: '', why: '' };
    const read = kewReading(u, idx, (k) => bb.usage(k));
    if (!read.rows.length) { t.verdict = 'silent-reading'; t.why = 'why' in read ? read.why : ''; }
    else {
      const m = read.rows.filter((x) => ofPlant(x, pl)), o = read.rows.filter((x) => elsewhere(x, pl));
      t.kewRow = read.rows.map((x) => `${lbl(x)} [${x.id} ${x.status}${x.homotypic ? ' homotypic' : ''}]`).join('; ');
      if (!m.length) { t.verdict = 'silent-other-plant'; t.why = `Kew reads it as ${read.rows.map(lbl).join('; ')}, another plant's`; }
      else if (refused.has(u.key)) {
        t.verdict = 'refused'; t.why = refused.get(u.key)!;
        const at = bb.lineage(u.key).find((k) => reference.has(k));
        if (at !== undefined) { t.holder = at; const h = byKey.get(at)!; t.holderName = `${h.name} ${h.author}`; const kr = h.kewId ? refRows.get(h.kewId) : undefined; t.holderKew = kr ? `${lbl(kr)} [${kr.id} ${kr.status}]` : (h.kewId ?? '-'); }
        const ty = typeWhy(m[0], e.kewId!, idx);
        t.verdict += ty ? '-othertype' : '-owntype';
      } else { t.verdict = 'taken?'; }
    }
    mine.push(t);
  }
  traces.push(...mine);
  // The page's class: the strongest reason among its usages.
  const v = (p: (t: Trace) => boolean) => mine.filter(p);
  const lumpOwn = v((t) => t.verdict === 'refused-owntype' && /another page of this reference/.test(t.why));
  const lumpAny = v((t) => /another page of this reference/.test(t.why));
  const holdsOther = v((t) => /GBIF files another page of this reference under it/.test(t.why));
  const pp = v((t) => /pro parte/.test(t.why));
  const het = v((t) => /^heterotypic|another type below/.test(t.why));
  const both = v((t) => /another plant's$/.test(t.why) && t.verdict.startsWith('refused'));
  const author = v((t) => t.verdict === 'silent-reading' && /another author|no author/.test(t.why));
  const otherPlant = v((t) => t.verdict === 'silent-other-plant');
  const rank = v((t) => t.verdict === 'silent-reading' && /a rank|autonym/.test(t.why));
  let cls: string, ex: Trace[];
  if (lumpOwn.length) { cls = 'lumped-own'; ex = lumpOwn; }
  else if (lumpAny.length) { cls = 'lumped-other-type'; ex = lumpAny; }
  else if (holdsOther.length) { cls = 'holds-another-page'; ex = holdsOther; }
  else if (pp.length) { cls = 'pro-parte'; ex = pp; }
  else if (both.length) { cls = 'two-plants'; ex = both; }
  else if (het.length) { cls = 'heterotypic-only'; ex = het; }
  else if (author.length) { cls = 'author-differs'; ex = author; }
  else if (otherPlant.length) { cls = 'other-plant-same-words'; ex = otherPlant; }
  else if (rank.length) { cls = 'rank-or-autonym'; ex = rank; }
  else if (mine.length) { cls = 'other'; ex = mine; }
  else { cls = 'no-usage'; ex = []; }
  pageClass.set(e.pageId, { cls, ex: ex.slice(0, 3).map((t) => `${t.label} [${t.key} ${t.status}]: ${t.why}${t.holderName ? ` → ${t.holderName} (Kew: ${t.holderKew})` : ''}${t.kewRow ? ` {Kew: ${t.kewRow}}` : ''}`) });
}
const tsv = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n') + '\n';
writeFileSync(`${out}/why-unkeyed.tsv`, tsv([['page', 'page name', 'words', 'key', 'GBIF name', 'status', 'rank', 'verdict', 'why', 'holder key', 'holder name', 'holder Kew row', 'Kew rows'], ...traces.map((t) => [t.page, t.pageName, t.name, String(t.key), t.label, t.status, t.rank, t.verdict, t.why, String(t.holder ?? ''), t.holderName ?? '', t.holderKew ?? '', t.kewRow ?? ''])]));
writeFileSync(`${out}/why-unkeyed-pages.tsv`, tsv(pages.map((e) => [e.pageId, `${e.name} ${e.author}`, e.family, pageClass.get(e.pageId)!.cls, ...pageClass.get(e.pageId)!.ex])));
const counts: Record<string, number> = {};
for (const { cls } of pageClass.values()) counts[cls] = (counts[cls] ?? 0) + 1;
writeFileSync(`${out}/why-unkeyed.json`, JSON.stringify({ pages: pages.length, counts, takenNow: mismatchTaken, usages: traces.length, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
console.log(JSON.stringify({ pages: pages.length, counts, takenNow: mismatchTaken }));

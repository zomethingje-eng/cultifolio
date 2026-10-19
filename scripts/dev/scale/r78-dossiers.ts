/**
 * Round seventy-eight's proof that rekeying the corpus changes nothing but the ids (`--rekey`; src/lib/dossier/rekey.ts):
 * for every dossier of the version 2 corpus, the dossier of version 3 that holds its GBIF key
 *   - has the id the rule gives, worked out here again from the version 2 files alone: `k<Kew entry>` where the entry is
 *     a plant_name_id no other page holds (a page merged away by scripts/merged-pages.txt holds none), else `g<GBIF key>`;
 *   - is the same document but for its id fields: the version, `key`, each photograph's `shared` and the range's
 *     `via.page` (the other pages, named by id, which are the pages the version 2 file named by GBIF key), and the stamp's
 *     fingerprint, whose day is the same and which is current exactly where it was;
 * and the index lists the same species in the same order with the same fields, each page's id and GBIF key, and its
 * nearest climates by id. Nothing is left over in either folder.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r78-dossiers.ts <s/v2 dir> <s/v3 dir> [merged-pages.txt]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { substanceHash } from '$dossier/changed';

const [v2, v3, mergesFile = 'scripts/merged-pages.txt'] = process.argv.slice(2);
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
type Doc = { v: number; key: unknown; ids: { gbif: number }; name: { scientific: string; kew?: { entry?: string } }; distribution: { via?: { page?: string } }; photos: Array<{ shared?: unknown[] }>; changed?: { on: string; h: string } };
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Doc;
const merges = existsSync(mergesFile) ? readFileSync(mergesFile, 'utf8').split('\n').filter((l) => /^\d/.test(l)).map((l) => l.split('\t').map(Number)) : [];

const before = readdirSync(v2).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(`${v2}/${f}`));
const after = new Map<number, { file: string; d: Doc }>();
for (const f of readdirSync(v3).filter((x) => /^[kg]\d+\.json$/.test(x))) { const d = read(`${v3}/${f}`); after.set(d.ids.gbif, { file: f, d }); }

// The rule, again, from the version 2 files.
const present = new Set(before.map((d) => d.key as number));
const away = new Map(merges.filter(([from, into]) => present.has(into)).map(([from, into]) => [from, into]));
const holders = new Map<string, number>();
for (const d of before) { const e = d.name.kew?.entry; if (e && /^[1-9]\d*$/.test(e) && !away.has(d.key as number)) holders.set(e, (holders.get(e) ?? 0) + 1); }
const idOf = new Map(before.map((d) => { const e = d.name.kew?.entry; return [d.key as number, e && /^[1-9]\d*$/.test(e) && !away.has(d.key as number) && holders.get(e) === 1 ? `k${e}` : `g${d.key}`]; }));

const bare = (d: Doc) => {
  const o = structuredClone(d) as Partial<Doc> & Record<string, unknown>;
  delete o.v; delete o.key;
  if (o.changed) delete (o.changed as Partial<Doc['changed']> & object).h;
  if (o.distribution?.via) delete o.distribution.via.page;
  for (const p of o.photos ?? []) delete p.shared;
  return o;
};
const t = { pages: before.length, found: 0, id: 0, file: 0, version: 0, same: 0, shared: 0, sharedRefs: 0, via: 0, viaRefs: 0, day: 0, stamp: 0, currentBefore: 0, kew: 0, gbif: 0 };
const diffs: string[] = [];
const say = (s: string) => { if (diffs.length < 20) diffs.push(s); };
for (const d of before) {
  const g = d.key as number;
  const got = after.get(g);
  if (!got) { say(`${g} ${d.name.scientific}: no version 3 dossier holds its GBIF key`); continue; }
  t.found++;
  const n = got.d;
  const want = idOf.get(g)!;
  if (want.startsWith('k')) t.kew++; else t.gbif++;
  if (n.key === want) t.id++; else say(`${g} ${d.name.scientific}: id ${String(n.key)}, the rule gives ${want}`);
  if (got.file === `${want}.json`) t.file++; else say(`${g}: stored as ${got.file}`);
  if (n.v === 3 && d.v === 2) t.version++;
  if (isDeepStrictEqual(bare(d), bare(n))) t.same++; else say(`${g} ${d.name.scientific}: differs apart from its ids`);
  const was = d.photos.map((p) => (p.shared ?? []).map((x) => idOf.get(x as number) ?? `g${x}`).sort());
  const now = n.photos.map((p) => ((p.shared ?? []) as string[]).slice().sort());
  t.sharedRefs += was.flat().length;
  if (isDeepStrictEqual(was, now)) t.shared++; else say(`${g}: shared ${JSON.stringify(now)}, was ${JSON.stringify(was)}`);
  const vp = d.distribution.via?.page;
  if (vp) t.viaRefs++;
  if ((vp ? idOf.get(Number(vp)) ?? `g${vp}` : undefined) === n.distribution.via?.page) t.via++; else say(`${g}: via.page ${n.distribution.via?.page}, was ${vp}`);
  if (d.changed?.on === n.changed?.on) t.day++; else say(`${g}: stamp day ${n.changed?.on}, was ${d.changed?.on}`);
  const cur = (x: Doc) => !!x.changed && x.changed.h === substanceHash(x, sha1);
  if (cur(d)) t.currentBefore++;
  if (cur(d) === cur(n)) t.stamp++; else say(`${g}: stamp current ${cur(n)}, was ${cur(d)}`);
}
const extra = [...after.keys()].filter((g) => !present.has(g));
if (extra.length) say(`${extra.length} version 3 dossiers hold a GBIF key no version 2 dossier held: ${extra.slice(0, 5).join(', ')}`);

// The index: the same species, in the same order, with the same fields but the ids.
const i2 = JSON.parse(readFileSync(`${v2}/index.json`, 'utf8')) as Array<Record<string, unknown>>;
const i3 = JSON.parse(readFileSync(`${v3}/index.json`, 'utf8')) as Array<Record<string, unknown>>;
let entries = 0, near = 0;
if (i2.length !== i3.length) say(`index: ${i3.length} entries, was ${i2.length}`);
i2.forEach((a, i) => {
  const b = i3[i];
  if (!b) return;
  const { key: ka, near: na, ...ra } = a;
  const { key: kb, gbif, near: nb, ...rb } = b;
  if (kb === idOf.get(ka as number) && gbif === ka && isDeepStrictEqual(ra, rb) && JSON.stringify(Object.keys(rb)) === JSON.stringify(Object.keys(ra))) entries++; else say(`index ${i} ${String(a.name)}: differs`);
  if (isDeepStrictEqual(((na as number[]) ?? null) && (na as number[]).map((k) => idOf.get(k)), nb ?? null)) near++; else say(`index ${i} ${String(a.name)}: near ${JSON.stringify(nb)}, was ${JSON.stringify(na)}`);
});
console.log(JSON.stringify({ ...t, extra: extra.length, index: i2.length, entries, near }, null, 1));
for (const d of diffs) console.log(d);
process.exit(diffs.length ? 1 : 0);

/**
 * Round seventy-nine (Z): a corpus of version 3 at the size of scripts/species-list.txt, one dossier for each of its lines,
 * for measuring `--index`, the upload and the Worker at full size before the owner's build (dev only; never the corpus).
 *
 * - A species already in the reference (a dossier of the real corpus holds its plant_name_id, or, for a line with no
 *   plant_name_id, its GBIF key) is that dossier, linked (the builder writes a file anew by rename, so the original is
 *   never changed).
 * - Every other line is a real dossier of its genus (else of its family, else any), taken in turn, given the line's
 *   name, author, family, genus, plant_name_id and GBIF key; Kew's own synonyms and native and introduced areas from
 *   Kew's files (each area's name and box as the real corpus writes them; a line none of whose areas the real corpus
 *   knows keeps its template's range); its photographs made its own (each iNaturalist, GBIF and Commons identity made
 *   unique, the template's name in them made the line's, so no photograph is held by two pages); each common name's
 *   first word swapped for another real name's (so "… cactus", "… rose" keep their weight); its habitat climate
 *   shifted by up to half a degree (so the nearest climates are not ties); and its substance stamp taken again.
 * - A line with no GBIF key (2,327) is given a stand-in GBIF key above any real one (900,000,000 and up), since the
 *   schema of r79base needs one: its size and names are a page's; its key is not. On a tree with agent K's schema,
 *   r79-keyless.ts then rewrites each such page without a key, in the shape K's builder writes.
 *
 *   node --max-old-space-size=2048 --import tsx scripts/dev/scale/r79-full-corpus.ts <species-list.txt> <real s/v3> <Kew bulk dir> <out s/v3 dir>
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, linkSync, createReadStream, statSync, copyFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { restamp } from '../../../src/lib/dossier/changed';
import { slugify } from '../../../src/lib/core/names';

const [listFile, real, bulk, out] = process.argv.slice(2);
if (!out) { console.error('usage: r79-full-corpus.ts <species-list.txt> <real s/v3> <Kew bulk dir> <out s/v3 dir>'); process.exit(2); }
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const TODAY = '2026-10-20';
const STAND_IN = 900_000_000;
mkdirSync(out, { recursive: true });

type Line = { pid: string; name: string; author: string; family: string; gbif: number | null };
const lines: Line[] = readFileSync(listFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
  const [pid, name, author, family, , gbif] = l.split('\t');
  return { pid, name, author, family, gbif: gbif === '-' ? null : Number(gbif) };
});
const wanted = new Set(lines.map((l) => l.pid).filter((p) => p !== '-'));
const t0 = Date.now();
const say = (s: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s  ${s}`);

// The real corpus: each file's genus, family and keys; every area's name and box; a pool of common names' first words.
type Real = { file: string; pid: string; gbif: number; genus: string; family: string };
const reals: Real[] = [];
const area = new Map<string, { name: string; box: unknown }>();
const firstWords: string[] = [];
const photoCounts: number[] = [];
for (const f of readdirSync(real).filter((x) => /^[kg][1-9][0-9]*\.json$/.test(x)).sort()) {
  const d = JSON.parse(readFileSync(`${real}/${f}`, 'utf8'));
  photoCounts.push((d.photos ?? []).length);
  reals.push({ file: f, pid: d.name?.kew?.entry ?? '', gbif: d.ids.gbif, genus: d.name.genus ?? d.name.scientific.split(' ')[0], family: d.name.family ?? '' });
  for (const a of [...(d.distribution?.native ?? []), ...(d.distribution?.introduced ?? [])]) if (a?.code && a.box && !area.has(a.code)) area.set(a.code, { name: a.name, box: a.box });
  for (const v of d.name?.vernacular ?? []) { const w = String(v.name).split(' '); if (w.length > 1) firstWords.push(w[0]); }
}
say(`${reals.length} real dossiers read; ${area.size} areas, ${firstWords.length} first words`);
const realByPid = new Map(reals.filter((r) => r.pid).map((r) => [r.pid, r]));
const realByGbif = new Map(reals.map((r) => [r.gbif, r]));
const byGenus = new Map<string, Real[]>(), byFamily = new Map<string, Real[]>();
for (const r of reals) {
  (byGenus.get(r.genus) ?? byGenus.set(r.genus, []).get(r.genus)!).push(r);
  (byFamily.get(r.family) ?? byFamily.set(r.family, []).get(r.family)!).push(r);
}
const turn = new Map<string, number>();
const pick = (pool: Real[], k: string) => { const n = turn.get(k) ?? 0; turn.set(k, n + 1); return pool[n % pool.length]; };

// Kew's files: each wanted species' IPNI id, its synonyms, and its areas.
type Kew = { ipni: string; syn: string[]; kewSyn: Set<string>; native: string[]; introduced: string[] };
const kew = new Map<string, Kew>();
for (const p of wanted) kew.set(p, { ipni: '', syn: [], kewSyn: new Set(), native: [], introduced: [] });
async function rows(file: string, each: (f: string[], h: Map<string, number>) => void) {
  let head: Map<string, number> | null = null;
  for await (const l of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) {
    const f = l.split('|');
    if (!head) { head = new Map(f.map((c, i) => [c, i])); continue; }
    each(f, head);
  }
}
await rows(`${bulk}/wcvp_names.csv`, (f, h) => {
  const id = f[h.get('plant_name_id')!], acc = f[h.get('accepted_plant_name_id')!], status = f[h.get('taxon_status')!];
  const own = kew.get(id);
  if (own) own.ipni = f[h.get('ipni_id')!];
  const k = kew.get(acc);
  if (k && acc !== id && status === 'Synonym') {
    const name = f[h.get('taxon_name')!], authors = f[h.get('taxon_authors')!];
    k.syn.push(authors ? `${name} ${authors}` : name);
    if (f[h.get('taxon_rank')!] === 'Species') k.kewSyn.add(name);
  }
});
say('Kew names read');
await rows(`${bulk}/wcvp_distribution.csv`, (f, h) => {
  const k = kew.get(f[h.get('plant_name_id')!]);
  if (!k || f[h.get('extinct')!] === '1' || f[h.get('location_doubtful')!] === '1') return;
  const code = f[h.get('area_code_l3')!];
  if (!code) return;
  (f[h.get('introduced')!] === '1' ? k.introduced : k.native).push(code);
});
say('Kew areas read');

// One template held at a time (they come round by genus, so a small cache serves most).
const cache = new Map<string, string>();
const textOf = (file: string) => { let t = cache.get(file); if (t === undefined) { t = readFileSync(`${real}/${file}`, 'utf8'); cache.set(file, t); if (cache.size > 64) cache.delete(cache.keys().next().value!); } return t; };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let linked = 0, cloned = 0, standIn = 0, kewRange = 0, missingReal = 0, bytes = 0;
const seenGbif = new Set<number>();
lines.forEach((l, c) => {
  const own = l.pid !== '-' ? realByPid.get(l.pid) : l.gbif != null ? realByGbif.get(l.gbif) : undefined;
  if (own) {
    const to = `${out}/${own.file}`;
    if (!existsSync(to)) linkSync(`${real}/${own.file}`, to);
    linked++; seenGbif.add(own.gbif); bytes += statSync(to).size;
    return;
  }
  if (l.pid === '-') { missingReal++; return; }
  const genus = l.name.replace(/^× /, '').split(' ')[0];
  const t = byGenus.get(genus) ? pick(byGenus.get(genus)!, `g:${genus}`) : byFamily.get(l.family) ? pick(byFamily.get(l.family)!, `f:${l.family}`) : pick(reals, '*');
  const tmpl = JSON.parse(textOf(t.file));
  const tName: string = tmpl.name.scientific;
  const tag = `9${String(c).padStart(5, '0')}`;
  // The photographs, made this page's own.
  const nameRe = new RegExp(esc(tName), 'g'), underRe = new RegExp(esc(tName.replace(/ /g, '_')), 'g');
  let photos = JSON.stringify(tmpl.photos ?? []).replace(nameRe, l.name).replace(underRe, l.name.replace(/ /g, '_'));
  photos = photos.replace(/(\/photos\/|"id":"|observations\/)(\d{4,})/g, (_m, a, d) => `${a}${tag}${d}`);
  // As many as a real page has, taken in turn across the whole corpus (a genus's real pages are its best-photographed, so
  // its template alone made pages of 58 KB against the real mean of 31 KB): the real corpus's spread of photograph counts.
  const ph = (JSON.parse(photos) as Array<Record<string, unknown>>).slice(0, photoCounts[(c * 7) % photoCounts.length]);
  for (const p of ph) { delete p.shared; if (p.src === 'commons' && typeof p.id === 'string') p.id = `${p.id} ~${tag}`; if (p.src === 'gbif' && typeof p.url === 'string' && !/\/photos\/\d/.test(p.url)) p.url = `${p.url}#${tag}`; }
  const d = tmpl;
  d.photos = ph;
  const gbif = l.gbif ?? STAND_IN + c;
  if (l.gbif == null) standIn++;
  if (seenGbif.has(gbif)) throw new Error(`GBIF key ${gbif} twice`);
  seenGbif.add(gbif);
  d.key = `k${l.pid}`;
  d.slug = slugify(l.name);
  const k = kew.get(l.pid)!;
  const n = d.name;
  n.scientific = l.name; n.authorship = l.author; n.family = l.family; n.genus = genus; n.status = 'accepted'; n.rank = 'SPECIES';
  n.classification = (n.classification ?? []).map((x: { rank: string; name: string; key: number }) => (x.rank === 'genus' ? { ...x, name: genus } : x.rank === 'family' ? { ...x, name: l.family } : x));
  n.synonyms = k.syn.slice(0, 60);
  n.kew = { entry: l.pid, synonyms: [...k.kewSyn].sort(), acceptedElsewhere: [], file: '2026-06-04' };
  n.vernacular = (n.vernacular ?? []).map((v: { name: string }, i: number) => { const w = v.name.split(' '); if (w.length > 1) w[0] = firstWords[(c * 31 + i * 7) % firstWords.length]; return { ...v, name: w.join(' ') }; });
  if (n.cited) delete n.cited;
  d.ids = { gbif, ...(k.ipni ? { powo: `urn:lsid:ipni.org:names:${k.ipni}`, ipni: k.ipni } : {}) };
  d.links = { gbif: `https://www.gbif.org/species/${gbif}`, ...(k.ipni ? { powo: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${k.ipni}`, ipni: `https://www.ipni.org/n/${k.ipni}` } : {}) };
  const nat = k.native.filter((x) => area.has(x)), intr = k.introduced.filter((x) => area.has(x));
  if (nat.length && d.distribution) {
    kewRange++;
    const of = (x: string) => ({ code: x, name: area.get(x)!.name, box: area.get(x)!.box });
    d.distribution.native = [...new Set(nat)].map(of);
    d.distribution.introduced = [...new Set(intr)].map(of);
    d.distribution.boxes = d.distribution.native.map((a: { box: unknown }) => a.box);
    if (d.distribution.via?.kind === 'own') d.distribution.via = { ...d.distribution.via, entry: `${l.name} ${l.author}`.trim(), name: l.name };
  }
  if (d.occurrences?.keys) delete d.occurrences.keys;
  const shift = (((c * 7919) % 21) - 10) / 20;
  for (const m of d.climate?.months ?? []) { m.tmax = Math.round((m.tmax + shift) * 10) / 10; m.tmin = Math.round((m.tmin + shift) * 10) / 10; }
  delete d.changed;
  const st = restamp(d, TODAY, sha1);
  if (st) d.changed = st;
  const text = JSON.stringify(d);
  writeFileSync(`${out}/k${l.pid}.json`, text);
  bytes += text.length;
  cloned++;
  if (cloned % 5000 === 0) say(`${cloned} made`);
});
// The genus records ("About the genus") the real corpus has.
if (existsSync(`${real}/g`)) { mkdirSync(`${out}/g`, { recursive: true }); for (const f of readdirSync(`${real}/g`)) if (!existsSync(`${out}/g/${f}`)) copyFileSync(`${real}/g/${f}`, `${out}/g/${f}`); }
say(`${lines.length} lines: ${linked} real dossiers linked, ${cloned} made from a template (${kewRange} with Kew's range, ${standIn} with a stand-in GBIF key)${missingReal ? `, ${missingReal} lines with no plant_name_id and no real dossier left out` : ''}; ${(bytes / 1048576).toFixed(0)} MB of dossiers`);

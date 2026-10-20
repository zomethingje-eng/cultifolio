/**
 * Round seventy-nine (Z): the full-size corpus's pages without a GBIF key (dev only; never the corpus). r79-full-corpus.ts
 * gives each of the list's 2,327 lines with no GBIF key a stand-in key (900,000,000 and up), since r79base's schema needs
 * one; this rewrites each such page in the shape agent K's builder writes (`src/lib/dossier/build-kew.ts`, round
 * seventy-nine), read from one of K's keyless dossiers: no `ids.gbif` or GBIF link, no records, no centroid, the climate
 * pending, every GBIF row skipped with K's reason, the name from Kew alone (no GBIF common names, no keyed
 * classification), no GBIF photographs; its substance stamp taken again. Run it on a tree that holds K's schema.
 *
 *   npx tsx scripts/dev/scale/r79-keyless.ts <s/v3 dir> <a keyless dossier of K's, e.g. fixtures/dossiers/s/v3/k457911.json>
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { restamp } from '../../../src/lib/dossier/changed';

const [dir, kFile] = process.argv.slice(2);
if (!kFile) { console.error('usage: r79-keyless.ts <s/v3 dir> <a keyless dossier of K\'s>'); process.exit(2); }
const STAND_IN = 900_000_000;
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const k = JSON.parse(readFileSync(kFile, 'utf8'));
if (k.ids?.gbif != null) throw new Error(`${kFile} has a GBIF key`);
const skipped = Object.entries(k.upstream as Record<string, { status: string }>).filter(([s, u]) => u.status === 'skipped' && (s.startsWith('gbif.') || s === 'climate'));
let n = 0;
for (const f of readdirSync(dir)) {
  if (!/^k\d+\.json$/.test(f)) continue;
  const text = readFileSync(`${dir}/${f}`, 'utf8');
  if (!/"gbif":9\d{8}[,}]/.test(text)) continue;
  const d = JSON.parse(text);
  if (!(d.ids?.gbif >= STAND_IN)) continue;
  delete d.ids.gbif;
  delete d.links.gbif;
  delete d.centroid;
  d.occurrences = structuredClone(k.occurrences);
  d.climate = structuredClone(k.climate);
  delete d.name.order;
  d.name.classification = [{ rank: 'family', name: d.name.family }, { rank: 'genus', name: d.name.genus }];
  d.name.vernacular = [];
  d.photos = (d.photos ?? []).filter((p: { src: string }) => p.src !== 'gbif');
  const at = d.built;
  const up: Record<string, unknown> = { 'kew.names': { ...k.upstream['kew.names'], at, detail: `Kew's entry ${d.name.scientific} ${d.name.authorship} (plant_name_id ${d.name.kew.entry}), read from Kew's names file` } };
  for (const [s, u] of Object.entries(d.upstream)) up[s] = u;
  for (const [s, u] of skipped) up[s] = { ...u, at };
  d.upstream = up;
  delete d.changed;
  const st = restamp(d, d.built.slice(0, 10), sha1);
  if (st) d.changed = st;
  writeFileSync(`${dir}/${f}`, JSON.stringify(d));
  n++;
}
console.log(`${n} pages rewritten without a GBIF key`);

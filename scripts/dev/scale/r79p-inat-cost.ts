/**
 * Round seventy-nine, agent P: what the cultivated fill asks of iNaturalist for a species the list gives no GBIF key
 * (2,327 of 48,368; agent K builds their pages), once the wild set comes from the open data. Each name is asked as
 * `--fill inat` asks a dossier without an iNaturalist id (`inat.taxonFor`, the existing rule: the name search, exact
 * name or iNaturalist's own synonym, never another species of the reference), then, where a taxon is found, the
 * cultivated set (`inat.photos`, the owner's rule). The wild set is not asked: the open data holds every plant taxon.
 * Every request to iNaturalist is counted; one every 2.1 s, the project's User-Agent.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r79p-inat-cost.ts <species-list.txt> <n> <seed> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as inat from '../../../src/lib/dossier/sources/inat';
import { makeFetcher, USER_AGENT } from '../../../src/lib/dossier/fetch';
import { ownNames } from '../../../src/lib/dossier/own-names';

const [listPath, nArg, seedArg, outPath] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const asked: string[] = [];
const paced = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const wait = last + 2100 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  asked.push(new URL(u).pathname);
  return fetch(input, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': USER_AGENT } });
}) as typeof fetch;
const f = makeFetcher(paced);
const lines = readFileSync(listPath, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c[5] === '-');
// A seeded shuffle (mulberry32), so the sample can be drawn again.
let a = Number(seedArg) >>> 0;
const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = [...lines].sort(() => rnd() - 0.5).slice(0, Number(nArg));
const rows: unknown[] = [];
for (const c of pick) {
  const name = c[1];
  const before = asked.length;
  const t = await inat.taxonFor(f, { scientific: name, key: 0, own: ownNames({ scientific: name, synonyms: [] }), sameType: [] });
  let cult: string | null = null;
  if (t.status === 'ok') { const r = await inat.photos(f, t.data.id, false, 12); cult = r.status === 'ok' ? `ok ${r.data.length}` : r.status; }
  rows.push({ name, taxon: t.status === 'ok' ? `${t.data.id} ${t.data.name}` : `${t.status}${'detail' in t && t.detail ? `: ${t.detail}` : ''}`, cultivated: cult, requests: asked.length - before });
  process.stdout.write(`\r  ${rows.length} of ${pick.length}, ${asked.length} requests   `);
}
const byPath: Record<string, number> = {};
for (const p of asked) byPath[p] = (byPath[p] ?? 0) + 1;
writeFileSync(outPath, JSON.stringify({ asked: new Date().toISOString(), species: pick.length, requests: asked.length, perSpecies: asked.length / pick.length, byPath, rows }, null, 1));
console.log(`\n${pick.length} species, ${asked.length} requests to iNaturalist (${(asked.length / pick.length).toFixed(2)} a species): ${JSON.stringify(byPath)}`);

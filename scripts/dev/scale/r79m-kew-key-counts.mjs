// Round seventy-nine (M), a dev measure: how many GBIF records the keys of scripts/extra-keys-kew.txt hold, by the download's
// own filter (coordinates, no geospatial issue, present), so how many of the pages without a GBIF key gain records and
// how much the download grows. GBIF's occurrence count API (no account), one request a second, with the review's own
// User-Agent; a 429 or 503 waits and asks again. Per key, then the union in batches of 100 keys (a record two keys hold is
// counted once), records and records with images (human observations, as the images' download asks).
//
//   node scripts/dev/scale/r79m-kew-key-counts.mjs scripts/extra-keys-kew.txt <out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [file, out] = process.argv.slice(2);
const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
const keys = [...new Set(lines.map((c) => Number(c[1])))];
const done = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { per: {}, union: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'https://api.gbif.org/v1/occurrence/search?hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=0';
let last = 0;
async function count(q) {
  for (let i = 0; ; i++) {
    const wait = last + 1050 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(`${base}&${q}`, { headers: { 'user-agent': 'cultifolio-review/79' } }).catch(() => null);
    if (r?.ok) return (await r.json()).count;
    if (i > 6) throw new Error(`no answer for ${q.slice(0, 80)}: ${r?.status}`);
    await sleep(r && (r.status === 429 || r.status === 503) ? 30_000 : 5_000);
  }
}
for (const [i, k] of keys.entries()) {
  if (done.per[k] != null) continue;
  done.per[k] = await count(`taxonKey=${k}`);
  if (i % 50 === 0) { writeFileSync(out, JSON.stringify(done)); process.stdout.write(`\r${i} of ${keys.length}…`); }
}
writeFileSync(out, JSON.stringify(done));
let records = 0, media = 0;
for (let i = 0; i < keys.length; i += 100) {
  const q = keys.slice(i, i + 100).map((k) => `taxonKey=${k}`).join('&');
  records += await count(q);
  media += await count(`${q}&mediaType=StillImage&basisOfRecord=HUMAN_OBSERVATION`);
}
done.union = { records, media, batches: Math.ceil(keys.length / 100), at: new Date().toISOString() };
const pages = new Map();
for (const c of lines) pages.set(c[0], (pages.get(c[0]) ?? 0) + (done.per[c[1]] ?? 0));
done.pages = { withKeys: pages.size, withRecords: [...pages.values()].filter((n) => n > 0).length, records1000: [...pages.values()].filter((n) => n >= 1000).length, records100k: [...pages.values()].filter((n) => n > 100000).length };
done.keys = { all: keys.length, withRecords: keys.filter((k) => done.per[k] > 0).length, over100k: keys.filter((k) => done.per[k] > 100000).length, sum: keys.reduce((n, k) => n + done.per[k], 0) };
writeFileSync(out, JSON.stringify(done, null, 1));
console.log(`\n${JSON.stringify({ union: done.union, pages: done.pages, keys: done.keys })}`);

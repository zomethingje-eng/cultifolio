// Round one hundred (docs/PLAN-100.md, 1): the key map. For each GBIF key we hold (the species list's, the three extra-keys
// files' keys, holders and exceptions, the merges'), GBIF's version 2 match under the Catalogue of Life eXtended Release
// (COL XR) by the key itself (`scientificNameID=gbif:<key>`) and by the backbone's own name with its author, and the
// backbone's own row for the key from its export of 2023-08-28. Read-only: it writes the map and nothing else.
//   node --import tsx scripts/dev/r100-colxr-keymap.ts [--out bulk/colxr/keymap-<day>.txt] [--limit N] [--gap-ms 300] [--parallel 4]
// It carries on where a run stopped (the keys in --out are passed by); a key GBIF did not answer after three tries is left
// out and counted, and asked again by the next run.
import { readFileSync, existsSync, appendFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { usageOfRow } from '../backbone-load';
import { gatherKeys, KEY_FILES, matchOf, byIdUrl, byNameUrl, rowOf, keysDone, COLUMNS, COLXR, BACKBONE } from '../colxr-keymap-lib.mjs';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const day = new Date().toISOString().slice(0, 10);
const out = arg('--out') ?? `bulk/colxr/keymap-${day}.txt`;
const limit = Number(arg('--limit') ?? Infinity);
const gap = Number(arg('--gap-ms') ?? 300);
/** Keys asked at once (each two requests); a pause of `gap` between rounds. */
const parallel = Math.max(1, Math.min(8, Number(arg('--parallel') ?? 4)));
const UA = { 'User-Agent': 'cultifolio-keymap/1.0 (read-only taxonomy comparison)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ask(url: string): Promise<{ ok: true; j: unknown } | { ok: false; why: string }> {
  let why = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.ok) return { ok: true, j: await r.json() };
      why = `HTTP ${r.status}`;
      if (r.status === 429) { await sleep(30_000 * (i + 1)); continue; }
      if (r.status < 500) return { ok: false, why };
    } catch (e) { why = (e as Error).message; }
    await sleep(5_000 * (i + 1));
  }
  return { ok: false, why };
}

const keys = gatherKeys(KEY_FILES, (f) => readFileSync(f, 'utf8'));
console.log(`keys: ${keys.size} read from ${KEY_FILES.map((s) => s.file).join(', ')}`);
const done = existsSync(out) ? keysDone(readFileSync(out, 'utf8')) : new Set<string>();
const todo = [...keys.keys()].filter((k) => !done.has(k)).slice(0, limit);
console.log(`map: ${out}; ${done.size} keys there already, ${todo.length} to ask`);

// The backbone's own rows for the keys asked.
const want = new Set(todo);
const usage = new Map<string, ReturnType<typeof usageOfRow>>();
const file = 'bulk/backbone/simple.txt.gz';
const rl = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of rl) {
  const t = line.indexOf('\t');
  const k = line.slice(0, t);
  if (!want.has(k)) continue;
  const c = line.split('\t');
  if (c[10] === '6') usage.set(k, usageOfRow(c));
}
console.log(`backbone: ${usage.size} of ${todo.length} keys found as plant usages in ${file} (the export of 2023-08-28)`);

if (!existsSync(out)) {
  const ds = await ask(`https://api.gbif.org/v1/dataset/${COLXR}`);
  const d = ds.ok ? (ds.j as { title?: string; modified?: string; pubDate?: string }) : {};
  writeFileSync(out, [
    `# Round one hundred (docs/PLAN-100.md, 1): GBIF's Backbone Taxonomy (${BACKBONE}, its export of 2023-08-28) to the Catalogue`,
    `# of Life eXtended Release (${COLXR}: "${d.title ?? 'not answered'}", modified ${d.modified ?? 'not answered'}, published ${d.pubDate ?? 'not answered'}),`,
    `# by GBIF's version 2 match (api.gbif.org/v2/species/match), asked from ${day}: byid by scientificNameID=gbif:<key>, byname by the`,
    `# backbone's scientific name with its author and kingdom=Plantae. A key with no answer is "NONE" with GBIF's note; a`,
    `# synonym's accepted taxon is "<id> <name>". Made by scripts/dev/r100-colxr-keymap.ts.`,
    `# ${COLUMNS.join('\t')}`
  ].join('\n') + '\n');
}

let written = 0, failed = 0;
const failures: string[] = [];
const t0 = Date.now();
async function one(k: string): Promise<void> {
  const u = usage.get(k);
  const [a, b] = await Promise.all([ask(byIdUrl(k)), u ? ask(byNameUrl(u.label)) : Promise.resolve(null)]);
  if (!a.ok || (b && !b.ok)) {
    failed++;
    failures.push(`${k}: ${!a.ok ? `by id ${a.why}` : ''}${b && !b.ok ? ` by name ${b.why}` : ''}`);
  } else {
    appendFileSync(out, rowOf(k, keys.get(k)!, u, matchOf(a.j), b ? matchOf((b as { j: unknown }).j) : null, new Date().toISOString().slice(0, 10)) + '\n');
    written++;
  }
}
let next500 = 500;
for (let i = 0; i < todo.length; i += parallel) {
  await Promise.all(todo.slice(i, i + parallel).map(one));
  if (written + failed >= next500) {
    next500 += 500;
    const per = (Date.now() - t0) / (written + failed);
    console.log(`  ${written + failed} of ${todo.length} asked (${written} written, ${failed} not answered), about ${Math.round((todo.length - written - failed) * per / 60000)} min left`);
  }
  await sleep(gap);
}
console.log(`done: ${written} keys written to ${out}, ${failed} not answered (asked again by the next run)${failures.length ? ':' : ''}`);
for (const f of failures.slice(0, 50)) console.log(`  ${f}`);

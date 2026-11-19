// Round ninety-seven (docs/PLAN-97.md, 3): how many pages read a Commons category other than the one their Wikidata item
// links. Round ninety-six read an item's Commons sitelink where its P373 category holds no files (Heberdenia bahamensis);
// PLAN-96 left two counts open: other pages whose P373 category is empty while the sitelink's holds files, and pages with no
// P373 whose name's category (what the build reads then) differs from the sitelink's.
//
// Reads every dossier's Wikidata item and name (static/s/v3, read only), asks Wikidata's query service for each item's
// P373 and Commons sitelink (200 items a query, one a second), then Commons for the file count of every category where the
// two could differ (50 a request, 0.35 s apart, Wikimedia's pace in src/lib/dossier/fetch.ts). Writes nothing in the
// corpus; prints its figures and writes the cases to r97-commons-count.txt.
//   node scripts/dev/r97-commons-count.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'Cultifolio/3.0 (https://cultifolio.com; hello@cultifolio.com)';
const V3 = 'static/s/v3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cat = (s) => { const t = s.replace(/^Category:/, '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

async function get(url, init = {}, tries = 5) {
  for (let i = 0; ; i++) {
    let r;
    try { r = await fetch(url, { ...init, headers: { 'user-agent': UA, 'api-user-agent': UA, accept: 'application/json', ...init.headers } }); }
    catch (e) { if (i >= tries) throw e; console.log(`  ${e.cause?.code ?? e.message}: waiting ${5 * 2 ** i} s`); await sleep(5000 * 2 ** i); continue; }
    if (r.ok) return r.json();
    if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} for ${url.slice(0, 120)}`);
    const wait = Number(r.headers.get('retry-after')) * 1000 || 5000 * 2 ** i;
    console.log(`  ${r.status}: waiting ${wait / 1000} s`);
    await sleep(wait);
  }
}

const pages = [];
for (const f of readdirSync(V3).filter((x) => /^[kg][1-9][0-9]*\.json$/.test(x))) {
  const d = JSON.parse(readFileSync(join(V3, f), 'utf8'));
  if (d.ids?.wikidata) pages.push({ id: f.slice(0, -5), item: d.ids.wikidata, name: d.name?.scientific ?? '', photos: (d.photos ?? []).filter((p) => p.src === 'commons').length, commons: d.upstream?.commons?.status });
}
console.log(`${pages.length} pages with a Wikidata item`);

const byItem = new Map(pages.map((p) => [p.item, p]));
const items = [...byItem.keys()];
for (let i = 0; i < items.length; i += 200) {
  const q = `SELECT ?item ?p373 ?sl WHERE { VALUES ?item { ${items.slice(i, i + 200).map((x) => `wd:${x}`).join(' ')} } OPTIONAL { ?item wdt:P373 ?p373 } OPTIONAL { ?sl schema:about ?item; schema:isPartOf <https://commons.wikimedia.org/> } }`;
  const j = await get('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json' }, body: 'query=' + encodeURIComponent(q) });
  for (const b of j.results.bindings) {
    const p = byItem.get(b.item.value.split('/').pop());
    if (!p) continue;
    if (b.p373) p.p373 = b.p373.value;
    if (b.sl) p.sitelink = decodeURIComponent(b.sl.value.replace('https://commons.wikimedia.org/wiki/', '')).replace(/_/g, ' ');
  }
  if ((i / 200) % 40 === 0) console.log(`  ${Math.min(i + 200, items.length)} of ${items.length} items asked`);
  await sleep(1100);
}

// The category each page reads now (P373, else its name), and the sitelink's where it is another category.
const linkCat = (p) => (p.sitelink?.startsWith('Category:') ? cat(p.sitelink) : null);
const cases = pages.filter((p) => { const l = linkCat(p); const now = cat(p.p373 || p.name); return l && l !== now; });
const titles = [...new Set(cases.flatMap((p) => [cat(p.p373 || p.name), linkCat(p)]))];
const files = new Map();
for (let i = 0; i < titles.length; i += 50) {
  const j = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=categoryinfo&titles=${encodeURIComponent(titles.slice(i, i + 50).map((t) => 'Category:' + t).join('|'))}&maxlag=5`);
  const norm = new Map((j.query?.normalized ?? []).map((n) => [n.to, n.from]));
  for (const pg of Object.values(j.query?.pages ?? {})) {
    const t = cat(norm.get(pg.title) ?? pg.title);
    files.set(t, pg.missing !== undefined ? 0 : pg.categoryinfo?.files ?? 0);
  }
  await sleep(350);
}

const rows = cases.map((p) => ({ ...p, reads: cat(p.p373 || p.name), readsFiles: files.get(cat(p.p373 || p.name)) ?? 0, link: linkCat(p), linkFiles: files.get(linkCat(p)) ?? 0 }));
const group = (pred) => rows.filter(pred);
const a = group((r) => r.p373 && r.readsFiles === 0 && r.linkFiles > 0);
const b = group((r) => r.p373 && !(r.readsFiles === 0 && r.linkFiles > 0));
const c = group((r) => !r.p373 && r.readsFiles === 0 && r.linkFiles > 0);
const d = group((r) => !r.p373 && !(r.readsFiles === 0 && r.linkFiles > 0));
const counts = [
  `${pages.length} pages with a Wikidata item; ${pages.filter((p) => p.p373).length} with P373, ${pages.filter((p) => p.sitelink).length} with a Commons sitelink (${pages.filter((p) => p.sitelink?.startsWith('Category:')).length} to a category)`,
  `${rows.length} pages whose sitelink names another category than the one the build reads first:`,
  `  A ${a.length}: P373's category empty, the sitelink's with files (round 96 reads the sitelink's)`,
  `  B ${b.length}: P373's category and the sitelink's differ, P373's not empty or neither with files (P373 read, as before)`,
  `  C ${c.length}: no P373; the name's category empty, the sitelink's with files (the build reads the name's: no photographs)`,
  `  D ${d.length}: no P373; the name's category and the sitelink's differ, the name's with files or neither`
];
console.log(counts.join('\n'));
const line = (r) => `${r.id}\t${r.item}\t${r.name}\tP373 ${r.p373 ?? '-'}\treads ${r.reads} (${r.readsFiles} files)\tsitelink ${r.link} (${r.linkFiles} files)\tpage's Commons photographs ${r.photos} (${r.commons})`;
writeFileSync('r97-commons-count.txt', [`# node scripts/dev/r97-commons-count.mjs, read ${new Date().toISOString().slice(0, 10)}`, ...counts.map((x) => '# ' + x), '', '## A', ...a.map(line), '', '## B', ...b.map(line), '', '## C', ...c.map(line), '', '## D', ...d.map(line), ''].join('\n'));
console.log('the cases: r97-commons-count.txt');

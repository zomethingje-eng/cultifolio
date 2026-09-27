#!/usr/bin/env node
/**
 * The checks made by hand after every deploy since round fifteen, run once against the live site at the end of
 * `npm run deploy`, so a deploy that broke one of them says so before anyone else notices. Plain Node, no dependencies.
 *
 *   node scripts/live-check.mjs                 checks https://cultifolio.com
 *   node scripts/live-check.mjs https://x.dev   checks another origin (a workers.dev preview); LIVE_CHECK_ORIGIN in the
 *                                               environment does the same for `npm run deploy` on another deployment
 *
 * Exits 1 on the first failure, with the request and what came back. `LIVE_CHECK_SKIP=names,forecast` skips the checks
 * that need an upstream (a local `wrangler dev` with no GBIF credentials); never set for the real site. Nothing here creates
 * or changes anything on the server: every request is a GET, apart from one POST to the vault route with a body that
 * must be refused (round sixteen, 16); the requests do count against the address's rate limits like any visit's.
 */
const origin = (process.argv[2] ?? process.env.LIVE_CHECK_ORIGIN ?? 'https://cultifolio.com').replace(/\/+$/, '');
const ua = 'cultifolio-live-check (deploy)';
let n = 0;
const skip = new Set((process.env.LIVE_CHECK_SKIP ?? '').split(',').map((s) => s.trim()).filter(Boolean));

async function get(path, init = {}) {
  const r = await fetch(origin + path, { redirect: 'manual', ...init, headers: { 'user-agent': ua, ...(init.headers ?? {}) } });
  const text = await r.text();
  return { status: r.status, h: (k) => r.headers.get(k) ?? '', text };
}
function fail(what, r) {
  console.error(`\nlive-check FAILED: ${what}`);
  if (r) console.error(`  status ${r.status}; cache-control "${r.h('cache-control')}"; cf-cache-status "${r.h('cf-cache-status')}"; ${r.text.slice(0, 200).replace(/\s+/g, ' ')}`);
  process.exit(1);
}
function ok(what) {
  n++;
  console.log(`  ok  ${what}`);
}
const headersOn = (r, path) => {
  if (r.h('referrer-policy') !== 'no-referrer') fail(`${path}: Referrer-Policy is "${r.h('referrer-policy')}", not no-referrer (round sixteen, 9)`, r);
  if (r.h('x-frame-options').toUpperCase() !== 'DENY') fail(`${path}: X-Frame-Options is "${r.h('x-frame-options')}", not DENY (round sixteen, 15)`, r);
};

console.log(`live check against ${origin}`);

// The name service: twice, and the second is served from the edge. A 500 here on the second lookup was round eighteen's
// one live fault (the immutable cached headers), which no test before the deploy could see.
if (!skip.has('names')) {
  // A name the edge is unlikely to hold already, so the first request exercises the new build's upstream path and the
  // second the cache (round twenty, 13): one of these genera by the minute, so two runs in a row ask different ones.
  const GENERA = ['lithops', 'conophytum', 'copiapoa', 'haworthia', 'gasteria', 'ariocarpus', 'astrophytum', 'echeveria', 'tylecodon', 'pelargonium', 'othonna', 'crassula', 'aloe', 'agave', 'mammillaria', 'gymnocalycium', 'turbinicarpus', 'euphorbia', 'pachypodium', 'adenium', 'fockea', 'dioscorea', 'bulbine', 'massonia', 'lachenalia', 'oxalis', 'albuca', 'ornithogalum', 'ledebouria', 'eriospermum'];
  // The genus is asked for by a prefix of five to seven letters, all of which the suggestion service answers with the
  // genus, so ninety keys rotate rather than thirty and a run rarely finds its first request already at the edge.
  const minute = Math.floor(Date.now() / 60_000);
  const genus = GENERA[minute % GENERA.length];
  const q = `/api/names?q=${genus.slice(0, Math.max(4, genus.length - (Math.floor(minute / GENERA.length) % 3)))}`;
  const a = await get(q);
  if (a.status !== 200) fail(`${q} first answer`, a);
  if (!new RegExp(genus, 'i').test(a.text)) fail(`${q} did not name ${genus}`, a);
  const b = await get(q);
  if (b.status !== 200) fail(`${q} second answer (the edge-cached one)`, b);
  headersOn(b, q);
  const c = await get(q);
  if (c.status !== 200) fail(`${q} third answer`, c);
  const hit = [b, c].some((r) => /^HIT$/i.test(r.h('cf-cache-status')));
  if (!hit) console.warn(`  note  ${q}: no answer said CF-Cache-Status HIT (b: "${b.h('cf-cache-status')}", c: "${c.h('cf-cache-status')}"); the edge may be cold, not a failure`);
  ok(`names: 200, 200, 200${hit ? ', edge HIT' : ''}`);
}

// Headers on a prerendered page (from `_headers`), a dynamic page (from the hook), the offline page and an API route.
// The species page is one the deployment's own corpus holds: the first in its sitemap, unless LIVE_CHECK_SPECIES names one
// (a fixed slug would 404 on a corpus without it and send the deployer to roll back a good deploy; round twenty-five, 10).
let species = process.env.LIVE_CHECK_SPECIES;
if (!species) {
  const sm = await get('/sitemap.xml');
  if (sm.status !== 200) fail('/sitemap.xml', sm);
  species = /<loc>[^<]*\/species\/([a-z0-9-]+)<\/loc>/.exec(sm.text)?.[1];
  if (!species) fail('/sitemap.xml names no species page', sm);
}
for (const path of ['/about/how', `/species/${species}`, '/offline', '/api/corpus']) {
  const r = await get(path, { headers: { accept: 'text/html,*/*' } });
  if (r.status !== 200) fail(`${path}`, r);
  headersOn(r, path);
  if (path.startsWith('/species/') && !r.text.includes(path.slice(9).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()))) fail(`${path} does not name the species`, r);
  if (path === '/api/corpus' && !/"id":"[A-Za-z0-9._-]{4,}"/.test(r.text)) fail(`${path} carries no corpus id`, r);
  ok(`${path}: 200 with both headers`);
}

// No analytics beacon injected at the edge (round eight, 1): checked with an HTML Accept, which is what gets the injection.
{
  const r = await get('/', { headers: { accept: 'text/html' } });
  if (r.status !== 200) fail('/', r);
  if (/cloudflareinsights/.test(r.text)) fail('the front page carries the Cloudflare Web Analytics beacon; turn off automatic setup in the dashboard (docs/DEPLOY.md, section 2)', r);
  if (!/<meta name="referrer" content="no-referrer"/.test(r.text)) fail('the front page has no referrer meta', r);
  ok('/: no beacon, referrer meta present');
}

// The reference under a stale corpus id is answered but not stored anywhere (round sixteen, 12).
{
  const path = '/api/entries?b=00&c=stale-id-from-a-live-check';
  const r = await get(path);
  if (r.status !== 200) fail(path, r);
  if (!/no-store/.test(r.h('cache-control'))) fail(`${path} under a stale corpus id is cacheable: "${r.h('cache-control')}"`, r);
  ok('entries under a stale corpus id: 200, no-store');
}

// A forecast, for a fixed rounded coordinate, asked with the units the app sends and a query the edge has not seen, so
// the answer is this build's and not an object the previous build's schema left at the edge (round twenty, R2-1); the
// Worker's own cache key is the rounded coordinate, so MET is asked at most once an hour whatever the extra parameter.
// MET not answering twice, a few seconds apart, is a failure: a deploy that broke every forecast must not pass (round twenty, 13).
if (!skip.has('forecast')) {
  // A cell the Worker has not cached this hour, so MET is really asked: the longitude steps through thirty cells west of
  // London by the minute, sixty of them, more than the hour the Worker caches a cell for (a deploy that cannot reach MET
// must not pass on last hour's answer; round twenty-two, 11); a rerun in the same minute is the one case that repeats a cell
  // hour's answer). `units` as the app sends it; `lc` keeps the outer edge from answering for the previous build.
  const path = `/api/forecast?lat=51.5&lon=${(-0.13 - 0.01 * (Math.floor(Date.now() / 60_000) % 60)).toFixed(2)}&alt=20&units=metric&lc=${Date.now()}`;
  let r = await get(path);
  if (r.status === 502) {
    await new Promise((res) => setTimeout(res, 5000));
    r = await get(path);
  }
  if (r.status === 502) fail(`${path}: 502 twice; MET Norway is not answering through this build. If curl -sI https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=51.5&lon=-0.13 also fails, MET is down and this is not the deploy's fault; otherwise it is`, r);
  if (r.status !== 200) fail(path, r);
  if (!/"risk"/.test(r.text) || !/"tmin"/.test(r.text)) fail(`${path} answered 200 with no forecast in it (an old object at the edge would say cf-cache-status HIT; this says "${r.h('cf-cache-status')}")`, r);
  ok('forecast: 200 with a risk line');
}

// The vault route refuses a body that is not an object with a 400, never a 500 (round sixteen, 16). Creates nothing.
{
  const r = await get('/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  if (r.status !== 400) fail('POST /api/sync/vault with a JSON null should be 400', r);
  ok('vault route: a JSON null is a 400');
}

console.log(`live check passed (${n} checks)`);

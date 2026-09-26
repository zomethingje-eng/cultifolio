#!/usr/bin/env node
/**
 * The checks made by hand after every deploy since round fifteen, run once against the live site at the end of
 * `npm run deploy`, so a deploy that broke one of them says so before anyone else notices. Plain Node, no dependencies.
 *
 *   node scripts/live-check.mjs                 checks https://cultifolio.com
 *   node scripts/live-check.mjs https://x.dev   checks another origin (a workers.dev preview)
 *
 * Exits 1 on the first failure, with the request and what came back. `LIVE_CHECK_SKIP=names,forecast` skips the checks
 * that need an upstream (a local `wrangler dev` with no GBIF credentials); never set for the real site. Nothing here writes anything: every request is a
 * GET, apart from one POST to the vault route with a body that must be refused (round sixteen, 16).
 */
const origin = (process.argv[2] ?? 'https://cultifolio.com').replace(/\/+$/, '');
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
  const q = '/api/names?q=lithops';
  const a = await get(q);
  if (a.status !== 200) fail(`${q} first answer`, a);
  if (!/lithops/i.test(a.text)) fail(`${q} did not name Lithops`, a);
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
for (const path of ['/about/how', `/species/${process.env.LIVE_CHECK_SPECIES ?? 'lithops-lesliei'}`, '/offline', '/api/corpus']) {
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

// A forecast, for a fixed rounded coordinate (one MET call at most, and usually a cache hit).
if (!skip.has('forecast')) {
  const path = '/api/forecast?lat=51.5&lon=-0.13&alt=20';
  const r = await get(path);
  if (r.status === 502) console.warn(`  note  ${path}: 502, MET Norway did not answer; not this deploy's fault unless it stays`);
  else if (r.status !== 200) fail(path, r);
  else if (!/"risk"/.test(r.text) || !/"tmin"/.test(r.text)) fail(`${path} answered 200 with no forecast in it`, r);
  if (r.status === 200) ok('forecast: 200');
}

// The vault route refuses a body that is not an object with a 400, never a 500 (round sixteen, 16). Creates nothing.
{
  const r = await get('/api/sync/vault', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' });
  if (r.status !== 400) fail('POST /api/sync/vault with a JSON null should be 400', r);
  ok('vault route: a JSON null is a 400');
}

console.log(`live check passed (${n} checks)`);

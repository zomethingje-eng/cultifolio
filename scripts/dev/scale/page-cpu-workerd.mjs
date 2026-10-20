// The CPU and heap of pages the Worker's cache does not hold, in Cloudflare's own runtime run locally (round
// seventy-seven): a local R2 is filled with a corpus (every product, the genus records and the dossiers of the pages
// asked), `wrangler dev` (workerd) is started on the built Worker, and one copy answers the pages given in order, as a
// crawler's requests reach a warm isolate. Each request is profiled through the inspector (V8's CPU profiler): `cpuMs`
// is the time the profile's samples spent in anything but `(idle)`, and `by` that time by what ran (as
// page-cpu-agg.mjs sorts it). `heapMB` is V8's heap in use just after the answer (workerd's inspector does not collect
// garbage on request). COLD=n starts a fresh copy for each of the first n pages instead, to measure a first request.
//
//   node scripts/dev/scale/page-cpu-workerd.mjs <built project> <dir holding s/v3> <paths file> [out.jsonl]
// Env: PORT (default 4712), STATE (the local R2's folder; filled once, kept), PROF_US (sampling interval, default 200).
// V (the corpus version, default 3), ONLY (a file of bucket keys to put instead, from r79-reads.mjs; round seventy-nine).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { categorise, sourceOf } from './page-cpu-agg.mjs';

const [project, corpus, list, outFile] = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 4712), INSPECT = PORT + 5000;
const state = resolve(process.env.STATE ?? `${corpus}/.wrangler-state`);
const paths = readFileSync(list, 'utf8').split('\n').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Round seventy-nine: the corpus's version folder (`s/v3` since round seventy-eight; V=2 for an older corpus), and ONLY, a
// file of bucket keys (r79-reads.mjs writes one) to put instead of the whole corpus, so a 2 GB corpus is not copied whole.
const V = `s/v${process.env.V ?? 3}`;
const only = process.env.ONLY ? readFileSync(process.env.ONLY, 'utf8').split('\n').filter(Boolean) : null;
const out = (x) => { const s = JSON.stringify(x); if (outFile) appendFileSync(outFile, s + '\n'); else console.log(s); };

async function seed() {
  if (existsSync(join(state, 'seeded'))) return;
  const m = await import(resolve(project, 'node_modules/miniflare/dist/src/index.js'));
  const { Miniflare, convertV4MiniflareOptions } = m.Miniflare ? m : m.default;
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null) } }', resourcePersistencePath: join(state, 'v3'), r2Buckets: { BUCKET: 'cultifolio' } }));
  const bucket = await mf.getR2Bucket('BUCKET');
  const dir = join(corpus, V);
  if (only) {
    for (const k of only) { await bucket.put(k, readFileSync(join(corpus, k))); }
    if (!only.includes(`${V}/manifest.json`)) await bucket.put(`${V}/manifest.json`, readFileSync(join(dir, 'manifest.json')));
    await mf.dispose();
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, 'seeded'), `${only.length} objects (ONLY)\n`);
    console.error(`seeded ${only.length} objects into ${state}`);
    return;
  }
  let n = 0;
  for (const f of readdirSync(join(dir, 'p'))) { await bucket.put(`${V}/p/${f}`, readFileSync(join(dir, 'p', f))); n++; }
  for (const f of readdirSync(join(dir, 'g'))) { await bucket.put(`${V}/g/${f}`, readFileSync(join(dir, 'g', f))); n++; }
  // Every dossier: a page's own, and any the shared-name 404 reads.
  for (const f of readdirSync(dir)) if (/^(?:[kg])?\d+\.json$/.test(f)) { await bucket.put(`${V}/${f}`, readFileSync(join(dir, f))); n++; }
  await bucket.put(`${V}/manifest.json`, readFileSync(join(dir, 'manifest.json')));
  await mf.dispose();
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, 'seeded'), `${n + 1} objects\n`);
  console.error(`seeded ${n + 1} objects into ${state}`);
}

async function cdp(url) {
  const { default: WS } = await import(resolve(project, 'node_modules/ws/index.js'));
  const ws = new WS(url, { maxPayload: 1024 * 1024 * 1024 });
  let id = 0;
  const waiting = new Map();
  const scripts = [];
  ws.on('message', (m) => { const x = JSON.parse(String(m)); if (x.method === 'Debugger.scriptParsed') scripts.push(x.params); if (x.id && waiting.has(x.id)) { waiting.get(x.id)(x); waiting.delete(x.id); } });
  const open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  return { open, scripts, send: (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); setTimeout(() => { if (waiting.delete(i)) r({ timeout: true }); }, 60_000); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}

async function start() {
  const busy = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(2000) }).then(() => true, (e) => e.name === 'TimeoutError');
  if (busy) throw new Error(`port ${PORT} is in use: another copy is running`);
  rmSync(join(state, 'v3', 'cache'), { recursive: true, force: true });
  const child = spawn(process.execPath, [resolve(project, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', state, '--var', 'E2E_OFFLINE:1', '--log-level', 'warn'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; ; i++) {
    if (i > 120) throw new Error(`wrangler dev did not start:\n${log.slice(-2000)}`);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/robots.txt`, { signal: AbortSignal.timeout(5000) }); if (r.ok) break; } catch { /* not yet */ }
    await sleep(1000);
  }
  const targets = await (await fetch(`http://127.0.0.1:${INSPECT}/json/list`)).json();
  const t = targets.find((x) => /cultifolio/.test(`${x.title} ${x.url}`)) ?? targets[0];
  const c = await cdp(t.webSocketDebuggerUrl);
  await c.open;
  // The Worker's script as workerd runs it (wrangler's bundle), so the profile's lines can be told by the bundler's region comments.
  await c.send('Debugger.enable');
  await sleep(500);
  const w = c.scripts.find((x) => /(^|\/)_worker\.js$/.test(x.url));
  if (process.env.DEBUG) console.error('scripts', c.scripts.map((x) => `${x.url} ${x.length}`).join(' '));
  if (w) { const src = (await c.send('Debugger.getScriptSource', { scriptId: w.scriptId })).result?.scriptSource ?? ''; mkdirSync(state, { recursive: true }); writeFileSync(join(state, '_worker.js'), src); sourceOf('_worker.js', join(state, '_worker.js')); if (process.env.PROF_KEEP) { mkdirSync(process.env.PROF_KEEP, { recursive: true }); writeFileSync(join(process.env.PROF_KEEP, '_worker.js'), src); } }
  await c.send('Debugger.disable');
  await c.send('Profiler.enable');
  await c.send('Profiler.setSamplingInterval', { interval: Number(process.env.PROF_US ?? 200) });
  const stop = async () => {
    c.close();
    try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ }
    await new Promise((r) => { child.on('exit', r); setTimeout(r, 5000); });
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  };
  return { c, stop };
}

const mb = (x) => Math.round((x / 1048576) * 10) / 10;
async function ask(c, p, i) {
  await c.send('Profiler.start');
  const t0 = performance.now();
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { redirect: 'manual', headers: { 'user-agent': 'cultifolio-review/77', 'cache-control': 'no-cache' } });
  const body = await r.text();
  const ms = performance.now() - t0;
  const { profile } = (await c.send('Profiler.stop')).result ?? {};
  const h = (await c.send('Runtime.getHeapUsage')).result ?? {};
  const by = profile ? categorise([profile]) : {};
  const cpuMs = Object.entries(by).filter(([k]) => k !== '(idle)').reduce((a, [, v]) => a + v, 0);
  if (process.env.PROF_KEEP) { mkdirSync(process.env.PROF_KEEP, { recursive: true }); writeFileSync(join(process.env.PROF_KEEP, `${i}.cpuprofile`), JSON.stringify(profile)); }
  return { path: p, status: r.status, htmlBytes: Buffer.byteLength(body), wallMs: Math.round(ms), cpuMs: Math.round(cpuMs * 10) / 10, heapMB: mb(h.usedSize ?? 0), allocatedMB: mb(h.totalSize ?? 0), by: Object.fromEntries(Object.entries(by).filter(([k]) => k !== '(idle)').map(([k, v]) => [k, Math.round(v * 10) / 10])) };
}

await seed();
const cold = Number(process.env.COLD ?? 0);
if (cold) {
  for (const [i, p] of paths.slice(0, cold).entries()) { const w = await start(); try { out({ cold: true, ...(await ask(w.c, p, i)) }); } finally { await w.stop(); } }
} else {
  const w = await start();
  try { for (const [i, p] of paths.entries()) out({ n: i, ...(await ask(w.c, p, i)) }); } finally { await w.stop(); }
}
process.exit(0);

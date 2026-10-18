// The Worker's heap in Cloudflare's own runtime, run locally (round seventy-six; docs/SCALE-STUDY.md section 6): a local
// R2 is filled with a corpus, `wrangler dev` (workerd) is started on the built Worker, and for each case a fresh copy
// answers its first requests; after each, the isolate's heap is read through the inspector (V8's `Runtime.getHeapUsage`
// two seconds after each answer; workerd's inspector does not collect garbage on request). workerd here does not enforce Cloudflare's 128 MB, so this measures what a copy
// holds; the memory test in DEPLOY.md reads Cloudflare's own verdict.
//
//   node scripts/dev/scale/workerd-heap.mjs <built project dir> <dir holding s/v2> <label> [case ...]
//   a case is one or more paths joined by "+", answered in order by one fresh copy: /species/copiapoa-cinerea+/api/search?q=aloe
// Env: PORT (default 4611), STATE (the local R2's folder; filled once, kept), KEYS (dossier keys to put, comma-separated).
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [project, corpus, label, ...cases] = process.argv.slice(2);
const PORT = Number(process.env.PORT ?? 4611), INSPECT = PORT + 5000;
const state = resolve(process.env.STATE ?? `${corpus}/.wrangler-state`);
const keys = (process.env.KEYS ?? '7284333,2777724').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  if (existsSync(join(state, 'seeded'))) return;
  const m = await import(resolve(project, 'node_modules/miniflare/dist/src/index.js'));
  const { Miniflare, convertV4MiniflareOptions } = m.Miniflare ? m : m.default;
  // As `wrangler r2 object put --local` makes its bucket, so `wrangler dev --persist-to` finds the objects.
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response(null) } }', resourcePersistencePath: join(state, 'v3'), r2Buckets: { BUCKET: 'cultifolio' } }));
  const bucket = await mf.getR2Bucket('BUCKET');
  const dir = join(corpus, 's/v2');
  let n = 0;
  for (const f of readdirSync(join(dir, 'p'))) { await bucket.put(`s/v2/p/${f}`, readFileSync(join(dir, 'p', f))); n++; }
  for (const k of keys) if (existsSync(join(dir, `${k}.json`))) { await bucket.put(`s/v2/${k}.json`, readFileSync(join(dir, `${k}.json`))); n++; }
  await bucket.put('s/v2/manifest.json', readFileSync(join(dir, 'manifest.json')));
  await mf.dispose();
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, 'seeded'), `${n + 1} objects\n`);
  console.error(`seeded ${n + 1} objects into ${state}`);
}

/** The inspector, through the `ws` package (wrangler's own dependency): node's WebSocket is refused by wrangler's inspector proxy. */
async function cdp(url) {
  const { default: WS } = await import(resolve(project, 'node_modules/ws/index.js'));
  const ws = new WS(url);
  let id = 0;
  const waiting = new Map();
  ws.on('message', (m) => { const x = JSON.parse(String(m)); if (x.id && waiting.has(x.id)) { waiting.get(x.id)(x); waiting.delete(x.id); } });
  const open = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  // An answer not given in 20 s is null (a method this runtime does not answer).
  return { open, send: (method, params = {}) => new Promise((r) => { const i = ++id; waiting.set(i, r); setTimeout(() => { if (waiting.delete(i)) r({ timeout: true }); }, 20_000); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}

async function one(paths) {
  // The Worker's own cache (the Cache API) is kept in the state folder: a search answered by an earlier case is not a cold one.
  rmSync(join(state, 'v3', 'cache'), { recursive: true, force: true });
  // In a process group of its own, so workerd, which wrangler starts, goes with it.
  const child = spawn(process.execPath, [resolve(project, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(PORT), '--inspector-port', String(INSPECT), '--persist-to', state, '--var', 'E2E_OFFLINE:1', '--log-level', 'warn'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  const say = (x) => { if (process.env.DEBUG) console.error(x); };
  let log = '';
  child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; ; i++) {
      if (i > 120) throw new Error(`wrangler dev did not start:\n${log.slice(-2000)}`);
      try { const r = await fetch(`http://127.0.0.1:${PORT}/robots.txt`); if (r.ok) break; } catch { /* not yet */ }
      await sleep(1000);
    }
    const targets = await (await fetch(`http://127.0.0.1:${INSPECT}/json/list`)).json();
    const t = targets.find((x) => /cultifolio/.test(`${x.title} ${x.url}`)) ?? targets[0];
    say(`inspector ${t.webSocketDebuggerUrl}`);
    const c = await cdp(t.webSocketDebuggerUrl);
    await c.open;
    say('open');
    // workerd's inspector does not answer `HeapProfiler.collectGarbage`, so the figures are V8's heap as it stands two
    // seconds after the answer: `heapMB` what is in use (live objects and garbage not yet collected), `allocatedMB` what the
    // heap has taken from the system, and `outsideMB` what the isolate holds outside it (array buffers, the embedder's own).
    const mb = (x) => Math.round((x / 1048576) * 10) / 10;
    const heap = async () => { await sleep(2000); const r = (await c.send('Runtime.getHeapUsage')).result ?? {}; return { heapMB: mb(r.usedSize ?? 0), allocatedMB: mb(r.totalSize ?? 0), outsideMB: mb((r.embedderHeapUsedSize ?? 0) + (r.backingStorageSize ?? 0)) }; };
    const out = { label, paths, start: await heap(), steps: [] };
    for (const p of paths) {
      const t0 = performance.now();
      const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { redirect: 'manual', headers: { 'user-agent': 'cultifolio-review/76' } });
      const body = await r.text();
      out.steps.push({ path: p, status: r.status, bytes: body.length, ms: Math.round(performance.now() - t0), ...(await heap()) });
    }
    c.close();
    return out;
  } finally {
    try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ }
    await new Promise((r) => { child.on('exit', r); setTimeout(r, 5000); });
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
}

await seed();
for (const k of cases.length ? cases : ['/species/copiapoa-cinerea', '/', '/api/dossier/7284333', '/api/search?q=aloe', '/species/copiapoa-cinerea+/api/search?q=aloe']) console.log(JSON.stringify(await one(k.split('+'))));

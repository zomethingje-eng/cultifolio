/**
 * Round seventy-seven's proof on the real corpus (docs/SCALE-STUDY.md section 6): for the fixed list of queries
 * (scripts/dev/scale/r77-queries.txt), the search route answers the same through the build's key files as through the
 * whole index, rank for rank, and under the key files it never reads the index.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r77-proof.ts run <s/v2 after --index> whole <queries> <out.jsonl>
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r77-proof.ts run <s/v2 after --index> files <queries> <out.jsonl>
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r77-proof.ts compare <whole.jsonl> <files.jsonl>
 *
 * `whole` serves the corpus's index alone, with no manifest: the Worker then searches the whole index prepared, as it
 * always has without a manifest; that is today's whole-index search. `files` serves the corpus as the build wrote it,
 * from a bucket over the directory that refuses the index: each query is asked of a cold copy (nothing held but the
 * load), and the files it read are counted. Each query is asked of the route as the front page asks it, at the most
 * hits it gives (`n=100`; a smaller n is the same list cut). The answers are compared whole: every hit in order, every
 * field, the words searched (`relaxed`), the similar-spelling mark (`near`); `narrow` is the key files' answer when a
 * query of several words has every word too common to list.
 *
 * Round seventy-eight: the corpus directory may be of any dossier version (`s/v2` or `s/v3`), and each hit is recorded with
 * its page named by its GBIF key, as the hits of round seventy-seven were: a hit that carries `gbif` (a page keyed by its
 * id) has `key` set to it and `gbif` taken out, and its `near` named by GBIF key from the corpus's index. So a run on a
 * corpus of version 3 compares with a run of round seventy-seven on version 2 (`compare`), and rank for rank.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { _forgetIndex, corpusNow } from '$lib/server/dossiers';
import { resetRateLimits } from '$lib/server/sync';
import { GET as searchGet } from '../../../src/routes/api/search/+server';

const [mode, ...args] = process.argv.slice(2);
const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

if (mode === 'run') {
  const [dir, how, queries, out] = args;
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const v = `s/v${manifest.v}/`;
  const indexPath = `${v}p/${manifest.files['index.json']}.json`;
  const old = new Set(Object.entries(manifest.files as Record<string, string>).filter(([n]) => /^postings\/|^short\.json$/.test(n)).map(([, h]) => `${v}p/${h}.json`));
  let reads = 0, bytes = 0, indexReads = 0, oldReads = 0;
  const at = (k: string) => `${dir}/${k.slice(v.length)}`; // a bucket key, on disk
  const text = (k: string) => readFileSync(at(k), 'utf8');
  const has = (k: string) => k.startsWith(v) && existsSync(at(k));
  const obj = (k: string, body: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag: `"${k}"`, body });
  // Each page by its GBIF key (round seventy-eight), from the corpus's index: what a hit's `near` is named by.
  const gbifOf = new Map((JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as Array<{ key: number | string; gbif?: number }>).map((e) => [e.key, e.gbif ?? e.key]));
  const byGbif = (h: Record<string, unknown>) => {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(h)) {
      if (k === 'gbif') continue;
      o[k] = k === 'key' ? (h.gbif ?? x) : k === 'near' && Array.isArray(x) ? x.map((n) => gbifOf.get(n as never) ?? n) : x;
    }
    return o;
  };
  const store = how === 'whole'
    ? { get: async (k: string) => (k === `${v}index.json` ? obj(k, readFileSync(`${dir}/index.json`, 'utf8')) : null), head: async (k: string) => (k === `${v}index.json` ? { etag: '"index"' } : null) }
    : {
        get: async (k: string) => {
          if (k === indexPath || k === `${v}index.json`) { indexReads++; throw new Error('the index was read'); }
          if (old.has(k)) oldReads++;
          reads++;
          if (!has(k)) return null;
          const b = text(k);
          bytes += b.length;
          return obj(k, b);
        },
        head: async (k: string) => (has(k) ? { etag: `"${k}"`, size: statSync(at(k)).size } : null)
      };
  const platform = { env: { STORE: store } } as unknown as App.Platform;
  const lines = readFileSync(queries, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  const rows: string[] = [];
  const t0 = performance.now();
  for (const [q, kind] of lines) {
    resetRateLimits();
    if (how === 'files') _forgetIndex(); // a cold copy for each query: what it reads is what it needs
    await corpusNow(platform, noStatic);
    const r0 = reads, b0 = bytes;
    const t = performance.now();
    const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&n=100&shape=2`);
    const res = await searchGet({ url, platform, fetch: noStatic, request: new Request(url), getClientAddress: () => '192.0.2.77', params: {}, setHeaders: () => {} } as never);
    const ms = performance.now() - t;
    const body = await res.text();
    let a: { hits?: Array<Record<string, unknown>>; relaxed?: unknown; near?: unknown; narrow?: unknown } = {};
    try { a = JSON.parse(body); } catch { /* a refusal */ }
    const hits = (a.hits ?? []).map(byGbif);
    rows.push(JSON.stringify({ q, kind, status: res.status, keys: hits.map((h) => h.key), hits: md5(JSON.stringify(hits)), relaxed: a.relaxed ?? null, near: a.near ?? false, narrow: a.narrow ?? false, reads: reads - r0, bytes: bytes - b0, ms: Math.round(ms * 10) / 10 }));
  }
  writeFileSync(out, rows.join('\n') + '\n');
  console.log(`${how}: ${lines.length} queries in ${Math.round((performance.now() - t0) / 1000)} s${how === 'files' ? `; the index read ${indexReads} times, the postings and short.json ${oldReads} times` : ''}`);
} else if (mode === 'compare') {
  const [wf, ff] = args;
  type Row = { q: string; kind: string; status: number; keys: number[]; hits: string; relaxed: unknown; near: boolean; narrow: boolean; reads: number; bytes: number; ms: number };
  const read = (f: string) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row);
  const W = read(wf), F = read(ff);
  if (W.length !== F.length) throw new Error('the two runs asked different lists');
  const byKind = new Map<string, { n: number; same: number; narrow: number; other: number }>();
  const narrow: string[] = [], other: string[] = [];
  const reads: number[] = [], bytes: number[] = [];
  for (let i = 0; i < W.length; i++) {
    const w = W[i], f = F[i];
    if (w.q !== f.q) throw new Error(`line ${i + 1}: ${w.q} against ${f.q}`);
    const k = w.kind.replace(/-\d+$/, '');
    const t = byKind.get(k) ?? { n: 0, same: 0, narrow: 0, other: 0 };
    byKind.set(k, t);
    t.n++;
    reads.push(f.reads); bytes.push(f.bytes);
    const same = w.status === f.status && w.hits === f.hits && JSON.stringify(w.relaxed) === JSON.stringify(f.relaxed) && w.near === f.near && !f.narrow;
    if (same) { t.same++; continue; }
    if (f.narrow && f.status === 200) { t.narrow++; narrow.push(`${JSON.stringify(w.q)} (${w.kind}): the whole index answers ${w.keys.length} hits${w.relaxed ? `, ${JSON.stringify(w.relaxed)}` : ''}`); continue; }
    t.other++;
    other.push(`${JSON.stringify(w.q)} (${w.kind}): whole ${w.status} ${w.keys.slice(0, 8).join(',')}${w.keys.length > 8 ? '…' : ''} ${JSON.stringify(w.relaxed)} near ${w.near}; files ${f.status} ${f.keys.slice(0, 8).join(',')}${f.keys.length > 8 ? '…' : ''} ${JSON.stringify(f.relaxed)} near ${f.near}`);
  }
  const pct = (xs: number[], p: number) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  console.log(`${W.length} queries: ${W.length - narrow.length - other.length} the same, ${narrow.length} "type another letter", ${other.length} other differences`);
  for (const [k, t] of [...byKind].sort()) console.log(`  ${k.padEnd(20)} ${String(t.n).padStart(6)} asked, ${String(t.same).padStart(6)} the same, ${t.narrow} narrow, ${t.other} other`);
  console.log(`files read per query, cold (directories, key files, answers): median ${pct(reads, 0.5)}, 90% ${pct(reads, 0.9)}, 99% ${pct(reads, 0.99)}, most ${Math.max(...reads)}; bytes median ${pct(bytes, 0.5)}, 90% ${pct(bytes, 0.9)}, 99% ${pct(bytes, 0.99)}, most ${Math.max(...bytes)}`);
  console.log(`\nEvery "type another letter" (narrow):\n  ${narrow.join('\n  ') || 'none'}`);
  console.log(`\nEvery other difference:\n  ${other.join('\n  ') || 'none'}`);
}

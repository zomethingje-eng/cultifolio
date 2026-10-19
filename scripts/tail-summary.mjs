// What `wrangler tail --format json` wrote, summed up for a person: how each kind of request ended, its CPU and wall
// time, the slowest five, and loudly any request that did not end "ok" (rounds seventy-six and seventy-seven;
// docs/DEPLOY.md, "A cold start's CPU and memory").
//   node scripts/tail-summary.mjs tail.json          the summary
//   node scripts/tail-summary.mjs tail.json --all    and every request, one a line
//
// The file may be in any of the encodings a Windows shell writes: Windows PowerShell 5.1's `>` writes UTF-16 (little
// endian, with a byte-order mark); PowerShell 7 and cmd write UTF-8, with or without a mark. Round seventy-six read UTF-8
// only, and said "holds no requests" of a PowerShell file of 156. Inside, wrangler writes one pretty-printed JSON object
// a request, one after another; a file of one object a line (NDJSON) is read too, and anything else in it is passed by.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The text of the file's bytes, by its byte-order mark, or failing one by where its zero bytes fall. */
export function decode(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le'), encoding: 'UTF-16, as Windows PowerShell writes it' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: swap(buf.subarray(2)).toString('utf16le'), encoding: 'UTF-16, big endian' };
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString('utf8'), encoding: 'UTF-8' };
  // No mark: JSON is nearly all ASCII, so UTF-16 shows a zero byte beside nearly every character.
  let even = 0, odd = 0;
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) { if (i % 2) odd++; else even++; }
  if (odd > n / 4 && even < n / 50) return { text: buf.toString('utf16le'), encoding: 'UTF-16' };
  if (even > n / 4 && odd < n / 50) return { text: swap(buf).toString('utf16le'), encoding: 'UTF-16, big endian' };
  return { text: buf.toString('utf8'), encoding: 'UTF-8' };
}
function swap(b) {
  const out = Buffer.alloc(b.length - (b.length % 2));
  for (let i = 0; i + 1 < b.length; i += 2) { out[i] = b[i + 1]; out[i + 1] = b[i]; }
  return out;
}

/**
 * The top-level JSON objects in the text, by brace depth outside strings. A `{` at the start of a line always starts
 * one: wrangler indents everything inside an object, and NDJSON puts one object on each line, so a stray quote or brace
 * in a line that is not JSON (a warning) cannot swallow the rest. Returns the objects and how many pieces would not parse
 * (the last request, cut off by Ctrl-C, is often one).
 */
export function objectsIn(text) {
  const objs = [];
  let broken = 0;
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' && (i === 0 || text[i - 1] === '\n')) {
      if (depth > 0) broken++; // the piece before never closed
      depth = 1; start = i; inStr = false; esc = false;
      continue;
    }
    if (depth === 0) continue; // outside an object: not JSON, passed by
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"' || ch === '\n') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { objs.push(JSON.parse(text.slice(start, i + 1))); } catch { broken++; }
    }
  }
  if (depth > 0) broken++;
  return { objs, broken };
}

/** A request's kind, by its path: the six the owner reads. */
export const KINDS = ['species page', 'front page', 'catalogue', 'search', 'dossier API', 'other'];
export function kindOf(path) {
  if (/^\/species\/[^/?#]+/.test(path)) return 'species page';
  if (/^\/(__data\.json)?([?#]|$)/.test(path)) return 'front page';
  if (/^\/api\/rows([?/#]|$)/.test(path)) return 'catalogue';
  if (/^\/api\/search([?/#]|$)/.test(path)) return 'search';
  if (/^\/api\/dossier\//.test(path)) return 'dossier API';
  return 'other';
}

/** A search engine's or another robot's visit, by its user agent: the name it gives itself, or null for a browser. */
export function robotOf(ua) {
  if (!ua) return null;
  const m = /\b(Googlebot(?:-Image)?|Google-InspectionTool|GoogleOther|AdsBot-Google|Storebot-Google|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Applebot|PetalBot|SemrushBot|AhrefsBot|MJ12bot|DotBot|GPTBot|ClaudeBot|CCBot|Bytespider|facebookexternalhit|Amazonbot|SeznamBot|Qwantbot|[A-Za-z][\w-]*(?:bot|spider|crawler))\b/i.exec(ua);
  return m ? m[1] : null;
}

/** One row a request (or a scheduled run) from wrangler's objects. */
export function rowsOf(objs) {
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return objs.filter((o) => o && typeof o === 'object' && 'outcome' in o).map((o) => {
    const req = o.event?.request;
    const url = typeof req?.url === 'string' ? req.url : '';
    const path = url ? url.replace(/^https?:\/\/[^/]+/, '') || '/' : o.event?.cron ? `(scheduled: ${o.event.cron})` : '(not a web request)';
    const headers = req?.headers ?? {};
    const robot = robotOf(headers['user-agent'] ?? headers['User-Agent'] ?? '');
    return { outcome: String(o.outcome), cpu: num(o.cpuTime ?? o.event?.cpuTime), wall: num(o.wallTime ?? o.event?.wallTime), status: num(o.event?.response?.status), path, kind: url ? kindOf(path) : 'other', robot };
  });
}

/** The value `q` of them are at or under (nearest rank): 0.5 the middle one, 0.9 the one nine in ten are at or under, 1 the most. */
export function quantile(values, q) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))];
}

const pad = (s, n) => String(s ?? '').padEnd(n);
const lpad = (s, n) => String(s ?? '').padStart(n);
const ms = (x) => (x == null ? '?' : String(Math.round(x)));
const counted = (list) => [...list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The whole summary, as lines. */
export function summarise(rows, { all = false, file = 'tail.json', encoding = '', broken = 0 } = {}) {
  const out = [];
  const say = (s = '') => out.push(s);
  const bad = rows.filter((r) => r.outcome !== 'ok');
  const loud = () => {
    if (!bad.length) return;
    say('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    say(`!!! ${bad.length} of ${rows.length} requests did NOT end "ok". Send these lines to the developer now.`);
    for (const r of bad.slice(0, 20)) say(`!!!   ${pad(r.outcome, 16)} cpu ${lpad(ms(r.cpu), 5)} ms   ${r.path}`);
    if (bad.length > 20) say(`!!!   and ${bad.length - 20} more: run this again with --all to see each.`);
    say('!!! exceededCpu: the visitor saw "Error 1102". exceededMemory: the copy ran out of memory.');
    say('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    say();
  };
  const robots = rows.filter((r) => r.robot);
  say(`${file}: ${plural(rows.length, 'request')}${encoding ? ` (read as ${encoding})` : ''}.`);
  if (robots.length) say(`${robots.length} of them came from search engines and other robots (${counted(robots.map((r) => r.robot)).slice(0, 5).map(([k, n]) => `${k} ${n}`).join(', ')}), not from you.`);
  if (broken) say(`${plural(broken, 'piece')} of the file could not be read and ${broken === 1 ? 'was' : 'were'} passed by (Ctrl-C often cuts off the last request).`);
  say();
  loud();

  say('By kind of page, in milliseconds. "Middle" is the median: half took less. "9 in 10" is the 90th percentile:');
  say('nine in ten took that or less. "Most" is the longest.');
  say();
  say(`${pad('kind', 14)}${lpad('count', 6)}   ${pad('CPU: middle  9 in 10   most', 27)}   ${pad('wall: middle  9 in 10   most', 28)}   how they ended`);
  for (const kind of KINDS) {
    const of = rows.filter((r) => r.kind === kind);
    if (!of.length) continue;
    const trio = (v) => `${lpad(ms(quantile(v, 0.5)), 6)}  ${lpad(ms(quantile(v, 0.9)), 7)}  ${lpad(ms(quantile(v, 1)), 5)}`;
    say(`${pad(kind, 14)}${lpad(of.length, 6)}        ${trio(of.map((r) => r.cpu))}         ${trio(of.map((r) => r.wall))}   ${counted(of.map((r) => r.outcome)).map(([o, n]) => `${o} ${n}`).join(', ')}`);
  }
  say();
  const slow = [...rows].sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1) || (b.wall ?? -1) - (a.wall ?? -1)).slice(0, 5);
  say(slow.length === 1 ? 'The slowest request, by CPU:' : `The slowest ${slow.length}, by CPU:`);
  say(`  ${pad('outcome', 16)}${lpad('cpu ms', 7)}${lpad('wall ms', 9)}  address`);
  for (const r of slow) say(`  ${pad(r.outcome, 16)}${lpad(ms(r.cpu), 7)}${lpad(ms(r.wall), 9)}  ${r.path}${r.robot ? `  (${r.robot})` : ''}`);
  say();
  if (all || rows.length <= 20) {
    say('Every request, in the order they came:');
    say(`${pad('outcome', 16)}${pad('cpu ms', 8)}${pad('wall ms', 9)}address`);
    for (const r of rows) say(`${pad(r.outcome, 16)}${pad(ms(r.cpu), 8)}${pad(ms(r.wall), 9)}${r.path}${r.robot ? `  (${r.robot})` : ''}`);
  } else {
    say(`To see all ${rows.length} requests, one a line: node scripts/tail-summary.mjs ${file} --all`);
  }
  say();
  const errors = rows.filter((r) => r.outcome === 'ok' && r.status != null && r.status >= 500);
  if (errors.length) say(`${plural(errors.length, 'request')} ended "ok" but answered an error (${[...new Set(errors.map((r) => r.status))].join(', ')}): ${errors.slice(0, 5).map((r) => r.path).join(', ')}. Tell the developer which.`);

  // What to do next, by docs/DEPLOY.md's rules.
  const hasCpu = rows.some((r) => r.cpu != null);
  const most = (list) => Math.max(0, ...list.map((r) => r.cpu ?? 0));
  say(`${plural(rows.length, 'request')}; the most CPU any took: ${most(rows)} ms.${bad.length ? ` ${bad.length} did not end "ok": ${[...new Set(bad.map((r) => r.outcome))].join(', ')}. Tell the developer which addresses.` : ' Every one ended "ok".'}`);
  say('What to do next:');
  if (!hasCpu) say('- The file holds no CPU times (an older wrangler). The dashboard has them: Workers & Pages, cultifolio, Metrics, CPU time.');
  if (bad.length) say('- Send this whole output to the developer now: some requests did not end "ok".');
  else if (hasCpu) {
    const sp = most(rows.filter((r) => r.kind === 'species page')), se = most(rows.filter((r) => r.kind === 'search'));
    const over = [...(sp > 300 ? [`a species page took ${sp} ms of CPU (more than 300)`] : []), ...(se > 1000 ? [`a search took ${se} ms of CPU (more than 1,000)`] : [])];
    if (over.length) say(`- Nothing is broken, but ${over.join(' and ')}: write it in the round's notes, with the table above.`);
    else say('- Nothing: no species page took more than 300 ms of CPU, and no search more than 1,000 ms.');
  }
  say('- On the Workers Free plan a request may use only 10 ms of CPU; be on Workers Paid before the launch.');
  if (bad.length) { say(); loud(); }
  return out;
}

export function main(argv, log = console.log) {
  const file = argv.find((a) => !a.startsWith('--')) ?? 'tail.json';
  let buf;
  try { buf = readFileSync(file); } catch { log(`${file} is not there. Run wrangler tail first, in this same folder (docs/DEPLOY.md, "A cold start's CPU and memory").`); return 1; }
  const { text, encoding } = decode(buf);
  const { objs, broken } = objectsIn(text);
  const rows = rowsOf(objs);
  if (!rows.length) {
    log(`${file} holds no requests ${buf.length ? `(${buf.length} bytes, read as ${encoding})` : '(it is empty)'}.`);
    log('Leave wrangler tail running while you open the pages, then press Ctrl-C, and run this again.');
    if (buf.length && !text.includes('"outcome"')) log('Open the file in Notepad: it should hold blocks that begin with { and name an "outcome". If it does not, send its first lines to the developer.');
    return 1;
  }
  log(summarise(rows, { all: argv.includes('--all'), file, encoding, broken }).join('\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));

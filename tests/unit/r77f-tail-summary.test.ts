/**
 * Round seventy-seven (F), item 1: `scripts/tail-summary.mjs` reads what `wrangler tail --format json > tail.json`
 * wrote in Windows PowerShell 5.1, which is UTF-16 with a byte-order mark (FF FE). On r77base the owner's file of 156
 * requests read as "holds no requests": the script read the bytes as UTF-8, and every brace had a zero byte beside it.
 * It now reads UTF-16 (either order, with or without a mark) and UTF-8 (with or without one), wrangler's stream of
 * pretty-printed objects and NDJSON, and says per kind of page the count, the median, the 90th percentile and the most
 * CPU and wall time and how they ended, the slowest five, the robots among them, and loudly any outcome that is not ok.
 * Every case marked FAILS fails on r77base (checked with the base's script).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quantile, kindOf, robotOf, objectsIn } from '../../scripts/tail-summary.mjs';

const run = (bytes: Buffer, ...args: string[]) => {
  const f = join(mkdtempSync(join(tmpdir(), 'tail-')), 'tail.json');
  writeFileSync(f, bytes);
  try { return { code: 0, out: execFileSync(process.execPath, ['scripts/tail-summary.mjs', f, ...args], { encoding: 'utf8' }) }; } catch (e) { const x = e as { status: number; stdout: string }; return { code: x.status, out: x.stdout }; }
};
const GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const BING = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)';
const ME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
/** One event as wrangler 4 writes it (`JSON.stringify(event, null, 2)`), its fields as Cloudflare's tail gives them. */
const event = (path: string, cpuTime: number, wallTime: number, ua = ME, outcome = 'ok', status = 200) => ({
  wallTime, cpuTime, truncated: false, executionModel: 'stateless', outcome, scriptName: 'cultifolio', diagnosticsChannelEvents: [], exceptions: [],
  logs: [{ message: ['a { brace "in" a log'], level: 'log', timestamp: 1760000000000 }], eventTimestamp: 1760000000000,
  event: { request: { url: `https://cultifolio.com${path}`, method: 'GET', headers: { 'user-agent': ua, accept: 'text/html' }, cf: { colo: 'EWR' } }, response: { status } }
});
/** The owner's case: his four, and 152 crawler visits to species pages. */
const owners = () => [
  event('/species/copiapoa-cinerea', 298, 610), event('/species/copiapoa-cinerea', 4, 30), event('/', 41, 90), event('/api/search?q=aloe', 180, 400),
  ...Array.from({ length: 152 }, (_, i) => event(`/species/s-${i}`, 10 + ((i * 37) % 280), 40 + ((i * 53) % 900), i % 3 ? GOOGLE : BING))
];
const pretty = (evs: unknown[], eol = '\r\n') => evs.map((o) => JSON.stringify(o, null, 2)).join('\n').replace(/\n/g, eol) + eol;
const utf16le = (s: string, bom = true) => Buffer.concat([Buffer.from(bom ? [0xff, 0xfe] : []), Buffer.from(s, 'utf16le')]);
const utf16be = (s: string) => { const le = Buffer.from(s, 'utf16le'); const be = Buffer.alloc(le.length); for (let i = 0; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i]; } return Buffer.concat([Buffer.from([0xfe, 0xff]), be]); };

describe('the file as each Windows shell writes it', () => {
  it('Windows PowerShell 5.1: UTF-16 with its mark, lines ending CRLF, 156 requests (FAILS on r77base: "holds no requests")', () => {
    const { code, out } = run(utf16le(pretty(owners())));
    expect(code).toBe(0);
    expect(out).toContain('156 requests (read as UTF-16, as Windows PowerShell writes it).');
    expect(out).toContain('156 requests; the most CPU any took: 298 ms. Every one ended "ok".');
    expect(out).not.toContain('holds no requests');
  });
  it('UTF-16 big endian, UTF-16 without a mark, UTF-8 with and without its mark: the same requests (FAILS on r77base for both UTF-16s)', () => {
    const text = pretty(owners());
    for (const bytes of [utf16be(text), utf16le(text, false), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), Buffer.from(text.replace(/\r\n/g, '\n'))]) {
      const { code, out } = run(bytes);
      expect(code).toBe(0);
      expect(out).toContain('156 requests; the most CPU any took: 298 ms.');
    }
  });
  it('NDJSON, one object a line, with a line of wrangler\'s own between them that holds a stray quote and brace', () => {
    const lines = owners().slice(0, 4).map((o) => JSON.stringify(o));
    const { code, out } = run(Buffer.from(`▲ [WARNING] Proxy "environment {variables detected.\n${lines.join('\n')}\n`));
    expect(code).toBe(0);
    expect(out).toContain('4 requests; the most CPU any took: 298 ms.');
  });
  it('a request cut off by Ctrl-C is passed by and said, and the others are read', () => {
    const text = pretty(owners().slice(0, 3), '\n') + JSON.stringify(event('/species/x', 9, 9), null, 2).slice(0, 120);
    const { code, out } = run(utf16le(text));
    expect(code).toBe(0);
    expect(out).toContain('3 requests; the most CPU any took: 298 ms.');
    expect(out).toContain('1 piece of the file could not be read');
    expect(objectsIn(text).objs).toHaveLength(3);
  });
  it('a file with no request says so, with what to do', () => {
    expect(run(utf16le('wrangler said something\r\n'))).toMatchObject({ code: 1, out: expect.stringContaining('holds no requests (52 bytes, read as UTF-16, as Windows PowerShell writes it)') });
  });
});

describe('the summary for the owner\'s case (FAILS on r77base: one line a request and the most CPU, nothing else)', () => {
  it('per kind: the count, the median, the 90th percentile and the most of CPU and wall time, and how they ended', () => {
    const evs = [event('/species/a', 10, 100), event('/species/b', 20, 200), event('/species/c', 30, 300), event('/species/d', 40, 400), event('/species/e', 300, 900, GOOGLE),
      event('/', 5, 50), event('/?by=family', 7, 70), event('/api/rows?by=genus&chip=all&at=0&n=40', 3, 30), event('/api/search?q=aloe', 250, 600), event('/api/dossier/7284333', 2, 20, ME, 'exceededMemory'),
      event('/sitemap-1.xml', 1, 10)];
    const { out } = run(utf16le(pretty(evs)));
    const row = (kind: string) => out.split('\n').find((l) => l.startsWith(kind))!.replace(/\s+/g, ' ').trim();
    expect(row('species page')).toBe('species page 5 30 300 300 300 900 900 ok 5');
    expect(row('front page')).toBe('front page 2 5 7 7 50 70 70 ok 2');
    expect(row('catalogue')).toBe('catalogue 1 3 3 3 30 30 30 ok 1');
    expect(row('search')).toBe('search 1 250 250 250 600 600 600 ok 1');
    expect(row('dossier API')).toBe('dossier API 1 2 2 2 20 20 20 exceededMemory 1');
    expect(row('other')).toBe('other 1 1 1 1 10 10 10 ok 1');
  });
  it('the slowest five, robots named; crawlers counted apart from the owner\'s own requests; every request listed only on --all', () => {
    const { out } = run(utf16le(pretty(owners())));
    expect(out).toContain('152 of them came from search engines and other robots (Googlebot 101, bingbot 51), not from you.');
    const slow = out.slice(out.indexOf('The slowest 5, by CPU:')).split('\n').slice(2, 7).map((l) => l.replace(/\s+/g, ' ').trim());
    expect(slow).toEqual(['ok 298 610 /species/copiapoa-cinerea', 'ok 287 153 /species/s-121 (Googlebot)', 'ok 286 44 /species/s-68 (Googlebot)', 'ok 285 835 /species/s-15 (bingbot)', 'ok 282 48 /species/s-136 (Googlebot)']);
    expect(out).toContain('To see all 156 requests, one a line: node scripts/tail-summary.mjs');
    expect(out).not.toMatch(/\/species\/s-0\b/);
    expect(run(utf16le(pretty(owners())), '--all').out).toMatch(/ok\s+10\s+40\s+\/species\/s-0 {2}\(bingbot\)/);
    expect(out).toContain('- Nothing: no species page took more than 300 ms of CPU, and no search more than 1,000 ms.');
  });
  it('an outcome other than ok is said loudly, above and below the tables', () => {
    const evs = [...owners().slice(0, 4), event('/species/aloe-vera', 30012, 30100, GOOGLE, 'exceededCpu'), event('/api/search?q=agave', 812, 900, ME, 'exceededMemory')];
    const { code, out } = run(utf16le(pretty(evs)));
    expect(code).toBe(0);
    expect(out.match(/!!! 2 of 6 requests did NOT end "ok"\. Send these lines to the developer now\./g)).toHaveLength(2);
    expect(out).toMatch(/!!! {3}exceededCpu {6}cpu 30012 ms {3}\/species\/aloe-vera/);
    expect(out).toContain('the most CPU any took: 30012 ms. 2 did not end "ok": exceededCpu, exceededMemory.');
    expect(out).toContain('- Send this whole output to the developer now');
  });
  it('over the round\'s bounds, but ok: said as a note for the round, not an alarm', () => {
    const { out } = run(Buffer.from(pretty([event('/species/a', 420, 900), event('/api/search?q=a', 1400, 2000)])));
    expect(out).toContain('- Nothing is broken, but a species page took 420 ms of CPU (more than 300) and a search took 1400 ms of CPU (more than 1,000): write it in the round\'s notes');
    expect(out).not.toContain('!!!');
  });
});

describe('the pieces', () => {
  it('nearest-rank percentiles, the kinds by path, and robots by user agent', () => {
    expect([quantile([5, 1, 4, 2, 3], 0.5), quantile([5, 1, 4, 2, 3], 0.9), quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), quantile([], 0.5), quantile([7, null], 1)]).toEqual([3, 5, 9, null, 7]);
    expect(['/species/aloe-vera', '/species/aloe-vera/__data.json', '/', '/__data.json', '/?q=1', '/api/rows?at=0', '/api/search?q=a', '/api/dossier/1', '/about/how', '/speciesx'].map(kindOf))
      .toEqual(['species page', 'species page', 'front page', 'front page', 'front page', 'catalogue', 'search', 'dossier API', 'other', 'other']);
    expect([robotOf(GOOGLE), robotOf(BING), robotOf('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0)'), robotOf(ME), robotOf('')]).toEqual(['Googlebot', 'bingbot', 'ClaudeBot', null, null]);
  });
});

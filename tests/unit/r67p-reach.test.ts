/**
 * Refusals said as refusals, on the client (round sixty-seven; triage-66 S8, IND-7, R45-11). `sheetsFor` and `entriesFor`
 * turned every non-ok answer into null, and Today, the labels and the plant page said a 429 with Retry-After 30 as "the
 * species sheets did not answer"; "Check again" was refused again at once. The typed failure carries the kind, the
 * server's reason and its Retry-After.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

type Answer = { status: number; body?: unknown; headers?: Record<string, string> } | 'offline';
let sheetsAnswer: Answer = { status: 200, body: [] };
let entriesAnswer: Answer = { status: 200, body: [] };
const asked: string[] = [];
function respond(a: Answer): Response {
  if (a === 'offline') throw new TypeError('Failed to fetch');
  return new Response(a.body === undefined ? '' : typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status, headers: { 'content-type': 'application/json', ...(a.headers ?? {}) } });
}

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('fetch', async (u: string) => {
    asked.push(u);
    if (u.startsWith('/api/corpus')) return respond({ status: 200, body: { id: 'c1', buckets: 32 } });
    if (u.startsWith('/api/sheets')) return respond(sheetsAnswer);
    if (u.startsWith('/api/entries')) return respond(entriesAnswer);
    throw new Error(`unexpected ${u}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

async function fresh() {
  vi.resetModules();
  return import('$lib/ui/index.svelte');
}

describe('sheetsOr and entriesOr: why there is no answer', () => {
  it('a 429 with Retry-After is "limited", with the server\'s reason and the wait; sheetsFor still gives null', async () => {
    sheetsAnswer = { status: 429, body: { error: 'too many requests from this address; wait and try again', retryAfter: 30 }, headers: { 'retry-after': '30' } };
    const ix = await fresh();
    const m = await ix.sheetsOr(['copiapoa-cinerea']);
    expect(ix.isUnreached(m)).toBe(true);
    if (!ix.isUnreached(m)) return;
    expect([m.kind, m.status, m.retryAfter, m.reason]).toEqual(['limited', 429, 30, 'too many requests from this address; wait and try again']);
    expect(ix.waitLeft(m, m.at + 10_000)).toBe(20);
    expect(ix.waitLeft(m, m.at + 31_000)).toBe(0);
    expect(await ix.sheetsFor(['copiapoa-cinerea'])).toBeNull();
  });
  it('a 503 with a reason is "refused"; a bare body still is', async () => {
    sheetsAnswer = { status: 503, body: { error: 'The species sheets could not all be read just now.', retryAfter: 12 }, headers: { 'retry-after': '12' } };
    let ix = await fresh();
    let m = await ix.sheetsOr(['copiapoa-cinerea']);
    expect(ix.isUnreached(m) && [m.kind, m.reason, m.retryAfter]).toEqual(['refused', 'The species sheets could not all be read just now.', 12]);
    sheetsAnswer = { status: 503, body: 'busy' };
    ix = await fresh();
    m = await ix.sheetsOr(['copiapoa-cinerea']);
    expect(ix.isUnreached(m) && [m.kind, m.reason, m.retryAfter]).toEqual(['refused', null, null]);
  });
  it('no answer at all is "unreachable"', async () => {
    entriesAnswer = 'offline';
    const ix = await fresh();
    const m = await ix.entriesOr(['copiapoa-cinerea']);
    expect(ix.isUnreached(m) && m.kind).toBe('unreachable');
    expect(await ix.entriesFor(['copiapoa-cinerea'])).toBeNull();
  });
  it('a failed bucket is let go: the next call asks again, and an answer then is the map', async () => {
    sheetsAnswer = { status: 429, body: { error: 'wait' }, headers: { 'retry-after': '5' } };
    const ix = await fresh();
    expect(ix.isUnreached(await ix.sheetsOr(['copiapoa-cinerea']))).toBe(true);
    sheetsAnswer = { status: 200, body: [{ slug: 'copiapoa-cinerea', key: 1 }] };
    const m = await ix.sheetsOr(['copiapoa-cinerea']);
    expect(ix.isUnreached(m)).toBe(false);
    expect(m instanceof Map && m.get('copiapoa-cinerea')?.key).toBe(1);
    expect(asked.filter((u) => u.startsWith('/api/sheets')).length).toBe(2);
    // Each names the page's build, so the adapter's edge cache never answers a new build with an old one's (S7, S's need).
    expect(asked.filter((u) => u.startsWith('/api/sheets')).every((u) => /&v=[^&]+/.test(u))).toBe(true);
  });
  it("a name's sheet: the failure comes through sheetForNameOr; sheetForName keeps null", async () => {
    sheetsAnswer = { status: 429, body: { error: 'too many requests from this network; wait and try again' }, headers: { 'retry-after': '60' } };
    const ix = await fresh();
    const s = await ix.sheetForNameOr('Copiapoa cinerea', 1);
    expect(ix.isUnreached(s) && s.kind).toBe('limited');
    expect(await ix.sheetForName('Copiapoa cinerea', 1)).toBeNull();
  });
});

describe('the words: a refusal as a refusal, a limit as a limit, only silence as "did not answer"', () => {
  it('each kind', async () => {
    const { unreachedClause, againWords } = await import('$lib/ui/reach-words');
    const at = Date.now();
    const u = (kind: 'refused' | 'limited' | 'unreachable', reason: string | null, retryAfter: number | null) => ({ failed: true as const, kind, status: null, reason, retryAfter, at });
    expect(unreachedClause(u('limited', 'too many requests from this address; wait and try again', 30), 'the species sheets', at)).toBe('the server refused the species sheets for now: this address has asked too often; it can be asked again in 30 s');
    expect(unreachedClause(u('limited', 'too many requests from this network; wait and try again', 120), 'the species sheets', at)).toBe('the server refused the species sheets for now: this network has asked too often; it can be asked again in 2 min');
    expect(unreachedClause(u('refused', 'The species sheets could not all be read just now.', null), 'the species sheets', at)).toBe('the server refused the species sheets just now (the species sheets could not all be read just now)');
    expect(unreachedClause(u('unreachable', null, null), 'the species sheets', at)).toBe('the species sheets did not answer');
    expect(againWords(u('limited', null, 30), at)).toBe('Check again in 30 s');
    expect(againWords(u('limited', null, 30), at + 30_000)).toBe('Check again');
  });
});

describe('the pages use them', () => {
  const raw = (f: string) => readFileSync(f, 'utf8');
  it("Today's stops say why, and \"Check again\" waits out the Retry-After", () => {
    const t = raw('src/routes/today/+page.svelte');
    expect(t).toMatch(/void sheetsOr\(slugs\)\.then\(settle/);
    expect(t).toMatch(/function checkAgain\(\) \{\n\s*if \(!sheetsSettled \|\| waitLeft\(sheetsWhy\)\) return;/);
    expect(t).toMatch(/onclick=\{checkAgain\} aria-disabled=\{!sheetsSettled \|\| sheetsWait > 0\}>\{againWords\(sheetsWhy, nowMs\)\}/);
    expect(t).not.toMatch(/<span>: the species sheets did not answer\./);
  });
  it('the home summary and the labels say why', () => {
    expect(raw('src/lib/ui/Today.svelte')).toMatch(/resting months not checked: \$\{unreachedClause\(sheetsWhy, 'the species sheets'\)\}/);
    const l = raw('src/routes/labels/+page.svelte');
    expect(l).toMatch(/sheetForNameOr\(a\.taxonName, a\.taxonKey\)/);
    expect(l).toMatch(/if \(waitLeft\(careWhy\)\) return;/);
    expect(l).not.toMatch(/why="The species reference could not be reached from here\."/);
  });
});

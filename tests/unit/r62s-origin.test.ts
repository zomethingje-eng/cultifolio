/**
 * Round sixty-two, agent S (outside review A31, suspected; the triage, 6): `Origin: null` with no `Sec-Fetch-Site`.
 *
 * Under the Fetch standard a same-origin fetch POST from a page whose referrer policy is no-referrer sends `Origin: null`
 * (its response tainting is "basic", not "cors"), and a browser from before `Sec-Fetch-Site` (Safari before 16.4) sends
 * nothing else to tell it from a cross-site page that also hides its origin. The base refuses that header set, so every
 * sync write from such a browser was refused (reproduced below). The sync engine now marks its own requests with
 * `X-Cultifolio-Sync: 1`, a header a page on another site cannot add without a preflight, which this site never grants;
 * a request with `Origin: null`, no `Sec-Fetch-Site` and that header is let through. The Referer stays off.
 *
 * The first case FAILS on r62base; the rest are guards.
 */
import { describe, it, expect } from 'vitest';
import { _foreignWrite } from '../../src/hooks.server';

const SITE = 'https://cultifolio.com';
const url = new URL(`${SITE}/api/sync/log?vault=X`);
const req = (method: string, h: Record<string, string>) => new Request(url, { method, headers: h, body: 'x' });

describe('Origin: null from a browser without Sec-Fetch-Site', () => {
  it("lets through the sync engine's own write, marked with X-Cultifolio-Sync: 1", () => {
    for (const m of ['POST', 'PUT', 'DELETE']) expect(_foreignWrite(req(m, { origin: 'null', 'x-cultifolio-sync': '1' }), url)).toBe(false);
  });
  it('GUARD: still refuses the same request without the mark (a cross-site page hiding its origin)', () => {
    expect(_foreignWrite(req('POST', { origin: 'null' }), url)).toBe(true);
  });
  it('GUARD: the mark does not let through a request that names another site, or that a modern browser says is cross-site', () => {
    expect(_foreignWrite(req('POST', { origin: 'https://evil.example', 'x-cultifolio-sync': '1' }), url)).toBe(true);
    expect(_foreignWrite(req('POST', { origin: 'null', 'sec-fetch-site': 'cross-site', 'x-cultifolio-sync': '1' }), url)).toBe(true);
    expect(_foreignWrite(req('POST', { origin: 'null', 'x-cultifolio-sync': 'yes' }), url)).toBe(true);
  });
});

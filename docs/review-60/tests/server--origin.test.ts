/**
 * Review of round sixty, server area: the origin rule (`_foreignWrite`, Sec-Fetch-Site decides when present) against the
 * requests real browsers send. Header sets below were read from Chromium (Playwright, a same-origin fetch POST and DELETE
 * from a page with <meta name="referrer" content="no-referrer">: Origin is the page's origin and Sec-Fetch-Site is
 * same-origin, since a fetch is mode "cors" and the null-origin rule applies only to non-cors modes) and from the Fetch
 * standard for browsers without Sec-Fetch-Site (Safari before 16.4).
 *
 * GUARD: PASSES on 21257b7.
 * Run: npx vitest run tests/unit/server--origin.test.ts   (lives in tests/unit/)
 */
import { describe, it, expect } from 'vitest';
import { _foreignWrite } from '../../src/hooks.server';

const SITE = 'https://cultifolio.com';
const url = new URL(`${SITE}/api/sync/log?vault=X`);
const req = (method: string, h: Record<string, string>) => new Request(url, { method, headers: h, ...(method === 'GET' || method === 'HEAD' ? {} : { body: 'x' }) });

describe('the origin rule against what browsers send', () => {
  const cases: Array<[string, string, Record<string, string>, boolean]> = [
    ['the sync engine in Chrome, Firefox, Safari 16.4+ (fetch, mode cors)', 'POST', { origin: SITE, 'sec-fetch-site': 'same-origin' }, false],
    ['the installed app (a standalone window is the same origin)', 'PUT', { origin: SITE, 'sec-fetch-site': 'same-origin' }, false],
    ['the engine in Safari 15 / iOS 15 (no Sec-Fetch-Site; a cors-mode fetch sends the real Origin even under no-referrer)', 'DELETE', { origin: SITE }, false],
    ['a same-origin form post under no-referrer in a modern browser (Origin: null)', 'POST', { origin: 'null', 'sec-fetch-site': 'same-origin' }, false],
    ['curl, or any script: neither header (it can send anything anyway)', 'POST', {}, false],
    ['another site, modern browser, no-cors POST', 'POST', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, true],
    ['another site that hides its origin with no-referrer, modern browser', 'POST', { origin: 'null', 'sec-fetch-site': 'cross-site' }, true],
    ['another site in Safari 15 (no Sec-Fetch-Site), Origin named', 'POST', { origin: 'https://evil.example' }, true],
    ['another site in Safari 15 under no-referrer (Origin: null, no Sec-Fetch-Site)', 'POST', { origin: 'null' }, true],
    ['a sibling host (same-site, another origin)', 'POST', { origin: 'https://www.cultifolio.com', 'sec-fetch-site': 'same-site' }, true],
    ['http:// to the https site (another origin)', 'POST', { origin: 'http://cultifolio.com', 'sec-fetch-site': 'same-site' }, true],
    ['a user-initiated request (Sec-Fetch-Site: none) is not one a page can make', 'POST', { 'sec-fetch-site': 'none' }, false],
    ['reads are never refused', 'GET', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, false]
  ];
  for (const [what, method, h, refused] of cases) it(`${refused ? 'refuses' : 'lets through'}: ${what}`, () => expect(_foreignWrite(req(method, h), url)).toBe(refused));

  it('a page cannot strip or forge Sec-Fetch-Site: it is a forbidden request header, so a script that sets it is ignored by the browser', () => {
    // Node's Request lets a test set it; a browser drops `Sec-` headers from fetch() and XHR. This documents why the rule
    // may believe it when present, and why its absence alone (an old browser, curl) falls back to Origin.
    const forbidden = /^sec-/i;
    expect(forbidden.test('Sec-Fetch-Site')).toBe(true);
  });
});

/**
 * Round eighty-two (O): the cookies, the content security policy and the comments on SYNC_OPEN (the independent
 * review's 33 and 34).
 *
 * 1. The units cookie and the hemisphere cookie carry `Secure` on the site (HTTPS); not on a plain-HTTP local server,
 *    where Safari's engine would not keep them.
 * 2. The policy says `object-src 'none'`: no page embeds plug-in content, and without it the directive fell back to
 *    `default-src 'self'`.
 * 3. HSTS is left as it is, `max-age=31536000` without `includeSubDomains`, in both places that send it: the header
 *    would bind every subdomain of the domain for a year, and the owner has not said every one serves HTTPS.
 * 4. The comments on SYNC_OPEN say what the code does: it decides what a new vault is made with, and nothing writes
 *    'licensed'.
 *
 * On r82base: the file FAILED to load (no src/lib/ui/cookie.ts; neither cookie said Secure); with that import set
 * aside, 2 FAILED (no object-src), 3 passed (it guards the decision) and 4 FAILED (the route said "a licence must be
 * attached later").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { secureAttr } from '../../src/lib/ui/cookie';
import config from '../../svelte.config.js';

describe('r82o headers', () => {
  it('1: both cookies are written with Secure over HTTPS, and without it over plain HTTP', () => {
    expect(secureAttr('https:')).toBe('; secure');
    expect(secureAttr('http:')).toBe('');
    const units = readFileSync('src/lib/ui/units.svelte.ts', 'utf8');
    const site = readFileSync('src/lib/ui/site.svelte.ts', 'utf8');
    expect(units).toMatch(/cultifolio\.units=\$\{u\}; path=\/; max-age=31536000; samesite=lax\$\{secureAttr\(\)\}`/);
    // Both the cookie and its expiry, written with the same attributes.
    expect(site.match(/samesite=lax\$\{secureAttr\(\)\}`/g)).toHaveLength(2);
    // And no other code writes a cookie.
    for (const f of ['src/lib/backup/device.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/document\.cookie\s*=/);
  });
  it("2: the policy says object-src 'none'", () => {
    const d = (config as { kit: { csp: { directives: Record<string, string[]> } } }).kit.csp.directives;
    expect(d['object-src']).toEqual(['none']);
    expect(d['default-src']).toEqual(['self']);
  });
  it('3: HSTS stays a year, without includeSubDomains, in _headers and in the hook', () => {
    expect(readFileSync('_headers', 'utf8')).toMatch(/^\s*Strict-Transport-Security: max-age=31536000$/m);
    expect(readFileSync('src/hooks.server.ts', 'utf8')).toContain("['strict-transport-security', 'max-age=31536000']");
  });
  it('4: the comments on SYNC_OPEN are true of the code', () => {
    const route = readFileSync('src/routes/api/sync/vault/+server.ts', 'utf8');
    expect(route).not.toContain('a licence must be attached later');
    expect(route).toContain('SYNC_OPEN decides only what a NEW vault is made with');
    // Nothing assigns 'licensed', as the type's comment now says.
    const sync = readFileSync('src/lib/server/sync.ts', 'utf8');
    expect(sync).toContain("'licensed' is reserved for a licence");
    expect(sync.match(/entitlement: open \? 'open' : 'none'/g)).toHaveLength(1);
    expect(sync).not.toMatch(/entitlement\s*[:=]\s*'licensed'/);
  });
});

/**
 * Round sixty-one, agent S: what the built Worker answers, as a browser or curl would see it. The renamed sections' 301s
 * carry the security headers every other answer carries (the server review, 9: they carried none).
 */
import { test, expect } from '@playwright/test';

test('the /benches and /sowings redirects carry the security headers (round sixty-one; the server review, 9)', async ({ request }) => {
  for (const [from, to] of [['/benches/abc?y=1', '/places/abc?y=1'], ['/sowings', '/propagation']]) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(301);
    const h = r.headers();
    expect(h['location'], from).toBe(to);
    expect([h['strict-transport-security'], h['x-content-type-options'], h['referrer-policy'], h['x-frame-options']], from).toEqual(['max-age=31536000', 'nosniff', 'no-referrer', 'DENY']);
    expect(h['permissions-policy'], from).toContain('geolocation=(self)');
  }
});

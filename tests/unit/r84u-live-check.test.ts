/**
 * Round eighty-four, agent U: outside review B9. The index route sets `public, max-age=300` and /about/how says five
 * minutes; review B's GET met `public, max-age=14400` (Cloudflare's default Browser Cache TTL overriding the origin on an
 * answer from its cache), and nothing checked it. The live check now reads the header of its GET of /api/index and fails
 * past five minutes, naming the zone's setting rather than calling for a rollback.
 *
 * On r84base scripts/live-check-cache.mjs did not exist and the check read no header of /api/index. The check itself was
 * run against the local server through a proxy that set four hours on the index (fix-u.md, "Measured").
 */
import { describe, it, expect } from 'vitest';
import { indexCacheFault, INDEX_MAX_AGE } from '../../scripts/live-check-cache.mjs';

describe('the index\'s cache lifetime (B9)', () => {
  it('five minutes or less passes; four hours fails and says where to change it', () => {
    expect(INDEX_MAX_AGE).toBe(300);
    expect(indexCacheFault('public, max-age=300')).toBeNull();
    expect(indexCacheFault('public, max-age=60')).toBeNull();
    expect(indexCacheFault('no-store')).toBeNull();
    const f = indexCacheFault('public, max-age=14400')!;
    expect(f).toContain('max-age=14400 (240 minutes)');
    expect(f).toContain('Browser Cache TTL');
    expect(f).toContain('no rollback is needed');
    expect(indexCacheFault('')).toMatch(/no cache-control/);
    expect(indexCacheFault('public')).toMatch(/no max-age/);
    expect(indexCacheFault('public, max-age=300, s-maxage=86400')).toMatch(/s-maxage=86400/);
  });

});

/**
 * Round sixty, the configuration the server's answers depend on: SvelteKit's version poll is off (A3: a request
 * /about/how did not list), no dot-file is precached by the service worker (the product review, 12), the image rule
 * names the photograph hosts and nothing wider (the server review, 14), and _headers carries the security headers, the
 * offline page's noindex and the maps' day of cache (the a11y review, 9).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import config from '../../svelte.config.js';

describe('svelte.config.js (round sixty)', () => {
  const kit = (config as { kit: Record<string, any> }).kit; // eslint-disable-line @typescript-eslint/no-explicit-any
  it('the version poll is off', () => {
    expect(kit.version.pollInterval).toBe(0);
  });
  it('the service worker is given no dot-file and none of the corpus', () => {
    const files = kit.serviceWorker.files as (f: string) => boolean;
    expect(files('.assetsignore')).toBe(false);
    expect(files('maps/.hidden')).toBe(false);
    expect(files('s/v2/index.json')).toBe(false);
    expect(files('favicon.svg')).toBe(true);
    expect(files('maps/world.svg')).toBe(true);
    // and the worker filters its own list the same way, whatever the config passes
    expect(readFileSync('src/service-worker.ts', 'utf8')).toMatch(/const FILES = new Set\(files\.filter\(\(f\) => !dotFile\(f\)\)\)/);
  });
  it('images only from this site, data: and blob: URLs, and the four photograph hosts', () => {
    expect(kit.csp.directives['img-src']).toEqual(['self', 'data:', 'blob:', 'https://inaturalist-open-data.s3.amazonaws.com', 'https://static.inaturalist.org', 'https://upload.wikimedia.org', 'https://api.gbif.org']);
  });
});

describe('_headers (round sixty)', () => {
  const h = readFileSync('_headers', 'utf8');
  it('every file the Worker does not render carries the security headers', () => {
    const all = h.slice(h.indexOf('/*'), h.indexOf('\n\n', h.indexOf('/*')));
    expect(all).toContain('X-Content-Type-Options: nosniff');
    expect(all).toContain('Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=(), usb=()');
    expect(all).toContain('Strict-Transport-Security: max-age=31536000');
  });
  it('the offline page is noindex, and the maps are kept for a day', () => {
    expect(h).toMatch(/\n\/offline\n {2}X-Robots-Tag: noindex/);
    expect(h).toMatch(/\n\/maps\/\*\n {2}Cache-Control: public, max-age=86400/);
  });
});

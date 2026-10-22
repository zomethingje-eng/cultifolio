/**
 * Round eighty (U): what the service worker caches at install (the phone review's 10, the desktop review's 16).
 * `offlineBuild` reads the client build's manifest: Kit's entries and the nodes of the pages that work offline, with
 * everything they import, on demand or not, and never the app entry's list of every node. The worker takes the list
 * through `define` and leaves out the share image, the large icons, the maps and the WOFF fallbacks.
 *
 * On r80f: FAILED (no scripts/offline-files.mjs; the worker precached `build` and `files` whole).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { offlineBuild, OFFLINE_ROUTE } from '../../scripts/offline-files.mjs';

const G = '.svelte-kit/generated/client-optimized';
const manifest = {
  [`${G}/app.js`]: { file: '_app/immutable/entry/app.A.js', isEntry: true, imports: ['_shared.js'], dynamicImports: [`${G}/nodes/0.js`, `${G}/nodes/1.js`, `${G}/nodes/2.js`, `${G}/nodes/3.js`] },
  'node_modules/@sveltejs/kit/src/runtime/client/entry.js': { file: '_app/immutable/entry/start.B.js', isEntry: true, imports: ['_shared.js'] },
  '_shared.js': { file: '_app/immutable/chunks/shared.C.js' },
  [`${G}/nodes/0.js`]: { file: '_app/immutable/nodes/0.D.js', isEntry: true, imports: ['_shared.js'], css: ['_app/immutable/assets/0.E.css'], assets: ['_app/immutable/assets/public-sans-latin.F.woff2'] },
  [`${G}/nodes/1.js`]: { file: '_app/immutable/nodes/1.G.js', isEntry: true },
  [`${G}/nodes/2.js`]: { file: '_app/immutable/nodes/2.H.js', isEntry: true, imports: ['_species.js'] },
  [`${G}/nodes/3.js`]: { file: '_app/immutable/nodes/3.I.js', isEntry: true, dynamicImports: ['src/lib/backup/xlsx.ts'] },
  '_species.js': { file: '_app/immutable/chunks/species.J.js' },
  'src/lib/backup/xlsx.ts': { file: '_app/immutable/chunks/xlsx.K.js', isDynamicEntry: true, imports: ['_zip.js'] },
  '_zip.js': { file: '_app/immutable/chunks/zip.L.js' }
};
const routes: Record<string, string> = {
  [`${G}/nodes/0.js`]: 'src/routes/+layout.svelte',
  [`${G}/nodes/1.js`]: 'src/routes/+error.svelte',
  [`${G}/nodes/2.js`]: 'src/routes/species/[slug]/+page.svelte',
  [`${G}/nodes/3.js`]: 'src/routes/backup/+page.svelte'
};

describe('r80u offline files', () => {
  const list = offlineBuild(manifest, (k) => routes[k] ?? null);
  it('takes the entries, the layout, the error page and an offline page, with their styles, fonts and on-demand imports', () => {
    for (const f of ['entry/app.A.js', 'entry/start.B.js', 'chunks/shared.C.js', 'nodes/0.D.js', 'assets/0.E.css', 'assets/public-sans-latin.F.woff2', 'nodes/1.G.js', 'nodes/3.I.js', 'chunks/xlsx.K.js', 'chunks/zip.L.js']) expect(list).toContain(`_app/immutable/${f}`);
  });
  it('leaves out a species page and what only it imports, though the app entry lists every node', () => {
    expect(list).not.toContain('_app/immutable/nodes/2.H.js');
    expect(list).not.toContain('_app/immutable/chunks/species.J.js');
  });
  it('knows the offline routes: the collection, the front page, settings and the offline page; not species, about or compare', () => {
    for (const r of ['src/routes/+page.svelte', 'src/routes/plants/[acc]/+page.svelte', 'src/routes/places/+layout.ts', 'src/routes/propagation/new/+page.svelte', 'src/routes/labels/+page.svelte', 'src/routes/backup/+page.svelte', 'src/routes/sync/+page.svelte', 'src/routes/today/+page.svelte', 'src/routes/settings/+page.svelte', 'src/routes/offline/+page.svelte']) expect(OFFLINE_ROUTE.test(r), r).toBe(true);
    for (const r of ['src/routes/species/[slug]/+page.svelte', 'src/routes/about/how/+page.svelte', 'src/routes/compare/+page.svelte']) expect(OFFLINE_ROUTE.test(r), r).toBe(false);
  });
  it('the worker precaches the list when the build hands it over, leaves out the share image, the large icons, the maps and WOFF, and answers any page offline with its own', () => {
    const sw = readFileSync('src/service-worker.ts', 'utf8');
    expect(sw).toMatch(/OFFLINE_BUILD\.has\(p\)/);
    expect(sw).toMatch(/OFFLINE_FILES = new Set\(\['\/favicon\.svg', '\/manifest\.webmanifest', '\/icon-192\.png'\]\)/);
    expect(sw).toMatch(/\/\\\.woff\$\/\.test\(p\)/);
    expect(sw).toMatch(/if \(request\.mode === 'navigate'\) \{\n\s+try \{\n\s+return await fetch\(request\);\n\s+\} catch \{\n\s+return \(await cache\.match\('\/offline'\)\) \?\? Response\.error\(\);/);
    // Agent O's dev-only corpus server comes first (the merge, round eighty).
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/plugins: \[corpusOnDisk\(\), sveltekit\(\), offlineFiles\(\)\]/);
  });
});

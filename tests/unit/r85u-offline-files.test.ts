/**
 * Round eighty-five, agent U: review-c C6's other half. A species page carried over an update opens offline from the
 * offline page, which first loads the page's code (`preloadCode`): the species page's node and the layout node of its
 * address, with what they import. The install fetches neither (only the species page's stylesheets); `speciesBuild` names
 * the rest, which the worker fetches only when it carries pages over. The first run of the update without the layout node
 * stayed on "No connection" (fix-u.md, Measured).
 *
 * On r85base `speciesBuild` did not exist.
 */
import { describe, it, expect } from 'vitest';
import { offlineBuild, speciesBuild, SPECIES_NODES } from '../../scripts/offline-files.mjs';

const G = '.svelte-kit/generated/client-optimized';
const manifest = {
  [`${G}/app.js`]: { file: '_app/immutable/entry/app.A.js', isEntry: true, imports: ['_shared.js'], dynamicImports: [`${G}/nodes/0.js`, `${G}/nodes/5.js`, `${G}/nodes/6.js`, `${G}/nodes/7.js`] },
  '_shared.js': { file: '_app/immutable/chunks/shared.C.js' },
  [`${G}/nodes/0.js`]: { file: '_app/immutable/nodes/0.D.js', isEntry: true, imports: ['_shared.js'], css: ['_app/immutable/assets/0.E.css'] },
  [`${G}/nodes/5.js`]: { file: '_app/immutable/nodes/5.F.js', isEntry: true, imports: ['_shared.js'] },
  [`${G}/nodes/6.js`]: { file: '_app/immutable/nodes/6.G.js', isEntry: true, imports: ['_shared.js', '_climograph.js'], css: ['_app/immutable/assets/6.H.css'], assets: ['_app/immutable/assets/regions50.I.svg'], dynamicImports: ['_share.js'] },
  [`${G}/nodes/7.js`]: { file: '_app/immutable/nodes/7.J.js', isEntry: true },
  '_climograph.js': { file: '_app/immutable/chunks/climograph.K.js', css: ['_app/immutable/assets/climograph.L.css'] },
  '_share.js': { file: '_app/immutable/chunks/share.M.js', isDynamicEntry: true }
};
const routes: Record<string, string> = {
  [`${G}/nodes/0.js`]: 'src/routes/+layout.svelte',
  [`${G}/nodes/5.js`]: 'src/routes/species/[slug]/+layout.svelte',
  [`${G}/nodes/6.js`]: 'src/routes/species/[slug]/+page.svelte',
  [`${G}/nodes/7.js`]: 'src/routes/about/how/+page.svelte'
};
const routeOf = (k: string) => routes[k] ?? null;

describe('review-c C6: the species page\'s code, fetched when pages are carried over an update', () => {
  it('its page and its layout node, their imports and styles, less what the install has, and no images', () => {
    const install = offlineBuild(manifest, routeOf);
    expect(install).toContain('_app/immutable/assets/6.H.css'); // the install's species styles (round eighty-three)
    expect(install).not.toContain('_app/immutable/nodes/6.G.js');
    expect(install).toContain('_app/immutable/assets/climograph.L.css'); // and the styles of what it imports
    expect(speciesBuild(manifest, routeOf, install)).toEqual([
      '_app/immutable/chunks/climograph.K.js',
      '_app/immutable/chunks/share.M.js',
      '_app/immutable/nodes/5.F.js', // the layout of the address: without it the offline page could not open the page
      '_app/immutable/nodes/6.G.js'
    ]);
  });
  it('the two nodes are the species page\'s own, and no other page\'s', () => {
    expect(SPECIES_NODES.test('src/routes/species/[slug]/+page.svelte')).toBe(true);
    expect(SPECIES_NODES.test('src/routes/species/[slug]/+layout.svelte')).toBe(true);
    expect(SPECIES_NODES.test('src/routes/about/how/+page.svelte')).toBe(false);
    expect(SPECIES_NODES.test('src/routes/+layout.svelte')).toBe(false);
  });
});

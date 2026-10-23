/**
 * Round seventy-four, the owner's late decision: the site is for every home grower, indoors, on a patio or in a
 * greenhouse, from succulents to leafy plants and orchids, not for cactus, succulent or bulb growers. No page, about
 * page, title, description, share text, link-preview image, manifest or README pitches it to one kind of grower.
 *
 * The guard reads every visible string in src (`helpers/visible-text.ts`: markup, attributes and string literals, never
 * comments or identifiers) and the files a reader meets outside the pages. A mention of cacti, succulents, bulbs or
 * caudices is allowed only where it is a fact, each named below: the care groups, the search's generic nouns, a caudex
 * measurement, the example collection's own greenhouse, and the account of how today's species list was derived. On
 * r74base it failed on the front page's title, og:title, description, introduction and welcome ("Grow cacti, succulents
 * or bulbs?"), the link preview's alt and image words, and the README.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { piecesOf } from './helpers/visible-text';
import { OG_ALT } from '$lib/ui/ref/head';

const KIND = /\b(cact(us|i|uses)|succulents?|bulbs?|caudex|caudices|caudiciforms?)\b/gi;

/** Each factual mention, by file and the words around it. Every entry must still be found (a stale one fails). */
const ALLOWED: Array<[string, RegExp]> = [
  // the care groups, a table of convention the species page and the about page name as such
  ['src/lib/core/arch.ts', /Cactus or succulent|cacti and succulents|Bulb, tuber or caudex|bulbs, tubers and caudiciforms/],
  ['src/routes/about/how/+page.svelte', /care groups \(cactus or succulent; bulb, tuber or caudex;/],
  // the groups' agreement with Kew's lifeform, and Kew's own words quoted (round eighty-one, the owner's decision on D2)
  ['src/routes/about/how/+page.svelte', /agrees: "succulent" or "semisucculent" for a cactus or succulent; a geophyte, bulb, corm, tuber or caudex for a bulb, tuber or caudex;|groundsel was "a cactus or succulent" by its genus, Senecio, and bitter melon "a bulb, tuber or caudex"|Kew describes it as “succulent subshrub”/],
  // the search's generic nouns, listed
  ['src/lib/core/search.ts', /^(bulb|cactus|succulent)$/],
  ['src/routes/about/how/+page.svelte', /one-word names for a whole genus or family \(bulb, buttercup, cactus,|shrub, snowdrop, succulent, sumac|lily, daisy, palm, fern, cactus or orchid|"Pariette Cactus"|so "cactus" is the named cacti first/],
  // a caudex's diameter, a measurement a grower records
  ['src/lib/db/types.ts', /caudex|Caudex/],
  ['src/routes/plants/[acc]/+page.svelte', /^caudex$/],
  ['src/routes/about/formats/+page.svelte', /spread, caudex and/],
  // the example collection's own greenhouse bench
  ['src/lib/ui/grow/demo-seed.ts', /The cacti, in full sun\./],
  // how today's species list was derived: a fact about the corpus, worded as how it was built
  // (and round seventy-nine's, docs/PENDING-ABOUT-HOW-R79.md, once scripts/about-how-r79.mjs writes it)
  ['src/routes/about/how/+page.svelte', /(?:The species list was derived, not chosen by hand: every accepted species, as WCVP lists them, of 173 collector genera|plus every species Kew accepts of [\d,]+ collector genera taken whole) \(the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs/]
];

function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).map((f) => join(dir, f).replaceAll('\\', '/')).filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.d.ts')).sort();
}

describe('round seventy-four: the site speaks to every home grower, not to cactus, succulent or bulb growers', () => {
  it('no page or module mentions one kind of plant except where it is a fact, each named', () => {
    const found: string[] = [];
    const used = new Set<RegExp>();
    // the corpus build's own code is not served (src/lib/dossier); everything else in src is
    for (const f of files('src').filter((f) => !f.startsWith('src/lib/dossier/'))) {
      for (const p of piecesOf(f, readFileSync(f, 'utf8'))) {
        const t = p.text.replace(/\s+/g, ' ');
        const covered: Array<[number, number]> = [];
        for (const [file, re] of ALLOWED) if (file === f) for (const m of t.matchAll(new RegExp(re.source, re.flags + 'g'))) { covered.push([m.index!, m.index! + m[0].length]); used.add(re); }
        for (const m of t.matchAll(KIND)) if (!covered.some(([a, b]) => m.index! >= a && m.index! < b)) found.push(`${f}:${p.line}: …${t.slice(Math.max(0, m.index! - 60), m.index! + 60)}…`);
      }
    }
    expect(found).toEqual([]);
    expect(ALLOWED.filter(([, re]) => !used.has(re)).map(([f, re]) => `${f}: ${re.source}`)).toEqual([]);
  }, 60_000); // reads every file in src: about 5 s alone, past the default 20 s when the whole suite shares two cores
  it('the files a reader meets outside the pages say the same: the link preview, its image, the manifest, the app shell', () => {
    for (const [name, text] of [['OG_ALT', OG_ALT], ['scripts/dev/og.html', readFileSync('scripts/dev/og.html', 'utf8')], ['static/app/manifest.webmanifest', readFileSync('static/app/manifest.webmanifest', 'utf8')], ['src/app.html', readFileSync('src/app.html', 'utf8')]] as const) expect(text.match(KIND), name).toBeNull();
    expect(OG_ALT).toContain('The plants people grow, each with its habitat climate where its records allow one. Every figure names its source.');
  });
  it('the README is for anyone who grows plants at home; succulents are named only as one end of that range', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('Cultifolio is for anyone who grows plants at home, indoors, on a patio or in a greenhouse, from succulents to leafy plants and orchids');
    expect(readme.replace('from succulents to leafy plants and orchids', '').match(KIND)).toBeNull();
  });
  it('the front page says what it is for every grower, with the live count, and the welcome says spaces', () => {
    const home = readFileSync('src/routes/+page.svelte', 'utf8');
    expect(home).toContain('<li>A reference for the plants people grow, {fmtN(data.total)} species so far, each with its habitat climate where its records allow one.</li>');
    expect(home).toContain("<b>Keep your plants' record on this device:</b> watering read against each species' habitat season, spaces, seed batches");
    expect(home).not.toMatch(/Grow cacti|cactus, succulent and bulb|plants most grown alongside them/i);
  });
});

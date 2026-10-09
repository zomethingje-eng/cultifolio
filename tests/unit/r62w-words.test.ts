/**
 * Round sixty-two, agent W: decision 9's words and decision 2's refusals on the species page, its previews, the card,
 * the label and the groups (outside review A2 to A4, A12, A21, A33, A35; visitor-words 3, 4, 11, 12, 13, 14). Each
 * test failed on the base of round sixty-two.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { coldFloor, cultivationSheet } from '$core/sheet';
import { careLine } from '$core/note';
import { archFor } from '$core/arch';
import { climateCardSvg } from '$lib/share/card';
import { speciesDescription, photoCredit, creditParts } from '$lib/ui/ref/head';
import { showable, photoSourceGaps } from '$lib/ui/ref/photos';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { powerCell, powerUrl } from '$climate/power';
import { fixtureFetcher } from '$dossier/fetch';

const tmax = [22, 22, 21, 20, 18, 17, 17, 17, 17, 18, 19, 20];
const tmin = [16, 16, 15, 14, 12, 10, 9, 9, 11, 11, 13, 14];
const rain = [4, 3, 5, 5, 7, 13, 10, 5, 5, 5, 5, 5];
const cinerea = tmax.map((t, i) => ({ tmax: t, tmin: tmin[i], tmean: (t + tmin[i]) / 2, precipMm: rain[i], dli: 30 + i, rh: 78 }));
const ex = { minAbs: 4, minP01: 6.5, maxP99: 29, frostDaysPerYear: 0, years: 40 };
/** A source file without its comments, which quote the old words as history. */
const code = (f: string) => readFileSync(f, 'utf8').replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the link preview and the one-line forms (A3, visitor-words 3 and 4)', () => {
  const head = (extremes: typeof ex | null) => speciesDescription({ name: { scientific: 'Copiapoa cinerea', family: 'Cactaceae' }, climate: { status: 'ok', months: cinerea, records: 1234, extremes }, native: 1, photos: 3, summary: true });
  it('says "habitat", "cold floor" and "a typical spot", never "in the wild", under 156 characters', () => {
    const d = head(ex);
    expect(d).not.toMatch(/in the wild/);
    expect(d.startsWith('Copiapoa cinerea habitat: cold floor 6.5 °C, 1 night in 100 at a typical spot (NASA POWER)')).toBe(true);
    expect(d).toMatch(/sum of monthly medians/);
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d.endsWith('.')).toBe(true); // whole parts left off, never a figure cut from its source
  });
  it('without extremes it names the mean nightly low as that', () => {
    expect(head(null)).toContain('coldest month, mean nightly low 9.0 °C (CHELSA)');
  });
  it("the sheet's one-line floor is named as the glance card names it", () => {
    expect(coldFloor(cinerea, ex, null)!.short).toBe('Cold floor (1 night in 100) 6.5 °C, at a typical spot in the range (NASA POWER).');
    expect(coldFloor(cinerea, null, null)!.short).toMatch(/^Coldest month, mean nightly low 9\.0 °C/);
  });
  it('the printed label says "floor … (1 in 100, NASA POWER)" and "open sky"', () => {
    const line = careLine({ scientific: 'Copiapoa cinerea', family: 'Cactaceae', climateStatus: 'ok', months: cinerea, extremes: ex, lat: -26 } as never);
    expect(line).toContain('floor 6.5 °C (1 in 100, NASA POWER)');
    expect(line).toContain('open sky 30–41 DLI');
    expect(line).not.toMatch(/hab\. night|· sky /);
  });
  it('the figure labels are the figures\' own names on the glance row, compare and the card', () => {
    for (const f of ['src/lib/ui/ref/Glance.svelte', 'src/routes/compare/+page.svelte', 'src/lib/share/card.ts']) {
      const s = code(f);
      expect(s, f).toMatch(/Warmest month, mean daily high/);
      expect(s, f).toMatch(/Coldest month, mean nightly low/);
      expect(s, f).toMatch(/Rain a year \(sum of monthly medians\)/);
      expect(s, f).not.toMatch(/mean day['<]|Coldest month, mean night['<]/);
    }
  });
});

describe('the share card (visitor-words 11, A3, A4)', () => {
  const card = (o: { extremes?: typeof ex | null; extremesStatus?: string | null; cells?: number; flat?: boolean } = {}) => {
    const months = o.flat ? cinerea : cinerea;
    const p10 = o.flat ? cinerea : cinerea.map((m) => ({ ...m, tmax: m.tmax - 2, tmin: m.tmin - 2 }));
    const p90 = o.flat ? cinerea : cinerea.map((m) => ({ ...m, tmax: m.tmax + 2, tmin: m.tmin + 2 }));
    return climateCardSvg({ name: 'Copiapoa cinerea', family: 'Cactaceae', origin: ['CLN'], slug: 'copiapoa-cinerea', cells: o.cells ?? 12, extremesStatus: o.extremesStatus, climate: { months, p10, p90, cells: o.cells ?? 12, extremes: o.extremes === undefined ? ex : o.extremes } });
  };
  it('with no floor it gives the glance row\'s reason, a refusal as "not checked"', () => {
    expect(card({ extremes: null, extremesStatus: 'refused' })).toContain('not a floor; extremes not checked · CHELSA');
    expect(card({ extremes: null, extremesStatus: 'skipped' })).toContain('extremes not asked for');
    expect(card({ extremes: null, extremesStatus: 'sea' })).toContain('extremes not used (sea cell)');
  });
  it('the record low is at a typical spot', () => {
    expect(card()).toContain('record low 4.0 °C in 40 years at a typical spot · NASA POWER');
  });
  it('the footer names the band only when the card draws one', () => {
    expect(card()).toContain('(band: 10th–90th percentile)');
    const one = card({ cells: 1, flat: true });
    expect(one).toContain('one cell, so no spread');
    expect(one).not.toContain('(band: 10th–90th percentile)');
  });
  it('says "Figures derived by rule", not "not written"', () => {
    expect(card()).toContain('Figures derived by rule.');
    expect(card()).not.toContain('not written');
  });
});

describe('the groups (A4)', () => {
  it('terrestrial orchids, rock and ground bromeliads and Selaginella are in no group', () => {
    for (const g of ['Paphiopedilum', 'Ludisia', 'Phaius', 'Phragmipedium', 'Cynorkis', 'Cymbidium']) expect(archFor(`${g} test`, 'Orchidaceae'), g).toBeNull();
    for (const g of ['Alcantarea', 'Billbergia']) expect(archFor(`${g} test`, 'Bromeliaceae'), g).toBeNull();
    expect(archFor('Selaginella test', 'Selaginellaceae')).toBeNull();
    expect(archFor('Phalaenopsis amabilis', 'Orchidaceae')?.arch.key).toBe('orchid'); // the rest of the group stays
  });
  it('the why text says what the table lists, not what the plant is', () => {
    expect(archFor('Copiapoa cinerea', 'Cactaceae')!.why).toBe('listed under the genus Copiapoa in the archetype table');
    const sheet = cultivationSheet({ scientific: 'Monstera deliciosa', family: 'Araceae' });
    expect(sheet.floor?.s ?? '').not.toMatch(/reliably one kind of plant/);
    expect(sheet.floor?.s ?? '').toContain('(listed under the genus Monstera in the archetype table)');
  });
});

describe('photographs (A35, visitor-words 14)', () => {
  it('a credit whose author line names another licence says the two disagree', () => {
    expect(photoCredit({ attribution: '(c) grower1, some rights reserved (CC BY)', licence: 'cc0' })).toBe('(c) grower1, some rights reserved (CC BY) · the source tags it CC0: the two licences disagree');
    expect(photoCredit({ attribution: '(c) J, some rights reserved (CC BY-SA)', licence: 'by' })).toMatch(/disagree/);
    expect(photoCredit({ attribution: '(c) J, some rights reserved (CC BY)', licence: 'by' })).toBe('(c) J, some rights reserved (CC BY)');
    expect(photoCredit({ attribution: 'J', licence: 'by-sa' })).toBe('J · CC BY-SA');
    expect(creditParts({ attribution: 'J (CC BY)', licence: 'cc0' })).toMatchObject({ lic: 'CC0', disagree: true });
  });
  it('the gallery and compare use the one credit helper', () => {
    expect(code('src/lib/ui/Photos.svelte')).toMatch(/photoCredit\(p\)/);
    expect(code('src/routes/compare/+page.svelte')).toMatch(/creditOf = photoCredit/);
  });
  it('a Commons photograph with no thumbnail is not shown; one with a thumbnail, and every other host, is', () => {
    const orig = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/File.jpg';
    expect(showable({ url: orig, thumb: '' })).toBe(false);
    expect(showable({ url: orig, thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/File.jpg/800px-File.jpg' })).toBe(true);
    expect(showable({ url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/File.jpg/800px-File.jpg' })).toBe(true);
    expect(showable({ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg', thumb: '' })).toBe(true);
  });
  it('the photograph sources say "refused" and "skipped" for what was refused and skipped (rule 2)', () => {
    const up = { 'inat.photos.wild': { status: 'refused' }, commons: { status: 'skipped' }, 'gbif.media': { status: 'error' } };
    expect(photoSourceGaps(up, 0)!.clause).toBe('iNaturalist refused, GBIF media did not answer and Wikimedia Commons was skipped (not asked)');
    // Beside photographs, a skipped source's earlier answer was carried over: only the refusal and the failure are named.
    expect(photoSourceGaps(up, 5)!.clause).toBe('iNaturalist refused and GBIF media did not answer');
    expect(photoSourceGaps({ commons: { status: 'skipped' } }, 5)).toBeNull();
    expect(photoSourceGaps({ 'inat.taxon': { status: 'skipped' }, 'inat.photos.wild': { status: 'refused' } }, 0)!.clause).toBe('iNaturalist refused');
  });
});

describe('the species page, compare and the 404 (A13, A21, A33, A35, visitor-words 12, 13)', () => {
  const page = code('src/routes/species/[slug]/+page.svelte');
  it('the page is keyed by its slug and guards an open notes draft', () => {
    expect(code('src/routes/species/[slug]/+layout.svelte')).toMatch(/\{#key page\.params\.slug\}\{@render children\(\)\}\{\/key\}/);
    expect(page).toMatch(/beforeNavigate\(\(nav\) => \{\n\s*if \(!myDirty\(\)/);
    expect(page).toMatch(/onbeforeunload=\{guardUnload\}/);
  });
  it('cf. and aff. plants are listed apart, as compared with this species', () => {
    expect(page).toMatch(/const mine = \$derived\(joined\.filter\(\(a\) => !isCompared\(a\)\)\)/);
    expect(page).toContain('Compared with this species:');
  });
  it('the other English names are separated by semicolons; a Related tile with no photograph draws no square', () => {
    expect(page).toContain("common.join('; ')");
    expect(page).not.toMatch(/class="noim"/);
  });
  it('the photograph lines use the gaps words, never a bare "did not answer" for every source', () => {
    expect(page).not.toMatch(/refusedPhotoNames\.join\(' and '\)\} did not answer/);
    expect(page).toMatch(/photoGaps\.clause/);
  });
  it('the 404 says "was not asked" for a held call', () => {
    const s = code('src/routes/species/[slug]/+page.server.ts');
    expect(s).toMatch(/heldBack \? "GBIF was not asked whether it is an older name for a species that is here: this site held its call to GBIF back for this minute"/); // round sixty-two, second pass: the words review's 15
    expect(s).not.toMatch(/was not checked: \$\{heldBack/);
  });
  it('compare says when it left a species out, and has a description', () => {
    expect(code('src/routes/compare/+page.server.ts')).toMatch(/leftOut = asked\.slice\(3\)/);
    const c = code('src/routes/compare/+page.svelte');
    expect(c).toMatch(/were'\} left out/);
    expect(c).toMatch(/<meta name="description"/);
  });
  it('one readerLat helper for the species page and compare', () => {
    for (const f of ['src/routes/species/[slug]/+page.svelte', 'src/routes/compare/+page.svelte']) {
      expect(code(f)).toMatch(/readerLatOf\(data\.hemiLat\)/);
      expect(code(f)).not.toMatch(/collection\.locations\.map\(\(l\) => l\.lat\)/);
    }
  });
  it('Provenance gives no "asked" date for a source not asked, and its footer names "not asked"', () => {
    const p = code('src/lib/ui/Provenance.svelte');
    expect(p).toMatch(/u\.status !== 'skipped'/);
    expect(p).toMatch(/refused, failed, or not been asked/); // round sixty-two, second pass: the words review's 12, every pill named
  });
});

describe('the lapse sentence (A3)', () => {
  it('a correction of 0 m is said as a correction, not as "POWER gave no cell elevation"', async () => {
    const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
    const v: Record<string, number> = { elev: 620 };
    for (let m = 1; m <= 12; m++) {
      const s = Math.cos(((m - 1) / 12) * 2 * Math.PI), mm = String(m).padStart(2, '0');
      Object.assign(v, { [`tasmax_${mm}`]: 22 + 4 * s, [`tasmin_${mm}`]: 12 + 3 * s, [`tas_${mm}`]: 17 + 3.5 * s, [`pr_${mm}`]: 0.4, [`rsds_${mm}`]: 18 + 8 * s, [`hurs_${mm}`]: 78, [`vpd_${mm}`]: 500, [`sfcWind_${mm}`]: 3.2 });
    }
    const lat = -24.877, lon = -70.504, pc = powerCell(lat, lon);
    const T2M_MAX: Record<string, number> = {}, T2M_MIN: Record<string, number> = {}, PRECTOTCORR: Record<string, number> = {};
    for (let y = 1981; y <= 2024; y++) for (let d = 1; d <= 365; d++) { const k = new Date(Date.UTC(y, 0, d)).toISOString().slice(0, 10).replace(/-/g, ''); T2M_MAX[k] = 24; T2M_MIN[k] = 11 + (d % 5); PRECTOTCORR[k] = 0; }
    const power = { [powerUrl(pc.lat, pc.lon)]: { geometry: { coordinates: [pc.lon, pc.lat, 620] }, header: { fill_value: -999 }, properties: { parameter: { T2M_MAX, T2M_MIN, PRECTOTCORR } } } };
    const provider = makeClimateProvider({ grid: memoryGridSource(h, new Map([[cellOf(h, lat, lon).id, encodeCell(h, v)]])), fetcher: fixtureFetcher(power) });
    const c = await provider.at(lat, lon);
    expect(c.status).toBe('ok');
    expect(c.status === 'ok' && c.src.extremes).toContain('lapse-corrected 0 m at 6.5 °C/km');
    expect(c.status === 'ok' && c.src.extremes).not.toContain('POWER gave no cell elevation');
  });
});

describe('the front page and the README (A2, A10, A35, visitor-words 10, 16, 17)', () => {
  const home = code('src/routes/+page.svelte');
  it('the title, og:title, the description, the image alt and the first line say the list\'s whole reach', () => {
    const reach = 'cactus, succulent and bulb species, and the plants most grown alongside them';
    // title, og:title, first line; the image's alt is the image's own words (round sixty-two, second pass; the words review's 2)
    expect(home.match(new RegExp(reach.replace(/[.,]/g, '\\$&'), 'g'))?.length).toBeGreaterThanOrEqual(3);
    expect(home).toContain('Cactus, succulent and bulb species and the plants most grown alongside them: sourced habitat climate');
    expect(home).toMatch(/Your records, encrypted before sync\./); // round sixty-two, second pass: the words review's 11
  });
  it('the home description stays under 160 characters at the live counts', () => {
    const desc = `Cactus, succulent and bulb species and the plants most grown alongside them: sourced habitat climate for 7,123 of 8,947. Your records, encrypted before sync.`;
    expect(home).toContain(desc.replace('7,123', '${fmtN(data.withClimate)}').replace('8,947', '${fmtN(data.total)}'));
    expect(desc.length).toBeLessThan(160);
  });
  it('the feature stands above the search, says what kind of page it shows, and links its rule', () => {
    expect(home.indexOf('class="feature"')).toBeLessThan(home.indexOf('aria-label="Search the whole species catalogue"'));
    expect(home).toContain('This is what a species page with a habitat climate shows');
    expect(home).toContain('<a href="/about/how#feature">Chosen by rule</a>');
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toMatch(/<p id="feature">/);
    expect(code('src/routes/+page.server.ts')).toMatch(/const plain = !w\.open && !fromValid && !atValid;/);
  });
  it('the phone search placeholder fits', () => {
    expect(home).toContain('placeholder="Search species, genus, family or origin…"');
  });
  it('the offline page says only opened pages are kept', () => {
    expect(code('src/routes/offline/+page.svelte')).toContain('the ones you have opened are here');
  });
  it("the README's SYNC_OPEN sentence and its map of the review files", () => {
    const r = readFileSync('README.md', 'utf8');
    expect(r).not.toMatch(/to close new-vault creation/);
    expect(r).toMatch(/its sync is refused with a 402, while vaults made before keep syncing/); // no licence promised (round sixty-two; the words review's 10)
    for (const f of ['REVIEW-SELF-', 'REVIEW-TRIAGE-', 'docs/review-61/', 'outside-a.md', 'outside-b.md']) expect(r).toContain(f);
  });
});

describe('the fixture is true (visitor-words 14)', () => {
  it("humilis's cells are the used side and the equatorial ones, and its north side passes the rule", () => {
    const d = JSON.parse(readFileSync('fixtures/dossiers/s/v2/5384999.json', 'utf8'));
    const hs = d.climate.hemispheres;
    expect(d.climate.cells).toBe(hs.south + hs.equatorial);
    expect(hs.north).toBeGreaterThanOrEqual(3);
    expect(hs.north).toBeGreaterThanOrEqual(0.2 * (hs.north + hs.south));
  });
  it('every fixture photograph names the licence it is tagged with', () => {
    const lab: Record<string, string> = { cc0: 'CC0', by: 'CC BY', 'by-sa': 'CC BY-SA' };
    for (const f of ['5384013', '5411106']) {
      const d = JSON.parse(readFileSync(`fixtures/dossiers/s/v2/${f}.json`, 'utf8'));
      expect(d.photos.length).toBeGreaterThan(0);
      for (const p of d.photos) expect(p.attribution, `${f} ${p.id}`).toContain(`(${lab[p.licence]})`);
    }
  });
});

/**
 * Round eighty-six, the sources agent: review D's D1 (the data's worst wrong fact). 57 pages are species Kew's World
 * Checklist lists only as a cultigen ("as a cultigen from Peru"); 31 showed a "habitat climate" and "Native to …" as if they
 * grew wild: the tomato's from five garden and field records on Lima's coast, saffron's, the peach's, wheat's, rice's.
 * Now Kew's area text is read (`cultigenOf` over `distribution.kew.area`, the one read of Kew's field the ranges agent's
 * D2 stores too; its own field, never a guess): the build reads no habitat climate for such a
 * plant and gives Kew's words as the reason; the page says "(as a cultigen)" wherever it names the region, and quotes
 * Kew; `--fill cultigens` applies it to the corpus on disk, with `--dry-run`.
 *
 * The rows: Kew's wcvp_names.csv of 2026-06-04 (Solanum lycopersicum 2932342, Crocus sativus 327454, Allium porrum 296308,
 * Citrus × limon 2724178), and the tomato's live record (k2932342, `D-s/dos/`) cut to the fields read. The page is mounted
 * with the fixture corpus's Copiapoa cinerea, made a cultigen (needs Chromium: PW_CHROMIUM).
 *
 * On r86base (9cf3077) every `it` FAILED: Kew's area text was not read (`cultigen` absent), the build read the climate,
 * `cultigen-fill.ts` did not exist, and the page said "Native to Chile North" and "Wild records".
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import type { Route } from '@playwright/test';
import { WcvpIndex, parseWcvpName, parseWcvpDist } from '$dossier/bulk';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher } from '$dossier/fetch';
import { makeHeader, cellOf, encodeCell } from '$climate/grid';
import { memoryGridSource } from '$climate/source';
import { makeClimateProvider } from '$climate/provider';
import { rangeCaption } from '$lib/ui/ref/range-words';
import { cultigenOf } from '$core/cultigen';
import { copiapoa as copiapoaTable } from '../../fixtures/upstream';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { _forgetIndex } from '$lib/server/dossiers';
import { mount, stopMounting } from './helpers/mount';

afterAll(stopMounting);
const NAMES_H = 'plant_name_id|ipni_id|taxon_rank|taxon_status|family|genus_hybrid|genus|species_hybrid|species|infraspecific_rank|infraspecies|parenthetical_author|primary_author|publication_author|place_of_publication|volume_and_page|first_published|nomenclatural_remarks|geographic_area|lifeform_description|climate_description|taxon_name|taxon_authors|accepted_plant_name_id|basionym_plant_name_id|replaced_synonym_author|homotypic_synonym|parent_plant_name_id|powo_id|hybrid_formula|reviewed'.split('|');
const DIST_H = 'plant_name_id|continent_code_l1|continent|region_code_l2|region|area_code_l3|area|introduced|extinct|location_doubtful'.split('|');
const ROWS = {
  tomato: '2932342|316947-2|Species|Accepted|Solanaceae||Solanum||lycopersicum||||L.||Sp. Pl.|: 185|(1753)||as a cultigen from Peru|scrambling subshrub|wet tropical|Solanum lycopersicum|L.|2932342||||2936484|316947-2||N',
  leek: '296308|528646-1|Species|Accepted|Amaryllidaceae||Allium||porrum||||L.||Sp. Pl.|: 295|(1753)|, nom. rej.|Cultigen from Iran|bulbous geophyte|temperate|Allium porrum|L.|296308||||294888|528646-1||Y',
  saffron: '327454|436688-1|Species|Accepted|Iridaceae||Crocus||sativus||||L.||Sp. Pl.|: 36|(1753)||as a cultigen from Greece|tuberous geophyte|subtropical|Crocus sativus|L.|327454||||327117|436688-1||Y',
  lemon: '2724178|60454758-2|Species|Accepted|Rutaceae||Citrus|×|limon|||L.|Osbeck||Reise Ostindien|: 250|(1765)||as a cultigen derived from artificial hybrids.|tree|subtropical|Citrus × limon|(L.) Osbeck|2724178|2724221|||2723938|60454758-2|C. maxima × C. medica × C. reticulata|N',
  // A wild plant whose area names a place in brackets (guard): Kew's text is kept only for a cultigen.
  copiapoa: '1|1|Species|Accepted|Cactaceae||Copiapoa||cinerea||||(Phil.) Britton & Rose||||||Chile (Antofagasta)|succulent subshrub|desert or dry shrubland|Copiapoa cinerea|(Phil.) Britton & Rose|1|||||1||N'
};
const WHY = `Kew's World Checklist lists this plant only as a cultigen ("as a cultigen from Peru"), with no wild habitat, so no habitat climate is read from where it is grown`;

describe("D1: Kew's area text says a plant is a cultigen, and the build reads no habitat climate for it", () => {
  it('the rows are read: "as a cultigen from Peru", "Cultigen from Iran", "as a cultigen derived from artificial hybrids."; a wild area is not kept', () => {
    expect(cultigenOf(parseWcvpName(NAMES_H, ROWS.tomato).area)).toBe('as a cultigen from Peru');
    expect(cultigenOf(parseWcvpName(NAMES_H, ROWS.leek).area)).toBe('Cultigen from Iran');
    expect(cultigenOf(parseWcvpName(NAMES_H, ROWS.saffron).area)).toBe('as a cultigen from Greece');
    expect(cultigenOf(parseWcvpName(NAMES_H, ROWS.lemon).area)).toBe('as a cultigen derived from artificial hybrids.');
    expect(cultigenOf(parseWcvpName(NAMES_H, ROWS.copiapoa).area)).toBeUndefined(); // its area is kept (Kew's words), and is no cultigen's
    // Kew's range for the entry carries it, beside its descriptions.
    const w = new WcvpIndex();
    w.addName(parseWcvpName(NAMES_H, ROWS.tomato), () => true);
    w.addDist(parseWcvpDist(DIST_H, '2932342|8|SOUTHERN AMERICA|83|Western South America|PER|Peru|0|0|0'));
    const r = w.distributions('Solanum lycopersicum', 'L.');
    expect(r && r !== 'ambiguous' && r.kew).toEqual({ lifeform: 'scrambling subshrub', climate: 'wet tropical', area: 'as a cultigen from Peru' });
  });

  it('a page built with records in its region of origin reads no climate, and says why in Kew\'s words', async () => {
    const h = makeHeader({ built: '2026-09-14T00:00:00Z' });
    const lat = -24.877, lon = -70.504;
    const v: Record<string, number> = { elev: 620 };
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); Object.assign(v, { [`tasmax_${mm}`]: 24, [`tasmin_${mm}`]: 14, [`tas_${mm}`]: 19, [`pr_${mm}`]: 1, [`rsds_${mm}`]: 20, [`hurs_${mm}`]: 70, [`vpd_${mm}`]: 500, [`sfcWind_${mm}`]: 3 }); }
    const p = makeClimateProvider({ grid: memoryGridSource(h, new Map([[cellOf(h, lat, lon).id, encodeCell(h, v)]])), fetcher: fixtureFetcher({}, { status: 'refused', detail: 'not asked' } as never) });
    const table = copiapoaTable() as Record<string, { kew?: Record<string, string> }>;
    const dist = Object.keys(table).find((k) => k.endsWith('/distributions'))!;
    const build = (cultigen?: string) => { const t = structuredClone(table); if (cultigen) t[dist].kew = { ...t[dist].kew, area: cultigen }; return buildDossier('Copiapoa cinerea', { fetcher: fixtureFetcher(t as Record<string, unknown>), builtBy: 'node', now: () => new Date('2026-11-06T12:00:00Z'), climate: { envelope: () => p.at(lat, lon), at: p.at } }); };
    const wild = await build();
    expect(wild.ok && wild.dossier.climate.status).toBe('ok'); // guard: the same records give a climate to a wild plant
    const r = await build('as a cultigen from Peru');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.climate).toEqual({ status: 'none', detail: WHY });
    expect(r.dossier.upstream.climate).toMatchObject({ status: 'none', detail: WHY });
    expect(r.dossier.upstream['climate.extremes']).toBeUndefined();
    expect(r.dossier.distribution.kew?.area).toBe('as a cultigen from Peru');
    expect(r.dossier.distribution.native.map((x) => x.name)).toEqual(['Chile North']); // the region stays, said as a cultigen's
    expect(rangeCaption(r.dossier.distribution as never, 'ok')).toBe('Region of origin as published by WCVP, which lists the plant only as a cultigen');
  });
});

describe('D1: --fill cultigens over the corpus on disk', () => {
  const tomato = () => ({
    key: 'k2932342',
    name: { scientific: 'Solanum lycopersicum' },
    distribution: { kew: { lifeform: 'scrambling subshrub', climate: 'wet tropical' } as Record<string, string> },
    climate: { status: 'ok', records: 5, cells: 5, place: 'Lima Province, Peru' } as { status: string; detail?: string; records?: number; cells?: number; place?: string },
    upstream: { climate: { status: 'ok', at: '2026-11-01T20:08:12.816Z' }, 'climate.extremes': { status: 'ok', at: '2026-11-01T20:08:12.816Z' } } as Record<string, { status: string; at: string; detail?: string } | undefined>
  });
  it('the dry run says what the tomato would lose and writes nothing; the fill writes it, and a second run changes nothing', async () => {
    const mod = await import('$dossier/cultigen-fill').catch(() => null);
    expect(mod).not.toBeNull();
    const { applyCultigen, entryOfPage } = mod!;
    expect(entryOfPage(tomato())).toBe('2932342');
    const c = { read: 0, changed: 0, climates: 0, lines: [] as string[], noLonger: [] as string[] };
    const dry = tomato();
    expect(applyCultigen(dry as never, 'as a cultigen from Peru', '2026-11-07T00:00:00.000Z', c, true)).toBe(true);
    expect(dry).toEqual(tomato());
    expect(c.lines).toEqual(['Solanum lycopersicum [k2932342]: Kew: "as a cultigen from Peru"; its habitat climate (5 records in 5 cells, the typical spot in Lima Province, Peru) would no longer be shown']);
    const d = tomato();
    expect(applyCultigen(d as never, 'as a cultigen from Peru', '2026-11-07T00:00:00.000Z', c)).toBe(true);
    expect(d.climate).toEqual({ status: 'none', detail: WHY });
    expect(d.distribution.kew).toEqual({ lifeform: 'scrambling subshrub', climate: 'wet tropical', area: 'as a cultigen from Peru' });
    expect(d.upstream['climate.extremes']).toBeUndefined();
    expect(applyCultigen(d as never, 'as a cultigen from Peru', '2026-11-07T00:00:00.000Z', c)).toBe(false);
    expect(c).toMatchObject({ read: 3, changed: 2, climates: 2 });
    // A wild plant is left as it is (guard); a page Kew no longer lists so is named for a rebuild.
    expect(applyCultigen(tomato() as never, undefined, 'x', c)).toBe(false);
    expect(applyCultigen(d as never, undefined, 'x', c)).toBe(false);
    expect(c.noLonger).toHaveLength(1);
  });
});

describe('D1: the page says "as a cultigen" wherever it names the region', () => {
  const fixtures = (async (u: string | URL) => {
    const p = new URL(String(u), 'http://x').pathname;
    const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
    return f && existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
  }) as typeof fetch;
  it('"Native to Chile North (as a cultigen)", Kew quoted, no habitat climate with Kew\'s reason, and "Records", not "Wild records"', async () => {
    _forgetIndex();
    const url = new URL('http://x/species/copiapoa-cinerea');
    const data = JSON.parse(JSON.stringify(await load({ params: { slug: 'copiapoa-cinerea' }, platform: undefined, fetch: fixtures, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals: {}, isDataRequest: true } as never))) as { d: Record<string, any> };
    data.d.distribution.kew = { ...data.d.distribution.kew, area: 'as a cultigen from Peru' };
    data.d.climate = { status: 'none', detail: WHY };
    const m = await mount('src/routes/species/[slug]/+page.svelte', { data }, { answer: (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }) });
    try {
      const t = (await m.page.locator('#target').evaluate((el) => el.textContent ?? '')).replace(/\s+/g, ' ');
      expect(t).toContain('Native to Chile North (as a cultigen)');
      expect(t).toContain("Kew's World Checklist lists it only as a cultigen (its words below): the region is where the crop comes from, not a wild range");
      expect(t).toContain('Range in Kew\'s words“as a cultigen from Peru”'); // the ranges agent's line quotes Kew's words, once
      expect(t).toContain("No habitat climate can be derived: Kew's World Checklist lists this plant only as a cultigen");
      expect(t).not.toContain('Wild records');
      expect(t).not.toMatch(/Native to Chile North(?! \(as a cultigen\))/);
    } finally {
      await m.close();
    }
  }, 240_000);
});

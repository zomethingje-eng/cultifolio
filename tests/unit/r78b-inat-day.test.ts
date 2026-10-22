/**
 * Round seventy-eight, agent B: iNaturalist's day kept across runs (`day-budget.ts`), so the cultivated-photograph fill
 * runs over several days at 54,000 species; and Wikimedia's hosts paced as the one allowance they share. Each case FAILED
 * on r78base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import * as fetchMod from '$dossier/fetch';

const budgetMod = await import('$dossier/day-budget').catch(() => null);
const need = () => { if (!budgetMod) throw new Error('src/lib/dossier/day-budget.ts is missing'); return budgetMod; };

const memory = () => { const m = new Map<string, number>(); return { read: (d: string) => m.get(d) ?? 0, write: (d: string, n: number) => void m.set(d, n), m }; };
const ok = (async () => ({ status: 'ok', data: {} })) as unknown as JsonFetcher;
const INAT = 'https://api.inaturalist.org/v1/observations?taxon_id=1&captive=true';

describe("iNaturalist's day", () => {
  it('stops at the allowance with a refusal that says so, counting only that host, across fetchers of one day', async () => {
    const { dayBudget } = need();
    const store = memory();
    let day = '2026-10-19';
    const a = dayBudget(ok, 'api.inaturalist.org', 3, store, () => day);
    const b = dayBudget(ok, 'api.inaturalist.org', 3, store, () => day); // a second run the same day
    expect((await a(INAT)).status).toBe('ok');
    expect((await b(INAT)).status).toBe('ok');
    expect((await a('https://api.gbif.org/v1/species/1')).status).toBe('ok'); // guard: another host is not counted
    expect((await a(INAT)).status).toBe('ok');
    const spent = (await b(INAT)) as FetchResult<unknown>;
    expect(spent).toEqual({ status: 'refused', detail: "api.inaturalist.org: today's allowance of 3 requests is spent (UTC 2026-10-19); asked again tomorrow" });
    expect(store.m.get('2026-10-19')).toBe(3);
    // The next UTC day starts again.
    day = '2026-10-20';
    expect((await a(INAT)).status).toBe('ok');
    expect(a.used()).toBe(1);
  });
  it('the corpus script keeps to 4,000 a day, counted in cache/day-budget/, and a stopped fill says to run it again', () => {
    const { INAT_DAY_BUDGET } = need();
    // Round eighty (agent I): 4,000, after iNaturalist throttled the first fill at about 5,500 (`r80i-inat-gentle.test.ts`).
    expect(INAT_DAY_BUDGET).toBe(4000);
    const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(script).toMatch(/dayBudget\(makeFetcher\(\), 'api\.inaturalist\.org', inatBudget, budgetStore\)/);
    expect(script).toContain("const BUDGET_ROOT = 'cache/day-budget';");
    // `--fill inat --cultivated` asks the cultivated set alone; a stop is "run this again", which corpus-step.mjs reads as unfinished (exit 3).
    expect(script).toContain("const cultivatedOnly = args.includes('--cultivated');");
    expect(script).toMatch(/run this again tomorrow \(UTC\), and it goes on from here/);
  });
});

describe("Wikimedia's hosts are paced as one allowance", () => {
  it('Wikipedia, Wikidata and Commons share one pace; the query service and other hosts their own', () => {
    const paceKey = (fetchMod as unknown as { paceKey?: (h: string) => string }).paceKey;
    expect(paceKey).toBeTypeOf('function');
    expect(paceKey!('en.wikipedia.org')).toBe('wikimedia');
    expect(paceKey!('www.wikidata.org')).toBe('wikimedia');
    expect(paceKey!('commons.wikimedia.org')).toBe('wikimedia');
    expect(paceKey!('query.wikidata.org')).toBe('query.wikidata.org');
    expect(paceKey!('api.gbif.org')).toBe('api.gbif.org');
  });
  it('two Wikimedia hosts asked together wait for each other, at most 200 a minute between them', async () => {
    const at: number[] = [];
    const f = fetchMod.makeFetcher((async () => { at.push(Date.now()); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch);
    fetchMod.resetPacing();
    await Promise.all([f('https://en.wikipedia.org/w/api.php?x=1'), f('https://www.wikidata.org/w/api.php?x=2'), f('https://commons.wikimedia.org/w/api.php?x=3')]);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(300); // base: 0, each host paced alone
    expect(60_000 / Math.min(...gaps)).toBeLessThanOrEqual(200);
  });
});

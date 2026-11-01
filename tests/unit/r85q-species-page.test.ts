/**
 * Round eighty-five, Q (outside review A23): the species page's source-text tests made behavioural. Each of these read
 * a line of `src/routes/species/[slug]/+page.svelte` or `Provenance.svelte`; now the page is mounted with the data its
 * own load gives over the fixture corpus (Copiapoa cinerea), changed where a case needs it, and its words are read.
 *
 * - r83a-merged-address "the line, as the page writes it": a page reached by the old name of a page merged into it,
 *   which is also another author's older name of another page, says both.
 * - r82f-wikipedia-cut: a summary the build cut links Wikipedia for the rest, though its four sentences are whole.
 * - r82f-found-not-shown: "Where this page came from" says what Kew's row found and the page does not show.
 * - r81a-care-groups: the species page passes the dossier's Kew words to the care sheet, whose group line quotes them.
 * - r83w-weight "the page draws from the points when it has them, else holds the mark": r85q-guards 2 draws both.
 *
 * Each was checked to fail with the line it replaces changed: the merged branch's condition false, `|| d.summary.cut`
 * dropped, the `foundNotShown` call dropped, and `kew:` left out of the sheet's input.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import type { Route } from '@playwright/test';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { _forgetIndex } from '$lib/server/dossiers';
import { mount, stopMounting } from './helpers/mount';

afterAll(stopMounting);
const SLOW = 240_000; // the first mount of a file pays for the browser and the transform (35 s on a cold Windows run)

const fixtures = (async (u: string | URL) => {
  const p = new URL(String(u), 'http://x').pathname;
  const f = p === '/s/v3/index.json' ? 'fixtures/dossiers/index.json' : p.startsWith('/s/v3/') ? `fixtures/dossiers${p}` : '';
  return f && existsSync(f) ? new Response(readFileSync(f), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 404 });
}) as typeof fetch;
type Data = Record<string, unknown> & { d: Record<string, unknown> & { summary: Record<string, unknown>; distribution: Record<string, unknown> } };
async function copiapoa(): Promise<Data> {
  _forgetIndex();
  const url = new URL('http://x/species/copiapoa-cinerea');
  const data = await load({ params: { slug: 'copiapoa-cinerea' }, platform: undefined, fetch: fixtures, setHeaders: () => {}, cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => '192.0.2.1', locals: {}, isDataRequest: true } as never);
  return JSON.parse(JSON.stringify(data)) as Data;
}
const nothing = (r: Route) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
/** The page's text, whitespace folded, closed disclosures included. */
async function pageText(data: Data): Promise<string> {
  const m = await mount('src/routes/species/[slug]/+page.svelte', { data }, { answer: nothing });
  try {
    return (await m.page.locator('#target').evaluate((el) => el.textContent ?? '')).replace(/\s+/g, ' ');
  } finally {
    await m.close();
  }
}

describe('the species page says what its data holds', () => {
  it("reached by a merged page's old name that another page holds by another author: both said under the name", async () => {
    const data = await copiapoa();
    Object.assign(data, { was: 'Echeveria peacockii', wasMerged: true, wasShared: [{ slug: 'dudleya-pulverulenta', name: 'Dudleya pulverulenta', authors: ['Croucher ex T.Moore & Mast.'] }] });
    const t = await pageText(data);
    expect(t).toContain('is the name of a page merged into this one. It is also an older name of');
    expect(t).toContain('Dudleya pulverulenta, by another author (Echeveria peacockii Croucher ex T.Moore & Mast.)');
  }, SLOW);

  it('a summary the build cut links Wikipedia for the rest, though its sentences are whole; an uncut one of one sentence does not', async () => {
    const cut = await copiapoa();
    cut.d.summary = { ...cut.d.summary, cut: true };
    expect(await pageText(cut)).toContain('More on Wikipedia ›');
    expect(await pageText(await copiapoa())).not.toContain('More on Wikipedia ›');
  }, SLOW);

  it("\"Where this page came from\" says what Kew's row found and the page does not show: no native region", async () => {
    const data = await copiapoa();
    data.d.distribution = { ...data.d.distribution, native: [], introduced: [] };
    expect(await pageText(data)).toContain("Kew's entry lists no native region");
  }, SLOW);

  it("the care sheet's group line quotes Kew's words for the plant, which the page passes it from the dossier", async () => {
    const data = await copiapoa();
    expect((data.d.distribution as { kew?: { lifeform?: string } }).kew?.lifeform).toBe('succulent subshrub');
    expect(await pageText(data)).toContain('Kew describes it as “succulent subshrub”');
  }, SLOW);
});

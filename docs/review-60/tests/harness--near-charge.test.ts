/**
 * Harness review of round sixty: r60-corpus-fuzz.test.ts's "the near pass is never charged: candidate counts for typo
 * queries" counts how often each typo query is charged and then asserts only `WHOLE_LIKE === 2000`: it can fail on
 * nothing but that constant, and its title states the opposite of the round's rule (the near pass IS charged when the
 * exact and near candidates together pass WHOLE_LIKE; corpus-r60.test.ts says so). This is the same measurement with
 * the rule asserted: a query is charged at most once, never when its candidates stay under WHOLE_LIKE, and always
 * when they pass it.
 * PASSES on round-sixty code; FAILS with the near pass's charge removed (the memoised single charge is already guarded
 * by corpus-r60.test.ts).
 * Run: copy to tests/unit/ (it uses tests/unit/helpers/corpus-synth.ts) and `npx vitest run tests/unit/harness--near-charge.test.ts`.
 */
import { it, expect } from 'vitest';
import { searchAnswer, _forgetIndex, WHOLE_LIKE } from '$lib/server/dossiers';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { queryPlan, buildPostings, postingFilesFor, candidates } from '$core/postings';
import { synthIndex, reseed } from './helpers/corpus-synth';

function platformFor(idx: object[]) {
  const { manifest, files } = buildProducts(idx as never, JSON.stringify(idx), () => new Map());
  const blobs = new Map<string, string>([[manifestPath(), JSON.stringify(manifest)]]);
  for (const [name, body] of files) blobs.set(productPath(manifest.files[name]), body);
  const obj = (body: string, etag: string) => ({ text: async () => body, json: async () => JSON.parse(body), etag });
  const store = { get: async (k: string) => (blobs.has(k) ? obj(blobs.get(k)!, `"${k}"`) : null), head: async (k: string) => (blobs.has(k) ? { etag: `"${k}"` } : null) };
  return { env: { STORE: store } } as unknown as App.Platform;
}
const noStatic = (async () => new Response('', { status: 404 })) as typeof fetch;

it('a typo query is charged once when its exact and near candidates pass WHOLE_LIKE, never otherwise (harness review)', async () => {
  reseed(4242);
  const { idx } = synthIndex(9000);
  const platform = platformFor(idx);
  const all = new Map<string, number[]>();
  for (const body of buildPostings(idx, postingFilesFor(idx.length)).values()) for (const [k, v] of Object.entries(body)) all.set(k, v);
  const rows: Array<{ q: string; exact: number; near: number; charged: number }> = [];
  for (const q of ['xact', 'zcact', 'kcactaceae', 'xaloe', 'zalo', 'xsed', 'qmam', 'xeup', 'xasp', 'aspx', 'xcap', 'xmex', 'xchi', 'xnam', 'xbra', 'xpro', 'zprov', 'xcra', 'xama', 'xapo', 'yaiz', 'cactaceaex', 'xaceae', 'qaceae']) {
    const plan = queryPlan(q);
    const exact = candidates(plan.exact, (k) => all.get(k)).length;
    const near = plan.near ? candidates(plan.near, (k) => all.get(k)).length : 0;
    _forgetIndex();
    await searchAnswer(platform, noStatic, 'zzzzzz', 60, async () => null);
    let charged = 0;
    await searchAnswer(platform, noStatic, q, 60, async () => { charged++; return null; });
    rows.push({ q, exact, near, charged });
  }
  for (const r of rows) {
    expect(r.charged, r.q).toBeLessThanOrEqual(1);
    if (r.exact + r.near <= WHOLE_LIKE) expect(r.charged, r.q).toBe(0);
    if (r.exact > WHOLE_LIKE) expect(r.charged, r.q).toBe(1);
  }
  // the case the round added: the exact pass alone under the line, the two passes together over it
  const nearOnly = rows.filter((r) => r.exact <= WHOLE_LIKE && r.exact + r.near > WHOLE_LIKE);
  expect(nearOnly.length).toBeGreaterThan(0);
  for (const r of nearOnly) expect(r.charged, r.q).toBe(1);
}, 300_000);

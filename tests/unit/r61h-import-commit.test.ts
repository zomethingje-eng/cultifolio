/**
 * Adopted in round sixty-one from docs/review-60/tests (the harness review); "PASSES"/"FAILS" below describe round-sixty code.
 * Harness review of round sixty: `commitImport` (src/lib/import/commit.ts) had no unit test at all, and three single-line
 * mutations of it survived the suite (the e2e import tests take the happy path only):
 *   - `break` after a failed row turned into `continue` (rows after a failure are still written, and the page's
 *     "the rest is kept for a second try" then adds them twice);
 *   - the "taken since the review list was drawn" fallback removed (the import stops on a number another tab took);
 *   - places made whether or not "Make these places" is ticked.
 * PASSES on the round-sixty code; each test FAILS under its mutation (checked by applying it, see the harness report).
 * Adopted in round sixty-one (agent H; docs/review-60/harness.md). Run: `npx vitest run tests/unit/r61h-import-commit.test.ts`.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Plan = typeof import('$lib/import/plan');
type Commit = typeof import('$lib/import/commit');

async function boot(): Promise<{ store: Store; vault: Vault; plan: Plan; commit: Commit }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const plan = await import('$lib/import/plan');
  const commit = await import('$lib/import/commit');
  return { store, vault, plan, commit };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'aaaaaaaaaaaa');
}, 60_000);

const YEAR = new Date().getFullYear();

describe('commitImport (harness review)', () => {
  it('stops at the first row that cannot be written: the rows before it are added, the rest are left for a second try', async () => {
    const b = await boot();
    const c = b.store.collection;
    await c.load();
    const rows = [b.plan.blankRow('a', 2, 'Copiapoa cinerea'), b.plan.blankRow('b', 3, 'Copiapoa humilis'), b.plan.blankRow('c', 4, 'Lithops lesliei')];
    const plan = b.plan.planNumbers(rows, [], c.scheme, YEAR, (no) => c.isNumberTaken(no));
    const real = c.addAccessions.bind(c);
    let n = 0;
    vi.spyOn(c, 'addAccessions').mockImplementation(async (...args: Parameters<typeof real>) => {
      if (++n === 2) throw new Error('QuotaExceededError: the phone is full');
      return real(...args);
    });
    const r = await b.commit.commitImport(rows, new Map(), plan, { makePlaces: false, chunk: 1 }); // a line per commit, as a failed group is written again (round sixty-two)
    expect(r.failed?.line).toBe(3);
    expect(r.doneKeys).toEqual(['a']);
    expect(r.added.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea']);
    expect(c.accessions.map((a) => a.taxonName)).toEqual(['Copiapoa cinerea']); // Lithops lesliei was not written after the failure
  });

  it('a number the plan kept but another tab took since gets the next free number, and the result says so', async () => {
    // The refused claim aborts its IndexedDB transaction and nothing awaits the transaction's own promise, so an
    // AbortError surfaces as an unhandled rejection (vault.ts appendChangesClaiming; reported separately). Kept out of
    // the run's verdict here: this test is about what the import does next.
    const kept = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (e, p) => { if (!(e instanceof Error && e.name === 'AbortError')) for (const l of kept) (l as (e: unknown, p: unknown) => void)(e, p); });
    try {
    const b = await boot();
    const c = b.store.collection;
    await c.load();
    const row = { ...b.plan.blankRow('a', 2, 'Copiapoa cinerea'), number: `${YEAR}-0100` };
    const plan = b.plan.planNumbers([row], [], c.scheme, YEAR);
    expect(plan.byRow.get('a')).toMatchObject({ kept: true, numbers: [`${YEAR}-0100`] });
    await c.addAccession({ taxonName: 'Welwitschia mirabilis', acc: `${YEAR}-0100` } as never); // the other tab
    const r = await b.commit.commitImport([row], new Map(), plan, { makePlaces: false });
    expect(r.failed).toBeNull();
    expect(r.added).toHaveLength(1);
    expect(r.renumbered).toHaveLength(1);
    expect(r.renumbered[0]).toMatchObject({ line: 2, given: `${YEAR}-0100` });
    expect(r.renumbered[0].got).not.toBe(`${YEAR}-0100`);
    expect(c.withNumber('accession', `${YEAR}-0100`)).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.removeAllListeners('unhandledRejection');
      for (const l of kept) process.on('unhandledRejection', l as never);
    }
  });

  it('makes no place unless asked: a path that does not exist leaves the plant without a place', async () => {
    const b = await boot();
    const c = b.store.collection;
    await c.load();
    const row = { ...b.plan.blankRow('a', 2, 'Copiapoa cinerea'), placePath: 'Greenhouse › Bench 9' };
    const plan = b.plan.planNumbers([row], [], c.scheme, YEAR);
    const r = await b.commit.commitImport([row], new Map(), plan, { makePlaces: false });
    expect(r.placesMade).toBe(0);
    expect(c.locations).toHaveLength(0);
    expect(r.added[0].locationId ?? null).toBeNull();
    const r2 = await b.commit.commitImport([{ ...row, key: 'b' }], new Map(), b.plan.planNumbers([{ ...row, key: 'b' }], [], c.scheme, YEAR), { makePlaces: true });
    expect(r2.placesMade).toBe(2);
    expect(c.locations.map((l) => l.name).sort()).toEqual(['Bench 9', 'Greenhouse']);
  });
});

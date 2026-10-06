/**
 * Harness review of round sixty: `batchHref` (src/lib/db/links.ts) had no unit test; `plantHref` has one in
 * collection-store.test.ts. Mutating batchHref to link by number always (`length ? sowNo(s) : sowNo(s)`) passed the unit
 * suite. PASSES on round-sixty code; FAILS under that mutation.
 * Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--batch-href.test.ts`.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { it, expect, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';

it('batchHref links by number while it is the batch\'s alone, by id once another live batch shares it (harness review)', async () => {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'aaaaaaaaaaaa');
  const { collection } = await import('$lib/db/collection.svelte');
  const { batchHref } = await import('$lib/db/links');
  await collection.load();
  const s = await collection.addSowing({ taxonName: 'Astrophytum asterias', method: 'seed', sown: '2026-04-01', count: 40, no: 'S2026-001' } as never);
  expect(batchHref(collection.sowing(s.id)!)).toBe('/propagation/S2026-001');
  const t = (n: number) => hlcEncode({ wall: Date.now() - 1000 + n, count: 0, device: 'peerpeerpeer' });
  const peer = (n: number, field: string, value: unknown) => ({ t: t(n), kind: 'sowing' as const, id: 'speer', field, value });
  await collection.ingest([peer(0, 'taxonName', 'Lithops lesliei'), peer(1, 'method', 'seed'), peer(2, 'sown', '2026-04-02'), peer(3, 'count', 10), peer(4, 'status', 'active'), peer(5, 'no', 'S2026-001')], 'server');
  expect(collection.withNumber('sowing', 'S2026-001')).toHaveLength(2);
  expect(batchHref(collection.sowing(s.id)!)).toBe(`/propagation/${s.id}`);
  expect(batchHref(collection.sowing('speer')!)).toBe('/propagation/speer');
}, 60_000);

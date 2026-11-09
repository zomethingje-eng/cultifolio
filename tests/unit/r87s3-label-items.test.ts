/**
 * Round eighty-seven, the stage 3 fixes (the review of the tracker, B1, S1, M2, M3 and M4).
 *
 * 1. B1: every label's code carries the plant's identity tag (`#i=…`, six characters of a hash of its identity), a tape's
 *    too; the 12 mm tape's code, drawn at error correction L, stays at 29 modules with it, for a long item number too.
 *    The collection finds a plant by its tag (live and removed apart) and names the plants a renumbering moved off a
 *    number; a link inside the app to the plant now holding such a number is by its identity.
 * 2. S1: the duplicate-number repair of an item gives it the accession's next free letter, its number and letter together;
 *    a holder renumbered takes its items to its new number in the same commit; a restore does the same. What it writes
 *    is read by round eighty-six's own log module (tests/unit/r87b-old/log-r86.ts), every change, folded alike.
 * 3. S1: an import links a plant numbered as an item by its holder's line in the sheet, and by number only when the plant
 *    here has the same name; otherwise it stands as its own plant and the result says why.
 * 4. M3: a plant growing that still carries a deaccession (round eighty-six's "Mark growing") is held, counted once, and
 *    its next edit clears the reason. M2: a rename line with no history entry gives the earlier name, written by the
 *    next edit. M4: the batches that name a Pollinated line as their cross, and whether a line is removed.
 *
 * Fails on the base (r87final, dd20377): no tag in any code; `byTag`, `renumberedAway`, `itemsOf`, `earlierNames`,
 * `batchesOfCross` and `isRemoved` do not exist; the repair gives an item a bare number; the import links by number alone.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, vi } from 'vitest';
import QRCode from 'qrcode';
import * as old from './r87b-old/log-r86';
import { plantQrUrl, labelFromHash, idTag, tagIs, ID_TAG_LEN } from '$lib/ui/grow/qr';
import { withRenameLines, deaccOf } from '$core/identity';
import type { Change } from '$core/log';

async function boot(dev = 'aaaaaaaaaaaa', wipe = true) {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  if (wipe) { await vault.wipeVault(); await wipeMeta(vault); }
  await vault.setMeta('device', dev);
  const { collection: c } = await import('$lib/db/collection.svelte');
  await c.load();
  return { vault, c };
}
/** One millisecond on, so two devices' records are ordered by their first stamps as they would be. */
const later = () => new Promise((r) => setTimeout(r, 2));

describe('r87s3 1: the label code carries the plant identity tag (B1)', () => {
  const P = { id: 'rmw9a9had00aaaaaaaaaaaatpwk', acc: '2026-0012', taxonName: 'Copiapoa cinerea', cultivar: null, nameKind: 'species' } as const;
  it('a tape code is the number and the tag; a sheet code adds the species and the name after it', () => {
    const tape = plantQrUrl('https://cultifolio.com', P, true);
    expect(tape).toBe(`https://cultifolio.com/plants/2026-0012#i=${idTag(P.id)}`);
    expect(idTag(P.id)).toMatch(new RegExp(`^[0-9a-z]{${ID_TAG_LEN}}$`));
    const sheet = plantQrUrl('https://cultifolio.com', P);
    expect(sheet).toBe(`https://cultifolio.com/plants/2026-0012#i=${idTag(P.id)}&s=copiapoa-cinerea&n=Copiapoa%20cinerea`);
    expect(labelFromHash(new URL(sheet).hash)).toEqual({ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', tag: idTag(P.id) });
    expect(tagIs(labelFromHash(new URL(tape).hash).tag!, P.id)).toBe(true);
    expect(tagIs(idTag(P.id), 'rmw9a9had01aaaaaaaaaaaatpwk')).toBe(false);
  });
  it('a hostile or foreign tag is no tag', () => {
    for (const h of ['#i=../api', '#i=ABC123', '#i=abc', '#i=' + 'a'.repeat(13), '#i=%61bc123']) expect(labelFromHash(h).tag, h).toBeNull();
  });
  it('two plants of one import share their identities\' first nine characters, and not their tags', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `rmw9a9had${i.toString(36).padStart(2, '0')}aaaaaaaaaaaa`);
    expect(new Set(ids.map((x) => x.slice(0, 9))).size).toBe(1);
    expect(new Set(ids.map((x) => idTag(x))).size).toBe(50);
  });
  it('the 12 mm tape code stays at 29 modules a side at error correction L with the tag, a long item number too; at M the tag makes it 33', () => {
    const size = (u: string, l: 'L' | 'M') => QRCode.create(u, { errorCorrectionLevel: l }).modules.size;
    for (const acc of ['2026-0012', '2026-0012/A', 'CACT-00012/AB']) {
      const u = plantQrUrl('https://cultifolio.com', { ...P, acc }, true);
      expect(size(u, 'L'), acc).toBe(29);
      expect(size(u, 'M'), acc).toBe(33);
      expect(size(u.split('#')[0], 'M'), acc).toBe(29); // without the tag, as round eighty-seven drew it at M before
    }
  });
});

describe('r87s3 1b: the collection reads a label by its tag (B1)', () => {
  it('a plant renumbered by the repair is found by its tag; its old number names it; the keeper is linked by identity', async () => {
    const { vault: vb, c: cb } = await boot('cccccccccccc');
    const keeper = await cb.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0020' } as never);
    const fromB = await vb.allChanges();
    await later();
    const { c } = await boot('aaaaaaaaaaaa');
    const mine = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0020' } as never);
    await c.ingest(fromB, 'server');
    await c.repairNumbers({ kind: 'accession', no: '2026-0020' });
    expect(c.accession(mine.id)!.acc).toBe('2026-0021');
    expect(c.byTag(idTag(mine.id)).live.map((a) => a.id)).toEqual([mine.id]);
    expect(c.byTag(idTag(keeper.id)).live.map((a) => a.id)).toEqual([keeper.id]);
    expect(c.renumberedAway('2026-0020').map((a) => a.id)).toEqual([mine.id]);
    expect(c.renumberedAway('2026-0021')).toEqual([]);
    const { plantHref } = await import('$lib/db/links');
    expect(plantHref(c.accession(keeper.id)!)).toBe(`/plants/${keeper.id}`);
    expect(plantHref(c.accession(mine.id)!)).toBe('/plants/2026-0021');
    await c.remove('accession', mine.id);
    expect(c.byTag(idTag(mine.id))).toEqual({ live: [], removed: [expect.objectContaining({ id: mine.id })] });
  });
});

describe('r87s3 2: the number repair and a restore know items (S1)', () => {
  it('two devices split one plant offline: the later item becomes the next letter, not a bare number', async () => {
    const { vault, c } = await boot('aaaaaaaaaaaa');
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    const base = await vault.allChanges();
    const { vault: vb, c: cb } = await boot('cccccccccccc');
    await cb.ingest(base, 'server');
    const B = await cb.splitItem(P.id, { how: 'offset', d: '2026-10-01' });
    const fromB = (await vb.allChanges()).filter((x) => !base.some((y) => y.t === x.t));
    await later();
    const { vault: va, c: ca } = await boot('aaaaaaaaaaaa');
    await ca.ingest(base, 'server');
    const A = await ca.splitItem(P.id, { how: 'division', d: '2026-10-01' });
    await ca.ingest(fromB, 'server');
    const before = new Set((await va.allChanges()).map((x) => x.t));
    expect(await ca.resolveDuplicateNumbers()).toBe(1);
    expect(ca.accessionPlants(P.id).map((a) => [a.id, a.acc, a.item, a.itemOf])).toEqual([[P.id, '2026-0012', undefined, undefined], [B.id, '2026-0012/A', 'A', P.id], [A.id, '2026-0012/B', 'B', P.id]]);
    expect(ca.events(A.id).some((e) => e.note?.startsWith('Renumbered from 2026-0012/A to 2026-0012/B: another plant, recorded first'))).toBe(true);
    // What it wrote, read by round eighty-six's own log module: every change taken, folded alike.
    const repair = (await va.allChanges()).filter((x) => !before.has(x.t));
    expect(repair.filter((x) => x.kind === 'accession').map((x) => [x.id, x.field, x.value])).toEqual([[A.id, 'acc', '2026-0012/B'], [A.id, 'item', 'B']]);
    expect((await ca.splitItem(P.id, { how: 'offset', d: '2026-10-02' })).acc).toBe('2026-0012/C');
    for (const x of repair) expect(old.changeError(x), JSON.stringify(x)).toBeNull();
    const all = (await va.allChanges()) as Change[];
    expect(old.readChanges(all).dropped).toEqual([]);
    const { state } = old.materialise(old.readChanges(all).changes);
    expect(state.get(old.key('accession', A.id))).toMatchObject({ acc: '2026-0012/B', item: 'B', itemOf: P.id });
  });
  it('an item round 86 repaired to a bare number (its item fields kept) is a plant of its own, not listed with the accession', async () => {
    // What round 86's own repair writes for the same duplicate (measured with its real code: the review's harness,
    // tests/unit/zz-s3fix-consume in review87s3/r85m): a bare 2026-0013 on the later item, item and itemOf left.
    const { c } = await boot('aaaaaaaaaaaa');
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    const A = await c.splitItem(P.id, { how: 'offset', d: '2026-10-01' });
    await c.ingest([{ t: `${Date.now() + 5}-0001-zz0123456789abcd`, kind: 'accession', id: A.id, field: 'acc', value: '2026-0013' }] as Change[], 'server');
    expect(c.accession(A.id)).toMatchObject({ acc: '2026-0013', item: 'A', itemOf: P.id });
    expect(c.accessionPlants(P.id).map((a) => a.acc)).toEqual(['2026-0012']);
    expect(c.accessionPlants(A.id).map((a) => a.acc)).toEqual(['2026-0013']);
    expect(c.accessionHolder(A.id)!.id).toBe(A.id);
    expect(c.sharedWith(P.id, { taxonName: 'Copiapoa gigantea' })).toEqual([]);
  });
  it('a plant holding a number renumbered takes its items to the new number, in the same commit', async () => {
    const { vault: vb, c: cb } = await boot('cccccccccccc');
    await cb.addAccession({ taxonName: 'Aloe vera', acc: '2026-0030' } as never);
    const fromB = await vb.allChanges();
    await later();
    const { vault, c } = await boot('aaaaaaaaaaaa');
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0030' } as never);
    const A = await c.splitItem(P.id, { how: 'offset', d: '2026-10-01' });
    const B = await c.splitItem(P.id, { how: 'offset', d: '2026-10-01' });
    await c.ingest(fromB, 'server');
    const n0 = (await vault.allChanges()).length;
    await c.repairNumbers({ kind: 'accession', no: '2026-0030' });
    expect(c.accessionPlants(P.id).map((a) => a.acc)).toEqual(['2026-0031', '2026-0031/A', '2026-0031/B']);
    expect(c.events(A.id).some((e) => e.note === 'Renumbered from 2026-0030/A to 2026-0031/A: the plant it was split from, 2026-0030, was renumbered to 2026-0031.')).toBe(true);
    expect(c.accession(B.id)!.itemOf).toBe(P.id);
    // One commit: the holder, its two items and three lines, each line four fields.
    expect((await vault.allChanges()).length - n0).toBe(3 + 3 * 4);
    expect((await c.splitItem(P.id, { how: 'offset', d: '2026-10-02' })).acc).toBe('2026-0031/C');
  });
  it('a holder brought back to a number another plant took meanwhile takes its items with it; an item comes back as the next letter', async () => {
    // A peer's plant numbered 2026-0040, made while this device's 2026-0040 was removed, and a peer's split of it.
    const { vault: vb, c: cb } = await boot('cccccccccccc');
    await cb.addAccession({ taxonName: 'Aloe vera', acc: '2026-0040' } as never);
    const peer = await vb.allChanges();
    await later();
    const { vault, c } = await boot('aaaaaaaaaaaa');
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0040' } as never);
    const A = await c.splitItem(P.id, { how: 'offset', d: '2026-10-01' });
    await c.remove('accession', P.id);
    await c.ingest(peer, 'server');
    expect(await c.restore('accession', P.id)).toEqual({ from: '2026-0040', to: '2026-0041' });
    expect(c.accessionPlants(P.id).map((a) => a.acc)).toEqual(['2026-0041', '2026-0041/A']);
    expect(c.accession(A.id)!.item).toBe('A');
    expect(c.events(A.id).some((e) => e.note === 'Renumbered from 2026-0040/A to 2026-0041/A: the plant it was split from, 2026-0040, was brought back as 2026-0041.')).toBe(true);
    // An item removed, and its number given meanwhile by a peer (it split the plant with a log that lacked the item).
    await c.remove('accession', A.id);
    const mine = await vault.allChanges();
    const { vault: vd, c: cd } = await boot('dddddddddddd');
    await cd.ingest(mine.filter((x) => x.id !== A.id), 'server');
    const D = await cd.splitItem(P.id, { how: 'offset', d: '2026-10-03' });
    expect(D.acc).toBe('2026-0041/A');
    const fromD = (await vd.allChanges()).filter((x) => x.id === D.id || (x.kind === 'event' && !mine.some((y) => y.t === x.t)));
    const { c: c3 } = await boot('aaaaaaaaaaaa');
    await c3.ingest(mine, 'server');
    await c3.ingest(fromD, 'server');
    expect(await c3.restore('accession', A.id)).toEqual({ from: '2026-0041/A', to: '2026-0041/B' });
    expect(c3.accession(A.id)).toMatchObject({ acc: '2026-0041/B', item: 'B', itemOf: P.id });
  });
});

describe('r87s3 3: an import links an item by its holder, not by a number alone (S1)', () => {
  async function bootImport() {
    const { c } = await boot('aaaaaaaaaaaa');
    const plan = await import('$lib/import/plan');
    const commit = await import('$lib/import/commit');
    return { c, plan, commit };
  }
  it('the holder is its line in the sheet, though another plant holds that number here', async () => {
    const { c, plan, commit } = await bootImport();
    const other = await c.addAccession({ taxonName: 'Aloe vera', acc: '2026-0030' } as never);
    const rows = [{ ...plan.blankRow('a', 2, 'Copiapoa cinerea'), number: '2026-0030', recordId: 'rFAR1' }, { ...plan.blankRow('b', 3, 'Copiapoa cinerea'), number: '2026-0030/A', recordId: 'rFAR2' }];
    const p = plan.planNumbers(rows, [], c.scheme, 2026, (no) => c.isNumberTaken(no));
    const r = await commit.commitImport(rows, new Map(), p, { makePlaces: false });
    const holder = r.added.find((a) => a.taxonName === 'Copiapoa cinerea' && !a.acc!.includes('/'))!;
    const item = r.added.find((a) => a.acc === '2026-0030/A')!;
    expect(holder.acc).not.toBe('2026-0030');
    expect(c.accession(item.id)).toMatchObject({ item: 'A', itemOf: holder.id });
    expect(c.accession(item.id)!.itemOf).not.toBe(other.id);
    expect(r.items).toEqual({ linked: 1, unlinked: [] });
  });
  it('with no holder line, by number only when the plant here has the same name; else its own plant, and why', async () => {
    const { c, plan, commit } = await bootImport();
    const same = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0050' } as never);
    await c.addAccession({ taxonName: 'Aloe vera', acc: '2026-0060' } as never);
    const rows = [{ ...plan.blankRow('a', 2, 'Copiapoa cinerea'), number: '2026-0050/A' }, { ...plan.blankRow('b', 3, 'Copiapoa cinerea'), number: '2026-0060/A' }];
    const p = plan.planNumbers(rows, [], c.scheme, 2026, (no) => c.isNumberTaken(no));
    const r = await commit.commitImport(rows, new Map(), p, { makePlaces: false });
    const a = r.added.find((x) => x.acc === '2026-0050/A')!, b = r.added.find((x) => x.acc === '2026-0060/A')!;
    expect(c.accession(a.id)).toMatchObject({ item: 'A', itemOf: same.id });
    expect(c.accession(b.id)!.itemOf ?? null).toBeNull();
    expect(r.items).toEqual({ linked: 1, unlinked: [{ line: 3, no: '2026-0060/A', why: "your 2026-0060 is Aloe vera, not this plant's name" }] });
  });
});

describe('r87s3 4: a stale deaccession, a rename of round 86, a cross a batch names (M2, M3, M4)', () => {
  it('a plant marked growing on round 86 is held, counted once, and its next edit clears the reason', async () => {
    const { vault, c } = await boot();
    const Q = await c.addAccession({ taxonName: 'Lithops lesliei', acc: '2026-0013' } as never);
    await c.deaccession(Q.id, { reason: 'given', on: '2026-10-02', note: 'to Bob' });
    expect(c.noLongerHeld().deaccessioned.map((a) => a.id)).toEqual([Q.id]);
    // Round 86's "Mark growing": the status and a line, the reason left.
    const n0 = (await vault.allChanges()).length;
    void n0;
    await c.ingest([{ t: `${Date.now() + 5}-0000-bbbbbbbbbbbb`, kind: 'accession', id: Q.id, field: 'status', value: 'growing' }] as Change[], 'server');
    const q = c.accession(Q.id)!;
    expect(q.status).toBe('growing');
    expect((q as unknown as { deacc: string }).deacc).toBe('given');
    expect(deaccOf(q)).toBeNull();
    const gone = c.noLongerHeld();
    expect([...gone.deaccessioned, ...gone.dead, ...gone.removed].map((a) => a.id)).not.toContain(Q.id);
    await c.put('accession', Q.id, { notes: 'back from Bob' });
    expect(c.accession(Q.id)).toMatchObject({ status: 'growing', deacc: null, deaccOn: null, deaccNote: null, notes: 'back from Bob' });
  });
  it('a rename line with no history entry gives the earlier name; the next edit writes it', async () => {
    expect(withRenameLines([], [{ d: '2026-11-09', t: 'note', note: 'Renamed from Copiapoa cinerea to Copiapoa gigantea (r86)' }])).toEqual({ list: [{ name: 'Copiapoa cinerea', until: '2026-11-09' }], added: true });
    // A name with " to " twice cannot be read without a guess, and a name the history has is not added again.
    expect(withRenameLines([], [{ d: '2026-11-09', t: 'note', note: "Renamed from Aloe 'Road to Rio' to Aloe vera" }]).added).toBe(false);
    expect(withRenameLines([{ name: 'Copiapoa cinerea', until: '2026-11-09' }], [{ d: '2026-11-09', t: 'note', note: 'Renamed from Copiapoa cinerea to Copiapoa gigantea' }]).added).toBe(false);
    const { c } = await boot();
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    // Round 86's rename, as its plant page writes it (tests/unit/zz-s3-consume in the review's harness).
    await c.putWith('accession', P.id, { taxonName: 'Copiapoa gigantea', taxonKey: null, nameAsReceived: 'Copiapoa cinerea' }, [{ acc: P.id, d: '2026-11-09', t: 'note', note: 'Renamed from Copiapoa cinerea to Copiapoa gigantea (r86)', auto: true }]);
    // That commit holds the line itself, so it adds no entry; the plant's page shows it at once, from the line.
    expect(c.earlierNames(P.id)).toEqual({ list: [{ name: 'Copiapoa cinerea', until: '2026-11-09' }], added: true });
  });
  it('a round 86 rename read from the log: shown at once, written by the next edit', async () => {
    const { c } = await boot();
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    const t = Date.now() + 5;
    await c.ingest([
      { t: `${t}-0000-bbbbbbbbbbbb`, kind: 'accession', id: P.id, field: 'taxonName', value: 'Copiapoa gigantea' },
      ...Object.entries({ acc: P.id, d: '2026-11-09', t: 'note', note: 'Renamed from Copiapoa cinerea to Copiapoa gigantea (r86)', auto: true }).map(([field, value], i) => ({ t: `${t}-000${i + 1}-bbbbbbbbbbbb`, kind: 'event', id: 'ebbb1', field, value }))
    ] as Change[], 'server');
    expect((c.accession(P.id) as unknown as { idHistory?: unknown }).idHistory ?? null).toBeNull();
    expect(c.earlierNames(P.id)).toEqual({ list: [{ name: 'Copiapoa cinerea', until: '2026-11-09' }], added: true });
    await c.put('accession', P.id, { notes: 'x' });
    expect((c.accession(P.id) as unknown as { idHistory?: unknown }).idHistory).toEqual([{ name: 'Copiapoa cinerea', until: '2026-11-09' }]);
    expect(c.earlierNames(P.id).added).toBe(false);
  });
  it('the batches naming a cross, and a removed line said as removed', async () => {
    const { c } = await boot();
    const P = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0012' } as never);
    const M = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0014' } as never);
    const cross = await c.addEvent({ acc: P.id, d: '2026-04-01', t: 'pollinate', pollen: M.id } as never);
    const S = await c.addSowing({ taxonName: 'Copiapoa cinerea', method: 'seed', sown: '2026-05-01', count: 40, cross: cross.id } as never);
    expect(c.batchesOfCross(cross.id).map((s) => s.id)).toEqual([S.id]);
    expect(c.isRemoved('event', cross.id)).toBe(false);
    await c.remove('event', cross.id);
    expect(c.isRemoved('event', cross.id)).toBe(true);
    expect(c.isRemoved('event', 'e-never')).toBe(false);
  });
});

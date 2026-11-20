/**
 * Round ninety-nine (docs/REVIEW-ROUND-99.md): the collection encrypted on the device, on the real vault over an in-memory
 * IndexedDB. Sealed, the database holds no plant's name, no note and no photograph byte, and every read path gives what
 * it gave plain (the whole log, a record's changes, changes by stamp, a tail of arrivals, a meta record, a photograph,
 * the fold snapshot); a write after sealing is sealed, and a stamp met twice is judged on the values as before; a new
 * tab waits for the key and a wrong passcode opens nothing; a sync key the device syncs with opens it; a vault cut off
 * part-way through sealing reads whole and the next unlock finishes it; unsealed, the records are plain again and the
 * seal is gone.
 *
 * On e89438b: sealVault, openSealWithPass and the codec did not exist; every case FAILED.
 */
import 'fake-indexeddb/auto';
import './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDB } from 'idb';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Vault = typeof import('$lib/db/vault');
const stamp = (wall: number, count = 0) => hlcEncode({ wall, count, device: 'bbbbbbbbbbbb' });
const T0 = Date.UTC(2026, 10, 20);
const plant = (i: number): Change[] => [
  { t: stamp(T0 + i * 1000, 0), kind: 'accession', id: `p${i}`, field: 'taxonName', value: `Copiapoa cinerea ${i}` },
  { t: stamp(T0 + i * 1000, 1), kind: 'accession', id: `p${i}`, field: 'notes', value: `from seed, Pan de Azucar ${i}` },
  { t: stamp(T0 + i * 1000, 2), kind: 'accession', id: `p${i}`, field: 'acc', value: `2026-${String(i).padStart(4, '0')}` }
];
const PASS = 'a long passcode';
const SYNC_KEY = 'ABCDE-FGHJK-MNPQR-STVWX-YZ234-56789';

async function boot(): Promise<Vault> {
  vi.resetModules();
  return import('$lib/db/vault');
}
async function raw() {
  const db = await openDB('cultifolio');
  const [changes, photos, meta, metaKeys] = await Promise.all([db.getAll('changes'), db.getAll('photos'), db.getAll('meta'), db.getAllKeys('meta')]);
  db.close();
  return { changes, photos, meta: new Map(metaKeys.map((k, i) => [k, meta[i]])) };
}
/** Every string and byte the database holds, as one text, to look for plaintext in. */
function allText(x: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (v instanceof Uint8Array || v instanceof ArrayBuffer) out.push(new TextDecoder('latin1').decode(v instanceof ArrayBuffer ? new Uint8Array(v) : v));
    else if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') for (const w of v instanceof Map ? v.values() : Object.values(v)) walk(w);
  };
  walk(x);
  return out.join('\n');
}
const photo = (id: string, text: string) => ({ id, blob: new Blob([new TextEncoder().encode(`JPEG ${text} full`)], { type: 'image/jpeg' }), thumb: new Blob([new TextEncoder().encode(`JPEG ${text} small`)], { type: 'image/jpeg' }) });
const bytesOf = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

beforeEach(async () => {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('cultifolio'); r.onsuccess = r.onerror = r.onblocked = () => res(); });
});

describe('r99b: the collection sealed on the device', () => {
  it('sealed: no plaintext in the database, every read the same', async () => {
    let v = await boot();
    const log = [...plant(1), ...plant(2), ...plant(3)];
    await v.appendChanges(log);
    await v.setMeta('sync', { key: SYNC_KEY, vault: 'v1' });
    await v.putPhotoBlobs(photo('ph1', 'Pan de Azucar pixels'));
    const before = { all: await v.allChanges(), of: await v.changesOf('accession', 'p2'), by: await v.changesByKeys([log[4].t, log[0].t]), tail: await v.arrivalsAfter(0).then((t) => ({ changes: t.changes, seq: t.seq })), sync: await v.getMeta('sync') };
    const seen: string[] = [];
    await v.sealVault(PASS, (p) => seen.push(`${p.what} ${p.done}/${p.of}`));
    expect(seen).toContain('changes 9/9');
    expect(seen).toContain('photographs 1/1');
    const r = await raw();
    const text = allText(r);
    for (const s of ['Copiapoa', 'Pan de Azucar', 'from seed', SYNC_KEY, 'pixels']) expect(text).not.toContain(s);
    // The plant numbers issued stay plain, in their ledger and nowhere else (D2: so two tabs never give one number twice).
    expect(r.meta.get('issued:accession')).toEqual(['2026-0001', '2026-0002', '2026-0003']);
    expect(allText({ changes: r.changes, photos: r.photos })).not.toContain('2026-0002');
    expect(r.changes.every((c) => !('value' in c) && c.x instanceof Uint8Array)).toBe(true);
    expect(r.changes.map((c) => c.field).sort()).toEqual(log.map((c) => c.field).sort()); // what stays plain
    expect(r.meta.get('sealing')).toBeUndefined();
    // the same tab, and a new one once the passcode opens it
    expect(await v.allChanges()).toEqual(before.all);
    v = await boot();
    expect(await v.openSealWithPass('not it')).toBe(false);
    expect(await v.openSealWithPass(PASS)).toBe(true);
    expect(await v.allChanges()).toEqual(before.all);
    expect(await v.changesOf('accession', 'p2')).toEqual(before.of);
    expect(await v.changesByKeys([log[4].t, log[0].t])).toEqual(before.by);
    // The arrivals the same; the fold counter moved, since sealing drops the snapshot (it is written again sealed).
    expect(await v.arrivalsAfter(0).then((t) => ({ changes: t.changes, seq: t.seq }))).toEqual(before.tail);
    expect(await v.getMeta('sync')).toEqual(before.sync);
    const p = (await v.getPhotoBlobs('ph1'))!;
    expect(await bytesOf(p.blob)).toBe('JPEG Pan de Azucar pixels full');
    expect(await bytesOf(p.thumb)).toBe('JPEG Pan de Azucar pixels small');
  });

  it('a new tab waits for the key: nothing reads until the passcode opens it', async () => {
    let v = await boot();
    await v.appendChanges(plant(1));
    await v.sealVault(PASS);
    v = await boot();
    expect((await v.sealState()).sealed).toBe(true);
    let read = false;
    const pending = v.allChanges().then((c) => { read = true; return c; });
    await new Promise((r) => setTimeout(r, 50));
    expect(read).toBe(false);
    await v.openSealWithPass(PASS);
    expect((await pending).map((c) => c.value)).toEqual(plant(1).map((c) => c.value));
  });

  it('writes after sealing are sealed; a stamp met twice is judged on its value', async () => {
    let v = await boot();
    await v.appendChanges(plant(1));
    await v.sealVault(PASS);
    await v.appendChanges(plant(2));
    const again = await v.appendChanges(plant(2), true); // a re-send of what is held: no displacement
    expect(again.replaced).toEqual([]);
    const other = { ...plant(2)[0], value: 'Copiapoa zzz' }; // ranks higher than "Copiapoa cinerea 2"
    const out = await v.appendChanges([other], true);
    expect(out.replaced.map((c) => c.value)).toEqual(['Copiapoa cinerea 2']);
    const r = await raw();
    expect(r.changes.every((c) => !('value' in c))).toBe(true);
    expect(allText(r)).not.toContain('Copiapoa');
    v = await boot();
    await v.openSealWithPass(PASS);
    expect((await v.changesOf('accession', 'p2')).find((c) => c.field === 'taxonName')?.value).toBe('Copiapoa zzz');
  });

  it('the fold snapshot is sealed but for its rules and times', async () => {
    const v = await boot();
    await v.appendChanges(plant(1));
    await v.sealVault(PASS);
    const fold = { rules: 3, build: 'b', device: 'd', offset: 0, seq: 3, records: [{ id: 'p1', taxonName: 'Copiapoa cinerea 1' }], seen: ['x'], born: [], parents: [], held: [], last: plant(1)[2].t, changes: 3 };
    expect(await v.writeFold(fold as never, await v.foldGen())).toBe(true);
    const stored = (await raw()).meta.get('fold') as Record<string, unknown>;
    expect(stored.rules).toBe(3);
    expect('records' in stored).toBe(false);
    expect(allText(stored)).not.toContain('Copiapoa');
    const back = await v.readFold();
    expect(back?.fold.records).toEqual(fold.records);
    expect(back?.fold.last).toBe(fold.last);
  });

  it('a sync key this device syncs with opens it; another does not', async () => {
    let v = await boot();
    await v.appendChanges(plant(1));
    await v.sealVault(PASS);
    await v.setMeta('sync', { key: SYNC_KEY.toLowerCase(), vault: 'v1' });
    v = await boot();
    expect(await v.openSealWithSyncKey('ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ')).toBe(false);
    expect(await v.openSealWithSyncKey(SYNC_KEY)).toBe(true);
    expect((await v.allChanges()).length).toBe(3);
  });

  it('cut off part-way: the vault reads whole, and the next unlock finishes the sealing', async () => {
    let v = await boot();
    const log = [...plant(1), ...plant(2)];
    await v.appendChanges(log);
    await v.sealVault(PASS);
    // As if the sealing had stopped after its first records: three put back plain, and the flag still up.
    const db = await openDB('cultifolio');
    const plainOnes = log.slice(0, 3);
    for (const c of plainOnes) await db.put('changes', c);
    await db.put('meta', { to: 'on' }, 'sealing');
    db.close();
    v = await boot();
    await v.openSealWithPass(PASS);
    expect((await v.allChanges()).map((c) => c.value)).toEqual(log.map((c) => c.value));
    await vi.waitFor(async () => expect((await raw()).meta.get('sealing')).toBeUndefined());
    expect((await raw()).changes.every((c) => !('value' in c))).toBe(true);
  });

  it('unsealed: plain again, the seal gone, nothing lost', async () => {
    const v = await boot();
    const log = plant(1);
    await v.appendChanges(log);
    await v.putPhotoBlobs(photo('ph1', 'pixels'));
    await v.sealVault(PASS);
    await v.unsealVault();
    const r = await raw();
    expect(r.meta.has('seal')).toBe(false);
    expect(r.meta.has('sealing')).toBe(false);
    expect(r.changes.map((c) => c.value)).toEqual(log.map((c) => c.value));
    expect(r.photos.every((p) => !('sealed' in p))).toBe(true);
    const w = await boot();
    expect((await w.sealState()).sealed).toBe(false);
    expect(await bytesOf((await w.getPhotoBlobs('ph1'))!.blob)).toBe('JPEG pixels full');
  });
});

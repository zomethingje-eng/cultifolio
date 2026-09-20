/**
 * "Replace this device with the file" through a staged replacement (round-five
 * finding 54): the live vault is not touched until the whole file is in the
 * staging store, and a failure while staging leaves the live vault as it was.
 * The staging store here is an in-memory model of vault.ts's: two stores, a
 * copy on promote, a discard that deletes the staging store.
 */
import { describe, it, expect } from 'vitest';
import type { Change } from '$core/log';
import type { StagedReplacement, PhotoBlobs } from '$lib/db/vault';
import { buildBackup, readBackup, type ReadBackup } from '$lib/backup/backup';
import { replaceThroughStaging, replacementChanges } from '$lib/backup/replace';
import { NUMBERING_SETTING } from '$lib/db/types';

type Store = {
  changes: Map<string, Change>;
  outbox: Set<string>;
  photos: Map<string, PhotoBlobs>;
};
const store = (): Store => ({
  changes: new Map(),
  outbox: new Set(),
  photos: new Map()
});

/** A model of openStaging()/promote() with a failure that can be injected into the nth photo write. */
function model(live: Store, opts: { failPhotoAt?: number } = {}) {
  const log: string[] = [];
  let staging: Store | null = null;
  let puts = 0;
  const open = async (): Promise<StagedReplacement> => {
    staging = store();
    log.push('open');
    return {
      async putPhoto(p) {
        if (opts.failPhotoAt !== undefined && puts++ === opts.failPhotoAt) throw new Error('QuotaExceededError: no space left');
        staging!.photos.set(p.id, p);
      },
      async appendChanges(cs) {
        for (const c of cs) staging!.changes.set(c.t, c);
      },
      async counts() {
        return { changes: staging!.changes.size, photos: staging!.photos.size };
      },
      async discard() {
        log.push('discard');
        staging = null;
      },
      async promote() {
        log.push('wipe');
        live.changes.clear();
        live.photos.clear();
        live.outbox.clear();
        log.push('copy');
        for (const c of staging!.changes.values()) {
          live.changes.set(c.t, c);
          live.outbox.add(c.t);
        }
        for (const p of staging!.photos.values()) live.photos.set(p.id, p);
        staging = null;
      }
    };
  };
  return { open, log, staged: () => staging };
}

const t = (n: number) => `${String(1700000000000 + n).padStart(13, '0')}-0000-dev1`;
const c = (n: number, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: t(n), kind, id, field, value });
const jpg = (s: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(s)]);

const fileLog: Change[] = [c(1, 'accession', 'r1', 'taxonName', 'Copiapoa cinerea'), c(2, 'accession', 'r1', 'status', 'growing'), c(3, 'photo', 'p1', 'acc', 'r1'), c(4, 'photo', 'p1', 'd', '2026-09-02'), c(5, 'photo', 'p2', 'acc', 'r1'), c(6, 'photo', 'p2', 'd', '2026-09-03')];

async function fileWith(changes: Change[], photos: string[], scheme?: unknown): Promise<ReadBackup> {
  const { bytes } = await buildBackup({
    changes,
    scheme,
    readPhoto: async (id) => (photos.includes(id) ? { id, full: jpg('F' + id), thumb: jpg('T' + id) } : null)
  });
  return readBackup(bytes);
}

function liveWith(): Store {
  const live = store();
  for (const ch of [c(50, 'accession', 'old1', 'taxonName', 'Aloe'), c(51, 'accession', 'old1', 'status', 'growing')]) live.changes.set(ch.t, ch);
  live.photos.set('pold', {
    id: 'pold',
    blob: new Blob([jpg('old')]),
    thumb: new Blob([jpg('old')])
  });
  return live;
}

describe('replace through a staged copy', () => {
  it('stages everything, verifies, then wipes and copies; the live vault ends as the file, queued for sync', async () => {
    const live = liveWith();
    const file = await fileWith(fileLog, ['p1', 'p2']);
    const m = model(live);
    let switched = false;
    const r = await replaceThroughStaging(file, m.open, {
      beforeSwitch: async () => void (switched = true)
    });
    expect(m.log).toEqual(['open', 'wipe', 'copy']);
    expect(switched).toBe(true);
    expect(r).toEqual({ changes: 6, photos: 2, photosMissing: 0 });
    expect([...live.changes.values()]).toEqual(fileLog);
    expect([...live.outbox]).toEqual(fileLog.map((x) => x.t));
    expect([...live.photos.keys()].sort()).toEqual(['p1', 'p2']);
    expect(m.staged()).toBeNull();
  });
  it('a storage failure while staging a photograph leaves the live vault untouched and the staging store discarded', async () => {
    const live = liveWith();
    const before = {
      changes: [...live.changes.values()],
      photos: [...live.photos.keys()]
    };
    const file = await fileWith(fileLog, ['p1', 'p2']);
    const m = model(live, { failPhotoAt: 1 });
    let switched = false;
    await expect(
      replaceThroughStaging(file, m.open, {
        beforeSwitch: async () => void (switched = true)
      })
    ).rejects.toThrow(/QuotaExceededError/);
    expect(m.log).toEqual(['open', 'discard']); // never 'wipe'
    expect(switched).toBe(false); // sync was not turned off either
    expect([...live.changes.values()]).toEqual(before.changes);
    expect([...live.photos.keys()]).toEqual(before.photos);
    expect(m.staged()).toBeNull();
  });
  it('a staging store that holds less than was written is not promoted', async () => {
    const live = liveWith();
    const file = await fileWith(fileLog, ['p1']);
    const m = model(live);
    const open = async () => {
      const s = await m.open();
      return { ...s, counts: async () => ({ changes: 1, photos: 1 }) };
    };
    await expect(replaceThroughStaging(file, open)).rejects.toThrow(/did not all reach storage.*this device is unchanged/);
    expect(m.log).toEqual(['open', 'discard']);
    expect(live.changes.size).toBe(2);
  });
  it('a photo record without pixels in the file is restored as a record and counted once in the report', async () => {
    const live = liveWith();
    const file = await fileWith(fileLog, ['p1']); // p2's pixels were not on the exporting device
    expect(file.manifest?.photosMissing).toEqual(['p2']);
    const r = await replaceThroughStaging(file, model(live).open);
    expect(r).toEqual({ changes: 6, photos: 1, photosMissing: 1 });
    expect(live.changes.size).toBe(6);
    expect([...live.photos.keys()]).toEqual(['p1']);
  });
  it('a file from before the scheme was synced carries its manifest scheme in as the setting record, stamped after everything in the file', async () => {
    const file = await fileWith(fileLog, [], {
      mode: 'prefix',
      prefix: 'GH',
      width: 3
    });
    const changes = replacementChanges(file);
    expect(changes).toHaveLength(7);
    const s = changes[6];
    expect(s).toMatchObject({
      kind: 'setting',
      id: NUMBERING_SETTING,
      field: 'scheme',
      value: { mode: 'prefix', prefix: 'GH', width: 3 }
    });
    expect(s.t > fileLog[5].t).toBe(true);
    // A file whose log already has the setting is left alone.
    const withSetting = await fileWith(
      [
        ...fileLog,
        c(7, 'setting', NUMBERING_SETTING, 'scheme', {
          mode: 'year',
          width: 4
        })
      ],
      [],
      { mode: 'prefix', prefix: 'GH', width: 3 }
    );
    expect(replacementChanges(withSetting)).toHaveLength(7);
  });
});

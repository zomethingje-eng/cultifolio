/**
 * Round sixty-four (agent F; the first Firefox run): the collection's load does not wait for the browser's answer to
 * "keep this site's data". Firefox puts that question to the person and answers only when they do (for good, if the
 * question is dismissed); the load waited for it, and with the load every page that waits for it: in the run, 56 tests
 * timed out on an add form that never took its species, a place form that never opened, an example that never opened.
 * Until the answer, `persisted` is what the browser has already promised, read without asking; and on a device with nothing
 * kept (or in the example) nothing is asked at all. In-memory vault, the mock
 * of r61a-select-undo.test.ts, with `requestPersistence` held open.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';

const changes = new Map<string, Change>();
const meta = new Map<string, unknown>();
/** The question as Firefox leaves it: asked, unanswered until `answer` is called. */
let answer: (ok: boolean) => void = () => {};
/** Each load's call: whether it put the question at all. */
const asks: boolean[] = [];
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...changes.values()],
    appendChanges: async (cs: Change[]) => {
      for (const c of cs) changes.set(c.t, c);
      return { kept: cs, replaced: [], seq: 0 };
    },
    getMeta: async (k: string) => meta.get(k),
    setMeta: async (k: string, v: unknown) => void meta.set(k, v),
    deviceId: async () => 'testdevice00',
    requestPersistence: (known?: (persisted: boolean) => void, ask = true) => {
      asks.push(ask);
      if (!ask) return Promise.resolve(false); // read without asking: nothing promised yet
      known?.(false); // nothing promised yet, read without asking
      return new Promise<boolean>((ok) => (answer = ok));
    }
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.touchFold = async () => {};
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => st;
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...changes.values()], seq: 0, gen: 0 });
  m.arrivalsOf = async () => new Map();
  m.changesByKeys = async (ts: string[]) => ts.map((t) => changes.get(t)).filter(Boolean);
  m.changesOf = async (kind: string, id: string) => [...changes.values()].filter((c) => c.kind === kind && c.id === id);
  m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(meta.get(k)); meta.set(k, next); return next; };
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.putPhotoBlobs = async () => {};
  m.getPhotoBlobs = async () => undefined;
  m.deletePhotoBlobs = async () => {};
  return m;
});

// Round sixty-seven (contract C4): the load asks through the one door, `askToKeep`; the vault's call only reads.
vi.mock('$lib/ui/keep-ask', () => ({ askToKeep: (reason: string) => { asks.push(reason === 'load'); return new Promise<boolean>((ok) => (answer = ok)); } }));

describe("the collection's load and the browser's promise to keep the data", () => {
  it('on an empty device nothing is asked: what the browser has promised is read, and the collection opens', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    expect(asks).toEqual([false]); // a visitor with nothing kept is not asked (in Firefox, a question put to them)
    await new Promise((r) => setTimeout(r, 0));
    expect(collection.persisted).toBe(false);
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', status: 'growing' });
    expect(collection.accession(a.id)?.taxonName).toBe('Copiapoa cinerea');
  });
  it('with plants kept, it asks, opens while the question is unanswered, says what is promised so far, and takes the answer when it comes', async () => {
    vi.resetModules(); // the next page's load, over the plant the last one added
    const { collection } = await import('$lib/db/collection.svelte');
    const opened = await Promise.race([collection.load().then(() => 'opened'), new Promise((r) => setTimeout(() => r('still waiting on the browser'), 1000))]);
    expect(opened).toBe('opened');
    expect(collection.ready).toBe(true);
    expect(asks).toEqual([false, false, true]); // the first load's read, this load's read, and its one ask
    expect(collection.persisted).toBe(false); // not promised yet: the pages say "kept in this browser only" meanwhile
    // a plant can be added with the question still open
    const a = await collection.addAccession({ taxonName: 'Lithops lesliei', status: 'growing' });
    expect(collection.accession(a.id)?.taxonName).toBe('Lithops lesliei');
    answer(true); // the grower answers "Allow"
    await new Promise((r) => setTimeout(r, 0));
    expect(collection.persisted).toBe(true);
  });
});

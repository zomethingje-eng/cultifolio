/**
 * The snapshot is keyed to FOLD_RULES, not to the build (round fifty-seven): a deploy that leaves the fold as it was
 * keeps every device's snapshot. That is safe only while the number moves whenever the fold does, so this test holds a
 * hash of the fold's source to the number it was recorded under: since round fifty-eight the whole of the log's and the
 * clock's modules (the key, the stamp order, the hold and park rules and their constants all shape a fold; round
 * fifty-seven hashed only `apply` and two rules, and a change to `key()` or `PARK_MS` passed unnoticed: the client
 * review's finding 7), the collection's methods that build, restore, hold, park and save the snapshot, and the vault's
 * that store the log and read and write the snapshot. A false alarm costs a recorded hash; a miss is a stale snapshot
 * read as current on every device.
 *
 * When this fails:
 *   - if the change alters what a fold of some log comes out as, or what a snapshot holds or how it is read, bump
 *     FOLD_RULES in src/lib/core/log.ts and record the new number and the new hash below;
 *   - if it does not (a comment, a rename, a dependency that changes the compiled text), record the new hash under the
 *     same number.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOLD_RULES, REQUIRED_FIELDS, KINDS, type Change } from '$core/log';
import { md5 } from '$dossier/md5';

/** A top-level function's or a class method's source, read from the file as written (not as compiled, so the hash does not move with the compiler), from its signature to the closing brace at its own indent. */
function block(file: string, signature: string): string {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const at = text.indexOf(signature);
  if (at < 0) throw new Error(`${signature} is not in ${file}`);
  const indent = text.slice(text.lastIndexOf('\n', at) + 1, at);
  const end = text.indexOf(`\n${indent}}\n`, at);
  if (end < 0) throw new Error(`no end for ${signature}`);
  return text.slice(at, end + indent.length + 2);
}

const RECORDED = { rules: 8, hash: '3ec852e1bcdb91f279ed3d42b2163f37' }; // re-recorded at round eighty-seven's stage 3 fixes under 8: `pushBatch` leaves a vault full for photographs only as it is when a batch is taken (S2; no fold comes out otherwise: what is stored, parked or folded is the same). Before, re-recorded at round eighty-seven's stage-3 integration under 8: FIELD_TYPES and FIELD_ENUMS holding all three agents' fields at once (t1's identity and provenance, t2's lineage, t3's season and papers; each agent recorded its own alone under 8 below, and the integration changed no fold method: the collection's new methods are readers and writers outside the hashed blocks). Before, (t1) under 8: the identity and provenance fields of a plant typed (item, itemOf, deacc, deaccOn, deaccNote, provType, propHistory, collector, collected, idLevel, idBy, idOn, clone as strings, exChain and idHistory as arrays) and four of them given their words. Before, (t2) under 8: `motherAcc`, `motherHow`, a batch's `cross` and `stockAcc`, a line's `pollen`, `scion` and `stock` typed as string fields and `motherHow`'s five words listed. Before, re-recorded in round eighty-seven, stage 3 (t3) under 8: the accession's `season`, `seasonFrom` and `restMonths` and the photo's `mime`, `fileName` and `doc` typed in FIELD_TYPES and their words in FIELD_ENUMS (no fold comes out otherwise: a record without them folds as before, and a change of one was already folded as an unknown field). Before, re-recorded in round eighty-seven's review fix under 8: `olderKindOf` typed as a string field, the `olderOf` a recorded `olderKind` was read for (M1; no fold comes out otherwise: a record without it folds as before, and a change of it was already folded as an unknown field). Before, re-recorded in round eighty-seven under 8: `olderKind` typed as a string field and its two words listed, as `olderOf` was (no fold comes out otherwise: a record without it folds as before, and a change of it was already folded as an unknown field). Before, re-recorded in round eighty-five (agent U) under 8: reasons written into empty catches (vault, the load), and the refold after a change of the clock says its failure (`CLOCK_FOLD_FAILED`) and folds again at the next pull; and at the merge (K): a given plant number checked by `plantNumberProblem` in `addAccessions`, and `olderOf` typed as a string field; no fold comes out otherwise

describe('the fold rules number (round fifty-seven)', () => {
  it('moves whenever the fold\'s source does', () => {
    const col = 'src/lib/db/collection.svelte.ts', vault = 'src/lib/db/vault.ts';
    const whole = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const src = [
      whole('src/lib/core/log.ts'),
      whole('src/lib/core/hlc.ts'),
      // Round sixty-one: `saveParked` and `flushParked` are gone (a load stores no park of its own, rule 5); `stampPast` and
      // `commit` came in (what an edit is stamped and what a commit folds shape every fold after: the clock review's 10).
      ...['load(): Promise<void> {', 'async rebuild(', 'private async catchUp(', 'private clearFold(', 'private applyHere(', 'private foldAll(', 'private foldSome(', 'private touched(', 'private noteParents(', 'private async foldFromVault(', 'private async fromFold(', 'private async saveFold(', 'private dueNow(', 'private hold(', 'private notePark(', 'async markParked(', 'private async rereadParked(', 'private async readParked(', 'private stampPast(', 'private async commit('].map((sig) => block(col, sig)),
      // Round sixty-two (A42, the clock review's 13): what decides an own batch's judgement and what is offered as parked.
      // The device the hold excepts, which stamps are this device's and which own stamps were placed past held ones, the
      // stored parks the engine judges against, and whether a parked change is still offered.
      ...['get device(', 'isOwnStamp(t: string', 'heldWalls(): Set', 'get storedParks(', 'private stillParked('].map((sig) => block(col, sig)),
      // The whole vault module since round fifty-nine: the reviews changed `changesByKeys`, `lastArrival`, `dropFoldIn`,
      // `parkStamps` and a constant, each of which shapes what a snapshot holds or replays, and the hash did not move.
      whole(vault),
      // The sync engine's own hold and its batch intake since round sixty: they decide what is parked on arrival, which
      // shapes every fold after, and a change to either passed the hash and every test (the first outside review, 31).
      // Round sixty-one: the clock listener (it re-folds when the clock in force changes), and the judgement of this device's
      // own batches by their arrival, which parks as `takeBatch` does.
      ...['private hold(', 'private async takeBatch(', 'private clockChanged(', 'private ownToJudge(', 'private async judgeOwn('].map((sig) => block('src/lib/sync/engine.svelte.ts', sig)),
      // Round sixty-two (A42, the clock review's 13): the pull's queueing of own batches and its one refold per clock change,
      // what a push records of a batch's latest stamp read from a clock, and the once-only listing of own batches. Each of
      // their mutations passed the whole suite.
      ...['private async pull(', 'private async pushBatch(', 'private async listOwnOnce('].map((sig) => block('src/lib/sync/engine.svelte.ts', sig)),
      // and the batch's version, which decides whether an older build reads it at all (B8)
      readFileSync('src/lib/sync/limits.ts', 'utf8').replace(/\r\n/g, '\n'),
      JSON.stringify(REQUIRED_FIELDS),
      JSON.stringify(KINDS)
    ].join('\n');
    const hash = md5(src.replace(/\s+/g, '')); // whitespace aside, so a checkout with other line endings hashes the same
    if (hash !== RECORDED.hash || FOLD_RULES !== RECORDED.rules) {
      expect.fail(FOLD_RULES === RECORDED.rules
        ? `The fold's source changed (hash ${hash}) and FOLD_RULES is still ${FOLD_RULES}. If the change alters a fold or a snapshot, bump FOLD_RULES and record { rules: ${FOLD_RULES + 1}, hash } here after the bump; if not, record hash '${hash}' under ${FOLD_RULES}.`
        : `FOLD_RULES is ${FOLD_RULES} and this test recorded ${RECORDED.rules}: record { rules: ${FOLD_RULES}, hash: '${hash}' }.`);
    }
  });
});

/*
 * The behavioural guard (round sixty-two; A42, the clock review's 13). The source hash above sees a change of the code it
 * names; this sees a change of what the code does, wherever the code is: a fixed set of logs, clocks and arrivals is
 * folded by the real collection over an in-memory vault, and what the grower would be shown (the records, the parked
 * lists and what they offer, the held count, the waiting count, the clock line) is hashed. When this fails, the fold's
 * result changed: bump FOLD_RULES (a snapshot of the old fold is no longer the fold) and record the new hash here.
 */
type Mem = { device: string; changes: Map<string, Change>; meta: Map<string, unknown> };
const G = globalThis as unknown as { __foldMem: Mem };
G.__foldMem = { device: 'aaaaaaaaaaaa', changes: new Map(), meta: new Map() };
vi.mock('$lib/db/vault', () => {
  const mem = () => (globalThis as unknown as { __foldMem: Mem }).__foldMem;
  class StoppedError extends Error {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    StoppedError,
    allChanges: async () => [...mem().changes.values()].map((c) => structuredClone(c)),
    appendChanges: async (cs: Change[]) => { for (const c of cs) mem().changes.set(c.t, structuredClone(c)); return { kept: cs, replaced: [], seq: 0, first: 0 }; },
    changesByKeys: async (ts: string[]) => ts.map((t) => mem().changes.get(t)).filter(Boolean).map((c) => structuredClone(c)),
    changesOf: async (kind: string, id: string) => [...mem().changes.values()].filter((c) => c.kind === kind && c.id === id),
    getMeta: async (k: string) => structuredClone(mem().meta.get(k)),
    setMeta: async (k: string, v: unknown) => void mem().meta.set(k, structuredClone(v)),
    updateMeta: async (k: string, fn: (had: unknown) => unknown) => { const next = fn(structuredClone(mem().meta.get(k))); mem().meta.set(k, structuredClone(next)); return next; },
    deviceId: async () => mem().device,
    requestPersistence: async () => true,
    holdVault: async (w: () => Promise<unknown>) => w(),
    onOtherTabWrite: () => () => {},
    readFold: async () => undefined,
    writeFold: async () => false,
    touchFold: async () => {},
    foldGen: async () => 0,
    dropFold: async () => {},
    parkStamps: async (st: string[]) => { const had = (mem().meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem().meta.set('parked', out); return out; },
    lastArrival: async () => 0,
    arrivalsAfter: async () => ({ changes: [], seq: 0, gen: 0 }),
    arrivalsOf: async () => new Map(),
    changeKeys: async () => [...mem().changes.keys()],
    putPhotoBlobs: async () => {}, getPhotoBlobs: async () => undefined, deletePhotoBlobs: async () => {}, photoBlobIds: async () => []
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  return m;
});

const RECORDED_FOLDS = '06b269fcdb6037a5e19c7c92eeffbbce'; // recorded in round sixty-two, under FOLD_RULES 7

describe('the fold of a fixed set of logs, clocks and arrivals (round sixty-two)', () => {
  it('comes out as recorded', async () => {
    const DAY = 86_400_000;
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal('performance', { now: () => Date.now() - T0 });
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    try {
      const hlc0 = await import('$core/hlc');
      const OWN = 'aaaaaaaaaaaa0000', PEER = 'bbbbbbbbbbbb0000';
      const st = (ms: number, n: number, dev: string) => hlc0.hlcEncode({ wall: T0 + ms, count: n, device: dev });
      const rec = (id: string, t0: number, dev: string, fields: Record<string, unknown>): Change[] => Object.entries(fields).map(([field, value], i) => ({ t: st(t0, i, dev), kind: 'accession', id, field, value }));
      const farPeer = st(3 * DAY, 0, PEER);
      const log: Change[] = [
        ...rec('p1', -DAY, OWN, { taxonName: 'Copiapoa cinerea', status: 'growing', acc: '2026-0001', notes: 'mine' }),
        ...rec('p2', -DAY + 10, PEER, { taxonName: 'Lithops lesliei', status: 'growing', acc: '2026-0002' }),
        { t: st(2 * 60_000, 0, PEER), kind: 'accession', id: 'p2', field: 'notes', value: 'two minutes ahead: folded' },
        { t: st(3600_000, 0, PEER), kind: 'accession', id: 'p2', field: 'price', value: 'an hour ahead: held' },
        { t: farPeer, kind: 'accession', id: 'p1', field: 'notes', value: 'a peer three days ahead' },
        { t: hlc0.hlcPast(farPeer, OWN), kind: 'accession', id: 'p1', field: 'notes', value: 'mine, placed past it' },
        { t: st(4 * DAY, 0, OWN), kind: 'accession', id: 'p1', field: 'price', value: 'own, four days ahead' },
        ...rec('p3', 5 * DAY, OWN, { taxonName: 'Aloe polyphylla', status: 'growing', acc: '2026-0003' }),
        { t: hlc0.hlcPast(st(5 * DAY, 2, OWN), OWN), kind: 'accession', id: 'p3', field: 'notes', value: 'edited after the clock was put right' },
        ...rec('p4', -DAY + 20, PEER, { taxonName: 'Haworthia retusa', status: 'growing', acc: '2026-0004' }),
        { t: st(-1000, 0, PEER), kind: 'accession', id: 'p4', field: '_deleted', value: true },
        { t: hlc0.hlcPast(st(2 * DAY, 0, PEER), PEER), kind: 'accession', id: 'p4', field: 'cultivar', value: "'King'" },
        { t: st(6 * DAY, 0, PEER), kind: 'accession', id: 'p4', field: '_deleted', value: false }
      ];
      // Stored parks: a marked stamp's (an older build stored it), an ordinary far stamp's since replaced by a marked edit,
      // and a near change's (parked by an arrival long ago, so still offered).
      const by = (v: string) => log.find((c) => c.value === v)!.t;
      const storedParked = [by('mine, placed past it'), farPeer, by('two minutes ahead: folded')];
      const outcome = async (label: string, checked: boolean, arrivals: boolean) => {
        G.__foldMem = { device: 'aaaaaaaaaaaa', changes: new Map(log.map((c) => [c.t, structuredClone(c)])), meta: new Map<string, unknown>([['parked', storedParked], ['parkedDone', []]]) };
        store.clear();
        vi.resetModules();
        const hlc = await import('$core/hlc');
        if (checked) hlc.trustServerTime(T0, T0);
        const { collection } = await import('$lib/db/collection.svelte');
        await collection.load();
        if (arrivals) {
          // Every change judged by an arrival of now, as takeBatch and judgeOwn judge a batch, against the stored parks.
          const { isParked } = await import('$core/log');
          const hold = { now: hlc.nowMs(), except: collection.device, arrival: T0, parked: collection.storedParks, clockChecked: hlc.clockChecked() };
          if (await collection.markParked(log.filter((c) => isParked(c.t, hold) && !collection.storedParks.has(c.t)))) await collection.rebuild();
        }
        const records = ['p1', 'p2', 'p3', 'p4'].map((id) => collection.accession(id) ?? collection.removedAccession(id) ?? collection.waiting('accession', id) ?? null);
        return { label, records, parked: collection.parkedList(), own: collection.parkedOwn(), parkedRecords: collection.parkedRecords, held: collection.heldWaiting, incomplete: collection.incomplete, clockBehindAt: collection.clockBehindAt, ownLatest: collection.ownLatest(), stored: [...collection.storedParks].sort() };
      };
      const all = [await outcome('unchecked', false, false), await outcome('checked', true, false), await outcome('arrivals', true, true)];
      const hash = md5(JSON.stringify(all));
      if (hash !== RECORDED_FOLDS) expect.fail(`The fold of the fixed logs came out as ${hash}, recorded ${RECORDED_FOLDS}. If the fold's rules changed, bump FOLD_RULES and record the hash; the outcome was ${JSON.stringify(all)}`);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  }, 300_000);
});

/*
 * The parks' own behaviour (round sixty-seven; triage-66 H8, R45-29). The guard above passed with any of these changed:
 * the backup's `fileParks` keeping an older build's clock-only parks, `stillWaiting` always true, `applyParked` not
 * applying a parked restore, and `parkedFor` offering the earliest parked value of a field. Each shapes what a grower is
 * shown or what a restore stores, so each is hashed here, under its own recorded value: the hash above stays as it was,
 * and a change to either says which half moved.
 */
const RECORDED_PARKS = '8e7b91d8fd5a019c14d26b1a08278b70'; // round sixty-seven, under FOLD_RULES 7; re-recorded at the merge for R6 alone: a round-sixty-one file's parks are read as parks (the `files` part moved, `before` and `after` are as recorded)

describe('what the parks offer, apply and keep (round sixty-seven; triage-66 H8)', () => {
  it('comes out as recorded', async () => {
    const DAY = 86_400_000;
    const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    vi.stubGlobal('performance', { now: () => Date.now() - T0 });
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    try {
      const hlc0 = await import('$core/hlc');
      const OWN = 'aaaaaaaaaaaa0000', PEER = 'bbbbbbbbbbbb0000';
      const st = (ms: number, n: number, dev: string) => hlc0.hlcEncode({ wall: T0 + ms, count: n, device: dev });
      const rec = (id: string, t0: number, dev: string, fields: Record<string, unknown>): Change[] => Object.entries(fields).map(([field, value], i) => ({ t: st(t0, i, dev), kind: 'accession', id, field, value }));
      const heldPrice = st(3600_000, 0, PEER);
      const log: Change[] = [
        // A held change (an hour ahead) that an edit here has been stamped past, and one nothing has: `stillWaiting`
        // counts the second alone.
        ...rec('h1', -DAY, PEER, { taxonName: 'Copiapoa cinerea', status: 'growing', acc: '2026-0011' }),
        { t: heldPrice, kind: 'accession', id: 'h1', field: 'price', value: 'an hour ahead: held, then overridden' },
        { t: hlc0.hlcPast(heldPrice, OWN), kind: 'accession', id: 'h1', field: 'price', value: 'mine, placed past the held price' },
        { t: st(3600_000, 1, PEER), kind: 'accession', id: 'h1', field: 'notes', value: 'an hour ahead: held, still waiting' },
        // Two parked values of one field: `parkedFor` offers the later.
        ...rec('k1', -DAY + 10, PEER, { taxonName: 'Lithops lesliei', status: 'growing', acc: '2026-0012' }),
        { t: st(7 * DAY, 0, PEER), kind: 'accession', id: 'k1', field: 'notes', value: 'seven days ahead: the earlier park' },
        { t: st(8 * DAY, 0, PEER), kind: 'accession', id: 'k1', field: 'notes', value: 'eight days ahead: the later park' },
        // A removed plant whose restore is parked: `applyParked` restores it.
        ...rec('r1', -DAY + 20, PEER, { taxonName: 'Haworthia retusa', status: 'growing', acc: '2026-0013' }),
        { t: st(-1000, 0, PEER), kind: 'accession', id: 'r1', field: '_deleted', value: true },
        { t: st(6 * DAY, 0, PEER), kind: 'accession', id: 'r1', field: '_deleted', value: false }
      ];
      G.__foldMem = { device: 'aaaaaaaaaaaa', changes: new Map(log.map((c) => [c.t, structuredClone(c)])), meta: new Map<string, unknown>([['parked', []], ['parkedDone', []]]) };
      store.clear();
      vi.resetModules();
      const hlc = await import('$core/hlc');
      hlc.trustServerTime(T0, T0);
      const { collection } = await import('$lib/db/collection.svelte');
      await collection.load();
      const { isParked } = await import('$core/log');
      const hold = { now: hlc.nowMs(), except: collection.device, arrival: T0, parked: collection.storedParks, clockChecked: hlc.clockChecked() };
      if (await collection.markParked(log.filter((c) => isParked(c.t, hold) && !collection.storedParks.has(c.t)))) await collection.rebuild();
      const ids = ['h1', 'k1', 'r1'];
      // Read as text when shown: the records are live objects, and a later apply would change what an earlier reading holds.
      // An edit made here is stamped by this tab's own tag, drawn at random per load, so the tag is left out.
      const show = () => JSON.parse(JSON.stringify({
        records: ids.map((id) => collection.accession(id) ?? collection.removedAccession(id) ?? null),
        offered: ids.map((id) => collection.parkedFor('accession', id).map((c) => [c.field, c.value])),
        held: collection.heldWaiting
      }).replace(/(-aaaaaaaaaaaa)(?!0000)[0-9a-z]{4}/g, '$1tab0'));
      const before = show();
      await collection.applyParked('accession', 'r1');
      await collection.applyParked('accession', 'k1');
      const after = show();
      // A backup's parks, by the build that wrote the file: an older build's list is not read (it may hold parks of that
      // device's clock alone); a list written since round sixty-two's second pass is.
      const { fileParks } = await import('$lib/backup/io');
      const files = [
        fileParks({ v: 1, parked: ['p'] }),
        fileParks({ v: 1, app: 'cultifolio 3', parked: ['p'] }),
        fileParks({ v: 1, app: 'cultifolio 3 (stored parks)', parked: ['p'] }),
        fileParks({ v: 2, app: 'cultifolio 3 (stored parks)', parked: ['p'] }),
        fileParks({ v: 2, parked: ['p'] })
      ];
      const all = { before, after, files };
      const hash = md5(JSON.stringify(all));
      if (hash !== RECORDED_PARKS) expect.fail(`The parks came out as ${hash}, recorded ${RECORDED_PARKS}. If the fold's rules changed, bump FOLD_RULES and record the hash; the outcome was ${JSON.stringify(all)}`);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  }, 300_000);
});

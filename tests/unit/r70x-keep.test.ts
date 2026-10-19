/**
 * Round seventy, agent X:
 * - triage-69 X2 (IND-6): Keep does not leave the example when the tab's storage refuses the draft. `keepAsOwn` ignored
 *   the write's failure (a private window, a full storage) and left, and everything typed was lost behind a button that
 *   promised to keep it. Now nothing moves, and the form's line says so.
 * - triage-69 X2 (S-D7a, IND-7): Keep carries a new place's containing place by its name and kind, and the grower's form
 *   opens "New…" inside their own place of that name, or says where it was.
 * - triage-69 X4 (S-D7b): a scanned label's "add one to my plants" leads out of the example.
 * - Guards for mutations S-D found surviving in the example's code (docs/review-69/self-D.md): MX6 ("Delete it" writes a
 *   new generation), MX23 (a change this build cannot read makes the collection "not empty"), MX25 (a press made while
 *   the collection never settles notes "not known", never "none"; triage-69 X4, S-D7d). Each passes on the base and
 *   fails under its mutation.
 * The collection and sync are stood in, as tests/unit/r69x-keep.test.ts does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const col = { ready: true, accessions: [] as unknown[], sowings: [] as unknown[], locations: [] as unknown[], taxa: [] as unknown[], heldWaiting: 0, parkedRecords: 0, recordCount: 0, malformed: 0 };
vi.mock('$lib/db/collection.svelte', () => ({ collection: col }));
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));
vi.mock('$lib/sync/engine.svelte', () => ({ sync: { configured: false, busy: null } }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));
vi.mock('$lib/db/vault', () => ({ replaceWaiting: () => false }));
const sampleEdits = vi.fn(async () => 0);

const mk = () => { const m = new Map<string, string>(); return { m, refuse: null as string | null, s: null as unknown as Storage }; };
const session = mk(), local = mk();
for (const t of [session, local]) t.s = { getItem: (k: string) => t.m.get(k) ?? null, setItem: (k: string, v: string) => { if (k === t.refuse) throw new DOMException('full', 'QuotaExceededError'); t.m.set(k, String(v)); }, removeItem: (k: string) => void t.m.delete(k), key: (i: number) => [...t.m.keys()][i] ?? null, get length() { return t.m.size; }, clear: () => t.m.clear() } as Storage;
const asked: string[] = [];
const loc = { pathname: '/plants/new', get href() { return `http://x${this.pathname}`; }, set href(v: string) { asked.push(v); }, reload() {} };
const KEYS = ['sessionStorage', 'localStorage', 'location', 'addEventListener', 'removeEventListener', 'confirm', 'document'] as const;
const had = Object.fromEntries(KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const def = (k: string, value: unknown) => Object.defineProperty(globalThis, k, { configurable: true, writable: true, value });
beforeEach(() => {
  session.m.clear(); local.m.clear(); session.refuse = null; asked.length = 0;
  Object.assign(col, { ready: true, recordCount: 0, malformed: 0, heldWaiting: 0, parkedRecords: 0 });
  const page = new EventTarget();
  def('sessionStorage', session.s);
  def('localStorage', local.s);
  def('location', loc);
  def('addEventListener', page.addEventListener.bind(page));
  def('removeEventListener', page.removeEventListener.bind(page));
  def('document', { visibilityState: 'visible' });
  def('confirm', () => true);
  vi.resetModules();
  vi.doMock('$lib/db/demo', async (orig) => ({ ...(await orig<typeof import('$lib/db/demo')>()), sampleEdits }));
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of KEYS) { const d = had[k]; if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
});

describe('Keep when the draft cannot be written (X2; IND-6)', () => {
  it('stays in the example, with the form\'s guard as it was, and says so', async () => {
    session.m.set('cultifolio.demo', '1');
    const { keepAsOwn, DRAFT, UNKEPT_WORDS } = await import('$lib/ui/grow/keep-draft');
    session.refuse = DRAFT;
    const holds: boolean[] = [];
    expect(await keepAsOwn({ form: 'plant', fields: { name: 'Copiapoa cinerea', notes: 'Visitor note' }, place: null }, (on) => holds.push(on))).toBe('unkept'); // base: true
    expect(asked).toEqual([]); // base: ['/plants/new?kept=1&left=…'], the draft lost
    expect(holds).toEqual([]);
    expect(session.m.get('cultifolio.demo')).toBe('1'); // still the example's tab
    expect(session.m.has('cultifolio.sampleLeaving')).toBe(false);
    expect(UNKEPT_WORDS).toMatch(/could not be kept/);
  });
  it('the form\'s line says it (ExampleAddLine)', () => {
    const s = readFileSync('src/lib/ui/grow/ExampleAddLine.svelte', 'utf8');
    expect(s).toMatch(/unkept = \(await keepAsOwn\(\{ form: what, \.\.\.draft\(\) \}, hold\)\) === 'unkept'/);
    expect(s).toMatch(/\{#if unkept\}<span[^>]*role="alert"[^>]*>\{UNKEPT_WORDS\}<\/span>\{\/if\}/);
  });
  it('a draft that is written leaves as before (a guard)', async () => {
    session.m.set('cultifolio.demo', '1');
    const { keepAsOwn } = await import('$lib/ui/grow/keep-draft');
    expect(await keepAsOwn({ form: 'plant', fields: { name: 'Copiapoa cinerea' }, place: null })).toBe(true);
    expect(asked).toHaveLength(1);
  });
});

describe('Keep when the next page is slow (X5; R47-17)', () => {
  it('a Leave the page decides was called off (its 10 s fallback) puts the guard back and keeps the draft for the page that still comes', async () => {
    vi.useFakeTimers();
    session.m.set('cultifolio.demo', '1');
    const { keepAsOwn, DRAFT } = await import('$lib/ui/grow/keep-draft');
    const holds: boolean[] = [];
    expect(await keepAsOwn({ form: 'plant', fields: { name: 'Copiapoa cinerea', notes: 'Visitor note' }, place: null }, (on) => holds.push(on))).toBe(true);
    expect(asked[0]).toMatch(/^\/plants\/new\?kept=1&left=/);
    await vi.advanceTimersByTimeAsync(10_100); // the next page has not come: Leave's fallback says the tab stayed
    expect(holds).toEqual([true, false]);
    expect(JSON.parse(session.m.get(DRAFT)!).fields.notes).toBe('Visitor note'); // base: dropped, and the page that loaded at 12 s had an empty form
  });
  it('a Leave the visitor declines still drops it: no page follows (a guard)', async () => {
    session.m.set('cultifolio.demo', '1');
    sampleEdits.mockResolvedValueOnce(1);
    def('confirm', () => false);
    const { keepAsOwn, DRAFT } = await import('$lib/ui/grow/keep-draft');
    expect(await keepAsOwn({ form: 'plant', fields: { name: 'x' }, place: null })).toBe(false);
    expect(session.m.has(DRAFT)).toBe(false);
  });
});

describe('Keep carries the containing place (X2; S-D7a, IND-7)', () => {
  const example = new Map([['gh', { name: 'Greenhouse', type: 'greenhouse' }], ['b1', { name: 'Bench 1', type: 'bench', parentId: 'gh' }]]);
  it('a place picked in the example is carried with the place it sits inside', async () => {
    const { carriedPlace } = await import('$lib/ui/grow/keep-draft');
    expect(carriedPlace(example.get('b1'), (id) => example.get(id))).toEqual({ name: 'Bench 1', kind: 'bench', inside: { name: 'Greenhouse', kind: 'greenhouse' } }); // base: no carriedPlace; { name, kind } alone
    expect(carriedPlace(example.get('gh'), (id) => example.get(id))).toEqual({ name: 'Greenhouse', kind: 'greenhouse', inside: null });
    expect(carriedPlace(undefined, (id) => example.get(id))).toBeNull();
  });
  it('a new place named in the picker is carried with the place chosen for it there', async () => {
    const { carriedPlace } = await import('$lib/ui/grow/keep-draft');
    expect(carriedPlace({ name: 'Bench 9', kind: 'bench', inside: { name: 'Greenhouse', kind: 'greenhouse' } }, () => undefined)).toEqual({ name: 'Bench 9', kind: 'bench', inside: { name: 'Greenhouse', kind: 'greenhouse' } });
    expect(carriedPlace({ name: 'Bench 9', kind: 'bench', inside: null }, () => undefined)?.inside).toBeNull();
  });
  it('the grower\'s form opens "New…" inside their own place of that name, or says where it was', async () => {
    const { startPlace } = await import('$lib/ui/grow/keep-draft');
    const carried = { name: 'Bench 9', kind: 'bench', inside: { name: 'Greenhouse', kind: 'greenhouse' } };
    expect(startPlace(carried, [{ id: 'mine1', name: 'Shelf' }, { id: 'mine2', name: 'greenhouse ' }])).toEqual({ name: 'Bench 9', kind: 'bench', parentId: 'mine2', insideNamed: null });
    expect(startPlace(carried, [{ id: 'mine1', name: 'Shelf' }])).toEqual({ name: 'Bench 9', kind: 'bench', parentId: null, insideNamed: 'Greenhouse' });
    expect(startPlace({ name: 'Bench 9', kind: 'bench' }, [])).toEqual({ name: 'Bench 9', kind: 'bench', parentId: null, insideNamed: null }); // a draft of round sixty-nine
    expect(startPlace({ name: 'Bench 9', inside: { name: 7 } } as never, [])?.insideNamed).toBeNull(); // read, never trusted
    expect(startPlace(null, [])).toBeNull();
  });
  it('both add forms carry it and open it so, and the picker names the place a new one goes inside', () => {
    for (const f of ['src/routes/plants/new/+page.svelte', 'src/routes/propagation/new/+page.svelte']) {
      const s = readFileSync(f, 'utf8');
      const draftOf = s.slice(s.indexOf('function draftOf()'), s.indexOf('\n  }', s.indexOf('function draftOf()')));
      expect(draftOf).toMatch(/carriedPlace\(placeTyped \?\? \(locationId \? collection\.location\(locationId\) : undefined\), \(id\) => collection\.location\(id\)\)/);
      expect(s).toMatch(/else startPlace = startFrom\(d\.place, collection\.locations\);/);
    }
    const picker = readFileSync('src/lib/ui/LocationPicker.svelte', 'utf8');
    expect(picker).toMatch(/typed = adding && newName\.trim\(\) \? \{ name: newName\.trim\(\), kind: newKind, inside: insideOf\(newParent\) \} : null/);
    expect(picker).toMatch(/newParent = start\.parentId && collection\.location\(start\.parentId\) \? start\.parentId : null;/);
  });
});

describe('a scanned label\'s add leads out of the example (X4; S-D7b)', () => {
  it('"add one to my plants" goes through addLeavesExample to the same address', () => {
    const s = readFileSync('src/lib/ui/grow/ForeignLabel.svelte', 'utf8');
    const link = /<a href=\{addHref\}[^>]*onclick=\{\(e\) => addLeavesExample\(e, addHref\)\}>add one to my plants<\/a>/;
    expect(s).toMatch(link); // base: a plain link into the example's own add form
    expect(s).toMatch(/const addHref = \$derived\([^\n]*`\/plants\/new\?species=\$\{encodeURIComponent\(entry\.name\)\}`/);
  });
});

describe('guards for the mutations S-D found surviving (MX6, MX23, MX25)', () => {
  it('MX23: a collection whose log holds a change this build cannot read is not empty', async () => {
    const { ownEmpty } = await import('$lib/ui/grow/example.svelte');
    expect(ownEmpty()).toBe(true);
    col.malformed = 1;
    expect(ownEmpty()).toBe(false);
  });
  it('MX25 (S-D7d): pressed while the collection never settles, the note is "not known", and the bar says neither', async () => {
    vi.useFakeTimers();
    col.ready = false;
    const { enterExample, hadOwn, OWN_NOTE } = await import('$lib/ui/grow/example.svelte');
    expect(enterExample('/today')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_100); // `whenSettled` gives up
    expect(asked).toEqual([`/today?enter=${session.m.get('cultifolio.sampleEntering')}`]); // into the example all the same (r77base: '/today'; round seventy-seven, the entry's token)
    expect(session.m.get(OWN_NOTE)).toBe('?'); // under the mutation: '0', and the bar offered "Add your first plant"
    expect(hadOwn()).toBeNull();
  });
  it('MX25: the hint is read as a yes after the time-out, never as a no', async () => {
    vi.useFakeTimers();
    col.ready = false;
    local.m.set('cultifolio.hasMine', '1');
    const { enterExample, hadOwn, OWN_NOTE } = await import('$lib/ui/grow/example.svelte');
    enterExample('/today');
    await vi.advanceTimersByTimeAsync(10_100);
    expect(session.m.get(OWN_NOTE)).toBe('1');
    expect(hadOwn()).toBe(true);
  });
});

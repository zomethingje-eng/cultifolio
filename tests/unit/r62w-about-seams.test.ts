/**
 * The seams between /about/how, /about/formats and the code, checked both ways (round sixty-two; outside review A5, B12;
 * the self-review's triage 5). Round sixty-one's seam test checked that each quoted `cultifolio.*` literal appeared
 * somewhere on /about/how, and only `api.*` hosts in server code; several of its assertions sat behind an `if` on a
 * constant and passed once the code changed. This file checks, with no assertion behind a condition:
 *
 * - every storage key under the store it is kept in (local or session), and every key the pages name exists, the
 *   template-built `cultifolio.demo.*` copies included;
 * - IndexedDB, cache storage, lock and channel names, both ways;
 * - the browser's own `/api/*` requests;
 * - every edge cache, with its lifetime, both ways;
 * - the figures the pages state, against the constants (600, a tenth, four tenths, 90 days, 30 s, an hour, two days,
 *   five minutes, half a minute);
 * - three semantic fixtures run through the code as it is: a marked change, a plant that reached this device after a
 *   removal although made before it, and a removal with no order history. If the clock or records code changes what
 *   these do, the expectation here is updated with the page.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RATE, UPSTREAM_ADDRESS_PART, RECOUNT_MS, RECOUNT_RETRY_S } from '$lib/server/sync';
import { NET_FACTOR, RECLAIM_DAYS } from '$lib/server/counters';
import { PARK_MS, isHeld, isParked, type Change } from '$core/log';
import { MAX_AHEAD_MS, TRUST_SERVER_PAST_MS, TRUST_SERVER_TWICE_PAST_MS, hlcPast, isPastStamp, hlcEncode } from '$core/hlc';

const raw = (f: string) => readFileSync(f, 'utf8');
const text = (f: string) => raw(f).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const how = text('src/routes/about/how/+page.svelte');
const formats = text('src/routes/about/formats/+page.svelte');
const pages = how + ' ' + formats;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|svelte|js|html)$/.test(f)) out.push(p.replace(/\\/g, '/')); // forward slashes on Windows too: the filters below read '/' (round sixty-two, the first deploy)
  }
  return out;
}
const source = walk('src').filter((f) => !f.includes('/about/'));

/* ---- storage keys, by store, both ways ---- */
const list = how.slice(how.indexOf('every key:'), how.indexOf('in IndexedDB'));
const localPart = list.slice(0, list.indexOf("in this tab's session storage"));
const sessionPart = list.slice(list.indexOf("in this tab's session storage"));

/**
 * A key named in a part of the list as a whole key: `cultifolio.labels` is not "in" the session list because
 * `cultifolio.labelsPicked` is, nor `cultifolio.demo` because `cultifolio.demo.units` is (round sixty-two, second pass;
 * the words review's 26b: a substring test passed with a local key moved to session storage).
 */
const names = (part: string, k: string) => new RegExp(`(?<![\\w.])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.])`).test(part);

/** Every exported string constant, for a key a file imports (`CLOSED_NOTE` from demo.ts, read in DemoBar.svelte). */
const exported = new Map<string, string>();
for (const f of source) for (const m of raw(f).matchAll(/export const ([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([\w.-]+)['"`]/g)) exported.set(m[1], m[2]);

/** Keys each store is used with, constants resolved within the file or imported (the self-review's triage 5 guard, adopted). */
function keysByStore() {
  const local = new Set<string>(), session = new Set<string>(), direct = new Map<string, string[]>(), viaHelper = new Set<string>(), unscoped: string[] = [], unresolved: string[] = [];
  for (const f of source) {
    if (f.endsWith('stored.ts')) continue;
    const s = raw(f);
    const consts = new Map<string, string>();
    // Every NAME = 'literal' in the file, several to a declaration too ("const VISITS = '…', LAST = '…'").
    for (const m of s.matchAll(/\b([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([\w.-]+)['"`]/g)) consts.set(m[1], m[2]);
    const imports = (n: string) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(s);
    const key = (arg: string) => { const a = arg.trim(); const lit = /^['"`]([\w.-]+)['"`]$/.exec(a); return lit ? lit[1] : consts.get(a) ?? (imports(a) ? exported.get(a) : undefined) ?? null; };
    for (const m of s.matchAll(/(localStorage|sessionStorage)\.(getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const k = key(m[3]);
      // A key this walk cannot read is reported, not skipped (round sixty-two, second pass; the words review's 26c). The
      // one exception is demo.ts's sweep of the sample's own session keys, whose names it reads back from the store.
      if (!k) { if (!(f.endsWith('demo.ts') && m[3].trim() === 'k')) unresolved.push(`${f}: ${m[3].trim()}`); continue; }
      (m[1] === 'localStorage' ? local : session).add(k);
      if (m[1] === 'localStorage' && m[2] !== 'getItem') direct.set(k, [...(direct.get(k) ?? []), f]);
    }
    // stored.ts keeps a 'tab' setting in sessionStorage and any other scope in localStorage (outside the sample), so the
    // scope argument says the store (round sixty-two: `cultifolio.labelsPicked` is 'tab', and was counted as local).
    const scoped = [...s.matchAll(/(?:readSetting|writeSetting)\(\s*([^,)]+),\s*['"`](\w+)['"`]/g)];
    for (const m of scoped) { const k = key(m[1]); if (k) { (m[2] === 'tab' ? session : local).add(k); viaHelper.add(k); } }
    // A call whose scope is not a literal could not be put in a store: it is named, and the test below fails on it.
    if ([...s.matchAll(/(?:readSetting|writeSetting)\(/g)].length !== scoped.length) unscoped.push(f);
  }
  return { local, session, direct, viaHelper, unscoped, unresolved };
}
const COOKIES = new Set(['cultifolio.units', 'cultifolio.hemi']);

describe('storage keys, by the store each is kept in, both ways', () => {
  const { local, session, direct, viaHelper, unscoped, unresolved } = keysByStore();
  it('the walk found the code', () => {
    expect(local.size).toBeGreaterThan(10);
    expect(session.size).toBeGreaterThan(5);
    expect(viaHelper.size).toBeGreaterThan(4);
    expect(unscoped).toEqual([]); // every stored.ts call names its scope, so its store is known
    expect(unresolved).toEqual([]); // every storage call's key was read
  });
  it('every localStorage key is listed, whole, under local storage and not under session storage', () => {
    expect([...local].filter((k) => !COOKIES.has(k) && !names(localPart, k)).sort()).toEqual([]);
    expect([...local].filter((k) => !session.has(k) && names(sessionPart, k)).sort()).toEqual([]);
  });
  it('every sessionStorage key is listed, whole, under session storage and not under local storage', () => {
    expect([...session].filter((k) => !names(sessionPart, k)).sort()).toEqual([]);
    expect([...session].filter((k) => !local.has(k) && names(localPart, k)).sort()).toEqual([]);
  });
  it('a key is found only whole: a longer key holding it does not count', () => {
    expect(names("cultifolio.labelsPicked (the plants picked)", 'cultifolio.labels')).toBe(false);
    expect(names('cultifolio.demo.units', 'cultifolio.demo')).toBe(false);
    expect(names('<code>cultifolio.labels</code> (the label sheet)', 'cultifolio.labels')).toBe(true);
    expect(names('cultifolio.demo (the sample)', 'cultifolio.demo')).toBe(true);
  });
  it('a setting kept through stored.ts has no second, direct writer', () => {
    expect([...viaHelper].filter((k) => direct.has(k)).map((k) => `${k}: ${direct.get(k)!.join(', ')}`)).toEqual([]);
  });
  it('every key /about/how names exists in the code, under the store it is named under', () => {
    const named = (part: string) => [...new Set([...part.matchAll(/\b(cultifolio\.[A-Za-z][\w.]*[A-Za-z]|storage-notice-hidden)\b/g)].map((m) => m[1]))];
    // "cultifolio.demo." and a setting's name: the template, read as its own line below.
    const localNamed = named(localPart), sessionNamed = named(sessionPart).filter((k) => !k.startsWith('cultifolio.demo.'));
    expect(localNamed.length).toBeGreaterThan(10);
    expect(localNamed.filter((k) => !local.has(k)).sort()).toEqual([]);
    expect(sessionNamed.filter((k) => !session.has(k)).sort()).toEqual([]);
  });
  it("the sample's template-built keys: formats names a copy for every setting stored.ts keeps, and no other", () => {
    expect(raw('src/lib/ui/stored.ts')).toMatch(/SAMPLE_PREFIX = 'cultifolio\.demo\.'/);
    expect(raw('src/lib/ui/stored.ts')).toMatch(/SAMPLE_PREFIX \+ key\.replace\(\/\^cultifolio\\\.\/, ''\)/);
    const sample = formats.slice(formats.indexOf('The sample collection is a database of its own'));
    const copies = new Set([...sample.matchAll(/cultifolio\.demo\.([a-zA-Z][\w.]*[a-zA-Z])/g)].map((m) => `cultifolio.${m[1]}`));
    // The units are read through the helper only inside a sample tab, so they have a copy too.
    const helper = new Set([...viaHelper, 'cultifolio.units']);
    expect([...helper].filter((k) => !copies.has(k)).sort()).toEqual(['cultifolio.persistAfterFirst']); // written only outside the sample (GrowLayer returns in it)
    expect([...copies].filter((k) => !helper.has(k)).sort()).toEqual([]);
  });
});

/* ---- IndexedDB, cache storage, lock and channel names ---- */
describe('IndexedDB, cache, lock and channel names, both ways', () => {
  /** Each name the code gives the browser, from the call that gives it, as the page writes it (a template's fixed part). */
  const inCode = () => {
    const names = new Set<string>();
    const fixed = (expr: string) => /['"`](cultifolio[\w-]*:?)/.exec(expr)?.[1] ?? null;
    for (const f of source) {
      const s = raw(f);
      const consts = new Map<string, string>();
      for (const m of s.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*([^;\n]+)/g)) consts.set(m[1], m[2]);
      const resolve = (arg: string) => { const a = arg.trim(); return consts.get(a) ?? a; };
      for (const m of s.matchAll(/(?:caches\.open|locks\.request|new BroadcastChannel|openDB<\w+>|openDB|deleteDatabase|deleteDB)\(\s*([^,)]+)/g)) {
        const e = resolve(m[1]);
        // The vault's database is chosen by a flag: both of its names, and the sample's staging copy follows the template.
        for (const lit of e.matchAll(/['"`](cultifolio[\w-]*:?)(?=['"`$])/g)) names.add(lit[1]);
        if (/\$\{DB_NAME\}-vault/.test(e)) { names.add('cultifolio-vault'); names.add('cultifolio-demo-vault'); }
        if (!fixed(e) && !/DB_NAME/.test(e) && !/\bname\b|\bn\b/.test(e)) names.add(`?${e}`);
      }
    }
    return names;
  };
  it('every name the code gives is on /about/how or /about/formats', () => {
    const names = inCode();
    expect(names.size).toBeGreaterThan(6);
    expect([...names].filter((n) => n.startsWith('?')).sort()).toEqual([]); // every call's name was read
    expect([...names].filter((n) => !pages.includes(n)).sort()).toEqual([]);
  });
  it('every such name the pages give is one the code uses', () => {
    const names = inCode();
    const named = new Set([...how.matchAll(/\b(cultifolio-[a-z0-9-]*:?)/g), ...formats.matchAll(/\b(cultifolio-[a-z0-9-]*:?)/g)].map((m) => m[1]));
    named.delete('cultifolio-backup'); // the backup file's format name, not a browser store
    named.delete('cultifolio-vault-v1'); // the key derivation's salt
    expect([...named].filter((n) => !names.has(n)).sort()).toEqual([]);
  });
});

/* ---- the browser's own requests ---- */
describe("the browser's own /api requests are on the pages", () => {
  it('every /api route a page or the browser code fetches is named', () => {
    // The service worker only answers the requests the pages make (its `/api/` strings are tests of a request's path).
    const client = source.filter((f) => !/\+server\.ts$|\/server\/|hooks\.server\.ts|service-worker\.ts|\/dossier\/|\/climate\//.test(f));
    const routes = new Set<string>();
    for (const f of client) for (const m of raw(f).matchAll(/[`'"](?:\$\{this\.base\})?\/api\/([a-z]+)/g)) routes.add(m[1]);
    for (const r of ['corpus', 'search', 'names', 'entries', 'sheets', 'rows', 'forecast', 'sync']) expect(routes, r).toContain(r);
    expect([...routes].filter((r) => !pages.includes(`/api/${r}`)).sort()).toEqual([]);
  });
  it('the framework\'s version check after a failed navigation is named, and its poll is off', () => {
    expect(raw('svelte.config.js')).toMatch(/pollInterval: 0/);
    expect(raw('node_modules/@sveltejs/kit/src/runtime/client/client.js')).toMatch(/updated\.check\(\)/);
    expect(how).toContain('/_app/version.json');
  });
});

/* ---- edge caches ---- */
describe('every edge cache is on /about/how, with its lifetime', () => {
  const words: Record<number, string> = { 60: 'a minute', 300: 'five minutes', 3600: 'an hour', 86400: 'a day' };
  // file → [the lifetime in its source, the words /about/how uses for what it keeps]
  const table: Record<string, [RegExp, string]> = {
    // Every lifetime the forecast's put names: an hour, and five minutes for an answer whose NWS alerts were refused
    // (agent S, round sixty-two second pass; the words review's 18). The figures are matched per item, both ways.
    'src/routes/api/forecast/+server.ts': [/cache\.put\([^\n]*/, 'a forecast for'],
    'src/routes/api/search/+server.ts': [/const CACHE_S = ([\d_]+)/, 'a catalogue search'],
    'src/routes/api/names/+server.ts': [/'public, max-age=(\d+)' \} \}\);\n\s*if \(cache\)/, 'a name typed into the species picker'],
    'src/lib/server/synonyms.ts': [/cache\.put\([^\n]*max-age=(\d+)/, 'a species address the backbone was asked about'],
    'src/routes/api/sheets/+server.ts': [/'cache-control': 'public, max-age=(\d+)'/, "a hash group's figure sheets"],
    'src/hooks.server.ts': [/const PAGE_CACHE_S = (\d+)/, 'as rendered']
  };
  it('the files that put to the edge are the table, no more and no fewer', () => {
    expect(source.filter((f) => /caches\??\.default/.test(raw(f))).sort()).toEqual(Object.keys(table).sort());
  });
  for (const [f, [re, what]] of Object.entries(table)) {
    it(`${f}: "${what}", kept for as long as the page says`, () => {
      const m = re.exec(raw(f));
      expect(m, f).not.toBeNull();
      // A capture is the lifetime; a put matched whole gives every max-age it names.
      const secs = (m![1] != null ? [m![1]] : [...m![0].matchAll(/max-age=(\d+)/g)].map((x) => x[1])).map((x) => Number(x.replace(/_/g, '')));
      expect(secs.length, f).toBeGreaterThan(0);
      for (const t of secs) expect(words[t], `${f}: ${t} s`).toBeDefined();
      const said = new Set(secs.map((t) => words[t]));
      const ats: number[] = [];
      for (let a = how.indexOf(what); a > -1; a = how.indexOf(what, a + 1)) ats.push(a);
      expect(ats.length, what).toBeGreaterThan(0);
      // The lifetime is said in the item that names it, which ends at its semicolon, its full stop or the next item: a
      // window of 260 characters reached the next items, so the forecast's held the search's "a day" and a forecast kept
      // for a day would have passed (round sixty-two, second pass; the words review's 26a). An item that names no
      // lifetime of its own shares the one its list gives before the semicolon ("a catalogue search, …, and a hash
      // group's figure sheets for a day"). Both ways, in the short list and in the full detail alike: every lifetime the
      // code uses is said in the item, and the item says no lifetime the code does not use.
      const others = Object.values(table).map(([, w]) => w).filter((w) => w !== what);
      for (const at of ats) {
        const stop = (x: number) => x > at;
        const end = Math.min(...[how.indexOf(';', at), how.indexOf('. ', at)].filter(stop));
        const next = Math.min(end, ...others.map((w) => how.indexOf(w, at + what.length)).filter(stop));
        const own = how.slice(at, next);
        const item = Object.values(words).some((w) => own.includes(w)) ? own : how.slice(at, end);
        for (const w of said) expect(item, w).toContain(w);
        expect(Object.values(words).filter((w) => !said.has(w) && item.includes(w)), item).toEqual([]);
      }
    });
  }
  it("the short list and the full detail both list every kind (no 'two public answers')", () => {
    expect(how).not.toMatch(/two public answers/);
    expect(how).toMatch(/Cloudflare's edge keeps copies of public answers, linked to no address/);
  });
});

/* ---- figures ---- */
describe('the figures the pages state are the constants', () => {
  const tenths: Record<number, string> = { 0.1: 'a tenth', 0.4: 'four tenths' };
  it("a forecast is kept on the device for as long as the page says, both ways (agent S's five minutes for refused alerts)", () => {
    const client = raw('src/lib/weather/client.ts');
    const mins = (name: string) => { const m = new RegExp(`export const ${name} = (\\d+) \\* 60_000`).exec(client); return m ? Number(m[1]) : null; };
    const minutes: Record<number, string> = { 5: 'five minutes', 30: 'half an hour' };
    expect(mins('FORECAST_TTL_MS')).toBe(30);
    // The device sentence and the key list: both name each lifetime the client keeps, and no other.
    const device = how.slice(how.indexOf('an answer is kept half an hour on the device'), how.indexOf('the same site is not asked again'));
    const key = how.slice(how.indexOf('cultifolio.forecast ('), how.indexOf(')', how.indexOf('cultifolio.forecast (') + 40) + 1);
    const kept = [mins('FORECAST_TTL_MS'), mins('REFUSED_TTL_MS')].filter((x): x is number => x != null).map((x) => minutes[x]);
    for (const part of [device, key]) {
      expect(part.length, part).toBeGreaterThan(20);
      for (const w of kept) expect(part, w).toContain(w);
      expect(Object.values(minutes).filter((w) => !kept.includes(w) && part.includes(w)), part).toEqual([]);
    }
  });
  it('600 calls a minute per service, a tenth per address, four tenths per /48', () => {
    expect(RATE.upstream.windowMs).toBe(60_000);
    expect(how).toContain(`a share of ${RATE.upstream.limit} calls a minute`);
    expect(how).toContain(`may take ${tenths[UPSTREAM_ADDRESS_PART]} of a share in a minute`);
    expect(how).toContain(`an IPv6 /48 ${tenths[Math.round(UPSTREAM_ADDRESS_PART * NET_FACTOR * 10) / 10]}`);
  });
  it('90 days without an upload gives a place back', () => {
    expect(formats).toContain(`A vault with no upload for ${RECLAIM_DAYS} days gives its place back`);
  });
  it('a crossed recount waits 30 s', () => {
    expect(formats).toContain(`Retry-After: ${RECOUNT_RETRY_S}`);
  });
  it('an hour: the recount on open, the refusal cap and the 409', () => {
    expect(RECOUNT_MS).toBe(3_600_000);
    expect(formats).toContain('on an open at most once an hour');
    const engine = raw('src/lib/sync/engine.svelte.ts');
    expect(engine).toMatch(/Math\.min\(3600, Number\(r\.headers\.get\('retry-after'\)\) \|\| 300\)/);
    expect(formats).toContain('or within the hour, whichever comes first');
    expect(formats).toContain('A 503 with no Retry-After is taken as five minutes');
    expect(engine).toMatch(/ASK_409_MS = 3600_000/);
    expect(formats).toContain('at most once an hour (the time it was last answered');
  });
  it('two days: parking, and a correction that needs two readings', () => {
    expect(PARK_MS).toBe(2 * 86_400_000);
    expect(formats).toContain('stamped more than two days past the arrival of the log batch'); // "log batch": round sixty-two, second pass (the words review's 22)
    expect(TRUST_SERVER_TWICE_PAST_MS).toBe(2 * 86_400_000);
    expect(formats).toContain('a correction of two days or more is taken only when two readings');
  });
  it('five minutes ahead, and half a minute of disagreement', () => {
    expect(MAX_AHEAD_MS).toBe(5 * 60_000);
    expect(formats).toContain('stamped more than five minutes ahead');
    expect(TRUST_SERVER_PAST_MS).toBe(30_000);
    expect(formats).toContain('by more than half a minute');
  });
  it('173 collector genera, as the file lists them', () => {
    const n = new Set(raw('scripts/specialist-genera.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))).size;
    expect(how).toContain(`of ${n} collector genera`);
  });
  it('the waiting counts are said where they are shown', () => {
    const shown = source.filter((f) => /<HeldNote\b/.test(raw(f))).map((f) => f.replace(/^src\/routes|\/\+page\.svelte$/g, '')).sort();
    expect(shown).toEqual(['/plants', '/today']);
    expect(formats).toContain('the plants list and Today say how many are waiting');
    expect(pages).not.toMatch(/every page that lists records says how many are waiting/i);
  });
});

/* ---- semantic fixtures ---- */
// The in-memory vault of collection-store.test.ts and r61l-records-restore-skew.test.ts, with the order of arrival.
type Mem = { changes: Map<string, Change>; meta: Map<string, unknown>; photos: Map<string, unknown>; device: string; order: boolean };
let mem: Mem = { changes: new Map(), meta: new Map(), photos: new Map(), device: 'devicex00000', order: true };
vi.mock('$lib/db/vault', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = {
    allChanges: async () => [...mem.changes.values()],
    appendChanges: async (cs: Change[]) => { for (const c of cs) mem.changes.set(c.t, c); return { kept: cs, replaced: [], seq: 0 }; },
    getMeta: async (k: string) => mem.meta.get(k),
    setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
    deviceId: async () => mem.device,
    requestPersistence: async () => true
  };
  m.appendChangesClaiming = async (_k: string, known: Set<string>, build: (s: Set<string>) => { changes: Change[]; result: unknown }) => { const b = build(new Set(known)); await m.appendChanges(b.changes); return b.result; };
  m.onOtherTabWrite = () => () => {};
  m.readFold = async () => undefined;
  m.writeFold = async () => false;
  m.foldGen = async () => 0;
  m.dropFold = async () => {};
  m.parkStamps = async (st: string[]) => { const had = (mem.meta.get('parked') as string[] | undefined) ?? []; const out = [...new Set([...had, ...st])]; mem.meta.set('parked', out); return out; };
  m.lastArrival = async () => 0;
  m.arrivalsAfter = async () => ({ changes: [...mem.changes.values()], seq: 0, gen: 0 });
  m.changeKeys = async () => [...mem.changes.keys()];
  // The order store: insertion order, or nothing at all for changes stored before it was kept.
  m.arrivalsOf = async (ts: string[]) => { if (!mem.order) return new Map(); const keys = [...mem.changes.keys()]; return new Map(ts.filter((t) => mem.changes.has(t)).map((t) => [t, keys.indexOf(t) + 1])); };
  m.changesByKeys = async (ts: string[]) => ts.map((t) => mem.changes.get(t)).filter(Boolean);
  m.updateMeta = async (k: string, fn: (had: unknown) => unknown) => { const next = fn(mem.meta.get(k)); mem.meta.set(k, next); return next; };
  m.changesOf = async (kind: string, id: string) => ([...mem.changes.values()] as Change[]).filter((c) => c.kind === kind && c.id === id);
  m.holdVault = async (work: () => Promise<unknown>) => work();
  m.putPhotoBlobs = async (p: { id: string }) => void mem.photos.set(p.id, p);
  m.getPhotoBlobs = async (id: string) => mem.photos.get(id);
  m.deletePhotoBlobs = async (id: string) => void mem.photos.delete(id);
  m.announceSyncForgotten = () => {};
  m.announceRefold = () => {};
  return m;
});
async function fresh(order: boolean) {
  vi.resetModules();
  mem = { changes: new Map(), meta: new Map(), photos: new Map(), device: 'devicex00000', order };
  const { collection } = await import('$lib/db/collection.svelte');
  await collection.load();
  return collection;
}
const peerPlant = (wall: number, id: string, no: string): Change[] => [
  { t: hlcEncode({ wall, count: 0, device: 'devicey00000' }), kind: 'accession', id, field: 'taxonName', value: 'Lithops lesliei' },
  { t: hlcEncode({ wall, count: 1, device: 'devicey00000' }), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: hlcEncode({ wall, count: 2, device: 'devicey00000' }), kind: 'accession', id, field: 'acc', value: no }
];

describe('semantic fixtures: what the code does is what formats says', () => {
  it('a marked change: six counter digits with the bit 0x800000, never held or parked', () => {
    const now = Date.UTC(2026, 9, 8);
    const far = `${now + 30 * 86_400_000}-0001-devicey00000x0z9`;
    const past = hlcPast(far, 'devicex00000a1b2');
    expect(past.split('-')[1]).toBe('800002');
    expect(isPastStamp(past)).toBe(true);
    const hold = { now, except: 'devicex00000', clockChecked: true };
    expect(isHeld(past, hold)).toBe(false);
    expect(isParked(past, { ...hold, arrival: now })).toBe(false);
    expect(formats).toContain('a hex counter of four digits, or six: past 65,535 changes in one millisecond, or for an edit placed past another stamp, which sets the bit 0x800000');
    expect(formats).not.toContain('only when a millisecond holds more than 65,535 changes');
    expect(formats).toContain('A marked stamp is never held or parked, on any device');
  });
  it("this device's own change ahead of its clock is neither held nor parked", () => {
    const now = Date.UTC(2026, 9, 8);
    const own = `${now + 3 * 86_400_000}-0000-devicex00000x0z9`;
    const hold = { now, except: 'devicex00000', clockChecked: true };
    expect(isHeld(own, hold)).toBe(false);
    expect(isParked(own, hold)).toBe(false);
    expect(formats).toContain('A change this device made is never held, and is judged once its log batch is listed');
    expect(formats).not.toMatch(/one read from a file, or not yet sent\) is held/);
  });
  it('a plant made before the removal by its clock but received after it: the restored plant yields its number', async () => {
    const c = await fresh(true);
    const mine = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0007', acquired: '2026-05-01' });
    await c.remove('accession', mine.id);
    await c.ingest(peerPlant(Date.now() - 10 * 60_000, 'rpeer', '2026-0007'), 'server'); // stamped ten minutes before the removal
    expect(await c.restore('accession', mine.id)).toEqual({ from: '2026-0007', to: '2026-0008' });
    expect(formats).toContain('yields its number only to a record that reached this device while it was removed, judged by the order in which changes arrived here and never by two devices\' clocks, whenever that record was made');
    expect(formats).not.toMatch(/a record created after the removal/);
  });
  // Round sixty-two (A22; the clock and records agent L): the order unknown, the record that stayed keeps the number and
  // the one coming back is renumbered with a note; before, nothing was judged and the number was left shared.
  it('a removal with no order history: the order is not known, the live plant keeps the number, the restored one takes the next', async () => {
    const c = await fresh(false);
    const mine = await c.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0007', acquired: '2026-05-01' });
    await c.remove('accession', mine.id);
    await c.ingest(peerPlant(Date.now() + 60_000, 'rpeer', '2026-0007'), 'server');
    expect(await c.restore('accession', mine.id)).toEqual({ from: '2026-0007', to: '2026-0008', unknown: true });
    expect(c.withNumber('accession', '2026-0007').map((a) => a.id)).toEqual(['rpeer']);
    expect(c.accession(mine.id)?.acc).toBe('2026-0008');
    expect(formats).toContain('When neither the removal nor the other record has a place, which came first is not known: the record that stayed keeps the number');
    expect(formats).toContain('the one coming back takes the next free number, with a note and a message saying the order is not known');
    expect(formats).not.toContain('the two are listed under it as above until the grower renumbers one');
  });
});

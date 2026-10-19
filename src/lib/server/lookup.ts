/**
 * The names a request asks the reference for, by one interface whatever the corpus (round seventy-six): from the build's
 * lookup files ($dossier/lookups) under a manifest that names them, one small file a key, or from the index held whole
 * under a corpus built before them (and the static and fixture corpora without them), through the maps the Worker
 * built per isolate until now. The two answer alike: the files are those maps written down by the build
 * (tests/unit/r76w-lookups.test.ts; scripts/dev/scale/r76-proof.ts on the real corpus).
 *
 * A lookup file that cannot be read is a 503 (`UNREADABLE`), never "no such species" (rule 2).
 */
import { error } from '@sveltejs/kit';
import { product, fromFiles, UNREADABLE, type Loaded, type Platform, type Fetch, type IndexEntry } from './dossiers';
import { slugify } from '$core/names';
import { isPageId, gbifAlias, type PageId } from '$core/page-id';
import { nameFromSlug } from './synonyms';
import { indexMaps, sharedOrder, synonymKey, keyName, keyFileOf, cardFilesFor, olderFilesFor, rowFileOf, rowFilesFor, generaOfIndex, type Ref, type Card, type CardFile, type NameRecord, type RowRecord } from '$dossier/lookups';
import { catalogueItems, rowGroupsOf, type By } from '$dossier/catalogue';

/** An older name's answer: the one species that holds it, or the two or more that do, in the order the 404 names them. */
export type Older = { one: Ref; matched: string } | { many: Ref[]; shared: string };

export interface Lookup {
  /** The id of the species whose slug this is, or null. */
  slug(slug: string): Promise<PageId | null>;
  /** The species under its id, or null when the reference has no page for it. */
  species(key: PageId): Promise<Card | null>;
  /**
   * The species whose own GBIF key this is (round seventy-eight), or null: the alias a GBIF answer, a grower's plant key
   * or a GBIF key in an API path finds a page by. Another GBIF key a page reads records from is no page's own.
   */
  gbif(key: number): Promise<Card | null>;
  /** The species whose accepted name this is, in lower case. */
  accepted(lower: string): Promise<Ref | null>;
  /** An older name, in lower case or as a slug (`synonymKey`): who holds it. */
  older(k: string): Promise<Older | null>;
  /** Every genus with its count of species, in the index's order. */
  genera(): Promise<ReadonlyMap<string, number>>;
  /** A catalogue row's species under "all", sorted by name, with each one's place in the index. */
  row(by: By, id: string): Promise<RowRecord | undefined>;
  /** Of these older names (`plainName`) of a species' record, those that are another species' accepted name here. */
  elsewhere(key: PageId, names: readonly string[]): Promise<Map<string, Ref>>;
}

const ref = (e: IndexEntry): Ref => [e.key, e.slug, e.name];

/* ---------- from the index held whole ---------- */

const places = new WeakMap<readonly IndexEntry[], Map<PageId, number>>();
const generaHeld = new WeakMap<readonly IndexEntry[], ReadonlyMap<string, number>>();
const rowsHeld = new WeakMap<readonly IndexEntry[], Map<By, Map<string, RowRecord>>>();
const fromIndex = new WeakMap<readonly IndexEntry[], Lookup>();
/** The lookups over an index held whole, as the Worker read names until round seventy-six. */
export function indexLookup(idx: IndexEntry[], bySlug?: ReadonlyMap<string, PageId> | null): Lookup {
  const hit = fromIndex.get(idx);
  if (hit && !bySlug) return hit;
  const m = () => indexMaps(idx);
  const slugs = bySlug ?? new Map(idx.map((e) => [e.slug, e.key]));
  const at = () => { let p = places.get(idx); if (!p) { p = new Map(); idx.forEach((e, i) => { if (!p!.has(e.key) || m().byKey.get(e.key) === e) p!.set(e.key, i); }); places.set(idx, p); } return p; };
  const cardOfEntry = (e: IndexEntry | undefined): Card | null => (e ? { key: e.key, ...(e.gbif != null ? { gbif: e.gbif } : {}), slug: e.slug, name: e.name, at: at().get(e.key)!, family: e.family, common: e.common, thumb: e.thumb, credit: e.credit, open: e.open, climate: e.climate, ...(e.syn ? { syn: e.syn } : {}), ...(e.near ? { near: e.near } : {}) } : null);
  const look: Lookup = {
    slug: async (s) => slugs.get(s) ?? null,
    species: async (key) => cardOfEntry(m().byKey.get(key)),
    gbif: async (key) => cardOfEntry(m().byGbif.get(key)),
    accepted: async (k) => { const e = m().byName.get(k); return e ? ref(e) : null; },
    older: async (k) => {
      const one = m().bySynonym.get(k);
      if (one) return { one: ref(one.entry), matched: one.matched };
      const many = m().ambiguous.get(k);
      if (!many) return null;
      const shared = m().sharedName.get(k)!;
      return { many: sharedOrder(many, shared).map(ref), shared };
    },
    genera: async () => { let g = generaHeld.get(idx); if (!g) generaHeld.set(idx, (g = new Map(generaOfIndex(idx)))); return g; },
    row: async (by, id) => {
      let all = rowsHeld.get(idx);
      if (!all) rowsHeld.set(idx, (all = new Map()));
      let rows = all.get(by);
      if (!rows) {
        const place = new Map(catalogueItems(idx).map((c, i) => [c, i]));
        rows = new Map([...rowGroupsOf(idx, by, 'all')].map(([k, items]) => [k, { at: items.map((c) => place.get(c)!), items }]));
        all.set(by, rows);
      }
      return rows.get(id);
    },
    elsewhere: async (key, names) => {
      const out = new Map<string, Ref>();
      for (const n of names) { const e = m().byName.get(n); if (e && e.key !== key) out.set(n, ref(e)); }
      return out;
    }
  };
  if (!bySlug) fromIndex.set(idx, look);
  return look;
}

/* ---------- from the build's lookup files ---------- */

const isRef = (x: unknown): x is Ref => Array.isArray(x) && x.length === 3 && isPageId(x[0]) && typeof x[1] === 'string' && typeof x[2] === 'string';
/** A file read, or a 503: a lookup file the manifest names and the bucket cannot give is a refusal, never an absence. */
async function file<T>(c: Loaded, platform: Platform, fetch: Fetch, name: string): Promise<T> {
  const f = await product<T>(c, platform, fetch, name);
  if (!f || typeof f !== 'object') {
    console.error(`lookup file ${name} of corpus ${c.corpus} could not be read`);
    error(503, { message: UNREADABLE });
  }
  return f;
}
const generaRead = new WeakMap<object, ReadonlyMap<string, number>>();
/** The lookups through the files a manifest names (round seventy-six). */
export function filesLookup(c: Loaded, platform: Platform, fetch: Fetch): Lookup {
  const m = c.manifest!;
  const cards = cardFilesFor(m.species), older = olderFilesFor(m.species);
  // A page's address and a species' card from the small card files; a name that is no page's address from the files of names (round seventy-seven).
  const card = async (k: string): Promise<PageId | Card | undefined> => {
    const f = await file<CardFile>(c, platform, fetch, `cards/${keyFileOf(k, cards)}.json`);
    return Object.hasOwn(f, k) ? f[k] : undefined;
  };
  const record = async (k: string): Promise<NameRecord | undefined> => {
    const f = await file<Record<string, NameRecord>>(c, platform, fetch, `older/${keyFileOf(k, older)}.json`);
    return Object.hasOwn(f, k) && f[k] && typeof f[k] === 'object' ? f[k] : undefined;
  };
  const cardOf = async (key: PageId): Promise<Card | null> => { const k = await card(keyName(key)); return k && typeof k === 'object' && k.key === key && typeof k.slug === 'string' ? k : null; };
  return {
    // A slug never begins with `#` (a card) or `@` (a GBIF key's alias): such an address is no page's.
    slug: async (s) => { if (s.startsWith('#') || s.startsWith('@')) return null; const r = await card(s); return isPageId(r) ? r : null; },
    species: cardOf,
    // The page whose own GBIF key this is: its id from the alias record, then its card, which must name the key back.
    gbif: async (key) => { const id = await card(gbifAlias(key)); if (!isPageId(id)) return null; const k = await cardOf(id); return k && k.gbif === key ? k : null; },
    accepted: async (k) => { const n = (await record(k))?.n; return isRef(n) ? n : null; },
    older: async (k) => {
      const o = (await record(k))?.o;
      if (!o || typeof o.m !== 'string' || !Array.isArray(o.h) || !o.h.every(isRef) || !o.h.length) return null;
      return o.h.length === 1 ? { one: o.h[0], matched: o.m } : { many: o.h, shared: o.m };
    },
    genera: async () => {
      const g = await file<Array<[string, number]>>(c, platform, fetch, 'genera.json');
      let out = generaRead.get(g);
      if (!out) generaRead.set(g, (out = new Map(Array.isArray(g) ? g : [])));
      return out;
    },
    row: async (by, id) => {
      const f = await file<Record<string, RowRecord>>(c, platform, fetch, `rows/${by}/${rowFileOf(id, rowFilesFor(by, m.species))}.json`);
      const r = Object.hasOwn(f, id) ? f[id] : undefined;
      return r && Array.isArray(r.items) && Array.isArray(r.at) ? r : undefined;
    },
    elsewhere: async (key, names) => {
      const x = (await cardOf(key))?.x ?? {};
      const out = new Map<string, Ref>();
      for (const n of names) if (Object.hasOwn(x, n) && isRef(x[n]) && x[n][0] !== key) out.set(n, x[n]);
      return out;
    }
  };
}

/**
 * The lookups of the corpus a request holds: through the files when its manifest names them, else through its index.
 * The files' lookups are made per call (they hold nothing; the files are kept by `product`), with the request's own
 * `fetch`; the index's are kept with the index.
 */
export function lookupOf(c: Loaded, platform: Platform, fetch: Fetch): Lookup {
  if (fromFiles(c)) return filesLookup(c, platform, fetch);
  if (c.idx) return indexLookup(c.idx, c.bySlug);
  throw new Error('lookupOf: a corpus with neither lookup files nor an index');
}

/**
 * What a species address names, as far as the reference's own names say, before GBIF is asked (the species route's
 * order since round seventy, read through `Lookup` since round seventy-six, so the proof can run it on every address):
 * an address that is not written as a slug moves to its slug; a slug of a page is that page; a genus alone opens its
 * catalogue row; an older name two species or more hold is the 404 that names them (rule 3); one held by one species
 * moves there; anything else is asked of GBIF. `resolve` gives a slug's key (the route's also finds the fixture's).
 */
export type Address =
  | { kind: 'move'; slug: string }
  | { kind: 'page'; key: PageId }
  | { kind: 'genus'; genus: string }
  | { kind: 'shared'; name: string; holders: Ref[]; inGenus: number }
  | { kind: 'older'; slug: string; matched: string; name: string; key: PageId }
  | { kind: 'ask' };
export async function addressOf(look: Lookup, address: string, resolve: (slug: string) => Promise<PageId | null> = (s) => look.slug(s)): Promise<Address> {
  if ((await look.slug(address)) == null) {
    const slug = slugify(address);
    if (slug !== address) return { kind: 'move', slug };
  }
  const key = await resolve(address);
  if (key) return { kind: 'page', key };
  if (/^[a-z]+$/.test(address)) {
    const g = address[0].toUpperCase() + address.slice(1);
    if ((await look.genera()).get(g)) return { kind: 'genus', genus: g };
  }
  const o = await look.older(synonymKey(address));
  if (o && 'many' in o) return { kind: 'shared', name: o.shared, holders: o.many, inGenus: (await look.genera()).get(o.shared.split(' ')[0]) ?? 0 };
  const name = nameFromSlug(address);
  if (name && /^[A-Z][a-z]+ [a-z]/.test(name)) {
    const one = async (k: string) => { const x = await look.older(k); return x && 'one' in x ? x : null; };
    const hit = (await one(address.trim().toLowerCase())) ?? (await one(name.toLowerCase()));
    if (hit) return { kind: 'older', slug: hit.one[1], matched: hit.matched, name: hit.one[2], key: hit.one[0] };
  }
  return { kind: 'ask' };
}

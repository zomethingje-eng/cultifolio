/**
 * The search box's browse rows (round eighty-seven, C3): what a query names besides species, each a view of the browse
 * engine with its count. A genus ("hood", "hodia"), a family ("apoc"), a country ("namib"), a TDWG region ("cape prov",
 * and its other names: "Limpopo", "Transvaal", "Oaxaca"), and a genus or family with a place ("hoodia namib": Hoodia
 * native to Namibia). The species rows are the catalogue's own search (/api/search), asked beside this, unchanged.
 *
 * A name is matched as its letters are typed, from their start, or one typing error from a whole word of four letters
 * or more ($core/regions' `regionsTyped`, the search's `nearestGenus` for a genus); never by a guess at what was meant.
 */
import { slugify, withoutSign } from '$core/names';
import { regionsTyped } from '$core/regions';
import { nearestGenus } from '$core/search';
import { queryString, wholeCounts, countIn, EMPTY, GENUS_PAGE_MIN, type Prepared } from './engine';
import { COUNTRIES, LEVEL3, REGIONS, regionOf, regionFold, aliases, level3Of, type Country, type Region } from './tdwg';

export type SuggestKind = 'combined' | 'genus' | 'family' | 'country' | 'region';
export interface Suggestion {
  kind: SuggestKind;
  /** What the row says, with `sci` set in the serif where it is a scientific name. */
  label: string;
  sci?: string;
  /** Its kind and figures, in words. */
  sub: string;
  href: string;
  n: number;
}
const MAX = 6;
const fold = regionFold;
const fmt = (n: number) => n.toLocaleString('en-GB');

type Place = { kind: 'country'; c: Country } | { kind: 'region'; r: Region; via?: string };
const placeCodes = (pl: Place) => (pl.kind === 'country' ? [...pl.c.regions] : [pl.r.code]);
const placeName = (pl: Place) => (pl.kind === 'country' ? pl.c.name : pl.r.label);

/**
 * The places a phrase names, the nearest first: a name spelt as typed, then one begun so, then one whose words are begun
 * or one typing error away (`regionsTyped`), then an other name of a region ("Limpopo"). A country and a region that
 * hold the same level-3 regions (Mexico, both) are one row: the region's page.
 */
let folded: { countries: Array<[string, Country]>; regions: Array<[string, Region]>; aliases: Array<[string, ReturnType<typeof aliases>[number]]>; labels: string[] } | null = null;
const places = () => (folded ??= {
  countries: [...COUNTRIES.values()].filter((c) => c.regions.length).map((c) => [fold(c.name), c]),
  regions: [...REGIONS.values()].sort((a, b) => b.level - a.level).map((r) => [fold(r.label), r]),
  aliases: aliases().filter((a) => a.regions.length <= 3).map((a) => [fold(a.name), a]),
  labels: LEVEL3.map((r) => r.label)
});
function placesOf(phrase: string): Place[] {
  const f = fold(phrase);
  const P = places();
  if (f.length < 2) return [];
  const scored: Array<{ pl: Place; score: number; order: number }> = [];
  let order = 0;
  const add = (pl: Place, score: number) => scored.push({ pl, score, order: order++ });
  for (const [x, c] of P.countries) if (x === f || (f.length >= 3 && x.startsWith(f))) add({ kind: 'country', c }, x === f ? 0 : 1);
  for (const [x, r] of P.regions) if (x === f || (f.length >= 3 && x.startsWith(f))) add({ kind: 'region', r }, x === f ? 0 : 1);
  for (const name of regionsTyped(phrase, P.labels)) { const r = LEVEL3.find((x) => x.label === name); if (r) add({ kind: 'region', r }, 2); }
  if (f.length >= 3) for (const [x, a] of P.aliases) if (x === f || x.startsWith(f)) for (const code of a.regions) { const r = regionOf(code); if (r) add({ kind: 'region', r, via: a.name }, x === f ? 2 : 3); }
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const { pl } of scored) {
    const set = [...placeCodes(pl).flatMap((c) => level3Of(c))].sort().join(',');
    if (seen.has(set)) continue;
    seen.add(set);
    // Of a country and a region with the same regions, the region's page (it has its own figures), named as the country is.
    const twin = pl.kind === 'country' ? scored.find((x) => x.pl.kind === 'region' && !x.pl.via && [...level3Of(x.pl.r.code)].sort().join(',') === set) : undefined;
    out.push(twin ? twin.pl : pl);
  }
  return out.slice(0, 4);
}

/** Per table: the genera's and families' names folded, and their counts, made once. */
const taxaHeld = new WeakMap<Prepared, { genera: string[]; families: string[]; genus: Int32Array; family: Int32Array }>();
function taxa(p: Prepared) {
  let x = taxaHeld.get(p);
  if (!x) {
    const genus = new Int32Array(p.genera.length), family = new Int32Array(p.t.families.length);
    for (let i = 0; i < p.t.n; i++) { genus[p.genus[i]]++; if (p.t.family[i] >= 0) family[p.t.family[i]]++; }
    taxaHeld.set(p, (x = { genera: p.genera.map((g) => fold(withoutSign(g))), families: p.t.families.map(fold), genus, family }));
  }
  return x;
}

interface Taxon { kind: 'genus' | 'family'; name: string; slug: string; n: number; family?: string }
function taxaOf(p: Prepared, word: string, counts: Int32Array, w: ReturnType<typeof wholeCounts>): Taxon[] {
  const f = fold(word);
  if (f.length < 2 || /\s/.test(word.trim())) return [];
  const T = taxa(p);
  const genera: Array<{ g: string; i: number }> = [];
  T.genera.forEach((x, i) => { if (x.startsWith(f)) genera.push({ g: p.genera[i], i }); });
  genera.sort((a, b) => Number(T.genera[b.i] === f) - Number(T.genera[a.i] === f) || counts[b.i] - counts[a.i]);
  let out: Taxon[] = genera.slice(0, 3).map(({ g, i }) => ({ kind: 'genus', name: g, slug: slugify(g), n: counts[i], family: w.genusFamily[i] }));
  if (!out.length && f.length >= 4) {
    // A genus two letters off and no other ("hodia" is Hoodia), as the catalogue's search reads one.
    const near = nearestGenus(word, p.genera);
    const i = near ? p.genera.indexOf(near) : -1;
    if (i >= 0) out = [{ kind: 'genus', name: near!, slug: slugify(near!), n: counts[i], family: w.genusFamily[i] }];
  }
  if (f.length >= 3) T.families.forEach((x, i) => { if (x.startsWith(f)) out.push({ kind: 'family', name: p.t.families[i], slug: slugify(p.t.families[i]), n: 0 }); });
  return out;
}

/** The rows for a query, the combined ones first, at most six. */
export function suggest(p: Prepared, q: string): Suggestion[] {
  const text = q.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80);
  const words = text.split(' ').filter(Boolean);
  if (!words.length || fold(text).length < 2) return [];
  const w = wholeCounts(p);
  const { genus: counts, family: famCount } = taxa(p);
  const out: Suggestion[] = [];

  // A taxon and a place, in either order ("hoodia namib", "namibia hoodia").
  if (words.length >= 2) {
    for (const [t, pl] of [[words[0], words.slice(1).join(' ')], [words[words.length - 1], words.slice(0, -1).join(' ')]] as const) {
      const taxa = taxaOf(p, t, counts, w).filter((x) => x.kind === 'family' || x.n >= 1);
      const places = placesOf(pl);
      if (taxa.length !== 1 || !places.length) continue;
      const tx = taxa[0];
      for (const place of places.slice(0, 2)) {
        const q2 = { ...(tx.kind === 'genus' ? { g: tx.slug } : { f: tx.slug }), r: placeCodes(place) };
        const n = countIn(p, q2, q2.r);
        if (!n) continue;
        out.push({ kind: 'combined', label: `${tx.name} native to ${placeName(place)}`, ...(tx.kind === 'genus' ? { sci: tx.name } : {}), sub: `${tx.kind} and ${place.kind === 'country' ? 'country' : 'region'} · ${fmt(n)} species`, href: `/browse${queryString({ ...EMPTY, ...q2 })}`, n });
      }
      if (out.length) break;
    }
  }

  // The whole query as one name: a genus, a family, a place.
  const one = words.length === 1 ? taxaOf(p, words[0], counts, w) : [];
  for (const tx of one) {
    if (tx.kind === 'genus') {
      if (tx.n < GENUS_PAGE_MIN) continue; // a genus of one species is its species' row
      out.push({ kind: 'genus', label: tx.name, sci: tx.name, sub: `genus${tx.family ? ` · ${tx.family}` : ''} · ${fmt(tx.n)} species`, href: `/genus/${tx.slug}`, n: tx.n });
    } else {
      const i = p.familyBySlug.get(tx.slug)!;
      out.push({ kind: 'family', label: tx.name, sub: `family · ${fmt(famCount[i])} species`, href: `/family/${tx.slug}`, n: famCount[i] });
    }
  }
  for (const pl of placesOf(text)) {
    if (pl.kind === 'country') {
      const c = pl.c, n = w.countries.get(c.iso) ?? 0;
      if (!n) continue;
      const with_ = c.regions.length > 1 ? `TDWG's ${c.regions.map((x) => regionOf(x)!.label).slice(0, 3).join(', ')}${c.regions.length > 3 ? ` and ${c.regions.length - 3} more` : ''}` : c.shared ? `part of TDWG's ${regionOf(c.regions[0])!.label}` : `TDWG's ${regionOf(c.regions[0])!.label}`;
      out.push({ kind: 'country', label: `Native to ${c.name}`, sub: `country · ${with_} · ${fmt(n)} species`, href: `/browse${queryString({ ...EMPTY, r: [...c.regions] })}`, n });
    } else {
      const r = pl.r, n = w.regions.get(r.code) ?? 0;
      if (!n) continue;
      const level = r.level === 3 ? `TDWG region ${r.code}` : `${r.level === 2 ? 'TDWG region' : 'TDWG continent'} of ${level3Of(r.code).length} level-3 regions`;
      out.push({ kind: 'region', label: pl.via ? `${pl.via}: in ${r.label}` : r.label, sub: `${level}${pl.via ? `, which takes in ${pl.via}` : ''} · ${fmt(n)} species`, href: `/region/${r.slug}`, n });
    }
  }
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true))).slice(0, MAX);
}

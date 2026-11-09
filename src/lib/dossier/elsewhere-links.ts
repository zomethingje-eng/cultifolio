/**
 * The registers and floras a page's Wikidata item is read for, and the links the page makes of them (round eighty-seven,
 * stage 2; links agent; the fill is `elsewhere.ts`). Kept apart from the fill so the species page reads it without the
 * source's code. The property ids and formatter URLs were read from Wikidata's query service on 2026-11-09
 * (`?p wdt:P1630 ?fmt`), and are listed here as read. CalPhotos' formatter (P12554) is Wikidata's redirector with
 * CalPhotos' address as its `url_prefix`; the link is that address with the value appended, as the redirector makes it.
 */
import type { Elsewhere } from './schema';

/** One statement as the fill reads it: the value of an external identifier, and its rank (a deprecated one is not read). */
export type IdClaims = Record<string, Array<{ rank?: string; mainsnak?: { snaktype?: string; datavalue?: { value?: unknown } } }>>;

export type ElsewhereProperty = { p: string; label: string; formatter: string; /** The page's own `links` key for this register: shown only when the page has none. */ own?: string };

/** The registers and floras read, in the order the page lists them. */
export const ELSEWHERE_PROPERTIES: readonly ElsewhereProperty[] = [
  // The page's own registers (linked under Names and registers already where the build holds them).
  { p: 'P846', label: 'GBIF', formatter: 'https://www.gbif.org/species/$1', own: 'gbif' },
  { p: 'P5037', label: 'POWO', formatter: 'https://powo.science.kew.org/taxon/$1', own: 'powo' },
  { p: 'P961', label: 'IPNI', formatter: 'https://www.ipni.org/n/$1', own: 'ipni' },
  { p: 'P7715', label: 'WFO', formatter: 'https://list.worldfloraonline.org/$1', own: 'wfo' },
  { p: 'P3151', label: 'iNaturalist', formatter: 'https://inaturalist.org/taxa/$1', own: 'inat' },
  // Names and checklists.
  { p: 'P960', label: 'Tropicos', formatter: 'https://www.tropicos.org/name/$1' },
  { p: 'P10585', label: 'Catalogue of Life', formatter: 'https://www.catalogueoflife.org/data/taxon/$1' },
  { p: 'P12380', label: 'Euro+Med', formatter: 'https://www.europlusmed.org/cdm_dataportal/taxon/$1' },
  // Trade and threat.
  { p: 'P2040', label: 'Species+ (CITES)', formatter: 'https://speciesplus.net/#/taxon_concepts/$1' },
  { p: 'P627', label: 'IUCN Red List', formatter: 'https://www.iucnredlist.org/details/$1/0' },
  { p: 'P6056', label: 'Red List of South African Plants', formatter: 'http://redlist.sanbi.org/species.php?species=$1' },
  { p: 'P10243', label: 'NatureServe', formatter: 'https://explorer.natureserve.org/Taxon/ELEMENT_GLOBAL.$1/' },
  // Floras.
  { p: 'P1727', label: 'Flora of North America', formatter: 'http://www.efloras.org/florataxon.aspx?flora_id=1&taxon_id=$1' },
  { p: 'P1747', label: 'Flora of China', formatter: 'http://www.efloras.org/florataxon.aspx?flora_id=2&taxon_id=$1' },
  { p: 'P1772', label: 'USDA PLANTS', formatter: 'https://plants.sc.egov.usda.gov/plant-profile/$1' },
  { p: 'P3420', label: 'Calflora', formatter: 'https://www.calflora.org/cgi-bin/species_query.cgi?where-calrecnum=$1' },
  { p: 'P10701', label: 'Reflora', formatter: 'https://floradobrasil.jbrj.gov.br/$1' },
  { p: 'P6756', label: 'Flora of Australia', formatter: 'https://profiles.ala.org.au/opus/foa/profile/$1' },
  { p: 'P5984', label: 'APNI', formatter: 'https://id.biodiversity.org.au/name/apni/$1' },
  { p: 'P3101', label: 'FloraBase', formatter: 'https://florabase.dpaw.wa.gov.au/browse/profile/$1' },
  { p: 'P5945', label: 'VicFlora', formatter: 'https://vicflora.rbg.vic.gov.au/flora/taxon/$1' },
  { p: 'P3130', label: 'NSW Flora', formatter: 'https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?page=nswfl&lvl=sp&name=$1' },
  { p: 'P6034', label: 'Missouri Plant Finder', formatter: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=$1' },
  // Photographs and literature.
  { p: 'P12554', label: 'CalPhotos', formatter: 'https://calphotos.berkeley.edu/cgi/img_query?where-taxon=$1' },
  { p: 'P687', label: 'BHL', formatter: 'https://biodiversitylibrary.org/page/$1' },
  // Other databases.
  { p: 'P830', label: 'EOL', formatter: 'https://eol.org/pages/$1' },
  { p: 'P815', label: 'ITIS', formatter: 'https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=TSN&search_value=$1' },
  { p: 'P685', label: 'NCBI', formatter: 'https://www.ncbi.nlm.nih.gov/datasets/taxonomy/$1/' }
];
const BY_P = new Map(ELSEWHERE_PROPERTIES.map((x) => [x.p, x]));

/** The item's values for the properties read, in the table's order, one per property (its first value not deprecated). */
export function elsewhereIds(claims: IdClaims): Array<{ p: string; v: string }> {
  const out: Array<{ p: string; v: string }> = [];
  for (const { p } of ELSEWHERE_PROPERTIES) {
    const st = (claims[p] ?? []).filter((c) => c.rank !== 'deprecated' && (c.mainsnak?.snaktype ?? 'value') === 'value');
    // A preferred value first, as Wikidata ranks them; else the first normal one.
    const pick = st.find((c) => c.rank === 'preferred') ?? st[0];
    const val = pick?.mainsnak?.datavalue?.value;
    if (typeof val === 'string' && safeValue(val)) out.push({ p, v: val.trim() });
  }
  return out;
}

/** A value fit to put into an address: printable, no markup, not over 200 characters. */
const safeValue = (v: string) => v.trim().length > 0 && v.length <= 200 && !/[\u0000-\u001f<>"\\`]/.test(v);

/** A value written into an address: reserved characters other than those identifiers use (`:`, `-`, `.`, `_`, `~`) encoded. */
const enc = (v: string) => v.trim().replace(/[^A-Za-z0-9._~:-]/g, (ch) => encodeURIComponent(ch));

export type ElsewhereLink = { p: string; label: string; url: string; v: string };

/**
 * The links the page shows: each identifier read, by its property's formatter, leaving out a register the page links
 * itself (`own` among `links`' keys). An unknown property (a table changed after the read) is left out.
 */
export function elsewhereLinks(e: Elsewhere['wikidata'] | undefined, links: Record<string, string> = {}): ElsewhereLink[] {
  if (!e || e.unanswered) return [];
  const out: ElsewhereLink[] = [];
  for (const { p, v } of e.ids) {
    const x = BY_P.get(p);
    if (!x || (x.own && links[x.own]) || !safeValue(v)) continue;
    out.push({ p, label: x.label, v, url: x.formatter.replace('$1', enc(v)) });
  }
  return out;
}


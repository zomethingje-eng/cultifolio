/**
 * Care archetypes: what KIND of plant something is, horticulturally, resolved
 * species → genus → family, and whichever answers says so, because "the genus
 * is reliably one kind of plant" and "the family usually is" are different
 * strengths of claim.
 *
 * The table supplies one figure: a conventional minimum for growing the group
 * indoors, for groups with no dormancy to meet the cold in. No source is given
 * for it, so it is shown as a convention, apart from the habitat's figures, and
 * it never changes the cold floor (round sixty; self-review 3, words 1). It
 * supplies no prose. What a group "wants" is practice, and the sheet does not
 * say it. The genus and family lists are data (arch-tables.json) so they can
 * grow without touching code. A family that splits between groups (Bromeliaceae,
 * Orchidaceae, Araceae and the like) is not on the family list, and the genera
 * under `none` (terrestrial bromeliads, terrestrial or temperate orchids) are
 * never grouped at all, whatever their family.
 */
import tables from './arch-tables.json';

export type ArchKey = 'arid' | 'tropical' | 'orchid' | 'epiphyte' | 'moist' | 'carnivore' | 'geophyte' | 'temperate';

export interface Archetype {
  key: ArchKey;
  lab: string;
  /** The group in the plural, for "the convention for orchids grown indoors" (optional for older callers that build one by hand). */
  many?: string;
  /** Conventional minimum for growing the group indoors, °C, with no source; null when the group spans too much for one figure. */
  minC: number | null;
}

export const ARCH: Record<ArchKey, Archetype> = {
  arid: { key: 'arid', lab: 'Cactus or succulent', many: 'cacti and succulents', minC: null },
  tropical: { key: 'tropical', lab: 'Tropical foliage plant', many: 'tropical foliage plants', minC: 12 },
  orchid: { key: 'orchid', lab: 'Orchid', many: 'orchids', minC: 13 },
  // "Epiphyte", not "Other epiphyte": "an other epiphyte" was printed (round sixty; words 6).
  epiphyte: { key: 'epiphyte', lab: 'Epiphyte', many: 'epiphytes', minC: 10 },
  moist: { key: 'moist', lab: 'Fern or moss', many: 'ferns and mosses', minC: 5 },
  carnivore: { key: 'carnivore', lab: 'Carnivorous plant', many: 'carnivorous plants', minC: null },
  geophyte: { key: 'geophyte', lab: 'Bulb, tuber or caudex', many: 'bulbs, tubers and caudiciforms', minC: null },
  temperate: { key: 'temperate', lab: 'Temperate garden plant', many: 'temperate garden plants', minC: null }
};

const byGenus = new Map<string, ArchKey>();
for (const [k, list] of Object.entries(tables.genus as Record<string, string[]>)) for (const g of list) byGenus.set(g.split(' ')[0].toLowerCase(), k as ArchKey);
const byFamily = new Map<string, ArchKey>();
for (const [k, list] of Object.entries(tables.family as Record<string, string[]>)) for (const f of list) byFamily.set(f.toLowerCase(), k as ArchKey);
/**
 * Genera never grouped, whatever their family: terrestrial bromeliads and terrestrial or temperate orchids (round sixty;
 * self-review 3), and since round sixty-two the terrestrial orchids the orchid group still held (Paphiopedilum, Ludisia,
 * Phaius, Phragmipedium, Cynorkis, Cymbidium), the rock and ground bromeliads Alcantarea and Billbergia, and Selaginella
 * (outside review A4).
 */
const ungrouped = new Set((tables as { none?: string[] }).none?.map((g) => g.toLowerCase()) ?? []);
const bySpecies = new Map<string, ArchKey>(Object.entries(tables.species as Record<string, string>).map(([s, k]) => [s, k as ArchKey]));

export interface ArchGuess {
  arch: Archetype;
  tier: 'species' | 'genus' | 'family';
  of: string;
  /** Where the table lists it, as a phrase: "listed under the genus Copiapoa in the archetype table" (round sixty-two). */
  why: string;
}

export function archFor(scientific: string, family?: string | null): ArchGuess | null {
  const name = scientific.trim().toLowerCase();
  const genus = name.split(/\s+/)[0];
  const sp = bySpecies.get(name.split(/\s+/).slice(0, 2).join(' '));
  if (sp) return { arch: ARCH[sp], tier: 'species', of: scientific, why: `listed by name in the archetype table, apart from its genus` };
  if (ungrouped.has(genus)) return null;
  const g = byGenus.get(genus);
  // What the table says, not a claim about the plant: "the genus X, which is reliably one kind of plant" was an authored
  // claim on a species page (round sixty-two; outside review A4). The tier still says how wide the listing is.
  if (g) return { arch: ARCH[g], tier: 'genus', of: genus, why: `listed under the genus ${genus[0].toUpperCase() + genus.slice(1)} in the archetype table` };
  const f = family ? byFamily.get(family.toLowerCase()) : undefined;
  if (f) return { arch: ARCH[f], tier: 'family', of: family!, why: `listed under the family ${family} in the archetype table` };
  return null;
}

/** The label with its article, lower-cased: "a cactus or succulent", "an orchid" ("a other epiphyte" was live: round thirty-three, R3-7; "an other epiphyte", round sixty). */
export const aLabel = (lab: string): string => (/^other\b/i.test(lab) ? `another${lab.slice(5).toLowerCase()}` : `${/^[aeiou]/i.test(lab) ? 'an' : 'a'} ${lab.toLowerCase()}`);

/** The convention as a sentence of its own, apart from any habitat figure: "the convention for orchids grown indoors is 13 °C; no source is given for it". */
export const conventionOf = (a: Archetype, t: (c: number) => string): string | null => (a.minC == null ? null : `the convention for ${a.many ?? `${a.lab.toLowerCase()}s`} grown indoors is ${t(a.minC)}; no source is given for it`);

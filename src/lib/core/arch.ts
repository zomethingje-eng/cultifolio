/**
 * Care archetypes: what KIND of plant something is, horticulturally, resolved
 * species → genus → family, and whichever answers says so, because "the genus
 * is reliably one kind of plant" and "the family usually is" are different
 * strengths of claim.
 *
 * A listing is taken for a page only where Kew's own description of the species
 * agrees with it (round eighty-one, the owner's decision on review D2): the table
 * listed most groups by genus, so every species of a mixed genus took the genus's
 * group, and groundsel was "a cactus or succulent" and bitter melon "a bulb, tuber
 * or caudex". Kew's lifeform (WCVP's `lifeform_description`, carried on the
 * dossier as `distribution.kew.lifeform`) must be on file and say what the group
 * says (`AGREE`); otherwise the page states no group.
 *
 * The table supplies no figure and no prose. Until round eighty-one it held a
 * conventional indoor minimum for four groups (tropical foliage plant 12 °C,
 * orchid 13 °C, epiphyte 10 °C, fern or moss 5 °C), with no source; the owner
 * removed them. What a group "wants" is practice, and the sheet does not say it.
 * The genus and family lists are data (arch-tables.json) so they can grow without
 * touching code. A family that splits between groups (Bromeliaceae, Orchidaceae,
 * Araceae and the like) is not on the family list, and the genera under `none`
 * (terrestrial bromeliads, terrestrial or temperate orchids) are never grouped at
 * all, whatever their family.
 */
import tables from './arch-tables.json';

export type ArchKey = 'arid' | 'tropical' | 'orchid' | 'epiphyte' | 'moist' | 'carnivore' | 'geophyte' | 'temperate';

export interface Archetype {
  key: ArchKey;
  lab: string;
  /** The group in the plural: "cacti and succulents" (optional for older callers that build one by hand). */
  many?: string;
}

export const ARCH: Record<ArchKey, Archetype> = {
  arid: { key: 'arid', lab: 'Cactus or succulent', many: 'cacti and succulents' },
  tropical: { key: 'tropical', lab: 'Tropical foliage plant', many: 'tropical foliage plants' },
  orchid: { key: 'orchid', lab: 'Orchid', many: 'orchids' },
  // "Epiphyte", not "Other epiphyte": "an other epiphyte" was printed (round sixty; words 6).
  epiphyte: { key: 'epiphyte', lab: 'Epiphyte', many: 'epiphytes' },
  moist: { key: 'moist', lab: 'Fern or moss', many: 'ferns and mosses' },
  carnivore: { key: 'carnivore', lab: 'Carnivorous plant', many: 'carnivorous plants' },
  geophyte: { key: 'geophyte', lab: 'Bulb, tuber or caudex', many: 'bulbs, tubers and caudiciforms' },
  temperate: { key: 'temperate', lab: 'Temperate garden plant', many: 'temperate garden plants' }
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
  /**
   * Where the table lists it and what Kew says, as a phrase: "listed under the genus Copiapoa in the archetype table, and
   * Kew describes it as “succulent subshrub”" (round sixty-two; round eighty-one).
   */
  why: string;
}

/** Kew's own one-line description of a species, as the dossier carries it (`distribution.kew`). */
export interface KewWords {
  lifeform?: string;
  climate?: string;
}

/**
 * What Kew's description must say for a listing to stand (round eighty-one, the owner's decision on review D2). Kew's
 * lifeforms name succulence, geophytes (bulbs, corms, tubers, rhizomes, caudices) and epiphytes, so those groups need
 * the word ("semisucculent" counts: Kew so calls Adenium obesum), and an orchid needs an epiphyte, lithophyte or climber, since the
 * table's terrestrial orchids are ungrouped already (`none`). "Tropical foliage plant" and "temperate garden plant" name
 * a climate, which Kew's climate words say ("wet tropical", "seasonally dry tropical" and "montane tropical";
 * "temperate" and "subalpine or subarctic"; "subtropical" is neither). No lifeform names a fern or a carnivorous plant:
 * those two groups need a lifeform on file and nothing more. Read in any case.
 */
export const AGREE: Record<ArchKey, { life: RegExp; climate?: RegExp }> = {
  arid: { life: /succulent/i },
  geophyte: { life: /geophyte|(?<!pseudo)bulb|tuber|corm|caudex/i },
  epiphyte: { life: /epiphyt/i },
  orchid: { life: /epiphyt|lithophyt|climb/i },
  tropical: { life: /\S/, climate: /(?<!sub)tropical/i },
  temperate: { life: /\S/, climate: /temperate|subalpine|subarctic/i },
  moist: { life: /\S/ },
  carnivore: { life: /\S/ }
};

/** The table's listing alone, before Kew's description is read: what the table says, for its own tests and audits. */
export function listedFor(scientific: string, family?: string | null): ArchGuess | null {
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

/**
 * The page's group: the table's listing, where Kew's description of the species agrees with it (`AGREE`), else null.
 * Without Kew's description (none on file, or not passed) there is no group: a listing alone is a genus-wide guess.
 */
export function archFor(scientific: string, family: string | null | undefined, kew: KewWords | null | undefined): ArchGuess | null {
  const g = listedFor(scientific, family);
  if (!g) return null;
  const life = kew?.lifeform?.trim() ?? '';
  const climate = kew?.climate?.trim() ?? '';
  const rule = AGREE[g.arch.key];
  if (!life || !rule.life.test(life)) return null;
  if (rule.climate && !(climate && rule.climate.test(climate))) return null;
  return { ...g, why: `${g.why}, and Kew describes it as “${life}”${rule.climate ? `, “${climate}”` : ''}` };
}

/** The label with its article, lower-cased: "a cactus or succulent", "an orchid" ("a other epiphyte" was live: round thirty-three, R3-7; "an other epiphyte", round sixty). */
export const aLabel = (lab: string): string => (/^other\b/i.test(lab) ? `another${lab.slice(5).toLowerCase()}` : `${/^[aeiou]/i.test(lab) ? 'an' : 'a'} ${lab.toLowerCase()}`);

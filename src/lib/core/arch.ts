/**
 * Care archetypes: what KIND of plant something is, horticulturally. A cactus
 * and a fern want opposite things, and no amount of habitat climate tells you
 * which one you are holding. Lookup is species, then genus, then family, and
 * whichever answers says so, because "the genus is reliably one kind of plant"
 * and "the family usually is" are different strengths of claim.
 *
 * Carried over from v2 (its genus table is a day's work that pays out for
 * every user) and kept as data so it can grow without touching code.
 */
import tables from './arch-tables.json';

export type ArchKey = 'arid' | 'tropical' | 'orchid' | 'epiphyte' | 'moist' | 'carnivore' | 'geophyte' | 'temperate';

export interface Archetype {
  key: ArchKey;
  lab: string;
  hint: string;
  exposure: 'full' | 'part' | 'shade';
  /** Conventional cold floor and heat ceiling for the group, °C; null when the group spans too much. */
  minC: number | null;
  maxC: number | null;
  /** Humidity worth chasing, %; null when it is not. */
  rh: number | null;
  dry: 'through' | 'top' | 'fast' | 'never';
  waterQ: 'any' | 'low' | 'pure';
  /** Conventional DLI band, mol/m²/day. */
  dli: [number, number];
  /** Repot and feed intervals in days; feedD 0 means never. */
  repotD: number;
  feedD: number;
  pests: string;
  reTreatD: number;
  water: string;
}

export const ARCH: Record<ArchKey, Archetype> = {
  arid: { key: 'arid', lab: 'Cactus or succulent', hint: 'Stores water in leaf, stem or root. Dries right through between waterings.', exposure: 'full', minC: null, maxC: null, rh: null, dry: 'through', waterQ: 'any', dli: [18, 35], repotD: 1095, feedD: 28, pests: 'Mealybug, root mealy, scale and sciarid larvae', reTreatD: 10, water: 'Soak hard, then let it dry all the way through before the next one. More die of a wet winter than a dry summer.' },
  tropical: { key: 'tropical', lab: 'Tropical foliage plant', hint: 'Aroids, marantas, figs, begonias. Grown for leaves; never bone dry, never cold.', exposure: 'part', minC: 12, maxC: 35, rh: 50, dry: 'top', waterQ: 'any', dli: [6, 14], repotD: 550, feedD: 21, pests: 'Thrips, spider mite, mealybug and fungus gnats', reTreatD: 7, water: 'Water when the top inch or two has dried, not when the pot has. Letting one dry right through costs leaves that do not come back.' },
  orchid: { key: 'orchid', lab: 'Orchid', hint: 'Bark or moss, never soil. Classified by the night temperature it wants, not by its light.', exposure: 'part', minC: 13, maxC: 32, rh: 55, dry: 'fast', waterQ: 'low', dli: [8, 16], repotD: 550, feedD: 14, pests: 'Scale, mealybug and spider mite', reTreatD: 10, water: 'Water thoroughly and let it drain and dry fast. Roots need air between waterings as much as they need the water, and standing wet in dense old bark is what kills more orchids than anything else.' },
  epiphyte: { key: 'epiphyte', lab: 'Other epiphyte', hint: 'Tillandsias, bromeliads, epiphytic cacti, hoyas. Roots live in air, not soil.', exposure: 'part', minC: 10, maxC: 35, rh: 55, dry: 'fast', waterQ: 'low', dli: [8, 18], repotD: 730, feedD: 28, pests: 'Scale, mealybug and spider mite', reTreatD: 10, water: 'Water thoroughly and let it drain and dry fast. The roots need air between waterings as much as they need the water.' },
  moist: { key: 'moist', lab: 'Fern or moss', hint: 'Never dries out. Shade, still damp air, and water that does not stop.', exposure: 'shade', minC: 5, maxC: 28, rh: 65, dry: 'never', waterQ: 'any', dli: [3, 8], repotD: 730, feedD: 35, pests: 'Scale, mealybug and spider mite', reTreatD: 10, water: 'Keep it damp. This is the one group where going dry once is usually fatal rather than merely a setback.' },
  carnivore: { key: 'carnivore', lab: 'Carnivorous plant', hint: 'Bog plant. The defining requirement is water with almost nothing dissolved in it.', exposure: 'full', minC: null, maxC: 32, rh: 55, dry: 'never', waterQ: 'pure', dli: [15, 30], repotD: 365, feedD: 0, pests: 'Aphids and scale', reTreatD: 10, water: 'Stand it in rainwater, distilled or RO and never let it dry. Tap water kills these over a season or two by accumulating minerals in the peat, and no amount of correct light or feeding makes up for it. Do not fertilise the soil.' },
  geophyte: { key: 'geophyte', lab: 'Bulb, tuber or caudex', hint: 'Grows hard for part of the year and genuinely stops for the rest.', exposure: 'full', minC: null, maxC: null, rh: null, dry: 'through', waterQ: 'any', dli: [15, 30], repotD: 1095, feedD: 21, pests: 'Mealybug, root mealy and sciarid larvae', reTreatD: 10, water: 'Water freely in growth and stop completely at rest. The dormancy is real and watering through it is what rots the storage organ.' },
  temperate: { key: 'temperate', lab: 'Temperate garden plant', hint: 'Trees, shrubs and perennials from a climate with a real winter.', exposure: 'full', minC: null, maxC: null, rh: null, dry: 'top', waterQ: 'any', dli: [15, 35], repotD: 1095, feedD: 28, pests: 'Aphids, scale and spider mite', reTreatD: 10, water: 'Evenly moist through the growing season, much drier once it drops its leaves or dies back.' }
};

export const WATER_Q_LAB = { any: 'Tap water is fine', low: 'Prefers low-mineral water', pure: 'Rain, distilled or RO only' } as const;
export const WATER_Q_NOTE = {
  any: 'Nothing about this group is fussy about what comes out of the tap.',
  low: 'Hard water leaves deposits on roots and leaf tips. Not fatal, but rainwater is visibly better.',
  pure: 'This is a hard requirement rather than a preference. Tap water accumulates minerals in the substrate and kills these over a season or two.'
} as const;

const byGenus = new Map<string, ArchKey>();
for (const [k, list] of Object.entries(tables.genus as Record<string, string[]>)) for (const g of list) byGenus.set(g.split(' ')[0].toLowerCase(), k as ArchKey);
const byFamily = new Map<string, ArchKey>();
for (const [k, list] of Object.entries(tables.family as Record<string, string[]>)) for (const f of list) byFamily.set(f.toLowerCase(), k as ArchKey);
const bySpecies = new Map<string, ArchKey>(Object.entries(tables.species as Record<string, string>).map(([s, k]) => [s, k as ArchKey]));

export interface ArchGuess {
  arch: Archetype;
  tier: 'species' | 'genus' | 'family';
  of: string;
  /** How the inference reads in a sentence, at the strength it has. */
  why: string;
}

export function archFor(scientific: string, family?: string | null): ArchGuess | null {
  const name = scientific.trim().toLowerCase();
  const genus = name.split(/\s+/)[0];
  const sp = bySpecies.get(name.split(/\s+/).slice(0, 2).join(' '));
  if (sp) return { arch: ARCH[sp], tier: 'species', of: scientific, why: `${scientific} specifically, which is the exception in its genus` };
  const g = byGenus.get(genus);
  if (g) return { arch: ARCH[g], tier: 'genus', of: genus, why: `the genus ${genus[0].toUpperCase() + genus.slice(1)}, which is reliably one kind of plant` };
  const f = family ? byFamily.get(family.toLowerCase()) : undefined;
  if (f) return { arch: ARCH[f], tier: 'family', of: family!, why: `${family}, which is usually but not always one kind of plant` };
  return null;
}

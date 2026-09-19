/**
 * Care archetypes: what KIND of plant something is, horticulturally, resolved
 * species → genus → family, and whichever answers says so, because "the genus
 * is reliably one kind of plant" and "the family usually is" are different
 * strengths of claim.
 *
 * The table supplies one figure the sheet uses: a conventional group minimum
 * temperature for groups with no dormancy to meet the cold in. It supplies no
 * prose. What a group "wants" is practice, and the sheet does not say it.
 * The genus and family lists are data (arch-tables.json) so they can grow
 * without touching code.
 */
import tables from './arch-tables.json';

export type ArchKey = 'arid' | 'tropical' | 'orchid' | 'epiphyte' | 'moist' | 'carnivore' | 'geophyte' | 'temperate';

export interface Archetype {
  key: ArchKey;
  lab: string;
  /** Conventional cold minimum for the group, °C; null when the group spans too much for one figure. */
  minC: number | null;
}

export const ARCH: Record<ArchKey, Archetype> = {
  arid: { key: 'arid', lab: 'Cactus or succulent', minC: null },
  tropical: { key: 'tropical', lab: 'Tropical foliage plant', minC: 12 },
  orchid: { key: 'orchid', lab: 'Orchid', minC: 13 },
  epiphyte: { key: 'epiphyte', lab: 'Other epiphyte', minC: 10 },
  moist: { key: 'moist', lab: 'Fern or moss', minC: 5 },
  carnivore: { key: 'carnivore', lab: 'Carnivorous plant', minC: null },
  geophyte: { key: 'geophyte', lab: 'Bulb, tuber or caudex', minC: null },
  temperate: { key: 'temperate', lab: 'Temperate garden plant', minC: null }
};

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

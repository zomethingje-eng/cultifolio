/**
 * The front page's lead (round eighty-seven; plan D1, the owner's look of 7 November): one real figure from the reference
 * and its trail, the coldest night on record where the day's species grows wild, with where every part of it came from.
 *
 * The species: the first of the day's strip whose page holds the figure. The strip is the site's own rule (round
 * seventy-six; `featuredOfCorpus`): species with a derived habitat climate and an open photograph, one from each of the
 * largest genera, rotated by the day, so the lead is a different species each day and chosen by no one. A page in the
 * strip whose daily extremes were set aside (read at sea, or beyond the lapse rule's reach) or never read has no
 * coldest night to show, and the next is taken; after three, none is shown, and the front page leads with its counts.
 *
 * Every part is read from the species' record, as its page reads it, never written here: the night is NASA POWER's lowest
 * daily minimum over its years at the typical record's cell, after the elevation correction the page states; the records
 * and the cells are the ones the habitat climate rests on (in range, placed to within 10 km); the regions are Kew's; the
 * records' source is the record of sources' own row, its day the file's ("as of") or the day it was asked.
 *
 * The photograph is credited with its author, its licence and the day its credit was read (rule 4), as the not-found
 * page's plant is (/about/data/today): a record whose lead photograph has no day read, on the photograph or in its
 * source's row, is passed over for the next species by the same rule, never shown without it (round eighty-seven, the
 * review of stage 1, M2).
 */
import type { Dossier } from '$dossier/schema';
import { heroOf } from '$dossier/dedupe';
import { showable } from '$lib/ui/ref/photos';
import { photoAt } from '$dossier/photo-size';
import { creditParts } from '$lib/ui/ref/head';
import { rowOf } from '$lib/ui/ref/credit-days';
import { unitName } from '$core/regions';

export interface Lead {
  slug: string;
  name: string;
  /** The lowest daily minimum, °C, and over how many years (NASA POWER, at the typical record's cell). */
  coldC: number;
  years: number;
  /** Metres of elevation the cell's figures were corrected by (0: none). */
  lapseM: number;
  /** The records the habitat climate rests on, and the grid cells they fall in. */
  records: number;
  cells: number;
  /** Kew's native regions, in the reference's names. */
  regions: string[];
  /** The typical cell's place, where the build named it ("Atacama, Chile"). */
  place: string | null;
  /** Where the records came from: GBIF's download (with its address and the file's day) or the search API and the day asked. */
  from: { download: boolean; href: string | null; day: string | null };
  /** The extremes' source as the record states it. */
  power: string | null;
  /** Always with the day its credit was read (M2); null is kept in the type for a lead of an older shape. */
  photo: { src: string; alt: string; lic: string; who: string; via: string; read: string; href: string } | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}/;
const VIA: Record<string, string> = { inat: 'iNaturalist', commons: 'Wikimedia Commons', gbif: 'GBIF' };

/** The lead's figure and trail from a species' record; null when the record holds no coldest night, or no open photograph with the day its credit was read. */
export function leadOf(d: Pick<Dossier, 'slug' | 'name' | 'climate' | 'distribution' | 'photos' | 'upstream'>): Lead | null {
  const c = d.climate;
  if (c.status !== 'ok' || !c.extremes || (c.extremesStatus && c.extremesStatus !== 'ok')) return null;
  const hero = heroOf(d.photos.filter(showable));
  if (!hero) return null;
  const up = d.upstream['gbif.occurrences'];
  if (!up || up.status !== 'ok') return null;
  const detail = up.detail ?? '';
  const doi = /https:\/\/doi\.org\/\S+/.exec(detail)?.[0]?.replace(/[).,;]+$/, '') ?? null;
  const download = /download/i.test(detail) || !!up.asOf;
  const day = DAY.exec(up.asOf ?? '')?.[0] ?? DAY.exec(up.at ?? '')?.[0] ?? null;
  const cp = creditParts(hero);
  const row = rowOf(hero);
  const rowUp = row ? d.upstream[row] : undefined;
  const read = DAY.exec(hero.read ?? '')?.[0] ?? (rowUp && rowUp.status === 'ok' ? DAY.exec(rowUp.asOf ?? rowUp.at ?? '')?.[0] ?? null : null);
  if (!read) return null; // a credit without its day is not shown (M2): the next species is taken
  return {
    slug: d.slug,
    name: d.name.scientific,
    coldC: c.extremes.minAbs,
    years: c.extremes.years,
    lapseM: c.extremes.lapseAppliedM,
    records: c.records,
    cells: c.cells,
    regions: d.distribution.native.map((r) => unitName(r.name)),
    place: c.place ?? null,
    from: { download, href: doi, day },
    power: c.src.extremes ?? null,
    photo: { src: photoAt(hero.thumb, 'medium'), alt: `${d.name.scientific}${hero.place ? `, ${hero.place}` : ''}`, lic: cp.lic, who: cp.whoAlone, via: VIA[hero.src] ?? hero.src, read, href: hero.page ?? hero.url }
  };
}

/** The lead from the day's strip: the first of its first three species whose record holds the figure; null otherwise. */
export async function leadFrom(featured: ReadonlyArray<{ slug: string }>, read: (slug: string) => Promise<Parameters<typeof leadOf>[0] | null>): Promise<Lead | null> {
  for (const f of featured.slice(0, 3)) {
    const d = await read(f.slug).catch(() => null);
    const l = d ? leadOf(d) : null;
    if (l) return l;
  }
  return null;
}

/** A day as the lead writes it: "21 October 2026". */
export const dayWords = (iso: string | null): string | null => {
  // The record's own day: a file's "as of" day, or the day the build asked, as the record of sources writes it.
  const day = DAY.exec(iso ?? '')?.[0];
  if (!day) return null;
  const t = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/**
 * The species of the day, read on the server for the not-found page and /about/data (round eighty-seven; plan D6, D7):
 * the first species the front page's strip shows today (`pickOf`), with its lead photograph as its species page leads
 * with it (`heroOf`), the photograph's credit as the gallery says it (`photoCredit`), the day the credit was read
 * (`creditDays`), and the GBIF downloads its record of sources cites (`downloadsOf`). One dossier read.
 *
 * Null where there is nothing true to show: no pool, the species not found, or its record not read. A photograph is
 * shown only with its author and licence and the day its credit was read: one without a day is not shown (rule 4).
 */
import { corpusNow, getDossier, resolveSlug, type Loaded } from '$lib/server/dossiers';
import { featuredOfCorpus } from '$lib/server/catalogue';
import { heroOf } from '$dossier/dedupe';
import { photoOf } from '$dossier/photo-size';
import { photoCredit } from '$lib/ui/ref/head';
import { creditDays, type CreditUp } from '$lib/ui/ref/credit-days';
import { pickOf, dayNumber, dayOf, downloadsOf, type Download } from './reference';

type Platform = App.Platform | undefined;
type Fetch = typeof fetch;

export interface Today {
  slug: string;
  name: string;
  common: string | null;
  /** The UTC day the pick is for. */
  day: string;
  photo: {
    /** The photograph at 500 pixels or the nearest the host gives. */
    src: string;
    /** Its page at its source, where the credit can be checked. */
    page: string;
    /** Author and licence, as the species page's gallery says them. */
    credit: string;
    /** "Credits as read from iNaturalist on 2026-10-27". */
    read: string;
    captive: boolean | null;
  } | null;
  /** The GBIF downloads the page's record of its records cites. */
  downloads: Download[];
}

export async function today(platform: Platform, fetch: Fetch, held?: Loaded, now = Date.now()): Promise<Today | null> {
  const c = held ?? (await corpusNow(platform, fetch));
  const pool = await featuredOfCorpus(c, platform, fetch);
  const day = dayNumber(now);
  const pick = pickOf(pool, day);
  if (!pick) return null;
  const key = await resolveSlug(platform, fetch, pick.slug, c).catch(() => null);
  const d = key ? await getDossier(platform, fetch, key, c).catch(() => null) : null;
  if (!d) return null;
  const up = d.upstream as unknown as CreditUp & Record<string, { detail?: string } | undefined>;
  const hero = heroOf(d.photos.filter((p) => p.src !== 'user'));
  const read = hero ? creditDays([hero], up) : '';
  // A credit whose day is not recorded is not shown as read on a day (round eighty-six's rule): the photograph is shown
  // only with a day.
  const dated = !!read && !read.includes('not recorded');
  return {
    slug: pick.slug,
    name: d.name.scientific,
    common: pick.common ?? null,
    day: dayOf(day),
    photo: hero && dated ? { src: photoOf(hero, 'medium'), page: hero.page ?? hero.url, credit: photoCredit(hero), read, captive: hero.captive ?? null } : null,
    downloads: downloadsOf(up['gbif.occurrences']?.detail)
  };
}

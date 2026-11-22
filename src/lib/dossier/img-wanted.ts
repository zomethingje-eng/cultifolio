/**
 * Every photograph address a page or an index row can ask for, so the copy step (round 109, scripts/img-copy.ts) copies
 * each before the pages ask img.cultifolio.com for it (round 111). Built from the very functions the pages call, at the
 * sizes each place asks:
 *
 * - the species page (src/routes/species/[slug]/+page.svelte, src/lib/ui/Photos.svelte): every photograph shown
 *   (`showable`) at its kept thumbnail (the gallery) and `photoAt(thumb, 'small')` (the strip); the lead (`heroOf`) at
 *   `photoOf(lead, 'medium' | 'large')` and each address of `srcsetOf(shownAt(lead), ['medium', 'large'])`; compare's
 *   lead at its thumbnail;
 * - an index row (the front page, browse, genus, family and region pages, the plant pages, the lead figure): its thumb as
 *   kept, and `photoAt(thumb, 'square' | 'small' | 'medium')`.
 *
 * A new place that shows a photograph at another size adds it here: r109a counts the calls in src/ and fails on one more.
 * `dossier` is the page as the site reads it (`parseDossier`, with the index's held names), not the file on disk.
 */
import type { Dossier } from '$dossier/schema';
import { photoAt, photoOf, shownAt, srcsetOf, type PhotoSize } from '$dossier/photo-size';
import { heroOf } from '$dossier/dedupe';
import { showable } from '$lib/ui/ref/photos';

const ROW_SIZES: PhotoSize[] = ['square', 'small', 'medium'];

/** The addresses of a srcset, without their widths. */
const srcsetUrls = (s: string | undefined): string[] => (s ? s.split(', ').map((x) => x.replace(/ \d+w$/, '')) : []);

/** Every address the page of this dossier can ask for, each once. */
export function pageWanted(d: Pick<Dossier, 'photos'>): string[] {
  const photos = d.photos.filter(showable);
  const out = new Set<string>();
  for (const p of photos) {
    if (!p.thumb) continue;
    out.add(p.thumb);
    out.add(photoAt(p.thumb, 'small'));
  }
  const hero = heroOf(photos);
  if (hero) {
    out.add(photoOf(hero, 'medium'));
    out.add(photoOf(hero, 'large'));
    for (const u of srcsetUrls(srcsetOf(shownAt(hero), ['medium', 'large']))) out.add(u);
    out.add(hero.thumb ?? hero.url);
  }
  return [...out];
}

/** Every address an index row's thumbnail is asked at. */
export function rowWanted(e: { thumb?: string | null }): string[] {
  if (!e.thumb) return [];
  return [...new Set([e.thumb, ...ROW_SIZES.map((s) => photoAt(e.thumb!, s))])];
}

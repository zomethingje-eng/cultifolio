/**
 * Wikimedia Commons: photographs from a species' category, with each file's own licence (round sixteen; round
 * sixty-eight, fourth part). Split out of `wikimedia.ts` before round sixty-nine so the photograph rules have one owner.
 */
import type { JsonFetcher, FetchResult } from '../fetch';
import type { Photo } from '../schema';
import { mendCommonsThumb } from '../md5';
import { commonsKind, commonsFirstByEpithet, slipsToAsk, askSlip, sourceKind, sisterEpithetTitle, describesSpecies, type KindNames } from '../photo-kind';
import { commonsLicence, commonsAuthor, commonsCredit } from '../photo-credit';
import { mwGet, mwError } from './wikimedia';

/* ---------- Wikimedia Commons: per-file licence via extmetadata ---------- */

interface ImageInfo {
  url: string;
  thumburl?: string;
  width?: number;
  height?: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value: string }>;
}

/**
 * A Commons address as the page loads it (round sixty-eight, fourth part). Commons now answers `imageinfo` with a
 * tracking query on every address (`?utm_source=commons.wikimedia.org&…`) and its thumbnails on `thumb.wikimedia.org`,
 * at a standard width (960, not the 800 asked). The builder tested the file's extension at the end of the address, so
 * every file failed it, and not one Commons photograph reached the corpus. The query is dropped, and a thumbnail is
 * given at `upload.wikimedia.org`, which serves the same path and is the host the site's policy and the about page name.
 */
export function commonsUrl(u: string): string {
  const x = new URL(u);
  x.search = '';
  x.hash = '';
  if (x.host === 'thumb.wikimedia.org') x.host = 'upload.wikimedia.org';
  return x.toString();
}
/** The widths Commons makes thumbnails at that the page uses: 960 for the photograph shown, 500 for a tile (as iNaturalist's large and medium). Commons refuses a width off its list (800 answers 400). */
export const COMMONS_SHOWN = 960;
export const COMMONS_TILE = 500;

/** How many files one request reads from a category: filtering leaves up to twelve of fifty (24 until round sixty-nine; triage-68 K1). */
export const COMMONS_READ = 50;

/**
 * Up to `max` photographs of the species from its Commons category. `names` are the species' own and older names, read
 * by `commonsKind`; without them the category's name stands for the species. A file is taken only as JPEG or WebP, under
 * a licence Commons names strictly (`commonsLicence`), with the author its `Artist` field names (never `Credit`, which is
 * the file's source and says "Own work"; S-B3), and when neither its title nor its categories mark it as a map, a
 * herbarium sheet, a plate, a stamp, seeds, an unidentified plant, a hybrid or another species, nor its description
 * strikes out a name. Titles holding the species' epithet are taken first (round sixty-nine; triage-68 K1, K2, K3).
 * `names.held`, the reference's names, lets an uploader's slip be the species' (round seventy; REVIEW-TRIAGE-69 C1).
 */
export async function commonsPhotos(f: JsonFetcher, category: string, max = 12, names?: KindNames): Promise<FetchResult<Photo[]>> {
  return (await readCategory(f, category, max, names)).r;
}

/** The item's Commons sitelink, alone (round ninety-six): asked only when its P373 category holds no files. */
export const commonsSitelinkUrl = (q: string) => `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${q}&props=sitelinks&sitefilter=commonswiki`;
/** A category's name as Commons compares names: underscores as spaces, the first letter capital. */
const catName = (s: string) => { const t = s.replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/**
 * The species' Commons photographs by its Wikidata item (round ninety-six). The category read is the item's Commons
 * category (P373), else `fallback` (the name), as before. Where P373's category holds no files at all (Commons answers
 * no member of type file) and the item's Commons sitelink (commonswiki) is a category of another name, that category is
 * read instead: Heberdenia bahamensis's item Q15304926 names "Heberdenia excelsa" in P373, a category with no files, and
 * links "Category:Heberdenia bahamensis", with 11 (read 2026-11-19); round 95's walk lost the 11. Rule 3: the sitelink is
 * the item's own statement of its Commons category, taken only by this rule, and `detail` says which category was read
 * and why. A sitelink that is a gallery (no "Category:") is not read. A P373 category whose files the photograph rules
 * all leave out is not empty, and the sitelink is not asked. Rule 2: a sitelink Wikidata did not answer is said as that
 * failure, never as no photographs.
 */
export async function itemCommonsPhotos(f: JsonFetcher, item: { wikidata?: string; commonsCategory?: string } | undefined, fallback: string, max = 12, names?: KindNames): Promise<{ r: FetchResult<Photo[]>; detail?: string }> {
  const p373 = item?.commonsCategory;
  const first = await readCategory(f, p373 || fallback, max, names);
  if (!p373 || !item?.wikidata || first.r.status !== 'none' || first.files > 0) return { r: first.r };
  const empty = `the item's (${item.wikidata}) Commons category (P373) "${p373}" holds no files`;
  const s = await mwGet<{ entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }> }>(f, commonsSitelinkUrl(item.wikidata));
  const err = s.status === 'ok' ? mwError(s.data) : null;
  if (s.status !== 'ok' || err) {
    const why = (err ? `wikidata ${err}` : s.status === 'none' ? 'no answer' : s.detail) || 'not asked';
    return { r: s.status === 'refused' || s.status === 'skipped' ? { status: s.status, detail: why } : { status: 'error', detail: why }, detail: `${empty}; its Commons sitelink not read: ${why}` };
  }
  const title = s.data.entities?.[item.wikidata]?.sitelinks?.commonswiki?.title;
  if (!title) return { r: first.r, detail: `${empty}, and it has no Commons sitelink` };
  if (!/^Category:/.test(title)) return { r: first.r, detail: `${empty}; its Commons sitelink "${title}" is a gallery, not a category, and is not read` };
  const linked = title.replace(/^Category:/, '');
  if (catName(linked) === catName(p373)) return { r: first.r, detail: `${empty}; its Commons sitelink names the same category` };
  const second = await readCategory(f, linked, max, names);
  return { r: second.r, detail: `read Commons category "${linked}", the item's (${item.wikidata}) Commons sitelink, since its P373 category "${p373}" holds no files` };
}

/** `itemCommonsPhotos`' answer as the page's record of Commons: its status, and its detail with the category read and why. */
export const withCategoryRead = (c: { r: FetchResult<Photo[]>; detail?: string }) => ({ status: c.r.status, detail: [('detail' in c.r ? c.r.detail : undefined), c.detail].filter(Boolean).join('; ') || undefined });

/** One category's photographs, and how many files Commons answered in it before any rule (round ninety-six: an empty category is known). */
async function readCategory(f: JsonFetcher, category: string, max: number, names?: KindNames): Promise<{ r: FetchResult<Photo[]>; files: number }> {
  const r = await mwGet<{ query?: { pages?: Record<string, { title: string; imageinfo?: ImageInfo[] }> } }>(f, 
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + category)}&gcmtype=file&gcmlimit=${COMMONS_READ}` +
      `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=${COMMONS_SHOWN}&iiextmetadatafilter=LicenseShortName|Artist|LicenseUrl|Categories|ImageDescription|Credit&maxlag=5`
  );
  if (r.status !== 'ok') return { r, files: -1 };
  const err = mwError(r.data);
  if (err) return { r: { status: 'error', detail: `commons ${err}` }, files: -1 };
  const who = names ?? { scientific: category };
  const pages = Object.values(r.data.query?.pages ?? {});
  const out: Photo[] = [];
  const asked = new Map<string, boolean>();
  for (const p of pages) {
    // A title that is the species' only as an uploader's slip is asked of Kew and GBIF (self-review 70, S-C9), each
    // name once a build; one they accept as a species, or a source that does not answer, leaves the file out.
    const slips: string[] = [];
    if (who.held && p.imageinfo?.[0]) {
      for (const name of slipsToAsk(p.title, who)) {
        if (!asked.has(name)) {
          const a = await askSlip(f, name, { scientific: who.scientific, authorship: who.authorship, key: who.gbif, synonyms: who.synonyms });
          asked.set(name, a.status === 'ok' && a.data.own);
        }
        if (asked.get(name)) slips.push(name);
      }
    }
    const photo = commonsPhoto(p.title, p.imageinfo?.[0], who, slips);
    if (photo) out.push(photo);
  }
  const ordered = commonsFirstByEpithet(out, who).slice(0, max);
  return { r: ordered.length ? { status: 'ok', data: ordered } : { status: 'none' }, files: pages.length };
}

/** One file of Commons' answer as a dossier photograph, or null when the rules above leave it out. */
function commonsPhoto(title: string, ii: ImageInfo | undefined, names: KindNames, slips: string[] = []): Photo | null {
  if (!ii) return null;
  const original = commonsUrl(ii.url);
  if (!/\.(jpe?g|webp)$/i.test(new URL(original).pathname)) return null;
  const meta = ii.extmetadata ?? {};
  const categories = commonsCategories(meta.Categories?.value);
  const lic = (meta.LicenseShortName?.value ?? '').trim();
  // A title naming only a sister species' epithet is the species' when its description names the species (round seventy-three).
  const described = sisterEpithetTitle(title, names) ? describesSpecies(meta.ImageDescription?.value, names) : undefined;
  if (commonsKind(title, names, { categories, struck: strikesOut(meta.ImageDescription?.value), credit: meta.Artist?.value, licence: lic, slips, kind: sourceKind(meta.Credit?.value, meta.ImageDescription?.value), described })) return null;
  const tag = commonsLicence(lic);
  if (!tag) return null;
  const artist = commonsAuthor(meta.Artist?.value);
  if (!artist && tag !== 'cc0' && tag !== 'pd') return null; // CC BY and CC BY-SA require the author's name; a file without one is not published (round sixteen, 3)
  // The 960-pixel thumbnail is the photograph shown, never the original (often several megabytes); a file narrower than
  // that has no thumbnail and is shown as it is. The tile is Commons' 500-pixel one, from the same path.
  const shown = ii.thumburl ? commonsUrl(ii.thumburl) : original;
  const isThumb = /\/thumb\/.+\/\d+px-[^/]+$/.test(new URL(shown).pathname);
  const tile = isThumb && (ii.width ?? 0) > COMMONS_TILE ? shown.replace(/\/\d+px-([^/]+)$/, `/${COMMONS_TILE}px-$1`) : mendCommonsThumb(shown, ii.width);
  // The categories are kept with the photograph, so a rule read later applies to it as to a new answer (round seventy; REVIEW-TRIAGE-69 C2).
  const inat = inatSource(meta.Credit?.value, meta.ImageDescription?.value);
  return { src: 'commons', id: title, url: shown, thumb: tile, width: ii.width ?? undefined, height: ii.height ?? undefined, licence: tag, attribution: commonsCredit(artist, lic), page: ii.descriptionurl ?? undefined, categories, ...(slips.length ? { slips } : {}), ...(inat ? { inat } : {}), ...(described ? { described } : {}), sourceRead: true };
}

/** Commons' `Categories` (extmetadata), "A|B|C", as a list. */
export const commonsCategories = (value: string | null | undefined): string[] => (value ?? '').split('|').map((c) => c.trim()).filter(Boolean);

/** Whether a Commons description strikes out a name: `<s>`, `<del>`, `<strike>` or a line-through ("Centaurea sp. ~~C. nuttallii~~"; S-C3). */
export const strikesOut = (html: string | null | undefined): boolean => /<(?:s|del|strike)\b|line-through/i.test(html ?? '');

/**
 * The iNaturalist photograph a Commons file is a copy of, from its source (`Credit`) or description: an address of the
 * photograph on iNaturalist or its image host (self-review 70, S-C5: "Echinocereus adustus schwarzii 1.jpg" is iNaturalist's
 * 34674713, and its name carries no number). Null when the source names none, or names more than one.
 */
export function inatSource(...fields: Array<string | null | undefined>): string | null {
  const ids = new Set<string>();
  for (const f of fields) for (const m of (f ?? '').matchAll(/(?:inaturalist\.org\/photos\/|(?:inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\/photos\/)(\d+)/gi)) ids.add(m[1]);
  return ids.size === 1 ? [...ids][0] : null;
}

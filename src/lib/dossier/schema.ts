/**
 * The species dossier: everything a species page needs, built once, served as
 * one immutable JSON. The version lives in the path (s/v3/<id>.json) and in
 * the document, and a shape change is a version bump — the schema is what
 * makes forgetting impossible: a dossier that does not parse is not served.
 */
import { mendGbifThumb, mendCommonsThumb } from './md5';
import { MAX_LAPSE_M, lapseSetAside } from '$core/lapse';
import { dedupePhotos } from './dedupe';
import { shownPhotos, kindNamesOf, type HeldNames } from './photo-kind';
import * as v from 'valibot';
import { isPageId, type PageId } from '$core/page-id';

/**
 * v2 (September 2026): the habitat climate is an envelope across every in-range record's cell, not one point.
 * v3 (round seventy-eight): a page's `key` is its id (`$core/page-id`: `k<Kew plant_name_id>`, else `g<GBIF key>`), not
 * GBIF's backbone key, which stays in `ids.gbif`; the other pages a photograph is shared with are named by id.
 */
export const DOSSIER_V = 3 as const;

/** A page's id in a stored document: the one pattern of `$core/page-id`. */
export const PageIdSchema = v.custom<PageId>(isPageId, 'a page id (k<plant_name_id> or g<GBIF key>)');

/** `ambiguous`: two records answered where one is required, so none was taken (round sixty-nine; triage-68 M8). */
export const UpstreamStatus = v.picklist(['ok', 'none', 'refused', 'error', 'skipped', 'ambiguous']);
export type UpstreamStatus = v.InferOutput<typeof UpstreamStatus>;

/** Every upstream answers one of: it gave data (ok), it said there is none
 *  (none), it would not answer (refused: 429/403/timeout), it broke (error).
 *  "none" is the only one a page may render as an absence. */
export const Upstream = v.object({
  status: UpstreamStatus,
  at: v.string(),
  detail: v.optional(v.string()),
  /** The day of the source's data when it was read from a file (Kew's files, a GBIF download), not asked on `at` (round seventy-two, B1). */
  asOf: v.optional(v.string())
});

export const BoxSchema = v.object({ s: v.number(), w: v.number(), n: v.number(), e: v.number() });

/**
 * `preferred` (GBIF marks the name preferred) and `sources` (how many sources give it, when more than one) are kept since
 * round sixty-one, decision 7; `alsoFrom` (the other named sources of that exact spelling) since round sixty-two, when
 * each spelling became its own row (`gbif.vernacular`), so the rule counts distinct sources. All absent in a dossier
 * whose names were fetched before, and read as not preferred, one source each.
 */
export const Vernacular = v.object({ name: v.string(), lang: v.optional(v.string()), source: v.optional(v.string()), preferred: v.optional(v.boolean()), sources: v.optional(v.number()), alsoFrom: v.optional(v.array(v.string())) });

export const NameBlock = v.object({
  scientific: v.string(),
  authorship: v.optional(v.string()),
  rank: v.optional(v.string()),
  status: v.picklist(['accepted', 'synonym', 'doubtful', 'unknown']),
  acceptedKey: v.optional(v.number()),
  acceptedName: v.optional(v.string()),
  family: v.optional(v.string()),
  genus: v.optional(v.string()),
  order: v.optional(v.string()),
  classification: v.optional(v.array(v.object({ rank: v.string(), name: v.string(), key: v.optional(v.number()) }))),
  synonyms: v.array(v.string()),
  vernacular: v.array(Vernacular),
  /**
   * Kew's names for the page's plant, read offline from Kew's file by `--fill kew-names` (round seventy-two, A): the entry
   * Kew accepts (plant_name_id, or '' where Kew's rows do not decide), Kew's other names for it (words only), the stored
   * older names Kew accepts as species of their own, and the day of Kew's file. Absent: not read, never "none".
   */
  kew: v.optional(v.object({ entry: v.string(), synonyms: v.array(v.string()), acceptedElsewhere: v.array(v.string()), file: v.string(), heldBy: v.optional(v.string()) })),
  /** Present when the page cites Kew's author for the number it links: the backbone's citation, and Kew's row cited (plant_name_id). */
  cited: v.optional(v.object({ gbif: v.string(), kew: v.string() }))
});

export const Ids = v.object({
  gbif: v.optional(v.number()),
  powo: v.optional(v.string()),
  ipni: v.optional(v.string()),
  inat: v.optional(v.number()),
  wikidata: v.optional(v.string()),
  wfo: v.optional(v.string()),
  wikipedia: v.optional(v.string())
});

export const Summary = v.object({
  text: v.string(),
  source: v.literal('wikipedia'),
  url: v.string(),
  licence: v.literal('CC BY-SA 4.0'),
  title: v.string(),
  /** The article's lead went on past the text kept (`upToSentence`, round eighty-two): the page links "More on Wikipedia". */
  cut: v.optional(v.literal(true))
});

/** A genus's own page: its Wikipedia lead, quoted like a species' summary, written by `--fill genus` to s/v<N>/g/<slug>.json. */
export const GenusRecord = v.object({
  genus: v.string(),
  slug: v.string(),
  summary: v.optional(Summary),
  /** What Wikipedia answered: ok, none (no article, or a disambiguation), or a refusal with its reason. */
  status: v.picklist(['ok', 'none', 'refused']),
  detail: v.optional(v.string()),
  at: v.string()
});
export type GenusRecord = v.InferOutput<typeof GenusRecord>;
export const genusPath = (slug: string) => `s/v${DOSSIER_V}/g/${slug}.json`;

export const Region = v.object({ code: v.optional(v.string()), name: v.string(), box: v.optional(BoxSchema) });

export const Distribution = v.object({
  native: v.array(Region),
  introduced: v.array(Region),
  /** Regions a national checklist lists without saying native or introduced: reported, not verified. Never used for the range test. */
  reported: v.optional(v.array(Region)),
  /** Regions where WCVP records the plant as extinct: history, not habitat; never a range box. */
  extinct: v.optional(v.array(Region)),
  /** Regions where WCVP records the plant as doubtfully present: listed apart, never a range box (round seventy-two, B5). */
  doubtful: v.optional(v.array(Region)),
  /** Kew's own one-line descriptions from WCVP: the life form and the climate class. Quoted, not derived. */
  kew: v.optional(v.object({ lifeform: v.optional(v.string()), climate: v.optional(v.string()) })),
  /** WCVP lists the name more than once and authorship did not decide: why no range is attached. */
  ambiguous: v.optional(v.string()),
  source: v.string(),
  boxes: v.array(BoxSchema),
  /** True only when the native regions come from WCVP with native status stated. Habitat climate is derived only then. */
  verified: v.optional(v.boolean()),
  /** Where the range comes from (round seventy-two, B3; `range-via.ts`): read by the page instead of the source's sentence. */
  via: v.optional(v.object({ kind: v.picklist(['own', 'older-name', 'synonym-of', 'kew-entry', 'spelling']), entry: v.string(), page: v.optional(v.string()), name: v.optional(v.string()), row: v.optional(v.string()), status: v.optional(v.string()), unplaced: v.optional(v.boolean()), file: v.optional(v.string()) }))
});

const Lat = v.pipe(v.number(), v.minValue(-90), v.maxValue(90));
const Lon = v.pipe(v.number(), v.minValue(-180), v.maxValue(180));
/** [lat, lon, year|null, country|null, basisOfRecord|null, licence tag]. Open records only, and the schema holds it to that. */
export const OccPoint = v.tuple([Lat, Lon, v.nullable(v.number()), v.nullable(v.string()), v.nullable(v.string()), v.picklist(['cc0', 'pd', 'by', 'by-sa'])]);

export const Occurrences = v.object({
  open: v.array(OccPoint),
  nOpenInRange: v.number(),
  nRestrictedInRange: v.number(),
  nOutsideRange: v.number(),
  /** In-range records too vaguely placed (over 10 km) to read climate at; they stay on the map. */
  nVague: v.optional(v.number()),
  /** False when there was no range to test against (the range source refused, or a country-level range): every record then counted as "in range" untested (round sixteen, 6). */
  rangeTested: v.optional(v.boolean()),
  /** How far the centre would have moved had restricted records been used. */
  restrictedShiftKm: v.nullable(v.number()),
  thin: v.boolean(),
  datasets: v.array(v.object({ key: v.string(), title: v.optional(v.string()), licence: v.string(), n: v.number() })),
  /**
   * The other GBIF keys the records come from, beside the page's own (round seventy-three; `extra-keys.ts`): each key, GBIF's
   * name for it, how Kew's file holds it as this plant, the records it added, whether they came from the download or the
   * search API, and, for a page merged into this one, its old address. Absent: the page's own key alone.
   */
  keys: v.optional(v.array(v.object({ key: v.number(), name: v.string(), kew: v.string(), n: v.number(), from: v.picklist(['download', 'api']), slug: v.optional(v.string()) }))),
  /**
   * A page without a GBIF key that read no key (round eighty): why, for that page (`noKeyWhy` in `$core/no-gbif`, from what
   * GBIF's backbone holds of the names Kew's file gives it), and, where GBIF files those names under other pages of the
   * reference, each such page by its GBIF key, its name and its id here. Absent on every other page.
   */
  unread: v.optional(v.object({ kind: v.picklist(['lumped', 'other-type', 'pro-parte', 'other-author', 'none', 'other']), why: v.string(), under: v.optional(v.array(v.object({ key: v.number(), name: v.string(), page: v.optional(v.string()) }))) }))
});

/** The map marker: where the records are densest. It is not where the climate is read (that is the envelope). */
export const Centroid = v.object({
  lat: Lat,
  lon: Lon,
  n: v.number(),
  share: v.number(),
  elevationM: v.optional(v.number()),
  how: v.string()
});

export const MonthRow = v.object({
  tmax: v.number(),
  tmin: v.number(),
  tmean: v.number(),
  precipMm: v.number(),
  dli: v.optional(v.number()),
  rh: v.optional(v.number()),
  vpdKpa: v.optional(v.number()),
  windMs: v.optional(v.number())
});

const Year = v.pipe(v.array(MonthRow), v.length(12));

/**
 * The habitat climate is an envelope: CHELSA read at every distinct grid cell
 * holding an in-range record (one read per cell, so a much-visited site counts
 * once), and for each month and variable the median and the 10th and 90th
 * percentiles across those cells. `months` is the median year, the one the
 * sheet reads; `p10`/`p90` are the range the species is recorded in. Extremes
 * and elevation are read at one cell, the typical one, and `at` says which.
 */
const Extremes = v.object({
  years: v.number(),
  minAbs: v.number(),
  minP01: v.number(),
  maxP99: v.number(),
  frostDaysPerYear: v.number(),
  frostNights: v.optional(v.number()),
  lapseAppliedM: v.number()
});

export const Climate = v.variant('status', [
  v.object({
    status: v.literal('ok'),
    /** Distinct grid cells the envelope rests on. */
    cells: v.number(),
    /** In-range records that were read (those with a usable coordinate). */
    records: v.number(),
    /** The typical cell: the one whose coldest-month night is nearest the median. Extremes and elevation are read here. */
    cell: v.string(),
    at: v.object({ lat: Lat, lon: Lon }),
    months: Year,
    p10: Year,
    p90: Year,
    /**
     * 10th and 90th percentile of the per-cell annual rain totals: each interpolated between the two nearest cells' own
     * totals, unlike a sum of monthly percentiles, which adds months from different cells' years. `p50` is their median, the year's rain the pages show; a dossier built before round sixty-three
     * has none, and its pages show the twelve monthly medians added, labelled as that (round sixty-three; REVIEW-TRIAGE-61).
     */
    annualRain: v.optional(v.object({ p10: v.number(), p90: v.number(), p50: v.optional(v.number()) })),
    extremes: v.optional(Extremes),
    /**
     * The daily extremes read at a POWER cell that is mostly sea (`landFraction` under a half): set aside here by the
     * parser, not shown as a cold floor, since a figure the page itself says is the sea's is nearer a refusal than a
     * measurement (round thirty-five, R1-11). The notice under the cold floor still says what was read there.
     */
    extremesSea: v.optional(Extremes),
    /**
     * The daily extremes read at a POWER cell whose ground is too far above or below the typical cell to correct
     * (`lapseSetAside`; round eighty, A): set aside here by the parser and kept, as the sea's are.
     */
    extremesLapse: v.optional(Extremes),
    /** Whether the daily extremes were read: 'refused' is NASA POWER not answering, which is not the same as no series (round sixteen, 7); 'sea' is read at a cell that is mostly sea and set aside; 'lapse' is read at a cell whose correction is beyond `MAX_LAPSE_M`, or impossible, and set aside (round eighty). */
    extremesStatus: v.optional(v.picklist(['ok', 'none', 'refused', 'skipped', 'sea', 'lapse'])),
    /**
     * Records on both sides of the equator in strength: the envelope is the larger side's cells alone, since a January
     * median over both would be a month no place has; the other side's count is kept so the page can say so (round thirty-one, 1).
     */
    hemispheres: v.optional(v.object({ north: v.number(), south: v.number(), used: v.picklist(['north', 'south']), equatorial: v.optional(v.number()) })),
    /** How much of the typical cell's NASA POWER cell (0.5°) is land, by sampling the climate grid: a figure read at a cell that is mostly sea is said to be (round thirty-one, 2). */
    landFraction: v.optional(v.number()),
    /** In-range cells left out because the elevation layer holds no land in them: a record placed at sea (round thirty-one, corpus). */
    seaCells: v.optional(v.number()),
    src: v.object({ normals: v.string(), envelope: v.string(), extremes: v.optional(v.string()), elevation: v.optional(v.string()) })
  }),
  v.object({ status: v.picklist(['pending', 'none', 'refused']), detail: v.optional(v.string()) })
]);

export const Photo = v.object({
  src: v.picklist(['inat', 'commons', 'gbif', 'user']),
  id: v.string(),
  url: v.string(),
  thumb: v.string(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  /** `pd`, public domain that is not a CC0 waiver, since round sixty-nine (triage-68 K3); a dossier built before tags it `cc0`, and `safeUrls` reads it again. */
  licence: v.picklist(['cc0', 'pd', 'by', 'by-sa']),
  attribution: v.string(),
  page: v.optional(v.string()),
  captive: v.optional(v.boolean()),
  observedOn: v.optional(v.string()),
  place: v.optional(v.string()),
  /**
   * A Commons file's categories as Commons gave them, kept since round seventy (REVIEW-TRIAGE-69 C2) by the build and by
   * `--fill commons-kind`, so the read applies the category rules (`commonsKind`) to a stored file as to a new answer.
   * Absent in a file not yet read again; present and empty for a file Commons files under none.
   */
  categories: v.optional(v.array(v.string())),
  /** True when Commons' description of the file strikes out a name ("Centaurea sp. ~~C. nuttallii~~"; S-C3), kept with the categories. */
  struck: v.optional(v.boolean()),
  /**
   * True for GBIF media whose record is not an observation of the living plant (its basisOfRecord is not
   * HUMAN_OBSERVATION or OBSERVATION: a herbarium sheet, a museum's drawing, a micrograph), set by the build and by B's
   * fill of the basis of record. Not shown (self-review 70, S-C4; REVIEW-TRIAGE-70); before round seventy-one it only
   * ranked below Commons as a lead.
   */
  specimen: v.optional(v.boolean()),
  /**
   * For a Commons file: the slips of the species' epithet in its title ("mammillaria mabudae", lower case) that Kew and
   * GBIF were asked of and accept as no species, so the title is the species' (`slipStanding`; self-review 70, S-C9). A
   * slip not listed here is read as another plant. Kept by the build and `--fill commons-kind`.
   */
  slips: v.optional(v.array(v.string())),
  /** For a Commons file: the iNaturalist photograph its source names, when it is a copy of one, so a page holding the original shows it once (S-C5). */
  inat: v.optional(v.string()),
  /** For a Commons file: what its source or description says it is when that is not a photograph of the living plant ("a herbarium sheet (by its source)"; `sourceKind`, S-C2). The read leaves it out. */
  kind: v.optional(v.string()),
  /** For a Commons file: true once `--fill commons-kind` has read its source and slips (round seventy-one), so a rerun passes it by. */
  sourceRead: v.optional(v.boolean()),
  /**
   * For a Commons file `--fill commons-kind` has read: the version of the description rules (`SOURCE_KIND_RULE`) that
   * read `kind` (round seventy-seven). A file left out by its description is asked again only under an older version, so
   * a sheet stays a sheet without a request on every fill (Boswellia papyrifera's, round seventy-three's review).
   */
  kindRule: v.optional(v.number()),
  /**
   * For a Commons file whose title names only a sister species' epithet (round seventy-three): whether its description
   * names the species under one of its own names ("Heliamphora heterodoxa 'Ptari Tepui' (now known as Heliamphora
   * purpurascens)"), read by the build and `--fill commons-kind`. True keeps the file; absent until read, false after.
   */
  described: v.optional(v.boolean()),
  /** The ids of the other species' pages that hold this same photograph, written by `--index` (round seventy-two, C5): no page shows it. */
  shared: v.optional(v.array(PageIdSchema)),
  /**
   * For a Commons file: what the photograph rules made of it with every name the reference holds, written by `--index`
   * (round seventy-six), so the Worker reads a page without the reference's names: `not`, why it is not a photograph of
   * the species (`commonsKind`), absent when it is one; `rank`, 0 when its title holds the species' own epithet, 1 an
   * older name's, 2 neither (`epithetRank`), which orders the Commons files. Read where no names are given; where they
   * are (the build, the fills), the rules run again.
   */
  judged: v.optional(v.object({ not: v.optional(v.string()), rank: v.number() }))
});

export const Paper = v.object({
  title: v.string(),
  year: v.optional(v.number()),
  doi: v.optional(v.string()),
  url: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  venue: v.optional(v.string())
});

export const Dossier = v.object({
  v: v.literal(DOSSIER_V),
  /** The page's id (round seventy-eight; `$core/page-id`): `k<Kew plant_name_id>`, or `g<GBIF key>` where Kew's file gives no one taxon that is this page's alone. Its GBIF key is `ids.gbif`. */
  key: PageIdSchema,
  slug: v.string(),
  built: v.string(),
  builtBy: v.picklist(['node', 'worker']),
  name: NameBlock,
  ids: Ids,
  summary: v.optional(Summary),
  distribution: Distribution,
  occurrences: Occurrences,
  centroid: v.optional(Centroid),
  climate: Climate,
  photos: v.array(Photo),
  literature: v.array(Paper),
  links: v.record(v.string(), v.string()),
  upstream: v.record(v.string(), Upstream),
  /** The day the page's substance last changed and its fingerprint, for the sitemap (src/lib/dossier/changed.ts; round sixty-three). Absent in a dossier built before. */
  changed: v.optional(v.object({ on: v.string(), h: v.string() }))
});

export type Dossier = v.InferOutput<typeof Dossier>;
export type Photo = v.InferOutput<typeof Photo>;
export type OccPoint = v.InferOutput<typeof OccPoint>;
export type Climate = v.InferOutput<typeof Climate>;
export type Upstream = v.InferOutput<typeof Upstream>;
export type Box = v.InferOutput<typeof BoxSchema>;

/** A URL the page may render as a link: web addresses only. The CSP already blocks `javascript:`; this keeps a `data:` or a relative path out of an href too (round twenty-nine, 10). */
const webUrl = (u: string | undefined): string | undefined => (u && /^https?:\/\//i.test(u) ? u : undefined);

/**
 * A carried row's detail, cut to the build that asked and the reason that build gave. Each rederive wrapped the previous
 * row's detail ("carried from build of 2026-09-29 (rederive); that build: carried from build of …"), nine deep on a page;
 * round thirty-five stopped the builder adding to a chain and left the chains that were already there (round thirty-seven,
 * R1-6). Applied as a dossier is read, so no rebuild is needed, and by the builder, so the files stop carrying it.
 */
export function unchain(detail: string | undefined): string | undefined {
  if (!detail || !detail.startsWith('carried from build of')) return detail;
  const parts = detail.split(/; (?:that|this) build: /);
  if (parts.length < 2) return detail;
  let origin = parts[0];
  let reason: string | null = null;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith('carried from build of')) origin = parts[i];
    else reason = parts[i];
  }
  // The clause after a chain is the reason the asking build gave ("that build: …") or what this build got ("this build: …"): the words that stood before it are kept.
  const sep = reason == null ? '' : detail.includes(`; this build: ${reason}`) ? '; this build: ' : '; that build: ';
  return reason == null ? origin : `${origin}${sep}${reason}`;
}

/**
 * Every address in a dossier that a page turns into a link, scrubbed to web addresses; a photograph whose own address is
 * not one is dropped. `held` is the reference's names (`heldNamesOf` of the index), which the photograph rules read to
 * tell an uploader's slip from another species (round seventy; REVIEW-TRIAGE-69 C1); without it no slip is the species'.
 */
export function safeUrls(d: Dossier, held?: HeldNames | null): Dossier {
  // Extremes read at a POWER cell that is mostly sea are set aside (round thirty-five, R1-11): the cold floor then comes
  // from the range's coldest mean night, and the page says what the sea cell gave. So are extremes whose lapse correction
  // is beyond what a lapse rate can bridge, or that came out impossible (round eighty, A: `setAsideExtremes`).
  const climate = setAsideExtremes(d.climate);
  return {
    ...d,
    climate,
    summary: d.summary ? { ...d.summary, url: webUrl(d.summary.url) ?? '' } : d.summary,
    // A Commons file that is not a photograph of the species, or whose licence or author the rules do not read, is left
    // out here, and the rest have Commons' credit cleaned, so the deploy corrects every page (round sixty-nine; triage-68 K1-K3).
    photos: shownPhotos(dedupePhotos(d.photos.filter((p) => webUrl(p.url) && webUrl(p.thumb)).map((p) => ({ ...p, thumb: mendCommonsThumb(mendGbifThumb(p.thumb, p.id, p.url), p.width), page: webUrl(p.page) }))), kindNamesOf(d, held)),
    // A specimen record under DiSSCo's DOI prefix is not a paper (round thirty-one, 6): dropped here as well as at the build, so dossiers built before the rule show none.
    literature: d.literature.filter((p) => !/^(https?:\/\/doi\.org\/)?10\.3535\//i.test(p.doi ?? '')).map((p) => ({ ...p, url: webUrl(p.url) })),
    links: Object.fromEntries(Object.entries(d.links).filter(([, u]) => webUrl(u))),
    upstream: Object.fromEntries(Object.entries(d.upstream).map(([k, u]) => [k, u.detail?.startsWith('carried from build of') ? { ...u, detail: unchain(u.detail) } : u]))
  };
}

/** The climate with its extremes set aside where they are the sea's (round thirty-five) or beyond a lapse correction (round eighty). */
export function setAsideExtremes<C extends Dossier['climate']>(c: C): C {
  if (c.status !== 'ok' || !c.extremes) return c;
  if (c.landFraction != null && c.landFraction < 0.5) return { ...c, extremes: undefined, extremesSea: c.extremes, extremesStatus: 'sea' as const };
  return lapseSetAside(c) ? { ...c, extremes: undefined, extremesLapse: c.extremes, extremesStatus: 'lapse' as const } : c;
}

export { MAX_LAPSE_M, lapseSetAside };

export function parseDossier(json: unknown, held?: HeldNames | null): Dossier {
  return safeUrls(v.parse(Dossier, json), held);
}

export function dossierPath(id: PageId): string {
  return `s/v${DOSSIER_V}/${id}.json`;
}

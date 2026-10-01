/**
 * The species dossier: everything a species page needs, built once, served as
 * one immutable JSON. The version lives in the path (s/v2/<key>.json) and in
 * the document, and a shape change is a version bump — the schema is what
 * makes forgetting impossible: a dossier that does not parse is not served.
 */
import { mendGbifThumb } from './md5';
import { dedupePhotos } from './dedupe';
import * as v from 'valibot';

/** v2 (September 2026): the habitat climate is an envelope across every in-range record's cell, not one point. */
export const DOSSIER_V = 2 as const;

export const UpstreamStatus = v.picklist(['ok', 'none', 'refused', 'error', 'skipped']);
export type UpstreamStatus = v.InferOutput<typeof UpstreamStatus>;

/** Every upstream answers one of: it gave data (ok), it said there is none
 *  (none), it would not answer (refused: 429/403/timeout), it broke (error).
 *  "none" is the only one a page may render as an absence. */
export const Upstream = v.object({
  status: UpstreamStatus,
  at: v.string(),
  detail: v.optional(v.string())
});

export const BoxSchema = v.object({ s: v.number(), w: v.number(), n: v.number(), e: v.number() });

export const Vernacular = v.object({ name: v.string(), lang: v.optional(v.string()), source: v.optional(v.string()) });

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
  vernacular: v.array(Vernacular)
});

export const Ids = v.object({
  gbif: v.number(),
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
  title: v.string()
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
  /** Kew's own one-line descriptions from WCVP: the life form and the climate class. Quoted, not derived. */
  kew: v.optional(v.object({ lifeform: v.optional(v.string()), climate: v.optional(v.string()) })),
  /** WCVP lists the name more than once and authorship did not decide: why no range is attached. */
  ambiguous: v.optional(v.string()),
  source: v.string(),
  boxes: v.array(BoxSchema),
  /** True only when the native regions come from WCVP with native status stated. Habitat climate is derived only then. */
  verified: v.optional(v.boolean())
});

const Lat = v.pipe(v.number(), v.minValue(-90), v.maxValue(90));
const Lon = v.pipe(v.number(), v.minValue(-180), v.maxValue(180));
/** [lat, lon, year|null, country|null, basisOfRecord|null, licence tag]. Open records only, and the schema holds it to that. */
export const OccPoint = v.tuple([Lat, Lon, v.nullable(v.number()), v.nullable(v.string()), v.nullable(v.string()), v.picklist(['cc0', 'by', 'by-sa'])]);

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
  datasets: v.array(v.object({ key: v.string(), title: v.optional(v.string()), licence: v.string(), n: v.number() }))
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
    /** 10th and 90th percentile of the per-cell annual rain totals: a range of years cells actually have, unlike a sum of monthly percentiles. */
    annualRain: v.optional(v.object({ p10: v.number(), p90: v.number() })),
    extremes: v.optional(Extremes),
    /**
     * The daily extremes read at a POWER cell that is mostly sea (`landFraction` under a half): set aside here by the
     * parser, not shown as a cold floor, since a figure the page itself says is the sea's is nearer a refusal than a
     * measurement (round thirty-five, R1-11). The notice under the cold floor still says what was read there.
     */
    extremesSea: v.optional(Extremes),
    /** Whether the daily extremes were read: 'refused' is NASA POWER not answering, which is not the same as no series (round sixteen, 7); 'sea' is read at a cell that is mostly sea and set aside. */
    extremesStatus: v.optional(v.picklist(['ok', 'none', 'refused', 'skipped', 'sea'])),
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
  licence: v.picklist(['cc0', 'by', 'by-sa']),
  attribution: v.string(),
  page: v.optional(v.string()),
  captive: v.optional(v.boolean()),
  observedOn: v.optional(v.string()),
  place: v.optional(v.string())
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
  key: v.number(),
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
  upstream: v.record(v.string(), Upstream)
});

export type Dossier = v.InferOutput<typeof Dossier>;
export type Photo = v.InferOutput<typeof Photo>;
export type OccPoint = v.InferOutput<typeof OccPoint>;
export type Climate = v.InferOutput<typeof Climate>;
export type Upstream = v.InferOutput<typeof Upstream>;
export type Box = v.InferOutput<typeof BoxSchema>;

/** A URL the page may render as a link: web addresses only. The CSP already blocks `javascript:`; this keeps a `data:` or a relative path out of an href too (round twenty-nine, 10). */
const webUrl = (u: string | undefined): string | undefined => (u && /^https?:\/\//i.test(u) ? u : undefined);

/** Every address in a dossier that a page turns into a link, scrubbed to web addresses; a photograph whose own address is not one is dropped. */
export function safeUrls(d: Dossier): Dossier {
  // Extremes read at a POWER cell that is mostly sea are set aside (round thirty-five, R1-11): the cold floor then comes
  // from the range's coldest mean night, and the page says what the sea cell gave.
  const climate = d.climate.status === 'ok' && d.climate.extremes && d.climate.landFraction != null && d.climate.landFraction < 0.5 ? { ...d.climate, extremes: undefined, extremesSea: d.climate.extremes, extremesStatus: 'sea' as const } : d.climate;
  return {
    ...d,
    climate,
    summary: d.summary ? { ...d.summary, url: webUrl(d.summary.url) ?? '' } : d.summary,
    photos: dedupePhotos(d.photos.filter((p) => webUrl(p.url) && webUrl(p.thumb)).map((p) => ({ ...p, thumb: mendGbifThumb(p.thumb, p.id, p.url), page: webUrl(p.page) }))),
    // A specimen record under DiSSCo's DOI prefix is not a paper (round thirty-one, 6): dropped here as well as at the build, so dossiers built before the rule show none.
    literature: d.literature.filter((p) => !/^(https?:\/\/doi\.org\/)?10\.3535\//i.test(p.doi ?? '')).map((p) => ({ ...p, url: webUrl(p.url) })),
    links: Object.fromEntries(Object.entries(d.links).filter(([, u]) => webUrl(u)))
  };
}

export function parseDossier(json: unknown): Dossier {
  return safeUrls(v.parse(Dossier, json));
}

export function dossierPath(key: number): string {
  return `s/v${DOSSIER_V}/${key}.json`;
}

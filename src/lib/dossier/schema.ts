/**
 * The species dossier: everything a species page needs, built once, served as
 * one immutable JSON. The version lives in the path (s/v1/<key>.json) and in
 * the document, and a shape change is a version bump — the schema is what
 * makes forgetting impossible: a dossier that does not parse is not served.
 */
import * as v from 'valibot';

export const DOSSIER_V = 1 as const;

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

export const Region = v.object({ code: v.optional(v.string()), name: v.string(), box: v.optional(BoxSchema) });

export const Distribution = v.object({
  native: v.array(Region),
  introduced: v.array(Region),
  /** Regions a national checklist lists without saying native or introduced: reported, not verified. Never used for the range test. */
  reported: v.optional(v.array(Region)),
  source: v.string(),
  boxes: v.array(BoxSchema),
  /** True only when the native regions come from WCVP with native status stated. Habitat climate is derived only then. */
  verified: v.optional(v.boolean())
});

/** [lat, lon, year|null, country|null, basisOfRecord|null, licence tag]. Open records only. */
export const OccPoint = v.tuple([v.number(), v.number(), v.nullable(v.number()), v.nullable(v.string()), v.nullable(v.string()), v.string()]);

export const Occurrences = v.object({
  open: v.array(OccPoint),
  nOpenInRange: v.number(),
  nRestrictedInRange: v.number(),
  nOutsideRange: v.number(),
  /** How far the centre would have moved had restricted records been used. */
  restrictedShiftKm: v.nullable(v.number()),
  thin: v.boolean(),
  datasets: v.array(v.object({ key: v.string(), title: v.optional(v.string()), licence: v.string(), n: v.number() }))
});

export const Centroid = v.object({
  lat: v.number(),
  lon: v.number(),
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

export const Climate = v.variant('status', [
  v.object({
    status: v.literal('ok'),
    cell: v.string(),
    months: v.array(MonthRow),
    extremes: v.optional(
      v.object({
        years: v.number(),
        minAbs: v.number(),
        minP01: v.number(),
        maxP99: v.number(),
        frostDaysPerYear: v.number(),
        lapseAppliedM: v.number()
      })
    ),
    src: v.object({ normals: v.string(), extremes: v.optional(v.string()), elevation: v.optional(v.string()) })
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

export const Note = v.object({
  text: v.string(),
  model: v.string(),
  built: v.string(),
  arch: v.string(),
  season: v.string(),
  mode: v.picklist(['habitat', 'practice']),
  evidenceHash: v.string()
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
  note: v.optional(Note),
  upstream: v.record(v.string(), Upstream)
});

export type Dossier = v.InferOutput<typeof Dossier>;
export type Photo = v.InferOutput<typeof Photo>;
export type OccPoint = v.InferOutput<typeof OccPoint>;
export type Climate = v.InferOutput<typeof Climate>;
export type Upstream = v.InferOutput<typeof Upstream>;
export type Box = v.InferOutput<typeof BoxSchema>;

export function parseDossier(json: unknown): Dossier {
  return v.parse(Dossier, json);
}

export function dossierPath(key: number): string {
  return `s/v${DOSSIER_V}/${key}.json`;
}

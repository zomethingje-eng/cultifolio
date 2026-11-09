/**
 * The species dossier: everything a species page needs, built once, served as
 * one immutable JSON. The version lives in the path (s/v3/<id>.json) and in
 * the document, and a shape change is a version bump — the schema is what
 * makes forgetting impossible: a dossier that does not parse is not served.
 */
import { mendGbifThumb, mendCommonsThumb } from './md5';
import { MAX_LAPSE_M, lapseSetAside } from '$core/lapse';
import { sentenceCut } from '$core/text';
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
   * `accepted` (round eighty-four): Kew's row for the entry, its name with Kew's sign, its authors and its rank, which
   * heads the page while its id is `k<entry>` (`kew-heading.ts`).
   * `elsewhere` (round eighty-five, the owner's decision 6): GBIF's names on the page (`synonyms`, `infra`) that Kew's file
   * places only in another plant (`kewPlace`): not the page's names, so not searched, shown or an address. `accepted.family`:
   * Kew's family, which heads a `k` page (A9a). `by` (round eighty-seven, derived agent; review D's D13): for each of
   * `synonyms`, in its place, the authors Kew's rows of that name in the plant write (`taxon_authors`), so an older name
   * spelt as another page's heading is said by Kew's author (`homonymEntries`). Absent in a record filled before: the
   * authors not read, never none.
   */
  kew: v.optional(v.object({ entry: v.string(), synonyms: v.array(v.string()), acceptedElsewhere: v.array(v.string()), file: v.string(), heldBy: v.optional(v.string()), accepted: v.optional(v.object({ name: v.string(), authors: v.string(), rank: v.string(), other: v.optional(v.string()), family: v.optional(v.string()) })), elsewhere: v.optional(v.array(v.string())), by: v.optional(v.array(v.array(v.string()))) })),
  /**
   * GBIF's name for the page's key, where Kew's accepted name heads the page (round eighty-four, the owner's decision 1;
   * `kew-heading.ts`): what the derivation reads, and what the page gives back if it loses its `k` id. `added`: the older
   * name the heading put in `synonyms`. Absent on a page headed by GBIF's own name, and in a dossier written before.
   */
  gbif: v.optional(v.object({ scientific: v.string(), authorship: v.optional(v.string()), rank: v.optional(v.string()), genus: v.optional(v.string()), family: v.optional(v.string()), slug: v.optional(v.string()), added: v.optional(v.string()) })),
  /**
   * The names that headed the page before the heading it has now (round eighty-five; review-d D5, outside review A15): a
   * page whose Kew entry became its species' (`speciesEntry`) keeps its former heading here, and the index makes it an
   * address of the page. Absent: none.
   */
  formerly: v.optional(v.array(v.string())),
  /**
   * The one-word English names the page does not head with or show (`nameKey`s; round eighty-four, review-d D9): another
   * species of its genus is given them more often, or as often (`sharedHeadlines`), written by `--index`. Absent: none.
   */
  shared: v.optional(v.array(v.string())),
  /**
   * The names of species rank GBIF files under the species' own varieties and subspecies (round eighty-four; outside
   * review A8: Trichocereus pachanoi under T. macrogonus var. pachanoi), written by `--fill gbif-infra` from GBIF's backbone
   * export (`infra-names.ts`): searched as a name typed, never shown. Absent: not read, or none.
   */
  infra: v.optional(v.array(v.string())),
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
  cut: v.optional(v.literal(true)),
  /**
   * The article's revision the text was read from (round eighty-five, the owner's decision 8): Wikipedia's revision id,
   * and the day it was read (YYYY-MM-DD). Absent in a summary read before; `--fill summary-revisions` records them.
   */
  revision: v.optional(v.number()),
  read: v.optional(v.string()),
  /**
   * `lead` (round eighty-six; outside review B's 5): the text is the article's opening paragraph, read from the action
   * API's plain-text lead with its revision in the same request (`readLeads`). Absent on a summary read from Wikipedia's
   * REST summary service before, which leaves out words in brackets; the page says which (`summarySaid`).
   */
  from: v.optional(v.literal('lead'))
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
  kew: v.optional(v.object({ lifeform: v.optional(v.string()), climate: v.optional(v.string()), area: v.optional(v.string()) })),
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
  /**
   * The rule of the regions' shapes the records were tested by (round eighty-four: `RANGE_RULE` in `tdwg-shapes.ts`, every
   * record, open or restricted, tested by the shape or the buffered box). Absent: tested before it, or not by the shapes.
   */
  rangeRule: v.optional(v.string()),
  /**
   * Round eighty-five (G; outside review B's simplification 1, A23): every in-range record, open or restricted, counted by
   * why it is in range (`Admission` in `tdwg-shapes.ts`): inside a native shape, in the margin, off a coast, on an island.
   */
  admitted: v.optional(v.object({ strict: v.number(), buffer: v.number(), coast: v.number(), island: v.number() })),
  /** The open records the margin, the coast reach or an island took, by their place in `open` (the map marks those at sea). */
  edge: v.optional(v.object({ buffer: v.optional(v.array(v.number())), coast: v.optional(v.array(v.number())), island: v.optional(v.array(v.number())) })),
  /** How far the centre would have moved had restricted records been used. */
  restrictedShiftKm: v.nullable(v.number()),
  thin: v.boolean(),
  datasets: v.array(v.object({ key: v.string(), title: v.optional(v.string()), licence: v.string(), n: v.number() })),
  /**
   * The in-range records that came through GBIF's search API rather than a download, by GBIF's datasetKey, each record
   * one coordinate as `datasets` counts it (round eighty-seven): a page the download left to the API path, or another key
   * the download does not hold. GBIF asks a derived dataset of such records (https://www.gbif.org/derived-dataset/about);
   * `--list-derived` adds them up. Empty: none came so; absent: derived before round eighty-seven, not known.
   */
  api: v.optional(v.array(v.object({ key: v.string(), n: v.number() }))),
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
  lapseAppliedM: v.number(),
  /**
   * Each calendar year's lowest night at the typical cell, from the same NASA POWER series and by the same lapse correction
   * (round eighty-seven, derived agent; `$climate/year-lows`): the first year, and a low per year, null for a year with fewer
   * than 347 of its days. What the habitat's USDA zone is the mean of (`hardiness.ts`). US government data, no licence
   * restriction. Absent in extremes read before round eighty-seven's walk: not held, never "none".
   */
  lows: v.optional(v.object({ from: v.number(), t: v.array(v.nullable(v.number())) }))
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
    /**
     * Round eighty-five (G; A23): the cells the envelope reads, counted by why their best record is in range, and each cell
     * not strictly inside a native shape by its middle and why, so `--check-ranges` tests every contributing cell.
     */
    admitted: v.optional(v.object({ strict: v.number(), buffer: v.number(), coast: v.number(), island: v.number() })),
    edge: v.optional(v.array(v.tuple([Lat, Lon, v.picklist(['buffer', 'coast', 'island'])]))),
    /**
     * Round eighty-five (G; outside review A5): the typical cell's place, Natural Earth's state or province and its country
     * ("São Paulo, Brazil"), so a page whose climate rests on few records can say where its figures were read.
     */
    place: v.optional(v.string()),
    /*
     * No `wild` (round eighty-seven's review of stage 2, S4): the stage's rule that chose the typical cell among the cells
     * holding an iNaturalist research-grade record, and said so here, is taken out; the typical cell is every cell's.
     */
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
  /** The day (YYYY-MM-DD) the photograph's credit and licence were read from its source (round eighty-five, the owner's decision 7). Absent on a photograph stored before. */
  read: v.optional(v.string()),
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

/**
 * Round eighty-seven, stage 2 (the sources agent): four facts read offline from files in bulk/ (and, for CITES, a table
 * transcribed by hand in the repo), each written by `--fill sources` and by the walk after it builds a page
 * (`sources-fill.ts`). Every one says how it was read: `ok` (a row was matched), `none` (the file was read and holds
 * no row for the page: an answer), `undecided` (rows were found that the rules do not decide between, or that the
 * page's names do not decide; said why), or `skipped` (not asked: the file was not on disk, said why). Absent: a
 * dossier written before, also not asked. `read` is the day the figure was first read from that file; `file` and
 * `asOf` the file and the day its publisher gives it. A field that is `ok` holds its figures with their source; the
 * page never shows a figure of these without the source and the day.
 */
const SourceStatus = v.picklist(['ok', 'none', 'undecided', 'skipped']);

/**
 * Kew's predicted extinction risk (Bachman et al. 2024, New Phytologist 242: 797-808; Zenodo 10605228, CC BY 4.0):
 * the model's mean probability that the species is threatened (`p`), its 95% credible interval (`lo`, `hi`), the class
 * the model predicts and whether the model is confident of it. Matched by the page's IPNI id (the file's `ipni_id`),
 * since the file's `plant_name_id` is an earlier form of WCVP's id ("10-wcs"), not Kew's file's now. IUCN's category is never
 * read into it (IUCN's terms, CC BY-NC-SA through POWO, do not let it be shown here): `assessed` says only that the
 * file marks the species as assessed by the Red List, so the page can send the reader to IUCN's own page.
 */
export const Risk = v.object({
  status: SourceStatus,
  read: v.string(),
  file: v.optional(v.string()),
  asOf: v.optional(v.string()),
  detail: v.optional(v.string()),
  p: v.optional(v.number()),
  lo: v.optional(v.number()),
  hi: v.optional(v.number()),
  predicted: v.optional(v.picklist(['threatened', 'not threatened'])),
  confident: v.optional(v.boolean()),
  assessed: v.optional(v.literal(true)),
  ipni: v.optional(v.string())
});
export type Risk = v.InferOutput<typeof Risk>;

/**
 * CITES Appendix status, resolved from the plant listings of the Appendices as CITES publishes them, transcribed by hand
 * (`cites-appendices.tsv`; never Species+, whose terms forbid it): the Appendix, the level of the listing that covers
 * the page (`family`, `genus`, `species`, `infraspecific`), the listing's words as the Appendices print them, its
 * annotation and its parenthesis (populations, exceptions), the Party of an Appendix III listing, the name the listing
 * uses where it is one Kew holds as a synonym of the page's (`via`), the URL of the edition the row was read from, and
 * the day the Appendices are valid from. `infra`: the page's subspecies or varieties listed apart. `undecided`: the
 * listing depends on what the page's names do not say (a genus Kew draws wider than the Appendices' reference, a
 * "succulent species only"); `detail` says what.
 */
export const Cites = v.object({
  status: SourceStatus,
  read: v.string(),
  table: v.optional(v.string()),
  validFrom: v.optional(v.string()),
  detail: v.optional(v.string()),
  appendix: v.optional(v.picklist(['I', 'II', 'III'])),
  level: v.optional(v.picklist(['family', 'genus', 'species', 'infraspecific'])),
  listed: v.optional(v.string()),
  annotation: v.optional(v.string()),
  scope: v.optional(v.string()),
  party: v.optional(v.string()),
  via: v.optional(v.string()),
  url: v.optional(v.string()),
  infra: v.optional(v.array(v.object({ appendix: v.picklist(['I', 'II', 'III']), listed: v.string() })))
});
export type Cites = v.InferOutput<typeof Cites>;

/**
 * Chromosome counts from ChromoDB's IAPT/IOPB set (Simon, Bosch & Blanché; Zenodo, CC BY 4.0): each count as published
 * (`n`, gametic; `twoN`, somatic, with its "ca." or B chromosomes), its reference (the short authors and year, the
 * journal's volume and pages, the DOI or stable URL), and the name the count was published under where it is not the
 * page's (`as`). Matched by the page's IPNI id (the file's `POWO_ID`) and the page's accepted name together. Counts the
 * authors retracted and numbers inferred from genome size are left out and counted in `left`. `more`: counts not kept.
 */
export const Chromosomes = v.object({
  status: SourceStatus,
  read: v.string(),
  file: v.optional(v.string()),
  asOf: v.optional(v.string()),
  version: v.optional(v.string()),
  detail: v.optional(v.string()),
  counts: v.optional(v.array(v.object({ n: v.optional(v.string()), twoN: v.optional(v.string()), ref: v.string(), cite: v.optional(v.string()), url: v.optional(v.string()), as: v.optional(v.string()), country: v.optional(v.string()) }))),
  left: v.optional(v.number()),
  more: v.optional(v.number())
});
export type Chromosomes = v.InferOutput<typeof Chromosomes>;

/**
 * The WFO Plant List's reading of the page's name (World Flora Online's six-monthly release, CC0): `accepted`, WFO
 * accepts the same name; `synonym`, WFO holds it as a synonym of `of` (its name and authors, and WFO's id `ofId`);
 * `unchecked`, WFO holds the name and has not placed it; `none` status, WFO's list does not hold the name. `by`: how the
 * row was found, by the page's IPNI id (WFO's `scientificNameID`), by the exact name and authors whatever IPNI id WFO
 * gives them, or (`kew`, round eighty-seven's review of stage 2, B1) the one of several such rows whose `localID` is the
 * page's Kew id. `release`: WFO's release (YYYY-MM). `spelt`: WFO's spelling, where it differs. `detail` on a found row:
 * how it was found where not by the IPNI id, and WFO's IPNI id where it is not Kew's; the page says it.
 */
export const NameAgreement = v.object({
  status: SourceStatus,
  read: v.string(),
  release: v.optional(v.string()),
  file: v.optional(v.string()),
  detail: v.optional(v.string()),
  by: v.optional(v.picklist(['ipni', 'name', 'kew'])),
  wfo: v.optional(v.string()),
  kind: v.optional(v.picklist(['accepted', 'synonym', 'unchecked'])),
  of: v.optional(v.string()),
  ofId: v.optional(v.string()),
  spelt: v.optional(v.string())
});
export type NameAgreement = v.InferOutput<typeof NameAgreement>;

/**
 * Round eighty-seven, stage 2 (links agent; `src/lib/dossier/flowering.ts`): iNaturalist's research-grade observations of
 * wild plants (not captive) annotated "Flowering" (term 12, value 13), counted by the month they were observed in, January
 * first, as iNaturalist's histogram answers them for the page's taxon (`taxon`, which includes its subspecies and
 * varieties), and the day it was read. Written by `--fill flowering`. iNaturalist's data are its observers' (the counts are
 * facts read from its API, linked to its search, not its observations' text or photographs). Absent: not asked.
 */
export const Flowering = v.object({
  taxon: v.number(),
  /** January first. Absent with `unanswered`: asked, and iNaturalist did not answer ("not checked", asked again by the next fill). */
  months: v.optional(v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(0))), v.length(12))),
  read: v.string(),
  unanswered: v.optional(v.string())
});

/**
 * Round eighty-seven, stage 2 (links agent; `src/lib/dossier/elsewhere.ts`): where else the plant is recorded.
 *   - `wikidata`: the identifiers the page's own Wikidata item (`ids.wikidata`, CC0) holds for other registers and floras,
 *     by Wikidata property (`ELSEWHERE_PROPERTIES` names each and its formatter URL), and the day the item was read. Written
 *     by `--fill elsewhere`. Absent: not asked.
 *   - `published`: where the page's name was published, as Kew's World Checklist gives it for the page's Kew entry
 *     (`place_of_publication`, `volume_and_page`, `first_published` of WCVP, CC BY 4.0, RBG Kew), its row and the day of
 *     Kew's file; written by the walk with `--bulk` and by `--fill kew-published`. `bhl`: Biodiversity Heritage Library's
 *     page for exactly that citation, by its OpenURL resolver (`--fill bhl`; `src/lib/dossier/bhl.ts`): `page` where BHL
 *     answered one page whose volume, page number and year are the citation's, else `none` with why; the day asked. A
 *     citation with no `bhl` was not asked. Never a guessed page.
 */
export const Elsewhere = v.object({
  /** `unanswered`: the item was asked and Wikidata did not answer for it ("not checked"; asked again by the next fill). */
  wikidata: v.optional(v.object({ item: v.string(), read: v.string(), ids: v.array(v.object({ p: v.string(), v: v.string() })), unanswered: v.optional(v.string()) })),
  published: v.optional(v.object({
    place: v.string(),
    volPage: v.optional(v.string()),
    year: v.optional(v.string()),
    row: v.string(),
    file: v.optional(v.string()),
    bhl: v.optional(v.object({ page: v.optional(v.number()), none: v.optional(v.string()), read: v.string() }))
  }))
});

/**
 * Round eighty-seven, stage 2 (links agent; `src/lib/dossier/kew-published.ts`): a named hybrid's parents as Kew's World
 * Checklist states them (WCVP's `hybrid_formula` on the page's Kew entry, CC BY 4.0, RBG Kew), each parent the words Kew
 * writes (its genus written out where Kew abbreviates the hybrid's own genus), the Kew row the words name exactly
 * (`row`), the entry Kew accepts for it (`entry`) and the page here that is that entry (`page`), where one is. A parent
 * whose words name no row, or rows of more than one plant, is listed with why and linked nowhere; where they name the one
 * row Kew accepts beside other authors' names, that row is taken and `others` counts the rest. `formula`: Kew's words.
 */
export const Parents = v.object({
  formula: v.string(),
  row: v.string(),
  file: v.optional(v.string()),
  of: v.array(v.object({ name: v.string(), row: v.optional(v.string()), entry: v.optional(v.string()), page: v.optional(PageIdSchema), why: v.optional(v.string()), others: v.optional(v.number()) }))
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
  changed: v.optional(v.object({ on: v.string(), h: v.string() })),
  /** Round eighty-seven, stage 2 (sources agent): see `Risk`, `Cites`, `Chromosomes` and `NameAgreement` above. Absent: not asked. */
  risk: v.optional(Risk),
  cites: v.optional(Cites),
  chromosomes: v.optional(Chromosomes),
  nameAgreement: v.optional(NameAgreement),
  /**
   * The habitat's hardiness (round eighty-seven, derived agent; `hardiness.ts`): the USDA zone of the mean of the typical
   * cell's yearly lowest nights and the RHS band of its record low, both from NASA POWER's daily series (US government
   * data, no licence restriction), USDA's and the RHS's tables cited there. Worked out by the build from `climate`; absent
   * where the page shows no daily extremes, or in a dossier written before.
   */
  hardiness: v.optional(v.object({
    usda: v.optional(v.object({ years: v.number(), from: v.number(), to: v.number(), meanC: v.number(), meanF: v.number(), zone: v.string() })),
    usdaWhy: v.optional(v.string()),
    rhs: v.object({ lowC: v.number(), band: v.picklist(['H1a', 'H1b', 'H1c', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7']), years: v.number() }),
    src: v.string()
  })),
  /**
   * The habitat's Köppen–Geiger class (round eighty-seven, derived agent; `koppen.ts`), by Peel, Finlayson and McMahon's
   * (2007) thresholds, from the median year's months (CHELSA V2.1, CC0 1.0), and the
   * figures it came from. Worked out by the build from `climate`; absent where there is no habitat climate, or in a dossier
   * written before.
   */
  koppen: v.optional(v.object({
    cls: v.optional(v.string()), why: v.optional(v.string()),
    mat: v.number(), map: v.number(), thot: v.number(), tcold: v.number(), tmon10: v.number(), pdry: v.number(),
    summer: v.picklist(['AMJJAS', 'ONDJFM']), psdry: v.number(), pswet: v.number(), pwdry: v.number(), pwwet: v.number(), summerShare: v.number(), pth: v.number(),
    /** Which threshold the unrounded shares gave (round eighty-seven's review of stage 2; `koppen.ts`). Absent: written before. */
    pthBy: v.optional(v.picklist(['summer', 'winter', 'neither']))
  })),
  /** Round eighty-seven, stage 2 (links agent): `Flowering`, `Elsewhere` and `Parents` above say each. Absent: not asked. */
  flowering: v.optional(Flowering),
  elsewhere: v.optional(Elsewhere),
  parents: v.optional(Parents)
});

export type Dossier = v.InferOutput<typeof Dossier>;
export type Photo = v.InferOutput<typeof Photo>;
export type OccPoint = v.InferOutput<typeof OccPoint>;
export type Climate = v.InferOutput<typeof Climate>;
export type Upstream = v.InferOutput<typeof Upstream>;
export type Box = v.InferOutput<typeof BoxSchema>;
export type Flowering = v.InferOutput<typeof Flowering>;
export type Elsewhere = v.InferOutput<typeof Elsewhere>;
export type Parents = v.InferOutput<typeof Parents>;

/** A URL the page may render as a link: web addresses only. The CSP already blocks `javascript:`; this keeps a `data:` or a relative path out of an href too (round twenty-nine, 10). */
const webUrl = (u: string | undefined): string | undefined => (u && /^https?:\/\//i.test(u) ? u : undefined);

/**
 * A carried row's detail, cut to the build that asked and the reason that build gave. Each rederive wrapped the previous
 * row's detail ("carried from build of 2026-09-29 (rederive); that build: carried from build of …"), nine deep on a page;
 * round thirty-five stopped the builder adding to a chain and left the chains that were already there (round thirty-seven,
 * R1-6). Applied as a dossier is read, so no rebuild is needed, and by the builder, so the files stop carrying it.
 */
export function unchain(detail: string | undefined): string | undefined {
  const p = carriedParts(detail);
  if (!p) return detail;
  // Round eighty-seven: what the asking build said ("that build: …") and what the carrying build got ("this build: …")
  // are both kept, after the build that asked. Before, only the last clause was kept, so a summary carried by a walk
  // ("carried from build of …; that build: Wikipedia's article X, <its proof>; this build: not asked") lost its proof on
  // the way: 1,315 of the 1,355 summaries under another title than the page's name showed none.
  return `${p.origin}${p.that != null ? `; that build: ${p.that}` : ''}${p.now != null ? `; this build: ${p.now}` : ''}`;
}

/** The build a carried row names, as the builder writes it: its day, a note in brackets, or the range's "as one snapshot". */
const CARRIED_ORIGIN = /^carried from build of (?:\d{4}-\d{2}-\d{2}|\?)(?: ?\([^)]*\))?(?: as one snapshot)?/;
const THAT = '; that build: ', THIS = '; this build: ';
/**
 * A carried row's three parts (round eighty-seven; review M3): the build that asked (`origin`), the words that build
 * recorded (`that`) and what the build that carried it got (`now`). The builder writes them in that order, once each,
 * so the asking build's words run from the first "; that build: " after the origin to the last "; this build: ": a row
 * whose own words hold "; that build: " ("words; that build: inner") is read whole. Before, every "; that build: " was a
 * split, and the words before the last were lost when the row was carried again. A that-clause that is itself a carried
 * row (a chain of re-derivations before round thirty-five) is read down to the build that asked; the latest "this build"
 * stands. Undefined for a row that is not carried.
 */
export function carriedParts(detail: string | undefined): { origin: string; that?: string; now?: string } | undefined {
  if (!detail?.startsWith('carried from build of')) return undefined;
  const o = CARRIED_ORIGIN.exec(detail)?.[0];
  const tail = o != null ? detail.slice(o.length) : '';
  let origin: string, rest: string;
  if (o != null && (tail === '' || tail.startsWith(THAT) || tail.startsWith(THIS))) { origin = o; rest = tail; }
  else {
    // An origin the builder does not write now (a row of an older round): up to its first clause, as before.
    const at = detail.search(/; (?:that|this) build: /);
    if (at < 0) return { origin: detail };
    origin = detail.slice(0, at);
    rest = detail.slice(at);
  }
  let that: string | undefined, now: string | undefined;
  if (rest.startsWith(THAT)) {
    const body = rest.slice(THAT.length), at = body.lastIndexOf(THIS);
    if (at >= 0) { that = body.slice(0, at); now = body.slice(at + THIS.length); } else that = body;
  } else if (rest.startsWith(THIS)) now = rest.slice(THIS.length);
  if (that?.startsWith('carried from build of')) {
    const inner = carriedParts(that)!;
    const latest = now ?? inner.now;
    return { origin: inner.origin, ...(inner.that != null ? { that: inner.that } : {}), ...(latest != null ? { now: latest } : {}) };
  }
  return { origin, ...(that != null ? { that } : {}), ...(now != null ? { now } : {}) };
}

/**
 * The words of the build that asked a source, as a row carried from it keeps them (round eighty-seven): the row's own
 * detail when it is not carried; the "that build: …" clause of a carried one; undefined when a carried row kept none (a
 * walk before round eighty-seven dropped them). `recordedProof` and `--check-summaries` read a summary's proof here.
 */
export function askedDetail(detail: string | undefined): string | undefined {
  if (!detail?.startsWith('carried from build of')) return detail;
  return carriedParts(detail)!.that;
}

/**
 * Every address in a dossier that a page turns into a link, scrubbed to web addresses; a photograph whose own address is
 * not one is dropped. `held` is the reference's names (`heldNamesOf` of the index), which the photograph rules read to
 * tell an uploader's slip from another species (round seventy; REVIEW-TRIAGE-69 C1); without it no slip is the species'.
 */
export function safeUrls(d: Dossier, held?: HeldNames | null): Dossier {
  // Extremes read at a POWER cell that is mostly sea are set aside (round thirty-five, R1-11): the cold floor then comes
  // from the range's coldest mean night, and the page says what the sea cell gave. So are extremes whose lapse correction
  // is beyond what a lapse rate can bridge, or whose nights the habitat's months disagree with (round eighty, A: `setAsideExtremes`; the words, `lapseCause`).
  const climate = setAsideExtremes(d.climate);
  // Extremes restored by the margin (round eighty-five): their record reads as read and used, as a build now writes it.
  const restored = d.climate.status === 'ok' && d.climate.extremesStatus === 'lapse' && climate.status === 'ok' && climate.extremesStatus === 'ok';
  const exUp = d.upstream['climate.extremes'];
  const up: Dossier['upstream'] = restored && exUp ? { ...d.upstream, 'climate.extremes': { ...exUp, status: 'ok' as const, ...(exUp.detail ? { detail: exUp.detail.replace(/; not used: [\s\S]*$/, '') } : {}) } } : d.upstream;
  return {
    ...d,
    climate,

    // A summary stored before round eighty-four that does not end a sentence is shown cut, and marked (`sentenceCut`; A4).
    summary: d.summary ? { ...d.summary, ...cutSummary(d.summary), url: webUrl(d.summary.url) ?? '' } : d.summary,
    // A Commons file that is not a photograph of the species, or whose licence or author the rules do not read, is left
    // out here, and the rest have Commons' credit cleaned, so the deploy corrects every page (round sixty-nine; triage-68 K1-K3).
    photos: shownPhotos(dedupePhotos(d.photos.filter((p) => webUrl(p.url) && webUrl(p.thumb)).map((p) => ({ ...p, thumb: mendCommonsThumb(mendGbifThumb(p.thumb, p.id, p.url), p.width), page: webUrl(p.page) }))), kindNamesOf(d, held)),
    // A specimen record under DiSSCo's DOI prefix is not a paper (round thirty-one, 6): dropped here as well as at the build, so dossiers built before the rule show none.
    literature: d.literature.filter((p) => !/^(https?:\/\/doi\.org\/)?10\.3535\//i.test(p.doi ?? '')).map((p) => ({ ...p, url: webUrl(p.url) })),
    links: Object.fromEntries(Object.entries(d.links).filter(([, u]) => webUrl(u))),
    upstream: Object.fromEntries(Object.entries(up).map(([k, u]) => [k, u.detail?.startsWith('carried from build of') ? { ...u, detail: unchain(u.detail) } : u]))
  };
}

/** A stored summary's text and mark as `sentenceCut` reads them: the same object's fields where it ends a sentence. */
function cutSummary(s: { text: string; cut?: true }): { text: string; cut?: true } {
  const c = sentenceCut(s.text);
  return c.cut ? { text: c.text, cut: true } : { text: s.text, ...(s.cut ? { cut: true as const } : {}) };
}

/** The climate with its extremes set aside where they are the sea's (round thirty-five) or beyond a lapse correction (round eighty). */
export function setAsideExtremes<C extends Dossier['climate']>(c: C): C {
  if (c.status !== 'ok') return c;
  // Round eighty-five (G; the owner's decision 4, A7): extremes a build set aside on a gap within `DISAGREE_MARGIN_C` stand
  // again, at every read, so today's corpus shows them before the walk derives each page again.
  if (!c.extremes && c.extremesStatus === 'lapse' && c.extremesLapse && !lapseSetAside({ months: c.months, extremes: c.extremesLapse })) {
    const { extremesLapse, ...rest } = c;
    return { ...rest, extremes: extremesLapse, extremesStatus: 'ok' as const } as C;
  }
  if (!c.extremes) return c;
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

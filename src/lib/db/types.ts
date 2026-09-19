/** Domain shapes as stored in the change log (all fields flat, JSON values). */

export type Provenance = 'wild' | 'f1' | 'fn' | 'veg' | 'unknown';
export type AccStatus = 'growing' | 'archived' | 'dead';

export interface Accession {
  /**
   * The record's identity: opaque, minted once, never shown. Records made
   * before numbers and identities were separated used the accession number
   * itself as the id; `accNo()` reads either shape.
   */
  id: string;
  /** The accession number people see and print, e.g. 2026-0001. Unique among live and dead plants alike; never reused. */
  acc?: string | null;
  taxonName: string; // as accepted by the backbone, or as typed if unresolved
  taxonKey?: number | null; // GBIF key, when resolved
  nameAsReceived?: string | null;
  cultivar?: string | null;
  /**
   * species: a wild taxon (taxonName is a binomial, cultivar empty).
   * cultivar: a selected form of a known species (taxonName binomial + cultivar).
   * hybrid: a cross; taxonName is the genus or nothogenus, parentage holds what is known of the parents.
   * Unset on records made before this field existed: read as species, or cultivar when a cultivar is set.
   */
  nameKind?: 'species' | 'cultivar' | 'hybrid' | null;
  /** For a hybrid: "Ariocarpus retusus × Ariocarpus trigonus", or null when the parents are not stated. */
  parentage?: string | null;
  fieldNumber?: string | null;
  provenance?: Provenance | null;
  status: AccStatus;
  location?: string | null; // free text (legacy); superseded by locationId when set
  locationId?: string | null; // a Location record id
  acquired?: string | null; // YYYY-MM-DD
  sourceFrom?: string | null;
  sourceRef?: string | null;
  sourceForm?: string | null; // seed, seedling, plant, cutting
  price?: string | null;
  notes?: string | null;
  sowingId?: string | null;
  /** The photo shown as this plant's face; the newest photo when unset. */
  cover?: string | null;
}

/**
 * A photograph of one of your plants (or a sowing). The record here is the
 * metadata, in the change log like everything else, so it syncs and sits on
 * the timeline; the pixels live in the vault's photo store under the same id,
 * full-size (long edge 1600 px) and a 320 px thumbnail, both JPEG.
 */
export interface Photo {
  id: string;
  acc?: string | null;
  sowing?: string | null;
  /** The day it was taken (EXIF DateTimeOriginal), else the day it was added. */
  d: string;
  /** Whether `d` came from the camera or from the clock when it was added. */
  dFrom?: 'exif' | 'added' | null;
  caption?: string | null;
  w: number;
  h: number;
  bytes: number;
  /** SHA-256 of the full-size JPEG, hex; what sync will use to know a blob is already there. */
  sha?: string | null;
}

export type EventType = 'acquire' | 'repot' | 'water' | 'feed' | 'treat' | 'prune' | 'flower' | 'pollinate' | 'seed' | 'graft' | 'measure' | 'move' | 'note' | 'death' | 'propagate' | 'audit' | 'germinate' | 'potup' | 'loss';

export interface PlantEvent {
  id: string;
  acc: string; // accession id
  d: string; // YYYY-MM-DD
  t: EventType;
  note?: string | null;
  cause?: string | null; // for death
  used?: string | null; // for treat/feed: product used
  followUp?: number | null; // days until follow-up
  measures?: Record<string, number> | null;
  /** A count, for sowing events: seedlings up so far (germinate, cumulative), plants potted (potup), plants lost (loss). */
  n?: number | null;
}

export interface Taxon {
  id: string; // slug
  name: string;
  gbifKey?: number | null;
  myNotes?: string | null;
  removed?: boolean | null;
  /** On the grower's species list without a plant of it yet: wanted, or worth knowing more about. */
  followed?: boolean | null;
}

/** What a plant is, for records from before `nameKind` existed too. (Named nameKind because `kind` is the log's record type.) */
export const kindOf = (a: { nameKind?: string | null; cultivar?: string | null; taxonName: string }): 'species' | 'cultivar' | 'hybrid' =>
  a.nameKind === 'hybrid' || a.nameKind === 'cultivar' || a.nameKind === 'species' ? a.nameKind : a.cultivar ? (a.taxonName.includes(' ') ? 'cultivar' : 'hybrid') : 'species';

export const EVENT_LABEL: Record<EventType, string> = {
  acquire: 'Acquired',
  repot: 'Repotted',
  water: 'Watered',
  feed: 'Fed',
  treat: 'Treated',
  prune: 'Pruned',
  flower: 'Flowered',
  pollinate: 'Pollinated',
  seed: 'Set seed',
  graft: 'Grafted',
  measure: 'Measured',
  move: 'Moved',
  note: 'Note',
  death: 'Died',
  propagate: 'Propagated',
  audit: 'Seen at audit',
  germinate: 'Germination count',
  potup: 'Potted up',
  loss: 'Lost'
};

/**
 * A sowing is any propagation batch: seed, or a set of cuttings, offsets,
 * leaves, divisions or bulbils taken from one parent plant. It has its own
 * number, a timeline (germination counts, losses, pottings), and it mints
 * accessions when seedlings are potted up, so every plant raised here knows
 * its batch and every batch knows what it produced.
 */
export type PropMethod = 'seed' | 'cutting' | 'offset' | 'leaf' | 'division' | 'bulbil' | 'graft';
export type SowingStatus = 'active' | 'done' | 'failed';

export interface Sowing {
  /** Opaque identity (older records: the batch number itself). */
  id: string;
  /** The batch number people see, e.g. S2026-001. */
  no?: string | null;
  taxonName: string;
  taxonKey?: number | null;
  cultivar?: string | null;
  nameKind?: 'species' | 'cultivar' | 'hybrid' | null;
  parentage?: string | null;
  method: PropMethod;
  /** For vegetative methods: the accession the material came from. */
  parentAcc?: string | null;
  sown: string; // YYYY-MM-DD
  /** Seeds sown, or cuttings/offsets started. */
  count: number;
  /** Where the seed came from and its lot / field number; the provenance the seed carries. */
  sourceFrom?: string | null;
  sourceRef?: string | null;
  provenance?: Provenance | null;
  medium?: string | null;
  container?: string | null;
  /** Pre-treatment: soak, GA3, smoke, scarified, stratified… */
  treatment?: string | null;
  bottomHeatC?: number | null;
  covered?: boolean | null;
  locationId?: string | null;
  status: SowingStatus;
  notes?: string | null;
}

export const PROP_METHODS: Array<{ k: PropMethod; label: string; unit: string; veg: boolean }> = [
  { k: 'seed', label: 'Seed', unit: 'seeds', veg: false },
  { k: 'cutting', label: 'Cuttings', unit: 'cuttings', veg: true },
  { k: 'offset', label: 'Offsets / pups', unit: 'offsets', veg: true },
  { k: 'leaf', label: 'Leaf cuttings', unit: 'leaves', veg: true },
  { k: 'division', label: 'Division', unit: 'divisions', veg: true },
  { k: 'bulbil', label: 'Bulbils / bulblets', unit: 'bulbils', veg: true },
  { k: 'graft', label: 'Grafts', unit: 'scions', veg: true }
];

export const MEASURES: Array<{ k: string; label: string; unit: string }> = [
  { k: 'diam', label: 'Diameter', unit: 'mm' },
  { k: 'h', label: 'Height', unit: 'mm' },
  { k: 'spread', label: 'Spread', unit: 'mm' },
  { k: 'caudex', label: 'Caudex', unit: 'mm' },
  { k: 'heads', label: 'Heads', unit: '' },
  { k: 'leaves', label: 'Leaves', unit: '' }
];

/**
 * Locations are a tree: Laundry room → Shelf 2 → Tray B for a hobbyist,
 * Glasshouse 3 → Bench 12 for a nursery. A plant lives at one node. Conditions
 * set on a node apply to everything below it unless a child overrides them.
 */
export type LocationKind = 'room' | 'shelf' | 'bench' | 'tray' | 'windowsill' | 'greenhouse' | 'coldframe' | 'garden' | 'outdoor' | 'other';

export interface Location {
  id: string;
  name: string;
  parentId?: string | null;
  type?: LocationKind | null;
  /** Inherited when null. */
  indoor?: boolean | null;
  /** Coldest the space is allowed to get, °C (heater set-point, or what the garage bottoms out at). */
  floorC?: number | null;
  /** Light at plant level, µmol/m²/s, and hours per day, when known. */
  ppfd?: number | null;
  lightHours?: number | null;
  /** For outdoor or unheated spaces: where the forecast is read. Inherited when null. */
  lat?: number | null;
  lon?: number | null;
  altM?: number | null;
  notes?: string | null;
  sort?: number | null;
}

export const LOCATION_KINDS: Array<{ k: LocationKind; label: string }> = [
  { k: 'room', label: 'Room' },
  { k: 'shelf', label: 'Shelf' },
  { k: 'bench', label: 'Bench' },
  { k: 'tray', label: 'Tray' },
  { k: 'windowsill', label: 'Windowsill' },
  { k: 'greenhouse', label: 'Greenhouse' },
  { k: 'coldframe', label: 'Cold frame' },
  { k: 'garden', label: 'Garden bed' },
  { k: 'outdoor', label: 'Outdoors' },
  { k: 'other', label: 'Other' }
];

/** The number a plant is known by: its `acc`, or, for records made before identity and number were separate, its id. */
export const accNo = (a: { id: string; acc?: string | null }): string => a.acc ?? a.id;
/** The number a sowing batch is known by. */
export const sowNo = (s: { id: string; no?: string | null }): string => s.no ?? s.id;

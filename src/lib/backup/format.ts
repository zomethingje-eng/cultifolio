/**
 * The backup file: one zip.
 *
 *   manifest.json        what this is, when, from which device, and counts
 *   changes.json         the whole change log (the collection IS this)
 *   photos/<id>.jpg      full-size pixels for each photo record
 *   photos/<id>.t.jpg    its thumbnail
 *   plants.csv           the plants as a spreadsheet, for people, not for import
 *
 * The change log is the truth; a backup restored on any device merges by the
 * same rule sync uses (per field, latest HLC wins), so restoring an old backup
 * over a newer collection loses nothing, and restoring the same file twice
 * changes nothing. Photos are matched by id and only ever added.
 */
import * as v from 'valibot';

export const BACKUP_FORMAT = 'cultifolio-backup';
export const BACKUP_V = 1;
export const EXT = '.cultifolio.zip';

export const Manifest = v.object({
  format: v.literal(BACKUP_FORMAT),
  v: v.number(),
  app: v.optional(v.string()),
  exported: v.string(),
  device: v.optional(v.string()),
  counts: v.object({
    changes: v.number(),
    accessions: v.number(),
    events: v.number(),
    locations: v.number(),
    sowings: v.number(),
    taxa: v.number(),
    photos: v.number(),
    photoBytes: v.number()
  }),
  scheme: v.optional(v.unknown())
});
export type Manifest = v.InferOutput<typeof Manifest>;

export const ChangeRow = v.object({
  t: v.string(),
  m: v.optional(v.string()),
  kind: v.picklist(['accession', 'sowing', 'location', 'stock', 'task', 'event', 'photo', 'taxon', 'setting']),
  id: v.string(),
  field: v.string(),
  value: v.unknown()
});

/** The older, changes-only JSON export (before photos). Still accepted. */
export const LegacyChanges = v.object({
  format: v.literal('cultifolio-changes'),
  v: v.number(),
  exported: v.optional(v.string()),
  changes: v.array(ChangeRow)
});

export const photoPath = (id: string) => `photos/${id}.jpg`;
export const thumbPath = (id: string) => `photos/${id}.t.jpg`;
export const backupName = (d = new Date()) => `cultifolio-${d.toISOString().slice(0, 10)}${EXT}`;

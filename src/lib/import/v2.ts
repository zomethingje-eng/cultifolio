/**
 * Import a Cultifolio v2 (Herbarium v2) backup. Accepts either the raw
 * collection object (`mc.collection`) or a backup wrapper that contains it,
 * plus the species overlay (`mc.overlay`) if present. Produces change-log
 * entries stamped from the file's own modification times where a record
 * carries one (`m`, milliseconds), so an edit made here after that time wins
 * on every device and the same file imported twice yields the same stamps;
 * a record without one is stamped an hour before the file's export time (or
 * before now). A record whose identity is already in the log is skipped
 * when the caller says which exist (`exists`), so a second import of the
 * same file changes nothing.
 *
 * v2 numbers are preserved. Nothing in v2 is modified.
 */
import type { Change } from '$core/log';
import { hlcEncode, MAX_COUNT } from '$core/hlc';
import { slugify } from '$core/names';

interface V2Event {
  id?: string;
  d?: string;
  t?: string;
  note?: string;
  cause?: string;
  used?: string;
  [k: string]: unknown;
}
interface V2Accession {
  acc: string;
  taxonId?: string;
  nameAsReceived?: string;
  fieldNumber?: string;
  provenance?: string;
  location?: string;
  bench?: string;
  status?: string;
  notes?: string;
  source?: { from?: string; ref?: string; date?: string; form?: string; price?: string };
  sowId?: string;
  events?: V2Event[];
  m?: number;
}
interface V2Bench {
  id: string;
  name?: string;
  where?: string;
  floor?: number;
  ppfd?: number;
  hours?: number;
  lat?: number;
  lon?: number;
  notes?: string;
  temp?: string;
}
interface V2Collection {
  accessions?: Record<string, V2Accession> | V2Accession[];
  sowings?: Record<string, unknown> | unknown[];
  benches?: Record<string, V2Bench> | V2Bench[];
  tombs?: Record<string, number>;
}
interface V2Overlay {
  [id: string]: { id?: string; name?: string; myNotes?: string; removed?: boolean; gk?: number };
}

export interface ImportReport {
  accessions: number;
  events: number;
  taxa: number;
  locations: number;
  sowings: number;
  skipped: string[];
  /** Records left as they are because their identity was already in the log (a second import of the same file). */
  alreadyHere: number;
}

const MEASURE_KEYS = ['diam', 'h', 'spread', 'caudex', 'heads', 'leaves', 'leaf', 'growths', 'spikes', 'traps', 'trap'];

export interface ImportOpts {
  device?: string;
  now?: number;
  summaries?: Record<string, { gk?: number }>;
  /** Whether a record with this identity is already in the log; such records are skipped and counted in `alreadyHere`. */
  exists?: (kind: Change['kind'], id: string) => boolean;
}

/** A v2 modification time (`m`, ms) when it is one: a finite number from this century and not after `ceiling`. */
const modTime = (m: unknown, ceiling: number): number | null => (typeof m === 'number' && Number.isFinite(m) && m > 946_684_800_000 && m <= ceiling ? Math.floor(m) : null);

export function importV2(json: unknown, opts: ImportOpts = {}): { changes: Change[]; report: ImportReport } {
  const root = (json ?? {}) as Record<string, unknown>;
  const col = (root.collection ?? root.mcCollection ?? (root.accessions ? root : null)) as V2Collection | null;
  const overlay = (root.overlay ?? root.mcOverlay ?? null) as V2Overlay | null;
  const report: ImportReport = { accessions: 0, events: 0, taxa: 0, locations: 0, sowings: 0, skipped: [], alreadyHere: 0 };
  const changes: Change[] = [];
  const device = opts.device ?? 'v2imp';
  const now = opts.now ?? Date.now();
  // A record without its own modification time is stamped an hour before the file was written (the file's export time when it says, else now), so any edit made after the import wins on every device.
  const exported = modTime(root.exported ?? root.at ?? root.when, now) ?? (typeof root.exported === 'string' && !Number.isNaN(Date.parse(root.exported)) ? Math.min(Date.parse(root.exported), now) : null);
  const base = (exported ?? now) - 3600_000;
  // One counter per millisecond, so two records modified in the same millisecond never share a stamp; a very large record spills into the next millisecond rather than past the counter's width.
  const counters = new Map<number, number>();
  let wall = base;
  const at = (ms: number) => {
    wall = ms;
  };
  const t = () => {
    let n = counters.get(wall) ?? 0;
    while (n > MAX_COUNT) n = counters.get(++wall) ?? 0;
    counters.set(wall, n + 1);
    return hlcEncode({ wall, count: n, device });
  };
  const push = (kind: Change['kind'], id: string, fields: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(fields)) if (value !== undefined) changes.push({ t: t(), kind, id, field, value });
  };
  const here = (kind: Change['kind'], id: string) => {
    if (!opts.exists?.(kind, id)) return false;
    report.alreadyHere++;
    return true;
  };

  const taxonNames = new Map<string, string>();
  if (overlay)
    for (const [id, o] of Object.entries(overlay)) {
      if (!o || typeof o !== 'object') continue;
      const name = o.name ?? id;
      taxonNames.set(id, name);
      const slug = slugify(name);
      if (here('taxon', slug)) continue;
      at(modTime((o as { m?: unknown }).m, now) ?? base);
      const gk = o.gk ?? opts.summaries?.[id]?.gk ?? null;
      push('taxon', slug, { name, gbifKey: gk, myNotes: o.myNotes ?? null, removed: o.removed ?? null });
      report.taxa++;
    }

  // v2 benches become location nodes; plants referencing a bench by id or by name land on the node.
  const benchByRef = new Map<string, string>();
  if (col?.benches) {
    const benches = Array.isArray(col.benches) ? (col.benches as V2Bench[]) : Object.values(col.benches);
    for (const b of benches) {
      if (!b?.id) continue;
      const name = b.name ?? b.id;
      const lid = 'l-v2-' + slugify(name).slice(0, 24) + '-' + slugify(b.id).slice(0, 8);
      if (here('location', lid)) continue;
      at(modTime((b as { m?: unknown }).m, now) ?? base);
      const outdoor = /out|garden|balcon|patio|yard/i.test(`${b.where ?? ''}`);
      push('location', lid, { name, parentId: null, type: outdoor ? 'outdoor' : 'bench', indoor: outdoor ? false : b.where ? true : null, floorC: typeof b.floor === 'number' ? b.floor : null, ppfd: typeof b.ppfd === 'number' ? b.ppfd : null, lightHours: typeof b.hours === 'number' ? b.hours : null, lat: typeof b.lat === 'number' ? b.lat : null, lon: typeof b.lon === 'number' ? b.lon : null, notes: b.notes ?? null });
      benchByRef.set(b.id, lid);
      benchByRef.set(name.toLowerCase(), lid);
      report.locations++;
    }
  }
  // v2 sowings: the shape varied between builds, so read the fields defensively and keep the id so
  // accessions' sowId links still resolve.
  const sowIds = new Set<string>();
  if (col?.sowings) {
    const list = (Array.isArray(col.sowings) ? col.sowings : Object.values(col.sowings)) as Array<Record<string, unknown>>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);
    for (const w of list) {
      const id = str(w?.id) ?? str(w?.sow) ?? str(w?.acc);
      const sown = str(w?.sown) ?? str(w?.date) ?? str(w?.d);
      if (!id || !sown) {
        report.skipped.push('sowing without an id or date');
        continue;
      }
      if (here('sowing', id)) continue;
      at(modTime(w?.m, now) ?? base);
      const taxonId = str(w?.taxonId);
      const taxonName = (taxonId && taxonNames.get(taxonId)) || str(w?.name) || str(w?.taxon) || taxonId || 'Unknown';
      const count = num(w?.count) ?? num(w?.n) ?? num(w?.seeds) ?? num(w?.sownN) ?? 0;
      const method = /cutting|offset|leaf|division|graft/i.test(String(w?.method ?? w?.type ?? '')) ? String(w?.method ?? w?.type).toLowerCase().replace(/s$/, '') : 'seed';
      const src = (w?.source ?? {}) as Record<string, unknown>;
      push('sowing', id, {
        no: id, // as above: on the ledger, never reissued
        taxonName,
        taxonKey: (taxonId && opts.summaries?.[taxonId]?.gk) ?? null,
        method,
        parentAcc: str(w?.parent) ?? str(w?.parentAcc) ?? null,
        sown,
        count,
        sourceFrom: str(w?.from) ?? str(src.from) ?? null,
        sourceRef: str(w?.ref) ?? str(w?.lot) ?? str(src.ref) ?? null,
        provenance: str(w?.provenance) ?? null,
        medium: str(w?.medium) ?? str(w?.mix) ?? null,
        container: str(w?.container) ?? str(w?.pot) ?? null,
        treatment: str(w?.treatment) ?? str(w?.pretreat) ?? null,
        locationId: (str(w?.bench) && (benchByRef.get(str(w.bench)!) ?? benchByRef.get(str(w.bench)!.toLowerCase()))) ?? null,
        status: /done|closed|finished/i.test(String(w?.status ?? '')) ? 'done' : /fail/i.test(String(w?.status ?? '')) ? 'failed' : 'active',
        notes: str(w?.notes) ?? null
      });
      sowIds.add(id);
      report.sowings++;
      // germination counts, in whatever shape they came
      const germ = (w?.germ ?? w?.germination ?? w?.counts ?? w?.events) as unknown;
      if (Array.isArray(germ)) {
        let i = 0;
        for (const g of germ as Array<Record<string, unknown>>) {
          const d = str(g?.d) ?? str(g?.date);
          const n = num(g?.n) ?? num(g?.count) ?? num(g?.up);
          if (!d || n == null) continue;
          const t = /pot/i.test(String(g?.t ?? '')) ? 'potup' : /loss|lost|died/i.test(String(g?.t ?? '')) ? 'loss' : 'germinate';
          push('event', `v2-${id}-g${i++}`, { acc: id, d, t, n, note: str(g?.note) ?? null });
          report.events++;
        }
      }
    }
  }
  if (col?.accessions) {
    const list = Array.isArray(col.accessions) ? col.accessions : Object.values(col.accessions);
    for (const a of list) {
      if (!a?.acc) {
        report.skipped.push('accession without a number');
        continue;
      }
      if (here('accession', a.acc)) continue;
      at(modTime(a.m, now) ?? base); // the plant and its embedded events share the plant's modification time
      const taxonName = (a.taxonId && taxonNames.get(a.taxonId)) || a.nameAsReceived || a.taxonId || 'Unknown';
      const status = a.status === 'dead' ? 'dead' : a.status === 'archived' ? 'archived' : 'growing';
      push('accession', a.acc, {
        acc: a.acc, // the number as a field too, so the vault's ledger of issued numbers sees it (round twelve, 6)
        taxonName,
        taxonKey: (a.taxonId && opts.summaries?.[a.taxonId]?.gk) ?? null,
        nameAsReceived: a.nameAsReceived ?? null,
        fieldNumber: a.fieldNumber ?? null,
        provenance: a.provenance ?? null,
        status,
        location: a.bench ?? a.location ?? null,
        locationId: (a.bench && (benchByRef.get(a.bench) ?? benchByRef.get(a.bench.toLowerCase()))) ?? null,
        acquired: a.source?.date ?? null,
        sourceFrom: a.source?.from ?? null,
        sourceRef: a.source?.ref ?? null,
        sourceForm: a.source?.form ?? null,
        price: a.source?.price ?? null,
        notes: a.notes ?? null,
        sowingId: a.sowId ?? null
      });
      report.accessions++;
      for (const e of a.events ?? []) {
        if (!e?.d || !e?.t) continue;
        const measures: Record<string, number> = {};
        for (const k of MEASURE_KEYS) if (typeof e[k] === 'number') measures[k] = e[k] as number;
        push('event', e.id ? `v2-${a.acc}-${e.id}` : `v2-${a.acc}-${report.events}`, {
          acc: a.acc,
          d: e.d,
          t: e.t,
          note: e.note ?? null,
          cause: e.cause ?? null,
          used: e.used ?? null,
          measures: Object.keys(measures).length ? measures : null
        });
        report.events++;
      }
    }
    // tombstones: "a:<id>" → deleted accession
    for (const [k, ts] of Object.entries(col.tombs ?? {})) {
      const m = /^a:(.+)$/.exec(k);
      if (!m || typeof ts !== 'number') continue;
      if (here('accession', m[1])) continue;
      at(modTime(ts, now) ?? base);
      changes.push({ t: t(), kind: 'accession', id: m[1], field: 'acc', value: m[1] }); // a removed plant's number stays issued: on the ledger, never given again
      changes.push({ t: t(), kind: 'accession', id: m[1], field: '_deleted', value: true });
    }
  }
  return { changes, report };
}

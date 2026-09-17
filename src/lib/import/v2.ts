/**
 * Import a Cultifolio v2 (Herbarium v2) backup. Accepts either the raw
 * collection object (`mc.collection`) or a backup wrapper that contains it,
 * plus the species overlay (`mc.overlay`) if present. Produces change-log
 * entries stamped just before "now" so a later edit on any device wins.
 *
 * v2 numbers are preserved. Nothing in v2 is modified.
 */
import type { Change } from '$core/log';
import { hlcEncode } from '$core/hlc';
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
}

const MEASURE_KEYS = ['diam', 'h', 'spread', 'caudex', 'heads', 'leaves', 'leaf', 'growths', 'spikes', 'traps', 'trap'];

export function importV2(json: unknown, opts: { device?: string; now?: number; summaries?: Record<string, { gk?: number }> } = {}): { changes: Change[]; report: ImportReport } {
  const root = (json ?? {}) as Record<string, unknown>;
  const col = (root.collection ?? root.mcCollection ?? (root.accessions ? root : null)) as V2Collection | null;
  const overlay = (root.overlay ?? root.mcOverlay ?? null) as V2Overlay | null;
  const report: ImportReport = { accessions: 0, events: 0, taxa: 0, locations: 0, sowings: 0, skipped: [] };
  const changes: Change[] = [];
  const device = opts.device ?? 'v2imp';
  // Stamp imports one hour before now: any edit made after the import wins on every device.
  const base = (opts.now ?? Date.now()) - 3600_000;
  let n = 0;
  const t = () => hlcEncode({ wall: base, count: n++, device });
  const push = (kind: Change['kind'], id: string, fields: Record<string, unknown>) => {
    for (const [field, value] of Object.entries(fields)) if (value !== undefined) changes.push({ t: t(), kind, id, field, value });
  };

  const taxonNames = new Map<string, string>();
  if (overlay)
    for (const [id, o] of Object.entries(overlay)) {
      if (!o || typeof o !== 'object') continue;
      const name = o.name ?? id;
      taxonNames.set(id, name);
      const gk = o.gk ?? opts.summaries?.[id]?.gk ?? null;
      push('taxon', slugify(name), { name, gbifKey: gk, myNotes: o.myNotes ?? null, removed: o.removed ?? null });
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
      const taxonId = str(w?.taxonId);
      const taxonName = (taxonId && taxonNames.get(taxonId)) || str(w?.name) || str(w?.taxon) || taxonId || 'Unknown';
      const count = num(w?.count) ?? num(w?.n) ?? num(w?.seeds) ?? num(w?.sownN) ?? 0;
      const method = /cutting|offset|leaf|division|graft/i.test(String(w?.method ?? w?.type ?? '')) ? String(w?.method ?? w?.type).toLowerCase().replace(/s$/, '') : 'seed';
      const src = (w?.source ?? {}) as Record<string, unknown>;
      push('sowing', id, {
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
      const taxonName = (a.taxonId && taxonNames.get(a.taxonId)) || a.nameAsReceived || a.taxonId || 'Unknown';
      const status = a.status === 'dead' ? 'dead' : a.status === 'archived' ? 'archived' : 'growing';
      push('accession', a.acc, {
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
      if (m && typeof ts === 'number') changes.push({ t: hlcEncode({ wall: Math.min(base, ts), count: 0, device }), kind: 'accession', id: m[1], field: '_deleted', value: true });
    }
  }
  return { changes, report };
}

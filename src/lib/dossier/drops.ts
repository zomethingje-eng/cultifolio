/**
 * What a rebuild lost that the build before it had (round sixty-seven; triage-66 N4, S-B4, S-B5): a species whose
 * photographs dropped to none, or a source (or the climate) that turned refused. An offline re-derivation left 120
 * species with no photograph and 44 with a refusal that never happened, and nothing said so; the builder and the index
 * audit now fail on either. Pure, so both read one rule.
 */
type Row = { status?: string } | undefined;
export interface Dossierish {
  photos?: unknown[];
  climate?: { status?: string };
  upstream?: Record<string, Row>;
}
const refusedish = (s?: string) => s === 'refused' || s === 'error';

/** The losses from `prev` to `next`, as lines to print; empty when nothing was lost. */
export function dropsBetween(prev: Dossierish, next: Dossierish): string[] {
  const out: string[] = [];
  const had = prev.photos?.length ?? 0;
  if (had > 0 && (next.photos?.length ?? 0) === 0) out.push(`photographs dropped to none (${had} before)`);
  if (refusedish(next.climate?.status) && !refusedish(prev.climate?.status)) out.push(`climate turned ${next.climate?.status} (${prev.climate?.status ?? 'none'} before)`);
  for (const [k, u] of Object.entries(next.upstream ?? {})) {
    if (k === 'climate') continue;
    const was = prev.upstream?.[k]?.status;
    if (refusedish(u?.status) && was && !refusedish(was)) out.push(`${k} turned ${u?.status} (${was} before)`);
  }
  return out;
}

/** The same rule over two indexes (`photos` and `climate` per entry, by key): what `audit-common-names --before` fails on. */
export function indexDrops(before: Array<{ key: number; name: string; photos?: number; climate?: string }>, after: Array<{ key: number; name: string; photos?: number; climate?: string }>): string[] {
  const old = new Map(before.map((e) => [e.key, e]));
  const out: string[] = [];
  for (const e of after) {
    const b = old.get(e.key);
    if (!b) continue;
    if ((b.photos ?? 0) > 0 && (e.photos ?? 0) === 0) out.push(`${e.name}: photographs dropped to none (${b.photos} before)`);
    if (e.climate === 'refused' && b.climate !== 'refused') out.push(`${e.name}: climate turned refused (${b.climate ?? 'none'} before)`);
  }
  return out;
}

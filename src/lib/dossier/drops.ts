/**
 * What a rebuild lost that the build before it had (round sixty-seven; triage-66 N4, S-B4, S-B5): a species whose
 * photographs dropped to none, or a source (or the climate) that turned refused. An offline re-derivation left 120
 * species with no photograph and 44 with a refusal that never happened, and nothing said so; the builder and the index
 * audit now fail on either. Pure, so both read one rule.
 *
 * Round sixty-nine (triage-68 M9, S-A2) added what the rule did not see: Bisnaga glaucescens lost its Wikidata item, its
 * POWO, IPNI and WFO links and its Wikipedia summary in one run, and nothing was flagged. Now also:
 *   - an identifier, the summary or the native range lost, or the range no longer verified;
 *   - Wikidata, Wikipedia, iNaturalist's taxon or WCVP's range answering ok before and nothing (or two answers) now;
 *   - photographs falling by more than half;
 *   - the previous build's identifiers kept for a second build in a row (Wikidata lagged twice).
 */
type Row = { status?: string; detail?: string } | undefined;
export interface Dossierish {
  photos?: unknown[];
  climate?: { status?: string };
  upstream?: Record<string, Row>;
  ids?: Record<string, unknown>;
  summary?: unknown;
  distribution?: { native?: unknown[]; verified?: boolean };
}
const refusedish = (s?: string) => s === 'refused' || s === 'error';
/** The identifiers whose loss is flagged: every link the page gives besides GBIF's own. */
const IDS = ['wikidata', 'powo', 'ipni', 'wfo', 'inat', 'wikipedia'] as const;
/** The sources whose "ok" turning to nothing is flagged: each carries what the page links or quotes. */
const SETTLED = ['wikidata', 'wikipedia', 'inat.taxon', 'wcvp.distribution'] as const;
/** A Wikidata row that kept the previous build's identifiers, in round sixty-eight's words or sixty-nine's. */
export const keptIds = (u: Row) => !!u && u.status !== 'ok' && /identifiers of the build of .* are kept|previous build's identifiers are kept/.test(u.detail ?? '');

function photoDrops(had: number, has: number): string[] {
  if (had > 0 && has === 0) return [`photographs dropped to none (${had} before)`];
  return has * 2 < had ? [`photographs fell by more than half (${had} before, ${has} now)`] : [];
}

function lostParts(prev: Dossierish, next: Dossierish): string[] {
  const out: string[] = [];
  for (const k of IDS) if (prev.ids?.[k] != null && next.ids?.[k] == null) out.push(`identifier ${k} lost (${String(prev.ids[k])} before)`);
  if (prev.summary && !next.summary) out.push('Wikipedia summary lost');
  const native = (d: Dossierish) => d.distribution?.native?.length ?? 0;
  if (native(prev) > 0 && native(next) === 0) out.push(`native range lost (${native(prev)} regions before)`);
  else if (prev.distribution?.verified === true && next.distribution?.verified !== true) out.push('native range no longer verified');
  return out;
}

/** The losses from `prev` to `next`, as lines to print; empty when nothing was lost. */
export function dropsBetween(prev: Dossierish, next: Dossierish): string[] {
  const out: string[] = [...photoDrops(prev.photos?.length ?? 0, next.photos?.length ?? 0), ...lostParts(prev, next)];
  if (refusedish(next.climate?.status) && !refusedish(prev.climate?.status)) out.push(`climate turned ${next.climate?.status} (${prev.climate?.status ?? 'none'} before)`);
  for (const [k, u] of Object.entries(next.upstream ?? {})) {
    if (k === 'climate') continue;
    const was = prev.upstream?.[k]?.status;
    if (refusedish(u?.status) && was && !refusedish(was)) out.push(`${k} turned ${u?.status} (${was} before)`);
  }
  for (const k of SETTLED) {
    const now = next.upstream?.[k];
    if (prev.upstream?.[k]?.status === 'ok' && (now?.status === 'none' || now?.status === 'ambiguous')) out.push(`${k} turned ${now.status} (ok before)${now.detail ? `: ${now.detail}` : ''}`);
  }
  if (keptIds(prev.upstream?.wikidata) && keptIds(next.upstream?.wikidata)) out.push('the identifiers of an earlier build kept for a second build in a row (Wikidata did not answer twice)');
  return out;
}

type IndexRow = { key: number; name: string; photos?: number; climate?: string; origin?: string[] };
/** The same rule over two indexes (photographs, climate and native range per entry, by key): what `audit-common-names --before` fails on. */
export function indexDrops(before: IndexRow[], after: IndexRow[]): string[] {
  const old = new Map(before.map((e) => [e.key, e]));
  const out: string[] = [];
  for (const e of after) {
    const b = old.get(e.key);
    if (!b) continue;
    for (const why of photoDrops(b.photos ?? 0, e.photos ?? 0)) out.push(`${e.name}: ${why}`);
    if (e.climate === 'refused' && b.climate !== 'refused') out.push(`${e.name}: climate turned refused (${b.climate ?? 'none'} before)`);
    if ((b.origin?.length ?? 0) > 0 && !(e.origin?.length ?? 0)) out.push(`${e.name}: native range lost (${b.origin!.length} regions before)`);
  }
  return out;
}

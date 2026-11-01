/**
 * The day each photograph's credit was read from its source (round eighty-five, the owner's decision 7; outside review B's
 * 2: two Hibiscus credits differ from what iNaturalist says today, and the page could not say when it read them). A
 * photograph's own day where the fill wrote one (`read`), else the day its source's row in the record of sources was
 * answered (a file's day where it was read from a file). Said once per source and day: "Credits as read from iNaturalist
 * on 2026-10-27 and from Wikimedia Commons on 2026-10-22".
 */
export type CreditUp = Record<string, { status: string; at?: string; asOf?: string } | undefined>;
type P = { src?: string; captive?: boolean; read?: string };

const NAME: Record<string, string> = { inat: 'iNaturalist', commons: 'Wikimedia Commons', gbif: 'GBIF' };

/** The record-of-sources row a photograph came by. */
export const rowOf = (p: P): string | null => (p.src === 'inat' ? (p.captive ? 'inat.photos.cultivated' : 'inat.photos.wild') : p.src === 'commons' ? 'commons' : p.src === 'gbif' ? 'gbif.media' : null);

const DAY = /^\d{4}-\d{2}-\d{2}/;

export function creditDays(photos: readonly P[], upstream: CreditUp): string {
  const by = new Map<string, Set<string>>();
  for (const p of photos) {
    const name = NAME[p.src ?? ''];
    if (!name) continue;
    const row = rowOf(p);
    const u = row ? upstream[row] : undefined;
    const day = (DAY.exec((p as { read?: string }).read ?? '') ?? (u && u.status !== 'skipped' ? DAY.exec(u.asOf ?? u.at ?? '') : null))?.[0];
    if (!day) continue;
    const set = by.get(name) ?? new Set<string>();
    set.add(day);
    by.set(name, set);
  }
  const parts = [...by].map(([name, ds]) => `from ${name} on ${[...ds].sort().join(', ')}`);
  if (!parts.length) return '';
  return `Credits as read ${parts.length < 2 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}`;
}

/**
 * A quoted summary's revision and the day it was read (round eighty-five, the owner's decision 8): Wikipedia's revision id
 * where the fill recorded it, linked as that revision (`/w/index.php?oldid=`), and the day: the summary's own, else the
 * day the build's Wikipedia row was answered. Nothing where neither is known.
 */
export function summaryRevision(s: { url?: string; revision?: number | string; read?: string } | null | undefined, row?: { status: string; at?: string } | null): { rev: string | null; href: string | null; day: string | null } {
  if (!s) return { rev: null, href: null, day: null };
  const rev = s.revision != null && /^\d+$/.test(String(s.revision)) ? String(s.revision) : null;
  let href: string | null = null;
  try {
    if (rev && s.url) href = `${new URL(s.url).origin}/w/index.php?oldid=${rev}`;
  } catch {
    href = null; // an address that is not one: the revision is named, not linked
  }
  const day = DAY.exec(s.read ?? '')?.[0] ?? (row && row.status === 'ok' ? DAY.exec(row.at ?? '')?.[0] ?? null : null);
  return { rev, href, day };
}

/**
 * How a quoted article under another title than the page's was reached, where the record says it (round eighty-five;
 * outside review A's 9h: Fragaria × ananassa quotes "Strawberry" and the page did not say by what route). The build's
 * Wikipedia row names the route and its proof ("Wikipedia redirects Fragaria × ananassa to Strawberry, a product of this
 * species"); a row kept from an earlier build may carry only that it was kept, and then the line says the rule every such
 * title is held to. Null where the title is the page's name, or an older name (said by `summaryOlderName`).
 */
export function summaryRoute(title: string, name: string, olderName: boolean, row?: { detail?: string } | null): { route: string | null } | null {
  const k = (t: string) => t.replace(/_/g, ' ').replace(/×\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (k(title) === k(name) || olderName) return null;
  const d = row?.detail ?? '';
  const m = /(?:^|; this build: |; that build: )(Wikipedia (?:redirects|'s article) [^;]+)/.exec(d);
  return { route: m ? m[1].replace(/\.$/, '') : null };
}

import { getIndex } from '$lib/server/dossiers';
import { groupFor } from '$core/regions';
import { slugify, genusOf } from '$core/names';
import { worldSvg } from '$lib/map/still';
import tdwg from '$dossier/tdwg3.json';
import type { PageServerLoad } from './$types';

const BYS = ['genus', 'origin', 'family'] as const;
type By = (typeof BYS)[number];

export const load: PageServerLoad = async ({ platform, fetch, setHeaders, url }) => {
  const index = await getIndex(platform, fetch);
  const list = index.map((e) => ({
    key: e.key,
    slug: e.slug,
    name: e.name,
    family: e.family,
    common: e.common,
    origin: e.origin ?? [],
    thumb: e.thumb,
    alt: e.thumb ? e.name : undefined,
    photos: e.photos,
    open: e.open,
    climate: e.climate
  }));
  type Item = (typeof list)[number];
  const byParam = url.searchParams.get('by');
  const by: By = (BYS as readonly string[]).includes(byParam ?? '') ? (byParam as By) : 'genus';
  const open = url.searchParams.get('open') ?? '';
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'public, max-age=60' });

  // The catalogue is browsed as closed groups, one open at a time (`?open=`), so the page carries eight hundred rows and one
  // group's tiles rather than nine thousand tiles: a genus is what a grower thinks in, so it is the default; origin keeps
  // its little map; family is for those who think that way. Search and the chips cut across the grouping on the client.
  const keyOf = (c: Item): string => (by === 'genus' ? genusOf(c.name) : by === 'family' ? (c.family ?? 'Family not stated') : groupFor(c.origin));
  const groups = new Map<string, Item[]>();
  for (const c of list) {
    const k = keyOf(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  type Row = [string, string, number, number, number, number];
  const boxByName = new Map((tdwg as Row[]).map((r) => [r[1], { s: r[2], w: r[3], n: r[4], e: r[5] }]));
  const groupMap = (items: Item[]) => {
    const boxes = [...new Set(items.flatMap((c) => c.origin))].map((u) => boxByName.get(u)).filter((b): b is { s: number; w: number; n: number; e: number } => !!b);
    return worldSvg(boxes, undefined, 'Where this group grows');
  };
  const commonest = (xs: string[]): string | undefined => {
    const t = new Map<string, number>();
    for (const x of xs) t.set(x, (t.get(x) ?? 0) + 1);
    return [...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const rows = [...groups.entries()].map(([label, items]) => {
    const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
    const id = slugify(label);
    const hero = sorted.find((c) => c.thumb && c.climate === 'ok') ?? sorted.find((c) => c.thumb);
    const genera = new Set(sorted.map((c) => genusOf(c.name))).size;
    const sub =
      by === 'genus'
        ? (commonest(sorted.map((c) => c.family).filter((f): f is string => !!f)) ?? '')
        : by === 'family'
          ? `${genera} ${genera === 1 ? 'genus' : 'genera'}`
          : [...new Set(sorted.flatMap((c) => c.origin))].slice(0, 6).join(', ') + (new Set(sorted.flatMap((c) => c.origin)).size > 6 ? ' …' : '');
    return {
      id,
      label,
      sub,
      count: sorted.length,
      withClimate: sorted.filter((c) => c.climate === 'ok').length,
      thumb: by === 'origin' ? undefined : hero?.thumb,
      alt: hero?.name,
      map: by === 'origin' ? groupMap(sorted) : undefined,
      letter: by === 'origin' ? '' : /^[A-Za-z]/.test(label) ? label[0].toUpperCase() : '#',
      items: id === open ? sorted : undefined
    };
  });
  const unplaced = (r: (typeof rows)[number]) => (r.label === 'Origin not stated' || r.label === 'Family not stated' ? 1 : 0);
  rows.sort((a, b) => unplaced(a) - unplaced(b) || (by === 'origin' ? b.count - a.count : a.label.localeCompare(b.label)));
  const letters = [...new Set(rows.map((r) => r.letter).filter(Boolean))];
  return {
    by,
    open: rows.some((r) => r.id === open) ? open : '',
    rows,
    letters,
    total: index.length,
    withClimate: list.filter((c) => c.climate === 'ok').length
  };
};

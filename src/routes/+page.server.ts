import { getIndex } from '$lib/server/dossiers';
import { broadRegion } from '$core/regions';
import { worldSvg } from '$lib/map/still';
import tdwg from '$dossier/tdwg3.json';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, fetch, setHeaders }) => {
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
  // Featured: the species with the most photographs that also has a habitat centre, else most photographs.
  const featured = [...list].sort((a, b) => (b.climate !== 'none' ? 1 : 0) - (a.climate !== 'none' ? 1 : 0) || b.photos - a.photos)[0];
  // Grouped by broad region of the first native unit (Southern Africa, Andes & Chile…), largest groups first.
  const groups = new Map<string, typeof list>();
  for (const c of list) {
    // The region most of its native units fall in; ties go to the first listed.
    const tally = new Map<string, number>();
    for (const u of c.origin) tally.set(broadRegion(u), (tally.get(broadRegion(u)) ?? 0) + 1);
    const g = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'Origin not stated';
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=600' });
  // A small world map per group with the member units' boxes, drawn once on the server.
  type Row = [string, string, number, number, number, number];
  const boxByName = new Map((tdwg as Row[]).map((r) => [r[1], { s: r[2], w: r[3], n: r[4], e: r[5] }]));
  const groupMap = (items: typeof list) => {
    const boxes = [...new Set(items.flatMap((c) => c.origin))].map((u) => boxByName.get(u)).filter((b): b is { s: number; w: number; n: number; e: number } => !!b);
    return worldSvg(boxes, undefined, 'Where this group grows');
  };
  return {
    featured,
    groups: [...groups.entries()]
      .map(([origin, items]) => ({ origin, items: items.sort((a, b) => a.name.localeCompare(b.name)), map: groupMap(items), owned: 0, withClimate: items.filter((c) => c.climate === 'ok').length }))
      .sort((a, b) => (a.origin === 'Origin not stated' ? 1 : 0) - (b.origin === 'Origin not stated' ? 1 : 0) || b.items.length - a.items.length || a.origin.localeCompare(b.origin)),
    total: index.length
  };
};

import { getIndex } from '$lib/server/dossiers';
import { groupFor } from '$core/regions';
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
    const g = groupFor(c.origin);
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  // Short and never stale: HTML names the build's hashed chunks, and a stale page after a deploy would import chunks that are gone.
  setHeaders({ 'cache-control': 'public, max-age=60' });
  // A small world map per group with the member units' boxes, drawn once on the server.
  type Row = [string, string, number, number, number, number];
  const boxByName = new Map((tdwg as Row[]).map((r) => [r[1], { s: r[2], w: r[3], n: r[4], e: r[5] }]));
  const groupMap = (items: typeof list) => {
    const boxes = [...new Set(items.flatMap((c) => c.origin))].map((u) => boxByName.get(u)).filter((b): b is { s: number; w: number; n: number; e: number } => !!b);
    return worldSvg(boxes, undefined, 'Where this group grows');
  };
  // The page carries each group's first tiles and its counts, not the whole catalogue: with thousands of
  // species the full list is fetched from /api/index only when someone searches, filters or opens a group.
  const PAGE = 24;
  return {
    featured,
    groups: [...groups.entries()]
      .map(([origin, items]) => {
        const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
        return { origin, items: sorted.slice(0, PAGE), count: sorted.length, map: groupMap(sorted), owned: 0, withClimate: sorted.filter((c) => c.climate === 'ok').length, origins: [...new Set(sorted.flatMap((c) => c.origin))].slice(0, 7) };
      })
      .sort((a, b) => (a.origin === 'Origin not stated' ? 1 : 0) - (b.origin === 'Origin not stated' ? 1 : 0) || b.count - a.count || a.origin.localeCompare(b.origin)),
    total: index.length,
    withClimate: list.filter((c) => c.climate === 'ok').length,
    page: PAGE
  };
};

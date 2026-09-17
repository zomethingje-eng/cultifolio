/**
 * Still habitat pictures. No tile server is ever contacted: Natural Earth
 * coastlines (public domain) drawn as SVG, one world view with the native
 * range boxes and one regional crop with the open occurrence points.
 * Coordinates in the static coastline files are already y = -lat, so no
 * transform is needed: Chromium stops painting a large path under a
 * negative-scale transform once the viewBox is zoomed in.
 * Rendered as strings so the server can inline them. The coastline itself is
 * a static SVG referenced with <use>, fetched once and cached for every page.
 */
import type { Box } from '$core/geo';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function boxRects(boxes: Box[], cls: string): string {
  return boxes
    .map((b) => {
      if (b.w <= b.e) return `<rect class="${cls}" x="${b.w}" y="${-b.n}" width="${b.e - b.w}" height="${b.n - b.s}"/>`;
      // antimeridian: two rects
      return `<rect class="${cls}" x="${b.w}" y="${-b.n}" width="${180 - b.w}" height="${b.n - b.s}"/><rect class="${cls}" x="-180" y="${-b.n}" width="${b.e + 180}" height="${b.n - b.s}"/>`;
    })
    .join('');
}

export function worldSvg(boxes: Box[], centroid?: { lat: number; lon: number }, title = 'World map'): string {
  return (
    `<svg class="map map-world" viewBox="-180 -85 360 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(title)}">` +
    `<rect class="sea" x="-180" y="-90" width="360" height="180"/>` +
    `<use class="land" href="/maps/land110.svg#land"/>` +
    boxRects(boxes, 'range') +
    (centroid ? `<circle class="pin" cx="${centroid.lon}" cy="${-centroid.lat}" r="2.2"/>` : '') +
    `</svg>`
  );
}

export function regionSvg(boxes: Box[], points: Array<[number, number]>, centroid?: { lat: number; lon: number }, title = 'Regional map'): string {
  // Frame: union of boxes (or point extent), padded, aspect ~ 4:3, clamped to the world.
  let s = 90,
    w = 180,
    n = -90,
    e = -180;
  const feed = (la: number, lo: number) => {
    s = Math.min(s, la);
    n = Math.max(n, la);
    w = Math.min(w, lo);
    e = Math.max(e, lo);
  };
  // Frame on the records when there are enough of them (that is where the plant lives); the range
  // boxes are only the fallback frame, and are still drawn faintly for context.
  if (points.length >= 3) {
    // trim the 5% most outlying points so one misplaced record does not zoom the map out to a continent
    const lats = points.map((p) => p[0]).sort((a, b) => a - b);
    const lons = points.map((p) => p[1]).sort((a, b) => a - b);
    const q = (xs: number[], f: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round((xs.length - 1) * f)))];
    feed(q(lats, 0.05), q(lons, 0.05));
    feed(q(lats, 0.95), q(lons, 0.95));
    if (centroid) feed(centroid.lat, centroid.lon);
  } else {
    for (const b of boxes) {
      feed(b.s, b.w);
      feed(b.n, b.e);
    }
    for (const p of points) feed(p[0], p[1]);
  }
  if (n < s) return worldSvg([], centroid, title);
  const pad = Math.max(1, (n - s) * 0.35, (e - w) * 0.2);
  s = Math.max(-85, s - pad);
  n = Math.min(85, n + pad);
  w = Math.max(-180, w - pad);
  e = Math.min(180, e + pad);
  // enforce 3:2 without squashing
  const want = ((e - w) * 2) / 3;
  if (n - s < want) {
    const c = (n + s) / 2;
    s = Math.max(-85, c - want / 2);
    n = Math.min(85, c + want / 2);
  } else {
    const wantW = ((n - s) * 3) / 2;
    const c = (w + e) / 2;
    w = Math.max(-180, c - wantW / 2);
    e = Math.min(180, c + wantW / 2);
  }
  const r = Math.max(0.05, (e - w) / 220);
  const pts = points.map((p) => `<circle class="occ" cx="${p[1]}" cy="${-p[0]}" r="${r}"/>`).join('');
  return (
    `<svg class="map map-region" viewBox="${w} ${-n} ${e - w} ${n - s}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(title)}">` +
    `<rect class="sea" x="-180" y="-90" width="360" height="180"/>` +
    `<use class="land" href="/maps/land50.svg#land"/>` +
    boxRects(boxes, 'range') +
    pts +
    (centroid ? `<circle class="pin" cx="${centroid.lon}" cy="${-centroid.lat}" r="${r * 2.5}"/>` : '') +
    `</svg>`
  );
}

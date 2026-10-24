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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); // the title lands in an attribute too (round twenty-nine, 10)

/** A tenth of a degree is under a pixel at any size these maps are drawn: unrounded coordinates were a third of the origin view's markup (round fifty-two, 5). */
const r1 = (n: number) => Math.round(n * 10) / 10;
/** A thousandth of a degree, for the close-up's lines, whose frame can be a fraction of a degree across. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;
function boxRects(boxes: Box[], cls: string): string {
  return boxes
    .map((b) => {
      if (b.w <= b.e) return `<rect class="${cls}" x="${r1(b.w)}" y="${r1(-b.n)}" width="${r1(b.e - b.w)}" height="${r1(b.n - b.s)}"/>`;
      // antimeridian: two rects
      return `<rect class="${cls}" x="${r1(b.w)}" y="${r1(-b.n)}" width="${r1(180 - b.w)}" height="${r1(b.n - b.s)}"/><rect class="${cls}" x="-180" y="${r1(-b.n)}" width="${r1(b.e + 180)}" height="${r1(b.n - b.s)}"/>`;
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

/** A step of 1, 2 or 5 times a power of ten, the nearest at or over `x`. */
const niceStep = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= x) ?? 10 * p; };
/** A step of 1, 2 or 5 times a power of ten, the nearest at or under `x`. */
const niceUnder = (x: number) => { const p = 10 ** Math.floor(Math.log10(x)); return [5, 2, 1].map((m) => m * p).find((v) => v <= x) ?? p; };
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/**
 * What the close-up adds around its points (round eighty-two; the independent review's 12: no place names and no scale):
 * a light graticule, a scale bar, and the page's own native regions named where they fall in the frame. The lines are in
 * the SVG; the words are HTML laid over it, placed by share of the frame, so they are the page's own size and font at any
 * width (an SVG's text scales with its frame: 9 px on a 320 px phone, 16 px on a desktop).
 */
function closeUp(w: number, n: number, e: number, s: number, labels: ReadonlyArray<{ name: string; box: Box }>): { lines: string; words: string } {
  const W = e - w, H = n - s;
  // The frame's own 3:2 box, the view fitted into it ("meet"): where a degree falls, as a share of the box.
  const k = Math.min(1.5 / W, 1 / H), ox = (1.5 - W * k) / 2, oy = (1 - H * k) / 2;
  const fx = (lon: number) => (ox + (lon - w) * k) / 1.5, fy = (lat: number) => oy + (n - lat) * k;
  // Graticule: about three to six lines across, at a round number of degrees.
  const g = niceStep(Math.max(W, H) / 5);
  let lines = '';
  for (let x = Math.ceil(w / g) * g; x <= e; x += g) lines += `<line class="grat" x1="${r3(x)}" y1="${r3(-n)}" x2="${r3(x)}" y2="${r3(-s)}"/>`;
  for (let y = Math.ceil(s / g) * g; y <= n; y += g) lines += `<line class="grat" x1="${r3(w)}" y1="${r3(-y)}" x2="${r3(e)}" y2="${r3(-y)}"/>`;
  // Scale bar: along the frame's foot, a round distance about a fifth of its width, measured at that latitude (the map
  // is drawn in plain degrees, so a degree of longitude is shorter away from the equator, and the bar says where it holds).
  const footLat = s + H * 0.06;
  const kmPerDeg = 111.32 * Math.cos((footLat * Math.PI) / 180);
  let words = '';
  if (kmPerDeg > 1) {
    const km = niceUnder((W * kmPerDeg) / 5);
    const deg = km / kmPerDeg;
    const x0 = w + W * 0.04;
    lines += `<line class="scale" x1="${r3(x0)}" y1="${r3(-footLat)}" x2="${r3(x0 + deg)}" y2="${r3(-footLat)}"/>`;
    words += `<span class="mscale" style="left:${pct(fx(x0))};top:${pct(fy(footLat))}">${km.toLocaleString('en-US')} km</span>`;
  }
  // The regions' names, each at its box's middle clamped into the frame, largest box first, none over another.
  const placed: Array<[number, number, number, number]> = [];
  const order = [...labels].sort((a, b) => (b.box.n - b.box.s) * (b.box.e - b.box.w) - (a.box.n - a.box.s) * (a.box.e - a.box.w));
  for (const l of order.slice(0, 8)) {
    const b = l.box;
    if (b.w > b.e || b.e < w || b.w > e || b.n < s || b.s > n) continue; // outside the frame, or across the antimeridian
    const cx = Math.min(Math.max((Math.max(b.w, w) + Math.min(b.e, e)) / 2, w), e), cy = Math.min(Math.max((Math.max(b.s, s) + Math.min(b.n, n)) / 2, s), n);
    const x = fx(cx), y = fy(cy);
    // Its room, as a share of the frame: about 0.6 em a letter at a frame of about 300 px, 1.4 em tall.
    const hw = Math.min(0.45, (l.name.length * 0.0125)), hh = 0.045;
    const box: [number, number, number, number] = [x - hw, y - hh, x + hw, y + hh];
    if (placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
    placed.push(box);
    words += `<span class="mlab" style="left:${pct(Math.min(Math.max(x, 0.02 + hw), 0.98 - hw))};top:${pct(Math.min(Math.max(y, 0.06), 0.88))}">${esc(l.name)}</span>`;
  }
  return { lines, words };
}

export function regionSvg(boxes: Box[], points: Array<[number, number]>, centroid?: { lat: number; lon: number }, title = 'Regional map', labels: ReadonlyArray<{ name: string; box: Box }> = []): string {
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
  const up = closeUp(w, n, e, s, labels);
  // The words over the map are for the eye: the map's name says what it is, and the regions are listed beside it.
  return (
    `<div class="mapwrap">` +
    `<svg class="map map-region" viewBox="${w} ${-n} ${e - w} ${n - s}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(title)}">` +
    `<rect class="sea" x="-180" y="-90" width="360" height="180"/>` +
    `<use class="land" href="/maps/land50.svg#land"/>` +
    up.lines +
    boxRects(boxes, 'range') +
    pts +
    (centroid ? `<circle class="pin" cx="${centroid.lon}" cy="${-centroid.lat}" r="${r * 2.5}"/>` : '') +
    `</svg>` +
    (up.words ? `<div class="mwords" aria-hidden="true">${up.words}</div>` : '') +
    `</div>`
  );
}

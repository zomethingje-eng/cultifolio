/**
 * A species' climate card: one 1200×630 picture with the name, the four
 * figures a grower reads first, the climograph, and the sources and the URL
 * baked in, so a card passed around a forum still says where its numbers
 * came from. Pure: builds an SVG string from the same climograph geometry
 * the page draws; the browser rasterises it. Fonts are the viewer's serif and
 * sans, not the site's web fonts, because a data-URL SVG cannot load them and
 * the card must render the same everywhere.
 */
import { climograph, type ClimoInput } from '$climate/climograph';
import { frostWording } from '$core/extremes';
import { temp, rain, tempUnit, rainUnit, METRIC, type Units } from '$core/units';

export interface CardInput {
  units?: Units;
  name: string;
  family?: string;
  origin: string[];
  slug: string;
  climate: ClimoInput & { extremes?: { minAbs: number; minP01: number; maxP99: number; years: number; frostDaysPerYear: number; frostNights?: number } | null };
  cells: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function climateCardSvg(c: CardInput): string {
  const W = 1200, H = 630;
  const m = c.climate.months;
  const hot = m.reduce((b, x, i) => (x.tmax > m[b].tmax ? i : b), 0);
  const cold = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
  const rainYear = m.reduce((a, x) => a + x.precipMm, 0);
  const wetMonths = m.filter((x) => x.precipMm >= 25).length;
  const dlis = m.map((x) => x.dli).filter((x): x is number => x != null);
  const ex = c.climate.extremes ?? null;
  const u = c.units ?? METRIC;
  const figs: Array<[string, string, string]> = [
    ex ? ['Cold floor', temp(ex.minP01, u, 1), `1st-percentile night, ${ex.years} yrs · ${frostWording(ex)}`] : ['Coldest month', temp(m[cold].tmin, u), `${MON[cold]}, mean night`],
    ['Warmest month', temp(m[hot].tmax, u), `${MON[hot]}, mean day`],
    ['Rain', `${rain(rainYear, u)}/yr`, wetMonths === 0 ? 'no wet month' : `${wetMonths} wet month${wetMonths === 1 ? '' : 's'}`],
    dlis.length ? ['Light', `${Math.min(...dlis).toFixed(0)}–${Math.max(...dlis).toFixed(0)} DLI`, 'mol/m²/day, winter to summer'] : ['Cells', String(c.cells), 'habitat grid cells read']
  ];
  const g = climograph({ ...c.climate, extremes: ex ? { minAbs: ex.minAbs, maxP99: ex.maxP99, years: ex.years } : null }, 640, u);
  const gx = 520, gy = 96, scale = Math.min(1, 500 / g.height);
  const ink = '#1b2420', ink2 = '#4a5650', ink3 = '#7d8883', warm = '#b8692a', cool = '#3a6f9e', accent = '#1e6f4f', bg = '#f6f7f6', card = '#ffffff', rule = '#dfe4e1';
  const tick = (t: { y: number; label: string }) => `<line x1="${g.left}" x2="${g.left + g.plotW}" y1="${t.y}" y2="${t.y}" stroke="${rule}" stroke-width="1"/><text x="${g.left - 6}" y="${t.y + 3.5}" text-anchor="end" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="10" fill="${ink3}">${esc(t.label)}</text>`;
  const chart = `
  <g transform="translate(${gx} ${gy}) scale(${scale})">
    <rect x="${g.temp.coldQuarter.x}" y="${g.temp.top}" width="${g.temp.coldQuarter.w}" height="${g.temp.height}" fill="${ink}" opacity="0.045"/>
    ${g.temp.coldQuarter.wraps ? `<rect x="${g.temp.coldQuarter.x2}" y="${g.temp.top}" width="${g.temp.coldQuarter.w2}" height="${g.temp.height}" fill="${ink}" opacity="0.045"/>` : ''}
    ${g.temp.ticks.map(tick).join('')}
    ${g.temp.zeroY != null ? `<line x1="${g.left}" x2="${g.left + g.plotW}" y1="${g.temp.zeroY}" y2="${g.temp.zeroY}" stroke="#b3261e" stroke-width="1" stroke-dasharray="4 3" opacity="0.75"/>` : ''}
    ${g.temp.dayBand ? `<path d="${g.temp.dayBand}" fill="${warm}" opacity="0.18"/>` : ''}
    ${g.temp.nightBand ? `<path d="${g.temp.nightBand}" fill="${cool}" opacity="0.18"/>` : ''}
    <path d="${g.temp.dayLine}" fill="none" stroke="${warm}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${g.temp.nightLine}" fill="none" stroke="${cool}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${g.temp.minAbs ? `<line x1="${g.left + g.plotW - 10}" x2="${g.left + g.plotW}" y1="${g.temp.minAbs.y}" y2="${g.temp.minAbs.y}" stroke="${ink}" stroke-width="1.4"/><text x="${g.left + g.plotW - 14}" y="${g.temp.minAbs.y + 3.5}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="${ink2}">${esc(g.temp.minAbs.label)}</text>` : ''}
    ${g.temp.maxP99 ? `<line x1="${g.left + g.plotW - 10}" x2="${g.left + g.plotW}" y1="${g.temp.maxP99.y}" y2="${g.temp.maxP99.y}" stroke="${ink}" stroke-width="1.4"/><text x="${g.left + g.plotW - 14}" y="${g.temp.maxP99.y + 3.5}" text-anchor="end" font-family="system-ui, sans-serif" font-size="10" fill="${ink2}">${esc(g.temp.maxP99.label)}</text>` : ''}
    <text x="${g.left + 2}" y="${g.temp.top - 2}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.09em" fill="${ink3}">${tempUnit(u)} · DAY AND NIGHT</text>
    ${g.rain.ticks.map(tick).join('')}
    ${g.rain.bars.map((b) => (b.h > 0 ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1.5" fill="${cool}" opacity="0.55"/>` : '') + (b.lo != null && b.hi != null ? `<line x1="${b.x + b.w / 2}" x2="${b.x + b.w / 2}" y1="${b.hi}" y2="${b.lo}" stroke="${cool}" stroke-width="1.2"/>` : '')).join('')}
    ${g.rain.dry ? `<text x="${g.left + g.plotW / 2}" y="${g.rain.top + g.rain.height / 2 + 4}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-style="italic" fill="${ink3}">no month reaches a millimetre</text>` : ''}
    <text x="${g.left + 2}" y="${g.rain.top - 2}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.09em" fill="${ink3}">${rainUnit(u).toUpperCase()} RAIN</text>
    ${g.strip?.dli ? `<path d="${g.strip.dli.path}" fill="none" stroke="${accent}" stroke-width="1.6"/>` : ''}
    ${g.strip?.rh ? `<path d="${g.strip.rh.path}" fill="none" stroke="${ink3}" stroke-width="1.6" stroke-dasharray="3 3"/>` : ''}
    ${g.months.map((mo, i) => `<text x="${g.monthX[i]}" y="${g.height - 6}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10.5" fill="${ink2}">${mo}</text>`).join('')}
  </g>`;
  const figsSvg = figs
    .map(([lab, val, sub], i) => {
      const y = 150 + i * 96;
      return `<rect x="40" y="${y}" width="440" height="80" rx="12" fill="${card}"/><text x="58" y="${y + 24}" font-family="system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="0.09em" fill="${ink3}">${esc(lab.toUpperCase())}</text><text x="58" y="${y + 52}" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="26" fill="${ink}">${esc(val)}</text><text x="58" y="${y + 70}" font-family="system-ui, sans-serif" font-size="12" fill="${ink2}">${esc(sub)}</text>`;
    })
    .join('');
  const origin = c.origin.slice(0, 3).join(', ') + (c.origin.length > 3 ? ` +${c.origin.length - 3}` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <text x="40" y="52" font-family="system-ui, sans-serif" font-size="12" font-weight="700" letter-spacing="0.16em" fill="${ink3}">CULTIFOLIO · HABITAT CLIMATE</text>
  <text x="40" y="100" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="40" font-weight="600" fill="${ink}">${esc(c.name)}</text>
  <text x="40" y="126" font-family="system-ui, sans-serif" font-size="14" fill="${ink2}">${esc([c.family, origin].filter(Boolean).join(' · '))}</text>
  ${figsSvg}
  <rect x="${gx - 12}" y="${gy - 12}" width="${g.width * scale + 24}" height="${g.height * scale + 24}" rx="12" fill="${card}"/>
  ${chart}
  <g transform="translate(${gx} ${gy + g.height * scale + 34})" font-family="system-ui, sans-serif" font-size="11.5" fill="${ink2}">
    <line x1="0" x2="16" y1="-4" y2="-4" stroke="${warm}" stroke-width="2.5"/><text x="22" y="0">day</text>
    <line x1="60" x2="76" y1="-4" y2="-4" stroke="${cool}" stroke-width="2.5"/><text x="82" y="0">night</text>
    <rect x="128" y="-11" width="10" height="10" fill="${cool}" opacity="0.55"/><text x="144" y="0">rain</text>
    <rect x="186" y="-11" width="16" height="10" fill="${warm}" opacity="0.25"/><text x="208" y="0">10th–90th percentile across cells</text>
    <rect x="410" y="-11" width="16" height="10" fill="${ink}" opacity="0.06"/><text x="432" y="0">cold quarter</text>
    ${g.strip ? `<line x1="520" x2="536" y1="-4" y2="-4" stroke="${accent}" stroke-width="2"/><text x="542" y="0">DLI</text><line x1="580" x2="596" y1="-4" y2="-4" stroke="${ink3}" stroke-width="2" stroke-dasharray="3 3"/><text x="602" y="0">RH, own scales</text>` : ''}
  </g>
  <text x="40" y="${H - 40}" font-family="system-ui, sans-serif" font-size="12" fill="${ink2}">Median year across ${c.cells} habitat cell${c.cells === 1 ? '' : 's'} (band: 10th–90th percentile). CHELSA V2.1 1981–2010 (CC0) · NASA POWER · records: GBIF · range: WCVP, RBG Kew (CC BY 4.0).</text>
  <text x="40" y="${H - 20}" font-family="system-ui, sans-serif" font-size="12" fill="${ink2}">Derived by rule, not written. Every figure and its source: <tspan fill="${accent}" font-weight="700">cultifolio.com/species/${esc(c.slug)}</tspan></text>
</svg>`;
}

/** Rasterise the SVG to a PNG blob in the browser at 2× for a crisp card. */
export async function svgToPng(svg: string, width = 1200, height = 630, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('the card could not be drawn'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('the card could not be encoded'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

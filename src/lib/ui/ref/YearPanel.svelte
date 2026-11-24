<script lang="ts">
  /**
   * The year at the habitat (round 118; SPECIES 19): three charts and four thin rows on one month axis, each on its own
   * scale with its spread (10th to 90th percentile) drawn; the current month shaded through all of them, its figure at the
   * right; Chart | Table; and the year in two halves in sentences, made by rule from the table. Every figure is the page's
   * own (CHELSA's months across the range; the day length is arithmetic on the typical cell's latitude). The charts are
   * drawn for the eye; the table is their text, named so for assistive technology.
   */
  import { tempN, tempUnit, rain, rainUnit, type Units } from '$core/units';
  import { dayLengths } from '$climate/day-length';
  import { yearHalves } from '$climate/year-halves';
  type M = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number; vpdKpa?: number; windMs?: number };
  type YearRead = { grow: string; fog: boolean; frozen: boolean; growMonths: number[] } | null;
  let { months, p10, p90, lat, shift = 0, floorC = null, units, year = null, dossierKey, name, src }: {
    months: M[]; p10: M[]; p90: M[]; lat: number; shift?: number; floorC?: number | null; units: Units; year?: YearRead; dossierKey: string; name: string; src: string;
  } = $props();

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** The fixed spans of the thin rows across every page (the corpus's 1st to 99th percentile rounded out; /about/how). */
  const SPANS = { day: [0, 24], rh: [40, 75], vpd: [0, 2], wind: [0, 6] } as const;
  let view = $state<'chart' | 'table'>('chart');
  let mine = $state(true);
  /** The 10th–90th span is shown only where it differs from the median, as the month table showed it (rounds 61 to 117). */
  const spread = (med: unknown, lo: unknown, hi: unknown) => lo != null && hi != null && lo !== '' && hi !== '' && !(String(lo) === String(med) && String(hi) === String(med)) && !String(lo).includes('–') && !String(hi).includes('–');
  const s = $derived(mine ? shift : 0);
  /** The habitat month (0 to 11) shown in column k. */
  const hm = (k: number) => (k + s) % 12;
  const now = new Date().getMonth();
  const days = $derived(dayLengths(lat));
  const col = (f: (m: M) => number | undefined, set: M[]) => Array.from({ length: 12 }, (_, k) => f(set[hm(k)]));
  const T = (c: number) => Number(tempN(c, units, 1));
  const tu = $derived(tempUnit(units));

  const W = 600, L = 46, R = 8;
  const x = (k: number) => L + ((k + 0.5) * (W - L - R)) / 12;
  const cw = (W - L - R) / 12;
  function scale(vals: number[], step: number, zero = false) {
    const ok = vals.filter((v) => Number.isFinite(v));
    let lo = Math.floor(Math.min(...ok) / step) * step, hi = Math.ceil(Math.max(...ok) / step) * step;
    if (zero) lo = Math.min(0, lo);
    if (hi === lo) hi = lo + step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { lo, hi, ticks };
  }
  const y = (v: number, sc: { lo: number; hi: number }, h: number, top = 6, bot = 6) => top + ((sc.hi - v) / (sc.hi - sc.lo)) * (h - top - bot);
  const path = (vals: Array<number | undefined>, sc: { lo: number; hi: number }, h: number) => vals.map((v, k) => (v == null || !Number.isFinite(v) ? '' : `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v, sc, h).toFixed(1)}`)).join('');
  const band = (lo: Array<number | undefined>, hi: Array<number | undefined>, sc: { lo: number; hi: number }, h: number) => {
    if (lo.some((v) => v == null) || hi.some((v) => v == null)) return '';
    const up = hi.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v!, sc, h).toFixed(1)}`).join('');
    const down = lo.map((v, k) => [k, v] as const).reverse().map(([k, v]) => `L${x(k).toFixed(1)},${y(v!, sc, h).toFixed(1)}`).join('');
    return `${up}${down}Z`;
  };

  // Temperature: days and nights, each with its band, and the cold floor.
  const tDay = $derived(col((m) => T(m.tmax), months)), tNight = $derived(col((m) => T(m.tmin), months));
  const tDay10 = $derived(col((m) => T(m.tmax), p10)), tDay90 = $derived(col((m) => T(m.tmax), p90));
  const tN10 = $derived(col((m) => T(m.tmin), p10)), tN90 = $derived(col((m) => T(m.tmin), p90));
  const tSc = $derived(scale([...tDay90, ...tN10, ...(floorC != null ? [T(floorC)] : [])] as number[], units === 'us' ? 10 : 5));
  // Rain: bars of the median, a whisker for the spread; the axis from zero.
  const rMm = $derived(col((m) => m.precipMm, months)), r10 = $derived(col((m) => m.precipMm, p10)), r90 = $derived(col((m) => m.precipMm, p90));
  const rSc = $derived(scale(r90 as number[], (Math.max(...(r90 as number[])) > 200 ? 100 : Math.max(...(r90 as number[])) > 60 ? 20 : 10), true));
  // Light: DLI with its band.
  const hasDli = $derived(months.every((m) => m.dli != null));
  const lDli = $derived(col((m) => m.dli, months)), l10 = $derived(col((m) => m.dli, p10)), l90 = $derived(col((m) => m.dli, p90));
  const lSc = $derived(hasDli ? scale([...(l10 as number[]), ...(l90 as number[])], 10, true) : null);
  // Thin rows on fixed spans.
  const rows = $derived([
    { k: 'day', label: 'Day length', unit: 'h', v: Array.from({ length: 12 }, (_, k) => days[hm(k)]), lo: null as Array<number | undefined> | null, hi: null as Array<number | undefined> | null, span: SPANS.day, d: 1 },
    { k: 'rh', label: 'Humidity', unit: '%', v: col((m) => m.rh, months), lo: col((m) => m.rh, p10), hi: col((m) => m.rh, p90), span: SPANS.rh, d: 0 },
    { k: 'vpd', label: 'Dryness of the air', unit: 'kPa', v: col((m) => m.vpdKpa, months), lo: col((m) => m.vpdKpa, p10), hi: col((m) => m.vpdKpa, p90), span: SPANS.vpd, d: 2 },
    { k: 'wind', label: 'Wind', unit: 'm/s', v: col((m) => m.windMs, months), lo: col((m) => m.windMs, p10), hi: col((m) => m.windMs, p90), span: SPANS.wind, d: 1 }
  ].filter((r) => r.v.every((v) => v != null)));
  const clamp = (v: number, sp: readonly [number, number]) => Math.max(sp[0], Math.min(sp[1], v));
  const fmt = (v: number | undefined, d: number) => (v == null ? '–' : v.toFixed(d));
  const now10 = (lo: Array<number | undefined> | null, hi: Array<number | undefined> | null, d: number) => (lo && hi && lo[now] != null && hi[now] != null ? `${fmt(lo[now], d)}–${fmt(hi[now], d)}` : '');

  // The halves, in sentences: days, nights, how far apart, the rain against the year's, humidity, light, day length.
  const halves = $derived(yearHalves(months, year));
  const yearRain = $derived(months.reduce((a, m) => a + m.precipMm, 0));
  const names = (ms: number[], shiftBy: number) => ms.map((m) => MON[(m - 1 + 12 - shiftBy) % 12]);
  const run = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs[0]} to ${xs[xs.length - 1]}`);
  const half = (h: NonNullable<typeof halves>[number]) => {
    const habit = run(h.months.map((m) => MON[m - 1]));
    const yours = s ? run(names(h.months, s)) : null;
    const word = h.kind === 'wet' ? 'The wet months' : h.kind === 'dry' ? 'The dry months' : h.kind === 'warmer' ? 'The warmer six months' : 'The cooler six months';
    const dl = h.months.map((m) => days[m - 1]);
    return `${word}, ${habit} at the habitat${yours ? ` (${yours} in your months)` : ''}: days of ${tempN(h.dayC, units, 0)} ${tu} and nights of ${tempN(h.nightC, units, 0)} ${tu}, ${units === 'us' ? Math.round((h.dayC - h.nightC) * 1.8) : Math.round(h.dayC - h.nightC)} ${tu} apart; ${rain(h.rainMm, units)} of the year's ${rain(yearRain, units)}${h.rh != null ? `; humidity ${Math.round(h.rh)}%` : ''}${h.dli != null ? `; light ${Math.round(h.dli)} DLI` : ''}; days ${Math.min(...dl).toFixed(1)} to ${Math.max(...dl).toFixed(1)} h long.`;
  };

  // The table as shown, as CSV, made here in the browser.
  function csv() {
    const head = ['month', 'habitat month', `day ${tu}`, `day p10`, `day p90`, `night ${tu}`, 'night p10', 'night p90', `rain ${rainUnit(units)}`, 'rain p10', 'rain p90', 'DLI', 'RH %', 'VPD kPa', 'wind m/s', 'day length h'];
    const lines = Array.from({ length: 12 }, (_, k) => { const h = hm(k); const m = months[h], a = p10[h], b = p90[h]; return [MON[k], MON[h], T(m.tmax), T(a.tmax), T(b.tmax), T(m.tmin), T(a.tmin), T(b.tmin), m.precipMm, a.precipMm, b.precipMm, m.dli ?? '', m.rh ?? '', m.vpdKpa ?? '', m.windMs ?? '', days[h]].join(','); });
    const blob = new Blob([`# ${name}, the habitat's months (median, 10th and 90th percentile across the range); ${src}\n${head.join(',')}\n${lines.join('\n')}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-months.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
</script>

<section class="yp" aria-labelledby="yp-h" id="year-panel">
  <div class="yphead">
    <div>
      <h3 id="yp-h">The year at the habitat</h3>
      <p class="small muted">The median of each month across the range, 10th to 90th percentile shaded; {src}.</p>
    </div>
    <div class="yps" role="group" aria-label="Chart or table">
      <button type="button" aria-pressed={view === 'chart'} onclick={() => (view = 'chart')}>Chart</button>
      <button type="button" aria-pressed={view === 'table'} onclick={() => (view = 'table')}>Table</button>
    </div>
    {#if shift}
      <div class="yps" role="group" aria-label="Whose months">
        <button type="button" aria-pressed={mine} onclick={() => (mine = true)}>My months</button>
        <button type="button" aria-pressed={!mine} onclick={() => (mine = false)}>Its months</button>
      </div>
    {/if}
  </div>

  {#if view === 'chart'}
    <div class="charts" aria-hidden="true">
      <svg viewBox="0 0 {W} 30" class="axis">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="30" class="nowcol" />
        {#each MON as m, k (k)}<text x={x(k)} y="12" text-anchor="middle">{m}</text>{#if s}<text x={x(k)} y="26" text-anchor="middle" class="hab">{MON[hm(k)]}</text>{/if}{/each}
      </svg>
      <p class="chartname">Temperature, {tu} <span class="key"><span class="kd">— days</span> <span class="kn">- - nights</span>{floorC != null ? ' · dotted: the cold floor' : ''}</span> <span class="nowfig">now {tDay[now]} / {tNight[now]} {tu}</span></p>
      <svg viewBox="0 0 {W} 130">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="130" class="nowcol" />
        {#each tSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, tSc, 130)} y2={y(t, tSc, 130)} class="grid" /><text x={L - 6} y={y(t, tSc, 130) + 4} text-anchor="end">{t}</text>{/each}
        <path d={band(tDay10, tDay90, tSc, 130)} class="bandw" />
        <path d={band(tN10, tN90, tSc, 130)} class="bandc" />
        <path d={path(tDay, tSc, 130)} class="linew" />
        <path d={path(tNight, tSc, 130)} class="linec dashed" />
        {#if floorC != null}<line x1={L} x2={W - R} y1={y(T(floorC), tSc, 130)} y2={y(T(floorC), tSc, 130)} class="floor" />{/if}
      </svg>
      <p class="chartname">Rain, {rainUnit(units)} <span class="nowfig">now {rain(rMm[now] ?? 0, units)} ({rain(r10[now] ?? 0, units)}–{rain(r90[now] ?? 0, units)})</span></p>
      <svg viewBox="0 0 {W} 100">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="100" class="nowcol" />
        {#each rSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, rSc, 100)} y2={y(t, rSc, 100)} class="grid" /><text x={L - 6} y={y(t, rSc, 100) + 4} text-anchor="end">{units === 'us' ? (t / 25.4).toFixed(1) : t}</text>{/each}
        {#each rMm as v, k (k)}<rect x={x(k) - cw * 0.3} width={cw * 0.6} y={y(v ?? 0, rSc, 100)} height={Math.max(0, y(0, rSc, 100) - y(v ?? 0, rSc, 100))} class="barc" /><line x1={x(k)} x2={x(k)} y1={y(r90[k] ?? 0, rSc, 100)} y2={y(r10[k] ?? 0, rSc, 100)} class="whisk" />{/each}
      </svg>
      {#if lSc}
        <p class="chartname">Light, DLI under open sky <span class="nowfig">now {fmt(lDli[now], 0)} ({fmt(l10[now], 0)}–{fmt(l90[now], 0)})</span></p>
        <svg viewBox="0 0 {W} 90">
          <rect x={x(now) - cw / 2} y="0" width={cw} height="90" class="nowcol" />
          {#each lSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, lSc, 90)} y2={y(t, lSc, 90)} class="grid" /><text x={L - 6} y={y(t, lSc, 90) + 4} text-anchor="end">{t}</text>{/each}
          <path d={band(l10, l90, lSc, 90)} class="bandw" />
          <path d={path(lDli, lSc, 90)} class="linew" />
        </svg>
      {/if}
      {#each rows as r (r.k)}
        <p class="chartname thin">{r.label}, {r.unit} <span class="small muted">{fmt(Math.min(...(r.v as number[])), r.d)}–{fmt(Math.max(...(r.v as number[])), r.d)} over the year</span> <span class="nowfig">now {fmt(r.v[now], r.d)}{now10(r.lo, r.hi, r.d) ? ` (${now10(r.lo, r.hi, r.d)})` : ''}</span></p>
        <svg viewBox="0 0 {W} 38" class="thinsvg">
          <rect x={x(now) - cw / 2} y="0" width={cw} height="38" class="nowcol" />
          {#if r.lo && r.hi}<path d={band(r.lo.map((v) => clamp(v!, r.span)), r.hi.map((v) => clamp(v!, r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="bandc" />{/if}
          <path d={path(r.v.map((v) => clamp(v!, r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="linec" />
        </svg>
      {/each}
    </div>
  {/if}

  {#if view === 'table'}
    <p class="small"><button type="button" class="linkish" onclick={csv}>CSV</button> · <a href="/api/dossier/{dossierKey}">JSON</a></p>
  {/if}
  <!-- The table is the charts' text: shown with Table, and read by assistive technology always. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll-x" class:sr={view === 'chart'} tabindex={view === 'table' ? 0 : -1} role="region" aria-label="Habitat climate by month">
    <table class="wx bymonth">
      <thead><tr><th scope="col">Month</th>{#if s}<th scope="col">At the habitat</th>{/if}<th scope="col">Day {tu}</th><th scope="col">Night {tu}</th><th scope="col">Apart {tu}</th><th scope="col">Rain {rainUnit(units)}</th><th scope="col">DLI</th><th scope="col">RH %</th><th scope="col">VPD kPa</th><th scope="col">Wind m/s</th><th scope="col">Day h</th></tr></thead>
      <tbody>
        {#each MON as mo, k (k)}
          {@const h = hm(k)}
          <tr class:now={k === now}><td>{mo}</td>{#if s}<td>{MON[h]}</td>{/if}<td>{tempN(months[h].tmax, units, 0)}{#if spread(tempN(months[h].tmax, units, 0), tempN(p10[h].tmax, units, 0), tempN(p90[h].tmax, units, 0))}<span class="pp">{tempN(p10[h].tmax, units, 0)}–{tempN(p90[h].tmax, units, 0)}</span>{/if}</td><td>{tempN(months[h].tmin, units, 0)}{#if spread(tempN(months[h].tmin, units, 0), tempN(p10[h].tmin, units, 0), tempN(p90[h].tmin, units, 0))}<span class="pp">{tempN(p10[h].tmin, units, 0)}–{tempN(p90[h].tmin, units, 0)}</span>{/if}</td><td>{units === 'us' ? Math.round((months[h].tmax - months[h].tmin) * 1.8) : Math.round(months[h].tmax - months[h].tmin)}</td><td>{rain(months[h].precipMm, units).replace(/ (mm|in)$/, '')}{#if spread(rain(months[h].precipMm, units).replace(/ (mm|in)$/, ''), rain(p10[h].precipMm, units).replace(/ (mm|in)$/, ''), rain(p90[h].precipMm, units).replace(/ (mm|in)$/, ''))}<span class="pp">{rain(p10[h].precipMm, units).replace(/ (mm|in)$/, '')}–{rain(p90[h].precipMm, units).replace(/ (mm|in)$/, '')}</span>{/if}</td><td>{fmt(months[h].dli, 0)}{#if spread(fmt(months[h].dli, 0), fmt(p10[h].dli, 0), fmt(p90[h].dli, 0))}<span class="pp">{fmt(p10[h].dli, 0)}–{fmt(p90[h].dli, 0)}</span>{/if}</td><td>{fmt(months[h].rh, 0)}{#if spread(fmt(months[h].rh, 0), fmt(p10[h].rh, 0), fmt(p90[h].rh, 0))}<span class="pp">{fmt(p10[h].rh, 0)}–{fmt(p90[h].rh, 0)}</span>{/if}</td><td>{fmt(months[h].vpdKpa, 2)}{#if spread(fmt(months[h].vpdKpa, 2), fmt(p10[h].vpdKpa, 2), fmt(p90[h].vpdKpa, 2))}<span class="pp">{fmt(p10[h].vpdKpa, 2)}–{fmt(p90[h].vpdKpa, 2)}</span>{/if}</td><td>{fmt(months[h].windMs, 1)}{#if spread(fmt(months[h].windMs, 1), fmt(p10[h].windMs, 1), fmt(p90[h].windMs, 1))}<span class="pp">{fmt(p10[h].windMs, 1)}–{fmt(p90[h].windMs, 1)}</span>{/if}</td><td>{days[h].toFixed(1)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if halves}
    <div class="halves">{#each halves as h (h.kind)}<p class="small">{half(h)}</p>{/each}</div>
  {/if}
</section>

<style>
  .yp { margin: 8px 0 14px; }
  .yphead { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: flex-start; justify-content: space-between; }
  h3 { margin: 0; font-size: var(--fs-base); }
  .yps { display: inline-flex; gap: 4px; }
  .yps button { min-height: var(--tap); padding: 0 10px; border: 1px solid var(--rule); background: none; color: var(--ink2); font: inherit; font-size: var(--fs-sm); border-radius: var(--r-sm); cursor: pointer; }
  .yps button[aria-pressed='true'] { border-color: var(--ink); color: var(--ink); font-weight: 600; }
  .charts svg { display: block; width: 100%; height: auto; }
  .charts text { font-size: 11px; fill: var(--ink3); font-variant-numeric: tabular-nums; }
  .charts .hab { fill: var(--mut); font-size: 10px; }
  .chartname { margin: 10px 0 0; font-size: var(--fs-sm); color: var(--ink2); display: flex; flex-wrap: wrap; gap: 0 10px; }
  .chartname.thin { margin-top: 4px; }
  .nowfig { margin-left: auto; color: var(--ink); font-variant-numeric: tabular-nums; }
  .key { color: var(--ink3); }
  .grid { stroke: var(--rule2); }
  .nowcol { fill: var(--sunk); }
  .linew { fill: none; stroke: #a8702a; stroke-width: 2; }
  .linec { fill: none; stroke: #2d73a3; stroke-width: 2; }
  .dashed { stroke-dasharray: 5 3; }
  .bandw { fill: #a8702a; opacity: 0.16; }
  .bandc { fill: #2d73a3; opacity: 0.16; }
  .barc { fill: #2d73a3; opacity: 0.7; }
  .whisk { stroke: var(--ink2); stroke-width: 1; }
  .floor { stroke: var(--ink); stroke-width: 1.2; stroke-dasharray: 1.5 3; }
  /* The month table's layout, from the page's old "Figures by month" fold (round 118). */
  table.wx { margin-top: 6px; }
  table.bymonth { width: auto; min-width: min(100%, 640px); }
  @media print { .scroll-x { overflow: visible !important; } }
  .bymonth .pp { display: block; font-size: var(--fs-xs); color: var(--ink3); }
  .bymonth tr.now td { background: var(--sunk); }
  .halves { margin-top: 10px; }
  .halves p { margin: 4px 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
</style>

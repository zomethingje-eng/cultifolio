<script lang="ts">
  /**
   * The habitat in four figures at the top of a species page (round eighty-four on a phone; at every width since round 103,
   * the launch review's round 2, a: on a desktop the glance cards begin at y 753, under the first screen at 1024 × 768):
   * the cold figure, the year's rain, the open-sky light and the season, each with its qualification and source. The same
   * figures as the glance cards gave, by the same rules (`$core/sheet`); since round 106 the glance cards are gone and these
   * four are the page's, the rest in the Climate section's chart, its folds and its "How". A page with no habitat climate says so here, and why, in the Climate section's own words
   * (rule 2: pending and not checked are said as that, never as none).
   */
  import { temp, rain, tempN, tempUnit } from '$core/units';
  import { frostWording } from '$core/extremes';
  import { sixAnswers } from './six-answers';
  import type { Units } from '$core/units';
  import type { Year } from '$core/sheet';
  import { yearRain } from '$climate/year-rain';
  import { seasonWords } from './season';
  import Term from './Term.svelte';
  type M = { tmax: number; tmin: number; precipMm: number; dli?: number; rh?: number; vpdKpa?: number; windMs?: number };
  type Ex = { minP01: number; maxP99?: number; years?: number; frostDaysPerYear?: number; frostNights?: number; lows?: { from: number; t: Array<number | null> } };
  let {
    months,
    p10 = null,
    p90 = null,
    elevation = null,
    extremes = null,
    annualRain = null,
    year = null,
    readerLat = null,
    units,
    few = null,
    fewHref = null,
    href = '#s-climate',
    state = 'ok',
    why = '',
    records = null,
    cells = null,
    coarse = null
  }: {
    months: M[];
    /** Round 114 (SPECIES 18): the months' 10th and 90th percentiles across the range, and the typical cell's elevation sentence. */
    p10?: M[] | null;
    p90?: M[] | null;
    elevation?: string | null;
    extremes?: Ex | null;
    annualRain?: { p10?: number; p90?: number; p50?: number | null } | null;
    year?: Year | null;
    readerLat?: number | null;
    units: Units;
    few?: { records: number; cells: number } | null;
    /** Where the page says more of the few records (its climate notice); the mark links there (round eighty-five; P4). */
    fewHref?: string | null;
    /** Where the full figures are: the Climate section's chart and its folds (the glance cards until round 106). */
    href?: string;
    /** The habitat climate's state: its figures, or the state said as it is. */
    state?: 'ok' | 'none' | 'pending' | 'refused';
    /** For a state other than ok: the reason, a sentence of the page's own. */
    why?: string;
    /** The records and grid cells the figures are read from, said under them on a wider screen. */
    records?: number | null;
    cells?: number | null;
    /** Round 108 (`$core/coarse`): the climate rests on records placed only to within `km` km, each read as an area; the mark takes the few-records mark's place and links to the Climate section's notice, which says both. */
    coarse?: { km: number } | null;
  } = $props();
  const cold = $derived(months.length ? months.reduce((b, x, i) => (x.tmin < months[b].tmin ? i : b), 0) : 0);
  const yr = $derived(yearRain(months, annualRain));
  const dlis = $derived(months.map((x) => x.dli).filter((x): x is number => x != null));
  const season = $derived(year ? seasonWords(year, readerLat) : null);
  const ok = $derived(state === 'ok' && months.length > 0);
  const n = (x: number, one: string, many: string) => `${x.toLocaleString('en-GB')} ${x === 1 ? one : many}`;
  // Round 114 (SPECIES 18, c): the six answers, the same six in the same order on every page.
  const six = $derived(ok ? sixAnswers({ months, p10, p90, annualRain, extremes, elevation }) : null);
  const minus = (x: string) => x.replace(/(^|[\s–(])-(?=\d)/g, '$1−');
  const t1 = (c: number) => minus(temp(c, units, 1));
  const t0 = (c: number) => minus(`${tempN(c, units, 0)}`);
  const tRange = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : minus(`${tempN(a, units, 0)}–${tempN(b, units, 0)} ${tempUnit(units)}`));
  const gapRange = (a: number, b: number) => (units === 'us' ? `${Math.round(a * 1.8)}–${Math.round(b * 1.8)} °F` : `${Math.round(a)}–${Math.round(b)} °C`);
  const r2 = (x: number) => x.toFixed(2);
  const r1 = (x: number) => x.toFixed(1);
  /** A sparkline's path: twelve months (or the yearly lows) as a line, a gap where a value is missing. Decoration only. */
  function spark(v: number[], w = 72, h = 18): string {
    const ok2 = v.filter((x) => Number.isFinite(x));
    if (ok2.length < 2) return '';
    const lo = Math.min(...ok2), hi = Math.max(...ok2), dx = w / (v.length - 1);
    let d = '', pen = false;
    v.forEach((x, i) => { if (!Number.isFinite(x)) { pen = false; return; } const y = hi === lo ? h / 2 : h - 1 - ((x - lo) / (hi - lo)) * (h - 2); d += `${pen ? 'L' : 'M'}${(i * dx).toFixed(1)},${y.toFixed(1)}`; pen = true; });
    return d;
  }
  /** Bars for rain and the yearly lows: the heights from the lowest figure up. */
  function bars(v: number[], w = 72, h = 18): Array<{ x: number; y: number; w: number; h: number }> {
    const ok2 = v.filter((x) => Number.isFinite(x));
    if (!ok2.length) return [];
    const lo = Math.min(0, ...ok2), hi = Math.max(...ok2), bw = w / v.length;
    return v.flatMap((x, i) => (Number.isFinite(x) ? [{ x: i * bw + bw * 0.15, w: bw * 0.7, y: h - Math.max(1, ((x - lo) / (hi - lo || 1)) * h), h: Math.max(1, ((x - lo) / (hi - lo || 1)) * h) }] : []));
  }
</script>

<section class="hline" class:hstate={!ok} aria-labelledby="hline-t">
  <p class="hhead" class:withfew={!!few || !!coarse}><span id="hline-t">Habitat<span class="ins">{' '}in short</span></span>{#if ok && coarse}<a class="few" id="coarse-line" href="#coarse-records">placed to {coarse.km} km</a>{:else if ok && few}{#if fewHref}<a class="few" id="few-records-line" href={fewHref}>from {few.records} record{few.records === 1 ? '' : 's'}</a>{:else}<span class="few">from {few.records} record{few.records === 1 ? '' : 's'}</span>{/if}{/if}<a class="figs" href={ok ? href : '#s-climate'}>{ok ? 'Figures' : 'Climate'} ›</a></p>
  {#if ok && six}
    <!-- Round 114 (SPECIES 18, c): six answers, the same six in the same order on every page: Cold, Heat, Rain, Light, Air,
         Ground. Each a figure, a line or two, its source; the sparkline is decoration, the figures are in the Climate
         section's table. -->
    <dl class="six">
      <div>
        <dt>Cold</dt>
        <dd>
          {#if six.cold.floor != null}<b>{t1(six.cold.floor)}</b><span><Term k="coldFloor" />: 1 night in 100 is colder</span>{:else}<b>{t1(six.cold.coolest.mid)}</b><span>coldest month's mean nightly low, not a floor</span>{/if}
          {#if six.cold.floor != null && tRange(six.cold.coolest.p10, six.cold.coolest.p90)}<span>coolest month's nights {tRange(six.cold.coolest.p10, six.cold.coolest.p90)}</span>{/if}
          {#if six.cold.lows}<span>yearly lows {tRange(six.cold.lows.min, six.cold.lows.max)}{extremes?.frostDaysPerYear != null && extremes.years != null ? `, ${frostWording({ frostDaysPerYear: extremes.frostDaysPerYear, frostNights: extremes.frostNights, years: extremes.years })}` : ''}</span>{/if}
          <i>{six.cold.floor != null ? 'NASA POWER' : 'CHELSA'}</i>
          {#if six.cold.lows}<svg class="sp" viewBox="0 0 72 18" aria-hidden="true">{#each bars(six.spark.cold) as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height={r.h} />{/each}</svg>{/if}
        </dd>
      </div>
      <div>
        <dt>Heat</dt>
        <dd>
          <b>{t1(six.heat.warmest.mid)}</b><span>warmest month's mean daily high{tRange(six.heat.warmest.p10, six.heat.warmest.p90) ? `, ${tRange(six.heat.warmest.p10, six.heat.warmest.p90)} across the range` : ''}</span>
          {#if six.heat.p99 != null}<span>hottest day in 100: {t1(six.heat.p99)}</span>{/if}
          <i>CHELSA{six.heat.p99 != null ? ', NASA POWER' : ''}</i>
          <svg class="sp" viewBox="0 0 72 18" aria-hidden="true"><path d={spark(six.spark.heat)} /></svg>
        </dd>
      </div>
      <div>
        <dt>Rain</dt>
        <dd>
          <b>{rain(yr.mm, units)}</b><span>a year, {yr.cells ? 'median across the range' : 'monthly medians added'}{six.rain.p10 != null && six.rain.p90 != null ? `, ${rain(six.rain.p10, units)}–${rain(six.rain.p90, units)}` : ''}</span>
          {#if season}<span>{season.head}, {season.months}{six.rain.dryMonths ? `; ${six.rain.dryMonths} month${six.rain.dryMonths === 1 ? '' : 's'} under 5 mm` : ''}</span>{:else if six.rain.dryMonths}<span>{six.rain.dryMonths} month{six.rain.dryMonths === 1 ? '' : 's'} under 5 mm</span>{/if}
          {#if six.rain.fog}<span>Fog and dew are not measured.</span>{/if}
          <i>CHELSA</i>
          <svg class="sp" viewBox="0 0 72 18" aria-hidden="true">{#each bars(six.spark.rain) as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height={r.h} />{/each}</svg>
        </dd>
      </div>
      <div>
        <dt>Light</dt>
        <dd>
          {#if six.light}<b>{six.light.min.toFixed(0)}–{six.light.max.toFixed(0)} <Term k="dli" /></b><span>lowest to highest month, under open sky</span>{:else}<b>–</b><span>not in this page's figures</span>{/if}
          <i>CHELSA</i>
          {#if six.light}<svg class="sp" viewBox="0 0 72 18" aria-hidden="true"><path d={spark(six.spark.light)} /></svg>{/if}
        </dd>
      </div>
      <div>
        <dt>Air</dt>
        <dd>
          {#if six.air.rh}<b>{six.air.rh.min.toFixed(0)}–{six.air.rh.max.toFixed(0)}%</b><span>humidity, lowest to highest month</span>{:else}<b>–</b><span>humidity not in this page's figures</span>{/if}
          {#if six.air.vpd || six.air.wind}<span>{six.air.vpd ? `dryness ${r2(six.air.vpd.min)}–${r2(six.air.vpd.max)} kPa` : ''}{six.air.vpd && six.air.wind ? ', ' : ''}{six.air.wind ? `wind ${r1(six.air.wind.min)}–${r1(six.air.wind.max)} m/s` : ''}</span>{/if}
          <span>nights {gapRange(six.air.gap.min, six.air.gap.max)} cooler than days</span>
          <i>CHELSA</i>
          {#if six.air.rh}<svg class="sp" viewBox="0 0 72 18" aria-hidden="true"><path d={spark(six.spark.air)} /></svg>{/if}
        </dd>
      </div>
      <div>
        <dt>Ground</dt>
        <dd>
          {#if six.ground.m != null}<b>{units === 'us' ? `${Math.round(six.ground.m * 3.28084).toLocaleString('en-GB')} ft` : `${six.ground.m.toLocaleString('en-GB')} m`}</b><span>elevation of the typical cell</span>{:else}<b>–</b><span>elevation not in this page's record</span>{/if}
          <span>Range across the cells, and soil pH and texture: not read yet</span>
          <i>ETOPO 2022</i>
        </dd>
      </div>
    </dl>
    {#if records && cells}<p class="hfrom">{#if coarse}The wild habitat&rsquo;s figures, from {n(records, 'record', 'records')} placed only to within {coarse.km} km, in {n(cells, 'area', 'areas')} <span class="hsep">·</span> <a href="/about/how#coarse">How</a>{:else}The wild habitat&rsquo;s figures, from {n(records, 'record', 'records')} in {n(cells, 'grid cell', 'grid cells')} <span class="hsep">·</span> <a href="/about/how#climate">How</a>{/if}</p>{/if}
  {:else}
    <!-- Round 114: the six answers' row is kept, a dash in each slot, with the page's reason (rule 2: never "none" or 0). -->
    <dl class="six dashes" aria-hidden="true">{#each ['Cold', 'Heat', 'Rain', 'Light', 'Air', 'Ground'] as k (k)}<div><dt>{k}</dt><dd><b>–</b></dd></div>{/each}</dl>
    <p class="hnone" id="hline-state"><b>{state === 'pending' ? 'Habitat climate pending.' : state === 'refused' ? 'Habitat climate not checked.' : 'No habitat climate.'}</b>{why ? ` ${why}` : ''}</p>
  {/if}
</section>

<style>
  /* In the name card, after the one primary action and before the secondary ones, set apart by a rule (round eighty-five;
     outside review B's 3, P3); at every width since round 103. */
  .hline { display: block; flex: 1 1 100%; margin: 0; padding: 7px 0 0; border-top: 1px solid var(--rule); }
  .hhead { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; margin: 0 0 2px; font-size: var(--fs-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .hhead > * { white-space: nowrap; }
  /* The head on one line at 320 px with the few-records mark too (round eighty-six; review P's P2, P3): "Habitat in short",
     the mark and "Figures ›" were 300 px of a 256 px line, and "Figures ›" wrapped under the mark, which cost the first
     screen a line and put the two links' finger margins over each other. Under 360 px, with the mark, the head says
     "Habitat" and "in short" only to a screen reader. */
  @media (max-width: 359.98px) {
    .hhead.withfew .ins { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  }
  .hhead a.figs { margin-left: auto; letter-spacing: 0.02em; text-transform: none; font-weight: 600; font-size: var(--fs-sm); }
  .few { padding: 0 7px; border: 1.5px dashed var(--warm); border-radius: var(--r); color: var(--warm-ink); letter-spacing: 0.02em; text-transform: none; }
  a.few { text-decoration: none; }
  /* "Figures ›" and the few-records mark are controls on their own line: each takes a finger's 44 by 44 px, as an invisible
     margin so the line keeps its height (round eighty-five; P4, outside review B's 4: "Figures ›" was 51 by 19 px). Side by
     side the margins do not meet, each as wide as its link. Where the line still wraps (large text), the lines are set far
     enough apart that the margins of one line do not reach into the next: at 320 px a tap on the lower half of "from 3
     records" opened "Figures" (round eighty-six; review P's P3). */
  .hhead a { position: relative; }
  @media (pointer: coarse) {
    .hhead { row-gap: max(2px, calc(var(--tap) - 1.6em)); }
    .hhead a::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, var(--tap)); height: var(--tap); transform: translate(-50%, -50%); }
  }
  dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; margin: 0; }
  dl > div { min-width: 0; padding: 2px 0 3px; }
  dt { font-size: var(--fs-xs); color: var(--ink3); letter-spacing: 0.02em; }
  dd { margin: 0; line-height: 1.3; overflow-wrap: anywhere; }
  dd b { display: block; font-family: var(--ui); font-variant-numeric: var(--figs); font-size: var(--fs-md); color: var(--ink); font-weight: 600; }
  dd span { display: block; font-size: var(--fs-xs); color: var(--ink3); }
  /* The source in plain muted words after the figure (round eighty-seven; the review of stage 2's pages, 8: a bordered tag
     was the older look's), set a space apart so it reads as the figure's source and not as a word of the line. */
  dd i { font-style: normal; letter-spacing: 0; color: var(--mut); margin-left: 4px; }
  .hfrom { display: none; margin: 4px 0 0; font-size: var(--fs-xs); color: var(--ink3); }
  .hsep { color: var(--mut); }
  /* Round 114: six slots, two across on a phone, three on a tablet, one row from 1100 px. */
  dl.six { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; }
  dl.six dd span { margin-top: 1px; }
  dl.six dd i { display: block; margin: 2px 0 0; }
  .sp { display: block; width: 72px; height: 18px; margin-top: 3px; fill: none; stroke: var(--mut); stroke-width: 1.2; }
  .sp rect { fill: var(--mut); stroke: none; opacity: 0.55; }
  dl.dashes dd b { color: var(--mut); }
  /* On a phone the six stay on the first screen (the owner's decision 3 of round eighty-four): label, figure and source;
     the lines that qualify them and the sparklines from 641 px, every figure also in the Climate section. */
  @media (max-width: 640px) {
    dl.six { row-gap: 0; }
    dl.six dd span, dl.six .sp { display: none; }
    dl.six dd i { display: inline; margin-left: 4px; }
    dl.six dd b { display: inline; }
  }
  .hnone { margin: 2px 0 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink2); }
  .hnone b { color: var(--ink); font-weight: 600; }
  /* A wider screen (round 103): the four in a row, each figure large over its line, and the records under them. */
  @media (min-width: 641px) {
    .hline { padding-top: 10px; }
    dl { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 16px; }
    dl.six { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 16px; }
    dd b { font-size: var(--fs-2xl); line-height: 1.15; margin: 1px 0 2px; }
    .hfrom { display: block; }
  }
  @media (min-width: 1100px) { dl.six { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
</style>

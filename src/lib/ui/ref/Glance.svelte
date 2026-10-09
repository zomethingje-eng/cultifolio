<script lang="ts">
  /**
   * The figures a grower reads first, each with its source as a small tag, and the season in the reader's own months. Each
   * label is the figure's own name ("Cold floor (1 night in 100)", "Warmest month, mean daily high", "Rain a year (sum of
   * monthly medians)", "Open-sky light"), never a reading of it (round sixty-two; visitor-words 3, outside review A3: "mean
   * day" read as a daily mean, and the year's rain is the twelve monthly medians added, not a median year's total): "Coldest nights in the wild" over a 1st-percentile night beside a lower record, and
   * "Warmest days" over a month's mean day 7 °C under the 99th-percentile day, said more than their figures (round
   * sixty-one; visitor 1). The record low is printed beside the floor. The front page shows the same row for one species.
   */
  import { units } from '$lib/ui/units.svelte';
  import { tempN, tempUnit, rainN, rainUnit, ruleRain } from '$core/units';
  import type { Year } from '$core/sheet';
  import { seasonStrip } from './season';
  import { MON3 } from '$core/months';
  import { tiedMonths, monthNames, extremesWhyTag } from '$core/sheet';
  import { yearRain } from '$climate/year-rain';
  type M = { tmax: number; tmin: number; precipMm: number; dli?: number };
  type Ex = { minP01: number; minAbs: number; years: number } | null;
  let {
    months,
    extremes = null,
    extremesStatus = null,
    year = null,
    seasonLead = null,
    seasonRule = '',
    readerLat = null,
    readerFrom = null,
    toggle = true,
    chartHref = null,
    season = true,
    annualRain = null
  }: {
    months: M[];
    extremes?: Ex;
    extremesStatus?: string | null;
    year?: Year | null;
    /** The rain or temperature rule's reading in plain words, the sheet's own sentence for this year. */
    seasonLead?: string | null;
    seasonRule?: string;
    readerLat?: number | null;
    /** Where the reader's hemisphere came from: their site, their places, or nowhere (then north, and a way to set it). */
    readerFrom?: 'site' | 'places' | null;
    /** The °C | °F switch in the row's head. */
    toggle?: boolean;
    /** Where the chart is, for the line saying it is drawn in the habitat's months. */
    chartHref?: string | null;
    /** The season card after the four figures; the front page shows the four alone (round sixty-one; decision 9). */
    season?: boolean;
    /** The dossier's per-cell yearly totals; with their median the rain card shows it (round sixty-three; REVIEW-TRIAGE-61). */
    annualRain?: { p50?: number | null } | null;
  } = $props();
  const u = $derived(units.current);
  const idx = (f: (x: M) => number, hi: boolean) => months.reduce((b, x, i) => ((hi ? f(x) > f(months[b]) : f(x) < f(months[b])) ? i : b), 0);
  const hot = $derived(idx((x) => x.tmax, true));
  const cold = $derived(idx((x) => x.tmin, false));
  // Every month that ties as printed, named (round sixty-one; visitor 5: "Jan mean day" of a year whose February was as warm).
  const hotAt = $derived(monthNames(tiedMonths(months.map((x) => x.tmax), true, (v) => tempN(v, u)), 'short'));
  const coldAt = $derived(monthNames(tiedMonths(months.map((x) => x.tmin), false, (v) => tempN(v, u, 1)), 'short'));
  // The median of the cells' own years when the dossier has it, else the monthly medians added, each under its own name.
  const yr = $derived(yearRain(months, annualRain));
  const rainYear = $derived(yr.mm);
  // The rule's own count: months of 25 mm or more (`>= 25`), said as such.
  const wetMonths = $derived(months.filter((x) => x.precipMm >= 25).length);
  const dlis = $derived(months.map((x) => x.dli).filter((x): x is number => x != null));
  const exWhy = $derived(extremesWhyTag(extremesStatus));
  // Each gauge's full width, said beside it and in its text alternative: the bars were drawn on scales no reader was
  // told (round sixty-two; the self-review's N10, visitor-words 17). A year's rain over 1,200 mm and a month over 70 DLI
  // fill the bar.
  const RAIN_FULL = 1200;
  const DLI_FULL = 70;

  /* ---- the season, in the reader's months: built only from the rules' outputs (the year the sheet read) ---- */
  const strip = $derived(seasonStrip(year, months, readerLat));
</script>

<div class="ghead">
  <!-- "Habitat figures", not "In the wild": the floor is one reanalysis cell at a typical spot and the rest are medians
       across cells, which "in the wild" said more than (round sixty-two; the words review's 1, outside review A3). -->
  <span class="gt">Habitat figures</span>
  {#if toggle}
    <!-- Both units shown, the current one marked: a lone "°F" beside a figure in °C read as a contradiction (round sixty; visitor 13). -->
    <div class="useg" role="group" aria-label="Units">
      <button type="button" class:on={u !== 'us'} aria-pressed={u !== 'us'} aria-label="°C, Celsius and millimetres" onclick={() => units.set('metric')}>°C</button><span aria-hidden="true">|</span><button type="button" class:on={u === 'us'} aria-pressed={u === 'us'} aria-label="°F, Fahrenheit and inches" onclick={() => units.set('us')}>°F</button>
    </div>
  {/if}
</div>
<!-- Each card's label is a heading, so the four read as four figures and not one run of text (round sixty-one; a11y 16). -->
<div class="cards gcards">
  <div class="card cold">
    {#if extremes}
      <div class="lab" role="heading" aria-level="3">Cold floor (1 night in 100)</div>
      <div class="val">{tempN(extremes.minP01, u, 1)}<span class="u"> {tempUnit(u)}</span></div>
      <div class="sub">Record low {tempN(extremes.minAbs, u, 1)} {tempUnit(u)} in {extremes.years} years, at a typical spot in the range <span class="src">NASA POWER</span></div>
    {:else}
      <div class="lab" role="heading" aria-level="3">Coldest month, mean nightly low</div>
      <div class="val">{tempN(months[cold].tmin, u, 1)}<span class="u"> {tempUnit(u)}</span></div>
      <div class="sub">{coldAt} at the habitat, not a floor; {exWhy} <span class="src">CHELSA</span></div>
    {/if}
  </div>
  <div class="card"><div class="lab" role="heading" aria-level="3">Warmest month, mean daily high</div><div class="val">{tempN(months[hot].tmax, u)}<span class="u"> {tempUnit(u)}</span></div><div class="sub">{hotAt} at the habitat <span class="src">CHELSA</span></div></div>
  <div class="card"><div class="lab" role="heading" aria-level="3">{yr.cells ? 'Rain a year (median across the range)' : 'Rain a year (sum of monthly medians)'}</div><div class="val">{rainN(rainYear, u)}<span class="u"> {rainUnit(u)}</span></div><div class="gauge" role="img" aria-label="{rainN(rainYear, u)} {rainUnit(u)} on a bar from 0 to {rainN(RAIN_FULL, u)} {rainUnit(u)}"><i class="c" style="width:{Math.min(100, (rainYear / RAIN_FULL) * 100)}%"></i></div><div class="gscale" aria-hidden="true">bar 0 to {rainN(RAIN_FULL, u)} {rainUnit(u)}</div><div class="sub">{wetMonths === 0 ? `No month of ${ruleRain(25, u)} or more` : `${wetMonths} month${wetMonths === 1 ? '' : 's'} of ${ruleRain(25, u)} or more`} <span class="src">CHELSA</span></div></div>
  {#if dlis.length}<div class="card"><div class="lab" role="heading" aria-level="3">Open-sky light</div><div class="val">{Math.min(...dlis).toFixed(0)}–{Math.max(...dlis).toFixed(0)}<span class="u"> DLI</span></div><div class="gauge" role="img" aria-label="Highest month {Math.max(...dlis).toFixed(0)} DLI on a bar from 0 to {DLI_FULL} DLI"><i class="w" style="width:{Math.min(100, (Math.max(...dlis) / DLI_FULL) * 100)}%"></i></div><div class="gscale" aria-hidden="true">bar 0 to {DLI_FULL} DLI</div><div class="sub">Lowest to highest month (<a href="/about/how#glossary">DLI</a>) <span class="src">CHELSA</span></div></div>{/if}
  {#if season && year && strip}
    <div class="card season">
      <div class="lab" role="heading" aria-level="3">The year in {strip.calendar}</div>
      <!-- Twelve cells, January first, in the reader's months: the rule's months shaded, the months under 5 mm marked. -->
      <ol class="strip" aria-label="Months, January to December{strip.shadeIs ? `; shaded: ${strip.shadeIs}` : ''}">
        {#each strip.cells as c (c.m)}<li class:on={c.on} class:dry={c.dry}><span class="mo">{MON3[c.m - 1][0]}<span class="rest">{MON3[c.m - 1].slice(1)}</span></span><span class="visually-hidden">{c.on && strip.shadeIs ? `, ${strip.shadeIs}` : ''}{c.dry ? `, under ${ruleRain(5, u)} of rain` : ''}</span></li>{/each}
      </ol>
      <div class="sub key">{#if strip.shadeIs}<span><i class="sw on"></i>{strip.shadeIs}</span>{/if}{#if strip.cells.some((c) => c.dry)}<span><i class="sw dry"></i>under {ruleRain(5, u)} of rain</span>{/if}</div>
      {#if seasonLead}<div class="sub lead">{seasonLead} <span class="src">{seasonRule}</span></div>{/if}
      <div class="sub hemi">{#if !year.shiftable}Not shifted: the shift rule does not apply to this habitat.{:else if readerFrom === 'site'}Your hemisphere from your site.{:else if readerFrom === 'places'}Your hemisphere from your places.{:else}Northern hemisphere unless you <a href="/settings#site">set your site</a>.{/if}{#if chartHref}{' '}<a href={chartHref}>The chart</a> is in the habitat's months.{/if}</div>
    </div>
  {/if}
</div>

<style>
  .ghead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 6px; flex-wrap: wrap; }
  .gt { font-size: var(--fs-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .useg { display: inline-flex; align-items: center; gap: 0; border: 1px solid var(--field-edge); border-radius: 999px; overflow: hidden; background: var(--card); color: var(--ink3); }
  .useg button { min-width: var(--tap); min-height: var(--tap); padding: 0 10px; border: 0; background: none; color: var(--ink2); font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600; cursor: pointer; }
  .useg button.on { background: var(--accent); color: var(--on-accent, #fff); }
  .useg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
  @media (forced-colors: active) { .useg button.on { forced-color-adjust: none; background: Highlight; color: HighlightText; } }
  /* Cards that shrink with the column: at 320 px and 200% text two fixed columns pushed the page sideways (round sixty; a11y 5). */
  .gcards { grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); margin: 0 0 12px; }
  .gcards .card { min-width: 0; overflow-wrap: anywhere; }
  .src { display: inline-block; font-size: var(--fs-xs); letter-spacing: 0.04em; color: var(--ink3); border: 1px solid var(--rule); border-radius: var(--r-sm); padding: 0 5px; margin-left: 2px; max-width: 100%; overflow-wrap: anywhere; }
  .season { grid-column: 1 / -1; }
  .strip { list-style: none; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 3px; margin: 10px 0 6px; padding: 0; }
  .strip li { position: relative; text-align: center; padding: 8px 0 10px; border-radius: var(--r-sm); background: var(--sunk); font-size: var(--fs-xs); color: var(--ink2); min-width: 0; }
  .strip li.on { background: color-mix(in srgb, var(--cool) 30%, var(--card)); color: var(--ink); font-weight: 700; }
  .strip li.dry::after { content: ''; position: absolute; left: 50%; bottom: 3px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%; background: var(--warm); }
  @media (max-width: 520px) { .strip .rest { display: none; } }
  .key { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--fs-sm); }
  .key span { display: inline-flex; align-items: center; gap: 6px; }
  .sw { display: inline-block; width: 12px; height: 10px; border-radius: 2px; }
  .sw.on { background: color-mix(in srgb, var(--cool) 30%, var(--card)); border: 1px solid var(--rule2); }
  .sw.dry { width: 6px; height: 6px; border-radius: 50%; background: var(--warm); }
  .gscale { margin: -6px 0 6px; font-size: var(--fs-xs); color: var(--ink3); }
  .lead { margin-top: 6px; color: var(--ink); }
  .hemi { margin-top: 4px; font-size: var(--fs-sm); color: var(--ink3); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 640px) { .gcards .card .sub { font-size: var(--fs-sm); line-height: 1.35; } }
</style>

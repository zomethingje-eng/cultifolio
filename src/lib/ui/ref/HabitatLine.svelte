<script lang="ts">
  /**
   * The habitat in four figures on a phone's first screen (round eighty-four; the owner's decision 3, outside review B's 3):
   * the cold figure, the year's rain, the open-sky light and the season, each with its qualification and source, above the
   * photograph strip. The same figures as the glance cards further down, by the same rules (`Glance.svelte`, `$core/sheet`),
   * which stay where they are with their explanations; on a wider screen the cards are on the first screen and this is not shown.
   */
  import { temp, rain } from '$core/units';
  import type { Units } from '$core/units';
  import type { Year } from '$core/sheet';
  import { yearRain } from '$climate/year-rain';
  import { seasonWords } from './season';
  type M = { tmax: number; tmin: number; precipMm: number; dli?: number };
  let {
    months,
    extremes = null,
    annualRain = null,
    year = null,
    readerLat = null,
    units,
    few = null,
    fewHref = null,
    href = '#s-glance'
  }: {
    months: M[];
    extremes?: { minP01: number } | null;
    annualRain?: { p50?: number | null } | null;
    year?: Year | null;
    readerLat?: number | null;
    units: Units;
    few?: { records: number; cells: number } | null;
    /** Where the page says more of the few records (its climate notice); the mark links there (round eighty-five; P4). */
    fewHref?: string | null;
    /** Where the full cards are. */
    href?: string;
  } = $props();
  const cold = $derived(months.reduce((b, x, i) => (x.tmin < months[b].tmin ? i : b), 0));
  const yr = $derived(yearRain(months, annualRain));
  const dlis = $derived(months.map((x) => x.dli).filter((x): x is number => x != null));
  const season = $derived(year ? seasonWords(year, readerLat) : null);
</script>

<section class="hline" aria-labelledby="hline-t">
  <p class="hhead" class:withfew={!!few}><span id="hline-t">Habitat<span class="ins">{' '}in short</span></span>{#if few}{#if fewHref}<a class="few" id="few-records-line" href={fewHref}>from {few.records} record{few.records === 1 ? '' : 's'}</a>{:else}<span class="few">from {few.records} record{few.records === 1 ? '' : 's'}</span>{/if}{/if}<a class="figs" href={href}>Figures ›</a></p>
  <dl>
    {#if extremes}
      <div><dt>Cold floor</dt><dd><b>{temp(extremes.minP01, units, 1)}</b> <span>1 night in 100 colder <i>NASA POWER</i></span></dd></div>
    {:else if months.length}
      <div><dt>Coldest month</dt><dd><b>{temp(months[cold].tmin, units, 1)}</b> <span>mean nightly low, not a floor <i>CHELSA</i></span></dd></div>
    {/if}
    <div><dt>Rain</dt><dd><b>{rain(yr.mm, units)}</b> <span>a year, {yr.cells ? 'median across the range' : 'monthly medians added'} <i>CHELSA</i></span></dd></div>
    {#if dlis.length}<div><dt>Open-sky light</dt><dd><b>{Math.min(...dlis).toFixed(0)}–{Math.max(...dlis).toFixed(0)} DLI</b> <span>lowest to highest month <i>CHELSA</i></span></dd></div>{/if}
    {#if season}<div><dt>Season</dt><dd><b class="w">{season.head}</b> <span>{season.months} <i>{season.rule}</i></span></dd></div>{/if}
  </dl>
</section>

<style>
  /* A phone's alone: from 641 px the glance cards are on the first screen. In the name card, after the one primary action
     and before the secondary ones, set apart by a rule (round eighty-five; outside review B's 3, P3). */
  .hline { display: none; }
  @media (max-width: 640px) {
    .hline { display: block; flex: 1 1 100%; margin: 0; padding: 7px 0 0; border-top: 1px solid var(--rule); }
  }
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
  .few { padding: 0 7px; border: 1.5px dashed var(--warm); border-radius: 999px; color: var(--warm-ink); letter-spacing: 0.02em; text-transform: none; }
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
  dd b { display: block; font-family: var(--mono); font-size: var(--fs-md); color: var(--ink); font-weight: 600; }
  dd b.w { font-family: var(--ui); font-weight: 700; }
  dd span { display: block; font-size: var(--fs-xs); color: var(--ink3); }
  /* The source as the cards' small tag, so it reads as the figure's source and not as a word of the line. */
  dd i { display: inline-block; font-style: normal; letter-spacing: 0.04em; border: 1px solid var(--rule); border-radius: var(--r-sm); padding: 0 4px; margin-left: 2px; line-height: 1.35; }
</style>

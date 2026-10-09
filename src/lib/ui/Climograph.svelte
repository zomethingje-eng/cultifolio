<script lang="ts">
  import { climograph, type ClimoInput } from '$climate/climograph';
  import { units } from '$lib/ui/units.svelte';
  import { tempUnit, rainUnit, dryLabel, temp, rain } from '$core/units';
  import { tiedMonths, monthNames } from '$core/sheet';
  /** `name`: the species, for the figure's title (round fifty-eight; the accessibility review). */
  /** `south`: the habitat's hemisphere, so the chart says whose months it draws (round sixty; visitor 3); unset, it says "habitat months" alone. */
  let { climate, id = 'climograph', name, south = null }: { climate: ClimoInput; id?: string; name?: string; south?: boolean | null } = $props();
  const calendar = $derived(`Habitat months${south == null ? '' : `, ${south ? 'southern' : 'northern'} hemisphere`}`);
  /**
   * The figure in one sentence, for the description a screen reader gives with the title: the warmest month's mean daily
   * high, the coldest month's mean nightly low and the year's rain, from the figures drawn, and whose figures they are; the longer
   * account follows it (round fifty-eight; the accessibility review; the source, round fifty-nine). The year's rain is the
   * twelve monthly medians added, said so before "Medians" (round sixty-two; the words review's 5b).
   */
  const summary = $derived.by(() => {
    const m = climate.months;
    if (!m.length) return '';
    const hot = m.reduce((b, x, i) => (x.tmax > m[b].tmax ? i : b), 0);
    const cold = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
    const year = m.reduce((a, x) => a + x.precipMm, 0);
    // Every month that ties, as printed; the coldest night judged and printed at one decimal, as the glance card does
    // (round sixty-one; visitor 5; round sixty-two, outside review A35: at no decimals it named months the card did not).
    const fmt = (v: number) => temp(v, units.current), fmt1 = (v: number) => temp(v, units.current, 1);
    const hots = tiedMonths(m.map((x) => x.tmax), true, fmt), colds = tiedMonths(m.map((x) => x.tmin), false, fmt1);
    return `Warmest month${hots.length > 1 ? 's' : ''} ${monthNames(hots)}, mean daily high ${fmt(m[hot].tmax)}; coldest month${colds.length > 1 ? 's' : ''} ${monthNames(colds)}, mean nightly low ${fmt1(m[cold].tmin)}; ${rain(year, units.current)} of rain a year (the twelve monthly medians added). Medians across the range, from CHELSA${climate.extremes ? `; the extremes at the edge from NASA POWER` : ''}. ${calendar}.`;
  });
  // Drawn at the width it is shown at, so labels keep their size on a phone instead of shrinking with the viewBox.
  let shown = $state(0);
  const g = $derived(climograph(climate, shown >= 340 ? Math.min(shown - 20, 960) : 720, units.current));
  const range = (lo: number, hi: number) => (hi - lo < 0.5 ? lo.toFixed(0) : `${lo.toFixed(0)}–${hi.toFixed(0)}`);
  const rb = $derived(g.rain.top + g.rain.height);
</script>

<!-- The figure is named by the chart's title: named by its caption, the key, a screen reader read the whole key as the
     figure's name and then again in place (round sixty-three; U4). -->
<figure class="climo" aria-labelledby="{id}-t" bind:clientWidth={shown}>
  <!-- Whose calendar: the chart is in the habitat's months, the season card in the reader's (round sixty; visitor 3, words 14). -->
  <p class="cal">{calendar}</p>
  <!-- The title names the species, and the description is one sentence of the figures with the longer account after it
       (round fifty-eight; the accessibility review). -->
  <svg viewBox="0 0 {g.width} {g.height}" role="img" aria-labelledby="{id}-t" aria-describedby="{id}-d {id}-more" preserveAspectRatio="xMidYMid meet">
    <title id="{id}-t">{name ? `Habitat climate of ${name} through the year` : 'Habitat climate through the year'}</title>
    <desc id="{id}-d">{summary}</desc>

    <!-- temperature panel -->
    <rect class="quarter" x={g.temp.coldQuarter.x} y={g.temp.top} width={g.temp.coldQuarter.w} height={g.temp.height} />
    {#if g.temp.coldQuarter.wraps}<rect class="quarter" x={g.temp.coldQuarter.x2} y={g.temp.top} width={g.temp.coldQuarter.w2} height={g.temp.height} />{/if}
    {#each g.temp.ticks as t}
      <line class="grid" x1={g.left} x2={g.left + g.plotW} y1={t.y} y2={t.y} />
      <text class="tick" x={g.left - 6} y={t.y + 3.5}>{t.label}</text>
    {/each}
    {#if g.temp.zeroY != null}<line class="zero" x1={g.left} x2={g.left + g.plotW} y1={g.temp.zeroY} y2={g.temp.zeroY} /><text class="zerolab" x={g.left + g.plotW - 2} y={g.temp.zeroY - 4}>frost</text>{/if}
    {#if g.temp.dayBand}<path class="band day" d={g.temp.dayBand} />{/if}
    {#if g.temp.nightBand}<path class="band night" d={g.temp.nightBand} />{/if}
    <path class="line day" d={g.temp.dayLine} />
    <path class="line night" d={g.temp.nightLine} />
    <!-- undated extremes: a mark at the right edge at the right height, in no month -->
    {#if g.temp.maxP99}
      <line class="ext" x1={g.left + g.plotW - 10} x2={g.left + g.plotW} y1={g.temp.maxP99.y} y2={g.temp.maxP99.y} />
      <text class="extlab" x={g.left + g.plotW - 14} y={g.temp.maxP99.y + 3.5} text-anchor="end">{g.temp.maxP99.label}</text>
    {/if}
    {#if g.temp.minAbs}
      <line class="ext" x1={g.left + g.plotW - 10} x2={g.left + g.plotW} y1={g.temp.minAbs.y} y2={g.temp.minAbs.y} />
      <text class="extlab" x={g.left + g.plotW - 14} y={g.temp.minAbs.y + 3.5} text-anchor="end">{g.temp.minAbs.label}</text>
    {/if}
    <text class="panel" x={g.left + 2} y={g.temp.top - 2}>{tempUnit(g.units)} · day and night</text>
    <text class="quarterlab" x={g.temp.quarterLabel.x} y={g.temp.quarterLabel.y}>cold quarter</text>

    <!-- rain panel -->
    {#each g.rain.ticks as t}
      <line class="grid" x1={g.left} x2={g.left + g.plotW} y1={t.y} y2={t.y} />
      <text class="tick" x={g.left - 6} y={t.y + 3.5}>{t.label}</text>
    {/each}
    {#each g.rain.bars as b}
      {#if b.h > 0}<rect class="bar" x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" />{/if}
      {#if b.lo != null && b.hi != null}<line class="whisker" x1={b.x + b.w / 2} x2={b.x + b.w / 2} y1={b.hi} y2={b.lo} />{/if}
    {/each}
    {#if g.rain.dry}<text class="drylab" x={g.left + g.plotW / 2} y={g.rain.top + g.rain.height / 2 + 4}>{dryLabel(g.units)}</text>{/if}
    <text class="panel" x={g.left + 2} y={g.rain.top - 2}>{rainUnit(g.units)} rain</text>
    <line class="axis" x1={g.left} x2={g.left + g.plotW} y1={rb} y2={rb} />

    <!-- light and humidity strip -->
    {#if g.strip}
      {#if g.strip.dli}<path class="spark dli" d={g.strip.dli.path} /><text class="sparklab dli" x={g.left + g.plotW} y={g.strip.top - 2}>DLI {range(g.strip.dli.lo, g.strip.dli.hi)}</text>{/if}
      {#if g.strip.rh}<path class="spark rh" d={g.strip.rh.path} /><text class="sparklab rh" x={g.left} y={g.strip.top - 2} text-anchor="start">RH {range(g.strip.rh.lo, g.strip.rh.hi)}%</text>{/if}
      <line class="axis" x1={g.left} x2={g.left + g.plotW} y1={g.strip.top + g.strip.height} y2={g.strip.top + g.strip.height} />
    {/if}

    <!-- months -->
    {#each g.months as m, i}
      <text class="month" x={g.monthX[i]} y={g.height - 6}>{m}</text>
    {/each}
  </svg>
  <p hidden id="{id}-more">{g.alt}</p>
  <figcaption>
    <span class="key"><i class="sw day"></i>day</span>
    <span class="key"><i class="sw night"></i>night</span>
    <span class="key"><i class="sw bar"></i>rain</span>
    <!-- The lines, the bars and the strip name their source where a reader sees them, not only in the <desc> (round sixty-one; visitor 3). -->
    {#if g.hasBand}<span class="key"><i class="sw band"></i>medians and 10th–90th percentile across {climate.cells} habitat cells, CHELSA</span>{:else if climate.cells > 1}<span class="key muted">medians across {climate.cells} habitat cells, CHELSA; no spread beyond rounding</span>{:else}<span class="key muted">one habitat cell, CHELSA, so no spread is drawn</span>{/if}
    <span class="key"><i class="sw quarter"></i>cold quarter: the three months around the coldest month's mean nightly low</span>
    {#if climate.extremes}<span class="key"><i class="sw ext"></i>extremes over {climate.extremes.years} years at a typical spot in the range, from NASA POWER, marked at the edge, in no month</span>{/if}
    {#if g.strip}{#if g.strip.dli}<span class="key"><i class="sw dli"></i>DLI, mol/m²/day</span>{/if}{#if g.strip.rh}<span class="key"><i class="sw rh"></i>RH %</span>{/if}<span class="key muted">each on its own scale</span>{/if}
  </figcaption>
</figure>

<style>
  .climo { margin: 14px 0 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 12px 10px 8px; }
  .cal { margin: 0 6px 6px; font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; font-weight: 700; color: var(--ink2); }
  svg { width: 100%; height: auto; display: block; font-family: var(--ui); }
  .grid { stroke: var(--rule); stroke-width: 1; }
  .axis { stroke: var(--rule2); stroke-width: 1; }
  /* Nothing under 11 px (round fifty-nine): the ticks and the extremes were 10. */
  .tick { fill: var(--ink3); font-size: var(--fs-xs); text-anchor: end; font-family: var(--mono); }
  .month { fill: var(--ink2); font-size: var(--fs-xs); text-anchor: middle; letter-spacing: 0.04em; }
  .panel { fill: var(--ink3); text-anchor: start; font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; font-weight: 700; }
  .zero { stroke: var(--bad); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.75; }
  .zerolab { fill: var(--bad); font-size: var(--fs-xs); text-anchor: end; letter-spacing: 0.06em; text-transform: uppercase; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.day { stroke: var(--warm); }
  .line.night { stroke: var(--cool); }
  .band { stroke: none; opacity: 0.18; }
  .band.day { fill: var(--warm); }
  .band.night { fill: var(--cool); }
  .bar { fill: var(--cool); opacity: 0.55; }
  .whisker { stroke: var(--cool); stroke-width: 1.2; }
  .ext { stroke: var(--ink); stroke-width: 1.4; }
  .extlab { fill: var(--ink2); font-size: var(--fs-xs); paint-order: stroke; stroke: var(--card); stroke-width: 3px; stroke-linejoin: round; }
  .quarter { fill: var(--ink); opacity: 0.045; }
  /* A halo in the card's colour: the frost line no longer strikes through the label where the two meet (round fifty-nine). */
  .quarterlab { fill: var(--ink3); font-size: var(--fs-xs); letter-spacing: 0.06em; text-transform: uppercase; paint-order: stroke; stroke: var(--card); stroke-width: 4px; stroke-linejoin: round; }
  .drylab { fill: var(--ink3); font-size: var(--fs-xs); text-anchor: middle; font-style: italic; }
  .spark { fill: none; stroke-width: 1.6; stroke-linejoin: round; }
  .spark.dli { stroke: var(--accent); }
  .spark.rh { stroke: var(--ink3); stroke-dasharray: 3 3; }
  .sparklab { font-size: var(--fs-xs); text-anchor: end; font-family: var(--mono); }
  .sparklab.dli { fill: var(--accent); }
  .sparklab.rh { fill: var(--ink3); text-anchor: start; } /* the attribute alone lost to the rule above, and "RH" was cut off at the left edge (round fifty-nine) */
  figcaption { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 8px 6px 2px; font-size: var(--fs-sm); color: var(--ink2); }
  .key { display: inline-flex; align-items: center; gap: 6px; }
  .key.muted { color: var(--ink3); }
  .sw { display: inline-block; width: 14px; height: 3px; border-radius: 2px; }
  .sw.day { background: var(--warm); }
  .sw.night { background: var(--cool); }
  .sw.bar { background: var(--cool); opacity: 0.55; height: 9px; width: 9px; }
  .sw.band { background: var(--warm); opacity: 0.3; height: 9px; }
  .sw.ext { background: var(--ink); height: 2px; }
  .sw.quarter { background: var(--ink); opacity: 0.1; height: 9px; }
  .sw.dli { background: var(--accent); height: 2px; }
  .sw.rh { background: repeating-linear-gradient(90deg, var(--ink3) 0 3px, transparent 3px 6px); height: 2px; }
  @media (max-width: 640px) { .climo { padding: 8px 4px 6px; } figcaption { font-size: var(--fs-sm); gap: 4px 12px; } }
</style>

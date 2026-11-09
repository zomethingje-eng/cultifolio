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
    return `Warmest month${hots.length > 1 ? 's' : ''} ${monthNames(hots)}, mean daily high ${fmt(m[hot].tmax)}; coldest month${colds.length > 1 ? 's' : ''} ${monthNames(colds)}, mean nightly low ${fmt1(m[cold].tmin)}; ${rain(year, units.current)} of rain in the median year (the twelve monthly medians added). Medians across the range, from CHELSA${climate.extremes ? `; the extremes at the edge from NASA POWER` : ''}. ${calendar}.`;
  });
  // Drawn at the width it is shown at, so labels keep their size on a phone instead of shrinking with the viewBox.
  let shown = $state(0);
  // Down to 260 px (a 288 px figure on a 320 px phone): below 340 it fell back to 720 and was shrunk, its labels 4.3 to 4.9 px
  // tall at 320 and 360 px (round eighty-four; the phone review's P1). 720 only before the width is known (the server's
  // markup, and a page with scripts off).
  // The labels' size as the reader has set it (round eighty-five; P6): the chart's margins and tick spacing are laid out
  // for 11-unit labels, and its text is drawn at 11 units, so it is drawn at the shown width divided by the reader's
  // scale and grows with the page's text without its ticks meeting or its labels running off the left. At Android's 200%
  // text a chart 300 px wide is drawn 260 units wide, its labels 12.7 px; the default is as before.
  let label = $state(11);
  const scale = $derived(Math.max(1, label / 11));
  const g = $derived(climograph(climate, shown === 0 ? 720 : Math.max(260, Math.min((shown - 20) / scale, 960)), units.current));
  // With scripts off, and in the server's markup, the width is not known: the chart is drawn twice, for a phone and for
  // anything wider, and the page's own width shows one (round eighty-five; outside review A's 20: the 720-unit chart shrunk
  // to a phone had 6 px text). Once the width is measured, one is drawn at it.
  const narrow = $derived(shown === 0 ? climograph(climate, 340, units.current) : null);
  let fig: HTMLElement | undefined = $state();
  $effect(() => {
    if (!fig) return;
    const read = () => { const v = parseFloat(getComputedStyle(fig!).getPropertyValue('--fs-xs')) * parseFloat(getComputedStyle(document.documentElement).fontSize); if (Number.isFinite(v) && v > 0) label = v; };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  });
  const range = (lo: number, hi: number) => (hi - lo < 0.5 ? lo.toFixed(0) : `${lo.toFixed(0)}–${hi.toFixed(0)}`);
  const rb = $derived(g.rain.top + g.rain.height);
  const rbOf = (x: ReturnType<typeof climograph>) => x.rain.top + x.rain.height;
</script>

{#snippet chart(x: ReturnType<typeof climograph>, pid: string, cls: string)}
  <svg class={cls} viewBox="0 0 {x.width} {x.height}" role="img" aria-labelledby="{pid}-t" aria-describedby="{pid}-d {id}-more" preserveAspectRatio="xMidYMid meet">
    <title id="{pid}-t">{name ? `Habitat climate of ${name} through the year` : 'Habitat climate through the year'}</title>
    <desc id="{pid}-d">{summary}</desc>

    <!-- temperature panel -->
    <rect class="quarter" x={x.temp.coldQuarter.x} y={x.temp.top} width={x.temp.coldQuarter.w} height={x.temp.height} />
    {#if x.temp.coldQuarter.wraps}<rect class="quarter" x={x.temp.coldQuarter.x2} y={x.temp.top} width={x.temp.coldQuarter.w2} height={x.temp.height} />{/if}
    {#each x.temp.ticks as t}
      <line class="grid" x1={x.left} x2={x.left + x.plotW} y1={t.y} y2={t.y} />
      <text class="tick" x={x.left - 6} y={t.y + 3.5}>{t.label}</text>
    {/each}
    {#if x.temp.zeroY != null}<line class="zero" x1={x.left} x2={x.left + x.plotW} y1={x.temp.zeroY} y2={x.temp.zeroY} /><text class="zerolab" x={x.left + x.plotW - 2} y={x.temp.zeroY - 4}>frost</text>{/if}
    {#if x.temp.dayBand}<path class="band day" d={x.temp.dayBand} />{/if}
    {#if x.temp.nightBand}<path class="band night" d={x.temp.nightBand} />{/if}
    <path class="line day" d={x.temp.dayLine} />
    <path class="line night" d={x.temp.nightLine} />
    <!-- undated extremes: a mark at the right edge at the right height, in no month -->
    {#if x.temp.maxP99}
      <line class="ext" x1={x.left + x.plotW - 10} x2={x.left + x.plotW} y1={x.temp.maxP99.y} y2={x.temp.maxP99.y} />
      <text class="extlab" x={x.left + x.plotW - 14} y={x.temp.maxP99.y + 3.5} text-anchor="end">{x.temp.maxP99.label}</text>
    {/if}
    {#if x.temp.minAbs}
      <line class="ext" x1={x.left + x.plotW - 10} x2={x.left + x.plotW} y1={x.temp.minAbs.y} y2={x.temp.minAbs.y} />
      <text class="extlab" x={x.left + x.plotW - 14} y={x.temp.minAbs.y + 3.5} text-anchor="end">{x.temp.minAbs.label}</text>
    {/if}
    <text class="panel" x={x.left + 2} y={x.temp.top - 2}>{tempUnit(x.units)} · day and night</text>
    <text class="quarterlab" x={x.temp.quarterLabel.x} y={x.temp.quarterLabel.y}>cold quarter</text>

    <!-- rain panel -->
    {#each x.rain.ticks as t}
      <line class="grid" x1={x.left} x2={x.left + x.plotW} y1={t.y} y2={t.y} />
      <text class="tick" x={x.left - 6} y={t.y + 3.5}>{t.label}</text>
    {/each}
    {#each x.rain.bars as b}
      {#if b.h > 0}<rect class="bar" x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" />{/if}
      {#if b.lo != null && b.hi != null}<line class="whisker" x1={b.x + b.w / 2} x2={b.x + b.w / 2} y1={b.hi} y2={b.lo} />{/if}
    {/each}
    {#if x.rain.dry}<text class="drylab" x={x.left + x.plotW / 2} y={x.rain.top + x.rain.height / 2 + 4}>{dryLabel(x.units)}</text>{/if}
    <text class="panel" x={x.left + 2} y={x.rain.top - 2}>Rain ({rainUnit(x.units)})</text><!-- "in rain", set in capitals, read "IN RAIN" (round eighty-six; W9) -->
    <line class="axis" x1={x.left} x2={x.left + x.plotW} y1={rbOf(x)} y2={rbOf(x)} />

    <!-- light and humidity strip -->
    {#if x.strip}
      {#if x.strip.dli}<path class="spark dli" d={x.strip.dli.path} /><text class="sparklab dli" x={x.left + x.plotW} y={x.strip.top - 2}>DLI {range(x.strip.dli.lo, x.strip.dli.hi)}</text>{/if}
      {#if x.strip.rh}<path class="spark rh" d={x.strip.rh.path} /><text class="sparklab rh" x={x.left} y={x.strip.top - 2} text-anchor="start">RH {range(x.strip.rh.lo, x.strip.rh.hi)}%</text>{/if}
      <line class="axis" x1={x.left} x2={x.left + x.plotW} y1={x.strip.top + x.strip.height} y2={x.strip.top + x.strip.height} />
    {/if}

    <!-- months -->
    {#each x.months as m, i}
      <text class="month" x={x.monthX[i]} y={x.height - 6}>{m}</text>
    {/each}
  </svg>
{/snippet}

<!-- The figure is named by the chart's title: named by its caption, the key, a screen reader read the whole key as the
     figure's name and then again in place (round sixty-three; U4). -->
<figure class="climo" aria-labelledby="{id}-t" bind:clientWidth={shown} bind:this={fig}>
  <!-- Whose calendar: the chart is in the habitat's months, the season card in the reader's (round sixty; visitor 3, words 14). -->
  <p class="cal">{calendar}</p>
  <!-- The title names the species, and the description is one sentence of the figures with the longer account after it
       (round fifty-eight; the accessibility review). -->
  {#if narrow}{@render chart(narrow, `${id}-n`, 'narrow')}{/if}
  {@render chart(g, id, narrow ? 'wide' : '')}
  <p hidden id="{id}-more">{g.alt}</p>
  <figcaption>
    <span class="key"><i class="sw day"></i>day</span>
    <span class="key"><i class="sw night"></i>night</span>
    <span class="key"><i class="sw bar"></i>rain</span>
    <!-- The lines, the bars and the strip name their source where a reader sees them, not only in the <desc> (round sixty-one; visitor 3). -->
    {#if g.hasBand}<span class="key"><i class="sw band"></i>medians and 10th–90th percentile across {climate.cells} habitat cells, CHELSA</span>{:else if climate.cells > 1}<span class="key muted">medians across {climate.cells} habitat cells, CHELSA; no spread beyond rounding</span>{:else}<span class="key muted">one habitat cell, CHELSA, so no spread is drawn</span>{/if}
    <span class="key"><i class="sw quarter"></i>cold quarter: the three months around the coldest month's mean nightly low</span>
    {#if climate.extremes}<span class="key"><i class="sw ext"></i>lowest night and 1-in-100 hot day over {climate.extremes.years} years at a typical spot in the range, NASA POWER; drawn at the right edge, as they belong to no one month</span>{/if}
    {#if g.strip}{#if g.strip.dli}<span class="key"><i class="sw dli"></i>DLI, mol/m²/day</span>{/if}{#if g.strip.rh}<span class="key"><i class="sw rh"></i>RH %</span>{/if}<span class="key muted">each on its own scale</span>{/if}
  </figcaption>
</figure>

<style>
  .climo { margin: 14px 0 0; background: transparent; border-radius: 0; border-top: 1px solid var(--ink); padding: 12px 0 8px; }
  .cal { margin: 0 0 6px; font-size: var(--fs-sm); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; color: var(--mut); }
  svg { width: 100%; height: auto; display: block; font-family: var(--ui); }
  .grid { stroke: var(--rule); stroke-width: 1; }
  .axis { stroke: var(--rule2); stroke-width: 1; }
  /* Nothing under 11 px (round fifty-nine): the ticks and the extremes were 10. */
  /* The chart's words at 11 units, which the drawing's width scales to the reader's text size (round eighty-five; P6). */
  .tick { fill: var(--ink3); font-size: 11px; text-anchor: end; font-family: var(--ui); font-variant-numeric: var(--figs); }
  .month { fill: var(--ink2); font-size: 11px; text-anchor: middle; letter-spacing: 0.04em; }
  .panel { fill: var(--ink3); text-anchor: start; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; font-weight: 700; }
  .zero { stroke: var(--bad); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.75; }
  .zerolab { fill: var(--bad); font-size: 11px; text-anchor: end; letter-spacing: 0.06em; text-transform: uppercase; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.day { stroke: var(--warm); }
  .line.night { stroke: var(--cool); }
  .band { stroke: none; opacity: 0.18; }
  .band.day { fill: var(--warm); }
  .band.night { fill: var(--cool); }
  .bar { fill: var(--cool); opacity: 0.55; }
  .whisker { stroke: var(--cool); stroke-width: 1.2; }
  .ext { stroke: var(--ink); stroke-width: 1.4; }
  .extlab { fill: var(--ink2); font-size: 11px; paint-order: stroke; stroke: var(--card); stroke-width: 3px; stroke-linejoin: round; }
  .quarter { fill: var(--ink); opacity: 0.045; }
  /* A halo in the card's colour: the frost line no longer strikes through the label where the two meet (round fifty-nine). */
  .quarterlab { fill: var(--ink3); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; paint-order: stroke; stroke: var(--card); stroke-width: 4px; stroke-linejoin: round; }
  .drylab { fill: var(--ink3); font-size: 11px; text-anchor: middle; font-style: italic; }
  .spark { fill: none; stroke-width: 1.6; stroke-linejoin: round; }
  .spark.dli { stroke: var(--accent); }
  .spark.rh { stroke: var(--ink3); stroke-dasharray: 3 3; }
  .sparklab { font-size: 11px; text-anchor: end; font-family: var(--ui); font-variant-numeric: var(--figs); }
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
  /* The two drawings of a page with scripts off, or before the width is measured: one for a phone, one for wider. */
  svg.narrow { display: none; }
  @media (max-width: 640px) { svg.narrow { display: block; } svg.wide { display: none; } }
</style>

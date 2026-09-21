<script lang="ts">
  import { climograph, type ClimoInput } from '$climate/climograph';
  import { units } from '$lib/ui/units.svelte';
  import { tempUnit, rainUnit } from '$core/units';
  let { climate, id = 'climograph' }: { climate: ClimoInput; id?: string } = $props();
  // Drawn at the width it is shown at, so labels keep their size on a phone instead of shrinking with the viewBox.
  let shown = $state(0);
  const g = $derived(climograph(climate, shown >= 340 ? Math.min(shown - 20, 960) : 720, units.current));
  const range = (lo: number, hi: number) => (hi - lo < 0.5 ? lo.toFixed(0) : `${lo.toFixed(0)}–${hi.toFixed(0)}`);
  const rb = $derived(g.rain.top + g.rain.height);
</script>

<figure class="climo" bind:clientWidth={shown}>
  <svg viewBox="0 0 {g.width} {g.height}" role="img" aria-labelledby="{id}-t" aria-describedby="{id}-d" preserveAspectRatio="xMidYMid meet">
    <title id="{id}-t">Habitat climate through the year</title>
    <desc id="{id}-d">{g.alt}</desc>

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
    <text class="quarterlab" x={g.temp.coldQuarter.x + 4} y={g.temp.top + 11}>cold quarter</text>

    <!-- rain panel -->
    {#each g.rain.ticks as t}
      <line class="grid" x1={g.left} x2={g.left + g.plotW} y1={t.y} y2={t.y} />
      <text class="tick" x={g.left - 6} y={t.y + 3.5}>{t.label}</text>
    {/each}
    {#each g.rain.bars as b}
      {#if b.h > 0}<rect class="bar" x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" />{/if}
      {#if b.lo != null && b.hi != null}<line class="whisker" x1={b.x + b.w / 2} x2={b.x + b.w / 2} y1={b.hi} y2={b.lo} />{/if}
    {/each}
    {#if g.rain.dry}<text class="drylab" x={g.left + g.plotW / 2} y={g.rain.top + g.rain.height / 2 + 4}>no month reaches a millimetre</text>{/if}
    <text class="panel" x={g.left + 2} y={g.rain.top - 2}>{rainUnit(g.units)} rain</text>
    <line class="axis" x1={g.left} x2={g.left + g.plotW} y1={rb} y2={rb} />

    <!-- light and humidity strip -->
    {#if g.strip}
      {#if g.strip.dli}<path class="spark dli" d={g.strip.dli.path} /><text class="sparklab dli" x={g.left + g.plotW} y={g.strip.top - 2}>DLI {range(g.strip.dli.lo, g.strip.dli.hi)}</text>{/if}
      {#if g.strip.rh}<path class="spark rh" d={g.strip.rh.path} /><text class="sparklab rh" x={g.left} y={g.strip.top - 2} text-anchor="start">RH {range(g.strip.rh.lo, g.strip.rh.hi)} %</text>{/if}
      <line class="axis" x1={g.left} x2={g.left + g.plotW} y1={g.strip.top + g.strip.height} y2={g.strip.top + g.strip.height} />
    {/if}

    <!-- months -->
    {#each g.months as m, i}
      <text class="month" x={g.monthX[i]} y={g.height - 6}>{m}</text>
    {/each}
  </svg>
  <figcaption>
    <span class="key"><i class="sw day"></i>day</span>
    <span class="key"><i class="sw night"></i>night</span>
    <span class="key"><i class="sw bar"></i>rain</span>
    {#if g.hasBand}<span class="key"><i class="sw band"></i>10th–90th percentile across {climate.cells} habitat cells</span>{:else if climate.cells > 1}<span class="key muted">{climate.cells} habitat cells, no spread beyond rounding</span>{:else}<span class="key muted">one habitat cell, so no spread is drawn</span>{/if}
    <span class="key"><i class="sw quarter"></i>cold quarter: the three months around the coldest night</span>
    {#if climate.extremes}<span class="key"><i class="sw ext"></i>extremes over {climate.extremes.years} years at the typical cell, marked at the edge: undated</span>{/if}
    {#if g.strip}{#if g.strip.dli}<span class="key"><i class="sw dli"></i>DLI, mol/m²/day</span>{/if}{#if g.strip.rh}<span class="key"><i class="sw rh"></i>RH %</span>{/if}<span class="key muted">each on its own scale</span>{/if}
  </figcaption>
</figure>

<style>
  .climo { margin: 14px 0 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 12px 10px 8px; }
  svg { width: 100%; height: auto; display: block; font-family: var(--ui); }
  .grid { stroke: var(--rule); stroke-width: 1; }
  .axis { stroke: var(--rule2); stroke-width: 1; }
  .tick { fill: var(--ink3); font-size: 10px; text-anchor: end; font-family: var(--mono); }
  .month { fill: var(--ink2); font-size: 10.5px; text-anchor: middle; letter-spacing: 0.04em; }
  .panel { fill: var(--ink3); text-anchor: start; font-size: 9.5px; letter-spacing: 0.09em; text-transform: uppercase; font-weight: 700; }
  .zero { stroke: var(--bad); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.75; }
  .zerolab { fill: var(--bad); font-size: 9.5px; text-anchor: end; letter-spacing: 0.06em; text-transform: uppercase; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.day { stroke: var(--warm); }
  .line.night { stroke: var(--cool); }
  .band { stroke: none; opacity: 0.18; }
  .band.day { fill: var(--warm); }
  .band.night { fill: var(--cool); }
  .bar { fill: var(--cool); opacity: 0.55; }
  .whisker { stroke: var(--cool); stroke-width: 1.2; }
  .ext { stroke: var(--ink); stroke-width: 1.4; }
  .extlab { fill: var(--ink2); font-size: 10px; }
  .quarter { fill: var(--ink); opacity: 0.045; }
  .quarterlab { fill: var(--ink3); font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; }
  .drylab { fill: var(--ink3); font-size: 11px; text-anchor: middle; font-style: italic; }
  .spark { fill: none; stroke-width: 1.6; stroke-linejoin: round; }
  .spark.dli { stroke: var(--accent); }
  .spark.rh { stroke: var(--ink3); stroke-dasharray: 3 3; }
  .sparklab { font-size: 9.5px; text-anchor: end; font-family: var(--mono); }
  .sparklab.dli { fill: var(--accent); }
  .sparklab.rh { fill: var(--ink3); }
  figcaption { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 8px 6px 2px; font-size: 12px; color: var(--ink2); }
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
  @media (max-width: 640px) { .climo { padding: 8px 4px 6px; } figcaption { font-size: 11.5px; gap: 4px 12px; } }
</style>

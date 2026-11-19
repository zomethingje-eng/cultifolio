<script lang="ts">
  /**
   * The Walter–Lieth diagram of the habitat's median year (round ninety-eight; `$climate/walter-lieth-chart`): mean
   * temperature against rain on Walter and Lieth's one shared scale, 10 °C to 20 mm, rain over 100 mm at a tenth. Dotted
   * where the rain curve is under the temperature curve (an arid month), shaded where it is over (a humid one). The same
   * months as the reading above it and the climograph; the figures themselves are in the climograph's table.
   */
  import { walterLiethChart, WL_SIZE } from '$climate/walter-lieth-chart';
  let { months, arid = [] }: { months: ReadonlyArray<{ tmean: number; precipMm: number }> | null | undefined; arid?: string[] } = $props();
  const c = $derived(walterLiethChart(months));
  const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));
</script>

{#if c}
  <figure class="wld" id="walter-lieth">
    <svg viewBox="0 0 {WL_SIZE.w} {WL_SIZE.h}" role="img" aria-labelledby="wl-t wl-d">
      <title id="wl-t">Walter–Lieth diagram of the median year</title>
      <desc id="wl-d">Mean temperature in °C on the left scale and rain in mm on the right, 10 °C to 20 mm, rain over 100 mm at a tenth of the scale. {arid.length ? `Arid, the rain curve under the temperature curve, in ${arid.join(' and ')}.` : 'No arid month: the rain curve is never under the temperature curve.'}</desc>
      <defs>
        <pattern id="wl-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="0.9" class="dot" /></pattern>
        <pattern id="wl-lines" width="4" height="4" patternUnits="userSpaceOnUse"><line x1="2" y1="0" x2="2" y2="4" class="vl" /></pattern>
      </defs>
      {#each c.ticks as tk (tk.c)}
        <line x1={c.box.x0} x2={c.box.x1} y1={tk.y} y2={tk.y} class="grid" class:zero={tk.c === 0} />
        <text x={c.box.x0 - 6} y={tk.y + 3.5} class="t l">{minus(tk.c)}</text>
        {#if tk.c >= 0}<text x={c.box.x1 + 6} y={tk.y + 3.5} class="t r">{tk.mm}</text>{/if}
      {/each}
      {#if c.compressAt != null}<line x1={c.box.x0} x2={c.box.x1} y1={c.compressAt} y2={c.compressAt} class="cmp" />{/if}
      {#each c.humid as p (p)}<polygon points={p} fill="url(#wl-lines)" />{/each}
      {#each c.arid as p (p)}<polygon points={p} fill="url(#wl-dots)" />{/each}
      <polyline points={c.rain} class="rain" />
      <polyline points={c.temp} class="temp" />
      {#each c.monthX as x, i (i)}<text {x} y={c.box.y1 + 15} class="t m">{M[i]}</text>{/each}
      <text x={c.box.x0 - 6} y={c.box.y0 - 12} class="t l u">°C</text>
      <text x={c.box.x1 + 6} y={c.box.y0 - 12} class="t r u">mm</text>
    </svg>
    <figcaption><span class="k temp-k"></span>Mean temperature <span class="k rain-k"></span>Rain, on one scale: 10 °C to 20 mm{#if c.compressAt != null}, over 100 mm at a tenth (above the dashed line){/if}. Dotted: arid months; shaded: humid ones.</figcaption>
  </figure>
{/if}

<style>
  .wld { margin: 10px 0 0; max-width: 440px; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--rule2); stroke-width: 0.6; }
  .grid.zero { stroke: var(--mut); }
  .cmp { stroke: var(--mut); stroke-width: 0.8; stroke-dasharray: 3 3; }
  .temp { fill: none; stroke: var(--warm); stroke-width: 2; }
  .rain { fill: none; stroke: var(--cool); stroke-width: 2; }
  .dot { fill: var(--warm); }
  .vl { stroke: var(--cool); stroke-width: 0.8; }
  .t { font-size: 10px; fill: var(--mut); font-variant-numeric: tabular-nums; }
  .l { text-anchor: end; }
  .r { text-anchor: start; }
  .m { text-anchor: middle; }
  figcaption { margin-top: 4px; font-size: var(--fs-head); color: var(--mut); }
  .k { display: inline-block; width: 14px; height: 2px; vertical-align: middle; margin: 0 4px 0 0; }
  .k.rain-k { margin-left: 10px; background: var(--cool); }
  .temp-k { background: var(--warm); }
</style>

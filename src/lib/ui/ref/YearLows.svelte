<script lang="ts">
  /**
   * The habitat's coldest night of each year, as bars (round 113; SPECIES 21): a dashed line at their mean, labelled with
   * the mean and the USDA zone it gives; a dotted line at the cold floor, "1 night in 100 is colder"; the coldest year's
   * bar darker, with its figure, and the caption naming the year. A year the series holds too few days of is a gap. The
   * figures are the series' own (`climate.extremes.lows`, NASA POWER), drawn in the reader's units. The chart is drawn for
   * the eye; its figures are in the caption and the table beside it, and a screen reader is given the caption.
   */
  import { yearLows, lowsScale } from './year-lows';
  import { tempN, tempUnit, type Units } from '$core/units';
  let { lows, floorC, zone, units }: { lows: { from: number; t: ReadonlyArray<number | null> }; floorC: number; zone: string | null; units: Units } = $props();
  const y = $derived(yearLows(lows));
  const W = 640, H = 170, L = 40, R = 150, T = 10, B = 22;
  const scale = $derived(y ? lowsScale([...y.bars.flatMap((b) => (b.c === null ? [] : [b.c])), floorC, y.meanC]) : null);
  const t = (c: number) => `${tempN(c, units, 1)} ${tempUnit(units)}`.replace(/(^|\s)-(?=\d)/g, '$1−');
  const yOf = (c: number) => (scale ? T + ((scale.max - c) / (scale.max - scale.min)) * (H - T - B) : 0);
  const bw = $derived(y ? (W - L - R) / y.bars.length : 0);
</script>

{#if y && scale}
  <figure class="lows">
    <svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="lows-cap" preserveAspectRatio="xMinYMin meet">
      {#each scale.ticks as v (v)}
        <line x1={L} x2={W - R} y1={yOf(v)} y2={yOf(v)} class="grid" />
        <text x={L - 6} y={yOf(v) + 4} class="tick" text-anchor="end">{tempN(v, units, 0).replace(/^-/, '−')}</text>
      {/each}
      {#each y.bars as b, i (b.year)}
        {#if b.c !== null}
          <rect x={L + i * bw + bw * 0.15} width={bw * 0.7} y={Math.min(yOf(b.c), yOf(scale.min))} height={Math.abs(yOf(scale.min) - yOf(b.c))} class="bar" class:cold={b.year === y.coldest.year} />
        {/if}
      {/each}
      <line x1={L} x2={W - R} y1={yOf(y.meanC)} y2={yOf(y.meanC)} class="mean" />
      <text x={W - R + 6} y={yOf(y.meanC) + 4} class="lab">mean {t(y.meanC)}{zone ? `, zone ${zone}` : ''}</text>
      <line x1={L} x2={W - R} y1={yOf(floorC)} y2={yOf(floorC)} class="floor" />
      <text x={W - R + 6} y={yOf(floorC) + 4} class="lab">1 night in 100 is colder</text>
      <text x={L + y.bars.findIndex((b) => b.year === y.coldest.year) * bw + bw / 2} y={yOf(y.coldest.c) + 13} class="lab cold" text-anchor="middle">{t(y.coldest.c)}</text>
      <text x={L} y={H - 4} class="tick">{y.from}</text>
      <text x={W - R} y={H - 4} class="tick" text-anchor="end">{y.to}</text>
    </svg>
    <figcaption id="lows-cap">The lowest night of each year at the typical spot, {y.from}–{y.to} ({y.n} years with a low): the coldest {t(y.coldest.c)} in {y.coldest.year}, the warmest {t(y.warmest.c)}, their mean {t(y.meanC)}{zone ? ` (USDA zone ${zone})` : ''}. The dotted line is the cold floor, {t(floorC)}: 1 night in 100 is colder.</figcaption>
  </figure>
{/if}

<style>
  .lows { margin: 4px 0 12px; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--rule2); stroke-width: 1; }
  .tick { font-size: 11px; fill: var(--mut); font-variant-numeric: tabular-nums; }
  .bar { fill: #2d73a3; opacity: 0.55; }
  .bar.cold { opacity: 1; }
  .mean { stroke: var(--ink); stroke-width: 1.2; stroke-dasharray: 5 4; }
  .floor { stroke: var(--ink2); stroke-width: 1.2; stroke-dasharray: 1.5 3; }
  .lab { font-size: 11px; fill: var(--ink2); }
  .lab.cold { fill: var(--ink); font-weight: 600; }
  figcaption { font-size: var(--fs-ui); color: var(--ink2); margin-top: 4px; }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme='light'])) .bar { fill: #6aa6d6; } }
  :global(:root[data-theme='dark']) .bar { fill: #6aa6d6; }
</style>

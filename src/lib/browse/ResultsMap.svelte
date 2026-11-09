<script lang="ts">
  /**
   * The results as a map (round eighty-seven, C7; ResultsMap in the round's mockups, in its look): of every species the
   * view gives, how many are native to each TDWG level-3 region, as a stepped colour scale whose legend is its steps. A
   * region the view is filtered by holds every result, so it is drawn apart, off the scale, and said so. The frame holds
   * every region with a result (none is outside it). A region pressed narrows the view to the species native there as
   * well; the table under the map is the same, by name, and is how a keyboard or a screen reader reads it.
   *
   * Drawn from the site's own files (`map-draw`), named in `data-href` and fetched when the map nears the viewport
   * ($lib/map/near's `drawNear`, round eighty-six), and every one once the page has loaded and the browser is idle, so a
   * page printed without scrolling holds the map (round eighty-six's print fix: Chromium's print does not wait for a
   * file asked for in `beforeprint`). A small region (an island a few pixels wide) has a ring around it to press.
   */
  import { onMount } from 'svelte';
  import { drawNear, drawAll } from '$lib/map/near';
  import { frameOf, viewBoxOf, stepsOf, stepOf, stepWords, LAND_FILE, REGIONS_FILE } from './map-draw';
  import type { BrowseView } from './view';

  let { map, total }: { map: NonNullable<BrowseView['map']>; total: number } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const scaled = $derived(map.regions.filter((r) => !r.filtered));
  const max = $derived(scaled.reduce((m, r) => Math.max(m, r.n), 0));
  const steps = $derived(stepsOf(max));
  const frame = $derived(frameOf(map.regions.map((r) => [r.at[0], r.at[1]] as const)));
  /** A ring's radius: about 1.2 % of the frame's width, a finger's width on a phone's map. */
  const ring = $derived(Math.max(0.6, frame.w * 0.012));
  const filtered = $derived(map.regions.filter((r) => r.filtered));
  let root: HTMLElement | undefined = $state();
  let shown = $state(16);

  onMount(() => {
    if (!root) return;
    const undo = drawNear(root);
    let idle: number | undefined;
    const later = () => { idle = typeof requestIdleCallback === 'function' ? requestIdleCallback(() => root && drawAll(root), { timeout: 4000 }) : window.setTimeout(() => root && drawAll(root), 1500); };
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
    return () => { undo(); window.removeEventListener('load', later); if (idle !== undefined) (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(idle) : clearTimeout(idle)); };
  });
</script>

<section class="rmap" aria-labelledby="rmap-h" bind:this={root}>
  <h2 id="rmap-h" class="sec">Where these {fmt(total)} species are native</h2>
  {#if !map.regions.length}
    <p class="note">None of these species has a native range Kew gives as a TDWG region, so the map has nothing to draw.</p>
  {:else}
    <div class="frame">
      <svg class="map" viewBox={viewBoxOf(frame)} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect class="sea" x="-180" y="-90" width="360" height="180" />
        <use class="land" data-href="{LAND_FILE}#land" />
        {#each map.regions as r (r.code)}
          <a href={r.href} tabindex="-1" class="rg {r.filtered ? 'filt' : `b${stepOf(r.n, steps)}`}">
            <title>{r.label}: {r.filtered ? 'the region this view is filtered by' : `${fmt(r.n)} of the ${fmt(total)}`}</title>
            <use data-href="{REGIONS_FILE}#{r.code}" />
            {#if r.at[2]}<circle class="hit" cx={r.at[0]} cy={-r.at[1]} r={ring} />{/if}
          </a>
        {/each}
      </svg>
    </div>
    <ul class="legend plain" aria-label="Species native to a region">
      {#each steps as _, k (k)}<li><span class="sw b{k}"></span>{stepWords(steps, k, max)}</li>{/each}
      {#if filtered.length}<li><span class="sw filt"></span>the {filtered.length === 1 ? 'region' : 'regions'} you filtered by: all {fmt(total)}</li>{/if}
    </ul>
    <p class="note">{fmt(scaled.length)} {scaled.length === 1 ? 'region holds' : 'regions hold'} at least one of them{filtered.length ? `, besides the ${filtered.length === 1 ? 'one' : fmt(filtered.length)} filtered by` : ''}. Press a region, here or on the map, to narrow to the species native there as well{filtered.length ? ': the view is then of all of its regions' : ''}.</p>
    <table class="rt">
      <thead><tr><th scope="col">Region</th><th scope="col" class="num">Of these {fmt(total)}, native there</th></tr></thead>
      <tbody>
        {#each scaled.slice(0, shown) as r (r.code)}
          <tr><th scope="row"><a href={r.href}>{r.label}</a></th><td class="num">{fmt(r.n)}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if scaled.length > shown}<p class="more"><button type="button" class="linkish" onclick={() => (shown = scaled.length)}>All {fmt(scaled.length)}, as a list</button></p>{/if}
    {#each map.wide as w (w.label)}<p class="note">{fmt(w.n)} {w.n === 1 ? 'species has its range' : 'species have their range'} given by Kew only as {w.label} as a whole, so {w.n === 1 ? 'it is' : 'they are'} on no region of this map.</p>{/each}
  {/if}
  <p class="foot">Native ranges from Kew's World Checklist. Introduced ranges are left off this map; a species page shows them apart. Map: Natural Earth's coastline and TDWG's regions as round eighty's shapes draw them (public domain).</p>
</section>

<style>
  .rmap { margin: 4px 0 0; font-variant-numeric: tabular-nums lining-nums; }
  .sec { margin: 0 0 8px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .frame { border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; aspect-ratio: 12 / 5; background: var(--field, var(--bg)); }
  .map { display: block; width: 100%; height: 100%; }
  .sea { fill: var(--field, var(--bg)); }
  .land { fill: var(--rule2, #ebebe8); stroke: var(--rule, #d9d6cf); }
  .rg use, .rg .hit { stroke: var(--bg); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
  .rg .hit { fill-opacity: 0.35; stroke-width: 1.5; }
  .rg:hover use, .rg:hover .hit { stroke: var(--ink); stroke-width: 1.5; }
  /* One hue, light to dark (the site's link green on the page's ground): five steps. */
  .b0 { fill: color-mix(in srgb, var(--link, #1d5c45) 22%, var(--bg)); }
  .b1 { fill: color-mix(in srgb, var(--link, #1d5c45) 40%, var(--bg)); }
  .b2 { fill: color-mix(in srgb, var(--link, #1d5c45) 58%, var(--bg)); }
  .b3 { fill: color-mix(in srgb, var(--link, #1d5c45) 78%, var(--bg)); }
  .b4 { fill: var(--link, #1d5c45); }
  .rg.b0 .hit { stroke: color-mix(in srgb, var(--link, #1d5c45) 40%, var(--bg)); }
  .filt { fill: var(--ink2); }
  .rg.filt use { fill-opacity: 0.55; }
  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 0; padding: 0; font-size: var(--fs-head); color: var(--ink2); }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 14px; height: 10px; border-radius: 2px; display: inline-block; border: 1px solid var(--rule); background: currentColor; }
  .sw.b0 { background: color-mix(in srgb, var(--link, #1d5c45) 22%, var(--bg)); }
  .sw.b1 { background: color-mix(in srgb, var(--link, #1d5c45) 40%, var(--bg)); }
  .sw.b2 { background: color-mix(in srgb, var(--link, #1d5c45) 58%, var(--bg)); }
  .sw.b3 { background: color-mix(in srgb, var(--link, #1d5c45) 78%, var(--bg)); }
  .sw.b4 { background: var(--link, #1d5c45); }
  .sw.filt { background: color-mix(in srgb, var(--ink2) 55%, var(--bg)); }
  .note, .more { margin: 8px 0 0; font-size: var(--fs-ui); color: var(--ink2); }
  .rt { width: 100%; max-width: 560px; border-collapse: collapse; font-size: var(--fs-ui); margin-top: 10px; }
  .rt thead th { text-align: left; font-size: var(--fs-sm); font-weight: 500; color: var(--mut, var(--ink3)); border-bottom: 1px solid var(--ink); padding: 4px 0; }
  .rt tbody th { text-align: left; font-weight: 400; padding: 4px 0; border-bottom: 1px solid var(--rule2, var(--rule)); }
  .rt td { padding: 4px 0; border-bottom: 1px solid var(--rule2, var(--rule)); }
  .rt .num { text-align: right; }
  .rt a { text-decoration: none; }
  .rt a:hover { text-decoration: underline; }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .foot { margin: 10px 0 0; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  @media (max-width: 899px) { .frame { aspect-ratio: 3 / 2; } .rt tbody th a { min-height: 44px; display: inline-flex; align-items: center; } }
  @media print { .frame { break-inside: avoid; } .more { display: none; } }
</style>

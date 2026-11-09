<script lang="ts">
  /**
   * The map as the region picker (round eighty-seven, C7; MapPicker and MapPickerPhone in the round's mockups, in its
   * look): every TDWG level-3 region on the world map, ticked by a press on the map or in the list beside it, and
   * "Show N species" for the regions ticked, any of them, with the view's other filters. A dialog on a desktop; on a
   * phone a sheet over the whole screen.
   *
   * The map is one control a keyboard reaches with Tab: the arrow keys move from region to region (the nearest in that
   * direction), Space or Enter ticks or unticks the region reached, + and - zoom, and each move is said. The list is the
   * same choice by name, continent by continent and region by region, each with its count and "Tick all".
   *
   * Nothing is fetched until it is opened: then the regions and their counts under the view's other filters
   * (/browse/data?part=regions, the view's query alone), and the map's two files, the site's own (`map-draw`). The count
   * of what "Show" gives is asked as the ticks change (part=count). Light tint: the rest of each ticked region's TDWG
   * region (level 2), close by and one press to add (C9).
   */
  import { tick } from 'svelte';
  import { browseData } from './data';
  import { frameOf, viewBoxOf, WORLD, LAND_FILE, REGIONS_FILE, type Frame } from './map-draw';
  import type { BrowseView } from './view';

  let { picker }: { picker: BrowseView['picker'] } = $props();
  type L3 = { code: string; label: string; up: string; n: number; lon: number; lat: number; small: boolean };
  type Data = { l1: Array<[string, string]>; l2: Array<[string, string, string]>; l3: L3[] };

  let dialog: HTMLDialogElement | undefined = $state();
  let svg: SVGSVGElement | undefined = $state();
  let data = $state<Data | null>(null);
  let failed = $state(false);
  let chosen = $state<Set<string>>(new Set());
  let cur = $state<string | null>(null);
  let frame = $state<Frame>(WORLD);
  let said = $state('');
  let count = $state<number | null>(null);
  let counting = $state(false);
  let openL2 = $state<Set<string>>(new Set());
  const fmt = (n: number) => n.toLocaleString('en-GB');

  const byCode = $derived(new Map((data?.l3 ?? []).map((r) => [r.code, r])));
  const l2Up = $derived(new Map((data?.l2 ?? []).map(([c, , up]) => [c, up])));
  const l2Name = $derived(new Map((data?.l2 ?? []).map(([c, n]) => [c, n])));
  const kids = $derived.by(() => { const m = new Map<string, L3[]>(); for (const r of data?.l3 ?? []) { const k = m.get(r.up) ?? []; k.push(r); m.set(r.up, k); } for (const k of m.values()) k.sort((a, b) => a.label.localeCompare(b.label, 'en')); return m; });
  /** The level-3 regions a code holds: itself, a level-2 region's parts, a continent's regions' parts. */
  function level3(code: string): string[] {
    if (byCode.has(code)) return [code];
    if (kids.has(code)) return kids.get(code)!.map((r) => r.code);
    return (data?.l2 ?? []).filter(([, , up]) => up === code).flatMap(([c]) => level3(c));
  }
  /** Close by: the other parts of the TDWG regions (level 2) that a ticked region is in. */
  const near = $derived(new Set([...chosen].flatMap((c) => (kids.get(byCode.get(c)?.up ?? '') ?? []).map((r) => r.code)).filter((c) => !chosen.has(c))));
  /** The ticked regions as an address writes them: a whole TDWG region or continent by its own code. */
  const codes = $derived.by(() => {
    if (!data) return [];
    const left = new Set(chosen);
    const out: string[] = [];
    for (const [c1] of data.l1) { const all = level3(c1); if (all.length && all.every((x) => left.has(x))) { out.push(c1); for (const x of all) left.delete(x); } }
    for (const [c2] of data.l2) { const all = level3(c2); if (all.length && all.every((x) => left.has(x))) { out.push(c2); for (const x of all) left.delete(x); } }
    return [...out, ...[...left].sort()];
  });
  const query = $derived(codes.length ? `?r=${codes.join(',')}${picker.all && codes.length > 1 ? '&m=all' : ''}${picker.rest ? `&${picker.rest.slice(1)}` : ''}` : picker.rest);
  const showHref = $derived(`/browse${query}`);

  export async function show() {
    dialog?.showModal();
    if (data || failed) return;
    const d = await browseData<{ l1: Data['l1']; l2: Data['l2']; l3: Array<[string, string, string, number, number, number, number]> }>('regions', picker.rest);
    if (!d) { failed = true; return; }
    data = { l1: d.l1, l2: d.l2, l3: d.l3.map(([code, label, up, n, lon, lat, small]) => ({ code, label, up, n, lon, lat, small: small === 1 })) };
    await tick();
    chosen = new Set(picker.r.flatMap((c) => level3(c)));
    const first = [...chosen][0];
    openL2 = new Set([...chosen].map((c) => byCode.get(c)!.up));
    if (first) {
      const l1 = l2Up.get(byCode.get(first)!.up)!;
      frame = frameOf(data.l3.filter((r) => l2Up.get(r.up) === l1).map((r) => [r.lon, r.lat] as const), 4);
      cur = first;
    }
  }
  function close() { dialog?.close(); }

  function toggle(code: string) {
    const r = byCode.get(code);
    if (!r) return;
    const next = new Set(chosen);
    if (next.has(code)) next.delete(code); else next.add(code);
    chosen = next;
    said = `${r.label}, ${next.has(code) ? 'ticked' : 'not ticked'}, ${fmt(r.n)} species native there`;
  }
  function tickAll(l2: string) {
    const all = level3(l2);
    const on = all.every((c) => chosen.has(c));
    const next = new Set(chosen);
    for (const c of all) if (on) next.delete(c); else next.add(c);
    chosen = next;
    said = `${l2Name.get(l2)}: ${on ? 'none' : `all ${all.length}`} ticked`;
  }

  // "Show N species": the count of the regions ticked, with the view's other filters, asked as the ticks change.
  let asked = 0;
  $effect(() => {
    const q = query;
    if (!data) return;
    const n = ++asked;
    counting = true;
    const t = setTimeout(async () => {
      const r = await browseData<{ n: number }>('count', q);
      if (n !== asked) return;
      count = r ? r.n : null;
      counting = false;
    }, 200);
    return () => clearTimeout(t);
  });

  /* ---------- the map by keyboard ---------- */
  function move(dx: number, dy: number) {
    if (!data) return;
    const from = byCode.get(cur ?? '') ?? null;
    if (!from) { const mid = { lon: frame.x + frame.w / 2, lat: -(frame.y + frame.h / 2) }; cur = [...data.l3].sort((a, b) => Math.hypot(a.lon - mid.lon, a.lat - mid.lat) - Math.hypot(b.lon - mid.lon, b.lat - mid.lat))[0].code; }
    else {
      let best: L3 | null = null, score = Infinity;
      for (const r of data.l3) {
        if (r.code === from.code) continue;
        const ex = r.lon - from.lon, ey = r.lat - from.lat;
        const along = ex * dx + ey * dy, across = Math.abs(ex * dy - ey * dx);
        if (along <= 0 || across > along * 1.5) continue;
        const s = along + across * 2;
        if (s < score) { score = s; best = r; }
      }
      if (!best) { said = 'No region further that way.'; return; }
      cur = best.code;
    }
    const r = byCode.get(cur!)!;
    // Keep the region reached in the frame.
    if (r.lon < frame.x || r.lon > frame.x + frame.w || -r.lat < frame.y || -r.lat > frame.y + frame.h) frame = clampFrame({ ...frame, x: r.lon - frame.w / 2, y: -r.lat - frame.h / 2 });
    said = `${r.label}, in ${l2Name.get(r.up) ?? ''}: ${chosen.has(r.code) ? 'ticked' : 'not ticked'}, ${fmt(r.n)} species native there`;
  }
  function clampFrame(f: Frame): Frame {
    const w = Math.min(WORLD.w, Math.max(12, f.w)), h = (w * WORLD.h) / WORLD.w;
    return { w, h, x: Math.min(Math.max(f.x, WORLD.x), WORLD.x + WORLD.w - w), y: Math.min(Math.max(f.y, WORLD.y), WORLD.y + WORLD.h - h) };
  }
  function zoom(k: number) {
    const r = byCode.get(cur ?? '');
    const cx = r ? r.lon : frame.x + frame.w / 2, cy = r ? -r.lat : frame.y + frame.h / 2;
    const w = frame.w * k, h = (w * WORLD.h) / WORLD.w;
    frame = clampFrame({ x: cx - w / 2, y: cy - h / 2, w, h });
  }
  function onkey(e: KeyboardEvent) {
    const k = e.key;
    if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowLeft') move(-1, 0);
    else if (k === 'ArrowUp') move(0, 1);
    else if (k === 'ArrowDown') move(0, -1);
    else if ((k === ' ' || k === 'Enter') && cur) toggle(cur);
    else if (k === '+' || k === '=') zoom(0.5);
    else if (k === '-' || k === '_') zoom(2);
    else return;
    e.preventDefault();
  }
  function zoomTo(l1: string) {
    if (!data) return;
    frame = frameOf(data.l3.filter((r) => l2Up.get(r.up) === l1).map((r) => [r.lon, r.lat] as const), 4);
  }
  const ring = $derived(Math.max(0.5, frame.w * 0.011));
</script>

<button type="button" class="opener" onclick={show}>Pick regions on a map</button>

<dialog bind:this={dialog} class="picker" aria-labelledby="mp-h" onclose={() => (said = '')}>
  <div class="top">
    <h2 id="mp-h">Where do they grow wild?</h2>
    <button type="button" class="x" aria-label="Close the map" onclick={close}>Close</button>
  </div>
  <p class="sub">Tick on the map or in the list. You get the species native to any region ticked; the results then let you ask for all of them instead.</p>
  {#if failed}
    <p class="note">The reference was not reached, so the map cannot be drawn. The regions are in the filters beside the results.</p>
  {:else if !data}
    <p class="note">Reading the regions.</p>
  {:else}
    <div class="body">
      <div class="mapcol">
        <div class="frame">
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <svg bind:this={svg} class="map" viewBox={viewBoxOf(frame)} preserveAspectRatio="xMidYMid meet" role="application" aria-roledescription="map" tabindex="0" aria-label="Map of TDWG's level-3 regions" aria-describedby="mp-keys" onkeydown={onkey}>
            <rect class="sea" x="-180" y="-90" width="360" height="180" />
            <use class="land" href="{LAND_FILE}#land" />
            {#each data.l3 as r (r.code)}
              <g class="rg" class:on={chosen.has(r.code)} class:near={near.has(r.code)} class:cur={cur === r.code} role="presentation" onclick={() => { cur = r.code; toggle(r.code); }}>
                <title>{r.label}: {fmt(r.n)}</title>
                <use href="{REGIONS_FILE}#{r.code}" />
                {#if r.small}<circle class="hit" cx={r.lon} cy={-r.lat} r={ring} />{/if}
              </g>
            {/each}
          </svg>
          <div class="zoom"><button type="button" aria-label="Zoom in" onclick={() => zoom(0.5)}>+</button><button type="button" aria-label="Zoom out" onclick={() => zoom(2)}>−</button></div>
        </div>
        <p id="mp-keys" class="keys">On the map: arrow keys move from region to region, Space ticks or unticks, + and - zoom.</p>
        <ul class="legend plain" aria-hidden="true"><li><span class="sw on"></span>Ticked</li><li><span class="sw near"></span>Close by, in the same TDWG region: one press to add</li><li><span class="sw off"></span>Not ticked</li></ul>
        <p class="sr" role="status" aria-live="polite">{said}</p>
      </div>
      <div class="listcol">
        {#each data.l1 as [c1, n1] (c1)}
          <section class="l1">
            <h3><button type="button" class="linkish" onclick={() => zoomTo(c1)} aria-label="Show {n1} on the map">{n1}</button></h3>
            {#each data.l2.filter((x) => x[2] === c1) as [c2, n2] (c2)}
              {@const parts = kids.get(c2) ?? []}
              {@const on = parts.filter((r) => chosen.has(r.code)).length}
              <div class="l2">
                <button type="button" class="l2h" aria-expanded={openL2.has(c2)} aria-controls="mp-l2-{c2}" onclick={() => { const s = new Set(openL2); if (s.has(c2)) s.delete(c2); else s.add(c2); openL2 = s; }}><span class="mk" aria-hidden="true">{openL2.has(c2) ? '\u2212' : '+'}</span><span>{n2}</span>{#if on}<span class="n">{` ${on} ticked`}</span>{/if}</button>
                {#if openL2.has(c2)}
                  <div id="mp-l2-{c2}">
                    <p class="all"><button type="button" class="linkish" onclick={() => tickAll(c2)}>{on === parts.length ? 'Untick all' : `Tick all ${parts.length}`}</button></p>
                    <ul class="plain">
                      {#each parts as r (r.code)}
                        <li><label><input type="checkbox" checked={chosen.has(r.code)} onchange={() => { cur = r.code; toggle(r.code); }} /> <span class="lab">{r.label}</span> <span class="n">{fmt(r.n)}</span></label></li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/each}
          </section>
        {/each}
        <p class="src">{fmt(data.l3.length)} regions in TDWG's World Geographical Scheme, as Kew's checklist uses them. Each count is the species native there{picker.rest ? ' that the view\'s other filters give' : ''}.</p>
      </div>
    </div>
    <div class="foot">
      <p class="chosen"><span class="lbl">Chosen:</span> {codes.length ? [...chosen].map((c) => byCode.get(c)?.label).filter(Boolean).slice(0, 6).join(', ') + (chosen.size > 6 ? ` and ${fmt(chosen.size - 6)} more` : '') : 'nothing yet: tick a region'}</p>
      <button type="button" class="linkish" disabled={!chosen.size} onclick={() => { chosen = new Set(); said = 'Nothing ticked'; }}>Clear</button>
      <a class="go" href={showHref}>{chosen.size ? (count === null ? (counting ? 'Show species' : 'Show species (count not reached)') : `Show ${fmt(count)} species`) : 'Show every region'}</a>
    </div>
  {/if}
</dialog>

<style>
  /* A link's look, not a bordered button (the review of stage 2's pages, 8): it opens the picker, a choice among the rail's links. */
  .opener { display: inline-flex; align-items: center; border: 0; border-radius: 0; background: none; color: var(--link, var(--accent)); font: inherit; font-size: var(--fs-head); padding: 0; margin: 8px 0 4px; cursor: pointer; }
  .opener:hover { color: var(--hov, var(--accent)); text-decoration: underline; text-underline-offset: 2px; }
  .picker { width: min(1080px, 96vw); max-height: 92vh; padding: 16px 20px; border: 1px solid var(--ink); border-radius: 4px; background: var(--bg); color: var(--ink); font-variant-numeric: tabular-nums lining-nums; }
  .picker::backdrop { background: rgb(0 0 0 / 0.35); }
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--ink); padding-bottom: 6px; }
  h2 { margin: 0; font-size: 1.375rem; font-weight: 400; }
  .x { border: 0; background: none; font: inherit; color: var(--link, var(--accent)); cursor: pointer; min-height: 32px; }
  .sub, .note, .keys, .src { color: var(--ink2); font-size: var(--fs-ui); margin: 8px 0; }
  .keys, .src { font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  .body { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 20px; }
  .frame { position: relative; border: 1px solid var(--rule); border-radius: 4px; overflow: hidden; aspect-ratio: 12 / 5; background: var(--field, var(--bg)); }
  .map { display: block; width: 100%; height: 100%; cursor: pointer; }
  .map:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
  .sea { fill: var(--field, var(--bg)); }
  .land { fill: var(--rule2, #ebebe8); stroke: none; pointer-events: none; }
  .rg use, .rg .hit { fill: var(--rule2, #ebebe8); stroke: var(--edge, #9a968c); stroke-width: 0.5; vector-effect: non-scaling-stroke; }
  .rg .hit { fill-opacity: 0.4; }
  .rg.near use, .rg.near .hit { fill: color-mix(in srgb, var(--link, #1d5c45) 22%, var(--bg)); }
  .rg.on use, .rg.on .hit { fill: var(--link, #1d5c45); stroke: var(--bg); }
  .rg:hover use, .rg.cur use, .rg.cur .hit { stroke: var(--ink); stroke-width: 2; }
  .zoom { position: absolute; right: 6px; top: 6px; display: flex; flex-direction: column; gap: 4px; }
  .zoom button { width: 32px; height: 32px; border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; background: var(--bg); color: var(--ink); font: inherit; font-size: var(--fs-xl); cursor: pointer; }
  .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 4px 0 0; padding: 0; font-size: var(--fs-sm); color: var(--ink2); }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 14px; height: 10px; border-radius: 2px; border: 1px solid var(--rule); display: inline-block; }
  .sw.on { background: var(--link, #1d5c45); }
  .sw.near { background: color-mix(in srgb, var(--link, #1d5c45) 22%, var(--bg)); }
  .sw.off { background: var(--rule2, #ebebe8); }
  .listcol { max-height: 58vh; overflow-y: auto; font-size: var(--fs-ui); border-top: 1px solid var(--rule); }
  .l1 h3 { margin: 10px 0 2px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
  .l1 h3 .linkish { color: var(--mut, var(--ink3)); text-transform: inherit; letter-spacing: inherit; font-weight: inherit; }
  .l2 { border-top: 1px solid var(--rule2, var(--rule)); }
  .l2h { display: flex; width: 100%; gap: 6px; border: 0; background: none; padding: 5px 0; font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
  .mk { width: 1em; color: var(--mut, var(--ink3)); }
  .all { margin: 0 0 2px; font-size: var(--fs-head); }
  ul { list-style: none; margin: 0 0 6px; padding: 0 0 0 14px; }
  li label { display: flex; align-items: center; gap: 8px; min-height: 30px; cursor: pointer; }
  .lab { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .n { color: var(--mut, var(--ink3)); white-space: nowrap; }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; border-top: 1px solid var(--ink); margin-top: 10px; padding-top: 10px; }
  .chosen { flex: 1 1 280px; margin: 0; font-size: var(--fs-ui); }
  .lbl { color: var(--mut, var(--ink3)); }
  .go { display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: 4px; background: var(--ink); color: var(--bg); text-decoration: none; }
  .go:hover { background: var(--hov, var(--ink)); }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .linkish:disabled { color: var(--mut, var(--ink3)); cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 899px) {
    /* A phone's sheet over the whole screen (MapPickerPhone). */
    .picker { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; padding: 12px 16px; border: 0; border-radius: 0; display: flex; flex-direction: column; }
    .picker:not([open]) { display: none; }
    .body { grid-template-columns: minmax(0, 1fr); gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
    .frame { aspect-ratio: 3 / 2; }
    .listcol { max-height: none; }
    .x, .opener, .zoom button { min-height: 44px; min-width: 44px; }
    li label { min-height: 44px; }
    .l2h, .all .linkish, .l1 h3 .linkish { min-height: 44px; display: flex; align-items: center; }
    .foot { position: sticky; bottom: 0; background: var(--bg); padding-bottom: 8px; }
    .go { min-height: 48px; flex: 1; justify-content: center; }
  }
</style>

<script lang="ts">
  /**
   * The browse engine's page (round eighty-seven, C1 to C4): the rail of choices, each with its count, and the results as
   * tiles or a list, from the view the server worked out ($lib/browse/load.server). Every choice is a link the server
   * answers; a box ticked follows its link in place (replacing the address, so Back leaves the view), and without
   * scripts the rail is a form with a Show button. /browse and every entrance page draw this one component.
   *
   * Styled in the round's look with the theme's tokens (DESIGN-87): thin rules, tables, no cards; a figure in tabular
   * lining figures; the scientific names in the serif (SpeciesName).
   *
   * Stage 2 (round eighty-seven, C6 to C9): "Pin this view" and, on arrival from a pin, what changed since (PinState);
   * the map picker in the rail and the results as a map (view=map); the record low as a column and an order where the
   * index holds it, "not in this index" where it does not; on a region's, a genus's or a family's page the collection
   * lens's marks and its Yours and Not yours (`lens`, worked out in the browser); and on a phone the count and the
   * view's switch held at the top while the results scroll.
   */
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import PinButton from './PinButton.svelte';
  import PinSince from './PinSince.svelte';
  import MapPicker from './MapPicker.svelte';
  import ResultsMap from './ResultsMap.svelte';
  import Tip from './Tip.svelte';
  import { PinState } from './pinned.svelte';
  import type { LensState } from './lens-state.svelte';
  import { photoAt } from '$dossier/photo-size';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import type { BrowseView } from './view';
  import type { Snippet } from 'svelte';
  import { GROWN_WORDS, RANGE_SOURCE, GROWN_SOURCE, CLIMATE_SOURCE, LOW_SOURCE } from './sources';
  import { units } from '$lib/ui/units.svelte';
  import { temp } from '$core/units';

  let { view, heading = true, actions, lens }: { view: BrowseView; heading?: boolean; /** A seam for more actions on a view. */ actions?: Snippet; /** The collection lens of an entrance page (C8). */ lens?: LensState } = $props();
  const pinState = new PinState(() => view.pin);
  let scripted = $state(false);
  onMount(() => { pinState.start(); scripted = true; });
  /** The lens's marks: the page's species the grower grows, while it is on. */
  const mine = $derived(lens?.mine ?? null);
  /** The results this page shows, all, or the grower's or the others' where the lens says so (in this tab alone). */
  const items = $derived(!mine || !lens || lens.show === 'all' ? view.items : view.items.filter((it) => (lens.show === 'mine') === mine.has(it.slug)));
  /** The record low in the reader's units, one decimal, as the species page gives it (`temp`; the units store the layout
      seeds from the page's data, the cookie or the language): it was always °C (the review of stage 2's pages, 4). */
  const lowWords = (c: number) => temp(c, units.current, 1).replace(/^-/, '\u2212');
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const count = (l: { n?: number; plus?: boolean }) => (l.n === undefined ? '' : `${l.plus ? '+' : ''}${fmt(l.n)}`);
  let railOpen = $state(false);
  let copied = $state(false);
  const active = $derived(view.pills.length);
  const r = $derived(view.rail);
  /** The grown count's standing (round eighty-seven, the review of stage 1, S1): not counted is said, never shown as 0. */
  const grownFlag = $derived(r.flags.find((x) => x.key === 'grown'));

  /** A box ticked or a choice picked follows its own link, in place of the address (C9: replaceState for ticks). */
  function follow(e: Event) {
    const el = e.target as HTMLInputElement;
    const href = el?.dataset?.href;
    if (!href) return;
    e.preventDefault();
    goto(href, { replaceState: true, noScroll: true, keepFocus: true });
  }
  async function share(e: MouseEvent) {
    const url = location.href;
    if (navigator.share && matchMedia('(hover: none)').matches) { e.preventDefault(); try { await navigator.share({ url, title: document.title }); } catch { /* closed */ } return; }
    if (navigator.clipboard) { e.preventDefault(); try { await navigator.clipboard.writeText(url); copied = true; setTimeout(() => (copied = false), 2500); } catch { /* the link itself stays */ } }
  }
</script>

<div class="bv">
  <div class="phonebar">
    <button class="filters" type="button" aria-expanded={railOpen} aria-controls="bv-rail" onclick={() => (railOpen = !railOpen)}>Filters{active ? ` (${active})` : ''}</button>
    <span class="cnt" aria-hidden="true"><b>{fmt(view.total)}</b> species</span>
    <nav class="views pv plain" aria-label="View">
      <a href={view.views.tiles} aria-current={view.query.view === 'tiles' ? 'page' : undefined}>Tiles</a>
      <a href={view.views.list} aria-current={view.query.view === 'list' ? 'page' : undefined}>List</a>
      <a href={view.views.map} aria-current={view.query.view === 'map' ? 'page' : undefined}>Map</a>
    </nav>
  </div>

  <form id="bv-rail" class="rail" class:open={railOpen} method="get" action="/browse" aria-label="Filters" onchange={follow}>
    <section aria-labelledby="bv-native">
      <h2 id="bv-native" class="sec">Native to</h2>
      {#if scripted}<MapPicker picker={view.picker} />{/if}
      <p class="line plain">
        {#each r.line as l, i}{#if i}<span aria-hidden="true">{" › "}</span>{/if}<a href={l.href}>{l.label}</a>{/each}
      </p>
      {#if r.countries.length}
        <p class="countries plain">Whole country:
          {#each r.countries as c, i}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href={c.href} aria-current={c.on ? 'true' : undefined}>{c.label}</a> <span class="n">{fmt(c.n ?? 0)}</span>{/each}
        </p>
      {/if}
      <ul class="choices">
        {#each r.ticked as o (o.code)}
          <li><label><input type="checkbox" name="r" value={o.code} checked data-href={o.href} /> <span class="lab">{o.label}</span> <span class="n">{count(o)}</span></label></li>
        {/each}
        {#each r.options as o (o.code)}
          <li>
            <label><input type="checkbox" name="r" value={o.code} checked={o.on} data-href={o.href} /> <span class="lab">{o.label}</span> <span class="n">{count(o)}</span></label>
            {#if o.open}<a class="into plain" href={o.open} aria-label="The regions of {o.label}">›</a>{/if}
          </li>
        {/each}
      </ul>
      {#if r.modes}
        <fieldset class="modes">
          <legend>Native to</legend>
          <label><input type="radio" name="m" value="any" checked={r.modes.any.on} data-href={r.modes.any.href} /> any of these <span class="n">{fmt(r.modes.any.n ?? 0)}</span></label>
          <label><input type="radio" name="m" value="all" checked={r.modes.all.on} data-href={r.modes.all.href} /> all of these <span class="n">{fmt(r.modes.all.n ?? 0)}</span></label>
        </fieldset>
      {/if}
    </section>

    {#if r.families.length}<section aria-labelledby="bv-family">
      <h2 id="bv-family" class="sec">Family</h2>
      <ul class="choices">
        {#each r.families as f (f.label)}
          <li><label><input type="checkbox" name="f" value={f.value} checked={f.on} data-href={f.href} /> <span class="lab">{f.label}</span> <span class="n">{count(f)}</span></label></li>
        {/each}
      </ul>
      {#if r.moreFamilies}<p class="more plain"><a href={r.moreFamilies}>All {fmt(r.familiesWith)} families</a></p>{/if}
    </section>{/if}

    {#if r.genera.length}<section aria-labelledby="bv-genus">
      <h2 id="bv-genus" class="sec">Genus</h2>
      <ul class="choices">
        {#each r.genera as g (g.label)}
          <li><label><input type="checkbox" name="g" value={g.value} checked={g.on} data-href={g.href} /> <span class="lab"><i class="sci">{g.label}</i></span> <span class="n">{count(g)}</span></label></li>
        {/each}
      </ul>
      {#if r.moreGenera}<p class="more plain"><a href={r.moreGenera}>All {fmt(r.generaWith)} genera</a></p>{/if}
    </section>{/if}

    <section aria-labelledby="bv-only">
      <h2 id="bv-only" class="sec">Show only</h2>
      <ul class="choices">
        {#each r.flags as x (x.key)}
          <li><label class:off={x.disabled}><input type="checkbox" name={x.key} value="1" checked={x.on} disabled={x.disabled} data-href={x.href} /> <span class="lab">{x.label}</span> <span class="n">{x.uncounted ? 'not counted' : x.disabled ? '' : count(x)}</span></label>{#if x.key === 'grown'}<Tip label="About Grown" text={`${GROWN_SOURCE} The one meaning of "grown" on these pages.`} />{/if}</li>
        {/each}
      </ul>
      {#if grownFlag?.uncounted}<p class="note">Grown is not counted in this build of the reference: its species list holds no count of iNaturalist's cultivated observations.</p>
      {:else if grownFlag?.notCounted}<p class="note">{fmt(grownFlag.notCounted)} of these species are not counted for Grown, and ticking it leaves them out.</p>{/if}
      {#if r.flags.find((x) => x.key === 'only')?.disabled}<p class="note">"Native only to" asks for a region ticked first.</p>{/if}
    </section>
    {#if view.query.sort !== 'grown'}<input type="hidden" name="sort" value={view.query.sort} />{/if}
    {#if view.query.view !== 'tiles'}<input type="hidden" name="view" value={view.query.view} />{/if}
    <noscript><button class="show" type="submit">Show</button></noscript>
    <p class="note">Each number is what ticking it gives. "+" is how many a region adds to the regions ticked; beside a ticked region, how many of these are native to it.</p>
  </form>

  <div class="main">
    <div class="head">
      {#if heading}<h1 class="count"><span class="num">{fmt(view.total)}</span> species</h1>{:else}<h2 class="count"><span class="num">{fmt(view.total)}</span> species</h2>{/if}
      <p class="title">{view.title}</p>
    </div>
    {#if view.pills.length}
      <ul class="pills plain" aria-label="Filters chosen">
        {#each view.pills as pl (pl.label)}<li>{pl.label} <a href={pl.href} aria-label="Remove {pl.label}">×</a></li>{/each}
        {#if view.clear}<li class="clear"><a href={view.clear}>Clear all</a></li>{/if}
      </ul>
    {/if}
    {#if view.grown.asked && view.grown.state === 'none'}<p class="wide">Grown, per iNaturalist, is not counted in this build of the reference, so this view is not narrowed by it.</p>
    {:else if view.query.grown && view.grown.notCounted}<p class="wide">{fmt(view.grown.notCounted)} more {view.grown.notCounted === 1 ? 'species is' : 'species are'} not counted for Grown, and {view.grown.notCounted === 1 ? 'is' : 'are'} not among these.</p>{/if}
    {#if view.gone?.length}<p class="wide" id="bv-gone">{view.gone.length === 1 ? `The region ${view.gone[0]} this address names is` : `The regions ${view.gone.slice(0, -1).join(', ')} and ${view.gone.at(-1)} this address names are`} not in the reference, so the view is shown without {view.gone.length === 1 ? 'it' : 'them'}.</p>{/if}
    {#each view.wide as w (w.href)}<p class="wide">{w.label} are not counted here: <a href={w.href}>see them there</a>.</p>{/each}

    <div class="tools plain">
      <nav class="views wide-only" aria-label="View">
        <a href={view.views.tiles} aria-current={view.query.view === 'tiles' ? 'page' : undefined}>Tiles</a>
        <a href={view.views.list} aria-current={view.query.view === 'list' ? 'page' : undefined}>List</a>
        <a href={view.views.map} aria-current={view.query.view === 'map' ? 'page' : undefined}>Map</a>
      </nav>
      {#if view.query.view !== 'map'}
        <span class="sort">Order: {#if view.sorts.grown}<a href={view.sorts.grown} aria-current={view.query.sort === 'grown' ? 'true' : undefined}>most grown</a>{' · '}{/if}<a href={view.sorts.az} aria-current={view.query.sort === 'az' || (!view.sorts.grown && view.query.sort === 'grown') ? 'true' : undefined}>A–Z</a>{#if view.sorts.low}{' · '}<a href={view.sorts.low} aria-current={view.query.sort === 'low' ? 'true' : undefined}>coldest record low first</a>{/if}{#if !view.sorts.grown}{' (most grown is not counted in this build)'}{/if}</span>
      {/if}
      <span class="acts">
        <PinButton state={pinState} />
        {@render actions?.()}
        <a href={view.base + view.qs} onclick={share}>{copied ? 'Link copied' : 'Share link'}</a>
        <a href={view.csv} download>Download CSV</a>
        <a href={view.sources} download>Its columns and sources</a>
      </span>
    </div>

    {#if pinState.panel}<PinSince from={pinState.panel.from} added={pinState.panel.added} removed={pinState.panel.removed} onclose={() => (pinState.panel = null)} />{/if}

    {#if !view.total}
      <div class="nothing" role="status">
        <p class="lead">No species are all of these.</p>
        {#if view.fixes.length}
          <p>Loosen one:</p>
          <ul class="fixes plain">{#each view.fixes as f (f.href)}<li><a href={f.href}>{f.label}</a> <span class="n">{fmt(f.n ?? 0)}</span></li>{/each}</ul>
        {/if}
      </div>
    {:else if view.query.view === 'map' && view.map}
      <ResultsMap map={view.map} total={view.total} />
    {:else if view.query.view === 'list'}
      <table class="list">
        <thead><tr>
          <th scope="col">Species</th><th scope="col">Family</th>
          <th scope="col">Native to <Tip label="About Native to" text={`${RANGE_SOURCE} "Only here": native to the regions ticked and nowhere else.`} /></th>
          <th scope="col">Habitat climate <Tip label="About Habitat climate" text={CLIMATE_SOURCE} /></th>
          <th scope="col" class="num">Record low <Tip label="About Record low" text={view.lows ? LOW_SOURCE : 'This build of the index holds no record lows; each species page gives its own, with its source.'} /></th>
          <th scope="col" class="num">Grown <Tip label="About Grown" text={`${GROWN_SOURCE} "Not counted" where the species list does not count the species.`} /></th>
          {#if mine}<th scope="col">Yours</th>{/if}
        </tr></thead>
        <tbody>
          {#each items as it (it.slug)}
            <tr class:yours={mine?.has(it.slug)}>
              <th scope="row"><a href="/species/{it.slug}"><SpeciesName name={it.name} /></a>{#if it.common}<span class="com">{it.common}</span>{/if}</th>
              <td data-label="Family">{it.family ?? ''}</td>
              <td data-label="Native to">{it.where}{#if it.only}<span class="only"> · only here</span>{/if}</td>
              <td data-label="Habitat climate" class:mut={!it.climateKnown}>{it.climateCell}</td>
              <td data-label="Record low" class="num" class:mut={!view.lows || it.low == null}>{!view.lows ? 'not in this index' : it.low == null ? (it.climateKnown ? 'not in the index' : it.climateCell) : lowWords(it.low)}</td>
              <td data-label="Grown" class="num">{it.grown === null ? 'not counted' : fmt(it.grown)}</td>
              {#if mine}<td data-label="Yours">{mine.has(it.slug) ? 'you grow this' : ''}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <ul class="tiles plain">
        {#each items as it, i (it.slug)}
          <li class:yours={mine?.has(it.slug)}>
            <a href="/species/{it.slug}">
              {#if it.thumb}<img src={photoAt(it.thumb, 'small')} width="240" height="240" alt="" loading={i < 4 ? 'eager' : 'lazy'} />{:else}<span class="noph">{view.photosRead ? 'no open photograph on file' : 'photograph not read'}</span>{/if}
              <span class="nm"><SpeciesName name={it.name} /></span>
              {#if it.common}<span class="com">{it.common}</span>{/if}
              <span class="meta">{it.where}{#if it.only}{' · only here'}{/if}</span>
              <span class="meta">{it.climate}{it.grown ? ` · ${fmt(it.grown)} grown` : ''}{it.low != null ? ` · record low ${lowWords(it.low)}` : ''}</span>
              {#if mine?.has(it.slug)}<span class="you">You grow this</span>{/if}
            </a>
            {#if it.credit}<span class="cred">{it.credit}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if view.total && view.query.view !== 'map'}
      <nav class="pager plain" aria-label="Pages of results">
        <span>{fmt(view.pages.from)}–{fmt(view.pages.to)} of {fmt(view.total)}</span>
        {#if view.pages.prev}<a href={view.pages.prev} rel="prev">Previous {48}</a>{/if}
        {#if view.pages.next}<a href={view.pages.next} rel="next">Next {Math.min(48, view.total - view.pages.to)}</a>{/if}
      </nav>
    {/if}
    <p class="foot">Grown: {GROWN_WORDS}; "not counted" where the species list does not count it. {RANGE_SOURCE} {GROWN_SOURCE} {CLIMATE_SOURCE} {view.lows ? LOW_SOURCE : 'Record low: not in this index.'}{view.built ? ` Counts ${view.built}.` : ''} The CSV holds every result, not only this page's.</p>
  </div>
</div>

<style>
  .bv { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 32px; align-items: start; margin-top: 16px; font-variant-numeric: tabular-nums lining-nums; }
  .phonebar { display: none; }
  .views.pv { display: none; }
  .sec { margin: 18px 0 4px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .rail section:first-child .sec { margin-top: 0; }
  .rail { font-size: var(--fs-ui); }
  .choices { list-style: none; margin: 0; padding: 0; }
  .choices li { display: flex; align-items: center; border-top: 1px solid var(--rule2, var(--rule)); }
  .choices label { flex: 1; display: flex; align-items: center; gap: 8px; min-height: 32px; cursor: pointer; min-width: 0; }
  .choices label.off { color: var(--mut, var(--ink3)); cursor: default; }
  .lab { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .n { color: var(--mut, var(--ink3)); font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
  .into { padding: 4px 8px; min-width: 24px; text-align: center; }
  .line, .countries, .more, .note { margin: 4px 0; font-size: var(--fs-head); color: var(--ink2); }
  .note { color: var(--mut, var(--ink3)); }
  .modes { border: 0; margin: 8px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .modes legend { font-size: var(--fs-head); color: var(--mut, var(--ink3)); padding: 0; }
  .modes label { display: flex; align-items: center; gap: 6px; min-height: 32px; }
  .show { margin-top: 12px; }
  .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; border-bottom: 1px solid var(--ink); padding-bottom: 6px; }
  .count { margin: 0; font-size: 1.75rem; font-weight: 400; line-height: 1.2; }
  .title { margin: 0; color: var(--ink2); }
  .pills { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; font-size: var(--fs-head); }
  .pills li { border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; padding: 1px 2px 1px 8px; display: flex; align-items: center; gap: 2px; }
  .pills li a { padding: 0 6px; }
  .pills li.clear { border: 0; }
  .wide { margin: 10px 0 0; font-size: var(--fs-ui); color: var(--ink2); }
  .tools { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; margin: 12px 0; font-size: var(--fs-ui); }
  .views { display: flex; border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; overflow: hidden; }
  .views a { padding: 3px 12px; }
  .views a[aria-current] { background: var(--ink); color: var(--bg); }
  .sort a[aria-current] { font-weight: 600; color: var(--ink); }
  .acts { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-left: auto; }
  .tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr)); gap: 18px 16px; }
  .tiles li { min-width: 0; }
  .tiles a { display: flex; flex-direction: column; gap: 1px; color: inherit; text-decoration: none; }
  .tiles a:hover .nm, .tiles a:focus-visible .nm { text-decoration: underline; }
  .you { font-size: var(--fs-sm); font-weight: 600; color: var(--link, var(--accent)); }
  .tiles li.yours img, .tiles li.yours .noph { outline: 2px solid var(--link, var(--accent)); outline-offset: -2px; }
  .list tr.yours th { box-shadow: inset 3px 0 0 var(--link, var(--accent)); padding-left: 6px; }
  .into, .pills a, .views a, .line a, .more a, .fixes a { text-decoration: none; }
  .into:hover, .pills a:hover, .line a:hover, .more a:hover, .fixes a:hover { text-decoration: underline; }
  .tiles img, .noph { display: block; width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border-radius: 2px; background: var(--rule2, var(--rule)); }
  .noph { display: flex; align-items: center; justify-content: center; text-align: center; padding: 8px; box-sizing: border-box; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); background: none; border: 1px solid var(--rule); }
  .nm { margin-top: 6px; font-size: var(--fs-base); }
  .com, .meta, .cred { font-size: var(--fs-head); color: var(--ink2); overflow-wrap: anywhere; }
  .meta { color: var(--mut, var(--ink3)); }
  .cred { display: block; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); margin-top: 2px; }
  .list { width: 100%; border-collapse: collapse; font-size: var(--fs-ui); }
  .list thead th { position: sticky; top: var(--bar-h, 0px); background: var(--bg); text-align: left; font-size: var(--fs-sm); font-weight: 500; color: var(--mut, var(--ink3)); border-bottom: 1px solid var(--ink); padding: 6px 8px 6px 0; }
  .list td, .list tbody th { border-bottom: 1px solid var(--rule2, var(--rule)); padding: 7px 8px 7px 0; vertical-align: top; text-align: left; font-weight: 400; }
  .list .com { display: block; }
  .list .num { text-align: right; white-space: nowrap; }
  .list .mut, .list .only { color: var(--mut, var(--ink3)); }
  .pager { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 16px 0 0; font-size: var(--fs-ui); color: var(--ink2); }
  .nothing { border-top: 1px solid var(--rule); padding: 16px 0; }
  .nothing .lead { margin: 0 0 6px; font-size: 1.0625rem; }
  .fixes { list-style: none; margin: 0; padding: 0; }
  .fixes li { border-top: 1px solid var(--rule2, var(--rule)); padding: 7px 0; display: flex; gap: 10px; }
  .foot { margin: 22px 0 0; padding-top: 10px; border-top: 1px solid var(--rule); font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  .sci, .bv :global(.sciname) { font-family: var(--serif); }
  @media (max-width: 899px) {
    .bv { grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 8px; }
    .phonebar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; position: sticky; top: var(--bar-h, 0px); z-index: 5; background: var(--bg); padding: 6px 0; border-bottom: 1px solid var(--rule); }
    /* The count and the view's switch held at the top as the results scroll (C9); the switch is in the bar, not the tools. */
    .views.pv { display: flex; }
    .views.wide-only { display: none; }
    .views.pv a { min-height: 44px; display: inline-flex; align-items: center; }
    .filters { min-height: 44px; padding: 0 14px; border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; background: var(--field, var(--bg)); color: var(--ink); font: inherit; }
    .rail { display: none; padding: 8px 0 16px; border-bottom: 1px solid var(--ink); }
    .rail.open { display: block; }
    /* A tip's 44 px target is centred on its "?" (Tip.svelte), and the last "?" of a line sits at the rail's right edge:
       its target reached 391.4 px on a 390 px phone, so the open sheet made the page a pixel wider than the screen.
       Chromium widened its viewport to match; Safari's engine scrolled sideways (round eighty-seven, the owner's predeploy:
       r87b 4). Clipped across, not down, so a target keeps its height and a tip's words, which open leftwards inside the
       rail, are whole. */
    .rail { overflow-x: clip; }
    .choices label, .modes label { min-height: 44px; }
    .into { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; }
    .acts { margin-left: 0; }
    .tools a, .pager a { min-height: 44px; display: inline-flex; align-items: center; }
    .views a { min-height: 40px; }
    .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; }
    .list thead { display: none; }
    .list, .list tbody, .list tr, .list td, .list tbody th { display: block; }
    .list tr { border-bottom: 1px solid var(--rule); padding: 8px 0; }
    .list td, .list tbody th { border: 0; padding: 1px 0; }
    .list td::before { content: attr(data-label) ': '; color: var(--mut, var(--ink3)); }
    .list .num { text-align: left; }
  }
  @media print { .phonebar, .rail, .tools, .pager { display: none; } .bv { display: block; } }
</style>

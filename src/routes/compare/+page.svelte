<script lang="ts">
  import NotChecked from '$lib/ui/NotChecked.svelte';
  /**
   * Species side by side: the same figures in the same order for each, with a
   * climograph per column, and the sheet's one-line rows beneath. Nothing is
   * compared for you: the columns are the pages' own figures next to each
   * other, each with its source, and a missing figure stays missing.
   */
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { cultivationSheet, CARD_ORDER } from '$core/sheet';
  import { frostWording } from '$core/extremes';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { compare } from '$lib/ui/compare.svelte';
  import { onMount } from 'svelte';
  import { searchCatalogue } from '$lib/ui/index.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { temp, rain, ruleRain, ruleDeltaT } from '$core/units';
  import { licenceLabel } from '$core/licence';
  import { failedBeforeHydration } from '$lib/ui/ref/failed';
  let { data } = $props();
  const u = $derived(units.current);
  // The grower's hemisphere, from the site or the first place with coordinates: the months follow it, as on the species page.
  const readerLat = $derived(site.current?.lat ?? (site.loaded ? (collection.ready ? (collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null) : null) : data.hemiLat));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  type D = (typeof data.items)[number];
  type Month = { tmax: number; tmin: number; precipMm: number; dli?: number };
  const col = (d: D) => {
    const cl = d.climate;
    const ok = cl.status === 'ok';
    const m: Month[] | null = cl.status === 'ok' ? cl.months : null;
    const idx = (f: (x: Month) => number, hi: boolean) => (m ? m.reduce((b: number, x: Month, i: number) => ((hi ? f(x) > f(m[b]) : f(x) < f(m[b])) ? i : b), 0) : 0);
    const hot = idx((x) => x.tmax, true), cold = idx((x) => x.tmin, false), wet = idx((x) => x.precipMm, true);
    const dlis = m ? m.map((x) => x.dli).filter((x): x is number => x != null) : [];
    const sheet = cultivationSheet({ scientific: d.name.scientific, climateStatus: cl.status, family: d.name.family, months: cl.status === 'ok' ? cl.months : null, p10: cl.status === 'ok' ? cl.p10 : null, p90: cl.status === 'ok' ? cl.p90 : null, annualP10: cl.status === 'ok' ? (cl.annualRain?.p10 ?? null) : null, annualP90: cl.status === 'ok' ? (cl.annualRain?.p90 ?? null) : null, extremes: cl.status === 'ok' ? (cl.extremes ?? null) : null, extremesStatus: cl.status === 'ok' ? cl.extremesStatus : null, lat: d.centroid?.lat ?? (cl.status === 'ok' ? cl.at.lat : null), units: u, readerLat });
    const hero = d.photos.find((p) => !p.captive) ?? d.photos[0];
    return {
      d,
      hero,
      ok,
      floor: sheet.floor,
      ex: cl.status === 'ok' ? (cl.extremes ?? null) : null,
      hot: m ? { v: m[hot].tmax, mo: MON[hot] } : null,
      cold: m ? { v: m[cold].tmin, mo: MON[cold] } : null,
      rain: m ? m.reduce((a, x) => a + x.precipMm, 0) : null,
      wet: m ? { mo: MON[wet], n: m.filter((x) => x.precipMm >= 25).length } : null,
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis) } : null,
      sheet,
      cards: CARD_ORDER.map((c) => ({ title: c, rows: sheet.rows.filter((r) => r.card === c) }))
    };
  };
  const cols = $derived(data.items.map(col));
  const cardTitles = $derived(CARD_ORDER.filter((t) => cols.some((c) => c.cards.find((x) => x.title === t)?.rows.length)));
  const climateWord = (d: D) => (d.climate.status === 'ok' ? '' : d.climate.status === 'pending' ? 'Climate pending' : d.climate.status === 'refused' ? 'Climate not checked: a source did not answer' : 'No habitat climate derived');
  $effect(() => {
    setCrumb([{ label: 'Species', href: '/' }, { label: 'Compare' }]);
    return () => setCrumb([]);
  });
  onMount(() => { compare.load(); site.load(); collection.load(); });

  /* ---- what differs, by a fixed rule, said on the page (round fifty-eight; the first-impression review) ---- */
  // The habitat's own figures only: the archetype table's convention is never a floor here either (round sixty; self-review 3).
  const coldOf = (c: (typeof cols)[number]) => (c.ex ? c.ex.minP01 : c.cold?.v ?? null);
  // A night is compared only with a night of the same kind: a 1st-percentile night and a month's mean night are different
  // figures, and ranking one against another was a comparison the rule does not make (round fifty-nine).
  const coldKind = (c: (typeof cols)[number]) => (c.ex ? 'night' : c.cold ? 'mean' : null);
  const coldKinds = $derived(new Set(cols.map(coldKind).filter(Boolean)));
  const spread = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x != null); return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0; };
  const differs = $derived({
    cold: coldKinds.size === 1 && spread(cols.map(coldOf)) > 2,
    hot: spread(cols.map((c) => c.hot?.v ?? null)) > 2,
    rain: (() => { const v = cols.map((c) => c.rain).filter((x): x is number => x != null); return v.length > 1 && Math.max(...v) > 1.25 * Math.min(...v) + 10; })(),
    light: spread(cols.map((c) => c.dli?.hi ?? null)) > 5
  });

  /* ---- the overlaid year: every column's mean day and mean night on one chart, so a phone sees them together ---- */
  const W = 340, H = 150, PADL = 30, PADB = 18;
  const COLOURS = ['var(--accent)', 'var(--warm)', 'var(--ink2)'];
  const overlay = $derived.by(() => {
    const ok = cols.filter((c) => c.d.climate.status === 'ok');
    if (ok.length < 2) return null;
    const series = ok.map((c) => (c.d.climate.status === 'ok' ? c.d.climate.months : []));
    const all = series.flatMap((m) => m.flatMap((x) => [x.tmax, x.tmin]));
    const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
    const x = (i: number) => PADL + (i * (W - PADL - 6)) / 11;
    const y = (t: number) => 6 + ((hi - t) * (H - PADB - 6)) / Math.max(1, hi - lo);
    const line = (m: Array<{ tmax: number; tmin: number }>, f: 'tmax' | 'tmin') => m.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v[f]).toFixed(1)}`).join('');
    const ticks = Array.from({ length: Math.floor((hi - lo) / 5) + 1 }, (_, i) => lo + i * 5);
    return { lines: ok.map((c, i) => ({ c, colour: COLOURS[i], day: line(series[i], 'tmax'), night: line(series[i], 'tmin') })), ticks, y, x };
  });
  /* ---- a picker on the page itself: the tray was the only way to choose ---- */
  let pq = $state('');
  let found = $state<Array<{ slug: string; name: string }>>([]);
  let seq = 0;
  $effect(() => {
    const text = pq.trim();
    const n = ++seq;
    if (text.length < 2) { found = []; return; }
    const t = setTimeout(() => { void searchCatalogue(text, 6).then((r) => { if (n === seq && Array.isArray(r)) found = r.map((e) => ({ slug: e.slug, name: e.name })); }); }, 200);
    return () => clearTimeout(t);
  });
  /** The header photograph's credit, its licence named once (as the species page's gallery words it), shown under it (round sixty; rule 1, the round forty-two review G). */
  const creditOf = (p: { attribution: string; licence?: Parameters<typeof licenceLabel>[0] }) => {
    const lic = licenceLabel(p.licence);
    const norm = (t: string) => t.replace(/[\s-]+/g, ' ').trim().toLowerCase();
    return !lic || norm(p.attribution).includes(norm(lic)) ? p.attribution : `${p.attribution} · ${lic}`;
  };
  /** Which header photographs have loaded, and which failed: none is shown until it has, so a failure before hydration never draws the browser's broken-image glyph (round sixty; visitor 4). */
  let shownImg = $state<Record<string, 'ok' | 'fail'>>({});
  const loaded = (img: HTMLImageElement, key: string) => {
    const mark = () => { if (img.complete && img.naturalWidth > 0) shownImg = { ...shownImg, [key]: 'ok' }; };
    img.addEventListener('load', mark);
    mark();
    return failedBeforeHydration(img, () => (shownImg = { ...shownImg, [key]: 'fail' }));
  };
  /* ---- the column names, pinned while the table scrolls on a phone, and moved sideways with it (round sixty; visitor 10) ---- */
  let table = $state<HTMLElement | null>(null);
  let shift = $state(0);
  let headGone = $state(false);
  $effect(() => {
    if (!table) return;
    const t = table;
    const onX = () => (shift = t.scrollLeft);
    t.addEventListener('scroll', onX, { passive: true });
    const head = t.querySelector('.head');
    const io = head ? new IntersectionObserver(([e]) => (headGone = !e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-44px 0px 0px 0px' }) : null;
    if (head && io) io.observe(head);
    return () => { t.removeEventListener('scroll', onX); io?.disconnect(); };
  });
  const withSlug = (slug: string) => `/compare?s=${[...new Set([...cols.map((c) => c.d.slug), slug])].slice(-3).join(',')}`;
  const without = (slug: string) => `/compare?s=${cols.map((c) => c.d.slug).filter((x) => x !== slug).join(',')}`;
</script>

<svelte:head>
  <title>Compare {cols.map((c) => c.d.name.scientific).join(' · ')} · Cultifolio</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHead title="Side by side" places={false} sub="The pages' own figures next to each other, each with its source; no verdict is drawn." />
{#if data.missing.length}<p class="notice">Not in the reference: {data.missing.join(', ')}.</p>{/if}
<!-- A page the reference lists but whose data could not be read just now is not an absence (round sixty; A6). -->
{#if data.unreadable?.length}<p class="notice">Could not be read just now: {data.unreadable.join(', ')}. The reference lists {data.unreadable.length === 1 ? 'it' : 'them'}; reload to try again.</p>{/if}
<div class="picker">
  <label for="cmp-q">{cols.length >= 3 ? 'Swap in a species' : 'Add a species'}</label>
  <input id="cmp-q" class="searchbar" type="search" bind:value={pq} placeholder="A name or a genus" autocomplete="off" />
  <!-- Announced as the answers change, and mounted from the start so a screen reader hears the first one (round sixty; a11y 11). -->
  <p class="visually-hidden" role="status">{pq.trim().length >= 2 ? `${found.length} match${found.length === 1 ? '' : 'es'}` : ''}</p>
  {#if found.length}
    <ul class="found">{#each found as f (f.slug)}<li><a href={withSlug(f.slug)} data-sveltekit-noscroll onclick={() => { pq = ''; }}><i>{f.name}</i></a>{#if cols.length >= 3}<span class="muted small"> replaces <i>{cols[0].d.name.scientific}</i></span>{/if}</li>{/each}</ul>
  {/if}
</div>
{#if !cols.length}
  <div class="emptybox">
    <p>Search for one above, or press <b>Compare</b> on a species page, up to three; the tray at the foot of the page brings you here.</p>
    {#if compare.picks.length >= 2}<p><a class="btn pri wrap" href={compare.href}>Compare these {compare.picks.length}</a> <span class="small muted">{#each compare.picks as p, i (p.slug)}{i ? ', ' : ''}<i>{p.name}</i>{/each}</span></p>{:else if compare.picks.length === 1}<p class="small muted">In the tray: <i>{compare.picks[0].name}</i>. One more to compare.</p>{/if}
  </div>
{/if}

{#if cols.length}
  {#if cols.length > 2}<p class="small muted swipehint">{cols.length} species side by side; on a narrow screen the table swipes sideways, and the third column shows at the edge.</p>{/if}
  <!-- The species' names, pinned under the top bar once the photographs have scrolled away, and moved sideways with the
       table, so every row below says whose figure is whose (round sixty; visitor 10). For the eye only: the table's own
       column headers name each value for a screen reader. -->
  <div class="pinnames" class:on={headGone} aria-hidden="true"><div class="pinrow" style="--n: {cols.length}; transform: translateX({-shift}px)">{#each cols as c (c.d.key)}<span><i>{c.d.name.scientific}</i></span>{/each}</div></div>
  <!-- A table to assistive technology: each value is announced with its row's figure and its column's species (round sixty; a11y 11). It scrolls sideways on a phone: reachable and scrollable by keyboard, and named (round fifty-eight; the accessibility review). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="cmp" style="--n: {cols.length}" tabindex="0" role="table" aria-label="Species side by side" bind:this={table}>
    <div class="row head" role="row">
      <span class="visually-hidden" role="columnheader">Figure</span>
      {#each cols as c (c.d.key)}
        <div class="cell" role="columnheader">
          <div class="hero">{#if c.hero}<img src={c.hero.thumb ?? c.hero.url} alt="{c.d.name.scientific}; photograph {c.hero.attribution}" loading="lazy" class:ready={shownImg[c.d.key] === 'ok'} use:loaded={String(c.d.key)} />{/if}</div>
          {#if c.hero && shownImg[c.d.key] !== 'fail'}<a class="cred" href={c.hero.page ?? c.hero.url} rel="noopener">{creditOf(c.hero)}</a>{/if}
          <a class="nm" href="/species/{c.d.slug}"><SpeciesName name={c.d.name.scientific} /></a>
          <div class="fam">{c.d.name.family ?? ''}{c.d.distribution.native.length ? ' · ' + c.d.distribution.native.slice(0, 2).map((r) => r.name).join(', ') : ''}</div>
          {#if cols.length > 1}<a class="drop small" href={without(c.d.slug)} data-sveltekit-noscroll aria-label="Take {c.d.name.scientific} out of the comparison">Remove</a>{/if}
          {#if c.d.climate.status === 'refused'}<div class="small muted hnote"><NotChecked what="Climate" why="A source did not answer when the species page was built." /></div>{:else if !c.ok}<div class="small muted hnote">{climateWord(c.d)}</div>{/if}
        </div>
      {/each}
    </div>

    <!-- "not used", not "set aside": what it means (round fifty-eight; the accessibility review). -->
    <div class="row" class:differs={differs.cold} role="row">
      <div class="rowlab" role="rowheader">Coldest nights in the wild{#if differs.cold}<span class="dif">differs</span>{:else if coldKinds.size > 1}<span class="kinds">figures of different kinds, not compared</span>{/if}</div>
      {#each cols as c (c.d.key)}<div class="cell fig" role="cell">{#if c.ex}<b>{temp(c.ex.minP01, u, 1)}</b><span>cold floor: 1 night in 100 colder over {c.ex.years} years; lowest {temp(c.ex.minAbs, u, 1)}, {frostWording(c.ex)} (NASA POWER)</span>{:else if c.cold}<b>{temp(c.cold.v, u, 1)}</b><span>{c.cold.mo} mean night at the habitat (CHELSA), not a floor; {c.d.climate.status === 'ok' && c.d.climate.extremesStatus === 'refused' ? 'extremes not checked' : c.d.climate.status === 'ok' && c.d.climate.extremesStatus === 'skipped' ? 'extremes not asked for' : c.d.climate.status === 'ok' && c.d.climate.extremesStatus === 'sea' ? 'extremes read at a sea cell, not used' : 'no extremes series'}</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="row" class:differs={differs.hot} role="row">
      <div class="rowlab" role="rowheader">Warmest days in the wild{#if differs.hot}<span class="dif">differs</span>{/if}</div>
      {#each cols as c (c.d.key)}<div class="cell fig" role="cell">{#if c.hot}<b>{temp(c.hot.v, u)}</b><span>{c.hot.mo} mean day at the habitat (CHELSA)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="row" class:differs={differs.rain} role="row">
      <div class="rowlab" role="rowheader">Rain in the wild{#if differs.rain}<span class="dif">differs</span>{/if}</div>
      {#each cols as c (c.d.key)}<div class="cell fig" role="cell">{#if c.rain != null && c.wet}<b>{rain(c.rain, u)}/yr</b><span>{c.wet.n === 0 ? `no month of ${ruleRain(25, u)} or more` : `${c.wet.n} month${c.wet.n === 1 ? '' : 's'} of ${ruleRain(25, u)} or more`} · wettest {c.wet.mo} at the habitat (CHELSA)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="row" class:differs={differs.light} role="row">
      <div class="rowlab" role="rowheader">Light in the wild{#if differs.light}<span class="dif">differs</span>{/if}</div>
      {#each cols as c (c.d.key)}<div class="cell fig" role="cell">{#if c.dli}<b>{c.dli.lo.toFixed(0)}–{c.dli.hi.toFixed(0)} DLI</b><span>mol/m²/day, lowest to highest month (CHELSA shortwave)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <!-- Each species' own chart is on its page: in a column of this table it was too small to read at any width, labels of
         four pixels at 1280 (round fifty-nine; the interface review). One small link per column (round sixty; visitor 10). -->
    <div class="row yearrow" role="row">
      <div class="rowlab" role="rowheader">The year</div>
      {#each cols as c (c.d.key)}
        <div class="cell" role="cell">
          {#if c.ok && c.d.climate.status === 'ok'}
            <a class="small" href="/species/{c.d.slug}#s-climate">Chart on its page ›</a>
          {:else}
            <div class="none small muted">{climateWord(c.d)}.</div>
          {/if}
        </div>
      {/each}
    </div>

    {#each cardTitles as t (t)}
      <div class="row" role="row">
        <div class="rowlab" role="rowheader">{t}</div>
        {#each cols as c (c.d.key)}
          <div class="cell sheet" role="cell">
            {#each c.cards.find((x) => x.title === t)?.rows ?? [] as r}<p>{r.short ?? r.s}</p>{:else}<p class="muted small">{climateWord(c.d) || 'no figure'}</p>{/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  {#if overlay}
    <div class="rowlab">The year, overlaid</div>
    <figure class="overlay">
      <svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="ov-t"><title id="ov-t">Mean day and mean night by month, each species in its own colour, habitat months</title>
        {#each overlay.ticks as t (t)}<line x1={PADL} x2={W - 4} y1={overlay.y(t)} y2={overlay.y(t)} class="grid" /><text x={PADL - 4} y={overlay.y(t) + 3} class="tick" text-anchor="end">{temp(t, u, 0).replace(/ ?°[CF]$/, '°')}</text>{/each}
        {#each ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as m, i (i)}<text x={overlay.x(i)} y={H - 4} class="tick" text-anchor="middle">{m}</text>{/each}
        {#each overlay.lines as l (l.c.d.key)}<path d={l.day} fill="none" stroke={l.colour} stroke-width="2" /><path d={l.night} fill="none" stroke={l.colour} stroke-width="2" stroke-dasharray="4 3" />{/each}
      </svg>
      <figcaption class="small muted">{#each overlay.lines as l, i (l.c.d.key)}{i ? ' · ' : ''}<span class="sw" style:background={l.colour}></span><i>{l.c.d.name.scientific}</i>{/each}. Solid: mean day; dashed: mean night (CHELSA, the habitat's own months).</figcaption>
    </figure>
  {/if}
  <p class="small muted" style="margin-top: 14px">Each figure is the species page's own, with the same source; the sheet lines are the cards' one-line forms. A row marked "differs" is shaded by a fixed rule, not a verdict: the coldest nights, when they are figures of one kind, or the warmest months' mean days, more than {ruleDeltaT(2, u)} apart; the year's rain, the larger more than a quarter above the smaller and {ruleRain(10, u)} besides; the light, the brightest months more than 5 DLI apart. Open a column's page for the spans, the cells and the evidence.</p>
{/if}

<style>
  .cmp { display: grid; gap: 0; margin-top: 14px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .row > .rowlab { grid-column: 1 / -1; }
  .head img { visibility: hidden; }
  .head img.ready { visibility: visible; }
  .head .cred { display: block; padding: 4px 14px 0; font-size: var(--fs-xs); color: var(--ink3); overflow-wrap: anywhere; }
  .pinnames { position: sticky; top: 44px; z-index: 30; height: 0; overflow-x: clip; overflow-y: visible; pointer-events: none; } /* clipped sideways: unclipped, the moved row widened the page on a phone */
  .pinnames .pinrow { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 12px; background: var(--bg); border-bottom: 1px solid var(--rule); padding: 6px 0; opacity: 0; transition: opacity 0.15s; }
  .pinnames.on .pinrow { opacity: 1; }
  .pinnames span { font-family: var(--serif); font-size: var(--fs-md); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 6px; }
  @media (prefers-reduced-motion: reduce) { .pinnames .pinrow { transition: none; } }
  .swipehint { margin: 10px 0 0; display: none; }
  .row { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 12px; }
  .rowlab { font-size: var(--fs-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin: 18px 0 6px; font-family: var(--ui); }
  .cell { background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 12px 14px; min-width: 0; }
  .head .cell { padding: 0 0 12px; overflow: hidden; }
  .head .hero { width: 100%; aspect-ratio: 4 / 3; background: var(--sunk); } /* the box is there whether the photograph is or not, so the names line up */
  .head img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .rowlab .dif, .rowlab .kinds { margin-left: 8px; letter-spacing: 0.04em; text-transform: none; font-weight: 600; }
  .rowlab .dif { color: var(--warm-ink); }
  .rowlab .kinds { color: var(--ink3); font-weight: 500; }
  .btn.wrap { white-space: normal; height: auto; }
  .head .nm { display: block; padding: 10px 14px 0; font-family: var(--serif); font-style: italic; font-size: var(--fs-xl); font-weight: 600; color: var(--ink); }
  .head .fam { padding: 3px 14px 0; font-size: var(--fs-sm); color: var(--ink2); }
  .head .hnote { padding: 6px 14px 0; }
  .fig b { display: block; font-family: var(--mono); font-size: var(--fs-2xl); font-weight: 500; letter-spacing: -0.02em; }
  .fig span { display: block; font-size: var(--fs-sm); color: var(--ink2); line-height: 1.45; margin-top: 3px; }
  .sheet p { margin: 0 0 6px; font-size: var(--fs-md); line-height: 1.5; }
  .sheet p:last-child { margin: 0; }
  .muted { color: var(--ink3); }
  .cell :global(.climo) { margin: 0; padding: 0; box-shadow: none; }
  .notice { margin: 10px 0 0; }
  .row.differs .cell { background: color-mix(in srgb, var(--warm) 10%, var(--card)); }
  .drop { display: inline-flex; align-items: center; margin: 2px 14px 0; color: var(--ink3); min-height: var(--tap); min-width: var(--tap); } /* 44 px under a finger (round sixty; a11y 6) */
  .picker { position: relative; margin: 12px 0 0; display: grid; gap: 4px; max-width: 28rem; min-width: 0; }
  .picker .searchbar { min-width: 0; width: 100%; }
  .picker label { font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); }
  .picker input { min-height: 44px; }
  .found { list-style: none; margin: 0; padding: 4px 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh2); }
  .found a { display: block; padding: 10px 14px; min-height: 44px; }
  .overlay { margin: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 10px 12px; }
  .overlay svg { width: 100%; max-width: 480px; height: auto; display: block; margin: 0 auto; } /* stretched to 960 its labels were 25 px (round fifty-nine) */
  .overlay .grid { stroke: var(--rule); stroke-width: 1; }
  .overlay .tick { font-size: 12px; fill: var(--ink3); font-family: var(--mono); } /* user units: 11 px or more on a phone, where the chart is drawn about 1:1 */
  .overlay .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  @media (max-width: 700px) {
    /* One scroller for the whole table, not one per row: a thumb drags the columns and every row follows, and the row labels stay put. */
    .cmp { overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; margin-right: -16px; padding-right: 16px; }
    /* Two to a phone's width and the third showing at the edge, a column's width short of whole, so it is seen to be there
       (round sixty; visitor 10: it was a 6 px sliver). */
    .row { grid-template-columns: repeat(var(--n), minmax(calc(43% - 6px), 1fr)); }
    .pinnames .pinrow { grid-template-columns: repeat(var(--n), minmax(calc(43% - 6px), 1fr)); width: max-content; min-width: 100%; }
    .row .cell { scroll-snap-align: start; }
    .rowlab { position: sticky; left: 0; width: max-content; background: var(--bg); padding: 0 8px 0 2px; }
    .swipehint { display: block; }
    .head .nm { font-size: var(--fs-lg); }
  }
</style>

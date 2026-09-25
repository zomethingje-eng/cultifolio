<script lang="ts">
  /**
   * Species side by side: the same figures in the same order for each, with a
   * climograph per column, and the sheet's one-line rows beneath. Nothing is
   * compared for you: the columns are the pages' own figures next to each
   * other, each with its source, and a missing figure stays missing.
   */
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Climograph from '$lib/ui/Climograph.svelte';
  import { cultivationSheet, CARD_ORDER } from '$core/sheet';
  import { frostWording } from '$core/extremes';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { compare } from '$lib/ui/compare.svelte';
  import { onMount } from 'svelte';
  import { units } from '$lib/ui/units.svelte';
  import { temp, rain } from '$core/units';
  let { data } = $props();
  const u = $derived(units.current);
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
    const sheet = cultivationSheet({ scientific: d.name.scientific, climateStatus: cl.status, family: d.name.family, months: cl.status === 'ok' ? cl.months : null, p10: cl.status === 'ok' ? cl.p10 : null, p90: cl.status === 'ok' ? cl.p90 : null, annualP10: cl.status === 'ok' ? (cl.annualRain?.p10 ?? null) : null, annualP90: cl.status === 'ok' ? (cl.annualRain?.p90 ?? null) : null, extremes: cl.status === 'ok' ? (cl.extremes ?? null) : null, lat: d.centroid?.lat ?? (cl.status === 'ok' ? cl.at.lat : null), units: u });
    const hero = d.photos.find((p) => !p.captive) ?? d.photos[0];
    return {
      d,
      hero,
      ok,
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
  onMount(() => compare.load());
</script>

<svelte:head>
  <title>Compare {cols.map((c) => c.d.name.scientific).join(' · ')} — Cultifolio</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<PageHead title="Side by side" places={false} sub="The pages' own figures next to each other, each with its source; no verdict is drawn." />
{#if data.missing.length}<p class="notice">Not in the reference: {data.missing.join(', ')}.</p>{/if}
{#if !cols.length}
  <div class="emptybox">
    <p>Pick species with the <b>Compare</b> button on their pages, up to three; the tray at the foot of the page brings you here.</p>
    {#if compare.picks.length >= 2}<p><a class="btn pri" href={compare.href}>Compare {compare.picks.map((p) => p.name).join(', ')}</a></p>{:else if compare.picks.length === 1}<p class="small muted">In the tray: <i>{compare.picks[0].name}</i>. One more to compare.</p>{/if}
  </div>
{/if}

{#if cols.length}
  <div class="cmp" style="--n: {cols.length}">
    <div class="row head">
      {#each cols as c (c.d.key)}
        <div class="cell">
          {#if c.hero}<img src={c.hero.thumb ?? c.hero.url} alt="" loading="lazy" />{/if}
          <a class="nm" href="/species/{c.d.slug}"><SpeciesName name={c.d.name.scientific} /></a>
          <div class="fam">{c.d.name.family ?? ''}{c.d.distribution.native.length ? ' · ' + c.d.distribution.native.slice(0, 2).map((r) => r.name).join(', ') : ''}</div>
          {#if !c.ok}<div class="small muted">{climateWord(c.d)}</div>{/if}
        </div>
      {/each}
    </div>

    <div class="rowlab">Cold floor</div>
    <div class="row">
      {#each cols as c (c.d.key)}<div class="cell fig">{#if c.ex}<b>{temp(c.ex.minP01, u, 1)}</b><span>1st-percentile night over {c.ex.years} yrs; lowest {temp(c.ex.minAbs, u, 1)}, {frostWording(c.ex)} (NASA POWER)</span>{:else if c.cold}<b>{temp(c.cold.v, u)}</b><span>{c.cold.mo}, mean night (CHELSA); no extremes series</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="rowlab">Warmest month</div>
    <div class="row">
      {#each cols as c (c.d.key)}<div class="cell fig">{#if c.hot}<b>{temp(c.hot.v, u)}</b><span>{c.hot.mo}, mean day (CHELSA)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="rowlab">Rain</div>
    <div class="row">
      {#each cols as c (c.d.key)}<div class="cell fig">{#if c.rain != null && c.wet}<b>{rain(c.rain, u)}/yr</b><span>{c.wet.n === 0 ? 'no wet month' : `${c.wet.n} wet month${c.wet.n === 1 ? '' : 's'}`} · peak {c.wet.mo} (CHELSA)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>
    <div class="rowlab">Light</div>
    <div class="row">
      {#each cols as c (c.d.key)}<div class="cell fig">{#if c.dli}<b>{c.dli.lo.toFixed(0)}–{c.dli.hi.toFixed(0)} DLI</b><span>mol/m²/day, winter to summer (CHELSA shortwave)</span>{:else}<span class="muted small">{climateWord(c.d) || 'no figure'}</span>{/if}</div>{/each}
    </div>

    <div class="rowlab">The year</div>
    <div class="row">
      {#each cols as c (c.d.key)}
        <div class="cell">
          {#if c.ok && c.d.climate.status === 'ok'}
            <Climograph climate={{ months: c.d.climate.months, p10: c.d.climate.p10, p90: c.d.climate.p90, cells: c.d.climate.cells, extremes: c.d.climate.extremes ?? null }} id="climo-{c.d.key}" />
          {:else}
            <div class="none small muted">{climateWord(c.d)}.</div>
          {/if}
        </div>
      {/each}
    </div>

    {#each cardTitles as t (t)}
      <div class="rowlab">{t}</div>
      <div class="row">
        {#each cols as c (c.d.key)}
          <div class="cell sheet">
            {#each c.cards.find((x) => x.title === t)?.rows ?? [] as r}<p>{r.short ?? r.s}</p>{:else}<p class="muted small">{climateWord(c.d) || 'no figure'}</p>{/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <p class="small muted" style="margin-top: 14px">Each figure is the species page's own, with the same source; the sheet lines are the cards' one-line forms. Open a column's page for the spans, the cells and the evidence.</p>
{/if}

<style>
  .cmp { display: grid; gap: 0; margin-top: 14px; }
  .row { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 12px; }
  .rowlab { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin: 18px 0 6px; font-family: var(--ui); }
  .cell { background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 12px 14px; min-width: 0; }
  .head .cell { padding: 0 0 12px; overflow: hidden; }
  .head img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--sunk); }
  .head .nm { display: block; padding: 10px 14px 0; font-family: var(--serif); font-style: italic; font-size: 19px; font-weight: 600; color: var(--ink); }
  .head .fam { padding: 3px 14px 0; font-size: 12px; color: var(--ink2); }
  .fig b { display: block; font-family: var(--mono); font-size: 22px; font-weight: 500; letter-spacing: -0.02em; }
  .fig span { display: block; font-size: 12px; color: var(--ink2); line-height: 1.45; margin-top: 3px; }
  .sheet p { margin: 0 0 6px; font-size: 13.5px; line-height: 1.5; }
  .sheet p:last-child { margin: 0; }
  .muted { color: var(--ink3); }
  .cell :global(.climo) { margin: 0; padding: 0; box-shadow: none; }
  .notice { margin: 10px 0 0; }
  @media (max-width: 700px) {
    /* One scroller for the whole table, not one per row: a thumb drags the columns and every row follows, and the row labels stay put. */
    .cmp { overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; margin-right: -16px; padding-right: 16px; }
    .row { grid-template-columns: repeat(var(--n), minmax(220px, 1fr)); }
    .row .cell { scroll-snap-align: start; }
    .rowlab { position: sticky; left: 0; width: max-content; }
    .head .nm { font-size: 16px; }
  }
</style>

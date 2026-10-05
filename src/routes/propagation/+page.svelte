<script lang="ts">
  import { plural } from '$core/words';
  import { onMount } from 'svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { PROP_METHODS } from '$lib/db/types';
  import { plantHref, batchHref } from '$lib/db/links';
  import PlantName from '$lib/ui/PlantName.svelte';
  onMount(() => collection.load());
  let show = $state<'active' | 'all'>('active');
  // The table is wider than a phone: a fade on the right says there is more until the reader has scrolled to it (round twenty-three, 19).
  let scroller = $state<HTMLDivElement | null>(null);
  let atEnd = $state(true);
  const measure = () => { const el = scroller; atEnd = !el || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2; };
  $effect(() => {
    const el = scroller;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  // Nothing in progress but batches on file: open on All rather than on an empty list.
  $effect(() => { if (collection.ready && collection.sowings.length && !collection.sowings.some((s) => s.status === 'active')) show = 'all'; });
  // `counted`: whether any count is on the log, so a card says "not counted yet" rather than "0 up" for a pot nobody has looked at (round fifty-eight; the grower review).
  const rows = $derived(collection.sowings.filter((s) => show === 'all' || s.status === 'active').map((s) => ({ s, st: collection.sowingStats(s.id), counted: collection.events(s.id).some((e) => e.t === 'germinate'), m: PROP_METHODS.find((m) => m.k === s.method) ?? { k: s.method, label: s.method, unit: 'units', veg: false } })));  // a method this build does not know (a newer build's) is shown by its word, not as seed (round thirty, 1)
  const parentNo = (id: string) => { const a = collection.accession(id); return a ? accNo(a) : id; };
  const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
</script>

<svelte:head><title>Propagation · Cultifolio</title></svelte:head>

<PageHead compact title="Propagation" sub="Seed, cuttings, offsets and divisions, a batch each, counted up; each potted survivor gets its own number." count="{collection.sowings.filter((s) => s.status === 'active').length} in progress · {plural(collection.sowings.length, 'batch', 'batches')}">
  <a class="btn pri" href="/propagation/new">New batch</a>
</PageHead>

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else}
  <!-- The one toggle group, as chips, with a name for the group (round fifty-eight; the accessibility review). -->
  <ToggleGroup chips label="Which batches" bind:value={show} options={[{ value: 'active', label: 'In progress', n: collection.sowings.filter((s) => s.status === 'active').length }, { value: 'all', label: 'All', n: collection.sowings.length }]} />
  {#if !rows.length}
    <div class="emptybox"><p class="muted">{show === 'active' ? 'Nothing in progress.' : 'No batches yet.'} <a href="/propagation/new">Start one.</a></p></div>
  {:else}
    <!-- Under 640px the table was cut off at Date: a phone gets one card per batch with the same figures, the table stays above it. Two renderings, one hidden per width by CSS (round fifty-eight; the grower review). -->
    <ul class="bcards" aria-label="Batches">
      {#each rows as { s, st, m, counted } (s.id)}
        <li><a class="bcard" href={batchHref(s)}>
          <span class="top"><span class="accno">{sowNo(s)}</span><span class="pill {s.status === 'active' ? 'ok' : s.status === 'failed' ? 'bad' : ''}">{s.status === 'active' ? 'in progress' : s.status}</span></span>
          <span class="nm"><PlantName plant={s} /></span>
          <span class="meta">{m.label}{#if s.parentAcc}{' '}from <span class="mono">{parentNo(s.parentAcc)}</span>{/if} · {m.veg ? 'started' : 'sown'} {s.sown} · day {st.days}</span>
          <span class="figs">{s.count} {m.unit} · {#if counted}{st.germinated} {m.veg ? 'struck' : 'up'} ({pct(st.rate)}){:else}not counted yet{/if} · {st.potted} potted · {st.lost} lost</span>
        </a></li>
      {/each}
    </ul>
    <!-- A region that scrolls sideways is reachable by keyboard and named, so arrow keys can scroll it (round fifty-eight; the accessibility review). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="scroll-x cue wide" class:end={atEnd} bind:this={scroller} onscroll={measure} tabindex="0" role="region" aria-label="Batches as a table">
      <table class="wx">
        <thead><tr><th>Batch</th><th>Species</th><th>Method</th><th>Date</th><th>Days</th><th>Started</th><th>Up</th><th>Rate</th><th>Potted</th><th>Status</th></tr></thead>
        <tbody>
          {#each rows as { s, st, m }}
            <tr>
              <td><a class="mono" href={batchHref(s)}>{sowNo(s)}</a></td>
              <td class="left"><PlantName plant={s} /></td>
              <td class="left">{m.label}{#if s.parentAcc}{@const pa = collection.accession(s.parentAcc)}{' '}<span class="faint">from <a class="mono" href={pa ? plantHref(pa) : `/plants/${s.parentAcc}`}>{pa ? accNo(pa) : s.parentAcc}</a></span>{/if}</td>
              <td class="left">{s.sown}</td>
              <td>{st.days}</td>
              <td>{s.count}</td>
              <td>{st.germinated}</td>
              <td>{pct(st.rate)}</td>
              <td>{st.potted}</td>
              <td class="left"><span class="pill {s.status === 'active' ? 'ok' : s.status === 'failed' ? 'bad' : ''}">{s.status === 'active' ? 'in progress' : s.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  table.wx td.left { text-align: left; font-family: var(--ui); font-weight: 400; }
  table.wx a.mono { font-size: inherit; } /* the cell's own size: 0.86em of it was 10.3 px (round fifty-nine) */
  .muted { color: var(--ink3); }
  .bcards { display: none; list-style: none; margin: 14px 0; padding: 0; gap: 10px; }
  .bcards li { min-width: 0; }
  .bcard { min-width: 0; overflow-wrap: break-word; } /* 200% text at 320 px: the card shrinks to the screen and its lines wrap (round sixty; the accessibility review, 5) */
  .bcard .top { flex-wrap: wrap; }
  .bcard { display: grid; gap: 4px; min-height: 44px; padding: 12px 15px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); color: var(--ink); text-decoration: none; }
  .bcard:hover { text-decoration: none; }
  .bcard .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .bcard .nm { font-family: var(--serif); font-size: var(--fs-lg); line-height: 1.3; } /* SpeciesName sets the italics: the rank word and a cultivar stay roman */
  .bcard .meta, .bcard .figs { font-size: var(--fs-md); color: var(--ink2); line-height: 1.5; }
  .bcard .figs { font-family: var(--mono); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
  @media (max-width: 640px) { .bcards { display: grid; } .wide { display: none; } }
</style>

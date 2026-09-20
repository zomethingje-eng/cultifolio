<script lang="ts">
  import { plural } from '$core/words';
  import { onMount } from 'svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { PROP_METHODS } from '$lib/db/types';
  onMount(() => collection.load());
  let show = $state<'active' | 'all'>('active');
  const rows = $derived(collection.sowings.filter((s) => show === 'all' || s.status === 'active').map((s) => ({ s, st: collection.sowingStats(s.id), m: PROP_METHODS.find((m) => m.k === s.method) ?? PROP_METHODS[0] })));
  const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
</script>

<svelte:head><title>Sowings — Cultifolio</title></svelte:head>

<PageHead title="Sowings" sub="Every propagation batch: seed, cuttings, offsets, divisions. Count what comes up, pot up what survives, and each potted plant gets its own number with the batch as its provenance." count="{collection.sowings.filter((s) => s.status === 'active').length} in progress · {plural(collection.sowings.length, 'batch', 'batches')}">
  <a class="btn pri" href="/sowings/new">New sowing</a>
</PageHead>

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else}
  <div class="chiprow">
    <button class="chipbtn" class:on={show === 'active'} onclick={() => (show = 'active')}>In progress<span class="n">{collection.sowings.filter((s) => s.status === 'active').length}</span></button>
    <button class="chipbtn" class:on={show === 'all'} onclick={() => (show = 'all')}>All<span class="n">{collection.sowings.length}</span></button>
  </div>
  {#if !rows.length}
    <div class="emptybox"><p class="muted">{show === 'active' ? 'Nothing in progress.' : 'No sowings yet.'} <a href="/sowings/new">Start one.</a></p></div>
  {:else}
    <div class="scroll-x">
      <table class="wx">
        <thead><tr><th>Batch</th><th>Species</th><th>Method</th><th>Sown</th><th>Days</th><th>Started</th><th>Up</th><th>Rate</th><th>Potted</th><th>Status</th></tr></thead>
        <tbody>
          {#each rows as { s, st, m }}
            <tr>
              <td><a class="mono" href="/sowings/{sowNo(s)}">{sowNo(s)}</a></td>
              <td class="left"><SpeciesName name={s.taxonName} />{#if s.cultivar} ‘{s.cultivar}’{/if}</td>
              <td class="left">{m.label}{#if s.parentAcc} <span class="faint">from <a class="mono" href="/plants/{s.parentAcc}">{collection.accession(s.parentAcc) ? accNo(collection.accession(s.parentAcc)!) : s.parentAcc}</a></span>{/if}</td>
              <td class="left">{s.sown}</td>
              <td>{st.days}</td>
              <td>{s.count}</td>
              <td>{st.germinated}</td>
              <td>{pct(st.rate)}</td>
              <td>{st.potted}</td>
              <td class="left"><span class="pill {s.status === 'active' ? 'ok' : s.status === 'failed' ? 'bad' : ''}">{s.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  table.wx td.left { text-align: left; font-family: var(--ui); font-weight: 400; }
  .muted { color: var(--ink3); }
</style>

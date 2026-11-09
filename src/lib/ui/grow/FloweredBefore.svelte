<script lang="ts">
  /**
   * "Flowered this week in past years" on Today (round eighty-seven, F8): the plants whose own flower lines fall within
   * three days of today's date in an earlier year (`floweredThisWeekBefore`). A plain reading of the grower's log; nothing
   * is written, and a plant with no flower line is not here, whatever its species does in habitat. Dead and removed plants
   * are left out; an archived one is kept, since the grower may still have it.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo } from '$lib/db/types';
  import { plantHref } from '$lib/db/links';
  import { today as day } from '$lib/ui/day.svelte';
  import { floweredThisWeekBefore } from './flowered';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  const list = $derived.by(() => {
    if (!collection.ready) return [];
    const ids = collection.accessions.filter((a) => a.status !== 'dead').map((a) => a.id);
    return floweredThisWeekBefore(ids, (id) => collection.events(id), day.current).slice(0, 12);
  });
</script>

{#if list.length}
  <div class="fb" id="flowered-before">
    <h3 class="fbh">Flowered this week in past years</h3>
    <ul>
      {#each list as f (f.id)}
        {@const a = collection.accession(f.id)}
        {#if a}<li><a href={plantHref(a)}><span class="accno">{accNo(a)}</span>{' '}<SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</a><span class="yrs">{' '}{f.years.map((y) => y.d).join(', ')}</span></li>{/if}
      {/each}
    </ul>
    <p class="small muted">From your own flower lines dated within three days of today in an earlier year. <a href="/plants/flowering">The flowering calendar</a>.</p>
  </div>
{/if}

<style>
  .fb { margin: 0 0 12px; }
  .fbh { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 600; margin: 0 0 4px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-height: var(--tap); padding: 6px 0; border-bottom: 1px solid var(--rule); font-size: var(--fs-md); }
  .yrs { color: var(--ink2); font-variant-numeric: tabular-nums lining-nums; }
  .small { font-size: var(--fs-sm); margin: 6px 0 0; }
  .muted { color: var(--ink3); }
  /* Round eighty-seven, stage-3 integration (DESIGN-87: data looks like data, no chips): a number as plain figures. */
  .accno { background: none; padding: 0; border-radius: 0; font-variant-numeric: tabular-nums lining-nums; }
</style>

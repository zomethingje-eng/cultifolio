<script lang="ts">
  /**
   * The flowering calendar (round eighty-seven, F8): which of the grower's plants flowered in which month, from their own
   * flower lines, every year together. A cell holds the years the plant flowered in that month; the foot row counts the
   * plants each month. Read from the log (`floweringCalendar`); nothing is written, nothing asked of anyone. The species
   * page's "Flowering by month" is the wild record and is another thing; a plant with no flower line is not here.
   */
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import Opening from '$lib/db/Opening.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { accNo } from '$lib/db/types';
  import { plantHref } from '$lib/db/links';
  import { today as day } from '$lib/ui/day.svelte';
  import { floweringCalendar, monthTotals } from '$lib/ui/grow/flowered';
  onMount(() => collection.load());
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Flowering calendar' }]);
    return () => setCrumb([]);
  });
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** Growing plants by default; every plant not removed, the dead included, on request: a dead plant's flowerings are still the grower's record. */
  let all = $state(false);
  const rows = $derived(collection.ready ? floweringCalendar(collection.accessions.filter((a) => all || a.status === 'growing').map((a) => a.id), (id) => collection.events(id), day.current) : []);
  const totals = $derived(monthTotals(rows));
  const yearsWord = (ys: number[]) => (ys.length === 1 ? String(ys[0]) : `${ys.length} years: ${ys.join(', ')}`);
</script>

<svelte:head><title>Flowering calendar · Cultifolio</title></svelte:head>

<PageHead compact title="Flowering calendar" sub="Which of your plants flowered in which month, from the flowerings you recorded." count={rows.length ? `${rows.length} ${rows.length === 1 ? 'plant' : 'plants'}` : undefined} />

{#if !collection.ready}
  <Opening />
{:else}
  <p class="small muted lead">From your own flower lines, every year together. Record a flowering on a plant's page, under More, Flower.{' '}<label class="allchk"><input id="fc-all" type="checkbox" bind:checked={all} /> Dead and archived plants too</label></p>
  {#if !rows.length}
    <p class="empty" id="fc-empty">No flowering recorded{all ? '' : ' on a growing plant'} yet.</p>
  {:else}
    <div class="wrap">
      <table class="fc" id="flowering-calendar">
        <caption class="sr">Plants by the months they flowered in</caption>
        <thead><tr><th scope="col">Plant</th>{#each MONTHS as m, i}<th scope="col" title={MONTHS_LONG[i]}><abbr title={MONTHS_LONG[i]}>{m}</abbr></th>{/each}</tr></thead>
        <tbody>
          {#each rows as r (r.id)}
            {@const a = collection.accession(r.id)}
            {#if a}
              <tr>
                <th scope="row"><a href={plantHref(a)}><span class="accno">{accNo(a)}</span>{' '}<SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</a>{#if a.status !== 'growing'}<span class="st">{' '}({a.status})</span>{/if}
                  <!-- On a phone the row is a stack: the months it flowered in, said in words under the name. -->
                  <span class="phone">{r.months.map((ys, i) => (ys.length ? `${MONTHS[i]} (${ys.join(', ')})` : '')).filter(Boolean).join(' · ')}</span></th>
                {#each r.months as ys, i}<td class:on={ys.length > 0} title={ys.length ? `${MONTHS_LONG[i]}: ${yearsWord(ys)}` : undefined}>{#if ys.length}<span class="sr">{MONTHS_LONG[i]}: </span>{ys.length}<span class="sr"> ({ys.join(', ')})</span>{/if}</td>{/each}
              </tr>
            {/if}
          {/each}
        </tbody>
        <tfoot><tr><th scope="row">Plants</th>{#each totals as n}<td>{n || ''}</td>{/each}</tr></tfoot>
      </table>
    </div>
    <p class="small muted">A figure is the number of years the plant flowered in that month; pointing at it names the years.</p>
  {/if}
{/if}

<style>
  .lead { margin: 4px 0 12px; }
  .allchk { display: inline-flex; align-items: center; gap: 6px; min-height: var(--tap); }
  .wrap { overflow-x: auto; }
  .fc { width: 100%; border-collapse: collapse; font-size: var(--fs-md); font-variant-numeric: tabular-nums lining-nums; }
  .fc th, .fc td { padding: 6px 4px; border-bottom: 1px solid var(--rule); text-align: center; }
  .fc thead th { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 600; border-bottom: 1px solid var(--ink); }
  .fc thead th:first-child, .fc tbody th, .fc tfoot th { text-align: left; padding-left: 0; }
  .fc tbody th { font-weight: 400; }
  .fc td.on { background: var(--sunk); color: var(--ink); font-weight: 600; }
  .fc tfoot td, .fc tfoot th { color: var(--ink2); border-bottom: 0; border-top: 1px solid var(--ink); }
  .fc abbr { text-decoration: none; }
  .st { color: var(--ink3); }
  .phone { display: none; }
  .small { font-size: var(--fs-sm); }
  .muted { color: var(--ink3); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* A phone: no sideways scroll; each plant a row with its months in words (DESIGN-87: tables become stacked rows). */
  @media (max-width: 640px) {
    .wrap { overflow: visible; }
    .fc thead, .fc tfoot, .fc td { display: none; }
    .fc tr { display: block; padding: 8px 0; border-bottom: 1px solid var(--rule); }
    .fc tbody th { display: block; border: 0; padding: 0; }
    .phone { display: block; color: var(--ink2); font-size: var(--fs-sm); margin-top: 2px; }
  }
  /* Round eighty-seven, stage-3 integration (DESIGN-87: data looks like data, no chips): a number as plain figures. */
  .accno { background: none; padding: 0; border-radius: 0; font-variant-numeric: tabular-nums lining-nums; }
</style>

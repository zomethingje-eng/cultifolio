<script lang="ts">
  /**
   * No longer held (round eighty-seven, t1; the plan's F1): every plant the collection has stopped holding, kept, never
   * deleted. Plants recorded as no longer held, with the reason, the day and the note; plants marked dead before a reason
   * was kept; and plants removed, whose records stay in the change log. Each opens its own page, which offers Restore.
   */
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import Opening from '$lib/db/Opening.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import PlantName from '$lib/ui/PlantName.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { plantHref } from '$lib/db/links';
  import { accNo, type Accession } from '$lib/db/types';
  import { DEACC_LABEL, DEACC_REASONS, identityOf, type DeaccReason } from '$core/identity';
  import { toast } from '$lib/ui/toast.svelte';
  import { restoredWords } from '$lib/ui/held-words';
  onMount(() => { collection.load(); });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'No longer held' }]);
    return () => setCrumb([]);
  });
  const gone = $derived(collection.ready ? collection.noLongerHeld() : { deaccessioned: [], dead: [], removed: [] });
  /** The deaccessioned plants by reason, in the reasons' order, each list newest day first. */
  const byReason = $derived(DEACC_REASONS.map((r) => ({ r, plants: gone.deaccessioned.filter((a) => a.deacc === r).sort((x, y) => String(y.deaccOn ?? '').localeCompare(String(x.deaccOn ?? ''))) })).filter((g) => g.plants.length));
  const total = $derived(gone.deaccessioned.length + gone.dead.length + gone.removed.length);
  let busy = $state<string | null>(null);
  async function restoreRemoved(a: Accession) {
    if (busy) return;
    busy = a.id;
    try {
      const moved = await collection.restore('accession', a.id);
      toast.show(moved ? restoredWords(moved, 'plant') : `${accNo(a)} restored.`);
    } catch { /* refused: the plants page says so from lastWriteError */ } finally { busy = null; }
  }
  const reasonWord = (r: DeaccReason) => DEACC_LABEL[r];
</script>

<svelte:head><title>No longer held · Cultifolio</title></svelte:head>

<PageHead compact title="No longer held" sub="Plants you no longer have. Each keeps its number, its record, its log and its photographs." count={collection.ready && total ? `${total}` : undefined} />

{#if !collection.ready}
  <Opening />
{:else if !total}
  <p class="muted" id="gone-empty">Nothing here. A plant that died, was given away or was lost is recorded from its own page, under "No longer held…", and is listed here, with the reason.</p>
{:else}
  {#each byReason as g (g.r)}
    <section class="gone" aria-labelledby="gone-{g.r}">
      <div class="secrule"><h2 id="gone-{g.r}">{reasonWord(g.r)}</h2><div class="line"></div><span class="n">{g.plants.length}</span></div>
      <table class="gonelist">
        <thead><tr><th scope="col">Number</th><th scope="col">Plant</th><th scope="col">Since</th><th scope="col">Note</th></tr></thead>
        <tbody>
          {#each g.plants as a (a.id)}
            {@const x = identityOf(a as unknown as Record<string, unknown>)}
            <tr><td class="no"><a class="mono" href={plantHref(a)}>{accNo(a)}</a></td><td><PlantName plant={a} /></td><td class="day">{x.deaccOn ?? 'day not recorded'}</td><td>{x.deaccNote ?? ''}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
  {#if gone.dead.length}
    <section class="gone" aria-labelledby="gone-dead">
      <div class="secrule"><h2 id="gone-dead">Marked dead</h2><div class="line"></div><span class="n">{gone.dead.length}</span></div>
      <p class="small muted">Marked dead with no reason recorded beside it, as plants were before "No longer held" kept one.</p>
      <table class="gonelist">
        <thead><tr><th scope="col">Number</th><th scope="col">Plant</th></tr></thead>
        <tbody>{#each gone.dead as a (a.id)}<tr><td class="no"><a class="mono" href={plantHref(a)}>{accNo(a)}</a></td><td><PlantName plant={a} /></td></tr>{/each}</tbody>
      </table>
    </section>
  {/if}
  {#if gone.removed.length}
    <section class="gone" aria-labelledby="gone-removed">
      <div class="secrule"><h2 id="gone-removed">Removed</h2><div class="line"></div><span class="n">{gone.removed.length}</span></div>
      <p class="small muted">Removed with no reason: a record made by mistake, or a plant removed before a reason could be kept. Each record is still in the change log, and Restore brings it back as it was.</p>
      <table class="gonelist">
        <thead><tr><th scope="col">Number</th><th scope="col">Plant</th><th scope="col"><span class="sr">Restore</span></th></tr></thead>
        <tbody>{#each gone.removed as a (a.id)}<tr><td class="no"><a class="mono" href="/plants/{encodeURIComponent(a.id)}">{accNo(a)}</a></td><td><PlantName plant={a} /></td><td><button class="btn small" type="button" onclick={() => restoreRemoved(a)} aria-disabled={busy === a.id} aria-label="Restore {accNo(a)}">Restore</button></td></tr>{/each}</tbody>
      </table>
    </section>
  {/if}
{/if}

<style>
  .gone { margin-top: 1.5rem; }
  .gonelist { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
  .gonelist th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--ink); padding: 4px 8px 4px 0; }
  .gonelist td { border-bottom: 1px solid var(--rule2, var(--rule)); padding: 6px 8px 6px 0; vertical-align: baseline; overflow-wrap: anywhere; }
  .gonelist td.no, .gonelist td.day { white-space: nowrap; font-variant-numeric: tabular-nums lining-nums; }
  .gonelist :global(a) { display: inline-flex; align-items: center; min-height: 44px; }
  /* A phone stacks each row: the number and plant on one line, the day and note under it, no sideways scroll at 320. */
  @media (max-width: 520px) {
    .gonelist thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .gonelist tr { display: block; border-bottom: 1px solid var(--rule2, var(--rule)); padding: 6px 0; }
    .gonelist td { display: inline; border: 0; padding: 0 8px 0 0; }
    .gonelist td.day { display: block; white-space: normal; }
  }
</style>

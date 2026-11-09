<script lang="ts">
  /**
   * A plant's lineage on its page (round eighty-seven, F4): its parents and its offspring, one step each way, as links
   * that work whether the other plant is still here or not, and the crosses it took part in, each with the batches sown
   * from it. Read from the log by `$lib/db/lineage`; nothing here writes. A cross's parentage is said beside the plant's
   * name, never in its place: the name is the reference's, and the cross is what the grower recorded.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { sowNo, type Accession } from '$lib/db/types';
  import { batchHref } from '$lib/db/links';
  import { ROLE_WORDS, HOW_WORDS, childWords } from '$lib/db/lineage';
  import PlantRef from './PlantRef.svelte';
  let { plant }: { plant: Accession } = $props();
  const parents = $derived(collection.parentsOf(plant));
  const children = $derived(collection.childrenOf(plant.id));
  const crosses = $derived(collection.crossesOf(plant.id));
  const via = (p: { via: { kind: string; id?: string; batch?: string } }) => {
    if (p.via.kind === 'batch' || p.via.kind === 'cross') { const s = collection.sowing(p.via.kind === 'batch' ? p.via.id! : p.via.batch!); return s ? s : null; }
    return null;
  };
</script>

{#if parents.length || children.length || crosses.length}
  <div class="secrule" id="lineage"><h2>Lineage</h2><div class="line"></div><span class="n">{parents.length + children.length || ''}</span></div>
  <table class="lin">
    <caption class="sr">Parents and offspring of this plant</caption>
    <thead><tr><th scope="col">Part</th><th scope="col">Plant</th><th scope="col">How, when</th></tr></thead>
    <tbody>
      {#each parents as p (p.role + p.id)}
        {@const b = via(p)}
        <tr class="par"><th scope="row">{ROLE_WORDS[p.role]}</th><td><PlantRef id={p.id} /></td><td>{#if p.role === 'mother'}{p.how ? (HOW_WORDS[p.how] ?? p.how) : 'taken'}{:else if p.role === 'seed' || p.role === 'pollen'}crossed{:else}grafted{/if}{#if p.d}{' '}<span class="d">{p.d}</span>{/if}{#if b}{' · '}raised in <a href={batchHref(b)}>{sowNo(b)}</a>{/if}</td></tr>
      {/each}
      {#each children as c (c.id + c.role)}
        <tr class="kid"><th scope="row">Offspring</th><td><PlantRef id={c.id} /></td><td>{childWords(c)}{#if c.d}{' '}<span class="d">{c.d}</span>{/if}</td></tr>
      {/each}
    </tbody>
  </table>
  {#if crosses.length}
    <h3 class="sub" id="crosses">Crosses</h3>
    <ul class="crosses">
      {#each crosses as c (c.id)}
        {@const sown = collection.sownFrom(c.id)}
        <li><span class="d">{c.d ?? 'no date'}</span>{' '}<span class="pair">{#if c.as === 'seed'}this plant × <PlantRef id={c.pollen} />{:else}<PlantRef id={c.seed} /> × this plant{/if}</span>{#if c.note}<span class="note">{' · '}{c.note}</span>{/if}{' · '}{#if sown.length}sown in {#each sown as s, i (s.id)}{i ? ', ' : ''}<a href={batchHref(s)}>{sowNo(s)}</a>{/each}{:else}not sown yet{/if}{' · '}<a class="tap" href="/propagation/new?cross={encodeURIComponent(c.id)}">Sow seed from this cross</a></li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .lin { width: 100%; border-collapse: collapse; font-size: var(--fs-md); margin: 4px 0 8px; font-variant-numeric: tabular-nums lining-nums; }
  .lin th, .lin td { text-align: left; padding: 7px 8px 7px 0; vertical-align: top; border-bottom: 1px solid var(--rule); }
  .lin thead th { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 600; border-bottom: 1px solid var(--ink); }
  .lin tbody th { font-weight: 600; color: var(--ink2); white-space: nowrap; }
  .lin .d, .crosses .d { white-space: nowrap; color: var(--ink2); }
  .sub { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 600; margin: 14px 0 4px; }
  .crosses { list-style: none; margin: 0; padding: 0; font-size: var(--fs-md); }
  .crosses li { padding: 7px 0; border-bottom: 1px solid var(--rule); }
  .crosses .note { color: var(--ink2); }
  .tap { display: inline-block; min-height: 24px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  /* A phone: each row is a stack, its part over the plant and the how (DESIGN-87: tables become stacked rows). */
  @media (max-width: 560px) {
    .lin thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .lin tr { display: block; padding: 7px 0; border-bottom: 1px solid var(--rule); }
    .lin th, .lin td { display: block; border: 0; padding: 1px 0; }
    .lin tbody th { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); }
  }
</style>

<script lang="ts">
  /**
   * The collection lens's own section on a region's, a genus's or a family's page (round eighty-seven, C8; LensRegion in
   * the round's mockups, in its look): how many of the page's species the grower grows now and which plants of theirs
   * belong here, each linked to its own page, with All, Yours and Not yours for the results below (in this tab only), and
   * a way to turn the lens off. On a region's page, the regions next door with how many of each the grower grows.
   *
   * Shown only to a device whose collection holds a plant growing; worked out in this browser (`LensState`), never on
   * the server.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, type Accession } from '$lib/db/types';
  import { plantHref as hrefOf } from '$lib/db/links';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import type { LensState } from './lens-state.svelte';

  let { state: ls, total, here, next = [] }: { state: LensState; total: number; here: string; next?: Array<{ key: string; label: string; slug: string; n: number }> } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  // Read once the collection has opened, and again when its plants change.
  $effect(() => { void collection.ready; void collection.failed; void collection.accessions; void ls.read(); });
  const l = $derived(ls.lens);
  const plants = $derived(l ? l.species.reduce((n, s) => n + s.plants.length, 0) + l.genusOnly.length : 0);
  const mine = $derived(l?.species.length ?? 0);
  const plantHref = (a: { id: string }) => hrefOf(a as Accession);
</script>

{#if ls.status === 'ready' && l}
  <section class="lens" aria-labelledby="lens-h">
    <div class="hd">
      <h2 id="lens-h" class="sec">In your collection now</h2>
      <button type="button" class="linkish" aria-pressed={!ls.on} onclick={() => { ls.on = !ls.on; ls.show = 'all'; }}>{ls.on ? 'Turn the lens off' : 'Turn the lens on'}</button>
    </div>
    {#if ls.on}
      <p class="lead">You grow <b>{fmt(mine)}</b> of the {fmt(total)} species {here}{plants ? `, as ${fmt(plants)} of your ${fmt(l.growing)} growing plants` : `, of your ${fmt(l.growing)} growing plants`}.</p>
      {#if l.species.length || l.genusOnly.length}
        <ul class="plain mine">
          {#each l.species as s (s.slug)}
            <li><a href="/species/{s.slug}"><SpeciesName name={s.name} /></a> <span class="acc">{#each s.plants as a, i (a.id)}{#if i}{', '}{/if}<a href={plantHref(a)}>{accNo(a)}</a>{/each}</span></li>
          {/each}
          {#each l.genusOnly as a (a.id)}
            <li><a href={plantHref(a)}>{accNo(a)}</a> <span class="acc"><SpeciesName name={a.taxonName} />, filed under the genus alone</span></li>
          {/each}
        </ul>
      {/if}
      {#if next.length}
        <p class="next plain"><span class="lbl">Next door:</span> {#each next as x, i (x.key)}{#if i}<span aria-hidden="true">{' · '}</span>{/if}<a href="/region/{x.slug}">{x.label}</a>, you grow {fmt(ls.others[x.key]?.species.length ?? 0)} of its {fmt(x.n)}{/each}</p>
      {/if}
      {#if mine}
        <div class="show" role="group" aria-label="Results to show">
          <button type="button" aria-pressed={ls.show === 'all'} onclick={() => (ls.show = 'all')}>All</button>
          <button type="button" aria-pressed={ls.show === 'mine'} onclick={() => (ls.show = 'mine')}>Yours</button>
          <button type="button" aria-pressed={ls.show === 'not'} onclick={() => (ls.show = 'not')}>Not yours</button>
        </div>
        {#if ls.show !== 'all'}<p class="note">Of this page of results only: the lens filters what this page shows, in this browser, and asks the server for nothing.</p>{/if}
      {/if}
      {#if l.notHeld}<p class="note">{fmt(l.notHeld)} of your growing plants {l.notHeld === 1 ? 'is' : 'are'} of a name the reference holds no page for, so {l.notHeld === 1 ? 'it is' : 'they are'} in no lens.</p>{/if}
      <p class="foot">Worked out in this browser from your collection, which stays on this device. The server sends this page alike to everyone and never learns which plants you hold.</p>
    {/if}
  </section>
{:else if ls.status === 'unreached'}
  <p class="lensnote">Your plants could not be matched to this page: the reference was not reached.</p>
{:else if ls.status === 'refused'}
  <p class="lensnote">This browser refused the storage your collection is kept in, so this page cannot show which of these you grow.</p>
{/if}

<style>
  .lens { border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 8px 0 10px; margin: 14px 0 0; font-size: var(--fs-ui); }
  .hd { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; }
  .sec { margin: 0; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .lead { margin: 6px 0; font-size: 1rem; }
  .mine { list-style: none; margin: 0; padding: 0; columns: 2 280px; column-gap: 24px; }
  .mine li { padding: 3px 0; border-top: 1px solid var(--rule2, var(--rule)); break-inside: avoid; }
  .acc { color: var(--ink2); font-size: var(--fs-head); font-family: var(--mono, inherit); }
  .next, .note, .foot, .lensnote { margin: 8px 0 0; color: var(--ink2); }
  .lbl { color: var(--mut, var(--ink3)); }
  .note, .foot { font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  .show { display: inline-flex; border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .show button { border: 0; background: var(--field, var(--bg)); color: var(--ink); font: inherit; padding: 4px 14px; cursor: pointer; min-height: 32px; }
  .show button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .linkish:hover { text-decoration: underline; }
  .lens :global(.sciname) { font-family: var(--serif); }
  @media (max-width: 899px) { .show button, .linkish, .mine a { min-height: 44px; } .mine a { display: inline-flex; align-items: center; } }
</style>

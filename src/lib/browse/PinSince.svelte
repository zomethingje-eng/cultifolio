<script lang="ts">
  /**
   * A pinned view's changes since it was pinned or last seen (round eighty-seven, C6 and C9's "New since you pinned"):
   * the species a reference update added to the view, and those it took from it, by name, each linked to its page. A
   * species taken from the view that the reference still holds has moved out of it (its range or its name changed); one
   * it no longer holds is said as such, by count, since the pin kept its page id and not its name.
   */
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { namesOf, type Named } from './data';
  import { dayWords, todayIso } from './pins';

  let { from, added, removed, onclose }: { from: string; added: string[]; removed: string[]; onclose: () => void } = $props();
  let names = $state<Map<string, Named> | null>(null);
  let unreached = $state(false);
  $effect(() => {
    const want = [...added.slice(0, 30), ...removed.slice(0, 30)];
    void namesOf(want).then((r) => { if (!r) { unreached = true; return; } names = new Map(r.names.map((x) => [x.key, x])); });
  });
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const gone = $derived(names ? removed.slice(0, 30).filter((k) => !names!.has(k)).length + Math.max(0, removed.length - 30) : 0);
</script>

<section id="bv-since" class="since" aria-labelledby="bv-since-h">
  <h2 id="bv-since-h" class="sec">New since you pinned, {dayWords(from, todayIso())}</h2>
  {#if unreached}<p class="note">The reference was not reached, so the species are not named. {fmt(added.length)} added, {fmt(removed.length)} taken out.</p>
  {:else if !names}<p class="note">Reading their names.</p>
  {:else}
    {#if added.length}
      <p class="what">Added to this view: {fmt(added.length)}</p>
      <ul class="plain">{#each added.slice(0, 30) as k (k)}{#if names.get(k)}<li><a href="/species/{names.get(k)!.slug}"><SpeciesName name={names.get(k)!.name} /></a>{#if names.get(k)!.common}<span class="com"> {names.get(k)!.common}</span>{/if}</li>{/if}{/each}</ul>
      {#if added.length > 30}<p class="note">and {fmt(added.length - 30)} more, among the view's species.</p>{/if}
    {/if}
    {#if removed.length}
      <p class="what">Taken out of this view: {fmt(removed.length)}</p>
      <ul class="plain">{#each removed.slice(0, 30) as k (k)}{#if names.get(k)}<li><a href="/species/{names.get(k)!.slug}"><SpeciesName name={names.get(k)!.name} /></a> <span class="com">still in the reference, no longer in this view</span></li>{/if}{/each}</ul>
      {#if gone}<p class="note">{fmt(gone)} {gone === 1 ? 'is' : 'are'} no longer in the reference.</p>{/if}
    {/if}
  {/if}
  <p class="foot">Counted from the species this view held when you pinned it or last opened its changes; from now on, from today's. <button type="button" class="linkish" onclick={onclose}>Close</button></p>
</section>

<style>
  .since { border-top: 1px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 10px 0 8px; margin: 0 0 14px; font-size: var(--fs-ui); }
  .sec { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .what { margin: 8px 0 2px; font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0; columns: 2 260px; column-gap: 24px; }
  li { padding: 3px 0; border-top: 1px solid var(--rule2, var(--rule)); break-inside: avoid; }
  .com, .note, .foot { color: var(--ink2); }
  .note, .foot { font-size: var(--fs-head); margin: 6px 0 0; }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .linkish:hover { text-decoration: underline; }
  .since :global(.sciname) { font-family: var(--serif); }
  @media (max-width: 899px) { li a, .linkish { min-height: 44px; display: inline-flex; align-items: center; } }
</style>

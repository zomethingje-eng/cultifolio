<script lang="ts">
  /**
   * The front page's pinned views, for a grower (round eighty-seven, C6; FrontPins in the round's mockups, in the round's
   * look): each pin's view by its title, how many species it gives now, and what a reference update added to it and took
   * from it since it was pinned or last seen ("+3 · −1 since 12 Nov"). A pin opens its view with those changes open
   * (`pinClick`). Manage lists Unpin beside each.
   *
   * Nothing is drawn for a device with no collection, or while the collection opens. A grower with no pin yet is told in
   * one line what a pin is (C9: an explainer, not example cards). The changes are asked for the pins shown, one request
   * a pin (/browse/data?part=keys, the view's query alone), and said "not reached" where no answer came, never as none.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { pins, unpin } from './recent';
  import { pinClick } from './pinned.svelte';
  import { sinceOf, type Since } from './since';
  import { sinceWords, todayIso, TOO_WIDE, PIN_EXPLAINER, PIN_MAX, goneWords, type Pin } from './pins';

  const SHOWN = 8;
  let all = $state(false);
  let manage = $state(false);
  const list = $derived(collection.ready ? pins() : []);
  const shown = $derived(all ? list : list.slice(0, SHOWN));
  let since = $state<Record<string, Since>>({});
  const asked = new Set<string>();
  $effect(() => {
    for (const p of shown) {
      const key = `${p.id}|${p.seen}|${p.n}`;
      if (asked.has(key)) continue;
      asked.add(key);
      void sinceOf(p).then((s) => (since = { ...since, [p.id]: s }));
    }
  });
  const fmt = (n: number) => n.toLocaleString('en-GB');
  function words(p: Pin): { n: string; change: string } {
    const s = since[p.id];
    if (!s) return { n: `${fmt(p.n)} species when last seen`, change: '' };
    if (s.kind === 'unreached') return { n: `${fmt(p.n)} species when last seen`, change: 'changes not reached' };
    const n = `${fmt(s.now.n)} species`;
    if (s.kind === 'wide') return { n, change: TOO_WIDE };
    if (s.kind === 'gone') return { n, change: goneWords(s.codes) };
    if (s.kind === 'fresh') return { n, change: 'followed for changes from its next opening' };
    return { n, change: sinceWords({ added: s.added.length, removed: s.removed.length }, p.seen, todayIso()) };
  }
</script>

{#if collection.ready && (list.length || collection.recordCount > 0)}
  <section class="pins" aria-labelledby="pins-h">
    <div class="hd">
      <h2 id="pins-h" class="sec">Your pinned views</h2>
      {#if list.length}<p class="kept">Kept in your collection, on this device and any you sync · <button type="button" class="linkish" aria-expanded={manage} onclick={() => (manage = !manage)}>{manage ? 'Done' : 'Manage'}</button></p>{/if}
    </div>
    {#if !list.length}
      <p class="explain">{PIN_EXPLAINER} <a href="/browse">Browse the reference</a>.</p>
    {:else}
      <ul class="plain">
        {#each shown as p (p.id)}
          {@const w = words(p)}
          <li>
            <a class="lab" href={p.href} onclick={(e) => pinClick(e, p.href, p.view)}>{p.label}</a>
            <span class="n">{w.n}</span>
            {#if w.change}<span class="ch" class:new={since[p.id]?.kind === 'changes' && w.change.startsWith('+')}>{w.change}</span>{/if}
            {#if manage}<button type="button" class="linkish un" onclick={() => unpin(p.id)} aria-label="Unpin {p.label}">Unpin</button>{/if}
          </li>
        {/each}
      </ul>
      {#if list.length > SHOWN}<p class="more"><button type="button" class="linkish" onclick={() => (all = !all)}>{all ? `The first ${SHOWN}` : `All ${fmt(list.length)} pinned views`}</button>{list.length >= PIN_MAX ? ` (${PIN_MAX}, the most a collection keeps)` : ''}</p>{/if}
      <p class="foot">"+3 · −1 since 12 Nov" counts the species a reference update added to the view and took from it since it was pinned or its changes last opened.</p>
    {/if}
  </section>
{/if}

<style>
  .pins { margin: 18px 0; }
  .hd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; border-bottom: 1px solid var(--ink); padding-bottom: 4px; }
  .sec { margin: 0; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .kept { margin: 0; font-size: var(--fs-head); color: var(--mut, var(--ink3)); }
  ul { list-style: none; margin: 0; padding: 0; font-variant-numeric: tabular-nums lining-nums; }
  li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 14px; padding: 7px 0; border-bottom: 1px solid var(--rule2, var(--rule)); }
  .lab { flex: 1 1 260px; min-width: 0; overflow-wrap: anywhere; }
  .n { color: var(--ink2); white-space: nowrap; }
  .ch { color: var(--mut, var(--ink3)); font-size: var(--fs-ui); }
  .ch.new { color: var(--ink); font-weight: 600; }
  .explain, .more, .foot { margin: 8px 0 0; font-size: var(--fs-ui); color: var(--ink2); }
  .foot { font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--link, var(--accent)); cursor: pointer; }
  .linkish:hover { text-decoration: underline; }
  @media (max-width: 899px) { .lab, .linkish { min-height: 44px; display: inline-flex; align-items: center; } }
</style>

<script lang="ts">
  import { plural } from '$core/words';
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { LOCATION_KINDS, type LocationKind, type Location } from '$lib/db/types';
  onMount(() => collection.load());
  let adding = $state(false);
  let name = $state('');
  let kind = $state<LocationKind>('room');
  let parent = $state<string | null>(null);

  type Row = { loc: Location; depth: number; n: number; deepN: number };
  const rows = $derived.by(() => {
    const out: Row[] = [];
    const walk = (p: string | null, depth: number) => {
      for (const l of collection.children(p)) {
        out.push({ loc: l, depth, n: collection.plantsAt(l.id, false).length, deepN: collection.plantsAt(l.id, true).length });
        walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  const unplaced = $derived(collection.accessions.filter((a) => a.status === 'growing' && !collection.placeOf(a.locationId)).length);
  const kindLabel = (k?: LocationKind | null) => LOCATION_KINDS.find((x) => x.k === k)?.label ?? '';

  async function add() {
    if (!name.trim()) return;
    await collection.addLocation({ name: name.trim(), type: kind, parentId: parent });
    name = ''; adding = false;
  }
</script>

<svelte:head><title>Benches — Cultifolio</title></svelte:head>

<PageHead title="Benches" sub="Where your plants live; conditions set on a place apply to everything inside it." count="{rows.length} place{rows.length === 1 ? '' : 's'}{unplaced ? ` · ${unplaced} unplaced` : ''}">
  <button class="btn pri" onclick={() => (adding = !adding)}>New place</button>
</PageHead>

{#if adding}
  <form class="cult form" onsubmit={(e) => { e.preventDefault(); add(); }}>
    <input id="loc-name" type="text" placeholder="Name" aria-label="Name of the new place" bind:value={name} />
    <select id="loc-kind" bind:value={kind} aria-label="Kind of place">{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select>
    <select id="loc-parent" bind:value={parent} aria-label="Inside which place">
      <option value={null}>Top level</option>
      {#each rows as r}<option value={r.loc.id}>{'  '.repeat(r.depth)}{r.loc.name}</option>{/each}
    </select>
    <button class="btn pri" type="submit" disabled={!name.trim()}>Add</button>
  </form>
{/if}

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else}
  {#if collection.legacyLocations.length}
    <div class="cult legacy">
      <div class="sum">Places written as text on your plants</div>
      <p class="faint small">Turn each into a real place; its plants move there.</p>
      <ul>
        {#each collection.legacyLocations as l}
          <li><span>{l.text}</span> <span class="faint">{l.n} plant{l.n === 1 ? '' : 's'}</span> <button class="btn small" onclick={() => collection.convertLegacyLocation(l.text)}>Make it a location</button></li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if !rows.length}
    <div class="emptybox"><h2 class="q" style="font-size: 22px">No places yet</h2><p class="muted">Start with the room or greenhouse, then the shelves or benches inside it.</p></div>
  {:else}
    <div class="tree">
      {#each rows as r (r.loc.id)}
        <a class="row card" href="/benches/{r.loc.id}" style="--d:{r.depth}">
          <span class="name">{r.loc.name}{#if collection.needsHome(r.loc.id)} <span class="faint">· needs a home: two devices moved places into each other; move this one where it belongs</span>{/if}</span>
          <span class="faint kind">{kindLabel(r.loc.type)}</span>
          <span class="n mono">{r.deepN}{r.deepN !== r.n ? ` (${r.n} here)` : ''}</span>
        </a>
      {/each}
    </div>
  {/if}
  {#if unplaced}<p class="faint small">{plural(unplaced, 'growing plant')} {unplaced === 1 ? 'has' : 'have'} no place.</p>{/if}
{/if}

<style>
  .form { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; padding: 12px 15px; margin: 12px 0 16px; }
  .form input, .form select { font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .legacy { padding-bottom: 10px; }
  .legacy .small { padding: 8px 17px 0; }
  .legacy ul { list-style: none; padding: 6px 17px 0; margin: 0; display: grid; gap: 0.4rem; }
  .legacy li { display: flex; gap: 0.8rem; align-items: center; }
  .legacy li span:first-child { font-weight: 500; }
  .tree { display: grid; gap: 0.35rem; margin-top: 0.8rem; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.8rem; align-items: center; padding: 0.55rem 0.9rem; padding-left: calc(0.9rem + var(--d) * 1.4rem); color: inherit; min-height: 44px; }
  .row:hover { text-decoration: none; box-shadow: var(--sh2); color: inherit; }
  .name { font-weight: 600; }
  .kind { font-size: 12.5px; }
  .n { font-size: 13px; color: var(--ink2); }
  .small { font-size: 12.5px; }
  @media (max-width: 560px) { .form { grid-template-columns: 1fr 1fr; } }
</style>

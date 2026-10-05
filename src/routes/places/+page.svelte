<script lang="ts">
  import { plural } from '$core/words';
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { focusNext } from '$lib/ui/focus';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { LOCATION_KINDS, accNo, type LocationKind, type Location, type Accession } from '$lib/db/types';
  import { plantHref } from '$lib/db/links';
  import { plantLabel } from '$lib/ui/plant-label';
  import { toast } from '$lib/ui/toast.svelte';
  onMount(() => collection.load());
  let adding = $state(false);
  // The top bar's "+" on this section lands on /places#add: the form opens with its first field focused, and the hash is
  // taken off the address at once, so a second tap is a change again and opens it again; the tap itself is heard too,
  // for a browser that does not report a hash it already has (round fifty-eight; round fifty-nine: it worked once).
  onMount(() => {
    const open = () => {
      adding = true;
      void focusNext('#loc-name');
      if (location.hash === '#add') replaceState(location.pathname + location.search, page.state);
    };
    const onHash = () => { if (location.hash === '#add') open(); };
    const onTap = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href="/places#add"]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open();
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    // In the capture phase, ahead of the router's own link handling, which took the second tap as a hash it already had.
    window.addEventListener('click', onTap, true);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('click', onTap, true); };
  });
  let name = $state('');
  let kind = $state<LocationKind | ''>(''); // chosen, never defaulted: a bench filed as a room says "whole room" on every watering line (round twenty-six, 16)
  let kindMsg = $state('');
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
  const unplacedList = $derived(collection.accessions.filter((a) => a.status === 'growing' && !collection.placeOf(a.locationId)));
  const unplaced = $derived(unplacedList.length);
  /**
   * The plants with no place, each with a place to pick: "1 growing plant has no place" said so and offered nothing
   * (round sixty; the grower review, 17). A pick is one move with its line and an Undo, as the plant page's Move is.
   */
  let placing = $state(false);
  async function placeIt(a: Accession, to: string) {
    if (!to) return;
    const { undo } = await collection.movePlantsUndoable([a.id], to);
    toast.show(`${accNo(a)} moved to ${collection.locationName(to)}.`, 8000, { label: 'Undo', run: () => { void undo(); } });
  }
  const kindLabel = (k?: LocationKind | null) => LOCATION_KINDS.find((x) => x.k === k)?.label ?? '';

  /** The place just added, said under the form while it stays open for the next. */
  let addedMsg = $state('');
  /**
   * Add closes the form, and the parent and the kind are chosen afresh for the next place, so the last one's never files
   * the next inside it (round twenty-two, 3). "Add another" keeps the form open with the parent and the kind kept, for
   * eight benches in one greenhouse: six places took 36 taps (round sixty; the grower review, 14).
   */
  async function add(another = false) {
    if (!name.trim()) return;
    kindMsg = kind ? '' : 'Say what kind of place it is.';
    if (!kind) { document.getElementById('loc-kind')?.focus(); return; }
    const added = name.trim();
    await collection.addLocation({ name: added, type: kind, parentId: parent });
    name = '';
    if (another) {
      addedMsg = `${added} added${parent ? ` inside ${collection.locationName(parent)}` : ''}. Name the next.`;
      void focusNext('#loc-name');
      return;
    }
    addedMsg = ''; parent = null; kind = ''; adding = false;
  }
</script>

<svelte:head><title>Places · Cultifolio</title></svelte:head>

<PageHead compact title="Places" sub="Where your plants live: a greenhouse, a bench, a shelf or a windowsill; conditions set on a place apply to everything inside it." count="{rows.length} place{rows.length === 1 ? '' : 's'}{unplaced ? ` · ${unplaced} unplaced` : ''}">
  <button class="btn pri" onclick={() => (adding = !adding)}>New place</button>
</PageHead>

{#if adding}
  <form class="cult form" onsubmit={(e) => { e.preventDefault(); add((e.submitter as HTMLElement | null)?.id === 'loc-another'); }}>
    <!-- Each field with a visible name over it: a placeholder was the name's only one, and the place above had none (round fifty-eight; the accessibility review). -->
    <label class="fl"><span class="eyebrow">Name of the new place</span><input id="loc-name" type="text" placeholder="e.g. Greenhouse, Bench 1" bind:value={name} /></label>
    <label class="fl"><span class="eyebrow">Kind of place</span><select id="loc-kind" bind:value={kind} aria-invalid={!!kindMsg} aria-describedby={kindMsg ? 'loc-kind-bad' : undefined} onchange={() => (kindMsg = '')}><option value="" disabled>Choose…</option>{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select></label>
    <label class="fl"><span class="eyebrow">Inside which place</span><select id="loc-parent" bind:value={parent}>
      <option value={null}>Top level</option>
      {#each rows as r}<option value={r.loc.id}>{collection.locationName(r.loc.id) || r.loc.name}</option>{/each}<!-- the full path, as the place picker says it (round fifty-eight; the grower review) -->
    </select></label>
    <span class="addbtns"><button class="btn pri" type="submit" id="loc-add" disabled={!name.trim()}>Add</button><button class="btn" type="submit" id="loc-another" disabled={!name.trim()} title="Add this place and keep the form open for the next, inside the same place and of the same kind">Add another</button></span>
    {#if kindMsg}<span class="bad small full" id="loc-kind-bad">{kindMsg}</span>{/if}
    <p class="small full addedmsg" role="status" id="loc-added">{addedMsg}</p>
  </form>
{/if}

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else}
  {#if !rows.length}
    <div class="emptybox"><h2 class="q" style="font-size: var(--fs-2xl)">No places yet</h2><p class="muted">Start with the room or greenhouse, then the shelves or benches inside it.</p></div>
  {:else}
    <div class="tree">
      {#each rows as r (r.loc.id)}
        <!-- Two lines, the name and then its kind and count: three columns on one line squeezed the name on a phone (round fifty-eight; the grower review). -->
        <a class="row card" href="/places/{r.loc.id}" style="--d:{r.depth}">
          <span class="name">{r.loc.name}{#if collection.needsHome(r.loc.id)}{' '}<span class="faint">· needs a home: two devices moved places into each other; move this one where it belongs</span>{/if}</span>
          <!-- The separator is a box with its own margins, not spaces at a span's edge, which the row's layout dropped ("Greenhouse·0 plants"); the comma is for a screen reader (round fifty-nine). -->
          <span class="line2"><span class="sr">{', '}</span>{#if kindLabel(r.loc.type)}<span class="faint kind">{kindLabel(r.loc.type)}</span><span class="faint dot" aria-hidden="true">·</span><span class="sr">{', '}</span>{/if}<span class="n mono">{plural(r.deepN, 'plant')}{r.deepN !== r.n ? ` (${r.n} here)` : ''}</span></span>
        </a>
      {/each}
    </div>
  {/if}
  {#if unplaced}
    <p class="faint small" id="unplaced">{plural(unplaced, 'growing plant')} {unplaced === 1 ? 'has' : 'have'} no place.{#if rows.length}{' '}<button class="linkish" type="button" aria-expanded={placing} aria-controls="unplaced-list" onclick={() => (placing = !placing)}>{placing ? 'Close' : unplaced === 1 ? 'Give it one' : 'Give them one'}</button>{/if}</p>
    {#if placing && rows.length}
      <ul class="cult unplacedlist" id="unplaced-list">
        {#each unplacedList as a (a.id)}
          <li><a href={plantHref(a)}><span class="mono">{accNo(a)}</span> <i>{plantLabel(a)}</i></a><label><span class="sr">Place for {accNo(a)}</span><select onchange={(e) => placeIt(a, e.currentTarget.value)}><option value="" selected>Choose a place…</option>{#each rows as r (r.loc.id)}<option value={r.loc.id}>{collection.locationName(r.loc.id) || r.loc.name}</option>{/each}</select></label></li>
        {/each}
      </ul>
    {/if}
  {/if}
{/if}

<style>
  .form { display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 8px; padding: 12px 15px; margin: 12px 0 16px; align-items: end; }
  .addbtns { display: flex; gap: 8px; flex-wrap: wrap; }
  .addedmsg { margin: 0; color: var(--accent); }
  .addedmsg:empty { display: none; }
  .fl { display: grid; gap: 3px; min-width: 0; } /* a field with its small name over it (round fifty-eight; the accessibility review) */
  .full { grid-column: 1 / -1; }
  .form input, .form select { font: inherit; font-size: var(--fs-md); padding: 8px 11px; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .tree { display: grid; gap: 0.35rem; margin-top: 0.8rem; }
  /* Two lines of about 56px; a long name wraps between words, never inside one (round fifty-eight; the grower review). */
  .row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; align-content: center; padding: 0.45rem 0.9rem; padding-left: calc(0.9rem + min(var(--d), 4) * 1.4rem); color: inherit; min-height: 56px; }
  .line2 { display: flex; flex-wrap: wrap; align-items: baseline; line-height: 1.3; }
  .line2 .dot { margin: 0 0.45em; }
  .row:hover { text-decoration: none; box-shadow: var(--sh2); color: inherit; }
  .name { font-weight: 600; overflow-wrap: break-word; word-break: normal; line-height: 1.3; }
  .kind { font-size: var(--fs-md); }
  .n { font-size: var(--fs-md); color: var(--ink2); }
  .small { font-size: var(--fs-md); }
  .linkish { background: none; border: 0; padding: 0 2px; min-height: var(--tap); font: inherit; color: var(--accent); text-decoration: underline; cursor: pointer; }
  .unplacedlist { list-style: none; margin: 6px 0 0; padding: 8px 14px; display: grid; gap: 6px; }
  .unplacedlist li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; min-height: var(--tap); }
  .unplacedlist a { min-width: 0; overflow-wrap: break-word; }
  .unplacedlist select { font: inherit; font-size: var(--fs-md); min-height: var(--tap); padding: 6px 10px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); max-width: 100%; }
  @media (max-width: 560px) { .form { grid-template-columns: 1fr 1fr; } .form .fl:first-child, .addbtns { grid-column: 1 / -1; } }
  @media (max-width: 520px) { .form { grid-template-columns: minmax(0, 1fr); } } /* one column on a phone, as the add-plant form (round sixty; the grower review, 13) */
</style>

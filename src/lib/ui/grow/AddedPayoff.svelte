<script lang="ts">
  /**
   * The payoff after "Add one to my plants" (round 107; the first hand-off's round 7): on the visit the save opened, one
   * comparison of the plant's space with its species' habitat, each figure named with its source and no advice
   * (`payoff.ts`). Where the plant has no space, the card asks for one there, in one step; where the space holds no floor,
   * for the floor, saved to the space. "Close" puts it away; a reload or a shared address never shows it (the router's
   * page state, not the address).
   *
   * Round 119 (MYPLANTS 27 b): with six spaces or fewer, each is a chip, one tap places the plant and the comparison
   * shows at once in the same card; "+ New space" last opens the picker, as do more than six spaces. Under the line, the
   * fixed words "It compares. It does not say what the plant will do."
   */
  import { collection } from '$lib/db/collection.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { fToC, tempUnit } from '$core/units';
  import { settlePlaces } from '$lib/ui/places-pending';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { payoff } from './payoff';
  type Habitat = { coldFloor: { minP01: number; years: number } | null; coldMonth: { tmin: number; month: string } | null; sky: { lo: number; hi: number } | null };
  let { acc, locationId, habitat, phase, slug, onclose }: { acc: string; locationId: string | null | undefined; habitat: Habitat | null; phase: 'loading' | 'ok' | 'none' | 'noclimate' | 'unreachable'; slug: string | null; onclose: () => void } = $props();
  const placed = $derived(locationId && collection.placeOf(locationId) ? locationId : null);
  const cond = $derived(placed ? collection.conditions(placed) : null);
  const line = $derived(placed && cond && habitat ? payoff({ space: collection.locationName(placed), floorC: cond.floorC, floorHeld: cond.floorHeld, ppfd: cond.ppfd, lightHours: cond.lightHours, ...habitat, units: units.current }) : null);
  let where = $state<string | null>(null);
  /** Every space, depth-first, each by its full path ("Greenhouse › Bench 2"), as the picker lists them. */
  const spaces = $derived.by(() => {
    const out: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const walk = (parent: string | null) => { for (const l of collection.children(parent)) { if (seen.has(l.id)) continue; seen.add(l.id); out.push({ id: l.id, label: collection.locationName(l.id) || l.name }); walk(l.id); } };
    walk(null);
    return out;
  });
  let picking = $state(false);
  async function placeIn(id: string) {
    if (busy) return;
    busy = true; msg = '';
    try { await collection.movePlantsUndoable([acc], id); }
    catch { msg = `Not saved: ${(collection.lastWriteError ?? 'the browser refused the write').replace(/\.$/, '')}.`; }
    finally { busy = false; }
  }
  let floor = $state('');
  let busy = $state(false);
  let msg = $state('');
  async function giveSpace() {
    if (busy) return;
    busy = true; msg = '';
    try {
      try { await settlePlaces('payoff-loc'); } catch { return; }
      if (!where) { msg = 'Choose a space, or make a new one, first.'; return; }
      await collection.movePlantsUndoable([acc], where);
    } catch {
      msg = `Not saved: ${(collection.lastWriteError ?? 'the browser refused the write').replace(/\.$/, '')}.`;
    } finally { busy = false; }
  }
  async function setFloor() {
    if (busy || !placed) return;
    const v = Number(floor.trim().replace(',', '.'));
    if (!floor.trim() || !Number.isFinite(v) || Math.abs(v) > 200) { msg = `Type the coldest the space gets, in ${tempUnit(units.current)}.`; return; }
    busy = true; msg = '';
    try {
      await collection.put('location', placed, { floorC: units.current === 'us' ? +fToC(v).toFixed(2) : v });
    } catch {
      msg = `Not saved: ${(collection.lastWriteError ?? 'the browser refused the write').replace(/\.$/, '')}.`;
    } finally { busy = false; }
  }
</script>

<section class="payoff card" id="payoff" aria-labelledby="payoff-h">
  <div class="head"><h2 id="payoff-h">Your plant against its habitat</h2><button class="linkish" type="button" onclick={onclose}>Close</button></div>
  {#if phase === 'loading'}
    <p class="small muted">Reading the species page…</p>
  {:else if phase === 'none' || phase === 'unreachable'}
    <p class="small" id="payoff-line">{phase === 'none' ? 'This name has no species page here, so there is no habitat to set beside your plant.' : 'The species page was not reached, so its habitat is not set beside your plant now; the plant page below compares them once it is.'}</p>
  {:else if phase === 'noclimate' || !habitat}
    <p class="small" id="payoff-line">This species has no habitat climate, so there is nothing to set beside your space's figures.{#if slug}{' '}<a href="/species/{slug}#s-climate">Why, on its page</a>.{/if}</p>
  {:else if !placed}
    <p class="small" id="payoff-ask">Where does it live? Give it a space, and its figures are set beside the habitat's.</p>
    {#if spaces.length <= 6 && !picking}
      <div class="chips" role="group" aria-labelledby="payoff-ask" id="payoff-chips">
        {#each spaces as sp (sp.id)}<button type="button" class="spacechip" onclick={() => placeIn(sp.id)} aria-disabled={busy}>{sp.label}</button>{/each}
        <button type="button" class="spacechip new" onclick={() => (picking = true)}>+ New space</button>
      </div>
    {:else}
      <div class="row"><LocationPicker bind:value={where} id="payoff-loc" label="Space" /><button class="btn pri" type="button" onclick={giveSpace} aria-disabled={busy}>Use this space</button></div>
    {/if}
  {:else if line && line.kind !== 'none'}
    <p id="payoff-line">{line.text}</p>
    <p class="small muted" id="payoff-fixed">It compares. It does not say what the plant will do. <a href="#habitat">The plant page's habitat figures</a> hold the rest.</p>
  {:else if line}
    <p class="small" id="payoff-line">{line.text}</p>
    <div class="row"><label class="fl"><span>Coldest it gets ({tempUnit(units.current)})</span><input id="payoff-floor" type="text" inputmode="decimal" bind:value={floor} /></label><button class="btn pri" type="button" onclick={setFloor} aria-disabled={busy}>Use this floor</button></div>
  {/if}
  {#if msg}<p class="small" role="status" id="payoff-msg">{msg}</p>{/if}
</section>

<style>
  .payoff { margin: 12px 0; padding: 12px 14px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .head h2 { font-size: var(--fs-md); margin: 0 0 6px; }
  .row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
  .fl { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); }
  #payoff-line { margin: 0 0 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 2px; }
  .spacechip { min-height: var(--tap); padding: 0 14px; border: 1px solid var(--rule); border-radius: var(--r-sm); background: none; color: var(--ink); font: inherit; font-size: var(--fs-sm); cursor: pointer; }
  .spacechip:hover { background: var(--sunk); }
  .spacechip.new { border-style: dashed; color: var(--ink2); }
</style>

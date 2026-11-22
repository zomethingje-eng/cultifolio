<script lang="ts">
  /**
   * A town for the frost watch's site, typed instead of the browser's location (round 107; the first hand-off's round 7).
   * Asked on a press (`/api/place`, which asks OpenStreetMap's Nominatim from the server), up to five places to choose
   * from, each with its coordinates; the one chosen is handed to `onpick`. A source that refused or did not answer, or a
   * call held back, is said as that; no place found is said as none found for those words.
   */
  import { PLACE_MIN, PLACE_MAX, shortPlace, type Place } from '$lib/weather/place';
  let { onpick, id = 'town' }: { onpick: (p: Place & { short: string }) => void; id?: string } = $props();
  let q = $state('');
  let busy = $state(false);
  let places = $state<Place[] | null>(null);
  let credit = $state('');
  let msg = $state('');
  async function find(e: SubmitEvent) {
    e.preventDefault();
    const words = q.trim();
    if (words.length < PLACE_MIN) { msg = 'Type a town or a place first.'; return; }
    busy = true; msg = ''; places = null;
    try {
      const r = await fetch(`/api/place?q=${encodeURIComponent(words)}`);
      const j = (await r.json().catch(() => null)) as { places?: Place[]; credit?: string; error?: string; held?: boolean } | null;
      if (!r.ok || !j?.places) msg = j?.error ? `${j.error[0].toUpperCase()}${j.error.slice(1)}.` : 'The place search did not answer; try again, or use your location.';
      else { places = j.places; credit = j.credit ?? ''; if (!j.places.length) msg = `No place found for “${words}”.`; }
    } catch {
      msg = 'The place search did not answer; try again, or use your location.';
    }
    busy = false;
  }
</script>

<form class="town" onsubmit={find}>
  <label for="{id}-q">A town or place</label>
  <span class="row"><input id="{id}-q" type="text" bind:value={q} maxlength={PLACE_MAX} autocomplete="address-level2" placeholder="e.g. Kew" /><button class="btn" type="submit" disabled={busy}>{busy ? 'Finding…' : 'Find'}</button></span>
</form>
{#if msg}<p class="small muted" role="status" id="{id}-msg">{msg}</p>{/if}
{#if places?.length}
  <ul class="places" id="{id}-list">
    {#each places as p (p.name + p.lat + p.lon)}<li><button class="linkish" type="button" onclick={() => onpick({ ...p, short: shortPlace(p) })}>{p.name}</button> <span class="muted small">{p.lat}, {p.lon}</span></li>{/each}
  </ul>
  <p class="small muted credit">{credit}.</p>
{/if}

<style>
  .town { display: flex; flex-direction: column; gap: 4px; margin: 8px 0 0; }
  .town label { font-size: var(--fs-sm); color: var(--ink2); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .row input { flex: 1 1 12rem; min-width: 0; }
  .places { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 6px; }
  .places button { text-align: left; }
  .credit { margin: 6px 0 0; }
</style>

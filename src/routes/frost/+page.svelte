<script lang="ts">
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import type { Forecast, Alert } from '$lib/weather/forecast';
  type Payload = { lat: number; lon: number; forecast: Forecast; alerts: Alert[]; alertsStatus: string; risk: { level: string; text: string }; attribution: string[] };
  let data = $state<Payload | null>(null);
  let err = $state('');
  let busy = $state(false);
  let lat = $state(''), lon = $state('');
  const KEY = 'cultifolio.frost.site';

  async function load(la: number, lo: number) {
    busy = true; err = '';
    try {
      const r = await fetch(`/api/forecast?lat=${la}&lon=${lo}`);
      if (r.status === 400) {
        // The one refusal with a reason worth repeating: the coordinates themselves.
        err = 'Latitude is −90 to 90 and longitude −180 to 180; check the figures.';
        return;
      }
      if (!r.ok) throw new Error('not answered');
      data = await r.json();
      try { localStorage.setItem(KEY, JSON.stringify({ lat: la, lon: lo })); } catch { /* fine */ }
    } catch {
      // Whatever went wrong upstream, the page says the check did not happen: never a status code, never that the nights are clear.
      err = 'Forecast not checked: the forecast source did not answer.';
    }
    finally { busy = false; }
  }
  function locate() {
    if (!navigator.geolocation) { err = 'This browser has no location service; type coordinates instead.'; return; }
    busy = true;
    navigator.geolocation.getCurrentPosition((p) => { lat = p.coords.latitude.toFixed(3); lon = p.coords.longitude.toFixed(3); load(+lat, +lon); }, (e) => { busy = false; err = e.message; }, { timeout: 10000 });
  }
  const watched = $derived(collection.locations.filter((l) => { const c = collection.conditions(l.id); return c.lat != null && c.lon != null && c.indoor !== true && (l.lat != null || !l.parentId); }));
  onMount(() => {
    collection.load();
    try { const s = localStorage.getItem(KEY); if (s) { const { lat: la, lon: lo } = JSON.parse(s); lat = String(la); lon = String(lo); load(la, lo); } } catch { /* fine */ }
  });
</script>

<svelte:head><title>Frost watch — Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Frost watch" sub="The next nine nights at a site. Outdoor or unheated places with coordinates get their own watch on their bench page." />
  {#if watched.length}
    <p class="small">Watched places: {#each watched as w, i}{i ? ', ' : ''}<a href="/benches/{w.id}">{w.name}</a>{/each}</p>
  {/if}
  <form class="row" onsubmit={(e) => { e.preventDefault(); if (lat && lon) load(+lat, +lon); }}>
    <label class="sr" for="frost-lat">Latitude</label><input id="frost-lat" type="text" inputmode="decimal" placeholder="Latitude" bind:value={lat} />
    <label class="sr" for="frost-lon">Longitude</label><input id="frost-lon" type="text" inputmode="decimal" placeholder="Longitude" bind:value={lon} />
    <button class="btn primary" type="submit" disabled={busy || !lat || !lon}>Check</button>
    <button class="btn" type="button" onclick={locate} disabled={busy}>Use my location</button>
  </form>
  {#if err}<div class="notice" role="status">{err}</div>{/if}
  {#if data}
    <div class="risk card {data.risk.level}"><span class="k">{data.risk.level === 'none' ? 'No frost in the forecast' : data.risk.level}</span> {data.risk.text}</div>
    <div class="scroll-x">
      <table class="data">
        <thead><tr><th>Night</th><th>Min °C</th><th>Max °C</th><th>Rain mm</th></tr></thead>
        <tbody>
          {#each data.forecast.days as d}
            <tr class:frost={d.tmin <= 0} class:cold={d.tmin > 0 && d.tmin <= 3}><td>{d.date}</td><td>{d.tmin.toFixed(1)}</td><td>{d.tmax.toFixed(1)}</td><td>{d.precipMm.toFixed(1)}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if data.alerts.length}
      <ul class="alerts">{#each data.alerts as a}<li><strong>{a.event}</strong>{a.headline ? ` — ${a.headline}` : ''}</li>{/each}</ul>
    {:else if data.alertsStatus === 'refused'}
      <p class="small"><b>Alerts not checked.</b> The National Weather Service did not answer; the forecast above stands on its own, and this is not a statement that no alert is in force.</p>
    {:else if data.alertsStatus === 'none'}
      <p class="small muted">No frost or freeze alert in force (NOAA/NWS).</p>
    {/if}
    <p class="faint small">The forecast covers the next {data.forecast.hoursCovered} hours; a night at the end of it is partial.</p>
    <p class="faint small">{data.attribution.join(' · ')}. Fetched {data.forecast.fetched.slice(0, 16).replace('T', ' ')} UTC for {data.lat}, {data.lon}.</p>
  {/if}
</div>

<style>
  .page { max-width: 640px; display: grid; gap: 1rem; }
  .row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .row input { flex: 1; min-width: 8rem; padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: 8px; background: var(--card); }
  .risk { padding: 0.9rem 1.1rem; }
  .risk .k { margin-right: 0.6em; }
  .risk.frost, .risk.warning { background: var(--bad-soft); }
  .risk.cold { background: var(--warm-soft); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: 12.5px; }
</style>

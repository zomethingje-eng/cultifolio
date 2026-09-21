<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { getForecast } from '$lib/weather/client';
  import { site } from '$lib/ui/site.svelte';
  import { tempUnit, rainUnit, tempN, rainN } from '$core/units';
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import type { Forecast, Alert } from '$lib/weather/forecast';
  type Payload = { lat: number; lon: number; forecast: Forecast; alerts: Alert[]; alertsStatus: string; risk: { level: string; text: string }; attribution: string[] };
  let data = $state<Payload | null>(null);
  let err = $state('');
  let busy = $state(false);

  async function load(la: number, lo: number) {
    busy = true; err = '';
    try {
      const r = await getForecast<Payload>(la, lo, units.current);
      if (!r.ok && r.status === 400) {
        // The one refusal with a reason worth repeating: the coordinates themselves.
        err = 'Latitude is −90 to 90 and longitude −180 to 180; check the figures.';
        return;
      }
      if (!r.ok) throw new Error('not answered');
      data = r.body;
    } catch {
      // Whatever went wrong upstream, the page says the check did not happen: never a status code, never that the nights are clear.
      err = 'Forecast not checked: the forecast source did not answer.';
    }
    finally { busy = false; }
  }
  const watched = $derived(collection.locations.filter((l) => { const c = collection.conditions(l.id); return c.lat != null && c.lon != null && c.indoor !== true && (l.lat != null || !l.parentId); }));
  onMount(() => {
    collection.load();
    site.load();
    if (site.current) load(site.current.lat, site.current.lon);
  });
</script>

<svelte:head><title>Frost watch — Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Frost watch" sub="The next nine nights at a site. Outdoor or unheated places with coordinates get their own watch on their bench page." />
  {#if watched.length}
    <p class="small">Watched places: {#each watched as w, i}{i ? ', ' : ''}<a href="/benches/{w.id}">{w.name}</a>{/each}</p>
  {/if}
  {#if site.current}
    <p class="small">Your site: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/settings#site">change in Settings</a>.</p>
  {:else if site.loaded}
    <div class="emptybox"><p class="muted" style="margin: 0">No site set. <a href="/settings#site">Set your site in Settings</a> and the forecast for it appears here, and on the front page when it turns.</p></div>
  {/if}
  {#if err}<div class="notice" role="status">{err}</div>{/if}
  {#if data}
    <div class="risk card {data.risk.level}"><span class="k">{data.risk.level === 'none' ? 'No frost in the forecast' : data.risk.level}</span> {data.risk.text}</div>
    <div class="scroll-x">
      <table class="data">
        <thead><tr><th>Night</th><th>Min {tempUnit(units.current)}</th><th>Max {tempUnit(units.current)}</th><th>Rain {rainUnit(units.current)}</th></tr></thead>
        <tbody>
          {#each data.forecast.days as d}
            <tr class:frost={d.tmin <= 0} class:cold={d.tmin > 0 && d.tmin <= 3}><td>{d.date}</td><td>{tempN(d.tmin, units.current, 1)}</td><td>{tempN(d.tmax, units.current, 1)}</td><td>{rainN(d.precipMm, units.current)}</td></tr>
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
  .risk { padding: 0.9rem 1.1rem; }
  .risk .k { margin-right: 0.6em; }
  .risk.frost, .risk.warning { background: var(--bad-soft); }
  .risk.cold { background: var(--warm-soft); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: 12.5px; }
</style>

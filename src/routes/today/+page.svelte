<script lang="ts">
  /**
   * The Today tab (round fifty-three, 3): the nights ahead first, then what needs you, place by place in walking order,
   * with a watering can in the other hand. The front page keeps its short lines; this is the long form. A plant with
   * no watering recorded is said apart from one not watered for three weeks: the first is a record without lines, the
   * second a plant; and a place's "Water all here" writes one line per plant, dated today, with Undo.
   */
  import NotChecked from '$lib/ui/NotChecked.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { getForecast, forecastRefusal } from '$lib/weather/client';
  import { site } from '$lib/ui/site.svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { tempUnit, rainUnit, tempN, rainN } from '$core/units';
  import { onMount } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Today from '$lib/ui/Today.svelte';
  import { collection, DUE_DAYS } from '$lib/db/collection.svelte';
  import { accNo, type Accession, type Location } from '$lib/db/types';
  import { localDate, daysBetween } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
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
      if (!r.ok) { err = forecastRefusal(r.status); return; }
      data = r.body;
    } catch {
      // Whatever went wrong, the page says the check did not happen: never a status code, never that the nights are clear.
      err = forecastRefusal(null);
    }
    finally { busy = false; }
  }
  const watched = $derived(collection.locations.filter((l) => { const c = collection.conditions(l.id); return c.lat != null && c.lon != null && c.indoor !== true && (l.lat != null || !l.parentId); }));
  onMount(() => {
    collection.load();
    site.load();
    void frost.check();
    if (site.current) load(site.current.lat, site.current.lon);
  });

  /* ---- by place, in walking order ---- */
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  const due = $derived(new Set(collection.ready ? collection.due.map((a) => a.id) : []));
  const today = $derived(localDate());
  type Stop = { place: Location | null; depth: number; overdue: Accession[]; unknown: Accession[]; unseen: Accession[]; n: number };
  /** The places as a walk through the tree, each with what needs doing there; a place with nothing to do is not a stop. Plants with no place come last. */
  const stops = $derived.by(() => {
    if (!collection.ready) return [] as Stop[];
    const out: Stop[] = [];
    const byPlace = new Map<string | null, Accession[]>();
    for (const a of growing) { const k = a.locationId && collection.location(a.locationId) ? collection.placeOf(a.locationId) : null; (byPlace.get(k) ?? byPlace.set(k, []).get(k)!).push(a); }
    const stop = (place: Location | null, depth: number) => {
      const here = byPlace.get(place?.id ?? null) ?? [];
      const dry = here.filter((a) => due.has(a.id));
      const unknown = dry.filter((a) => !collection.lastWatered(a.id));
      const overdue = dry.filter((a) => collection.lastWatered(a.id));
      const unseen = here.filter((a) => { if (collection.missedAt(a.id)) return true; const s = collection.lastSeen(a.id); return s != null && daysBetween(s) > 90; });
      if (dry.length || unseen.length) out.push({ place, depth, overdue, unknown, unseen, n: here.length });
    };
    const walk = (parent: string | null, depth: number) => {
      for (const l of collection.children(parent)) { stop(l, depth); walk(l.id, depth + 1); }
    };
    walk(null, 0);
    stop(null, 0);
    return out;
  });
  const todo = $derived(stops.reduce((n, s) => n + s.overdue.length + s.unknown.length + s.unseen.length, 0));
  const days = (a: Accession) => { const w = collection.lastWatered(a.id); return w ? daysBetween(w) : daysBetween(collection.madeOn('accession', a.id) ?? a.acquired ?? today); };
  let watering = $state<string | null>(null);
  /** One line per plant on the stop's two watering lists, dated today, as a place's "Water all" does; one tap takes exactly those lines back (round fifty-two, 3: one tap, one set of lines). */
  async function waterHere(s: Stop) {
    if (watering) return;
    const key = s.place?.id ?? 'none';
    watering = key;
    try {
      const plants = [...s.overdue, ...s.unknown];
      const ids = await collection.addEventsIds(plants.map((a) => ({ acc: a.id, d: today, t: 'water' as const, note: `from Today: ${s.place ? s.place.name : 'plants with no place'}`, auto: true })));
      toast.show(`Watered ${ids.length} plant${ids.length === 1 ? '' : 's'}${s.place ? ` at ${s.place.name}` : ''}.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents(ids).then(() => toast.show(`Undone: the ${ids.length} watering line${ids.length === 1 ? '' : 's'} removed.`)); } });
    } finally {
      watering = null;
    }
  }
</script>

<svelte:head><title>Today — Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Today" sub="The nights ahead, then what needs you, place by place." />

  <section id="frost" aria-labelledby="frost-h">
    <div class="secrule"><h2 id="frost-h">Frost watch</h2><div class="line"></div></div>
    {#if watched.length}
      <p class="small">Watched places, each with its own forecast on its page: {#each watched as w, i}{i ? ', ' : ''}<a href="/places/{w.id}">{w.name}</a>{/each}</p>
    {/if}
    {#if site.current}
      <p class="small">Your site: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/settings#site">change in Settings</a>.</p>
    {:else if site.loaded}
      <div class="emptybox"><p class="muted" style="margin: 0">No site set. <a href="/settings#site">Set your site in Settings</a> and its forecast appears here, on the front page and under the top bar when it turns{#if watched.length}; the places above are watched on their own pages either way{/if}.</p></div>
    {/if}
    {#if err}<div class="notice" role="status">{err}</div>{/if}
    {#if busy && !data}<p class="small muted">Reading the forecast…</p>{/if}
    {#if data}
      <div class="risk card {data.risk.level}"><span class="k">{data.risk.level === 'none' ? 'No frost in the forecast' : data.risk.level}</span> {data.risk.text}</div>
      <div class="scroll-x">
        <table class="data">
          <thead><tr><th title="Days by the sun at the site, not by the clock: a night that runs past midnight is listed under the day it began">Night (by the sun)</th><th>Min {tempUnit(units.current)}</th><th>Max {tempUnit(units.current)}</th><th>Rain {rainUnit(units.current)}</th></tr></thead>
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
        <p class="small"><NotChecked what="Alerts" why="The National Weather Service did not answer; the forecast above stands on its own." /></p>
      {:else if data.alertsStatus === 'none'}
        <p class="small muted">No frost or freeze alert in force (NOAA/NWS).</p>
      {/if}
      <p class="faint small">The forecast covers the next {data.forecast.hoursCovered} hours; a night at the end of it is partial.</p>
      <p class="faint small">{data.attribution.join(' · ')}. Fetched {data.forecast.fetched.slice(0, 16).replace('T', ' ')} UTC for {data.lat}, {data.lon}.</p>
    {/if}
  </section>

  <section id="water" aria-labelledby="water-h">
    <div class="secrule"><h2 id="water-h">By place</h2><div class="line"></div></div>
    {#if !collection.ready}
      <p class="small muted">Opening the collection…</p>
    {:else if !growing.length}
      <div class="emptybox"><p class="muted" style="margin: 0">No growing plants yet. <a href="/plants/new">Add one</a> and this page says what it needs.</p></div>
    {:else if !stops.length}
      <p class="small muted" id="nothing">Nothing needs you today: every plant has a watering within {DUE_DAYS} days and was seen within ninety.</p>
    {:else}
      <p class="small muted">{todo} thing{todo === 1 ? '' : 's'} to do across {stops.length} {stops.length === 1 ? 'place' : 'places'}, in the order the places are kept. A plant with no watering recorded is counted from the day its record was made, and said so.</p>
      <ol class="stops">
        {#each stops as s (s.place?.id ?? 'none')}
          <li class="stop" style="--depth: {s.depth}">
            <div class="head">
              <h3>{#if s.place}<a href="/places/{s.place.id}">{s.place.name}</a>{:else}No place{/if} <span class="muted small">{s.n} growing</span></h3>
              {#if s.overdue.length || s.unknown.length}
                <button class="btn small" type="button" onclick={() => waterHere(s)} disabled={!!watering} title="One watering line on each, dated today; Undo takes them back">Water {s.overdue.length + s.unknown.length} here</button>
              {/if}
            </div>
            {#if s.overdue.length}
              <p class="row warn"><span class="lab">Not watered for three weeks or more</span> {#each s.overdue as a, i}{i ? ', ' : ''}<a href="/plants/{a.id}">{accNo(a)}</a> <span class="muted">({days(a)} d)</span>{/each}</p>
            {/if}
            {#if s.unknown.length}
              <p class="row unknown"><span class="lab">No watering recorded</span> {#each s.unknown as a, i}{i ? ', ' : ''}<a href="/plants/{a.id}">{accNo(a)}</a> <span class="muted">(record {days(a)} d old)</span>{/each}</p>
            {/if}
            {#if s.unseen.length}
              <p class="row warn"><span class="lab">Missed at the last audit, or not seen for ninety days</span> {#each s.unseen as a, i}{i ? ', ' : ''}<a href="/plants/{a.id}">{accNo(a)}</a>{/each}</p>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section id="rest" aria-labelledby="rest-h">
    <div class="secrule"><h2 id="rest-h">And</h2><div class="line"></div></div>
    <Today where="today" />
  </section>
</div>

<style>
  .page { display: grid; gap: 1.2rem; }
  section { display: grid; gap: 0.6rem; }
  .risk { padding: 0.9rem 1.1rem; }
  .risk .k { margin-right: 0.6em; }
  .risk.frost, .risk.warning { background: var(--bad-soft); }
  .risk.cold { background: var(--warm-soft); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: 12.5px; }
  .stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .stop { background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 10px 14px; margin-left: calc(var(--depth) * 14px); }
  .stop .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .stop h3 { margin: 0; font-size: 15px; font-weight: 600; }
  .stop h3 .small { font-weight: 400; margin-left: 6px; }
  .stop .btn { flex: none; min-height: 36px; }
  .row { margin: 6px 0 0; font-size: 13.5px; line-height: 1.5; border-left: 3px solid var(--rule); padding-left: 10px; }
  .row.warn { border-left-color: var(--warn, #b8692a); }
  .row.unknown { border-left-color: var(--ink3); }
  .row .lab { display: block; font-size: 12px; color: var(--ink3); }
  .muted { color: var(--ink3); }
  @media (max-width: 640px) {
    .stop { margin-left: calc(var(--depth) * 8px); padding: 8px 12px; }
    .row { font-size: 13px; }
  }
</style>

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
  import { accNo, kindOf, type Accession, type Location } from '$lib/db/types';
  import { daysBetween, localDate } from '$core/dates';
  import { wateredHere, type Watered } from '$lib/ui/watered.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { today as day } from '$lib/ui/day.svelte';
  import { sheetsFor, type Sheet } from '$lib/ui/index.svelte';
  import { growingYear, forReader } from '$core/sheet';
  import { speciesSlug } from '$core/names';
  import type { Forecast, Alert } from '$lib/weather/forecast';
  type Payload = { lat: number; lon: number; forecast: Forecast; alerts: Alert[]; alertsStatus: string; risk: { level: string; text: string }; attribution: string[] };
  let data = $state<Payload | null>(null);
  let err = $state('');
  let busy = $state(false);

  /** The full forecast follows the watch: when the watch reads again (a timer, a return to the tab), this card reads the same answer, so the card and the bar never disagree (round fifty-five, 5; the first reviewer's finding 4). An answer to an earlier read publishes nothing. */
  let loadGen = 0;
  $effect(() => {
    void frost.readAt;
    const s = site.current;
    if (s) void load(s.lat, s.lon);
  });
  async function load(la: number, lo: number) {
    const gen = ++loadGen;
    busy = true; err = '';
    try {
      const r = await getForecast<Payload>(la, lo, units.current);
      if (gen !== loadGen) return;
      if (!r.ok && r.status === 400) {
        // The one refusal with a reason worth repeating: the coordinates themselves.
        err = 'Latitude is −90 to 90 and longitude −180 to 180; check the figures.';
        return;
      }
      if (!r.ok) { err = forecastRefusal(r.status); data = null; return; }
      data = r.body;
    } catch {
      // Whatever went wrong, the page says the check did not happen: never a status code, never that the nights are clear.
      if (gen === loadGen) { err = forecastRefusal(null); data = null; }
    }
    finally { if (gen === loadGen) busy = false; }
  }
  const watched = $derived(collection.locations.filter((l) => { const c = collection.conditions(l.id); return c.lat != null && c.lon != null && c.indoor !== true && (l.lat != null || !l.parentId); }));
  onMount(() => {
    collection.load();
    site.load();
    void frost.check();
  });

  /* ---- by place, in walking order ---- */
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  const due = $derived(new Set(collection.ready ? collection.due.map((a) => a.id) : []));
  // The day from the shared store, which follows the calendar while the page stays open: a reading taken once dated the
  // morning's work yesterday on a page left open overnight (round fifty-four, 4; the first reviewer's finding 2).
  const today = $derived(day.current);
  onMount(() => day.start());
  type Stop = { key: string; place: Location | null; depth: number; overdue: Accession[]; unknown: Accession[]; ahead: Accession[]; resting: Accession[]; unseen: Accession[]; n: number; watered: Watered | null };
  /** The species in their habitat's dry season now, by the sheets the front page reads too (round fifty-four, 4; the second reviewer's finding 23). Until the sheets have answered (or failed), the Water buttons wait: a button whose count changes as the sheets arrive moves under a reading eye (round fifty-five, 5). */
  let sheets = $state<Map<string, Sheet> | null>(null);
  let sheetsSettled = $state(false);
  $effect(() => {
    const slugs = [...new Set(growing.filter((a) => due.has(a.id) && kindOf(a) === 'species').map((a) => speciesSlug(a.taxonName)))];
    if (!slugs.length) { sheets = null; sheetsSettled = true; return; }
    sheetsSettled = false;
    void sheetsFor(slugs).then((m) => { sheets = m; }).finally(() => { sheetsSettled = true; });
  });
  const isResting = (a: Accession) => {
    if (!sheets || kindOf(a) !== 'species') return false;
    const sh = sheets.get(speciesSlug(a.taxonName));
    if (!sh || sh.climate.status !== 'ok') return false;
    const year = growingYear(sh.climate.months, sh.habitatLat);
    if (!year || year.none || year.grow === 'even') return false;
    return !forReader(year, site.current?.lat ?? null).includes(Number(today.slice(5, 7)));
  };
  const byNo = (a: Accession, b: Accession) => accNo(a).localeCompare(accNo(b)); // the order of the labels on the bench
  /** The places as a walk through the tree, each with what needs doing there; a place with nothing to do is not a stop, unless it was watered from here just now. Plants with no place come last. */
  const stops = $derived.by(() => {
    if (!collection.ready) return [] as Stop[];
    void wateredHere.map;
    const out: Stop[] = [];
    const byPlace = new Map<string | null, Accession[]>();
    for (const a of growing) { const k = a.locationId && collection.location(a.locationId) ? collection.placeOf(a.locationId) : null; (byPlace.get(k) ?? byPlace.set(k, []).get(k)!).push(a); }
    const stop = (place: Location | null, depth: number) => {
      const key = place?.id ?? 'none';
      const here = (byPlace.get(place?.id ?? null) ?? []).sort(byNo);
      const dry = here.filter((a) => due.has(a.id));
      // Said apart: not for three weeks; never, by the record; dry on purpose, in the habitat's rest. A watering dated
      // ahead of today is not due (one reading of it everywhere, round fifty-five, 5) and is said as a fact, with no button.
      const ahead = here.filter((a) => collection.wateringAhead(a.id));
      const resting = dry.filter(isResting);
      const active = dry.filter((a) => !isResting(a));
      const unknown = active.filter((a) => !collection.lastWatered(a.id));
      const overdue = active.filter((a) => collection.lastWatered(a.id));
      const unseen = here.filter((a) => { if (collection.missedAt(a.id)) return true; const s = collection.lastSeen(a.id); return s != null && daysBetween(s) > 90; });
      const watered = wateredHere.get(key);
      if (dry.length || unseen.length || ahead.length || watered) out.push({ key, place, depth, overdue, unknown, ahead, resting, unseen, n: place ? collection.plantsAt(place.id).filter((a) => a.status === 'growing').length : here.length, watered });
    };
    const walk = (parent: string | null, depth: number) => {
      for (const l of collection.children(parent)) { stop(l, depth); walk(l.id, depth + 1); }
    };
    walk(null, 0);
    stop(null, 0);
    return out;
  });
  /** Plants that need something, each counted once whatever it needs (round fifty-four, 4); a watering dated ahead is not a need. */
  const todo = $derived(new Set(stops.flatMap((s) => [...s.overdue, ...s.unknown, ...s.resting, ...s.unseen].map((a) => a.id))).size);
  const days = (a: Accession) => { const w = collection.lastWatered(a.id); return w ? daysBetween(w) : daysBetween(collection.madeOn('accession', a.id) ?? a.acquired ?? today); };
  let watering = $state<string | null>(null);
  /**
   * One line per plant given, dated today, as a place's "Water all" does. The stop keeps its place and its height: the
   * plants just watered stay on it as a done row with the stop's own Undo, so the stop below never slides under the
   * finger; and the toast says what was done without an Undo of its own, since it sits where the next stop's button was
   * (round fifty-five, 5; the first reviewer's findings 1 and 2).
   */
  async function waterHere(s: Stop, plants: Accession[]) {
    if (watering || !plants.length) return;
    watering = s.key;
    try {
      // The day at the tap, from the corrected clock: the day store looks once a minute, and a tap in the first minute after midnight took yesterday (round fifty-five, 5; both reviewers).
      const d = localDate();
      if (day.current !== d) day.current = d;
      const height = (document.getElementById(`stop-${s.key}`)?.getBoundingClientRect().height ?? 0);
      const ids = await collection.addEventsIds(plants.map((a) => ({ acc: a.id, d, t: 'water' as const, note: `from Today: ${s.place ? s.place.name : 'plants with no place'}`, auto: true })));
      wateredHere.add(s.key, ids, plants.map((a) => ({ id: a.id, no: accNo(a) })), height);
      toast.show(`Watered ${ids.length} plant${ids.length === 1 ? '' : 's'} at ${s.place ? s.place.name : 'no place'}; Undo is on the stop.`);
    } finally {
      watering = null;
    }
  }
  async function undoHere(key: string) {
    const w = wateredHere.take(key);
    if (!w) return;
    await collection.removeEvents(w.ids);
    toast.show(`Undone: the ${w.ids.length} watering line${w.ids.length === 1 ? '' : 's'} removed.`);
  }
  $effect(() => {
    const t = setInterval(() => wateredHere.prune(), 30_000);
    return () => clearInterval(t);
  });
</script>

<svelte:head><title>Today — Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Today" sub="The nights ahead, then what needs you, place by place." />

  <section id="frost" aria-labelledby="frost-h">
    <div class="secrule"><h2 id="frost-h">Frost watch</h2><div class="line"></div></div>
    {#if site.current}
      <p class="small">Your site: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/settings#site">change in Settings</a>.{#if watched.length} Watched places, each with its own forecast on its page: {#each watched as w, i}{i ? ', ' : ''}<a href="/places/{w.id}">{w.name}</a>{/each}.{/if}</p>
    {:else if site.loaded}
      <div class="emptybox"><p class="muted" style="margin: 0">No site set. <a href="/settings#site">Set your site in Settings</a> and its forecast appears here, on the front page and under the top bar when it turns{#if watched.length}; the places above are watched on their own pages either way{/if}.</p></div>
    {/if}
    {#if err}<div class="notice" role="status">{err}</div>{/if}
    {#if busy && !data}<p class="small muted">Reading the forecast…</p>{/if}
    {#if data}
      <!-- One line first, the nights folded under it: the stops are what the grower came for at six in the morning (round fifty-four, 4). The sentence names its level itself. -->
      <div class="risk card {data.risk.level}">{data.risk.text}</div>
      <details class="nights" open={data.risk.level !== 'none'}>
        <summary>The next {data.forecast.days.length} nights</summary>
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
        <p class="faint small">The forecast covers the next {data.forecast.hoursCovered} hours; a night at the end of it is partial. {data.attribution.join(' · ')}. Fetched {data.forecast.fetched.slice(0, 16).replace('T', ' ')} UTC for {data.lat}, {data.lon}.</p>
      </details>
    {/if}
  </section>

  <section id="water" aria-labelledby="water-h">
    <div class="secrule"><h2 id="water-h">By place</h2><div class="line"></div></div>
    {#if !collection.ready}
      <p class="small muted">Opening the collection…</p>
    {:else if !growing.length}
      <div class="emptybox"><p class="muted" style="margin: 0">No growing plants yet. <a href="/plants/new">Add one</a> and this page says what it needs.</p></div>
    {:else if !stops.length}
      <!-- What is true: no record meets the checks; not that every plant was watered, which a record three weeks young says nothing about (round fifty-four, 4; the first reviewer's finding 3). -->
      <p class="small muted" id="nothing">Nothing needs you today by these checks: no plant without a watering in the last {DUE_DAYS} days (a record younger than that is not counted), none missed at an audit or unseen for ninety days.</p>
    {:else}
      <p class="small muted">{todo} plant{todo === 1 ? '' : 's'} need{todo === 1 ? 's' : ''} something across {stops.length} {stops.length === 1 ? 'place' : 'places'}, in the order the places are kept. A plant with no watering recorded is counted from the day its record was made, and said so.</p>
      <ol class="stops">
        {#each stops as s (s.key)}
          <li class="stop" id="stop-{s.key}" style="--depth: {s.depth}{s.watered?.height ? `; min-height: ${s.watered.height}px` : ''}">
            <div class="head">
              <h3>{#if s.place}<a href="/places/{s.place.id}">{s.place.name}</a>{:else}No place{/if} <span class="muted small">{s.n} growing</span></h3>
              <!-- The button keeps its place: Water while there is something to water, else the stop's Undo in the same spot, so the header keeps its height (round fifty-five, 5). -->
              {#if s.overdue.length || s.unknown.length}
                <button class="btn small water" type="button" onclick={() => waterHere(s, [...s.overdue, ...s.unknown])} disabled={!!watering || !sheetsSettled} title={sheetsSettled ? 'One watering line on each, dated today; Undo on the stop takes them back' : 'Reading the species sheets for the dry season first'}>Water {s.overdue.length + s.unknown.length} here</button>
              {:else if s.watered}
                <button class="btn small water" type="button" onclick={() => undoHere(s.key)}>Undo</button>
              {/if}
            </div>
            {#if s.watered}
              <!-- The plants just watered stay on the stop, in a row shaped like the one they left, so the stop keeps its height and the next stop does not move under the finger. -->
              <p class="row done"><span class="lab">Watered just now{#if s.overdue.length || s.unknown.length} · <button class="linkish" type="button" onclick={() => undoHere(s.key)}>Undo</button>{/if}</span> {#each s.watered.plants as p, i}{i ? ' ' : ''}<a href="/plants/{p.id}">{p.no} <span class="muted">✓</span></a>{/each}</p>
            {/if}
            {#if s.overdue.length}
              <p class="row warn"><span class="lab">Not watered for three weeks or more</span> {#each s.overdue as a, i}{i ? ' ' : ''}<a href="/plants/{a.id}">{accNo(a)} <span class="muted">{days(a)} d</span></a>{/each}</p>
            {/if}
            {#if s.unknown.length}
              <p class="row unknown"><span class="lab">No watering recorded</span> {#each s.unknown as a, i}{i ? ' ' : ''}<a href="/plants/{a.id}">{accNo(a)} <span class="muted">no record · {days(a)} d</span></a>{/each}</p>
            {/if}
            {#if s.ahead.length}
              <p class="row ahead"><span class="lab">Watering dated ahead of today, so not counted as due</span> {#each s.ahead as a, i}{i ? ' ' : ''}<a href="/plants/{a.id}">{accNo(a)} <span class="muted">dated {collection.wateringAhead(a.id)}</span></a>{/each}</p>
            {/if}
            {#if s.resting.length}
              <p class="row resting"><span class="lab">Not watered, and in the habitat's dry season by the species sheet</span> {#each s.resting as a, i}{i ? ' ' : ''}<a href="/plants/{a.id}">{accNo(a)} <span class="muted">{days(a)} d</span></a>{/each} <button class="btn small water" type="button" onclick={() => waterHere(s, s.resting)} disabled={!!watering}>Water these too</button></p>
            {/if}
            {#if s.unseen.length}
              <p class="row warn"><span class="lab">Missed at the last audit, or not seen for ninety days</span> {#each s.unseen as a, i}{i ? ' ' : ''}<a href="/plants/{a.id}">{accNo(a)}</a>{/each}</p>
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
  .risk.frost, .risk.warning { background: var(--bad-soft); }
  .risk.cold { background: var(--warm-soft); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: 12.5px; }
  .stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .stop { box-sizing: border-box; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 10px 14px; margin-left: calc(var(--depth) * 14px); }
  .stop .head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .stop h3 { margin: 0; font-size: 15px; font-weight: 600; }
  .stop h3 .small { font-weight: 400; margin-left: 6px; }
  .stop .btn { flex: none; min-height: 36px; }
  .row { margin: 6px 0 0; font-size: 13.5px; line-height: 1.5; border-left: 3px solid var(--rule); padding-left: 10px; }
  .row.warn { border-left-color: var(--warn, #b8692a); }
  .row.unknown { border-left-color: var(--ink3); }
  .row .lab { display: block; font-size: 12px; color: var(--ink3); }
  .row.ahead { border-left-color: var(--accent); }
  .row.resting { border-left-color: var(--rule); }
  .row > a { display: inline-block; padding: 9px 8px 9px 0; min-height: 40px; } /* a tap target, not a line of text (round fifty-four, 4) */
  .row .btn { margin-left: 6px; vertical-align: middle; }
  .row.done { border-left-color: var(--accent); }
  .row.done .lab { color: var(--accent); font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
  .stop { scroll-margin-bottom: 96px; } /* clear of the tab bar when a control is scrolled to (the second reviewer's phone check) */
  .btn.water { min-height: 44px; } /* a thumb's width */
  .nights > summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--ink2); padding: 4px 0; }
  .muted { color: var(--ink3); }
  @media (max-width: 640px) {
    .stop { margin-left: calc(var(--depth) * 8px); padding: 8px 12px; }
    .row { font-size: 13px; }
  }
</style>

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
  import { onMount, tick } from 'svelte';
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
  type Stop = { key: string; place: Location | null; depth: number; overdue: Accession[]; unknown: Accession[]; ahead: Accession[]; resting: Accession[]; restRain: Accession[]; restCool: Accession[]; unseen: Accession[]; keptDry: number; n: number; watered: Watered | null };
  /** The species in their habitat's dry season now, by the sheets the front page reads too (round fifty-four, 4; the second reviewer's finding 23). Until the sheets have answered (or failed), the Water buttons wait: a button whose count changes as the sheets arrive moves under a reading eye (round fifty-five, 5). */
  let sheets = $state<Map<string, Sheet> | null>(null);
  let sheetsSettled = $state(false);
  $effect(() => {
    const slugs = [...new Set(growing.filter((a) => due.has(a.id) && kindOf(a) === 'species').map((a) => speciesSlug(a.taxonName)))];
    if (!slugs.length) { sheets = null; sheetsSettled = true; return; }
    sheetsSettled = false;
    void sheetsFor(slugs).then((m) => { sheets = m; }).finally(() => { sheetsSettled = true; });
  });
  /**
   * Which rule of the species sheet puts this month outside the plant's growing months, if one does: the rain rule (a
   * rainy season, and this month is not in it), or, under 120 mm of rain a year, the temperature rule (the cooler six
   * months, and this month is not among them). The two are worded apart: a fog-belt cactus has no rainy season to be
   * outside of, and its species page says so (round fifty-nine). Null when the plant is not resting by either.
   */
  const restRule = (a: Accession): 'rain' | 'cool' | null => {
    if (!sheets || kindOf(a) !== 'species') return null;
    const sh = sheets.get(speciesSlug(a.taxonName));
    if (!sh || sh.climate.status !== 'ok') return null;
    const year = growingYear(sh.climate.months, sh.habitatLat);
    if (!year || year.none || year.grow === 'even') return null;
    if (forReader(year, site.current?.lat ?? null).includes(Number(today.slice(5, 7)))) return null;
    return year.fog ? 'cool' : 'rain';
  };
  const isResting = (a: Accession) => restRule(a) != null;
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
      // Once per stop (round fifty-eight): a plant listed to water is not listed again as unseen; and the ninety days speak
      // only in a place that has been audited (the collection's one reading, `unseenWhy`).
      const listed = new Set([...overdue, ...unknown, ...resting].map((a) => a.id));
      const unseen = here.filter((a) => !listed.has(a.id) && collection.unseenWhy(a.id));
      const watered = wateredHere.get(key);
      // Kept dry this month by the place's own rule: one quiet line, not a warning per plant (round fifty-eight).
      const keptDry = here.filter((a) => collection.keptDry(a)).length;
      if (dry.length || unseen.length || ahead.length || watered || keptDry) out.push({ key, place, depth, overdue, unknown, ahead, resting, restRain: resting.filter((a) => restRule(a) === 'rain'), restCool: resting.filter((a) => restRule(a) === 'cool'), unseen, keptDry, n: place ? collection.plantsAt(place.id).filter((a) => a.status === 'growing').length : here.length, watered });
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
  /** The places with work: a stop listed only for a dry-month rule, a watering dated ahead or a done row is not one (round fifty-nine). */
  const hasWork = (s: Stop) => !!(s.overdue.length || s.unknown.length || s.resting.length || s.unseen.length);
  const workPlaces = $derived(stops.filter((s) => s.place && hasWork(s)).length);
  const workNoPlace = $derived(stops.some((s) => !s.place && hasWork(s)));
  const across = $derived(workPlaces ? `across ${workPlaces} ${workPlaces === 1 ? 'place' : 'places'}${workNoPlace ? ' and among the plants with no place' : ''}` : workNoPlace ? 'among the plants with no place' : '');
  // Counted to the day store's date, the one the page shows and the taps write, so a page open across midnight says the same day throughout (round fifty-eight).
  const days = (a: Accession) => { const w = collection.lastWatered(a.id); return daysBetween(w ?? collection.madeOn('accession', a.id) ?? a.acquired ?? today, today); };
  /** Plants a grower unticked on a stop: left out of its Water button (round fifty-eight; the grower review). Per page visit. */
  let skipped = $state(new Set<string>());
  const toggleSkip = (id: string) => { const n = new Set(skipped); if (n.has(id)) n.delete(id); else n.add(id); skipped = n; };
  const ticked = (s: Stop) => [...s.overdue, ...s.unknown].filter((a) => !skipped.has(a.id));
  const tickedOf = (list: Accession[]) => list.filter((a) => !skipped.has(a.id));
  /** "Water this one", "Water these 3": the button counts what is ticked. */
  const waterWords = (n: number) => (n === 1 ? 'Water this one' : `Water these ${n}`);
  /** A day count as words: "today", not "0 d" (round fifty-nine). */
  const dWords = (n: number) => (n === 0 ? 'today' : `${n} d`);
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
      // The grower's own action, so a sighting of each plant, not an `auto` line (round fifty-eight).
      const ids = await collection.addEventsIds(plants.map((a) => ({ acc: a.id, d, t: 'water' as const, note: `from Today: ${s.place ? s.place.name : 'plants with no place'}` })));
      wateredHere.add(s.key, ids, plants.map((a) => ({ id: a.id, no: accNo(a), name: a.taxonName })), height);
      toast.show(`Watered ${ids.length}.`); // short: the stop itself says what and offers Undo
    } finally {
      watering = null;
    }
  }
  /** The stop's Undo, in the done row only: one in the header sat where Water had been, so a second tap on Water undid it (round fifty-eight). The entry is let go only once the lines are gone, so a failed Undo can be tried again. */
  let undoing = $state<string | null>(null);
  async function undoHere(key: string) {
    const w = wateredHere.get(key);
    if (!w || undoing) return;
    undoing = key;
    try {
      await collection.removeEvents(w.ids);
      wateredHere.take(key);
      toast.show(`Undone: ${w.ids.length} watering line${w.ids.length === 1 ? '' : 's'} removed.`);
      // The Undo went with its row: focus goes to the stop's Water button, back for the plants, else to the stop's
      // heading, never to the page body (round fifty-nine).
      await tick();
      const stopEl = document.getElementById(`stop-${key}`);
      const to = stopEl?.querySelector<HTMLElement>('.head button.water:not(:disabled), button.restwater:not(:disabled), h3 a, h3');
      to?.focus();
    } catch (err) {
      toast.show(`Not undone: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    } finally {
      undoing = null;
    }
  }
  $effect(() => {
    const t = setInterval(() => wateredHere.prune(), 30_000);
    return () => clearInterval(t);
  });
</script>

{#snippet chip(a: Accession, fact: string)}
  <span class="chip tick" class:off={skipped.has(a.id)}><input type="checkbox" id="w-{a.id}" checked={!skipped.has(a.id)} onchange={() => toggleSkip(a.id)} aria-label="Water {accNo(a)} {a.taxonName}" /><a href="/plants/{a.id}"><b>{accNo(a)}</b> <i>{a.taxonName}</i> <span class="muted">{fact}</span></a></span>
{/snippet}

<svelte:head><title>Today · Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Today" sub="The nights ahead, then what needs you, place by place." />

  <section id="frost" aria-labelledby="frost-h">
    <div class="secrule"><h2 id="frost-h">Frost watch</h2><div class="line"></div></div>
    {#if site.current}
      <p class="small">Your site: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/settings#site">change in Settings</a>.{#if watched.length}{' '}Watched places, each with its own forecast on its page: {#each watched as w, i}{i ? ', ' : ''}<a href="/places/{w.id}">{w.name}</a>{/each}.{/if}</p>
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
        <!-- Reachable and scrollable by keyboard, and named (round fifty-eight; the accessibility review). -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="scroll-x" tabindex="0" role="region" aria-label="Forecast nights">
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
          <ul class="alerts">{#each data.alerts as a}<li><strong>{a.event}</strong>{a.headline ? `: ${a.headline}` : ''}</li>{/each}</ul>
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
      <p class="small muted" id="nothing">Nothing needs you today by these checks: no plant past its watering rhythm ({DUE_DAYS} days unless its place or the plant sets another; a record younger than that is not counted), none missed at an audit or unseen for ninety days.</p>
    {:else}
      <p class="small muted">{#if todo}{todo} plant{todo === 1 ? '' : 's'} need{todo === 1 ? 's' : ''} something {across}, in the order the places are kept.{:else}Nothing past its rhythm or unseen; the places below have a note for today.{/if} A plant with no watering recorded is counted from the day its record was made, and said so.</p>
      <ol class="stops">
        {#each stops as s (s.key)}
          {@const n = ticked(s).length}
          <li class="stop" id="stop-{s.key}" style="--depth: {s.depth}{s.watered?.height ? `; min-height: ${s.watered.height}px` : ''}">
            <div class="head">
              <h3 tabindex="-1">{#if s.place}<a href="/places/{s.place.id}">{s.place.name}</a>{:else}No place{/if} <span class="muted small">{s.n} growing{s.place && collection.children(s.place.id).length ? ' here and inside' : ''}</span></h3>
              <!-- Water while there is something ticked to water; once watered, a mark that does nothing, in the same place and size, so a second tap on the spot does nothing either (round fifty-eight). -->
              <!-- Watered with nothing left ticked: the done mark, not a disabled "Water 0 of 1"; the plants left unticked stay listed with their ticks for next time (round fifty-nine). -->
              {#if (s.overdue.length || s.unknown.length) && !(n === 0 && s.watered)}
                <button class="btn small water" type="button" onclick={() => waterHere(s, ticked(s))} disabled={!!watering || !sheetsSettled || !n} title={sheetsSettled ? 'One watering line on each plant ticked, dated today; Undo on the stop takes them back' : 'Reading the species sheets for the dry season first'}>Water {n === s.overdue.length + s.unknown.length ? n : `${n} of ${s.overdue.length + s.unknown.length}`} here</button>
              {:else if s.watered}
                <span class="btn small water donemark" aria-hidden="true">Watered ✓</span>
              {/if}
            </div>
            {#if s.watered}
              <!-- The plants just watered stay on the stop, so it keeps its height and the next stop does not move under the finger; the Undo is here and only here. -->
              <div class="row done"><span class="lab">Watered just now · <button class="linkish" type="button" onclick={() => undoHere(s.key)} disabled={undoing === s.key}>Undo</button></span> {#each s.watered.plants as p (p.id)}<a class="chip" href="/plants/{p.id}"><b>{p.no}</b> {#if p.name}<i>{p.name}</i>{/if} <span class="muted">✓</span></a>{/each}</div>
            {/if}
            {#if s.overdue.length}
              <div class="row warn"><span class="lab">Past the watering rhythm ({DUE_DAYS} days unless the plant or its place sets another){s.overdue.length + s.unknown.length > 1 ? '; untick any to leave it out' : ''}</span> {#each s.overdue as a (a.id)}{@render chip(a, dWords(days(a)))}{/each}</div>
            {/if}
            {#if s.unknown.length}
              <div class="row unknown"><span class="lab">No watering recorded</span> {#each s.unknown as a (a.id)}{@render chip(a, `no record · ${dWords(days(a))}`)}{/each}</div>
            {/if}
            {#if s.keptDry}
              <p class="row resting"><span class="lab">Kept dry this month by {s.place ? `${collection.conditions(s.place.id).from.dryMonths ?? s.place.name}'s` : 'its place\'s'} rule: {s.keptDry} plant{s.keptDry === 1 ? '' : 's'}, not counted as due</span></p>
            {/if}
            {#if s.ahead.length}
              <p class="row ahead"><span class="lab">Watering dated ahead of today, so not counted as due</span> {#each s.ahead as a (a.id)}<a class="chip" href="/plants/{a.id}"><b>{accNo(a)}</b> <i>{a.taxonName}</i> <span class="muted">dated {collection.wateringAhead(a.id)}</span></a>{/each}</p>
            {/if}
            <!-- Worded by the rule that applied, and ticked like the rows above: the button waters what is ticked (round fifty-nine). -->
            {#each [{ list: s.restRain, lab: "Outside the habitat's rainy season by the species sheet" }, { list: s.restCool, lab: 'Outside the cooler six months the species sheet names' }] as g (g.lab)}
              {#if g.list.length}
                {@const k = tickedOf(g.list).length}
                <div class="row resting"><span class="lab">{g.lab}{g.list.length > 1 ? '; untick any to leave it out' : ''}</span> {#each g.list as a (a.id)}{@render chip(a, dWords(days(a)))}{/each} <button class="btn small water restwater" type="button" onclick={() => waterHere(s, tickedOf(g.list))} disabled={!!watering || !k}>{waterWords(k)}</button></div>
              {/if}
            {/each}
            {#if s.unseen.length}
              <p class="row warn"><span class="lab">Missed at the last audit, or not seen for ninety days since this place's audit</span> {#each s.unseen as a (a.id)}<a class="chip" href="/plants/{a.id}"><b>{accNo(a)}</b> <i>{a.taxonName}</i> <span class="muted">{collection.unseenWhy(a.id) === 'missed' ? `missed ${collection.missedAt(a.id)}` : `seen ${collection.lastSeen(a.id)}`}</span></a>{/each}</p>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>

  <section id="rest" aria-labelledby="rest-h">
    <div class="secrule"><h2 id="rest-h">Also today</h2><div class="line"></div></div>
    <Today where="today" />
  </section>
</div>

<style>
  /* One column that may shrink to the screen: an auto column took the width of its widest line at 200% text and the page scrolled sideways (round fifty-nine). */
  .page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.2rem; }
  section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.6rem; }
  .risk { padding: 0.9rem 1.1rem; }
  .risk.frost, .risk.warning { background: var(--bad-soft); }
  .risk.cold { background: var(--warm-soft); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm-ink); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: var(--fs-md); }
  .stops { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .stop { box-sizing: border-box; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 10px 14px; margin-left: calc(var(--depth) * 14px); }
  .stop .head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; } /* the button goes under the name at a large text size rather than off the screen (round fifty-nine) */
  .stop h3 { min-width: 0; margin: 0; font-size: var(--fs-base); font-weight: 600; }
  .stop h3 .small { font-weight: 400; margin-left: 6px; }
  .stop .btn { flex: none; min-height: 36px; }
  .row { margin: 6px 0 0; font-size: var(--fs-md); line-height: 1.5; border-left: 3px solid var(--rule); padding-left: 10px; }
  .row.warn { border-left-color: var(--warn, #b8692a); }
  .row.unknown { border-left-color: var(--ink3); }
  .row .lab { display: block; font-size: var(--fs-sm); color: var(--ink3); }
  .row .lab .linkish { min-height: var(--tap); color: var(--accent); font-weight: 600; }
  .row.ahead { border-left-color: var(--accent); }
  .row.resting { border-left-color: var(--rule); }
  .row > a { display: inline-block; padding: 9px 8px 9px 0; min-height: var(--tap); } /* a tap target, not a line of text (round fifty-four, 4) */
  /* Each plant a chip with its number and name (round fifty-eight; the grower review): a number alone said nothing at the bench. */
  /* The chip's edge at 3:1 like a field's; its parts never break inside themselves ("no record · 8 / d"), the chip wraps whole parts instead (round fifty-nine). */
  .chip { display: inline-flex; align-items: center; gap: 6px; margin: 4px 6px 0 0; padding: 4px 10px; min-height: var(--tap); max-width: 100%; border: 1px solid var(--field-edge); border-radius: 999px; background: var(--paper, var(--card)); color: var(--ink); text-decoration: none; vertical-align: middle; }
  .chip i { color: var(--ink2); }
  .chip.tick a { display: inline-flex; flex-wrap: wrap; align-items: center; column-gap: 0.3em; min-width: 0; }
  .chip b, .chip .muted { white-space: nowrap; }
  .chip i { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .chip.tick { padding-left: 6px; }
  .chip.tick a { color: inherit; text-decoration: none; min-height: var(--tap); }
  .chip.tick input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); }
  .chip.off { opacity: 0.55; }
  .chip.off b { text-decoration: line-through; }
  .donemark { cursor: default; background: var(--accent-soft, var(--sunk)); border-color: transparent; color: var(--accent); }
  .row .btn { margin-left: 6px; vertical-align: middle; }
  .row.done { border-left-color: var(--accent); }
  .row.done .lab { color: var(--accent); font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
  .stop { scroll-margin-bottom: 96px; } /* clear of the tab bar when a control is scrolled to (the second reviewer's phone check) */
  .btn.water { min-height: 44px; } /* a thumb's width */
  .nights > summary { cursor: pointer; font-size: var(--fs-md); font-weight: 600; color: var(--ink2); padding: 4px 0; }
  .muted { color: var(--ink3); }
  @media (max-width: 640px) {
    .stop { margin-left: calc(var(--depth) * 8px); padding: 8px 12px; }
    .row { font-size: var(--fs-md); }
  }
</style>

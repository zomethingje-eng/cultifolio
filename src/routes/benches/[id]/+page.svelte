<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { getForecast } from '$lib/weather/client';
  import { localDate } from '$core/dates';
  import { temp, tempN, tempUnit, cToF, fToC } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
  import type { Forecast, Alert } from '$lib/weather/forecast';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  onMount(async () => {
    await collection.load();
    // /benches/<id>?edit=1 from a plant page that found a figure missing here.
    if (page.url.searchParams.get('edit') === '1') startEdit();
  });

  const id = $derived(page.params.id!);
  const loc = $derived(collection.location(id));
  const path = $derived(collection.locationPath(id));
  const kids = $derived(collection.children(id));
  const here = $derived(collection.plantsAt(id, false));
  const deep = $derived(collection.plantsAt(id, true));
  const cond = $derived(collection.conditions(id));
  const today = localDate();
  $effect(() => {
    if (loc) setCrumb([{ label: 'Benches', href: '/benches' }, ...path.slice(0, -1).map((p) => ({ label: p.name, href: `/benches/${p.id}` })), { label: loc.name }]);
    return () => setCrumb([]);
  });
  const dli = $derived(cond.ppfd != null ? (cond.ppfd * (cond.lightHours ?? 12) * 3600) / 1e6 : null);
  const lastWater = $derived.by(() => { const ds = deep.map((a) => collection.events(a.id).find((e) => e.t === 'water')?.d).filter((d): d is string => !!d).sort(); return ds.length ? ds[ds.length - 1] : null; });
  const lastAudit = $derived.by(() => { const ds = deep.map((a) => collection.events(a.id).find((e) => e.t === 'audit')?.d).filter((d): d is string => !!d).sort(); return ds.length ? ds[ds.length - 1] : null; });
  const unseen = $derived(deep.filter((a) => { const d = daysSince(collection.lastSeen(a.id)); return d == null || d > 90; }).length);

  /* ---- edit conditions ---- */
  let editing = $state(false);
  let f = $state<{ name: string; kind: LocationKind | ''; parent: string | null; indoor: '' | 'yes' | 'no'; floorC: string; ppfd: string; lightHours: string; lat: string; lon: string; altM: string; notes: string }>({ name: '', kind: '', parent: null, indoor: '', floorC: '', ppfd: '', lightHours: '', lat: '', lon: '', altM: '', notes: '' });
  /** Places this one could sit inside: everything but itself and what is under it. */
  const homes = $derived.by(() => {
    const under = new Set(collection.subtree(id));
    return collection.locations.filter((l) => !under.has(l.id)).map((l) => ({ id: l.id, name: collection.locationName(l.id) }));
  });
  function startEdit() {
    if (!loc) return;
    f = { name: loc.name, kind: loc.type ?? '', parent: path.length > 1 ? path[path.length - 2].id : null, indoor: loc.indoor == null ? '' : loc.indoor ? 'yes' : 'no', floorC: loc.floorC == null ? '' : (units.current === 'us' ? +cToF(loc.floorC).toFixed(1) : loc.floorC).toString(), ppfd: loc.ppfd?.toString() ?? '', lightHours: loc.lightHours?.toString() ?? '', lat: loc.lat?.toString() ?? '', lon: loc.lon?.toString() ?? '', altM: loc.altM?.toString() ?? '', notes: loc.notes ?? '' };
    editing = true;
  }
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s));
  async function save() {
    await collection.put('location', id, { name: f.name.trim() || loc?.name, type: f.kind || null, indoor: f.indoor === '' ? null : f.indoor === 'yes', floorC: (() => { const v = num(f.floorC); return v == null ? null : units.current === 'us' ? +fToC(v).toFixed(2) : v; })(), ppfd: num(f.ppfd), lightHours: num(f.lightHours), lat: num(f.lat), lon: num(f.lon), altM: num(f.altM), notes: f.notes.trim() || null });
    if ((f.parent ?? null) !== (loc?.parentId ?? null) || collection.needsHome(id)) await collection.moveLocation(id, f.parent ?? null);
    editing = false;
    forecast = null;
  }
  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((p) => { f.lat = p.coords.latitude.toFixed(4); f.lon = p.coords.longitude.toFixed(4); if (p.coords.altitude != null) f.altM = Math.round(p.coords.altitude).toString(); });
  }

  /* ---- water / feed the whole bench ---- */
  let busy = $state('');
  async function waterAll(t: 'water' | 'feed') {
    busy = t;
    const n = await collection.addEvents(deep.map((a) => ({ acc: a.id, d: today, t, note: `whole ${loc?.type ?? 'location'}: ${loc?.name ?? ''}` })));
    busy = '';
    flash = `${t === 'water' ? 'Watered' : 'Fed'} ${n} plant${n === 1 ? '' : 's'}.`;
    setTimeout(() => (flash = ''), 3000);
  }
  let flash = $state('');

  /* ---- audit ---- */
  let auditing = $state(false);
  let present = $state<Record<string, boolean>>({});
  function startAudit() {
    present = Object.fromEntries(deep.map((a) => [a.id, false]));
    auditing = true;
  }
  async function finishAudit() {
    const seen = deep.filter((a) => present[a.id]);
    await collection.addEvents(seen.map((a) => ({ acc: a.id, d: today, t: 'audit' as const, note: null })));
    const missing = deep.length - seen.length;
    flash = `${seen.length} present${missing ? `, ${missing} not seen` : ''}.`;
    auditing = false;
    setTimeout(() => (flash = ''), 4000);
  }
  const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);

  /* ---- frost watch for outdoor / unheated places with coordinates ---- */
  let forecast = $state<{ forecast: Forecast; alerts: Alert[]; risk: { level: string; text: string }; attribution: string[] } | null>(null);
  let forecastErr = $state('');
  const watchable = $derived(cond.lat != null && cond.lon != null && cond.indoor !== true);
  $effect(() => {
    if (!watchable || forecast) return;
    getForecast<NonNullable<typeof forecast>>(cond.lat!, cond.lon!, units.current, cond.altM)
      .then((r) => { if (!r.ok) throw new Error('not answered'); forecast = r.body; })
      // Whatever went wrong upstream, the page says the check did not happen, never a status code, and never that the nights are clear.
      .catch(() => (forecastErr = 'Forecast not checked: the forecast source did not answer.'));
  });
  /** A heater set-point protects the plants even outdoors; the risk is only real below the floor. */
  const effectiveRisk = $derived.by(() => {
    if (!forecast) return null;
    const floor = cond.floorC;
    if (floor == null) return forecast.risk;
    const nights = forecast.forecast.days.filter((d) => d.tmin < floor);
    return nights.length ? { level: 'frost', text: `Forecast drops below this place's ${temp(floor, units.current)} floor on ${nights[0].date} (${temp(nights[0].tmin, units.current, 1)} outside).` } : { level: 'none', text: `Outside stays above the ${temp(floor, units.current)} floor for the ${forecast.forecast.hoursCovered} hours of forecast.` };
  });

  let confirmRemove = $state(false);
  async function remove() {
    await collection.removeLocation(id);
    goto('/benches');
  }
</script>

<svelte:head><title>{loc?.name ?? 'Location'} — Cultifolio</title></svelte:head>

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !loc}
  <h1 class="q" style="margin-top: 24px">Not here</h1><p class="muted">No location with that id on this device. <a href="/benches">All locations</a>.</p>
{:else}
  <div class="hero band"><div class="ph">{LOCATION_KINDS.find((k) => k.k === loc.type)?.label ?? 'Place'}{path.length > 1 ? ' inside ' + path.slice(0, -1).map((p) => p.name).join(' › ') : ''}</div></div>
  <div class="idcard">
    <div class="who">
      <h1 class="q" style="margin: 0">{loc.name}</h1>
      <p class="vern">{LOCATION_KINDS.find((k) => k.k === loc.type)?.label ?? 'Place'} · {plural(deep.length, 'growing plant')}{kids.length ? ` in ${plural(kids.length + 1, 'place')}` : ''}{#if cond.indoor != null} · {cond.indoor ? 'indoors' : 'outdoors'}{/if}</p>
      <div class="pills">
        {#if cond.floorC != null}<span class="pill c">floor {temp(cond.floorC, units.current)}</span>{/if}
        {#if dli != null}<span class="pill w">DLI {dli.toFixed(0)}</span>{/if}
        {#if watchable && effectiveRisk}<span class="pill {effectiveRisk.level === 'none' ? 'a' : effectiveRisk.level === 'cold' ? 'w' : 'b'}">{effectiveRisk.level === 'none' ? 'frost: clear' : effectiveRisk.level === 'cold' ? 'cold night coming' : 'frost forecast'}</span>{/if}
        {#if unseen && deep.length}<span class="pill w">{unseen} not seen in 90 d</span>{/if}
      </div>
    </div>
    <div class="acts">
      <button class="btn" onclick={startEdit}>Edit</button>
      {#if confirmRemove}
        <span class="small">Remove this place? Its plants keep their records and lose only the place.</span><button class="btn danger" onclick={remove}>Yes, remove</button><button class="btn" onclick={() => (confirmRemove = false)}>Keep</button>
      {:else}
        <button class="btn danger" onclick={() => (confirmRemove = true)}>Remove place</button>
      {/if}
    </div>
  </div>

  {#if collection.needsHome(id)}
    <p class="small muted">This place needs a home: two devices moved places into each other while offline, so it was set free at the top level. <button type="button" class="linkish" onclick={startEdit}>Move it</button> where it belongs.</p>
  {/if}
  {#if editing}
    <form class="cult form" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <label><span>Name</span><input id="e-name" type="text" bind:value={f.name} /></label>
      <label><span>Kind</span><select id="e-kind" bind:value={f.kind}><option value="">—</option>{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select></label>
      <label><span>Inside</span><select id="e-parent" bind:value={f.parent}><option value={null}>Top level</option>{#each homes as h}<option value={h.id}>{h.name}</option>{/each}</select></label>
      <label><span>Indoors?</span><select id="e-indoor" bind:value={f.indoor}><option value="">Inherit</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label><span>Temperature floor {tempUnit(units.current)}</span><input id="e-floor" type="text" inputmode="decimal" bind:value={f.floorC} placeholder="heater set-point, or what it bottoms out at" /></label>
      <label><span><span style="text-transform: none">µ</span>mol/m²/s of light</span><input id="e-ppfd" type="text" inputmode="decimal" bind:value={f.ppfd} /></label>
      <label><span>Light hours/day</span><input id="e-hours" type="text" inputmode="decimal" bind:value={f.lightHours} /></label>
      <label><span>Latitude</span><input id="e-lat" type="text" inputmode="decimal" bind:value={f.lat} /></label>
      <label><span>Longitude</span><input id="e-lon" type="text" inputmode="decimal" bind:value={f.lon} /></label>
      <label><span>Altitude m</span><input id="e-alt" type="text" inputmode="decimal" bind:value={f.altM} /></label>
      <label class="wide"><span>Notes</span><textarea id="e-notes" rows="2" bind:value={f.notes}></textarea></label>
      <div class="actions wide"><button class="btn" type="button" onclick={useMyLocation}>Use my location</button><span class="grow"></span><button class="btn" type="button" onclick={() => (editing = false)}>Cancel</button><button class="btn pri" type="submit">Save</button></div>
    </form>
  {/if}

  <div class="quickbar">
    <button class="btn pri" onclick={() => waterAll('water')} disabled={!deep.length || !!busy}>Water all {deep.length}</button>
    <button class="btn" onclick={() => waterAll('feed')} disabled={!deep.length || !!busy}>Feed all</button>
    <button class="btn" onclick={startAudit} disabled={!deep.length || auditing}>Audit</button>
    <a class="btn" href="/plants/new?loc={id}">Add a plant here</a>
    <a class="btn" href="/sowings/new?loc={id}">Sow here</a>
    <a class="btn" href="/labels?loc={id}">Labels</a>
    {#if flash}<span class="flash">{flash}</span>{/if}
  </div>

  <div class="cards">
    <div class="card"><div class="lab">Floor</div><div class="val">{cond.floorC == null ? '–' : tempN(cond.floorC, units.current)}<span class="u">{cond.floorC == null ? '' : ' ' + tempUnit(units.current)}</span></div><div class="sub">{cond.floorC == null ? 'not stated' : cond.from.floorC && cond.from.floorC !== loc.name ? `from ${cond.from.floorC}` : 'set here'}</div></div>
    <div class="card"><div class="lab">Light</div><div class="val">{dli == null ? '–' : dli.toFixed(0)}<span class="u">{dli == null ? '' : ' DLI'}</span></div><div class="sub">{cond.ppfd == null ? 'not measured' : `${cond.ppfd} µmol × ${cond.lightHours ?? 12} h${cond.from.ppfd && cond.from.ppfd !== loc.name ? ` · from ${cond.from.ppfd}` : ''}`}</div></div>
    <div class="card"><div class="lab">Last watered</div><div class="val">{lastWater ? daysSince(lastWater) : '–'}<span class="u">{lastWater ? ' d ago' : ''}</span></div><div class="sub">{lastWater ? `most recent plant here, ${lastWater}` : 'nothing recorded'}</div></div>
    <div class="card"><div class="lab">Last audit</div><div class="val">{lastAudit ? daysSince(lastAudit) : '–'}<span class="u">{lastAudit ? ' d ago' : ''}</span></div><div class="sub">{lastAudit ? lastAudit : 'never audited'}{unseen && deep.length ? ` · ${unseen} not seen in 90 d` : ''}</div></div>
  </div>

  {#if watchable}
    <div class="secrule"><h2>Frost watch</h2><div class="line"></div></div>
    {#if forecastErr}<div class="notice">{forecastErr}</div>
    {:else if !forecast}<p class="muted">Fetching the forecast…</p>
    {:else}
      <div class="notice {effectiveRisk?.level === 'none' ? 'ok' : effectiveRisk?.level === 'cold' ? '' : 'err'}"><b>{effectiveRisk?.level === 'none' ? 'All clear.' : effectiveRisk?.level === 'cold' ? 'Cold night coming.' : 'Frost forecast.'}</b> {effectiveRisk?.text}</div>
      <p class="small muted">{forecast.attribution.join(' · ')}. <a href="/frost">Full forecast</a>.</p>
    {/if}
  {:else if cond.indoor !== true}
    <p class="small muted" style="margin-top: 10px"><button type="button" class="linkish" onclick={startEdit}>Add coordinates</button> to this place (or a parent) to watch the forecast for frost.</p>
  {/if}

  {#if cond.lat != null || loc.notes}
    <div class="factgrid">
      {#if cond.lat != null}<div><b>Coordinates</b>{cond.lat}, {cond.lon}{cond.altM != null ? ` · ${cond.altM} m` : ''}{#if cond.from.lat && cond.from.lat !== loc.name}<span class="small muted"> · from {cond.from.lat}</span>{/if}</div>{/if}
      {#if loc.notes}<div class="wide"><b>Notes</b><span style="white-space: pre-wrap">{loc.notes}</span></div>{/if}
    </div>
  {/if}

  {#if kids.length}
    <div class="secrule"><h2>Inside</h2><div class="line"></div><span class="n">{kids.length}</span></div>
    <div class="rows">
      {#each kids as k}
        <a class="azrow" href="/benches/{k.id}"><span class="im">{(LOCATION_KINDS.find((x) => x.k === k.type)?.label ?? 'Place').slice(0, 5)}</span><span><span class="nm" style="font-style: normal">{k.name}</span><span class="fam">{LOCATION_KINDS.find((x) => x.k === k.type)?.label ?? 'Place'}</span></span><span class="fig">{plural(collection.plantsAt(k.id).length, 'plant')}</span></a>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>{auditing ? 'Audit: tick what you can see' : `Plants${kids.length ? ' (including places inside)' : ''}`}</h2><div class="line"></div><span class="n">{deep.length}</span></div>
  {#if !deep.length}
    <div class="cult"><div class="none">Nothing here yet. <a href="/plants/new?loc={id}">Add a plant here</a>, <a href="/sowings/new?loc={id}">sow here</a>, or move one in from its own page.</div></div>
  {:else}
    <div class="rows">
      {#each deep as a (a.id)}
        {@const seen = collection.lastSeen(a.id)}
        {@const ds = daysSince(seen)}
        {#if auditing}
          <label class="azrow accrow row"><input type="checkbox" bind:checked={present[a.id]} /><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span></span><span class="fig">{a.locationId !== id ? collection.location(a.locationId!)?.name ?? '' : ''}</span></label>
        {:else}
          <a class="azrow accrow row" href="/plants/{accNo(a)}">
            <span class="dot statedot {ds == null ? '' : ds > 90 ? 'wake' : 'grow'}" role="img" aria-label={ds == null ? 'never audited' : ds > 90 ? `not seen for ${ds} days` : `seen ${ds} days ago`} title={ds == null ? 'never audited' : ds > 90 ? `not seen for ${ds} days` : `seen ${ds} days ago`}></span>
            <span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span><span class="fam">{a.locationId !== id ? collection.location(a.locationId!)?.name ?? '' : ''}</span></span>
            <span class="fig" class:due={ds != null && ds > 90}>{ds == null ? 'never audited' : ds > 90 ? `not seen for ${ds} days` : `seen ${ds} d ago`}</span>
          </a>
        {/if}
      {/each}
    </div>
    {#if auditing}
      <p class="actions" style="margin-top: 10px"><button class="btn" onclick={() => (auditing = false)}>Cancel</button><button class="btn pri" onclick={finishAudit}>Finish audit</button></p>
    {/if}
  {/if}
{/if}

<style>
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .hero.band { margin-top: 14px; min-height: 0; }
  .hero.band .ph { height: 120px; background: linear-gradient(135deg, var(--sunk), color-mix(in srgb, var(--sunk) 70%, var(--accent-soft))); }
  .muted { color: var(--ink3); }
  .flash { color: var(--accent); font-weight: 600; align-self: center; }
  .form { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; margin-top: 16px; }
  .form label { display: grid; gap: 4px; }
  .form label > span { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .form input, .form select, .form textarea { width: 100%; font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .actions { display: flex; gap: 8px; margin: 0; }
  .grow { flex: 1; }
  .factgrid .wide { grid-column: 1 / -1; }
  .row { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .row .dot { margin: 0 auto; }
  .row input[type='checkbox'] { width: 18px; height: 18px; margin: 0 auto; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  @media (max-width: 640px) { .form { grid-template-columns: 1fr 1fr; } .hero.band { margin-top: 0; } .azrow .fig { display: none; } }
</style>

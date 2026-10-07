<script lang="ts">
  import Parked from '$lib/ui/Parked.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { getForecast, forecastRefusal } from '$lib/weather/client';
  import { localDate, daysBetween } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import { temp, tempN, tempUnit, cToF, fToC } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto, beforeNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import WaitingRecord from '$lib/ui/WaitingRecord.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { LOCATION_KINDS, type LocationKind } from '$lib/db/types';
  import type { Forecast, Alert } from '$lib/weather/forecast';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { focusNext } from '$lib/ui/focus';
  import { site } from '$lib/ui/site.svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { plantHref } from '$lib/db/links';
  import { monthRuns } from '$lib/ui/today-words';
  import { DUE_DAYS } from '$lib/db/collection.svelte';
  onMount(async () => {
    site.load(); // the frost watch falls back to the grower's site (round fifty-eight; the grower review)
    await collection.load();
    // /places/<id>?edit=1 from a plant page that found a figure missing here.
    if (page.url.searchParams.get('edit') === '1') startEdit();
  });

  const id = $derived(page.params.id!);
  const loc = $derived(collection.location(id));
  const waiting = $derived(loc ? undefined : collection.waiting('location', id));
  const path = $derived(collection.locationPath(id));
  const parentName = $derived(path.length > 1 ? path.slice(0, -1).map((p) => p.name).join(' › ') : null);
  const kids = $derived(collection.children(id));
  const here = $derived(collection.plantsAt(id, false));
  const deep = $derived(collection.plantsAt(id, true));
  const cond = $derived(collection.conditions(id));
  const today = () => localDate(); // read when the action runs, not when the page loaded (round twenty-four, 2)
  $effect(() => {
    if (loc) setCrumb([{ label: 'Places', href: '/places' }, ...path.slice(0, -1).map((p) => ({ label: p.name, href: `/places/${p.id}` })), { label: loc.name }]);
    return () => setCrumb([]);
  });
  const dli = $derived(cond.ppfd != null ? (cond.ppfd * (cond.lightHours ?? 12) * 3600) / 1e6 : null);
  // The most recent watering of any plant here, and the longest wait among them, so "0 d ago" cannot stand for a place where two plants are at 35 d (round twenty-four, 12).
  const watering = $derived.by(() => { const ds = deep.map((a) => collection.lastWatered(a.id)); const dated = ds.filter((d): d is string => !!d).sort(); return { newest: dated.length ? dated[dated.length - 1] : null, oldest: dated.length ? dated[0] : null, never: ds.length - dated.length }; });
  const lastWater = $derived(watering.newest);
  const dueHere = $derived(deep.filter((a) => collection.isDue(a)).length); // the same figure Today and the list count (round twenty-six, 6), by each plant's rhythm (round fifty-eight)
  const lastAudit = $derived.by(() => { const ds = deep.map((a) => collection.events(a.id).find((e) => e.t === 'audit')?.d).filter((d): d is string => !!d).sort(); return ds.length ? ds[ds.length - 1] : null; });
  // The same set Today counts, by the collection's one reading: missed at the last audit, or not seen for ninety days in a place that has been audited (round twenty-five, 14; round fifty-eight).
  const unseen = $derived(deep.filter((a) => collection.unseenWhy(a.id)).length);
  const missedNow = $derived(deep.filter((a) => collection.missedAt(a.id)).length);

  /* ---- edit conditions ---- */
  let editing = $state(false);
  let f = $state<{ name: string; kind: LocationKind | string; parent: string | null; indoor: '' | 'yes' | 'no'; floorC: string; floorHeld: 'held' | 'bottoms'; ppfd: string; lightHours: string; lat: string; lon: string; altM: string; waterDays: string; dryMonths: number[] | null; notes: string }>({ name: '', kind: '', parent: null, indoor: '', floorC: '', floorHeld: 'bottoms', ppfd: '', lightHours: '', lat: '', lon: '', altM: '', waterDays: '', dryMonths: null, notes: '' });
  /** Places this one could sit inside: everything but itself and what is under it. */
  const homes = $derived.by(() => {
    const under = new Set(collection.subtree(id));
    return collection.locations.filter((l) => !under.has(l.id)).map((l) => ({ id: l.id, name: collection.locationName(l.id) }));
  });
  function startEdit() {
    if (!loc) return;
    f = { name: loc.name, kind: loc.type ?? '', parent: path.length > 1 ? path[path.length - 2].id : null, indoor: loc.indoor == null ? '' : loc.indoor ? 'yes' : 'no', floorC: loc.floorC == null ? '' : (units.current === 'us' ? +cToF(loc.floorC).toFixed(1) : +loc.floorC.toFixed(1)).toString(), floorHeld: loc.floorHeld ? 'held' : 'bottoms', ppfd: loc.ppfd?.toString() ?? '', lightHours: loc.lightHours?.toString() ?? '', lat: loc.lat?.toString() ?? '', lon: loc.lon?.toString() ?? '', altM: loc.altM == null ? '' : (altFt ? Math.round(loc.altM / FT) : loc.altM).toString(), waterDays: loc.waterDays?.toString() ?? '', dryMonths: loc.dryMonths ? [...loc.dryMonths] : null, notes: loc.notes ?? '' };
    fOpen = { ...f, dryMonths: f.dryMonths ? f.dryMonths.join(',') : null };
    bad = {};
    formMsg = '';
    editing = true;
  }
  /** The form as it opened: only what changed in it is written (round fifty-two, 4). */
  let fOpen: Record<string, unknown> = {};
  const formDirty = () => editing || movingIn || auditing;
  // A half-done form is not lost to a tab-bar tap or a reload without asking (round fifty-two, 4; the Add form has had this since round forty-nine).
  beforeNavigate((nav) => {
    if (!formDirty() || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave this page? What you typed here will be lost.')) nav.cancel();
  });
  function guardUnload(e: BeforeUnloadEvent) {
    if (formDirty()) e.preventDefault();
  }
  /** A typed figure: null for an empty box (cleared on purpose, so inherited), NaN for anything that is not a number, which the checks below refuse rather than write as empty (round fifty-nine). */
  const num = (s: string) => (s.trim() === '' ? null : Number(s.trim().replace(/^\+/, '').replace('−', '-')));
  // Altitude in the reader's lengths, feet or metres, as Settings' "Lengths" sets them (or as the temperature goes, when
  // it follows); stored in metres whatever the display (round fifty-eight; round fifty-nine: it followed the temperature).
  const FT = 0.3048;
  const altFt = $derived(prefs.lengthUnits === 'in');
  const altShown = (m: number) => (altFt ? `${Math.round(m / FT)} ft` : `${m} m`);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** The place's rules in one line at the top: "Every 10 days · dry Dec to Feb · held at 5 °C" (round sixty; the grower review, §4). Only what is set here or above. */
  const summary = $derived([
    cond.waterDays ? `every ${cond.waterDays} days` : null,
    cond.dryMonths?.length ? `dry ${monthRuns(cond.dryMonths)}` : null,
    cond.floorC != null ? `${cond.floorHeld ? 'held at' : 'bottoms out at'} ${temp(cond.floorC, units.current, 1)}` : null
  ].filter((x): x is string => !!x));
  /** What the place above says, for the form's placeholders: the rhythm and the dry months this place inherits when it sets none. */
  const parentCond = $derived(loc?.parentId && collection.location(loc.parentId) ? collection.conditions(loc.parentId) : null);
  const inheritedDays = $derived(parentCond?.waterDays ?? null);
  const inheritedDry = $derived(parentCond?.dryMonths ?? null);
  /** What the form refused, by field, each a sentence under its field; and the one sentence the form says aloud (round fifty-nine). */
  let bad = $state<Record<string, string>>({});
  let formMsg = $state('');
  let saving = $state(false);
  const FIELD_IDS: Record<string, string> = { floorC: 'e-floor', ppfd: 'e-ppfd', lightHours: 'e-hours', lat: 'e-lat', lon: 'e-lon', altM: 'e-alt', waterDays: 'e-waterdays' };
  /** Each figure checked before anything is written: a number, in a range a place can have; a latitude needs its longitude. */
  function check(): Record<string, string> {
    const out: Record<string, string> = {};
    const said = (s: string) => s.trim();
    const isNum = (v: number | null) => v == null || Number.isFinite(v);
    const floor = num(f.floorC), us = units.current === 'us';
    if (!isNum(floor)) out.floorC = `${said(f.floorC)} is not a temperature; type a figure such as ${us ? '41' : '5'}, or leave it blank.`;
    else if (floor != null && (us ? floor < -58 || floor > 122 : floor < -50 || floor > 50)) out.floorC = `${said(f.floorC)} is outside ${us ? '−58 to 122 °F' : '−50 to 50 °C'}, the range a floor can be.`;
    const ppfd = num(f.ppfd);
    if (!isNum(ppfd)) out.ppfd = `${said(f.ppfd)} is not a number; light is in µmol/m²/s, such as 300.`;
    else if (ppfd != null && (ppfd < 0 || ppfd > 3000)) out.ppfd = `${said(f.ppfd)} is outside 0 to 3000 µmol/m²/s; full sun is about 2000.`;
    const hours = num(f.lightHours);
    if (!isNum(hours)) out.lightHours = `${said(f.lightHours)} is not a number of hours.`;
    else if (hours != null && (hours < 0 || hours > 24)) out.lightHours = `${said(f.lightHours)} is outside 0 to 24 hours a day.`;
    const lat = num(f.lat), lon = num(f.lon);
    if (!isNum(lat)) out.lat = `${said(f.lat)} is not a latitude; use decimal degrees, such as 40.4.`;
    else if (lat != null && (lat < -90 || lat > 90)) out.lat = `${said(f.lat)} is outside −90 to 90; latitude is north (positive) or south (negative) of the equator.`;
    if (!isNum(lon)) out.lon = `${said(f.lon)} is not a longitude; use decimal degrees, such as -80.0.`;
    else if (lon != null && (lon < -180 || lon > 180)) out.lon = `${said(f.lon)} is outside −180 to 180; longitude is east (positive) or west (negative).`;
    if (!out.lat && !out.lon && (lat == null) !== (lon == null)) {
      if (lat == null) out.lat = 'A longitude needs its latitude: give both, or clear both.';
      else out.lon = 'A latitude needs its longitude: give both, or clear both.';
    }
    // An altitude the forecast source cannot take is refused here, with the likely reason, rather than on every frost check afterwards.
    const typedAlt = num(f.altM);
    if (!isNum(typedAlt)) out.altM = `${said(f.altM)} is not a number of ${altFt ? 'feet' : 'metres'}.`;
    else if (typedAlt != null) {
      const alt = altFt ? typedAlt * FT : typedAlt;
      if (alt < -500 || alt > 9000) out.altM = altFt ? `${said(f.altM)} is outside −1640 to 29527 ft.` : `${said(f.altM)} is outside −500 to 9000 m${alt > 9000 && alt < 30000 ? `; in feet that would be ${Math.round(alt * FT)} m` : ''}.`;
    }
    // The plant form's rule and sentence (round fifty-nine): a whole number of days, 1 to 365; an empty box follows the place above.
    const wd = num(f.waterDays);
    if (wd != null && (!Number.isInteger(wd) || wd < 1 || wd > 365)) out.waterDays = `${said(f.waterDays)} is not a whole number of days from 1 to 365; leave it blank to follow ${inheritedDays ? 'the place above' : 'the default'}.`;
    return out;
  }
  async function save() {
    if (saving) return;
    bad = check();
    const first = Object.keys(FIELD_IDS).find((k) => bad[k]);
    if (first) {
      const n = Object.keys(bad).length;
      formMsg = `Not saved: ${bad[first]}${n > 1 ? ` And ${n - 1} more under ${n === 2 ? 'its field' : 'their fields'}.` : ''}`;
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    formMsg = '';
    const typedAlt = num(f.altM);
    const alt = typedAlt == null ? null : altFt ? Math.round(typedAlt * FT * 10) / 10 : typedAlt; // metres, as stored (round fifty-eight; the grower review)
    // "Bottoms out" is the unset reading too: a place that never said is not given `floorHeld: false` by an unrelated edit (round forty-nine, 2; round thirty-five, R1-6).
    // The place's fields and its new parent are one commit: a page closed between the two left a place edited but not moved (round fifty-one, 3).
    const moving = (f.parent ?? null) !== (loc?.parentId ?? null) || collection.needsHome(id);
    const all: Record<string, unknown> = { name: f.name.trim() || loc?.name, type: f.kind || null, indoor: f.indoor === '' ? null : f.indoor === 'yes', floorC: (() => { const v = num(f.floorC); return v == null ? null : units.current === 'us' ? +fToC(v).toFixed(2) : v; })(), floorHeld: num(f.floorC) == null ? null : f.floorHeld === 'held' ? true : loc?.floorHeld ? false : (loc?.floorHeld ?? null), ppfd: num(f.ppfd), lightHours: num(f.lightHours), lat: num(f.lat), lon: num(f.lon), altM: alt, waterDays: num(f.waterDays), dryMonths: f.dryMonths ? [...f.dryMonths].sort((x, y) => x - y) : null, notes: f.notes.trim() || null };
    const asOpened = { ...f, dryMonths: f.dryMonths ? f.dryMonths.join(',') : null };
    const touched = new Set(Object.keys(asOpened).filter((k) => (asOpened as Record<string, unknown>)[k] !== fOpen[k]));
    const byForm: Record<string, string[]> = { name: ['name'], kind: ['type'], indoor: ['indoor'], floorC: ['floorC', 'floorHeld'], floorHeld: ['floorHeld', 'floorC'], ppfd: ['ppfd'], lightHours: ['lightHours'], lat: ['lat'], lon: ['lon'], altM: ['altM'], waterDays: ['waterDays'], dryMonths: ['dryMonths'], notes: ['notes'] };
    const write = new Set<string>();
    for (const k of touched) for (const fld of byForm[k] ?? []) write.add(fld);
    // A latitude and its longitude go together: one changed writes both, so the place never holds half a pair.
    if (write.has('lat') || write.has('lon')) { write.add('lat'); write.add('lon'); }
    const fields = Object.fromEntries(Object.entries(all).filter(([k]) => write.has(k)));
    // The write can be refused (storage full, a move into itself): the reason is said in the form, which stays open with
    // what was typed, so it can be tried again (round fifty-nine).
    saving = true;
    try {
      if (moving) collection.checkMove(id, f.parent ?? null);
      await collection.put('location', id, { ...fields, ...(moving ? { parentId: f.parent ?? null } : {}) });
      editing = false;
    } catch (e) {
      const why = collection.lastWriteError ?? (e instanceof Error ? e.message : String(e));
      formMsg = `Not saved: ${why.replace(/\.$/, '')}. What you typed is still here; try again.`;
    } finally {
      saving = false;
    }
  }
  const clearBad = (...ks: string[]) => { if (ks.some((k) => bad[k])) { const n = { ...bad }; for (const k of ks) delete n[k]; bad = n; } if (formMsg && !Object.keys(bad).length) formMsg = ''; };
  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition((p) => { f.lat = p.coords.latitude.toFixed(4); f.lon = p.coords.longitude.toFixed(4); if (p.coords.altitude != null) f.altM = Math.round(altFt ? p.coords.altitude / FT : p.coords.altitude).toString(); }); // the device gives metres; the box is in the reader's units (round fifty-eight)
  }

  /* ---- water / feed the whole place ---- */
  let busy = $state('');
  async function waterAll(t: 'water' | 'feed') {
    if (busy) return; // a second tap before the first commits wrote every line twice (round fifty-two, 3)
    busy = t;
    // A place-wide line is not an observation of each plant, so it never counts as one being seen (round twenty-four, 3).
    const ids = await collection.addEventsIds(deep.map((a) => ({ acc: a.id, d: today(), t, note: `whole ${loc?.type ?? 'place'}: ${loc?.name ?? ''}` }))); // the grower's own action: a sighting, not an `auto` line (round fifty-eight)
    busy = '';
    const n = ids.length;
    // One tap wrote n lines; one tap takes exactly those back (round twenty-six, 5).
    toast.show(`${t === 'water' ? 'Watered' : 'Fed'} ${n} plant${n === 1 ? '' : 's'}.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents(ids).then(() => toast.show(`Undone: the ${n} ${t === 'water' ? 'watering' : 'feeding'} line${n === 1 ? '' : 's'} removed.`)); } });
  }

  /* ---- move plants here ---- */
  /** A benchful moved in one go, from a list of growing plants elsewhere, filtered as typed; one commit, with each plant's move line (round forty-nine, 3). */
  let movingIn = $state(false);
  let moveQ = $state('');
  let moveChosen = $state<Record<string, boolean>>({});
  const movable = $derived(collection.accessions.filter((a) => a.status === 'growing' && !deep.some((d) => d.id === a.id)));
  const moveShown = $derived.by(() => { const n = moveQ.trim().toLowerCase(); return n ? movable.filter((a) => accNo(a).toLowerCase().includes(n) || a.taxonName.toLowerCase().includes(n) || (a.locationId ? collection.locationName(a.locationId).toLowerCase().includes(n) : false)) : movable; });
  const moveN = $derived(Object.values(moveChosen).filter(Boolean).length);
  // The button that opened the list is disabled while it is open, so focus goes to the list's filter, not to the page body (round fifty-eight; the accessibility review).
  function startMove() { movingIn = true; moveQ = ''; moveChosen = {}; void focusNext('#move-filter'); }
  let movingBusy = $state(false);
  async function finishMove() {
    if (movingBusy) return; // a second tap while the first commits wrote the move twice (round fifty-one, 4)
    const ids = Object.entries(moveChosen).filter(([, v]) => v).map(([k]) => k);
    if (!ids.length) { movingIn = false; return; }
    movingBusy = true;
    try {
      const { n, undo } = await collection.movePlantsUndoable(ids, id);
      movingIn = false;
      toast.show(`Moved ${n} plant${n === 1 ? '' : 's'} to ${loc?.name ?? 'here'}.`, 8000, { label: 'Undo', run: () => { void undo().then(() => toast.show(`Undone: ${n} plant${n === 1 ? '' : 's'} back where ${n === 1 ? 'it was' : 'they were'}.`)); } });
    } finally {
      movingBusy = false;
    }
  }

  /* ---- audit ---- */
  let auditing = $state(false);
  let present = $state<Record<string, boolean>>({});
  function startAudit() {
    present = Object.fromEntries(deep.map((a) => [a.id, false]));
    auditing = true;
    auditResult = '';
    confirmCancel = false;
    // The Audit button is disabled while the audit runs, which drops its focus to the page body: focus goes to the first
    // plant's box instead (round fifty-eight; the accessibility review).
    void focusNext('.auditrows input[type="checkbox"]');
  }
  /** Back to the button that started the audit, once it is enabled again (round fifty-eight; the accessibility review). */
  const backToAudit = () => void focusNext('#audit-start');
  const tickedN = $derived(Object.values(present).filter(Boolean).length);
  /** Tick every plant, then untick the one or two missing: a bench of forty where all but one are there was forty taps (round forty-nine, 3). */
  // Each of the two disables itself when pressed, so focus goes to the other (round fifty-eight; the accessibility review).
  const tickAll = (v: boolean) => { present = Object.fromEntries(deep.map((a) => [a.id, v])); void focusNext(v ? '#audit-clear' : '#audit-all'); };
  /** Cancel with ticks made asks once; the result stays under the list, where the finger is, until the next audit. */
  let confirmCancel = $state(false);
  let auditResult = $state('');
  function cancelAudit() {
    if (tickedN && !confirmCancel) { confirmCancel = true; void focusNext('#audit-cancel-yes'); return; } // the question that replaced the button (round fifty-eight; the accessibility review)
    auditing = false;
    confirmCancel = false;
    backToAudit();
  }
  function keepAuditing() {
    confirmCancel = false;
    void focusNext('#audit-cancel'); // round fifty-eight; the accessibility review
  }
  let auditBusy = false;
  async function finishAudit() {
    if (auditBusy) return;
    auditBusy = true;
    try {
    const seen = deep.filter((a) => present[a.id]);
    const missed = deep.filter((a) => !present[a.id]);
    // Both outcomes are logged: a plant not found at an audit carries that on its own timeline, and the row says so on every screen size (round twenty-three, 5).
    const d = today();
    await collection.addEvents([...seen.map((a) => ({ acc: a.id, d, t: 'audit' as const, note: null })), ...missed.map((a) => ({ acc: a.id, d, t: 'audit' as const, note: 'not seen' }))]);
    const missing = missed.length;
    auditResult = `Audit recorded: ${seen.length} present${missing ? `, ${missing} not seen: ${missed.map(accNo).join(', ')}` : ''}.`;
    auditing = false;
    backToAudit();
    } finally {
      auditBusy = false;
    }
  }
  const daysSince = (d: string | null) => (d ? daysBetween(d) : null);
  /** Nothing to show in the cards or the facts: no floor, light, watering, audit, rhythm or dry months, here or above (round fifty-nine: the sentence said so over a Watering row). */
  const nothingRecorded = $derived(cond.floorC == null && dli == null && !lastWater && !lastAudit && !cond.waterDays && !cond.dryMonths?.length);

  /* ---- frost watch for outdoor / unheated places with coordinates ---- */
  type ForecastAnswer = { forecast: Forecast; alerts: Alert[]; alertsStatus?: 'ok' | 'none' | 'refused' | 'n/a'; risk: { level: string; text: string }; attribution: string[] };
  /** The forecast, with the conditions it was asked for: an answer is shown only while those are still the place's (round thirteen, B1). */
  let got = $state<{ key: string; answer: ForecastAnswer } | null>(null);
  let forecastErr = $state('');
  // An outdoor or unheated place with no coordinates of its own or above it is watched at the grower's site, and says so;
  // `conditions` is not changed: the site is this device's setting, not the place's (round fifty-eight; the grower review).
  const ownCoords = $derived(cond.lat != null && cond.lon != null);
  const bySite = $derived(!ownCoords && cond.indoor !== true && !!site.current);
  const fLat = $derived(ownCoords ? cond.lat : bySite ? (site.current?.lat ?? null) : null);
  const fLon = $derived(ownCoords ? cond.lon : bySite ? (site.current?.lon ?? null) : null);
  const fAlt = $derived(ownCoords ? cond.altM : null); // the site carries no altitude; the place's would be another spot's
  const watchable = $derived(fLat != null && fLon != null && cond.indoor !== true);
  const condKey = $derived(watchable ? `${fLat},${fLon},${fAlt ?? ''},${units.current}` : '');
  const forecast = $derived(got && got.key === condKey ? got.answer : null);
  $effect(() => {
    if (!condKey || (got && got.key === condKey)) return;
    const key = condKey; // what this request is for; a place edited before it answers makes the answer stale, and a stale answer is dropped
    forecastErr = '';
    getForecast<ForecastAnswer>(fLat!, fLon!, units.current, fAlt)
      .then((r) => { if (key !== condKey) return; if (!r.ok) { forecastErr = forecastRefusal(r); return; } got = { key, answer: r.body }; })
      // Whatever went wrong, the page says the check did not happen, never a status code, and never that the nights are clear; our own refusals are said as ours.
      .catch(() => { if (key === condKey) forecastErr = forecastRefusal(null); });
  });
  /**
   * A heater set-point protects the plants even outdoors, so with a floor set the first question is whether the outside
   * reaches it: its own level and wording, and a night that reaches it exactly counts (round thirteen, 11). A floor that
   * is not reached does not make the forecast clear: a frost or cold night the forecast itself found keeps its own level,
   * with the floor sentence added, so a place with a -5 °C floor never says "frost: clear" over a -2 °C night (round
   * fifteen, 11). An NWS warning in force is said whatever the floor, and alerts that were not checked are said not to
   * have been (round twelve, 9).
   */
  const effectiveRisk = $derived.by(() => {
    if (!forecast) return null;
    const floor = cond.floorC;
    if (floor == null) return forecast.risk;
    if (forecast.risk.level === 'warning') return forecast.risk;
    const F = temp(floor, units.current, 1);
    const nights = forecast.forecast.days.filter((d) => d.tmin <= floor);
    // A heater's set-point: outside reaching it is the heater's work, and the line says what the plants get, not a warning (round forty, own).
    if (cond.floorHeld) {
      const coldest = forecast.forecast.days.length ? forecast.forecast.days.reduce((a, b) => (b.tmin < a.tmin ? b : a)) : null;
      return { level: 'none', text: `Held at ${F} by its heater${coldest ? `; outside falls to ${temp(coldest.tmin, units.current, 1)} on ${coldest.date} (MET Norway)` : ''}. A plant that needs more than ${F} is the one at risk here.` };
    }
    if (nights.length) return { level: 'floor', text: `Forecast reaches this place's ${F} floor on ${nights[0].date} (${temp(nights[0].tmin, units.current, 1)} outside).` };
    const above = `Outside stays above the ${F} floor for the ${forecast.forecast.hoursCovered} hours of forecast.`;
    return forecast.risk.level === 'none' ? { level: 'none', text: above } : { level: forecast.risk.level, text: `${forecast.risk.text} ${above}` };
  });
  const alertsUnchecked = $derived(forecast?.alertsStatus === 'refused');

  let confirmRemove = $state(false);
  async function remove() {
    const r = await collection.removeLocation(id);
    const parts = [r.plants ? `${r.plants} plant${r.plants === 1 ? '' : 's'}` : '', r.batches ? `${r.batches} batch${r.batches === 1 ? '' : 'es'}` : '', r.places ? `${r.places} place${r.places === 1 ? '' : 's'}` : ''].filter(Boolean);
    toast.show(parts.length ? `Removed. ${parts.join(', ')} moved ${r.to ? `up to ${r.to}` : 'to the top level'}${r.plants ? ', and each plant\'s log says so' : ''}.` : 'Removed.');
    goto('/places');
  }
</script>

{#snippet ago(n: number | null)}{#if n == null}–{:else if n === 0}today{:else}{n}<span class="u">{' d ago'}</span>{/if}{/snippet}

<svelte:head><title>{loc?.name ?? 'Location'} · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} />

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !loc}
  {#if waiting}<h1 class="q" style="margin-top: 24px">Not whole</h1><WaitingRecord kind="location" label="This place" {waiting} /><p class="muted"><a href="/places">All places</a>.</p>{:else}<h1 class="q" style="margin-top: 24px">Not here</h1><p class="muted">No place with that id on this device. <a href="/places">All places</a>.</p>{/if}
{:else}
  <!-- No band above the card: it carried only the kind, which the line under the name says, and on a phone it was a grey
       block before anything the grower came for. The path to the place is in that line now (round fifty, 4). -->
  <div class="idcard flat">
    <div class="who">
      <h1 class="q" style="margin: 0">{loc.name}</h1>
      {#if summary.length}<p class="rules" id="place-rules">{summary.join(' · ').replace(/^./, (c) => c.toUpperCase())}</p>{/if}
      <p class="vern">{LOCATION_KINDS.find((k) => k.k === loc.type)?.label ?? 'Place'}{path.length > 1 ? ' inside ' + path.slice(0, -1).map((p) => p.name).join(' › ') : ''} · {plural(deep.length, 'growing plant')}{kids.length ? ` in ${plural(collection.subtree(id).length, 'place')}` : ''}{#if cond.indoor != null}{' · '}{cond.indoor ? 'indoors' : 'outdoors'}{/if}</p>
      {#if cond.floorC != null || dli != null || (watchable && effectiveRisk) || (unseen && deep.length) || dueHere}
      <div class="pills">
        {#if cond.floorC != null}<span class="pill c">{cond.floorHeld ? 'held at' : 'floor'} {temp(cond.floorC, units.current, 1)}</span>{/if}
        {#if dli != null}<span class="pill w">DLI {dli.toFixed(0)}</span>{/if}
        {#if watchable && effectiveRisk}<span class="pill {effectiveRisk.level === 'none' ? 'a' : effectiveRisk.level === 'cold' ? 'w' : 'b'}">{effectiveRisk.level === 'none' ? (alertsUnchecked ? 'forecast clear; alerts not checked' : 'frost: clear') : effectiveRisk.level === 'cold' ? 'cold night coming' : effectiveRisk.level === 'floor' ? 'reaches the floor' : effectiveRisk.level === 'warning' ? 'weather warning' : 'frost forecast'}</span>{/if}
        <!-- The due count where it is seen whatever is recorded: it was only in the Last watered card, absent until a first watering (round fifty-nine). -->
        {#if dueHere}<span class="pill w">{dueHere} due</span>{/if}
        {#if unseen && deep.length}<span class="pill w">{unseen} not seen{missedNow === unseen ? ' at the last audit' : ' in 90 d'}</span>{/if}
      </div>
      {/if}
    </div>
  </div>

  <Parked kind="location" id={id} />
  {#if collection.needsHome(id)}
    <p class="small muted">This place needs a home: two devices moved places into each other while offline, so it was set free at the top level. <button type="button" class="linkish" onclick={startEdit}>Move it</button> where it belongs.</p>
  {/if}
  {#if editing}
    <form class="cult form" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <label><span>Name</span><input id="e-name" type="text" bind:value={f.name} /></label>
      <!-- "this version of the app", not "this build": the glossary's plain words (round fifty-eight; the accessibility review). -->
      <label><span>Kind</span><select id="e-kind" bind:value={f.kind}><option value="">Not stated</option><!-- words, not a dash (round fifty-eight) -->{#if f.kind && !LOCATION_KINDS.some((k) => k.k === f.kind)}<option value={f.kind}>{f.kind} (a kind this version of the app does not know)</option>{/if}{#each LOCATION_KINDS as k}<option value={k.k}>{k.label}</option>{/each}</select></label>
      <label><span>Inside</span><select id="e-parent" bind:value={f.parent}><option value={null}>Top level</option>{#each homes as h}<option value={h.id}>{h.name}</option>{/each}</select></label>
      <label><span>Indoors?</span><select id="e-indoor" bind:value={f.indoor}><option value="">Inherit</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label><span>Temperature floor {tempUnit(units.current)}</span><input id="e-floor" type="text" inputmode="decimal" bind:value={f.floorC} placeholder="the coldest it gets" oninput={() => clearBad('floorC')} aria-invalid={!!bad.floorC} aria-describedby={bad.floorC ? 'e-floor-bad' : undefined} />{#if bad.floorC}<span class="bad small" id="e-floor-bad">{bad.floorC}</span>{/if}</label>
      <!-- A set-point and a bottoming-out figure read oppositely on a cold night: outside reaching a set-point is the heater's job; reaching a bottoming-out figure is the plants' (round forty, own). -->
      <label><span>That floor is</span><select id="e-floorkind" bind:value={f.floorHeld}><option value="bottoms">what it bottoms out at (unheated)</option><option value="held">held by a heater (its set-point)</option></select></label>
      <label><span><span style="text-transform: none">µ</span>mol/m²/s of light</span><input id="e-ppfd" type="text" inputmode="decimal" bind:value={f.ppfd} oninput={() => clearBad('ppfd')} aria-invalid={!!bad.ppfd} aria-describedby={bad.ppfd ? 'e-ppfd-bad' : undefined} />{#if bad.ppfd}<span class="bad small" id="e-ppfd-bad">{bad.ppfd}</span>{/if}</label>
      <label><span>Light hours/day</span><input id="e-hours" type="text" inputmode="decimal" bind:value={f.lightHours} oninput={() => clearBad('lightHours')} aria-invalid={!!bad.lightHours} aria-describedby={bad.lightHours ? 'e-hours-bad' : undefined} />{#if bad.lightHours}<span class="bad small" id="e-hours-bad">{bad.lightHours}</span>{/if}</label>
      <label><span>Latitude</span><input id="e-lat" type="text" inputmode="decimal" bind:value={f.lat} oninput={() => clearBad('lat', 'lon')} aria-invalid={!!bad.lat} aria-describedby={bad.lat ? 'e-lat-bad' : undefined} />{#if bad.lat}<span class="bad small" id="e-lat-bad">{bad.lat}</span>{/if}</label>
      <label><span>Longitude</span><input id="e-lon" type="text" inputmode="decimal" bind:value={f.lon} oninput={() => clearBad('lon', 'lat')} aria-invalid={!!bad.lon} aria-describedby={bad.lon ? 'e-lon-bad' : undefined} />{#if bad.lon}<span class="bad small" id="e-lon-bad">{bad.lon}</span>{/if}</label>
      <label><span>Altitude {altFt ? 'ft' : 'm'}</span><input id="e-alt" type="text" inputmode="decimal" bind:value={f.altM} oninput={() => clearBad('altM')} aria-invalid={!!bad.altM} aria-describedby={bad.altM ? 'e-alt-bad' : undefined} />{#if bad.altM}<span class="bad small" id="e-alt-bad">{bad.altM}</span>{/if}</label>
      <!-- The grower's own watering rhythm, inherited by the places inside (round fifty-eight; the grower review): what "due" means here, and the months kept dry on purpose. -->
      <label><span>Water about every</span><span class="unitfield"><input id="e-waterdays" type="text" inputmode="numeric" bind:value={f.waterDays} placeholder={inheritedDays ? `${inheritedDays} (inherited)` : '21 (the default)'} oninput={() => clearBad('waterDays')} aria-invalid={!!bad.waterDays} aria-describedby={bad.waterDays ? 'e-waterdays-bad' : undefined} /> days</span>{#if bad.waterDays}<span class="bad small" id="e-waterdays-bad">{bad.waterDays}</span>{/if}</label>
      <fieldset class="wide months"><legend>Kept dry in {f.dryMonths === null ? `(${inheritedDry?.length ? 'inherited: ' + inheritedDry.map((m) => MONTHS[m - 1]).join(', ') : 'none set'})` : ''}</legend>
        {#each MONTHS as m, i (i)}<label class="mo"><input type="checkbox" checked={(f.dryMonths ?? inheritedDry ?? []).includes(i + 1)} onchange={(e) => { const on = (e.currentTarget as HTMLInputElement).checked; const base = f.dryMonths ?? [...(inheritedDry ?? [])]; f.dryMonths = on ? [...new Set([...base, i + 1])] : base.filter((x) => x !== i + 1); }} />{m}</label>{/each}
        {#if f.dryMonths !== null}<button type="button" class="linkish small" onclick={() => (f.dryMonths = null)}>Inherit again</button>{/if}
      </fieldset>
      <label class="wide"><span>Notes</span><textarea id="e-notes" rows="2" bind:value={f.notes}></textarea></label>
      <!-- What stopped the save, said aloud: a figure refused, or the write itself refused (round fifty-nine). Always in the page, so a screen reader hears it change. -->
      <p class="bad small wide formmsg" id="e-msg" role="alert">{formMsg}</p>
      <div class="actions wide"><button class="btn" type="button" onclick={useMyLocation}>Use my location</button><span class="grow"></span><button class="btn" type="button" onclick={() => { editing = false; bad = {}; formMsg = ''; }}>Cancel</button><button class="btn pri" type="submit" disabled={saving}>Save</button></div>
    </form>
  {/if}

  <!-- What is done to the plants here leads; what is done to the place is a quieter row of words beneath it (round fifty, 4). -->
  <div class="quickbar">
    {#if deep.length}
      <!-- aria-disabled while it saves, so keyboard focus stays on the button (round sixty; the accessibility review, 1). -->
      <button class="btn pri" onclick={() => waterAll('water')} aria-disabled={!!busy}>Water all {deep.length}</button>
      <button class="btn" onclick={() => waterAll('feed')} aria-disabled={!!busy}>Feed all</button>
      <button class="btn" id="audit-start" onclick={startAudit} disabled={auditing}>Audit</button>
      <!-- The plants here, in My plants' select mode, for what this row does not do (move, archive, labels): the list's own place filter (round sixty-one; decision 12, the grower review). -->
      <a class="btn" id="select-these" href="/plants?place={encodeURIComponent(id)}&select=1">Select these</a>
    {:else}
      <a class="btn pri" href="/plants/new?loc={id}">Add a plant here</a>
    {/if}
  </div>
  <div class="quickbar words">
    {#if deep.length}<a class="btn" href="/plants/new?loc={id}">Add a plant here</a>{/if}
    {#if movable.length}<button class="btn" type="button" onclick={startMove} disabled={movingIn}>Move plants here</button>{/if}
    <a class="btn" href="/propagation/new?loc={id}">Start a batch here</a>
    <a class="btn" href="/labels?loc={id}">Labels</a>
    <button class="btn" type="button" onclick={startEdit}>Edit</button>
  </div>

  {#if movingIn}
    <div class="cult movein">
      <div class="sum">Move plants here <span class="hint">tick the plants, then Move; each gets a move line on its timeline</span></div>
      <div class="body">
        <input class="searchbar" id="move-filter" type="search" placeholder="Filter by number, name or place…" bind:value={moveQ} aria-label="Filter plants to move" />
        <div class="rows moverows">
          {#each moveShown.slice(0, 200) as a (a.id)}
            <label class="azrow accrow row"><input type="checkbox" bind:checked={moveChosen[a.id]} /><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span><span class="fam">{a.locationId ? collection.locationName(a.locationId) : 'no place'}</span></span></label>
          {/each}
          {#if moveShown.length > 200}<p class="small muted">{moveShown.length - 200} more: filter to find them.</p>{/if}
          {#if !moveShown.length}<p class="small muted">No plant matches.</p>{/if}
        </div>
        <div class="actions"><span class="small muted">{moveN} picked</span><span class="grow"></span><button class="btn" type="button" onclick={() => (movingIn = false)}>Cancel</button><button class="btn pri" type="button" onclick={finishMove} disabled={!moveN || movingBusy}>Move {moveN || ''}</button></div>
      </div>
    </div>
  {/if}

  {#if nothingRecorded}
    <p class="empty" style="margin: 14px 0 0">No floor, light, watering or audit recorded here yet. <button class="linkish" type="button" onclick={startEdit}>Set the floor and the light</button>{#if !watchable && cond.indoor !== true}, and coordinates for frost watch{/if}.</p>
  {:else}
  {#if cond.floorC != null || dli != null || lastWater || lastAudit}
  <div class="cards">
    {#if cond.floorC != null}<div class="card"><div class="lab">{cond.floorHeld ? 'Held at' : 'Floor'}</div><div class="val">{cond.floorC == null ? '–' : tempN(cond.floorC, units.current, 1)}<span class="u">{cond.floorC == null ? '' : ' ' + tempUnit(units.current)}</span></div><div class="sub">{cond.floorC == null ? 'not stated' : cond.from.floorC && cond.from.floorC !== loc.name ? `from ${cond.from.floorC}` : 'set here'}</div></div>{/if}
    {#if dli != null}<div class="card"><div class="lab">Light</div><div class="val">{dli == null ? '–' : dli.toFixed(0)}<span class="u">{dli == null ? '' : ' DLI'}</span></div><div class="sub">{cond.ppfd == null ? 'not measured' : `${cond.ppfd} µmol × ${cond.lightHours ?? 12} h${cond.lightHours == null ? ' (assumed; no hours set)' : ''}${cond.from.ppfd && cond.from.ppfd !== loc.name ? ` · from ${cond.from.ppfd}` : ''}`}</div></div>{/if}
    {#if lastWater}<div class="card"><div class="lab">Last watered</div><div class="val">{@render ago(daysSince(lastWater))}</div><div class="sub">{lastWater ? `the most recently watered plant${watering.oldest === lastWater ? (deep.length > 1 && !watering.never ? ', and every plant here was watered that day' : '') : `; the longest waiting ${daysSince(watering.oldest)} d`}${watering.never ? `; ${watering.never} with no watering recorded` : ''}${dueHere ? `; ${dueHere} due` : ''}` : 'nothing recorded'}</div></div>{/if}
    {#if lastAudit}<div class="card"><div class="lab">Last audit</div><div class="val">{@render ago(daysSince(lastAudit))}</div><div class="sub">{lastAudit ? lastAudit : 'never audited'}{missedNow ? ` · ${missedNow} not seen at it` : ''}{unseen - missedNow > 0 ? ` · ${unseen - missedNow} not seen in 90 d` : ''}</div></div>{/if}
  </div>
  {/if}
  {/if}

  {#if watchable}
    <div class="secrule"><h2>Frost watch</h2><div class="line"></div></div>
    {#if bySite}<p class="small muted" id="frost-site">Forecast for your site, set in <a href="/settings#site">Settings</a>; <button type="button" class="linkish" onclick={startEdit}>give this place coordinates</button> to watch it on its own.</p>{/if}
    {#if forecastErr}<div class="notice">{forecastErr}</div>
    {:else if !forecast}<p class="muted">Fetching the forecast…</p>
    {:else}
      <div class="notice {effectiveRisk?.level === 'none' ? 'ok' : effectiveRisk?.level === 'cold' ? '' : 'err'}"><b>{effectiveRisk?.level === 'none' ? (alertsUnchecked ? 'Forecast clear.' : 'All clear.') : effectiveRisk?.level === 'cold' ? 'Cold night coming.' : effectiveRisk?.level === 'floor' ? 'Below the floor.' : effectiveRisk?.level === 'warning' ? 'Warning in force.' : 'Frost forecast.'}</b> {effectiveRisk?.text}{#if alertsUnchecked}{' '}Alerts not checked: the National Weather Service did not answer, and this is not a statement that no alert is in force.{/if}</div>
      <p class="small muted">{forecast.attribution.join(' · ')}. <a href="/today#frost">Full forecast</a>.</p>
    {/if}
  {:else if cond.indoor !== true && !nothingRecorded}
    <p class="small muted" style="margin-top: 10px"><button type="button" class="linkish" onclick={startEdit}>Add coordinates</button> to this place (or a parent), or set your site in <a href="/settings#site">Settings</a>, to watch the forecast for frost.</p>
  {/if}

  {#if cond.lat != null || cond.altM != null || loc.notes || cond.waterDays || cond.dryMonths?.length}
    <div class="factgrid">
      {#if cond.waterDays || cond.dryMonths?.length}<div><b>Watering</b>{cond.waterDays ? `about every ${cond.waterDays} days` : `every ${DUE_DAYS} days (the default)`}{cond.dryMonths?.length ? `; kept dry ${monthRuns(cond.dryMonths)}` : ''}{#if (cond.from.waterDays && cond.from.waterDays !== loc.name) || (cond.from.dryMonths && cond.from.dryMonths !== loc.name)}<span class="small muted">{' · '}from {cond.from.waterDays ?? cond.from.dryMonths}</span>{/if}</div>{/if}
      {#if cond.lat != null}<div><b>Coordinates</b>{cond.lat}, {cond.lon}{#if cond.from.lat && cond.from.lat !== loc.name}<span class="small muted">{' · '}from {cond.from.lat}</span>{/if}</div>{/if}
      <!-- Its own row: an altitude saved without coordinates showed nowhere but the edit form (round fifty-nine). -->
      {#if cond.altM != null}<div><b>Altitude</b>{altShown(cond.altM)}{#if cond.from.altM && cond.from.altM !== loc.name}<span class="small muted">{' · '}from {cond.from.altM}</span>{/if}</div>{/if}
      {#if loc.notes}<div class="wide"><b>Notes</b><span style="white-space: pre-wrap">{loc.notes}</span></div>{/if}
    </div>
  {/if}

  {#if kids.length}
    <div class="secrule"><h2>Inside</h2><div class="line"></div><span class="n">{kids.length}</span></div>
    <div class="rows">
      {#each kids as k}
        {@const kl = LOCATION_KINDS.find((x) => x.k === k.type)?.label ?? 'Place'}
        <!-- The tile is decoration; the name and the kind on one line with a dot between, a box with its own margins, since the spaces at a tag's edge are dropped ("Bench 1BENCH"; round fifty-eight, round fifty-nine), and a hidden comma for a screen reader. -->
        <a class="azrow inside" href="/places/{k.id}"><span class="im" aria-hidden="true">{kl.slice(0, 5)}</span><span class="namekind"><span class="nm" style="font-style: normal">{k.name}</span><span class="dot" aria-hidden="true">·</span><span class="sr">{', '}</span><span class="fam">{kl}</span></span><span class="fig"><span class="sr">{', '}</span>{plural(collection.plantsAt(k.id).length, 'plant')}</span></a>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>{auditing ? 'Audit: tick what you can see' : `Plants${kids.length ? ' (including places inside)' : ''}`}</h2><div class="line"></div><span class="n">{deep.length}</span></div>
  {#if !deep.length}
    <div class="cult"><div class="none">Nothing here yet. <a href="/plants/new?loc={id}">Add a plant here</a>, <a href="/propagation/new?loc={id}">start a batch here</a>, or move plants in with the button above.</div></div>
  {:else}
    <div class="rows" class:auditrows={auditing}>
      {#each deep as a (a.id)}
        {@const seen = collection.lastSeen(a.id)}
        {@const ds = daysSince(seen)}
        {@const missedAt = collection.missedAt(a.id)}
        {@const missed = missedAt != null}
        {#if auditing}
          <label class="azrow accrow row"><input type="checkbox" bind:checked={present[a.id]} /><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span></span><span class="fig">{a.locationId !== id ? collection.location(a.locationId!)?.name ?? '' : ''}</span></label>
        {:else}
          <a class="azrow accrow row" href={plantHref(a)}>
            <!-- "Never audited" is said only once this place has had an audit: before the first, every row said it, which read as a reproach on a new grower's first bench (round forty-nine, 3). -->
            {#if lastAudit || ds != null}<span class="dot statedot {missed ? 'wake' : ds == null ? '' : ds > 90 ? 'wake' : 'grow'}" role="img" aria-label={ds == null ? 'never audited' : ds > 90 ? `not seen for ${ds} days` : `seen ${ds} days ago`} title={ds == null ? 'never audited' : ds > 90 ? `not seen for ${ds} days` : `seen ${ds} days ago`}></span>{:else}<span class="dot statedot" aria-hidden="true"></span>{/if}
            <span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span><span class="fam">{a.locationId !== id ? collection.location(a.locationId!)?.name ?? '' : ''}</span></span>
            <span class="fig" class:due={missed || (ds != null && ds > 90)}>{missed ? `not seen at the audit of ${missedAt}` : ds == null ? (lastAudit ? 'never audited' : '') : ds > 90 ? `not seen for ${ds} days` : ds === 0 ? 'seen today' : ds === 1 ? 'seen yesterday' : `seen ${ds} d ago`}</span>
            {#if missed || (ds != null && ds > 90) || (ds == null && lastAudit)}<span class="fam due phoneonly">{missed ? `not seen at the audit of ${missedAt}` : ds == null ? 'never audited' : `not seen for ${ds} days`}</span>{:else if ds != null && ds <= 1}<span class="fam phoneonly">{ds === 0 ? 'seen today' : 'seen yesterday'}</span>{/if}
          </a>
        {/if}
      {/each}
    </div>
    {#if auditing}
      <p class="actions auditacts" style="margin-top: 10px">
        <button class="btn" id="audit-all" type="button" onclick={() => tickAll(true)} disabled={tickedN === deep.length}>Tick all</button>
        <button class="btn" id="audit-clear" type="button" onclick={() => tickAll(false)} disabled={!tickedN}>Clear</button>
        <span class="small muted">{tickedN} of {deep.length} ticked</span>
        {#if confirmCancel}<span class="small">Drop the {tickedN} tick{tickedN === 1 ? '' : 's'}?</span><button class="btn" id="audit-cancel-yes" type="button" onclick={cancelAudit}>Yes, cancel</button><button class="btn" type="button" onclick={keepAuditing}>Keep going</button>{:else}<button class="btn" id="audit-cancel" type="button" onclick={cancelAudit}>Cancel</button>{/if}
        <button class="btn pri" onclick={finishAudit}>Finish audit</button>
      </p>
    {:else if auditResult}
      <p class="small auditresult" role="status" id="audit-result">{auditResult}</p>
    {/if}
  {/if}

  <div class="dangerrow">
    <span>Removing a place keeps every plant's records: its plants, batches and places move up to {parentName ?? 'the top level'}, and each plant's log gets a line saying so.</span>
    {#if confirmRemove}
      <span><button class="btn danger small" onclick={remove}>Yes, remove</button> <button class="btn small" onclick={() => (confirmRemove = false)}>Keep</button></span>
    {:else}
      <button class="btn danger small" onclick={() => { confirmRemove = true; void focusNext('.dangerrow .btn.danger'); }}>Remove place</button>
    {/if}
  </div>
{/if}

<style>
  .dangerrow { margin: 46px 0 10px; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: var(--fs-md); color: var(--ink3); }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .idcard.flat { margin-top: 14px; }
  .quickbar.words { margin-top: -6px; gap: 2px 14px; }
  .quickbar.words .btn { background: none; border: 0; box-shadow: none; padding: 6px 0; min-height: var(--tap); min-width: var(--tap); justify-content: center; color: var(--accent); font-weight: 600; } /* "Edit" was 26 px wide (round sixty; the accessibility review, 6) */
  .rules { margin: 4px 0 2px; font-size: var(--fs-md); font-weight: 600; color: var(--ink2); }
  .quickbar.words .btn:hover { text-decoration: underline; }
  .quickbar.words .btn:disabled { color: var(--ink3); }
  .muted { color: var(--ink3); }
  .movein { margin-top: 12px; }
  .movein .body { padding: 10px 14px 14px; font-family: var(--ui); font-size: var(--fs-md); white-space: normal; } /* a form, not a note: not the notes' serif (round fifty-two, 6) */
  .movein .searchbar { width: 100%; margin-bottom: 6px; }
  .moverows { max-height: 50vh; overflow: auto; }
  .movein .actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .auditacts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .auditresult { color: var(--accent); font-weight: 600; margin: 10px 0 0; }
  .form { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; margin-top: 16px; }
  .form label { display: grid; gap: 4px; }
  .form label > span { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .form input, .form select, .form textarea { width: 100%; font: inherit; font-size: 0.875rem; padding: 8px 11px; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .actions { display: flex; gap: 8px; margin: 0; }
  .grow { flex: 1; }
  .factgrid .wide { grid-column: 1 / -1; }
  .row { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .row .dot { margin: 0 auto; }
  .row input[type='checkbox'] { width: 18px; height: 18px; margin: 0 auto; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  /* Rows of two lines, about 56px; a name wraps between words, never inside one ("Astrophytu m"): the theme's anywhere is for the catalogue's tiles (round fifty-eight; the grower review). */
  .rows .azrow { min-height: 56px; }
  .rows .azrow .nm { overflow-wrap: break-word; word-break: normal; }
  .azrow.accrow .fam.phoneonly { display: none; } /* outranks the theme's .azrow.accrow .fam { display: flex }, which printed the status twice at desktop width (round twenty-five, 13) */
  .fam.due { color: var(--warm-ink); }
  .namekind { display: flex; flex-wrap: wrap; align-items: baseline; min-width: 0; }
  .namekind .dot { margin: 0 0.45em; color: var(--ink3); }
  .namekind .fam { margin-top: 0; }
  @media (max-width: 640px) { .form { grid-template-columns: 1fr 1fr; } .idcard.flat { margin-top: 10px; } .azrow .fig { display: none; } .azrow.accrow .fam.phoneonly { display: flex; } }
  .unitfield { display: flex; align-items: center; gap: 6px; }
  .formmsg { margin: 0; }
  .formmsg:empty { margin-bottom: -10px; } /* kept in the page for the live region, without its row's gap */
  .form .bad { color: var(--bad); }
  .unitfield input { width: 6em; }
  /* Twelve boxes as six by two, each a finger wide; the form one column on a phone, whose two columns cut its own hints (round sixty; the grower review, 13; the accessibility review, 6). */
  .months { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px 8px; }
  .months legend, .months > .linkish { grid-column: 1 / -1; }
  @media (max-width: 520px) { .form { grid-template-columns: minmax(0, 1fr) !important; } }
  .months legend { font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); padding: 0; margin-bottom: 4px; }
  .mo { display: inline-flex; align-items: center; gap: 4px; min-height: var(--tap); min-width: var(--tap); font-size: var(--fs-md); }
</style>

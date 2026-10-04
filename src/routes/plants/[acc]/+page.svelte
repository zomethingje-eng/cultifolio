<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { localDate, daysBetween } from '$core/dates';
  import { temp, tempN, rain, deltaT, numberOrNull, fixed, mmToIn, inToMm } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto, beforeNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import WaitingRecord from '$lib/ui/WaitingRecord.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import type { Provenance, PlantEvent } from '$lib/db/types';
  import { slugify, speciesOf, speciesSlug, parseName } from '$core/names';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { entriesFor, sheetForName } from '$lib/ui/index.svelte';
  import ReplacedNotes from '$lib/ui/ReplacedNotes.svelte';
  import type { Sheet } from '$lib/ui/index.svelte';
  import { cultivationSheet, runs, forReader } from '$core/sheet';
  import { EVENT_LABEL, MEASURES, PROP_METHODS, kindOf, type EventType, type Photo } from '$lib/db/types';
  import { parents } from '$core/names';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import PhotoAdd from '$lib/ui/PhotoAdd.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  import { photoLabel } from '$lib/ui/photo-label';
  import { focusNext, motion } from '$lib/ui/focus';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  import Parked from '$lib/ui/Parked.svelte';
  import NotChecked from '$lib/ui/NotChecked.svelte';
  onMount(() => { site.load(); collection.load(); });
  /** The URL carries the number people know (or an identity, from a printed code); everything below works on the record's identity. */
  const u = $derived(units.current);
  const param = $derived(page.params.acc!);
  const a = $derived(collection.accession(param));
  const id = $derived(a?.id ?? param);
  const events = $derived(collection.events(id));
  /* ---- photos ---- */
  const photos = $derived(collection.photos(id));
  const cover = $derived(collection.cover(id));
  let lightbox = $state<number | null>(null);
  let adding = $state(false);
  let thumbFailed = $state(false);
  let confirmRemove = $state(false);
  /** The log entry whose × was pressed once; a second press removes it. */
  let confirmEvent = $state<string | null>(null);
  const openPhoto = (ph: Photo) => (lightbox = Math.max(0, photos.findIndex((x) => x.id === ph.id)));
  /** Events and photos on one timeline, newest first. */
  const timeline = $derived(
    [...events.map((e) => ({ k: 'e' as const, d: e.d, id: e.id, e })), ...photos.map((ph) => ({ k: 'p' as const, d: ph.d, id: ph.id, ph }))].sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id))
  );
  // The log shows its latest five lines, the rest one tap away: on a phone the photographs and the habitat follow it (round fifty-eight; the grower review).
  const LOG_FIRST = 5;
  let allLog = $state(false);
  const shownTimeline = $derived(allLog || timeline.length <= LOG_FIRST ? timeline : timeline.slice(0, LOG_FIRST));
  /* ---- lengths ---- */
  // Lengths follow the grower's length units, not the temperature setting; stored in millimetres always, inches shown to one decimal (round fifty-eight; the grower review).
  const lu = $derived(prefs.lengthUnits);
  const lenN = (mm: number) => (lu === 'in' ? fixed(mmToIn(mm), 1) : fixed(mm, mm === Math.round(mm) ? 0 : 1));
  const len = (mm: number) => `${lenN(mm)} ${lu}`;
  const toMm = (typed: number) => (lu === 'in' ? Math.round(inToMm(typed) * 10) / 10 : typed);
  /** A repot's pot size rides in `measures` as `pot`, in millimetres; it is not a size of the plant, so it is not in the measure form (round fifty-eight). */
  const POT = { k: 'pot', label: 'Pot', unit: 'mm' };
  const measureOf = (k: string) => MEASURES.find((x) => x.k === k) ?? (k === POT.k ? POT : undefined);
  const taxonSlug = $derived(a ? speciesSlug(a.taxonName) : '');
  const taxon = $derived(a ? collection.taxon(taxonSlug) : undefined);
  const sowing = $derived(a?.sowingId ? collection.sowing(a.sowingId) : undefined);
  let dossier = $state<Sheet | null>(null);
  /** The species page's slug: the sheet's own (a homonym's is suffixed) when the sheet is here, else the name's (round eighteen, 6). */
  const speciesHref = $derived(dossier?.slug ?? (a ? speciesSlug(a.taxonName) : ''));
  /** What the reference said about this plant's species: still being asked, could not be reached (a different fact from absent), not there, or read. */
  let ref = $state<'loading' | 'unreachable' | 'none' | 'ok'>('loading');
  const kind = $derived(a ? kindOf(a) : 'species');
  /** A hybrid's parents, each with a species page when the corpus has one. */
  let parentLinks = $state<Array<{ name: string; slug: string | null }>>([]);
  $effect(() => {
    if (a) setCrumb([{ label: 'My plants', href: '/plants' }, { label: `${accNo(a)} · ${a.taxonName}${a.cultivar ? ` ‘${a.cultivar}’` : ''}` }]);
    return () => setCrumb([]);
  });
  /** The species behind the plant: its sheet, found by hash bucket (the server never learns the species), fetched again only when the name, the key or the parentage changes, never because the record was re-set; a late answer for a name no longer on the record is dropped. */
  let asked = 0;
  let askedFor = '';
  $effect(() => {
    if (!a) return;
    const name = a.taxonName, key = a.taxonKey ?? null, parentage = a.parentage ?? null;
    const want = `${name}\0${key}\0${parentage}`;
    if (want === askedFor) return; // the record was re-set (a watering, the key repaired) but the species is the same: nothing to ask again
    askedFor = want;
    const seq = ++asked;
    dossier = null; ref = 'loading';
    (async () => {
      // A wrong key would have put another species' habitat under this plant, so the sheet is found by the name. The key
      // the reference gives is kept here, not written: a page that opens does not write to the log (round fifty-eight;
      // rule 5), and a key that differs is said below with a button to take it.
      const d = await sheetForName(name, key);
      if (seq !== asked) return;
      refKey = d && d !== 'none' && typeof d.key === 'number' ? d.key : null;
      dossier = d === 'none' ? null : d;
      ref = d === 'none' ? 'none' : d ? 'ok' : 'unreachable';
    })();
    const ps = parents(parentage);
    entriesFor(ps.map((n) => slugify(n))).then((m) => { if (seq === asked) parentLinks = ps.map((pn) => ({ name: pn, slug: m?.has(slugify(pn)) ? slugify(pn) : null })); });
  });
  /** A photograph of the species for the plant without one of its own: the index's thumb when the index was read, else the dossier's own first wild photograph. */
  const speciesThumb = $derived(prefs.referencePhotos ? dossier?.thumb : undefined); // a third-party request only when the grower switched it on (round twelve, A1)
  // Habitat versus here: the species' habitat figures, median with the 10th–90th span across the envelope cells, beside the bench's.
  const habitat = $derived.by(() => {
    if (!dossier || dossier.climate.status !== 'ok') return null;
    const c = dossier.climate;
    const m = c.months;
    const dli = (y: { dli?: number }[]) => y.map((x) => x.dli).filter((x): x is number => x != null);
    const dlis = dli(m), dli10 = dli(c.p10), dli90 = dli(c.p90);
    const ex = c.extremes ?? null;
    const exStatus = c.extremesStatus ?? null;
    const coldI = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const sheet = cultivationSheet({ scientific: dossier.name.scientific, family: dossier.name.family, months: m, p10: c.p10, p90: c.p90, extremes: ex, extremesStatus: exStatus, lat: dossier.habitatLat ?? c.at.lat, units: u });
    return {
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis), lo10: dli10.length ? Math.min(...dli10) : null, hi90: dli90.length ? Math.max(...dli90) : null } : null,
      night: { v: m[coldI].tmin, mo: coldI + 1, lo: c.p10[coldI].tmin, hi: c.p90[coldI].tmin },
      ex,
      exStatus,
      year: sheet.year,
      cells: c.cells
    };
  });
  const cond = $derived(a?.locationId ? collection.conditions(a.locationId) : null);
  const hereDli = $derived(cond?.ppfd != null ? (cond.ppfd * (cond.lightHours ?? 12) * 3600) / 1e6 : null);
  const r0 = (x: number) => x.toFixed(0);
  // Side by side, no verdict: a regional radiation figure and a climate percentile are facts about the
  // places the species is recorded, not measured tolerances of this plant. The comparison is shown; the judgement is the grower's.
  // The glossary's plain words in what the grower reads: "across the range", "a typical spot in the range", and what
  // "set aside" meant (round fifty-eight; the accessibility review).
  const lightCompare = $derived.by(() => {
    if (!habitat?.dli) return null;
    const d = habitat.dli;
    const sky = `open sky over the habitat ${r0(d.lo)}–${r0(d.hi)} mol/m²/day across the year (median year${d.lo10 != null && d.hi90 != null ? `; across the range, ${habitat.cells} grid cells, ${r0(d.lo10)} to ${r0(d.hi90)}` : ''}; CHELSA)`;
    if (hereDli == null) return { here: null, text: `${sky}; no light figure for this place` };
    // Hours not set are taken as 12 and said so: "from this place's settings" claimed a figure the grower never gave (round fifty-nine).
    return { here: hereDli, text: `${r0(hereDli)} mol/m²/day here, from this place's light${cond?.lightHours == null ? ' and 12 hours assumed (no hours set)' : ` over ${cond.lightHours} hours`}; ${sky}` };
  });
  const coldCompare = $derived.by(() => {
    if (!habitat) return null;
    const n = habitat.night;
    const night = `coldest month's mean night at the habitat ${temp(n.v, u, 1)} in ${MONTHS[n.mo - 1]} (median year; across the range, ${habitat.cells} grid cells, ${tempN(n.lo, u)} to ${tempN(n.hi, u)}; CHELSA)`;
    // With no extremes, say why, as the species page and compare do: a refusal or a skip is not an absence (round eighteen, 8).
    const p01 = habitat.ex ? `; 1st-percentile night over ${habitat.ex.years} years at a typical spot in the range ${temp(habitat.ex.minP01, u, 1)} (NASA POWER)` : habitat.exStatus === 'refused' ? '; the daily extremes were not checked (NASA POWER did not answer when the species page was built)' : habitat.exStatus === 'skipped' ? '; the daily extremes were not asked for when the species page was built' : habitat.exStatus === 'sea' ? '; the daily extremes were read at a weather cell that is mostly sea and are not used, so no floor is read (the species page says what that cell gave)' : '';
    if (cond?.floorC == null) return { here: null, text: `${night}${p01}; no floor set for this place` };
    return { here: cond.floorC, text: `this place is ${cond.floorHeld ? 'held at' : 'set to bottom out at'} ${temp(cond.floorC, u, 1)}; ${night}${p01}` };
  });
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The habitat rain season as a figure: the rain rule's reading in habitat months and shifted to this place's hemisphere. No verdict.
  const season = $derived.by(() => {
    if (!habitat?.year) return null;
    const y = habitat.year;
    // This place's coordinates, else the site set in Settings, else the north with a note: the same order as the species page.
    const hereLat = cond?.lat ?? site.current?.lat ?? collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null; // the place, the site, else the first place with coordinates, as the species page and the labels do (round fifteen, 4)
    const southHere = (hereLat ?? 40) < 0;
    const here = runs(forReader(y, hereLat ?? 40), 'short');
    const home = `${runs(y.growMonths, 'short')} (${y.south ? 'S' : 'N'})`;
    const shift = `shifted to ${cond?.lat != null ? 'this place' : hereLat != null ? 'your site' : 'the north'}${hereLat == null ? ' (no site set)' : ''}: ${here}`;
    if (y.none) return { label: 'No season to read', note: `${rain(y.annualMm, u)} a year and a flat temperature curve (${deltaT(y.rangeT, u)} of range): no rainy season and no cooler half (CHELSA).` };
    const same = !y.shiftable ? 'not shifted: no thermal season to reverse' : southHere === y.south ? 'the same here' : shift;
    if (y.fog) return { label: 'No rainy season to read', note: `${rain(y.annualMm, u)} a year; the temperature rule's cooler six months ${home}, ${same} (CHELSA).` };
    if (y.spread) return { label: 'Rain spread, no season', note: `70% of the rain takes ${y.growMonths.length} months, ${home} (CHELSA).` };
    if (y.flat) return { label: `Rain ${home}, flat temperature`, note: `a sharp rainy season, but the temperature curve moves ${deltaT(y.rangeT, u)}, so no growing season is inferred; ${same} (CHELSA).` };
    if (y.grow === 'even') return { label: `Rain ${home}, neither winter nor summer`, note: `the wet season sits at the year's mean temperature; ${same} (rain rule, CHELSA).` };
    return { label: `${y.grow === 'winter' ? 'Winter' : 'Summer'} rain ${home}`, note: `${same} (rain rule, CHELSA).` };
  });
  /* ---- move ---- */
  let moving = $state(false);
  let moveTo = $state<string | null>(null);
  async function doMove() {
    if (!a || (moveTo ?? null) === (a.locationId ?? null)) { moving = false; return; }
    const to = moveTo ?? null;
    const { undo } = await collection.movePlantsUndoable([id], to); // the place and the line in one commit (round forty-nine, 1), with the way back (round fifty-one, 4)
    moving = false;
    toast.show(to ? `Moved to ${collection.locationName(to)}` : 'Place cleared', 8000, { label: 'Undo', run: () => { void undo().then(() => toast.show('Undone: back where it was.')); } });
  }
  const daysAgo = (d: string | null | undefined) => (d ? daysBetween(d) : null);
  const lastOf = (t: string) => events.find((e) => e.t === t)?.d ?? null;
  const sinceWater = $derived(daysAgo(collection.lastWatered(id))); // the collection's figure: a future-dated line is not a watering (round twenty-five, 1)
  const careDays = $derived(a ? collection.careDays(a) : 0); // and when nothing is logged, the days since the record was made: the same figure the list and Today count (round twenty-six, 6)
  const seen = $derived(daysAgo(collection.lastSeen(id)));
  const lastMeasure = $derived(events.find((e) => e.t === 'measure' && e.measures));
  const firstMeasure = $derived([...events].reverse().find((e) => e.t === 'measure' && e.measures));
  const sizeKey = $derived(lastMeasure ? (['diam', 'h', 'caudex', 'spread', 'heads', 'leaves'].find((k) => lastMeasure.measures?.[k] != null) ?? null) : null);
  const growth = $derived(sizeKey && lastMeasure && firstMeasure && firstMeasure !== lastMeasure && firstMeasure.measures?.[sizeKey] != null ? lastMeasure.measures![sizeKey] - firstMeasure.measures![sizeKey] : null);
  let moreActs = $state(false);
  // The id card's one primary action is the species page; editing, the label and propagation are behind "More", which
  // closes on a choice, Escape, or a tap outside (improvements, 7).
  let cardMenu = $state(false);
  let cardMenuBtn = $state<HTMLButtonElement | null>(null);
  const autofocusFirst = (el: HTMLElement) => {
    el.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  };
  /** A menu's keys: arrows move, Home and End jump, Tab leaves and closes (round twenty, 11). */
  function menuKeys(e: KeyboardEvent) {
    const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') closeCardMenu();
  }
  function closeCardMenu(refocus = false) {
    cardMenu = false;
    if (refocus) cardMenuBtn?.focus();
  }
  /** Whether the first screen has a picture: the grower's own, or the reference's where it is shown. Without one there is no hero; a tile beside the name stands in (improvements, 4). */
  const hasHero = $derived(!!cover || (!!speciesThumb && !thumbFailed));
  const fmtDate = (d: string | null | undefined) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  // What a new plant's page is missing: a place, a photograph, a first measurement. Each line goes when it is done; the card goes when one line is left.
  const setup = $derived.by(() => {
    if (!a || a.status !== 'growing') return [];
    const rows: { k: string; n: string; t: string; w: string; go: () => void }[] = [];
    if (!collection.placeOf(a.locationId)) rows.push({ k: 'place', n: '1', t: 'Give it a place', w: 'the greenhouse, bench, shelf or windowsill it lives on; conditions and the frost watch follow', go: () => { moveTo = null; moving = true; } });
    if (!photos.length) rows.push({ k: 'photo', n: '2', t: 'Add a photograph', w: 'the page and the labels use it', go: () => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); } });
    if (!lastMeasure) rows.push({ k: 'measure', n: '3', t: 'Measure it', w: 'growth is read from the first measurement on', go: () => { moreActs = true; quick('measure'); } });
    // The site is not a step on a plant: it is set once, in Settings, and the habitat block says so in one line while it is not (round fifty-eight; the grower review).
    return rows.length >= 2 ? rows : [];
  });
  const provLabel = (p: string | null | undefined) => (p === 'wild' ? 'wild-collected' : p === 'f1' ? 'F1, raised from wild-collected seed' : p === 'fn' ? 'cultivated seed (Fn)' : p === 'veg' ? 'vegetative' : 'provenance not stated');
  let logOpen = $state(false);
  /** The toast after a log line: "Watering recorded", not "Watered recorded" (round twenty-two, 21). */
  const recordedText = (label: string) => ({ Watered: 'Watering recorded', Fed: 'Feeding recorded', Treated: 'Treatment recorded', Repotted: 'Repotting recorded', Measured: 'Measurement recorded', Flowered: 'Flowering recorded', Note: 'Note recorded', Died: 'Death recorded', Pruned: 'Pruning recorded', Moved: 'Move recorded' } as Record<string, string>)[label] ?? `${label} recorded`;
  /** Water is one tap: a watering today, with an Undo for a few seconds; a watering with a date or a note goes through Log (round forty-nine, 3). */
  let wateringNow = $state(false);
  async function waterNow() {
    if (wateringNow) return;
    // A watering already recorded today is not recorded again: two taps are one watering, as the grower means them (round fifty-two, 3).
    const already = events.find((e) => e.t === 'water' && e.d === localDate());
    if (already) { toast.show('Already recorded as watered today.'); return; }
    wateringNow = true;
    try {
      const ev = await collection.addEvent({ acc: id, d: localDate(), t: 'water' });
      toast.show('Watering recorded', 8000, { label: 'Undo', run: () => { void collection.removeEvents([ev.id]).then(() => toast.show('Undone: the watering line removed.')); } });
    } finally {
      wateringNow = false;
    }
  }
  /** Archive asks once: it is one tap on the bar, and it takes the plant off every list (round forty-nine, 3). */
  let confirmArchive = $state(false);
  function quick(t: EventType) {
    et = t;
    ed = localDate(); // today as of opening the form, not as of loading the page (round twenty-four, 2)
    logOpen = true;
    // The first thing to fill: a measurement's first figure, a treatment's product, else the note.
    setTimeout(() => (document.querySelector<HTMLElement>(t === 'measure' ? '.measures input' : t === 'treat' || t === 'feed' ? '#ev-used' : t === 'repot' ? '#ev-pot' : '#ev-note') ?? document.getElementById('ev-note'))?.focus(), 0);
  }
  /** After a record or a cancel, focus returns to the verb bar and the log line is announced, so a keyboard user is not dropped on the page body. */
  function closeLog(recorded?: string) {
    logOpen = false;
    if (recorded) toast.show(recorded);
    setTimeout(() => document.querySelector<HTMLElement>('.quickbar button')?.focus(), 0);
  }
  const propagations = $derived(collection.propagationsOf(id));

  let et = $state<EventType>('water');
  let ed = $state(localDate());
  let enote = $state('');
  let eused = $state('');
  let ecause = $state('');
  let measures = $state<Record<string, string | number | null>>({});
  // A repot's pot size and medium, both optional, beside its free-text note (round fifty-eight; the grower review).
  let epot = $state<string | number | null>('');
  let emedium = $state('');
  let editingNotes = $state(false);
  let notesDraft = $state('');
  let notesBase = ''; // the text the editor opened on: a text that changed underneath it (another tab, a pull) is logged before it is written over (round twenty-four, 1)
  let notesBaseStamp: string | null = null; // and its stamp, which the saved edit carries as `notesBase` so other devices know what it was made from (round twenty-five, 2)
  let myNotesDraft = $state('');
  let editingMy = $state(false);

  /* ---- edit the record ---- */
  let editing = $state(false);
  /** The species' key while editing: kept when the name is untouched, cleared by typing, set again by picking a suggestion. */
  let edKey = $state<number | null>(null);
  let f = $state({ taxonName: '', cultivar: '', nameKind: 'species' as string, parentage: '', nameAsReceived: '', fieldNumber: '', provenance: 'unknown' as string, acquired: '', sourceFrom: '', sourceForm: '', price: '', waterDays: '', locationId: null as string | null });
  function startEdit() {
    if (!a) return;
    edDateMsg = ''; // a refusal belongs to the edit that was refused, not to the next one opened (round twenty-seven, R2-2)
    edKey = a.taxonKey ?? null;
    f = { taxonName: a.taxonName, cultivar: a.cultivar ?? '', nameKind: a.nameKind && !['species', 'cultivar', 'hybrid'].includes(a.nameKind) ? a.nameKind : kindOf(a), parentage: a.parentage ?? '', nameAsReceived: a.nameAsReceived ?? '', fieldNumber: a.fieldNumber ?? '', provenance: a.provenance ?? 'unknown', acquired: a.acquired ?? '', sourceFrom: a.sourceFrom ?? '', sourceForm: a.sourceForm ?? '', price: a.price ?? '', waterDays: a.waterDays != null ? String(a.waterDays) : '', locationId: a.locationId ?? null };
    fOpen = { ...f };
    edWaterMsg = '';
    editing = true;
    void focusNext('#ed-name'); // the first field, so a keyboard user who chose Edit from the menu lands in the form (round twenty, 11)
  }
  /** The form as it opened: only the fields the grower changed in it are written, so a form open while another tab or a sync changed the record does not write the old values back over the new (round fifty-two, 4). */
  let fOpen = {} as typeof f;
  let edDateMsg = $state('');
  let edWaterMsg = $state('');
  /** The rhythm this plant follows when it sets none: its place's, inherited down the tree, else 21 days (round fifty-eight; the grower review). */
  const inheritedRhythm = $derived(a ? collection.rhythm({ ...a, waterDays: null }) : 21);
  const formDirty = () => editing || (editingNotes && notesDraft.trim() !== (notesBase ?? '').trim()) || (editingMy && myNotesDraft.trim() !== myNotesOpen.trim());
  // A half-done form is not lost to a tab-bar tap or a reload without asking (round fifty-two, 4; the Add form has had this since round forty-nine).
  beforeNavigate((nav) => {
    if (!formDirty() || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave this page? What you typed here will be lost.')) nav.cancel();
  });
  function guardUnload(e: BeforeUnloadEvent) {
    if (formDirty()) e.preventDefault();
  }
  async function saveEdit() {
    if (!a) return;
    // A date after today is a typo, and the number a plant carries is minted for its acquisition year (round twenty-six, 3).
    // Only a date this edit typed is judged: a plant whose stored date is already in the future (an older file) can still have its price or place edited, and the date corrected when the grower gets to it (round twenty-eight, 0).
    edDateMsg = f.acquired && f.acquired !== (a.acquired ?? '') && f.acquired > localDate() ? `${f.acquired} is in the future.` : f.acquired && f.acquired !== (a.acquired ?? '') && f.acquired < '1900-01-01' ? `${f.acquired} is before 1900.` : '';
    if (edDateMsg) { document.getElementById('ed-date')?.focus(); return; }
    // The plant's own watering rhythm: blank follows its place; a figure is whole days, 1 to 365, as the place form takes it (round fifty-eight; the grower review).
    const wd = f.waterDays.trim() === '' ? null : Number(f.waterDays);
    edWaterMsg = wd != null && (Number.isNaN(wd) || wd < 1 || wd > 365) ? `${f.waterDays.trim()} is not a number of days from 1 to 365; leave it blank to follow its place.` : '';
    if (edWaterMsg) { document.getElementById('ed-waterdays')?.focus(); return; }
    const moved = (f.locationId ?? null) !== (a.locationId ?? null);
    // The name as the add form files it: a hybrid is filed under its genus (or nothogenus) with the cross as parentage and
    // no species key, since it has no habitat of its own; an edit into a hybrid must not keep the species' name, key and
    // climate (round twenty-three, 1).
    const typed = f.taxonName.trim() || a.taxonName;
    const p = parseName(typed);
    const hybrid = f.nameKind === 'hybrid' || p.kind === 'hybrid';
    // A nothospecies ("× Graptoveria titubans", filed as "Graptoveria titubans" with the hybrid kind) keeps its epithet: only a cross written out, or a bare genus, files as the genus (round twenty-five, 3).
    const taxonName = hybrid ? (p.kind === 'hybrid' ? p.scientific : p.epithet ? p.scientific : p.genus || typed) : typed;
    // A hybrid's key goes only when its name changes: an edit to a nothospecies' price keeps the key the list gave it (round twenty-four, 5).
    const taxonKey = hybrid && taxonName !== a.taxonName ? null : f.taxonName.trim() ? edKey : (a.taxonKey ?? null);
    const nameKind = hybrid ? 'hybrid' : f.nameKind;
    const parentage = hybrid ? f.parentage.trim() || p.parentage || null : null; // a nothospecies' parentage is what the grower states, never its own name (round twenty-six, 1)
    const wasKind = kindOf(a); // read before the write: `a` is the live record and says the new kind once it is saved
    const renamed = taxonName !== a.taxonName || (f.cultivar.trim() || null) !== (a.cultivar ?? null) || nameKind !== wasKind;
    // A change of identity is provenance: the old name goes in the log, and into "name as received" if that was empty (round twenty-three, 3).
    const oldFull = `${a.taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`;
    const newFull = `${taxonName}${f.cultivar.trim() ? ` '${f.cultivar.trim()}'` : ''}`;
    // A field the record never had, left on the form's default, is not written: a price edit wrote `nameKind: species`
    // and `provenance: unknown` on a plant that had neither, two claims the grower never made (round thirty-five, R1-5).
    const nameKindOut = a.nameKind == null && !hybrid && f.nameKind === kindOf(a) ? null : nameKind;
    const provenanceOut = a.provenance == null && f.provenance === 'unknown' ? null : f.provenance;
    const kindWord = nameKind === 'hybrid' ? 'a hybrid' : nameKind === 'cultivar' ? 'a cultivar' : 'a species';
    // The edit, its rename note, its move line and the acquired line it restates are one commit (round fifty-one, 3).
    const lines: Array<Omit<PlantEvent, 'id'>> = [];
    if (renamed) lines.push({ acc: id, d: localDate(), t: 'note', note: oldFull !== newFull ? `Renamed from ${oldFull} to ${newFull}${nameKind !== wasKind ? ` (now ${kindWord})` : ''}` : `Now recorded as ${kindWord}`, auto: true });
    if (moved && f.locationId) lines.push({ acc: id, d: localDate(), t: 'move', note: `to ${collection.locationName(f.locationId)}` });
    // The log's "Acquired" line is the same fact as the card's date and source: it follows an edit rather than keeping the old one.
    const acq = events.find((e) => e.t === 'acquire');
    const newDate = f.acquired || null, newNote = f.sourceFrom.trim() ? `from ${f.sourceFrom.trim()}` : null;
    const also = acq && newDate && (acq.d !== newDate || (acq.note ?? null) !== newNote) ? [{ kind: 'event' as const, id: acq.id, fields: { d: newDate, note: newNote } }] : [];
    const all: Record<string, unknown> = { taxonName, taxonKey, cultivar: f.cultivar.trim() || null, nameKind: nameKindOut, parentage, nameAsReceived: f.nameAsReceived.trim() || (oldFull !== newFull && !a.nameAsReceived ? oldFull : null), fieldNumber: f.fieldNumber.trim() || null, provenance: provenanceOut, acquired: f.acquired || null, sourceFrom: f.sourceFrom.trim() || null, sourceForm: f.sourceForm.trim() || null, price: f.price.trim() || null, waterDays: wd == null ? null : Math.round(wd), locationId: f.locationId ?? null };
    // Only what this form changed (round fifty-two, 4): the name and what the name decides, the place, and each other field on its own.
    const touched = new Set((Object.keys(f) as Array<keyof typeof f>).filter((k) => f[k] !== fOpen[k]));
    const write = new Set<string>();
    if (touched.has('taxonName') || touched.has('nameKind') || touched.has('parentage') || touched.has('cultivar') || touched.has('nameAsReceived')) for (const k of ['taxonName', 'taxonKey', 'nameKind', 'parentage', 'nameAsReceived', 'cultivar']) write.add(k);
    if (touched.has('locationId')) write.add('locationId');
    for (const k of ['fieldNumber', 'provenance', 'acquired', 'sourceFrom', 'sourceForm', 'price', 'waterDays']) if (touched.has(k as keyof typeof f)) write.add(k);
    const fields = Object.fromEntries(Object.entries(all).filter(([k]) => write.has(k)));
    await collection.putWith('accession', id, fields, lines, also);
    editing = false;
  }

  let evmsg = $state('');
  async function addEvent(e: SubmitEvent) {
    e.preventDefault();
    // A date after today is a typo (2027 for 2026), and it would stand as the last watering for a year (round twenty-five, 1); refused with a sentence, as the batch page does.
    evmsg = !ed ? 'Give the entry a date.' : ed > localDate() ? `${ed} is in the future.` : '';
    if (evmsg) { document.getElementById('ev-date')?.focus(); throw new Error(evmsg); }
    const potN = et === 'repot' ? numberOrNull(epot) : null;
    if (potN != null && potN <= 0) { evmsg = `A pot of ${potN} ${lu} is no pot; leave the size blank if it was not measured.`; document.getElementById('ev-pot')?.focus(); throw new Error(evmsg); }
    const m: Record<string, number> = {};
    // A length is typed in the grower's length units and stored in millimetres (round forty, R2-2; round fifty-eight); heads and leaves are counts.
    for (const [k, v] of Object.entries(measures)) { const n = numberOrNull(v); if (n != null) m[k] = MEASURES.find((x) => x.k === k)?.unit === 'mm' ? toMm(n) : n; } // a cleared box is no measurement, not 0
    if (potN != null) m[POT.k] = toMm(potN); // the pot, in millimetres, beside the plant's own measures (round fifty-eight; the grower review)
    // The medium is words, so it goes in the note, ahead of whatever else was written (round fifty-eight; the grower review).
    const note = [et === 'repot' && emedium.trim() ? `Medium: ${emedium.trim()}` : '', enote.trim()].filter(Boolean).join('; ');
    const ev = { acc: id, d: ed, t: et, note: note || null, used: et === 'treat' || et === 'feed' ? eused.trim() || null : null, cause: et === 'death' ? ecause.trim() || null : null, measures: Object.keys(m).length ? m : null, followUp: et === 'treat' ? 10 : null };
    // A death is its line and the plant's status in one commit: closed between the two, the page left a dead plant marked growing (round forty-nine, 1).
    if (et === 'death') await collection.addEventWith(ev, 'accession', id, { status: 'dead' });
    else await collection.addEvent(ev);
    enote = '';
    eused = '';
    ecause = '';
    measures = {};
    epot = '';
    emedium = '';
  }
  /** A log line removed is one tap from coming back: the record never left the log (round fifty-eight; the grower review). */
  async function removeEntry(eid: string) {
    confirmEvent = null;
    await collection.remove('event', eid);
    toast.show('Entry removed.', 8000, { label: 'Undo', run: () => { void collection.restore('event', eid).then(() => toast.show('Entry restored.')); } });
  }
  async function setStatus(s: 'growing' | 'archived' | 'dead') {
    // A status change is a line in the log too, so the timeline says when the plant was archived or grown again; a death is recorded through "Died…", with its date and cause (round twenty-two, 16). Status and line are one commit (round forty-nine, 1).
    await collection.addEventWith({ acc: id, d: localDate(), t: 'note', note: s === 'archived' ? 'Archived' : s === 'growing' ? 'Marked growing again' : 'Marked dead' }, 'accession', id, { status: s });
    toast.show(s === 'archived' ? 'Archived, and logged' : s === 'growing' ? 'Marked growing, and logged' : 'Marked dead, and logged');
    void focusNext('#status-toggle'); // the button that replaced the one just pressed
  }
  async function saveNotes() {
    const next = notesDraft.trim() || null;
    // The edit carries the stamp of the text it was opened on: a text that arrived under the open editor (another tab, a
    // pull) is then read from the log as replaced unseen, on every device, and nothing more is written (round fifty-eight).
    await collection.put('accession', id, { notes: next, notesBase: notesBaseStamp });
    editingNotes = false;
  }
  /** The species notes as the editor opened, for the unsaved-changes guard. */
  let myNotesOpen = '';
  let myNotesBaseStamp: string | null = null;
  async function saveMyNotes() {
    if (!a) return;
    const slug = speciesSlug(a.taxonName);
    const next = myNotesDraft.trim() || null;
    // The edit carries the stamp of the text it was opened on, so a text that changed meanwhile (another device, another
    // tab) is read from the log as replaced unseen, on every device, and nothing more is written; the species' key is
    // left to the species page, which has the reference's (round fifty-nine; the round forty-one review, 7).
    await collection.put('taxon', slug, { name: speciesOf(a.taxonName), myNotes: next, myNotesBase: myNotesBaseStamp });
    editingMy = false;
  }
  async function remove() {
    const no = accNo(a!);
    await collection.remove('accession', id);
    goto('/plants');
    // The removal is one tap; the way back is one too (round twenty-six, 5). The record never left the log.
    toast.show(`${no} removed.`, 8000, { label: 'Undo', run: () => { void collection.restore('accession', id).then((moved) => { void goto(`/plants/${accNo(collection.accession(id) ?? { id })}`); if (moved) toast.show(`Restored as ${moved.to}: ${moved.from} is another plant's now.`); }); } }); // the number it holds after the restore: a plant brought back to a number taken meanwhile yields it (round fifty-nine)
  }
  const waiting = $derived(a ? undefined : collection.waiting('accession', param));
  async function restoreRemoved() {
    const r = collection.removedAccession(param);
    if (!r) return;
    const moved = await collection.restore('accession', r.id);
    if (moved) {
      await goto(`/plants/${moved.to}`);
      toast.show(`Restored as ${moved.to}: ${moved.from} is another plant's now.`);
    } else toast.show(`${param} restored.`);
  }
  /** The key the reference files this plant's species under, when it answered. */
  let refKey = $state<number | null>(null);
  /** The plant records another key for a name at species rank: the grower may take the reference's. */
  const keyDiffers = $derived(!!a && refKey != null && a.taxonKey != null && a.taxonKey !== refKey && speciesOf(a.taxonName) === a.taxonName);
  async function useReferenceKey() {
    if (!a || refKey == null) return;
    await collection.put('accession', a.id, { taxonKey: refKey });
    toast.show(`This plant now records GBIF key ${refKey}.`);
  }
  /** Two records under one number, not yet repaired: a reading of the log does not write to it, so the grower asks (round fifty-six, 3). */
  const sharedWith = $derived(a && collection.ready ? collection.sharesNumber('accession', a.id) : []);
  let renumbering = $state(false);
  /** Which of the records under the number the repair renumbers: said before the button, and the button does that and nothing else (round fifty-eight). */
  const plan = $derived(a && sharedWith.length ? collection.numberPlan('accession', a.id) : null);
  const othersNamed = $derived((plan ? [plan.keeper, ...plan.renumbered].filter((x) => x !== a?.id) : []).map((x) => collection.accession(x)?.taxonName ?? 'another plant'));
  async function renumberShared() {
    if (!a || renumbering) return;
    const id = a.id, before = accNo(a);
    renumbering = true;
    try {
      const ok = await collection.repairNumbers({ kind: 'accession', no: before });
      if (!ok || collection.sharesNumber('accession', id).length) {
        toast.show(`The number is still shared: ${collection.lastWriteError ?? 'the repair was not saved'}. Nothing else changed.`);
        return;
      }
      const now = collection.accession(id);
      if (now && accNo(now) !== before) {
        toast.show(`This plant is now ${accNo(now)}; a note on it says why.`);
        if (param !== id) await goto(`/plants/${encodeURIComponent(id)}`, { replaceState: true });
      } else toast.show(`${before} stays with this plant, recorded first; the other was given the next free number.`);
    } finally {
      renumbering = false;
    }
  }

</script>

<svelte:head><title>{a ? `${accNo(a)} ${a.taxonName}` : param} · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} onkeydown={(e) => { if (e.key === 'Escape' && cardMenu) closeCardMenu(true); }} onclick={(e) => { if (cardMenu && !(e.target as Element).closest('.cardmenu')) closeCardMenu(); }} />

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
{#if a && keyDiffers}
  <div class="notice" id="key-differs">The reference files {a.taxonName} under GBIF key {refKey}; this plant records key {a.taxonKey}, which the reference does not hold under that name. The species shown here is the reference's. <button class="btn" onclick={useReferenceKey}>Use the reference's key</button></div>
{/if}
{#if a && sharedWith.length}
  <div class="notice" id="shared-number">{#if plan?.keeper === a.id}{othersNamed.length === 1 ? `Another plant, ${othersNamed[0]},` : `${othersNamed.length} other plants`} {othersNamed.length === 1 ? 'has' : 'have'} the number {accNo(a)} too: two devices gave it out while offline, or a file was merged in. This plant was recorded first and keeps it; renumbering gives {othersNamed.length === 1 ? 'the other' : 'the others'} the next free number, with a note saying so.{:else}This plant shares the number {accNo(a)} with {othersNamed.join(', ')}, recorded before it: two devices gave it out while offline, or a file was merged in. Renumbering gives this plant the next free number, with a note saying so.{/if} <button class="btn" onclick={renumberShared} disabled={renumbering}>Renumber now</button></div>
{/if}
{#if !collection.ready}
  <!-- The page's shape before the vault opens: the card without a picture, which is what most plants' pages are; one with a photograph grows a hero above it when the record arrives. -->
  <!-- In the loaded page's own order: the id card (the tile, the number as its title and the actions row), then the verb bar. -->
  <div class="skel" aria-busy="true">
    <div class="idcard flat"><div class="skeltile skelbox"></div><div class="who"><h1 class="sci"><span class="accno big lead">{param}</span><span class="skelname" aria-hidden="true">Species name</span></h1><p class="vern muted">Opening your collection…</p></div><div class="acts"><span class="btn skelbtn">&nbsp;</span><span class="btn skelbtn">&nbsp;</span></div></div>
    <div class="skelverbs"></div>
  </div>
{:else if !a}
  <h1 class="q" style="margin-top: 24px">{param}</h1>
  {#if collection.removedAccession(param)}
    <p class="muted">{param} was given to a plant since removed. The number stays reserved and its record is still in the change log, so it can be brought back as it was, log and photographs included.</p>
    <p><button class="btn pri" onclick={restoreRemoved}>Restore this plant</button></p>
  {:else if waiting}
    <WaitingRecord kind="accession" label={param} {waiting} />
  {:else}
    <p class="muted">{collection.isNumberTaken(param) ? `${param} was given to a plant since removed; the number stays reserved.` : 'No plant with this number on this device.'}</p>
  {/if}
{:else}
  {#if cover}
    <div class="hero own">
      <!-- The button is named by what the photograph shows, and its image is then not read twice (round fifty-eight; the accessibility review). -->
      <button class="heroimg" type="button" onclick={() => openPhoto(cover)} aria-label="Open photograph: {photoLabel(cover)}">{#key cover.id}<PhotoImg id={cover.id} size="full" alt="" />{/key}</button>
      <span class="cred">{cover.caption ? cover.caption + ' · ' : ''}{cover.d}{photos.length > 1 ? ` · ${plural(photos.length, 'photo')}` : ''}</span>
    </div>
  {:else if speciesThumb && !thumbFailed}
    <div class="hero">
      <img src={speciesThumb} alt={a.taxonName} class="spthumb" onerror={() => (thumbFailed = true)} /><button class="cred" type="button" onclick={() => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); }}>species photograph · add your own</button>
    </div>
  {/if}
  <div class="idcard" class:flat={!hasHero}>
    {#if !hasHero}
      <!-- No photograph: a small tile where one would go, beside the name, not a screen-high empty box. The reference's is one line beneath, with what showing it discloses on tap. -->
      <PhotoAdd acc={id} id="hero-photo" tile />
    {/if}
    <div class="who">
      <h1 class="sci"><span class="accno big lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}<span style="font-style: normal">‘{a.cultivar}’</span>{/if}</h1>
      <p class="vern">
        {#if kind === 'hybrid'}<span class="kind">hybrid</span> · {:else if kind === 'cultivar'}<span class="kind">cultivar</span> · {/if}
        {#if a.nameAsReceived}received as <i>{a.nameAsReceived}</i> · {/if}
        {#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span> · {/if}
        {#if a.provenance === 'unknown' && !a.sourceFrom && !a.fieldNumber}Added {fmtDate(a.acquired)}{:else}{provLabel(a.provenance)}{#if a.acquired}{' · '}{a.sourceForm ?? 'acquired'}{a.sourceFrom ? ` from ${a.sourceFrom}` : ''}{' '}{fmtDate(a.acquired)}{/if}{/if}
        {#if a.sowingId}{' · '}raised from <a class="mono" href="/propagation/{a.sowingId}">{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing && sowing.parentAcc} (from <a class="mono" href="/plants/{sowing.parentAcc}">{collection.accession(sowing.parentAcc) ? accNo(collection.accession(sowing.parentAcc)!) : sowing.parentAcc}</a>){/if}{/if}
        {#if a.locationId && collection.placeOf(a.locationId)}{' · '}at <a class="place" href="/places/{collection.placeOf(a.locationId)}">{collection.locationName(a.locationId)}</a>{:else if a.locationId}{' · '}<span class="place">its place was removed; no place now</span>{/if}
        {#if !a.taxonKey && kind !== 'hybrid' && ref !== 'ok' && ref !== 'loading'}{' · '}<NotChecked inline what="Name" why="The name was kept as typed: it matched no reference name, or the name service did not answer when the plant was added. Edit the plant and pick the name from the list to check it." />{/if}
      </p>
      {#if kind === 'hybrid'}
        <p class="vern parentage">{#if parentLinks.length}{#each parentLinks as pl, i}{#if i}{' × '}{/if}{#if pl.slug}<a href="/species/{pl.slug}"><SpeciesName name={pl.name} /></a>{:else}<SpeciesName name={pl.name} />{/if}{/each}{:else}A hybrid; parentage not stated. <button class="linkish" type="button" onclick={startEdit}>Add it</button> if you know it.{/if}</p>
      {/if}
      {#if !hasHero && speciesThumb && thumbFailed}<p class="vern muted">The reference's photograph did not load.</p>{/if}
      {#if !hasHero && dossier?.thumb && !prefs.referencePhotos}<RefPhotoOffer link what="the reference’s photograph of this species" />{/if}
      {#if a.status !== 'growing' || collection.isDue(a)}
        <div class="pills">
          {#if a.status !== 'growing'}<span class="pill {a.status === 'dead' ? 'b' : ''}">{a.status}</span>{/if}
          {#if collection.isDue(a)}<span class="pill w">{sinceWater == null ? `no watering recorded in ${careDays} d` : `not watered for ${sinceWater} d`}</span>{/if}
        </div>
      {/if}
    </div>
    <div class="acts">
      {#if kind !== 'hybrid' && ref === 'ok'}<a class="btn" href="/species/{speciesHref}">Species page</a>{:else if kind !== 'hybrid' && ref === 'loading'}<span class="btn skelbtn" aria-hidden="true">Species page</span>{/if}
      <div class="cardmenu">
        <button class="btn dots" type="button" bind:this={cardMenuBtn} aria-haspopup="menu" aria-expanded={cardMenu} aria-controls="card-menu" aria-label="More for this plant: edit, label, propagate" title="Edit, label, propagate" onclick={() => (cardMenu = !cardMenu)}>···</button>
        {#if cardMenu}
          <div class="menu" id="card-menu" role="menu" tabindex="-1" aria-label="More for this plant" use:autofocusFirst onkeydown={menuKeys} onfocusout={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && e.relatedTarget !== cardMenuBtn) closeCardMenu(); }}>
            <button role="menuitem" type="button" onclick={() => { closeCardMenu(); startEdit(); }}>Edit</button>
            <a role="menuitem" href="/labels?acc={a.id}" onclick={() => closeCardMenu()}>Label</a>
            {#if a.status === 'growing'}<button role="menuitem" type="button" onclick={() => { closeCardMenu(); quick('death'); }}>Died…</button>{/if}
            {#if a.status === 'growing'}<a role="menuitem" href="/propagation/new?parent={a.id}" onclick={() => closeCardMenu()}>Propagate</a>{/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if editing}
    <form class="cult editform" onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
      <label><span>Species</span><SpeciesPicker bind:value={f.taxonName} bind:taxonKey={edKey} id="ed-name" /></label>
      <label><span>Cultivar</span><input id="ed-cv" type="text" bind:value={f.cultivar} /></label>
      <!-- "this version of the app", not "this build", here and under Provenance (round fifty-eight; the accessibility review). -->
      <label><span>What it is</span><select id="ed-kind" bind:value={f.nameKind}>{#if !['species', 'cultivar', 'hybrid'].includes(f.nameKind)}<option value={f.nameKind}>{f.nameKind} (a kind this version of the app does not know)</option>{/if}<option value="species">A species</option><option value="cultivar">A cultivar of that species</option><option value="hybrid">A hybrid (filed under the genus)</option></select></label>
      {#if f.nameKind === 'hybrid'}<label><span>Parentage</span><input id="ed-parentage" type="text" bind:value={f.parentage} placeholder="Seed parent × pollen parent" /></label>{/if}
      <label><span>Name as received</span><input id="ed-recv" type="text" bind:value={f.nameAsReceived} /></label>
      <label><span>Field number</span><input id="ed-fn" type="text" bind:value={f.fieldNumber} /></label>
      <label><span>Provenance</span><select id="ed-prov" bind:value={f.provenance}>{#if !['unknown', 'wild', 'f1', 'fn', 'veg'].includes(f.provenance)}<option value={f.provenance}>{f.provenance} (a word this version of the app does not know)</option>{/if}<option value="unknown">Not stated</option><option value="wild">Wild-collected</option><option value="f1">F1: raised from wild-collected seed</option><option value="fn">Cultivated seed (Fn)</option><option value="veg">Vegetative</option></select></label>
      <label><span>Acquired</span><input id="ed-date" type="date" bind:value={f.acquired} oninput={() => (edDateMsg = '')} aria-invalid={!!edDateMsg} aria-describedby={edDateMsg ? 'ed-date-bad' : undefined} />{#if edDateMsg}<span class="bad small" id="ed-date-bad">{edDateMsg}</span>{/if}</label>
      <label><span>From</span><input id="ed-from" type="text" bind:value={f.sourceFrom} /></label>
      <label><span>Form</span><input id="ed-form" type="text" bind:value={f.sourceForm} placeholder="plant, seedling, seed, cutting" /></label>
      <label><span>Price</span><input id="ed-price" type="text" bind:value={f.price} /></label>
      <!-- The plant's own watering rhythm, over its place's: blank follows the place, and the placeholder says what that is (round fifty-eight; the grower review). -->
      <label><span>Water about every</span><span class="unitfield"><input id="ed-waterdays" type="text" inputmode="numeric" bind:value={f.waterDays} placeholder="{inheritedRhythm} ({cond?.waterDays ? 'its place' : 'the default'})" oninput={() => (edWaterMsg = '')} aria-invalid={!!edWaterMsg} aria-describedby={edWaterMsg ? 'ed-water-bad' : undefined} /> days</span>{#if edWaterMsg}<span class="bad small" id="ed-water-bad">{edWaterMsg}</span>{/if}</label>
      <div class="wide"><span class="lbl">Place</span><LocationPicker bind:value={f.locationId} id="ed-loc" label="Place" /></div>
      <div class="actions wide"><button class="btn" type="button" onclick={() => { editing = false; edDateMsg = ''; edWaterMsg = ''; }}>Cancel</button><button class="btn pri" type="submit">Save</button></div>
    </form>
  {/if}

  <!-- The four verbs a grower uses most, then the rest on request: a new plant's page is not the tracker's whole vocabulary. A plant that is dead or archived is not watered first: Log leads and Water waits behind More (round twenty-three, 19). -->
  <div class="quickbar">
    {#if a.status === 'growing'}<button class="btn pri" onclick={waterNow} disabled={wateringNow}>Water</button>{/if}
    {#if hasHero}<button class="btn" onclick={() => { adding = !adding; if (adding) setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); }}>Photo</button>{/if}
    <button class="btn" class:pri={a.status !== 'growing'} onclick={() => quick('note')}>Log</button>
    {#if a.status !== 'dead'}<button class="btn" onclick={() => { moveTo = a.locationId ?? null; moving = !moving; }}>Move</button>{/if}<!-- a dead plant is not moved, nor watered (round fifty-eight; the grower review) -->
    {#if moreActs}
      {#if a.status === 'archived'}<button class="btn" onclick={() => quick('water')}>Water</button>{/if}
      <button class="btn" id="verb-feed" onclick={() => quick('feed')}>Feed</button>
      <button class="btn" onclick={() => quick('repot')}>Repot</button>
      <button class="btn" onclick={() => quick('measure')}>Measure</button>
      <button class="btn" onclick={() => quick('treat')}>Treat</button>
      <button class="btn" onclick={() => quick('flower')}>Flower</button>
      {#if a.status === 'growing'}{#if confirmArchive}<span class="confirmrow"><button class="btn" id="status-toggle" onclick={() => { confirmArchive = false; setStatus('archived'); }}>Yes, archive</button><button class="btn" type="button" onclick={() => (confirmArchive = false)}>Keep</button></span>{:else}<button class="btn" id="status-toggle" onclick={() => { confirmArchive = true; void focusNext('#status-toggle'); }} title="Takes the plant off the growing list; it can be marked growing again">Archive</button>{/if}{:else}<button class="btn" id="status-toggle" onclick={() => setStatus('growing')}>Mark growing</button>{/if}
    {:else}
      <button class="btn more" type="button" aria-expanded="false" onclick={() => { moreActs = true; void focusNext('#verb-feed'); }}>More ▾</button>
    {/if}
  </div>

  {#if moving && a.status !== 'dead'}
    <div class="cult evform">
      <div class="sum">Move to <span class="hint">records a move on the timeline</span></div>
      <div class="fields"><LocationPicker bind:value={moveTo} id="mv-loc" label="Move to" /><div class="actions"><button class="btn" type="button" onclick={() => (moving = false)}>Cancel</button><button class="btn pri" type="button" onclick={doMove}>Move</button></div></div>
    </div>
  {/if}

  {#if logOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="cult evform" onsubmit={async (e) => { e.preventDefault(); const label = EVENT_LABEL[et]; try { await addEvent(e); } catch { return; } closeLog(recordedText(label)); }} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeLog(); } }}>
      <div class="sum">Record: {EVENT_LABEL[et]} <span class="hint">goes on the timeline below</span></div>
      <div class="fields">
        <!-- Each field with a visible name: the placeholders were the only ones, and went as soon as a word was typed (round fifty-eight; the accessibility review). -->
        <div class="row">
          <label class="fl"><span class="eyebrow">What to record</span><select id="ev-type" bind:value={et}>
            {#each Object.entries(EVENT_LABEL).filter(([k]) => !['audit', 'germinate', 'potup', 'loss', 'propagate', 'acquire'].includes(k)) as [k, label]}<option value={k}>{label}</option>{/each}
          </select></label>
          <label class="fl"><span class="eyebrow">Date</span><input id="ev-date" type="date" bind:value={ed} oninput={() => (evmsg = '')} aria-invalid={!!evmsg} aria-describedby={evmsg ? 'ev-bad' : undefined} /></label>
        </div>
        {#if evmsg}<p class="refuse" role="alert" id="ev-bad">{evmsg}</p>{/if}
        {#if et === 'treat' || et === 'feed'}<label class="fl"><span class="eyebrow">{et === 'treat' ? 'Product and rate' : 'Feed and rate'}</span><input id="ev-used" type="text" bind:value={eused} placeholder={et === 'treat' ? 'e.g. Safari 20SG drench' : 'e.g. Grow More 17-8-22 ¼ tsp/gal'} /></label>{/if}
        {#if et === 'death'}<label class="fl"><span class="eyebrow">Cause, if known</span><input id="ev-cause" type="text" bind:value={ecause} /></label>{/if}
        {#if et === 'measure'}
          <div class="measures">
            {#each MEASURES.filter((x) => x.k !== POT.k) as m}
              <label><span class="lab">{m.label}{m.unit ? ` (${lu})` : ''}</span><input type="number" step="any" inputmode="decimal" bind:value={measures[m.k]} /></label>
            {/each}
          </div>
        {/if}
        {#if et === 'repot'}
          <!-- Both optional: the pot in the grower's length units, stored in millimetres; the medium into the note (round fifty-eight; the grower review). -->
          <div class="row repot">
            <label><span class="lab">Pot size ({lu})</span><input id="ev-pot" type="number" step="any" min="0" inputmode="decimal" bind:value={epot} placeholder={lu === 'in' ? 'e.g. 3.5' : 'e.g. 90'} oninput={() => (evmsg = '')} /></label>
            <label><span class="lab">Medium</span><input id="ev-medium" type="text" bind:value={emedium} placeholder="e.g. pumice and loam, 2:1" /></label>
          </div>
        {/if}
        <label class="fl"><span class="eyebrow">Note (optional)</span><input id="ev-note" type="text" bind:value={enote} /></label>
        <div class="actions"><button class="btn" type="button" onclick={() => closeLog()}>Cancel</button><button class="btn pri" type="submit">Record</button></div>
      </div>
    </form>
  {/if}

  <Parked kind="accession" id={id} />
  {#if setup.length}
    <div class="cult setup">
      <div class="sum">Set it up <span class="hint">what makes this page useful</span></div>
      <div class="setupbody">
        <!-- The first unfinished step is the one to take; the rest are listed, not pressed (round twenty, design) -->
        {#each setup as st, i (st.k)}<button class="setuprow" class:next={i === 0} class:later={i > 0} type="button" onclick={st.go}><span class="n">{i + 1}</span><span class="t">{st.t}</span><span class="w">{st.w}</span></button>{/each}
      </div>
    </div>
  {/if}

  <!-- The plant's own figures under the actions; then the log, the photographs, and the habitat comparison folded at the foot: on a phone the climate cards stood between the verbs and the log (round fifty-eight; the grower review). -->
  {#if (a.status === 'growing' || (a.status !== 'dead' && collection.lastWatered(id))) || events.some((e) => e.t === 'audit') || lastMeasure}
  <div class="cards">
    {#if a.status === 'growing' || (a.status !== 'dead' && collection.lastWatered(id))}<div class="card"><div class="lab">Since watered</div><div class="val">{sinceWater ?? '–'}{#if sinceWater != null}<span class="u"> d</span>{/if}</div><div class="sub">{sinceWater == null && collection.wateringAhead(id) ? `watering dated ${collection.wateringAhead(id)}, ahead of today` : sinceWater == null ? `no watering recorded${careDays === 0 ? ' yet; added today' : ` in the ${careDays} ${careDays === 1 ? 'day' : 'days'} since it was added`}` : `last ${collection.lastWatered(id)}`}</div></div>{/if}
    {#if events.some((e) => e.t === 'audit')}<div class="card"><div class="lab">Last seen</div><div class="val">{seen == null ? '–' : seen}<span class="u">{seen == null ? '' : ' d'}</span></div><div class="sub">{#if collection.missedAt(id)}not seen at the audit of <span class="date">{collection.missedAt(id)}</span>; {/if}last logged <span class="date">{collection.lastSeen(id)}</span></div></div>{/if}
    {#if lastMeasure}<div class="card"><div class="lab">{sizeKey ? (MEASURES.find((m) => m.k === sizeKey)?.label ?? 'Size') : 'Size'}</div><div class="val">{sizeKey && lastMeasure ? (MEASURES.find((m) => m.k === sizeKey)?.unit ? lenN(lastMeasure.measures![sizeKey]) : lastMeasure.measures![sizeKey]) : '–'}<span class="u">{sizeKey && MEASURES.find((m) => m.k === sizeKey)?.unit ? ' ' + lu : ''}</span></div>{#if growth != null}<div class="gauge"><i style="width: {Math.min(100, Math.max(8, (growth / Math.max(1, lastMeasure!.measures![sizeKey!])) * 100))}%"></i></div>{/if}<div class="sub">{growth != null ? `${growth >= 0 ? '+' : ''}${MEASURES.find((m) => m.k === sizeKey)?.unit ? len(growth) : growth} since ${firstMeasure!.d}` : `measured ${lastMeasure.d}`}</div></div>{/if}
  </div>
  {/if}

  <div class="secrule"><h2>Log</h2><div class="line"></div><span class="n">{plural(timeline.length, 'entry', 'entries')}</span></div>
  {#if !events.length}
    <p class="empty">Nothing recorded yet; each verb above adds a line here.</p>
  {:else}
    <div class="tl">
      {#each shownTimeline as row (row.k + row.id)}
        {#if row.k === 'e'}
          {@const e = row.e}
          <div class="tlrow" class:auto={!!e.auto} title={e.auto ? 'Written by the app or by a place-wide action, not an observation of this plant' : undefined}>
            <span class="d">{e.d}</span>
            <span class="t">{e.t === 'audit' && e.note === 'not seen' ? 'Not seen at audit' : (EVENT_LABEL[e.t] ?? e.t)}{#if e.used}<span class="x2">{' · '}{e.used}</span>{/if}{#if e.cause}<span class="x2">{' · '}{e.cause}</span>{/if}{#if e.measures}<span class="x2">{' · '}{Object.entries(e.measures).map(([k, v]) => { const m = measureOf(k); return `${m?.label ?? k} ${m?.unit ? len(v) : v}`; }).join(', ')}</span>{/if}{#if e.note && !(e.t === 'audit' && e.note === 'not seen')}<span class="x2">{' · '}{e.note}</span>{/if}</span>
            {#if confirmEvent === e.id}<button class="rm confirm" type="button" onclick={() => removeEntry(e.id)}>Remove?</button>{:else}<button class="rm" type="button" title="Remove this entry" aria-label="Remove this entry" onclick={() => { confirmEvent = e.id; void focusNext('.rm.confirm'); }}>×</button>{/if}
          </div>
        {:else}
          {@const ph = row.ph}
          <button class="tlrow tlphoto" type="button" onclick={() => openPhoto(ph)}>
            <span class="d">{ph.d}</span>
            <span class="t"><span class="thumb"><PhotoImg id={ph.id} alt="" loading="lazy" /></span>Photographed{#if ph.caption}<span class="x2"> · {ph.caption}</span>{/if}</span>
            <span class="x">{ph.dFrom === 'exif' ? 'camera date' : ''}</span>
          </button>
        {/if}
      {/each}
      {#if shownTimeline.length < timeline.length}
        <div class="tlrow tlmore"><span class="d"></span><span class="t"><button type="button" class="linkish" onclick={() => (allLog = true)}>All {timeline.length} entries</button> <span class="x2">· the latest {shownTimeline.length} are above</span></span></div>
      {/if}
    </div>
  {/if}

  <div class="secrule" id="photos"><h2>Photographs</h2><div class="line"></div><span class="n">{photos.length ? `${photos.length}` : ''}</span></div>
  {#if adding || !photos.length}
    <div class="cult addrow"><PhotoAdd acc={id} id="acc-photo" onstart={() => (adding = true)} onadded={() => (adding = true)} /></div>
  {/if}
  {#if photos.length}
    <!-- Each thumbnail is named by the plant, the day and the caption, the cover said too; the image inside is then decorative (round fifty-eight; the accessibility review). -->
    <div class="phgrid">
      {#each photos as ph, i (ph.id)}
        <button class="ph" type="button" class:cov={cover?.id === ph.id} onclick={() => (lightbox = i)} title={ph.caption ?? ph.d} aria-label="{photoLabel(ph)}{cover?.id === ph.id ? ' (the cover)' : ''}">
          <PhotoImg id={ph.id} alt="" loading="lazy" />
          <span class="pd">{ph.d}</span>
          {#if cover?.id === ph.id}<span class="tag">cover</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <details class="hab" id="habitat">
    <summary class="secrule"><h2>Habitat vs this place</h2><div class="line"></div><span class="n">{a.locationId && collection.placeOf(a.locationId) ? collection.locationName(a.locationId) : ''}</span></summary>
    <div class="cards">
      <div class="card"><div class="lab">Habitat rain season</div><div class="val" style="font-family: var(--ui); font-size: var(--fs-lg); font-weight: 700">{#if !season && dossier?.climate.status === 'refused'}<NotChecked what="Climate" why="A source did not answer when the species page was built{dossier.climate.detail ? `: ${dossier.climate.detail}` : ''}." />{:else}{season ? season.label : dossier?.climate.status === 'pending' ? 'Climate pending' : dossier ? 'No habitat climate' : ref === 'unreachable' ? 'Reference not reached' : ref === 'none' ? (kind === 'hybrid' ? 'A hybrid' : 'No species page') : '…'}{/if}</div><div class="sub">{#if season}{season.note} <a href="/species/{speciesHref}#s-cultivation">The sheet</a>.{:else if dossier?.climate.status === 'refused'}No season is read from an answer that was not given.{:else if dossier?.climate.status === 'pending'}The habitat climate for this species has not been derived yet.{:else if dossier}Nothing to read a season from{dossier.climate.status === 'none' && dossier.climate.detail ? `: ${dossier.climate.detail}` : ''}.{:else if ref === 'unreachable'}The species reference could not be reached from here; nothing is known either way.{:else if ref === 'none'}{kind === 'hybrid' ? (parentLinks.some((p) => p.slug) ? 'No habitat of its own; its parents have species pages.' : 'No habitat of its own.') : 'Not in the reference.'}{:else}reading the species page{/if}</div></div>
    </div>
    {#if habitat && a.locationId}
    <div class="factgrid hvh">
      {#if lightCompare}<div><b>Light</b>{lightCompare.text}.{#if lightCompare.here == null}{#if a.locationId}{' '}<a class="tap" href="/places/{a.locationId}?edit=1">Set its light</a>.{:else}{' '}<button type="button" class="linkish tap" onclick={() => (moving = true)}>Give it a place</button> first.{/if}{/if}</div>{/if}
      {#if coldCompare}<div><b>Cold</b>{coldCompare.text}.{#if coldCompare.here == null}{#if a.locationId}{' '}<a class="tap" href="/places/{a.locationId}?edit=1">Set its floor</a>.{:else}{' '}<button type="button" class="linkish tap" onclick={() => (moving = true)}>Give it a place</button> first.{/if}{/if}</div>{/if}
    </div>
    <!-- "across the range" and "a typical spot in the range", the glossary's words (round fifty-eight; the accessibility review). -->
    <details class="why">
      <summary>What this compares</summary>
      <div class="whybody">A comparison, not a verdict: the habitat figures are what the sky and the weather do where the species is recorded (CHELSA across the range, NASA POWER at a typical spot in the range), not measured tolerances of this plant. This place's figures are its own settings, inherited from the places above it where set. <a class="tap" href="/species/{speciesHref}#s-cultivation">The full cultivation sheet</a>.</div>
    </details>
    {/if}
    {#if !site.current && cond?.lat == null}<p class="small muted siteline">No site is set: set it once in <a href="/settings#site">Settings</a> and the seasons here are read from where you grow.</p>{/if}
  </details>

  <div class="secrule"><h2>Notes on this plant</h2><div class="line"></div></div>
  <div class="cult">
    {#if editingNotes}
      <div class="fields"><textarea id="acc-notes" rows="4" bind:value={notesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingNotes = false)}>Cancel</button><button class="btn pri" onclick={saveNotes}>Save</button></div></div>
    {:else if a.notes}
      <div class="body">{a.notes}</div><div class="foot"><button class="linkish" onclick={() => { notesDraft = a.notes ?? ''; notesBase = notesDraft; notesBaseStamp = collection.notesStamp('accession', id); editingNotes = true; }}>Edit</button></div>
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { notesDraft = ''; notesBase = ''; notesBaseStamp = collection.notesStamp('accession', id); editingNotes = true; }}>Add a note</button></div>
    {/if}
    <ReplacedNotes kind="accession" id={a.id} />
  </div>
  <div class="cult">
    <div class="sum">My notes on <i>{a.taxonName}</i> <span class="hint">shared by every plant of this species you own; shown on the species page</span></div>
    {#if editingMy}
      <div class="fields"><textarea id="taxon-notes" rows="4" bind:value={myNotesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingMy = false)}>Cancel</button><button class="btn pri" onclick={saveMyNotes}>Save</button></div></div>
    {:else if taxon?.myNotes}
      <div class="body">{taxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => { myNotesDraft = taxon?.myNotes ?? ''; myNotesOpen = myNotesDraft; myNotesBaseStamp = collection.notesStamp('taxon', taxonSlug); editingMy = true; }}>Edit</button></div>
      <ReplacedNotes kind="taxon" id={taxonSlug} />
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { myNotesDraft = ''; myNotesOpen = ''; myNotesBaseStamp = collection.notesStamp('taxon', taxonSlug); editingMy = true; }}>Write cultivation notes</button></div>
    {/if}
  </div>

  {#if propagations.length}
    <div class="secrule"><h2>Propagated from this plant</h2><div class="line"></div><span class="n">{propagations.length}</span></div>
    <div class="tl">
      {#each propagations as p}
        {@const st = collection.sowingStats(p.id)}
        <a class="tlrow" href="/propagation/{sowNo(p)}"><span class="d">{p.sown}</span><span class="t"><span class="mono">{sowNo(p)}</span> · {p.count} {(PROP_METHODS.find((m) => m.k === p.method) ?? PROP_METHODS[0]).unit}</span><span class="x">{st.germinated} struck · {st.potted} potted · {p.status}</span></a>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>Provenance</h2><div class="line"></div></div>
  {#if !a.sourceFrom && !a.sourceForm && !a.fieldNumber && a.provenance === 'unknown' && !a.sowingId && !a.nameAsReceived && kind !== 'hybrid' && !a.price && !a.sourceRef}
    <p class="empty">Nothing stated yet. <button class="linkish" type="button" onclick={startEdit}>Add where it came from</button></p>
  {:else}
  <div class="factgrid">
    <div><b>Source</b>{#if a.sourceFrom}<a href="/plants?q={encodeURIComponent(a.sourceFrom)}" title="Every plant from this source">{a.sourceFrom}</a>{/if}{#if a.sourceForm}{a.sourceFrom ? ' · ' : ''}as {a.sourceForm === 'plant' ? 'a plant' : a.sourceForm === 'seed' ? 'seed' : a.sourceForm === 'seedling' ? 'a seedling' : a.sourceForm === 'cutting' ? 'a cutting' : a.sourceForm}{/if}{#if a.acquired}{a.sourceFrom || a.sourceForm ? ', ' : ''}{a.acquired}{/if}{#if !a.sourceFrom && !a.sourceForm && !a.acquired}not stated{/if}{#if a.price}{' · '}{a.price}{/if}</div>
    {#if a.sourceRef}<div><b>Lot or reference</b>{a.sourceRef}</div>{/if}
    <div><b>Field number</b>{a.fieldNumber ?? 'none'}</div>
    <div><b>Provenance</b>{provLabel(a.provenance)}</div>
    {#if a.sowingId}<div><b>Raised from</b><a href="/propagation/{a.sowingId}">{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing} · {sowing.count} started, {collection.sowingStats(sowing.id).germinated} up, {collection.sowingStats(sowing.id).potted} potted{/if}</div>{/if}
    {#if a.nameAsReceived}<div><b>Name as received</b>{a.nameAsReceived}</div>{/if}
    {#if kind === 'hybrid'}<div><b>Parentage</b>{a.parentage ?? 'not stated'}</div>{/if}
  </div>
  {/if}

  <div class="dangerrow">
    <span class="small muted">Removing keeps the number reserved; the record stays in the change log, and the plant's page offers to bring it back.</span>
    {#if confirmRemove}<span><button class="btn danger" onclick={remove}>Yes, remove {accNo(a)}</button> <button class="btn" onclick={() => (confirmRemove = false)}>Keep</button></span>{:else}<button class="btn danger" onclick={() => { confirmRemove = true; void focusNext('.dangerrow .btn.danger'); }}>Remove this plant</button>{/if}
  </div>
  {#if lightbox != null && photos.length}
    <Lightbox {photos} bind:index={lightbox} acc={id} onclose={() => (lightbox = null)} />
  {/if}
{/if}

<style>
  /* A date in a narrow card's subline stays on one line: at 390 px it broke after "2026-09-" (round thirty-seven, R2 design). */
  .sub .date { white-space: nowrap; }
  .hero { margin-top: 14px; }
  /* Without a picture the card does not overlap a hero that is not there. */
  .idcard.flat { margin-top: 14px; }
  .idcard.flat .who { flex-basis: 260px; }
  .vern .kind { font-family: var(--ui); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cool); }
  .vern .place { font-weight: 600; color: var(--ink); }
  .idcard .pills:empty { display: none; }
  .cardmenu { position: relative; }
  .cardmenu .dots { font-weight: 700; letter-spacing: 0.1em; padding-left: 12px; padding-right: 12px; }
  .cardmenu .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 160px; background: var(--card); border-radius: var(--r); box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18); padding: 6px; display: flex; flex-direction: column; }
  .cardmenu .menu > * { display: block; text-align: left; font: inherit; font-family: var(--ui); font-size: var(--fs-md); padding: 9px 12px; border: 0; background: none; color: var(--ink); border-radius: var(--r-sm); cursor: pointer; text-decoration: none; }
  .cardmenu .menu > *:hover, .cardmenu .menu > *:focus-visible { background: var(--sunk); outline: none; }
  /* A fixed height for the species photograph and its stand-ins: the box is the same size before the image, with it, and without it, so the page below does not move. */
  .hero:not(.own) { min-height: 260px; }
  .hero .spthumb { width: 100%; height: 260px; object-fit: cover; display: block; }
  /* The skeleton fills the first screen, so the footer starts below the fold and does not move when the record's sections arrive (round eleven, 4). */
  .skel { min-height: calc(100vh - 150px); }
  .skelbox { background: var(--sunk); border-radius: var(--r); min-height: 260px; }
  .skelname { visibility: hidden; } /* holds the name's line, which wraps under the number on a phone, so the card does not grow when the record arrives (round twenty-one, 14) */
  .skeltile { width: var(--tile, 96px); height: var(--tile, 96px); min-height: 0; flex: 0 0 var(--tile, 96px); border-radius: var(--r-lg); }
  .skelbtn { min-width: 64px; visibility: hidden; }
  .skelverbs { min-height: 52px; margin-top: 14px; }
  .parentage { margin-top: 2px; }
  .parentage a { color: inherit; }
  .hero.own { background: #0d1211; min-height: 430px; }
  .hero.own .cred { top: 10px; bottom: auto; }
  .heroimg { display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .heroimg :global(img) { width: 100%; height: 430px; object-fit: cover; display: block; } /* a fixed height: the box is the same before the pixels arrive from the vault */
  button.cred { border: 0; cursor: pointer; font: inherit; font-size: var(--fs-xs); }
  .addrow { padding: 14px 17px; margin-top: 12px; }
  .phgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
  .phgrid .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: var(--r); overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: var(--sh); }
  .phgrid .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .phgrid .ph.cov { outline: 2px solid var(--accent); outline-offset: 2px; }
  .phgrid .pd { position: absolute; left: 8px; bottom: 7px; font-family: var(--mono); font-size: var(--fs-xs); color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: var(--r-sm); }
  .phgrid .tag { position: absolute; right: 8px; top: 7px; font-size: var(--fs-xs); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; color: var(--on-accent); background: var(--accent); padding: 2px 7px; border-radius: var(--r-sm); }
  .tlphoto { width: 100%; text-align: left; background: transparent; border: 0; border-top: 1px solid var(--rule); font: inherit; color: inherit; cursor: pointer; align-items: center; }
  .tlphoto:first-child { border-top: 0; }
  .tlphoto .thumb { display: inline-block; width: 44px; height: 44px; border-radius: var(--r-sm); overflow: hidden; vertical-align: middle; margin-right: 10px; background: var(--sunk); }
  .tlphoto .thumb :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tlphoto:hover .t { color: var(--accent); }
  .hvh { grid-template-columns: 1fr 1fr; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .refuse { margin: 6px 0 0; font-size: var(--fs-md); color: var(--bad); }
  @media (max-width: 520px) { .hvh { grid-template-columns: 1fr; } }
  .muted { color: var(--ink3); }
  .editform, .evform { margin-top: 16px; }
  .editform { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; }
  .editform label { display: grid; gap: 4px; }
  .editform label > span, .editform .lbl { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .editform input, .editform select, .fields input, .fields select, .fields textarea { width: 100%; font: inherit; font-size: 0.875rem; padding: 8px 11px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .measures { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .measures label { display: grid; gap: 3px; }
  .measures .lab, .repot .lab { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .repot label { display: grid; gap: 3px; } /* a repot's pot and medium (round fifty-eight; the grower review) */
  .fl { display: grid; gap: 3px; min-width: 0; } /* a field with its small name over it (round fifty-eight; the accessibility review) */
  /* The rhythm box and its word, not set as a label (round fifty-eight; the grower review). */
  .editform label > span.unitfield { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); letter-spacing: 0; text-transform: none; color: var(--ink2); font-weight: 400; }
  .editform .unitfield input { width: 6em; }
  /* The habitat block is folded at the foot, one tap to open, its summary a 44px target (round fifty-eight; the grower review). */
  .hab { margin-top: var(--section-gap, 28px); }
  .hab > summary.secrule { display: flex; align-items: center; gap: 10px; min-height: 44px; margin: 0; cursor: pointer; list-style: none; }
  .hab > summary::-webkit-details-marker { display: none; }
  .hab > summary::before { content: '›'; display: inline-block; transition: transform 0.15s; color: var(--accent); font-size: var(--fs-lg); font-weight: 700; }
  .hab[open] > summary::before { transform: rotate(90deg); }
  .hab > summary h2 { color: var(--accent); }
  .hab > summary .n { margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .hab .cards { margin-top: 6px; }
  .siteline { margin: 10px 0 0; font-size: var(--fs-md); }
  .tlmore .linkish { display: inline-flex; align-items: center; min-height: 44px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin: 0; }
  .tlrow .x2 { font-weight: 400; color: var(--ink2); font-size: var(--fs-md); }
  /* The × is small; its hit area is not. Negative margins keep the row's height. */
  .rm { border: 0; background: transparent; color: var(--ink3); cursor: pointer; font-size: var(--fs-lg); line-height: 1; padding: 0 4px; min-width: 40px; min-height: 40px; margin: -12px -8px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r); }
  .rm:hover { color: var(--bad); }
  .rm.confirm { font-size: var(--fs-sm); color: var(--bad); font-weight: 600; }
  a.tlrow { color: inherit; }
  .tlrow.auto .t { color: var(--ink3); font-weight: 400; } /* a line the app wrote, or a place-wide action made, is set quieter than the grower's own (round twenty-five, 12) */
  a.tlrow:hover { text-decoration: none; }
  a.tlrow:hover .t { color: var(--accent); }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: var(--fs-md); }
  .dangerrow { margin: 46px 0 10px; padding: 0; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: var(--fs-md); color: var(--ink3); }
  .setup { margin-top: 14px; }
  .setup .setupbody { display: grid; }
  .setuprow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 12px; align-items: center; text-align: left; padding: 12px 17px; border: 0; border-top: 1px solid var(--rule); background: none; font: inherit; color: inherit; cursor: pointer; min-height: 48px; width: 100%; }
  .setuprow:first-child { border-top: 0; }
  .setuprow:hover { background: var(--sunk); }
  .setuprow .n { font-family: var(--mono); font-size: var(--fs-sm); color: var(--ink3); }
  .setuprow .t { font-weight: 600; font-size: var(--fs-md); color: var(--accent); }
  .setuprow .w { font-size: var(--fs-sm); color: var(--ink3); }
  .setuprow.next { padding-top: 14px; padding-bottom: 14px; }
  .setuprow.next .t { font-size: var(--fs-base); }
  .setuprow.later .t { font-weight: 500; color: var(--ink2); font-size: var(--fs-md); }
  .setuprow.later { padding-top: 9px; padding-bottom: 9px; }
  .quickbar .more { color: var(--ink2); }
  .confirmrow { display: inline-flex; gap: 6px; }
  /* On a phone the checklist is one row of steps, scrolled sideways, the next step set in the accent: four stacked rows
     stood between the name and the plant's first figures on the first screen (round fifty, 4). */
  @media (max-width: 640px) {
    .setup .sum .hint { display: none; }
    .setup .setupbody { display: flex; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 0 12px 12px; }
    .setup .setupbody::-webkit-scrollbar { display: none; }
    .setuprow, .setuprow.next, .setuprow.later { display: inline-flex; width: auto; flex: none; gap: 6px; align-items: center; min-height: 36px; padding: 6px 12px; border: 1px solid var(--rule); border-radius: 999px; background: var(--card); white-space: nowrap; }
    .setuprow.next { border-color: var(--accent); }
    .setuprow .n { font-size: var(--fs-xs); }
    .setuprow .t, .setuprow.next .t, .setuprow.later .t { font-size: var(--fs-md); }
    .setuprow .w { display: none; }
  }
  @media (max-width: 640px) { .editform { grid-template-columns: 1fr 1fr; } .hero { margin-top: 0; } .hero.own { min-height: 260px; } .heroimg :global(img) { height: 260px; } .idcard.flat { margin-top: 10px; display: grid; grid-template-columns: 80px minmax(0, 1fr); --tile: 80px; } .idcard.flat .acts { grid-column: 1 / -1; } .idcard.flat .who { flex-basis: auto; } .idcard.flat h1.sci { font-size: var(--fs-2xl); } .idcard.flat .accno.lead { display: table; margin: 0 0 4px; vertical-align: baseline; } }
</style>

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
  import { site, readerLat } from '$lib/ui/site.svelte';
  import { plantHref } from '$lib/db/links';
  import PlantName from '$lib/ui/PlantName.svelte';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import HeldNote from '$lib/ui/HeldNote.svelte';
  import { plantLabel } from '$lib/ui/plant-label';
  import { rhythmWords, restWords, dayWords, addedWords, type Rhythm } from '$lib/ui/today-words';
  import { seasonOf, restReason } from '$core/season';
  import { frost } from '$lib/ui/frost.svelte';
  import { tempUnit, rainUnit, tempN, rainN, ruleRain } from '$core/units';
  import { onMount, tick } from 'svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Today from '$lib/ui/Today.svelte';
  // Each by its own path, not the barrel, which carries every grower component into this page (round sixty-one; the accessibility review, 3).
  import Firsts from '$lib/ui/grow/Firsts.svelte'; // round sixty, agent F: firsts in Also today, the watering calendar
  import FloweredBefore from '$lib/ui/grow/FloweredBefore.svelte'; // round eighty-seven, F8: flowered this week in past years
  import CalendarExport from '$lib/ui/grow/CalendarExport.svelte';
  import { collection, DUE_DAYS } from '$lib/db/collection.svelte';
  import { accNo, kindOf, type Accession, type Location } from '$lib/db/types';
  import { daysBetween, localDate } from '$core/dates';
  import { wateredHere, type Watered } from '$lib/ui/watered.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { today as day } from '$lib/ui/day.svelte';
  import { sheetsOr, isUnreached, waitLeft, type Sheet, type Unreached } from '$lib/ui/index.svelte';
  import { unreachedClause, againWords } from '$lib/ui/reach-words';
  import { alertsUnchecked, alertsWhy } from '$lib/ui/alert-words';
  import { growingYear, forReader } from '$core/sheet';
  import { speciesSlug } from '$core/names';
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  // An empty collection's Today offers the example collection under its own empty state; nothing opens it by itself (round seventy-four).
  import ExampleOffer from '$lib/ui/grow/ExampleOffer.svelte';
  import { addLeavesExample, example } from '$lib/ui/grow/example.svelte';
  import { frame } from '$lib/ui/frame.svelte';
  import { onDestroy } from 'svelte';
  import TownSearch from '$lib/ui/TownSearch.svelte';
  import { LOCATION_WHY } from '$lib/weather/place';
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
      if (!r.ok) { err = forecastRefusal(r); data = null; return; }
      data = r.body;
    } catch {
      // Whatever went wrong, the page says the check did not happen: never a status code, never that the nights are clear.
      if (gen === loadGen) { err = forecastRefusal(null); data = null; }
    }
    finally { if (gen === loadGen) busy = false; }
  }
  /** The site from the device's own location, rounded as Settings rounds it (round sixty-two; as the front page's line does since round forty-nine). */
  let locating = $state(false);
  let locateMsg = $state('');
  function locate() {
    if (locating) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { locateMsg = 'This browser has no location service; set the site in Settings.'; return; }
    locating = true; locateMsg = '';
    navigator.geolocation.getCurrentPosition(
      (p) => { site.set({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); locating = false; void frost.check(true); },
      (e) => { locating = false; locateMsg = e.message; },
      { timeout: 10000 }
    );
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
  type Stop = { key: string; place: Location | null; depth: number; overdue: Accession[]; unknown: Accession[]; ahead: Accession[]; resting: Accession[]; restRain: Accession[]; restCool: Accession[]; unseen: Accession[]; keptDry: number; ownRest: Array<{ why: string; plants: Accession[] }>; n: number; watered: Watered | null };
  /** The species in their habitat's dry season now, by the sheets the front page reads too (round fifty-four, 4; the second reviewer's finding 23). Until the sheets have answered (or failed), the Water buttons wait: a button whose count changes as the sheets arrive moves under a reading eye (round fifty-five, 5). */
  let sheets = $state<Map<string, Sheet> | null>(null);
  let sheetsSettled = $state(false);
  /** The sheets have answered once: the stops are drawn from then on, and a later re-read (a watering changed what is due) only holds the buttons, so a stop never vanishes under focus (round sixty-one). */
  let sheetsOnce = $state(false);
  // The footer waits until the stops and the sections under them are drawn (round eighty-four; P2): under "Reading the
  // species sheets…" it stood in view, and the stops pushed it off.
  const releaseFooter = frame.hold();
  onDestroy(releaseFooter);
  $effect(() => { if (collection.ready && (!growing.length || sheetsOnce) && !example.entering && !(example.seeding && !growing.length)) releaseFooter(); });
  /** The species whose sheets were asked for and answered: a watering that only shrinks what is due asks again for nothing, so the stops' buttons do not wait on every tap (round sixty-one). A request that failed leaves its species unasked, so the next look, or "Check again", asks again (round sixty-two; the outside review's A6). */
  let sheetsAsked = new Set<string>();
  /**
   * The sheets did not answer (refused, unreachable, or still running at SHEETS_WAIT_MS): no plant is set apart for its
   * habitat's rest, and each stop says the resting months were not checked, never that none is resting (round sixty-two;
   * rule 2; the grower review, 1, the accessibility review, 2, the outside review's A6).
   */
  let sheetsFailed = $state(false);
  /** Why the sheets gave no answer, so a refusal or a limit is said as one, not as silence (round sixty-seven; triage-66 S8, IND-7). */
  let sheetsWhy = $state<Unreached | null>(null);
  /** The clock for "Check again" while a Retry-After runs: ticks each second only then (round sixty-seven; triage-66 S8). */
  let nowMs = $state(Date.now());
  const sheetsWait = $derived(waitLeft(sheetsWhy, nowMs));
  $effect(() => {
    if (!sheetsWhy?.retryAfter) return;
    const t = setInterval(() => { nowMs = Date.now(); if (!waitLeft(sheetsWhy, nowMs)) clearInterval(t); }, 1000);
    return () => clearInterval(t);
  });
  /** "Check again", only once the server's Retry-After is over: asked sooner, it was refused again at once (R45-11). */
  function checkAgain() {
    if (!sheetsSettled || waitLeft(sheetsWhy)) return;
    sheetsTry++;
  }
  const sheetsClause = $derived(sheetsWhy ? unreachedClause(sheetsWhy, 'the species sheets', nowMs) : 'the species sheets did not answer');
  /** A first read still running after five seconds says so: "Reading…" for ten or twenty seconds read as a page that had stopped (round sixty-two; the accessibility review, 2). */
  let sheetsSlow = $state(false);
  /** How long a read is waited for before it is taken as not answered: past the reference's own ten-second limit, so this only catches a read that limit did not end (round sixty-two). */
  const SHEETS_WAIT_MS = 15_000;
  /** "Check again": a new read of the sheets that did not answer. */
  let sheetsTry = $state(0);
  let sheetsGen = 0;
  $effect(() => {
    void sheetsTry;
    const slugs = [...new Set(growing.filter((a) => due.has(a.id) && kindOf(a) === 'species').map((a) => speciesSlug(a.taxonName)))];
    const open = collection.ready;
    if (!slugs.length) { sheets = null; sheetsSettled = true; sheetsFailed = false; if (open) sheetsOnce = true; return; }
    if (slugs.every((x) => sheetsAsked.has(x))) { sheetsSettled = true; sheetsOnce = true; return; }
    sheetsSettled = false;
    const gen = ++sheetsGen;
    let done = false;
    const slow = setTimeout(() => { if (!done && gen === sheetsGen) sheetsSlow = true; }, 5_000);
    const settle = (m: Map<string, Sheet> | Unreached | null) => {
      if (done || gen !== sheetsGen) return; // a read overtaken by a newer one, or one already taken as not answered
      done = true;
      holdFocus();
      clearTimeout(slow); clearTimeout(cap);
      if (m && !isUnreached(m)) { slugs.forEach((x) => sheetsAsked.add(x)); sheets = m; sheetsFailed = false; sheetsWhy = null; }
      else { sheetsFailed = true; sheetsWhy = m ?? null; nowMs = Date.now(); } // the slugs stay unasked: the next look asks again (round sixty-two; A6)
      sheetsSlow = false; sheetsSettled = true; sheetsOnce = true;
    };
    const cap = setTimeout(() => settle(null), SHEETS_WAIT_MS);
    void sheetsOr(slugs).then(settle, () => settle(null));
  });
  /**
   * "Check again" sits in the line it takes away: when the sheets answer, focus on it goes to its stop's heading (else the
   * section's), as a pruned done row's does, not to the top of the page (round sixty-two; the verification review's grower 5).
   */
  function holdFocus() {
    const at = document.activeElement as HTMLElement | null;
    const key = at?.closest?.('.restnc') ? at.closest<HTMLElement>('li.stop')?.id : null;
    if (!key) return;
    void tick().then(() => {
      if (at?.isConnected && document.activeElement === at) return;
      (document.getElementById(key)?.querySelector<HTMLElement>('h3') ?? document.getElementById('water-h'))?.focus();
    });
  }
  /** Whether a stop has a plant whose resting months the sheets would have read: a due species, not a cross or a cultivar of none. */
  const restUnread = (s: Stop) => sheetsFailed && [...s.overdue, ...s.unknown].some((a) => kindOf(a) === 'species');
  /**
   * Which rule of the species sheet puts this month outside the plant's growing months, if one does: the rain rule (a
   * rainy season, and this month is not in it), or, under 120 mm of rain a year, the temperature rule (the cooler six
   * months, and this month is not among them). The two are worded apart: a fog-belt cactus has no rainy season to be
   * outside of, and its species page says so (round fifty-nine). Null when the plant is not resting by either.
   */
  const restRule = (a: Accession): 'rain' | 'cool' | null => {
    // A plant whose growing season the grower set or confirmed follows its own months, not the sheet's reading (round
    // eighty-seven, t3; plan F7): outside its rest months it is watered as any plant is.
    if (!sheets || kindOf(a) !== 'species' || seasonOf(a)) return null;
    const sh = sheets.get(speciesSlug(a.taxonName));
    if (!sh || sh.climate.status !== 'ok') return null;
    const year = growingYear(sh.climate.months, sh.habitatLat);
    if (!year || year.none || year.grow === 'even' || year.frozen) return null;
    // The reader's hemisphere as the species page and the labels read it: the site, else the first place with coordinates (round sixty; the self-review's 10).
    if (forReader(year, readerLat(collection.locations)).includes(Number(today.slice(5, 7)))) return null;
    return year.fog ? 'cool' : 'rain';
  };
  const isResting = (a: Accession) => restRule(a) != null;
  const byNo = (a: Accession, b: Accession) => accNo(a).localeCompare(accNo(b)); // the order of the labels on the bench
  /** The places with work: a stop listed only for a dry-month rule, a watering dated ahead or a done row is not one (round fifty-nine). */
  const hasWork = (s: Stop) => !!(s.overdue.length || s.unknown.length || s.resting.length || s.unseen.length);
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
      const keptDry = here.filter((a) => collection.placeDry(a)).length;
      // Resting by its own growing season, set or confirmed on the plant (round eighty-seven, t3; plan F7): no Water
      // button, and one line a reason saying why, the plants under it. A plant its space keeps dry is counted there.
      const ownRest = new Map<string, Accession[]>();
      for (const a of here) { if (collection.placeDry(a)) continue; const r = collection.resting(a); if (!r) continue; const why = restReason(r); (ownRest.get(why) ?? ownRest.set(why, []).get(why)!).push(a); }
      const rests = [...ownRest].map(([why, plants]) => ({ why, plants }));
      if (here.length || watered) out.push({ key, place, depth, overdue, unknown, ahead, resting, restRain: resting.filter((a) => restRule(a) === 'rain'), restCool: resting.filter((a) => restRule(a) === 'cool'), unseen, keptDry, ownRest: rests, n: place ? collection.plantsAt(place.id).filter((a) => a.status === 'growing').length : here.length, watered });
    };
    const walk = (parent: string | null, depth: number) => {
      for (const l of collection.children(parent)) { stop(l, depth); walk(l.id, depth + 1); }
    };
    walk(null, 0);
    stop(null, 0);
    // Round 120 (MYPLANTS 28): the spaces with something to look at first, in walking order; the rest after, in walking order.
    return [...out.filter((x) => hasWork(x) || x.watered), ...out.filter((x) => !hasWork(x) && !x.watered)];
  });
  /** Plants that need something, each counted once whatever it needs (round fifty-four, 4); a watering dated ahead is not a need. */
  const todo = $derived(new Set(stops.flatMap((s) => [...s.overdue, ...s.unknown, ...s.resting, ...s.unseen].map((a) => a.id))).size);
  const workPlaces = $derived(stops.filter((s) => s.place && hasWork(s)).length);
  const workNoPlace = $derived(stops.some((s) => !s.place && hasWork(s)));
  const across = $derived(workPlaces ? `across ${workPlaces} ${workPlaces === 1 ? 'space' : 'spaces'}${workNoPlace ? ' and among the plants with no space' : ''}` : workNoPlace ? 'among the plants with no space' : '');
  // Counted to the day store's date, the one the page shows and the taps write, so a page open across midnight says the same day throughout (round fifty-eight).
  const days = (a: Accession) => { const w = collection.lastWatered(a.id); return daysBetween(w ?? collection.madeOn('accession', a.id) ?? a.acquired ?? today, today); };
  /** Plants a grower unticked on a stop: left out of its Water button (round fifty-eight; the grower review). Per page visit. */
  let skipped = $state(new Set<string>());
  /**
   * Round 120 (MYPLANTS 28): a space's plants to look at, one list. A plant past its rhythm, or with no watering recorded,
   * opens ticked; one listed only for a look (its habitat's dry season, or unseen) opens unticked: today's "water only if
   * you want to" in one list. A tick is a watering; no tick is "looked at, left dry".
   */
  type Look = { a: Accession; why: 'past' | 'none' | 'rain' | 'cool' | 'unseen'; tick: boolean };
  const looks = (s: Stop): Look[] => [
    ...s.overdue.map((a) => ({ a, why: 'past' as const, tick: true })),
    ...s.unknown.map((a) => ({ a, why: 'none' as const, tick: true })),
    ...s.restRain.map((a) => ({ a, why: 'rain' as const, tick: false })),
    ...s.restCool.map((a) => ({ a, why: 'cool' as const, tick: false })),
    ...s.unseen.map((a) => ({ a, why: 'unseen' as const, tick: false }))
  ];
  /** The grower's own ticks, over each plant's default, for this visit. */
  let ticks = $state(new Map<string, boolean>());
  const isTicked = (l: Look) => ticks.get(l.a.id) ?? l.tick;
  const setTick = (id: string, on: boolean) => { const n = new Map(ticks); n.set(id, on); ticks = n; };
  /** "Done · 1 watered, 1 left dry": the words follow the ticks. */
  const doneWords = (ls: Look[]) => { const w = ls.filter(isTicked).length, d = ls.length - w; return [w ? `${w} watered` : '', d ? `${d} left dry` : ''].filter(Boolean).join(', '); };
  /** Why a plant is listed, in a grower's words; "You have watered it about every N days" where the log holds three gaps. */
  const reasonOf = (l: Look): string => {
    const base = l.why === 'past' ? `${rhythmWords([rhythmOf(l.a)])}: ${dayWords(days(l.a))} since its last watering.`
      : l.why === 'none' ? `No watering recorded: ${addedWords(days(l.a))}.`
      : l.why === 'rain' || l.why === 'cool' ? `${restWords(l.why, units.current)}. It is listed for a look, not for water.`
      : collection.unseenWhy(l.a.id) === 'missed' ? `Missed at the audit of ${collection.missedAt(l.a.id)}.` : `Not seen since ${collection.lastSeen(l.a.id)}, ninety days and more since this space's audit.`;
    const gap = collection.wateringGap(l.a.id);
    return gap ? `${base} You have watered it about every ${gap} days.` : base;
  };
  const shortWhy = (l: Look) => (l.why === 'past' ? 'past its rhythm' : l.why === 'none' ? 'no watering recorded' : l.why === 'unseen' ? (collection.unseenWhy(l.a.id) === 'missed' ? 'missed at audit' : 'not seen lately') : 'habitat dry season');
  /** The pill: what is to look at, else when the next plant here comes due, else nothing due. */
  const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const pillOf = (s: Stop): string => {
    const n = looks(s).length;
    if (n) return `${n} to look at`;
    let best: number | null = null;
    for (const a of growing) {
      if ((s.place ? collection.placeOf(a.locationId ?? '') !== s.place.id : a.locationId && collection.location(a.locationId)) || collection.keptDry(a) || collection.wateringAhead(a.id)) continue;
      const dry = collection.leftDry(a);
      const left = Math.max(collection.rhythm(a) - collection.careDays(a), dry ? dry.days - daysBetween(dry.d, today) : 0);
      if (left > 0 && (best == null || left < best)) best = left;
    }
    if (best == null) return 'nothing due';
    if (best === 1) return 'next due tomorrow';
    if (best <= 6) { const [y, m, d] = today.split('-').map(Number); return `next due ${WEEKDAY.format(new Date(Date.UTC(y, m - 1, d + best)))}`; }
    return `next due in ${best} days`;
  };
  /** The one space open: the first with something to look at, until the grower opens another. */
  let openKey = $state<string | null | undefined>(undefined);
  const firstOpen = $derived(stops.find((x) => looks(x).length && !x.watered)?.key ?? null);
  const isOpen = (s: Stop) => (openKey === undefined ? firstOpen : openKey) === s.key;
  const toggleOpen = (s: Stop) => { openKey = isOpen(s) ? null : s.key; };
  /** Reasons opened, by plant. */
  let whyOpen = $state(new Set<string>());
  const toggleWhy = (id: string) => { const n = new Set(whyOpen); if (n.has(id)) n.delete(id); else n.add(id); whyOpen = n; };
  /**
   * Done records the space: a watering on each ticked plant, a "looked at, left dry" on each unticked one, dated today, in
   * one write. The space closes to one line with Undo, and the next space with something to look at opens.
   */
  async function doneHere(s: Stop) {
    const ls = looks(s);
    if (watering || !ls.length || !sheetsSettled) return;
    watering = s.key;
    try {
      const d = localDate();
      if (day.current !== d) day.current = d;
      const from = `from Today: ${s.place ? s.place.name : 'plants with no space'}`;
      const ids = await collection.addEventsIds(ls.map((l) => ({ acc: l.a.id, d, t: (isTicked(l) ? 'water' : 'dry') as 'water' | 'dry', note: from })));
      wateredHere.add(s.key, ids, ls.map((l) => ({ id: l.a.id, no: accNo(l.a), name: plantLabel(l.a), ...(isTicked(l) ? {} : { dry: true }) })), 0);
      const words = doneWords(ls);
      const i = stops.findIndex((x) => x.key === s.key);
      openKey = [...stops.slice(i + 1), ...stops.slice(0, i)].find((x) => looks(x).length && !wateredHere.get(x.key))?.key ?? null;
      await tick();
      document.querySelector<HTMLElement>(openKey ? `#stop-${CSS.escape(openKey)} .spacehead` : `#stop-${CSS.escape(s.key)} .row.done button`)?.focus();
      toast.show(`Done: ${words}.`);
    } finally {
      watering = null;
    }
  }
  const toggleSkip = (id: string) => { const n = new Set(skipped); if (n.has(id)) n.delete(id); else n.add(id); skipped = n; };
  const ticked = (s: Stop) => [...s.overdue, ...s.unknown].filter((a) => !skipped.has(a.id));
  const tickedOf = (list: Accession[]) => list.filter((a) => !skipped.has(a.id));
  /** "Water this one", "Water these 3": the button counts what is ticked. */
  const waterWords = (n: number) => (n === 1 ? 'Water this one' : `Water these ${n}`);
  /** Where each plant's rhythm comes from, for the row's words: its own figure, the place that sets it, or the default (round sixty; the grower review, 5). */
  const rhythmOf = (a: Accession): Rhythm => ({ days: collection.rhythm(a), from: typeof a.waterDays === 'number' && a.waterDays > 0 ? 'plant' : (a.locationId && collection.location(a.locationId) && collection.conditions(a.locationId).from.waterDays) || 'default' });
  /** Ticked plants still waiting anywhere on the stop: the done mark is said only when there are none, so it never stands over a row still to water (round sixty; the grower review, 4; the outside review's A37). */
  const tickedLeft = (s: Stop) => ticked(s).length + tickedOf(s.resting).length;
  /** Whether what was just watered on the stop includes plants of the head's own rows (past the rhythm, or none recorded), not only resting ones: the head's done mark speaks for those (round sixty; the grower review, 4). */
  const headWatered = (s: Stop) => !!s.watered?.plants.some((p) => { const a = collection.accession(p.id); return !!a && !isResting(a); });
  /**
   * Nothing due: which plant comes due next, and in how many days, so "All caught up" says when Today will next speak.
   * A plant kept dry this month, or with a watering dated ahead, is left out of the reckoning.
   */
  const nextDue = $derived.by(() => {
    let best: { a: Accession; days: number } | null = null;
    for (const a of growing) {
      if (collection.keptDry(a) || collection.wateringAhead(a.id)) continue;
      const left = collection.rhythm(a) - collection.careDays(a);
      if (left > 0 && (!best || left < best.days)) best = { a, days: left };
    }
    return best;
  });
  /** The first weeks: no watering recorded on any plant yet, so every plant is counted from the day it was added (round sixty; the grower review, 6). */
  const firstWeeks = $derived(growing.length > 0 && growing.every((a) => !collection.lastWatered(a.id)));
  let watering = $state<string | null>(null);
  /**
   * One line per plant given, dated today, as a place's "Water all" does. The stop keeps its place and its height: the
   * plants just watered stay on it as a done row with the stop's own Undo, so the stop below never slides under the
   * finger; and the toast says what was done without an Undo of its own, since it sits where the next stop's button was
   * (round fifty-five, 5; the first reviewer's findings 1 and 2).
   */
  async function waterHere(s: Stop, plants: Accession[]) {
    if (watering || !plants.length || !sheetsSettled) return; // the buttons say aria-disabled meanwhile, keeping keyboard focus (round sixty)
    watering = s.key;
    try {
      // The day at the tap, from the corrected clock: the day store looks once a minute, and a tap in the first minute after midnight took yesterday (round fifty-five, 5; both reviewers).
      const d = localDate();
      if (day.current !== d) day.current = d;
      const height = (document.getElementById(`stop-${s.key}`)?.getBoundingClientRect().height ?? 0);
      // The grower's own action, so a sighting of each plant, not an `auto` line (round fifty-eight).
      const ids = await collection.addEventsIds(plants.map((a) => ({ acc: a.id, d, t: 'water' as const, note: `from Today: ${s.place ? s.place.name : 'plants with no space'}` })));
      wateredHere.add(s.key, ids, plants.map((a) => ({ id: a.id, no: accNo(a), name: plantLabel(a) })), height);
      // The button gave way to the done row: focus goes to the row's Undo, else the stop's heading, before the toast is
      // raised, never to the page body (round sixty-one; the accessibility review, 2, still open from round fifty-nine).
      await tick();
      const stopEl = document.getElementById(`stop-${s.key}`);
      for (const sel of ['.row.done button', 'h3']) { const to = stopEl?.querySelector<HTMLElement>(sel); if (to) { to.focus(); break; } }
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
      openKey = key; // round 120: the space opens again, its ticks as they were
      toast.show(`Undone: ${w.ids.length} ${w.plants.some((p) => p.dry) ? 'line' : 'watering line'}${w.ids.length === 1 ? '' : 's'} removed.`);
      // The Undo went with its row: focus goes to the stop's Water button, back for the plants, else a resting row's,
      // else the stop's heading, never to the page body. Each in turn: one querySelector over the list returned the
      // first in page order, which was always the heading (round sixty; the outside review's A35).
      await tick();
      const stopEl = document.getElementById(`stop-${key}`);
      for (const sel of ['button.doneall', '.spacehead', 'h3']) {
        const to = stopEl?.querySelector<HTMLElement>(sel);
        if (to) { to.focus(); break; }
      }
    } catch (err) {
      toast.show(`Not undone: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    } finally {
      undoing = null;
    }
  }
  $effect(() => {
    const t = setInterval(() => void prune(), 30_000);
    return () => clearInterval(t);
  });
  /**
   * The done rows go after ten minutes. One that goes with focus on its Undo hands focus to its stop's heading, else the
   * section's, never to the page (round sixty-two; the outside review's A40: a keyboard user resting on Undo fell to <body>).
   */
  async function prune() {
    const at = document.activeElement as HTMLElement | null;
    const stopEl = at?.closest?.('.row.done') ? at.closest<HTMLElement>('li.stop') : null;
    wateredHere.prune();
    if (!stopEl) return;
    await tick();
    if (at?.isConnected && document.activeElement === at) return;
    const to = (stopEl.isConnected ? stopEl.querySelector<HTMLElement>('h3') : null) ?? document.getElementById('water-h');
    to?.focus();
  }
  /**
   * A row of chips draws its first 50, and says how many more: at 3,000 plants a stop drew about 2,000 chips, 18,200
   * elements and tasks of seconds (round sixty-one; the accessibility review, 15). The ones not drawn stay ticked, so the
   * button's count is still every plant ticked; "Show N more" draws them, to untick any.
   */
  const CHIPS = 50;
  let opened = $state(new Set<string>());
  /** "Show N more" goes with its own click: focus moves to the first chip it drew, its tick box or its link, so the next Tab is not back at the first stop (round sixty-two; the accessibility review, 5, the outside review's A37). */
  const openRow = async (k: string) => {
    const n = new Set(opened); n.add(k); opened = n;
    await tick();
    const chip = document.querySelector(`[data-row="${CSS.escape(k)}"]`)?.querySelectorAll(':scope > .chip, :scope > .look')[CHIPS] as HTMLElement | undefined; // a look row since round 120
    (chip?.matches('a') ? chip : chip?.querySelector<HTMLElement>('input, a'))?.focus();
  };
  const firstOf = <T,>(list: T[], k: string): T[] => (opened.has(k) || list.length <= CHIPS ? list : list.slice(0, CHIPS));
</script>

<!-- Each plant a chip with its full name (cultivar or cross) and a tick box inside a finger-sized label of its own,
     apart from the link: the 20 px box sat 6 px from the plant link, and a tap just off it opened the plant (round
     sixty; the grower review, 7; the accessibility review, 6; the outside review's A38). -->
{#snippet notes(s: Stop)}
{#if s.keptDry}
  <p class="row resting"><span class="lab">Kept dry this month by {s.place ? `${collection.conditions(s.place.id).from.dryMonths ?? s.place.name}'s` : 'its space\'s'} rule: {s.keptDry} plant{s.keptDry === 1 ? '' : 's'}, not counted as due</span></p>
{/if}
{#each s.ownRest as r, ri (r.why)}
  <p class="row resting ownrest" data-row="{s.key}-r{ri}"><span class="lab">Resting, not counted as due: {r.why}.</span> {#each firstOf(r.plants, `${s.key}-r${ri}`) as a (a.id)}<a class="chip" href={plantHref(a)}><b>{accNo(a)}</b> <i><PlantName plant={a} /></i> <span class="muted">{collection.wateringWords(a)}</span></a>{/each}{@render more(r.plants, `${s.key}-r${ri}`, false)}</p>
{/each}
{#if s.ahead.length}
  <p class="row ahead" data-row="{s.key}-a"><span class="lab">Watering dated ahead of today, so not counted as due</span> {#each firstOf(s.ahead, `${s.key}-a`) as a (a.id)}<a class="chip" href={plantHref(a)}><b>{accNo(a)}</b> <i><PlantName plant={a} /></i> <span class="muted">dated {collection.wateringAhead(a.id)}</span></a>{/each}{@render more(s.ahead, `${s.key}-a`, false)}</p>
{/if}
{/snippet}

{#snippet more(list: unknown[], k: string, ticks: boolean)}
  {#if list.length > CHIPS && !opened.has(k)}<button class="linkish morechips" type="button" onclick={() => void openRow(k)}>Show {list.length - CHIPS} more{ticks ? ' (ticked)' : ''}</button>{/if}
{/snippet}


<svelte:head><title>Today · Cultifolio</title></svelte:head>

<div class="page">
  <PageHead title="Today" sub="What needs you, space by space, then the nights ahead." />
  <HeldNote />

  <!-- What needs you first, the frost watch under it: at 390 px the first stop started 570 px down, after the frost card and a method paragraph (round sixty; the grower review, §3 and §4). -->
  <!-- While it waits, the section keeps most of a screen, so what is drawn under it (the footer) does not jump down when the stops arrive (round sixty-one; the accessibility review, 5). -->
  <section id="water" aria-labelledby="water-h" class:waiting={!collection.ready || (growing.length && !sheetsOnce) || example.entering || (example.seeding && !growing.length)}>
    <div class="secrule"><h2 id="water-h" tabindex="-1">By space</h2><div class="line"></div></div>
    <!-- The stops wait for the species sheets as their buttons did: a stop drawn before them reflowed as its resting plants
         moved to their own row, and the page shifted under the reader (round sixty-one; the accessibility review, 5). -->
    {#if collection.failed}
      <!-- A browser that refuses the collection's storage is said, not left opening (round sixty-seven; triage-66 R10, R45-23). -->
      <div class="notice err" role="alert" id="today-failed">{collection.failed}</div>
    {:else if !collection.ready || (growing.length && !sheetsOnce)}
      <p class="small muted">{collection.ready ? (sheetsSlow ? 'Still reading the species sheets…' : 'Reading the species sheets…') : 'Opening the collection…'}</p>
    {:else if !growing.length}
      <!-- Today with no plants is one step to adding one (round 107; the first hand-off's round 7): the button, not a line of
           instructions. -->
      <ExampleOffer><div class="emptybox" id="today-empty"><p class="muted" style="margin: 0 0 10px">No growing plants yet.</p><a class="btn pri" id="today-add" href="/plants/new" onclick={(e) => addLeavesExample(e, '/plants/new')}>{collection.accessions.length ? 'Add a plant' : 'Add your first plant'}</a></div></ExampleOffer>
    {:else if !stops.length}<!-- every growing plant is under a stop since round 120, so this is not reached with a plant -->
      <!-- What is true: no record meets the checks; not that every plant was watered. The outcome first, the rule one tap away (round sixty; the grower review, §3). -->
      <p class="small" id="nothing"><b>All caught up.</b> Nothing is past its watering rhythm.{#if nextDue}{' '}The next to come due is <a href={plantHref(nextDue.a)}>{accNo(nextDue.a)} {plantLabel(nextDue.a)}</a>, in {nextDue.days === 1 ? '1 day' : `${nextDue.days} days`}.{/if}</p>
      {#if firstWeeks}
        <!-- A new collection is quiet for its first weeks: say what will appear here and when, and how to start the count sooner (round sixty; the grower review, 6). -->
        <p class="small muted" id="first-weeks">No watering is recorded yet, so each plant is counted from the day it was added. Once a plant's rhythm passes, it is listed here under its space with a Water button, and so is a plant missed at an audit. To start the count sooner, press Water on a plant's page, or give "Last watered" when you add plants.</p>
      {/if}
    {:else}
      <!-- Round 120 (MYPLANTS 28): spaces, not a list of plants. One line of how many have something to look at; each space
           one row in walking order, those to look at first; the one open shows its plants with a tick each and one Done. -->
      <p class="small" id="today-count">{#if workPlaces || workNoPlace}<b>{workPlaces + (workNoPlace ? 1 : 0)} {workPlaces + (workNoPlace ? 1 : 0) === 1 ? 'space' : 'spaces'} to look at</b>, in your walking order.{:else}Nothing to look at; your spaces, in your walking order.{/if}</p>
      <ol class="stops spaces">
        {#each stops as s (s.key)}
          {@const ls = looks(s)}
          {@const open = isOpen(s) && !!ls.length && !s.watered}
          <li class="stop" class:quiet={!ls.length && !s.watered} class:open id="stop-{s.key}" style="--depth: {s.depth}">
            <div class="head">
              <h3 tabindex="-1"><button type="button" class="spacehead" aria-expanded={open} aria-controls="body-{s.key}" onclick={() => toggleOpen(s)} disabled={!ls.length || !!s.watered}>
                <span class="sname">{s.place ? s.place.name : 'No space'}</span><span class="sr">,</span>
                <span class="swhere muted small">{#if s.place?.parentId && collection.location(s.place.parentId)}{collection.location(s.place.parentId)?.name} · {/if}{s.n} growing{s.place && collection.children(s.place.id).length ? ' here and inside' : ''}</span>
                <span class="spacestate" class:has={!!ls.length}>{s.watered ? 'done' : pillOf(s)}</span>
              </button></h3>
              {#if s.place}<a class="spacelink small" href="/places/{s.place.id}" aria-label="{s.place.name}: its page">›</a>{/if}
            </div>
            {#if s.watered}
              {@const wn = s.watered.plants.filter((p) => !p.dry).length}
              {@const dn = s.watered.plants.length - wn}
              <!-- After Done the space is one line with its Undo; the Undo is here and only here. -->
              <div class="row done" data-row="{s.key}-d"><span class="lab">Done · {[wn ? `${wn} watered` : '', dn ? `${dn} left dry` : ''].filter(Boolean).join(', ')} · <button class="linkish" type="button" onclick={() => undoHere(s.key)} aria-disabled={undoing === s.key}>Undo</button></span></div>
            {/if}
            {#if !ls.length && !s.watered && (s.keptDry || s.ownRest.length || s.ahead.length)}<div class="notes">{@render notes(s)}</div>{/if}
            {#if open}
              <div class="body" id="body-{s.key}">
                {#if restUnread(s)}
                  <p class="row restnc"><NotChecked what="Resting months" why={`${sheetsClause[0].toUpperCase()}${sheetsClause.slice(1)}, so no plant here is set apart for its habitat's rest.`} /><span>: {sheetsClause}. Every plant past its rhythm is listed.</span> <button class="linkish" type="button" onclick={checkAgain} aria-disabled={!sheetsSettled || sheetsWait > 0}>{againWords(sheetsWhy, nowMs)}</button></p>
                {/if}
                <ul class="looks" data-row="{s.key}-l">
                  {#each firstOf(ls, `${s.key}-l`) as l (l.a.id)}
                    {@const cover = collection.cover(l.a.id)}
                    <li class="look" class:ticked={isTicked(l)}>
                      <label class="tickbox" for="w-{l.a.id}"><input type="checkbox" id="w-{l.a.id}" checked={isTicked(l)} onchange={(e) => setTick(l.a.id, (e.currentTarget as HTMLInputElement).checked)} aria-label="Water {accNo(l.a)} {plantLabel(l.a)}" /></label>
                      <button type="button" class="lookrow" aria-expanded={whyOpen.has(l.a.id)} aria-controls="why-{l.a.id}" onclick={() => toggleWhy(l.a.id)}>
                        {#if cover}<span class="th"><PhotoImg id={cover.id} alt="" loading="lazy" /></span>{/if}
                        <span class="lname"><b>{accNo(l.a)}</b> <i><PlantName plant={l.a} /></i><span class="lwhy small muted">{shortWhy(l)}</span></span>
                        <span class="ldays" class:due={l.why === 'past'}>{collection.lastWatered(l.a.id) ? dayWords(days(l.a)) : '–'}</span>
                      </button>
                      {#if whyOpen.has(l.a.id)}<p class="why small" id="why-{l.a.id}">{reasonOf(l)} <a href={plantHref(l.a)}>Its page</a></p>{/if}
                    </li>
                  {/each}
                </ul>
                {@render more(ls, `${s.key}-l`, true)}
                {@render notes(s)}
                {#if !sheetsSettled}<p class="nonetick small muted" id="why-{s.key}">{sheetsSlow ? 'Still reading the species sheets…' : 'Reading the species sheets first…'}</p>{/if}
                <button class="btn pri water doneall" type="button" onclick={() => doneHere(s)} aria-disabled={!!watering || !sheetsSettled} aria-describedby={!sheetsSettled ? `why-${s.key}` : undefined} title="A watering on each ticked plant and a looked-at, left-dry entry on each unticked one, dated today; Undo on the space takes them back">Done · {doneWords(ls)}</button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if !todo}
        <p class="small" id="nothing"><b>All caught up.</b> Nothing is past its watering rhythm.{#if nextDue}{' '}The next to come due is <a href={plantHref(nextDue.a)}>{accNo(nextDue.a)} {plantLabel(nextDue.a)}</a>, in {nextDue.days === 1 ? '1 day' : `${nextDue.days} days`}.{/if}</p>
        {#if firstWeeks}
          <p class="small muted" id="first-weeks">No watering is recorded yet, so each plant is counted from the day it was added. Once a plant's rhythm passes, its space shows it here to look at, with a tick and Done, and so does a plant missed at an audit. To start the count sooner, press Water on a plant's page, or give "Last watered" when you add plants.</p>
        {/if}
      {/if}
    {/if}
    {#if collection.ready && growing.length && sheetsOnce}
      <!-- The method, one tap away rather than before the first plant (round sixty; the grower review, §3). -->
      <details class="why howdecides" id="how-today">
        <summary>How Today decides</summary>
        <p class="small muted">A plant is listed when it is past its watering rhythm: {DUE_DAYS} days unless its space or the plant sets another. A plant with no watering recorded is counted from the day its record was made, and said so. A space's dry months keep its plants off the list, and so do a plant's own rest months, once you set or confirm its growing season on its page; it is listed as resting, with why, and no Water button. A species whose habitat is in its dry season now, by the rain rule of its species sheet, is listed apart, to water only if you want to; under {ruleRain(120, units.current)} of rain a year the sheet reads the habitat's year by temperature instead, and a plant is listed apart in its habitat's warmer six months. A plant missed at an audit, or not seen for ninety days since its space's audit, is listed too. Spaces come in the order they are kept, spaces inside after their parent, those with something to look at first. A plant past its rhythm opens ticked; one listed only for a look opens unticked. Done records a watering on each ticked plant and "looked at, left dry" on each unticked one. Left dry, a plant is off this list for half its rhythm, and at least three days; it does not change "since watered". "You have watered it about every N days" is the middle of its last waterings' gaps, up to six, said with three or more; it changes nothing here.</p>
      </details>
    {/if}
  </section>

  <!-- The frost watch and "Also today" wait for the collection, as the footer does: drawn under "Opening the collection…",
       they were pushed off the screen by the stops, a shift of 0.15 on a phone (round sixty-one; the accessibility review, 5). -->
  <!-- Nor while the page is on its way into the example, or the example is being set out: the empty page's sections would be drawn and gone (round sixty-three, V2). -->
  {#if collection.ready && (!growing.length || sheetsOnce) && !example.entering && !(example.seeding && !growing.length)}
  <!-- Round 120 (MYPLANTS 28): frost first when the watch has something to say (the grid's order). -->
  <section id="frost" aria-labelledby="frost-h" class:first={!!data && data.risk.level !== 'none'}>
    <div class="secrule"><h2 id="frost-h">Frost watch</h2><div class="line"></div></div>
    {#if !site.current && site.loaded}
      <!-- One tap from here, as the front page's line offers: in the sample Settings is shut, and "Set your site in Settings" led nowhere (round sixty-two; the grower review, 11); so in the sample the link is not offered (the verification review's words 7). -->
      <!-- The example has no site of its own, and none is made up for it: a real place would be a forecast for a place
           nobody chose (round sixty-seven; triage-66 V8). It says so, and where the visitor's own is set once they leave. -->
      {#if PAGE_IN_DEMO}
        <p class="small muted froststrip" id="frost-example">The example collection has no site of its own, so the frost watch reads no forecast here. Once you leave the example, set your site on Today with Use my location, or in Settings, and its forecast appears on Today, on the front page and under the top bar when it turns.</p>
      {:else}
        <!-- The reason before the browser asks, and a town instead (round 107; the first hand-off's round 7). -->
        <p class="small muted whyline" id="frost-why">{LOCATION_WHY}</p>
        <p class="small muted froststrip">No site set. <button class="linkish" type="button" onclick={locate} aria-disabled={locating}>{locating ? 'Locating…' : 'Use my location'}</button>, type a town below, or <a href="/settings#site">set your site in Settings</a>, and its forecast appears here, on the front page and under the top bar when it turns{#if watched.length}; spaces with coordinates are watched on their own pages either way{/if}.</p>
        <TownSearch id="frost-town" onpick={(p) => { site.set({ lat: p.lat, lon: p.lon, name: p.short }); void frost.check(true); }} />
      {/if}
    {/if}
    {#if locateMsg}<p class="small muted">{locateMsg}</p>{/if}
    {#if err}<div class="notice" role="status">{err}</div>{/if}
    {#if busy && !data}<p class="small muted">Reading the forecast…</p>{/if}
    {#if data}
      <!-- A one-line strip while the nights are clear, the full card when frost or cold is forecast; the nights fold under either (round sixty; the grower review, §4). -->
      {@const loud = data.risk.level !== 'none'}
      {#if loud}<div class="risk card {data.risk.level}">{data.risk.text}</div>{/if}
      <details class="nights" class:strip={!loud} open={loud}>
        <!-- The folded strip says the alerts were not checked too, not only the nights inside it: a clear night's line with
             the NWS silent read as an all-clear until it was opened (round sixty-nine; triage-68 P1, R46-6). -->
        <summary>{#if loud}The next {data.forecast.days.length} nights{:else}<span class="risk none">{data.risk.text}</span>{#if alertsUnchecked(data.alertsStatus)}<span class="unchecked">{' '}Alerts not checked.</span>{/if}{/if}</summary>
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
        {:else if alertsUnchecked(data.alertsStatus)}
          <!-- Each in its own words, from the one reading the place page uses too (round sixty-nine; triage-68 P1). -->
          {@const why = alertsWhy(data.alertsStatus)}
          <p class="small"><NotChecked what="Alerts" why="{why.charAt(0).toUpperCase()}{why.slice(1)}; the forecast above stands on its own." /></p>
        {:else if data.alertsStatus === 'none'}
          <p class="small muted">No frost or freeze alert in force (NOAA/NWS).</p>
        {/if}
        <p class="faint small">The forecast covers the next {data.forecast.hoursCovered} hours; a night at the end of it is partial. {data.attribution.join(' · ')}. Fetched {data.forecast.fetched.slice(0, 16).replace('T', ' ')} UTC for {data.lat}, {data.lon}.</p>
      </details>
    {/if}
    {#if site.current}
      <p class="small muted">Your site: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/settings#site">change in Settings</a>.{#if watched.length}{' '}Watched spaces, each with its own forecast on its page: {#each watched as w, i}{i ? ', ' : ''}<a href="/places/{w.id}">{w.name}</a>{/each}.{/if}</p>
    {/if}
  </section>

  <section id="rest" aria-labelledby="rest-h">
    <div class="secrule"><h2 id="rest-h">Also today</h2><div class="line"></div></div>
    <Firsts />
    <FloweredBefore />
    <Today where="today" />
    <CalendarExport />
  </section>
  {/if}
</div>

<style>
  /* "Also today" is drawn only when something under it is (round sixty): its parts each render nothing when they have nothing. */
  #rest:not(:has(> :global(:not(.secrule)))) { display: none; }
  /* One column that may shrink to the screen: an auto column took the width of its widest line at 200% text and the page scrolled sideways (round fifty-nine). */
  .page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.2rem; }
  #water { order: 2; }
  #frost { order: 3; }
  #frost.first { order: 1; }
  #rest { order: 4; }
  section { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.6rem; }
  section.waiting { min-height: 80vh; align-content: start; }
  /* The night's risk as a line with a rule in its colour, not a tinted box (DESIGN-87; round eighty-seven's stage-3
     integration): ink on the page, so the words keep AA whatever the tint. */
  .risk { padding: 0.4rem 0 0.4rem 0.8rem; }
  .risk.card { background: none; border: 0; border-left: 3px solid var(--rule); border-radius: 0; box-shadow: none; color: var(--ink); }
  .risk.frost, .risk.warning { border-left-color: var(--bad); font-weight: 600; }
  .risk.cold { border-left-color: var(--warm); }
  tr.frost td { color: var(--bad); font-weight: 600; }
  tr.cold td { color: var(--warm-ink); }
  .alerts { padding-left: 1.1rem; }
  .small { font-size: var(--fs-md); }
  .stops { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .stop { box-sizing: border-box; background: transparent; border-radius: 0; border-top: 1px solid var(--rule); padding: 10px 0 10px calc(var(--depth) * 14px); }
  .stop .head { display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 6px 10px; } /* the button never off the screen at a large text size (round fifty-nine): the name beside it wraps within itself (round eighty-seven) */
  /* The name takes the line and wraps within itself, so the button stays beside it whatever the face: with the button
     wrapping on the name's whole width, the web font's arrival moved the button and every row under it (round
     eighty-seven; r63v V2's layout shift, 0.12 at 390 px). */
  .stop h3 { min-width: 0; margin: 0; font-size: var(--fs-base); font-weight: 600; flex: 1 1 auto; overflow-wrap: anywhere; }
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
  /* Round eighty-seven, stage-3 integration (DESIGN-87: no chips): each plant is its tick box, number and name as plain
     words, a finger tall, set apart by space, not a bordered box. Its width leaves room for the space after it, which
     pushed a page 2 px sideways at 320 px with 200% text (r61a a11y-perf 7). */
  .chip { display: inline-flex; align-items: center; gap: 6px; margin: 4px 18px 0 0; padding: 4px 0; min-height: var(--tap); max-width: calc(100% - 18px); border: 0; border-radius: 0; background: none; color: var(--ink); text-decoration: none; vertical-align: middle; font-variant-numeric: tabular-nums lining-nums; }
  a.chip:hover { text-decoration: underline; }
  .chip i { color: var(--ink2); }
  .chip b, .chip .muted { white-space: nowrap; }
  /* Room for the italic's overhang inside the clipped box: "Lithops lesliei" drew as "Lithops leslie" with its last letter cut (round sixty-seven; triage-66 P6, S-F13). */
  .chip i { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; min-width: 0; padding-inline-end: 0.15em; }
  /* A done chip's parts wrap inside it, as a ticked chip's do: at 320 px with 200% text "Conophytum minimum ✓" pushed the page 4 px sideways (round sixty-two; the accessibility review, 9). */
  .restnc { border-left-color: var(--warm); }
  .restnc .linkish { min-height: var(--tap); margin-left: 4px; color: var(--accent); }
  /* The box's own target, a finger wide and tall, apart from the plant link (round sixty; the accessibility review, 6). */
  .nonetick { margin-left: 6px; font-size: var(--fs-sm); }
  .howdecides { margin-top: 6px; }
  .howdecides p { margin: 4px 0 0; }
  .nights.strip > summary { font-weight: 400; color: var(--ink2); }
  .risk.none { padding: 0; }
  .nights.strip .unchecked { color: var(--warm-ink); font-weight: 600; }
  .donemark { cursor: default; background: none; color: var(--accent); }
  .row.done { border-left-color: var(--accent); }
  .row.done .lab { color: var(--accent); font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
  .stop { scroll-margin-bottom: 96px; } /* clear of the tab bar when a control is scrolled to (the second reviewer's phone check) */
  .btn.water { min-height: 44px; } /* a thumb's width */
  .nights > summary { cursor: pointer; font-size: var(--fs-md); font-weight: 600; color: var(--ink2); padding: 4px 0; }
  .muted { color: var(--ink3); }
  .morechips { margin: 4px 6px 0 0; min-height: var(--tap); color: var(--accent); font-weight: 600; }
  @media (max-width: 640px) {
    /* The section follows the head straight away: the head's margin, the grid's gap and the rule's own top margin stood 65 px empty above "By place" (round sixty-two; the outside review's A40). */
    .page > :global(.phead) { margin-bottom: 0; }
    #water > .secrule { margin-top: 0; }
    .stop { padding: 8px 0 8px calc(var(--depth) * 8px); }
    .row { font-size: var(--fs-md); }
  }
  /* Round 120 (MYPLANTS 28): each space one row, its pill and a chevron; the open one shows its plants, a tick each, and Done. */
  .spaces .stop { border: 1px solid var(--rule); border-radius: var(--r); padding: 0; background: var(--bg); }
  .spaces .stop.open { border-color: var(--ink); }
  .spaces .stop.quiet .sname { font-weight: 400; color: var(--ink2); }
  .spaces .head { padding: 0; }
  .spaces h3 { flex: 1 1 auto; }
  .spacehead { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'n p' 'w p'; align-items: center; gap: 0 10px; width: 100%; min-height: 56px; padding: 10px 14px; border: 0; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
  .spacehead:disabled { cursor: default; opacity: 1; }
  .spacehead .sname { grid-area: n; font-weight: 600; }
  .spacehead .swhere { grid-area: w; font-weight: 400; }
  /* The state in words, not in a box (DESIGN-87; r87s3 3): what is to look at in the warm ink, the rest muted. */
  .spacehead .spacestate { grid-area: p; font-size: var(--fs-sm); font-weight: 500; color: var(--ink3); white-space: nowrap; }
  .spacehead .spacestate.has { color: #9a5b12; font-weight: 600; }
  .spacelink { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); margin-right: 4px; color: var(--ink3); text-decoration: none; font-size: 1.3em; }
  .spaces .row.done { margin: 0 14px 10px; }
  .body { border-top: 1px solid var(--rule); padding: 0 14px 14px; }
  .looks { list-style: none; margin: 0; padding: 0; }
  .look { display: grid; grid-template-columns: var(--tap) minmax(0, 1fr); align-items: center; border-bottom: 1px solid var(--rule2); }
  .look .tickbox { display: inline-flex; align-items: center; justify-content: center; min-width: var(--tap); min-height: var(--tap); cursor: pointer; }
  .look .tickbox input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); }
  .lookrow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 56px; padding: 6px 0; border: 0; background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
  .lookrow .th { width: 44px; height: 44px; border-radius: var(--r-sm); overflow: hidden; }
  .lookrow .th :global(img) { width: 100%; height: 100%; object-fit: cover; }
  .lookrow:not(:has(.th)) { grid-template-columns: minmax(0, 1fr) auto; }
  .lname { display: grid; min-width: 0; }
  .lname i { overflow-wrap: anywhere; }
  .ldays { font-variant-numeric: tabular-nums; color: var(--ink2); }
  .ldays.due { color: #9a5b12; font-weight: 600; }
  .look .why { grid-column: 2; margin: 0 0 10px; padding: 10px 12px; border-radius: var(--r-sm); background: var(--sunk); }
  .notes { padding: 0 14px 8px; }
  .doneall { width: 100%; margin-top: 12px; min-height: 48px; }
  @media (min-width: 1024px) {
    /* On a desktop the spaces are a list at the left and the open space fills the right. */
    .spaces { grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); align-items: start; }
    .spaces .stop { grid-column: 1; }
    .spaces .stop.open { display: contents; }
    .spaces .stop.open > .head { grid-column: 1; border: 1px solid var(--ink); border-radius: var(--r); }
    .spaces .stop.open > .body { grid-column: 2; grid-row: 1 / span 40; border: 1px solid var(--rule); border-radius: var(--r); padding-top: 4px; }
  }
</style>

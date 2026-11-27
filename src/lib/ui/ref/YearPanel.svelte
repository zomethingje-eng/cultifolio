<script lang="ts" module>
  /** The site's months read on this page, by site (round 127): Greenhouse draws them only when Outdoors has read them. */
  const siteRead = new Map<string, unknown>();
</script>

<script lang="ts">
  /**
   * The year at the habitat (round 118; SPECIES 19): three charts and four thin rows on one month axis, each on its own
   * scale with its spread (10th to 90th percentile) drawn; the current month shaded through all of them, its figure at the
   * right; Chart | Table; and the year in two halves in sentences, made by rule from the table. Every figure is the page's
   * own (CHELSA's months across the range; the day length is arithmetic on the typical cell's latitude). The charts are
   * drawn for the eye; the table is their text, named so for assistive technology.
   */
  import { tempN, tempUnit, rain, rainUnit, type Units } from '$core/units';
  import { dayLengths } from '$climate/day-length';
  import { yearHalves } from '$climate/year-halves';
  import { site as siteStore } from '$lib/ui/site.svelte';
  import { siteClimate, type SiteMonth } from '$climate/site-climate';
  import { outdoorsLines, CLOSING } from '$climate/lens-outdoors';
  import { LENS_VIEWS, openingView, viewOfPath, greenhouseLines, windowsillLines, lightsLines, lampTable, lampCell, molADay, GLASS, LAMP_HOURS, isLensView, speciesLines, otherShift, type LensView } from '$climate/lens-spaces';
  import { searchCatalogue, type Found } from '$lib/ui/index.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { readSetting, writeSetting } from '$lib/ui/stored';
  import type { Accession, Location } from '$lib/db/types';
  type M = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number; vpdKpa?: number; windMs?: number };
  type YearRead = { grow: string; fog: boolean; frozen: boolean; growMonths: number[] } | null;
  let { months, p10, p90, lat, shift = 0, floorC = null, units, year = null, dossierKey, name, src, plants = [], slug = '' }: {
    months: M[]; p10: M[]; p90: M[]; lat: number; shift?: number; floorC?: number | null; units: Units; year?: YearRead; dossierKey: string; name: string; src: string;
    /** The reader's plants of this species (round 127): the view opens on the space of the one written last. */
    plants?: Accession[];
    /** The page's address name, for the full comparison's link (round 128). */
    slug?: string;
  } = $props();

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /** The fixed spans of the thin rows across every page (the corpus's 1st to 99th percentile rounded out; /about/how). */
  const SPANS = { day: [0, 24], rh: [40, 75], vpd: [0, 2], wind: [0, 6] } as const;
  let view = $state<'chart' | 'table'>('chart');
  let mine = $state(true);
  /** The 10th–90th span is shown only where it differs from the median, as the month table showed it (rounds 61 to 117). */
  const spread = (med: unknown, lo: unknown, hi: unknown) => lo != null && hi != null && lo !== '' && hi !== '' && !(String(lo) === String(med) && String(hi) === String(med)) && !String(lo).includes('–') && !String(hi).includes('–');
  const s = $derived(mine ? shift : 0);
  /** The habitat month (0 to 11) shown in column k. */
  const hm = (k: number) => (k + s) % 12;
  const now = new Date().getMonth();
  const days = $derived(dayLengths(lat));
  const col = (f: (m: M) => number | undefined, set: M[]) => Array.from({ length: 12 }, (_, k) => f(set[hm(k)]));
  const T = (c: number) => Number(tempN(c, units, 1));
  const tu = $derived(tempUnit(units));

  /**
   * The lens (round 126; SPECIES 20): "Compare with" sets the reader's place over the habitat's figures. This round draws
   * Outdoors: the reader's site, from Settings, its months from the site's own climate tiles (CHELSA V2.1 1981–2010, the
   * same grid as the habitat's; only the one-degree square is asked of this site). The months are held on the reader's.
   */
  let lens = $state<LensView>('none');
  let siteData = $state<SiteMonth[] | 'sea' | 'unreached' | 'loading' | null>(null);
  let siteTry = $state(0);
  const siteKey = (c: { lat: number; lon: number }) => `${c.lat},${c.lon}`;
  $effect(() => {
    void siteTry;
    const c = siteStore.current;
    if (!c || (lens !== 'outdoors' && lens !== 'greenhouse')) { siteData = null; return; }
    // Greenhouse asks nothing: it draws the site's nights only when Outdoors has read the square on this page.
    if (lens === 'greenhouse') { const k = siteRead.get(siteKey(c)); siteData = Array.isArray(k) ? (k as SiteMonth[]) : null; return; }
    let gone = false;
    siteData = 'loading';
    void siteClimate(c.lat, c.lon).then((r) => { if (Array.isArray(r)) siteRead.set(siteKey(c), r); if (!gone) siteData = r; });
    return () => { gone = true; };
  });
  $effect(() => { if (lens !== 'none' && lens !== 'species') mine = true; });

  /**
   * The views that read the reader's spaces (round 127; SPECIES 20): Greenhouse, Windowsill, Under lights. A space's kind
   * is its own or the nearest above it; its conditions are inherited as everywhere (collection.conditions). Which view
   * opens: the space of the reader's plant of this species written last; else the view used last on this device
   * (cultifolio.lensView); else Nothing. Nothing about a space leaves the device.
   */
  const kindsAt = (id: string): Array<string | null> => collection.locationPath(id).reverse().map((l) => l.type ?? null);
  type SpaceIn = { l: Location; kinds: Array<string | null>; c: ReturnType<typeof collection.conditions> };
  const spaces = $derived<SpaceIn[]>(collection.ready ? collection.locations.map((l) => ({ l, kinds: kindsAt(l.id), c: collection.conditions(l.id) })) : []);
  const lampOf = (x: SpaceIn) => (x.c.lightHours != null && x.c.ppfd != null ? x.c.lightHours : null);
  const viewOf = (x: SpaceIn) => viewOfPath(x.kinds, lampOf(x));
  const growing = $derived(collection.ready ? plants.filter((a) => a.status === 'growing') : []);
  const plantSpace = (a: Accession) => (a.locationId ? spaces.find((x) => x.l.id === collection.placeOf(a.locationId!)) ?? null : null);
  let opened = false;
  $effect(() => {
    if (opened || !collection.ready) return;
    opened = true;
    const o = openingView(growing.map((a) => { const sp = plantSpace(a); return { space: sp ? { kind: viewOf(sp) === 'lights' ? 'shelf' : (sp.kinds.find((k) => k === 'garden' || k === 'outdoor' || k === 'greenhouse' || k === 'coldframe' || k === 'windowsill') ?? sp.kinds.find((k) => k) ?? null), lampHours: lampOf(sp) } : null, latest: collection.events(a.id)[0]?.d ?? a.acquired ?? '' }; }), readSetting('cultifolio.lensView', 'device'));
    if (o.view === 'outdoors' && !siteStore.current && o.from === 'last') return;
    lens = o.view;
    if (o.from === 'plant') { const sp = plantSpace(growing[o.index]); if (sp) spaceId = sp.l.id; }
  });
  const pick = (v: LensView) => { lens = v; writeSetting('cultifolio.lensView', 'device', v); };
  let spaceId = $state<string | null>(null);
  const fits = $derived(spaces.filter((x) => viewOf(x) === lens));
  const here = $derived(fits.find((x) => x.l.id === spaceId) ?? fits[0] ?? null);
  const fmtT = (c: number) => `${tempN(c, units, 1)} ${tempUnit(units)}`;
  const fmtD = (c: number) => `${units === 'us' ? (c * 1.8).toFixed(1) : c.toFixed(1)} ${tempUnit(units)}`;
  const sp = $derived(here ? { name: here.l.name, id: here.l.id, ...here.c } : null);
  const ghLines = $derived(lens === 'greenhouse' && sp?.floorC != null ? greenhouseLines({ heldC: sp.floorC, held: sp.floorHeld, floorC, habitat: months, temp: fmtT, dtemp: fmtD }) : []);
  const wsLines = $derived(lens === 'windowsill' && sp ? windowsillLines({ ppfd: sp.ppfd, hours: sp.lightHours, nightC: sp.floorC, habitat: months, temp: fmtT, dtemp: fmtD }) : []);
  const ltLines = $derived(lens === 'lights' && sp ? lightsLines({ ppfd: sp.ppfd, hours: sp.lightHours, habitat: months, days, temp: fmtT, dtemp: fmtD }) : []);
  const table = $derived(lens === 'lights' ? lampTable(months) : null);
  const mark = $derived(table && sp ? lampCell(table, sp.ppfd, sp.lightHours) : null);
  /** The space's held temperature, drawn solid across Temperature; its light as mol a day across Light. */
  const heldT = $derived(lens === 'greenhouse' && sp?.floorC != null ? T(sp.floorC) : null);
  const spaceMol = $derived((lens === 'windowsill' || lens === 'lights') && sp?.ppfd != null && sp.lightHours != null ? molADay(sp.ppfd, sp.lightHours) : null);
  /**
   * Another species (round 128; SPECIES 20): a search with the header search's own answers (the catalogue's /api/search,
   * the words typed and nothing else), the species picked read from its page's JSON as any visitor's browser reads it.
   * Its medians are drawn dashed, without bands, each species in its own season: where the typical cells lie in different
   * hemispheres its months are moved six, and the card says so.
   */
  type Other = { name: string; slug: string; months: M[]; floorC: number | null; lat: number };
  let spQ = $state('');
  let spHits = $state<Found[]>([]);
  let spOther = $state<Other | 'loading' | 'none' | 'unreached' | null>(null);
  $effect(() => {
    const q = spQ.trim();
    if (lens !== 'species' || q.length < 2) { spHits = []; return; }
    let gone = false;
    const t = setTimeout(() => { void searchCatalogue(q, 8).then((r) => { if (!gone) spHits = Array.isArray(r) ? r.filter((h) => h.key !== dossierKey).slice(0, 8) : []; }); }, 250);
    return () => { gone = true; clearTimeout(t); };
  });
  async function pickOther(h: Found) {
    spHits = []; spQ = h.name; spOther = 'loading';
    try {
      const r = await fetch(`/api/dossier/${h.key}`);
      if (!r.ok) { spOther = 'unreached'; return; }
      const j = (await r.json()) as { climate?: { status?: string; months?: M[]; extremes?: { minP01?: number }; at?: { lat?: number } } };
      const c = j?.climate;
      spOther = c?.status === 'ok' && Array.isArray(c.months) && c.months.length === 12 ? { name: h.name, slug: h.slug, months: c.months, floorC: c.extremes?.minP01 ?? null, lat: c.at?.lat ?? 0 } : 'none';
    } catch { spOther = 'unreached'; }
  }
  const oth = $derived(lens === 'species' && spOther && typeof spOther === 'object' ? spOther : null);
  const oS = $derived(oth ? otherShift(lat, oth.lat) : 0);
  /** The other's month drawn in column k: the same season as this habitat's month there. */
  const ocol = (f: (m: M) => number | undefined) => (oth ? Array.from({ length: 12 }, (_, k) => f(oth.months[(hm(k) + oS) % 12])) : null);
  const oDay = $derived(ocol((m) => T(m.tmax))), oNight = $derived(ocol((m) => T(m.tmin)));
  const oRain = $derived(ocol((m) => m.precipMm)), oDli = $derived(oth && oth.months.every((m) => m.dli != null) ? ocol((m) => m.dli) : null);
  const oDays = $derived(oth ? (() => { const d = dayLengths(oth.lat); return Array.from({ length: 12 }, (_, k) => d[(hm(k) + oS) % 12]); })() : null);
  const oRow = (k: string) => (k === 'day' ? oDays : k === 'rh' ? ocol((m) => m.rh) : k === 'vpd' ? ocol((m) => m.vpdKpa) : k === 'wind' ? ocol((m) => m.windMs) : null);
  const spLines = $derived(oth ? speciesLines({ name, other: oth.name, habitat: months, theirs: oth.months, floorC, theirFloorC: oth.floorC, temp: fmtT, mm: (n) => rain(n, units) }) : []);
  const KIND_WORD: Record<string, string> = { greenhouse: 'a greenhouse or cold frame', windowsill: 'a windowsill (or a room, shelf, bench or tray without a lamp)', lights: 'a room, shelf, bench or tray with a lamp' };
  const sm = $derived(Array.isArray(siteData) ? siteData : null);
  const sDay = $derived(sm ? sm.map((m) => T(m.tmax)) : null), sNight = $derived(sm ? sm.map((m) => T(m.tmin)) : null);
  const sRain = $derived(sm ? sm.map((m) => m.precipMm) : null);
  const sDays = $derived(sm && siteStore.current ? dayLengths(siteStore.current.lat) : null);
  const coldBelow = $derived(sm && floorC != null ? sm.map((m) => m.tmin < floorC!) : null);
  const lensLines = $derived(sm && siteStore.current ? outdoorsLines({ site: sm, siteLat: siteStore.current.lat, habitat: months, habitatLat: lat, floorC, temp: (c) => `${tempN(c, units, 1)} ${tempUnit(units)}`, mm: (n) => rain(n, units) }) : []);

  const W = 600, L = 46, R = 8;
  const x = (k: number) => L + ((k + 0.5) * (W - L - R)) / 12;
  const cw = (W - L - R) / 12;
  function scale(vals: number[], step: number, zero = false) {
    const ok = vals.filter((v) => Number.isFinite(v));
    let lo = Math.floor(Math.min(...ok) / step) * step, hi = Math.ceil(Math.max(...ok) / step) * step;
    if (zero) lo = Math.min(0, lo);
    if (hi === lo) hi = lo + step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { lo, hi, ticks };
  }
  const y = (v: number, sc: { lo: number; hi: number }, h: number, top = 6, bot = 6) => top + ((sc.hi - v) / (sc.hi - sc.lo)) * (h - top - bot);
  const path = (vals: Array<number | undefined>, sc: { lo: number; hi: number }, h: number) => vals.map((v, k) => (v == null || !Number.isFinite(v) ? '' : `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v, sc, h).toFixed(1)}`)).join('');
  const band = (lo: Array<number | undefined>, hi: Array<number | undefined>, sc: { lo: number; hi: number }, h: number) => {
    if (lo.some((v) => v == null) || hi.some((v) => v == null)) return '';
    const up = hi.map((v, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(v!, sc, h).toFixed(1)}`).join('');
    const down = lo.map((v, k) => [k, v] as const).reverse().map(([k, v]) => `L${x(k).toFixed(1)},${y(v!, sc, h).toFixed(1)}`).join('');
    return `${up}${down}Z`;
  };

  // Temperature: days and nights, each with its band, and the cold floor.
  const tDay = $derived(col((m) => T(m.tmax), months)), tNight = $derived(col((m) => T(m.tmin), months));
  const tDay10 = $derived(col((m) => T(m.tmax), p10)), tDay90 = $derived(col((m) => T(m.tmax), p90));
  const tN10 = $derived(col((m) => T(m.tmin), p10)), tN90 = $derived(col((m) => T(m.tmin), p90));
  const tSc = $derived(scale([...tDay90, ...tN10, ...(floorC != null ? [T(floorC)] : []), ...(sDay ?? []), ...(sNight ?? []), ...(heldT != null ? [heldT] : []), ...((oDay ?? []) as number[]), ...((oNight ?? []) as number[])] as number[], units === 'us' ? 10 : 5));
  // Rain: bars of the median, a whisker for the spread; the axis from zero.
  const rMm = $derived(col((m) => m.precipMm, months)), r10 = $derived(col((m) => m.precipMm, p10)), r90 = $derived(col((m) => m.precipMm, p90));
  const rTop = $derived(Math.max(...(r90 as number[]), ...(sRain ?? []), ...((oRain ?? []) as number[])));
  const rSc = $derived(scale([...(r90 as number[]), ...(sRain ?? []), ...((oRain ?? []) as number[])], rTop > 200 ? 100 : rTop > 60 ? 20 : 10, true));
  // Light: DLI with its band.
  const hasDli = $derived(months.every((m) => m.dli != null));
  const lDli = $derived(col((m) => m.dli, months)), l10 = $derived(col((m) => m.dli, p10)), l90 = $derived(col((m) => m.dli, p90));
  const lSc = $derived(hasDli ? scale([...(l10 as number[]), ...(l90 as number[]), ...(spaceMol != null ? [spaceMol] : []), ...((oDli ?? []) as number[])], 10, true) : null);
  // Thin rows on fixed spans.
  const rows = $derived([
    { k: 'day', label: 'Day length', unit: 'h', v: Array.from({ length: 12 }, (_, k) => days[hm(k)]), lo: null as Array<number | undefined> | null, hi: null as Array<number | undefined> | null, span: SPANS.day, d: 1 },
    { k: 'rh', label: 'Humidity', unit: '%', v: col((m) => m.rh, months), lo: col((m) => m.rh, p10), hi: col((m) => m.rh, p90), span: SPANS.rh, d: 0 },
    { k: 'vpd', label: 'Dryness of the air', unit: 'kPa', v: col((m) => m.vpdKpa, months), lo: col((m) => m.vpdKpa, p10), hi: col((m) => m.vpdKpa, p90), span: SPANS.vpd, d: 2 },
    { k: 'wind', label: 'Wind', unit: 'm/s', v: col((m) => m.windMs, months), lo: col((m) => m.windMs, p10), hi: col((m) => m.windMs, p90), span: SPANS.wind, d: 1 }
  ].filter((r) => r.v.every((v) => v != null)));
  const clamp = (v: number, sp: readonly [number, number]) => Math.max(sp[0], Math.min(sp[1], v));
  const fmt = (v: number | undefined, d: number) => (v == null ? '–' : v.toFixed(d));
  const now10 = (lo: Array<number | undefined> | null, hi: Array<number | undefined> | null, d: number) => (lo && hi && lo[now] != null && hi[now] != null ? `${fmt(lo[now], d)}–${fmt(hi[now], d)}` : '');

  // The halves, in sentences: days, nights, how far apart, the rain against the year's, humidity, light, day length.
  const halves = $derived(yearHalves(months, year));
  const yearRain = $derived(months.reduce((a, m) => a + m.precipMm, 0));
  const names = (ms: number[], shiftBy: number) => ms.map((m) => MON[(m - 1 + 12 - shiftBy) % 12]);
  const run = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs[0]} to ${xs[xs.length - 1]}`);
  const half = (h: NonNullable<typeof halves>[number]) => {
    const habit = run(h.months.map((m) => MON[m - 1]));
    const yours = s ? run(names(h.months, s)) : null;
    const word = h.kind === 'wet' ? 'The wet months' : h.kind === 'dry' ? 'The dry months' : h.kind === 'warmer' ? 'The warmer six months' : 'The cooler six months';
    const dl = h.months.map((m) => days[m - 1]);
    return `${word}, ${habit} at the habitat${yours ? ` (${yours} in your months)` : ''}: days of ${tempN(h.dayC, units, 0)} ${tu} and nights of ${tempN(h.nightC, units, 0)} ${tu}, ${units === 'us' ? Math.round((h.dayC - h.nightC) * 1.8) : Math.round(h.dayC - h.nightC)} ${tu} apart; ${rain(h.rainMm, units)} of the year's ${rain(yearRain, units)}${h.rh != null ? `; humidity ${Math.round(h.rh)}%` : ''}${h.dli != null ? `; light ${Math.round(h.dli)} DLI` : ''}; days ${Math.min(...dl).toFixed(1)} to ${Math.max(...dl).toFixed(1)} h long.`;
  };

  // The table as shown, as CSV, made here in the browser.
  function csv() {
    const head = ['month', 'habitat month', `day ${tu}`, `day p10`, `day p90`, `night ${tu}`, 'night p10', 'night p90', `rain ${rainUnit(units)}`, 'rain p10', 'rain p90', 'DLI', 'RH %', 'VPD kPa', 'wind m/s', 'day length h'];
    const lines = Array.from({ length: 12 }, (_, k) => { const h = hm(k); const m = months[h], a = p10[h], b = p90[h]; return [MON[k], MON[h], T(m.tmax), T(a.tmax), T(b.tmax), T(m.tmin), T(a.tmin), T(b.tmin), m.precipMm, a.precipMm, b.precipMm, m.dli ?? '', m.rh ?? '', m.vpdKpa ?? '', m.windMs ?? '', days[h]].join(','); });
    const blob = new Blob([`# ${name}, the habitat's months (median, 10th and 90th percentile across the range); ${src}\n${head.join(',')}\n${lines.join('\n')}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-months.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
</script>

<section class="yp" aria-labelledby="yp-h" id="year-panel">
  <!-- Where "At home, aim for" was (round 129; SPECIES 20): an address kept, so a link to #at-home lands on the panel. -->
  <span id="at-home" class="athome-anchor"></span>
  <div class="yphead">
    <div>
      <h3 id="yp-h">The year at the habitat</h3>
      <p class="small muted">The median of each month across the range, 10th to 90th percentile shaded; {src}.</p>
    </div>
    <div class="yps" role="group" aria-label="Chart or table">
      <button type="button" aria-pressed={view === 'chart'} onclick={() => (view = 'chart')}>Chart</button>
      <button type="button" aria-pressed={view === 'table'} onclick={() => (view = 'table')}>Table</button>
    </div>
    <div class="yps" role="group" aria-label="Compare with" id="lens-row">
      <span class="small muted lenslab">Compare with</span>
      {#each LENS_VIEWS as v (v.k)}<button type="button" aria-pressed={lens === v.k} onclick={() => pick(v.k)}>{v.label}</button>{/each}
    </div>
    {#if shift}
      <div class="yps" role="group" aria-label="Whose months">
        <button type="button" aria-pressed={mine} onclick={() => (mine = true)}>My months</button>
        <button type="button" aria-pressed={!mine} aria-disabled={lens !== 'none'} title={lens !== 'none' ? 'Held on your months while comparing: the year at your site is in your months' : undefined} onclick={() => { if (lens === 'none') mine = false; }}>Its months</button>
      </div>
    {/if}
  </div>

  {#if lens === 'outdoors'}
    <div class="lenscard" id="lens-card" role="status">
      {#if !siteStore.current}
        <p>Set your site in <a href="/settings#site">Settings</a> to compare.</p>
      {:else if siteData === 'loading' || siteData == null}
        <p class="muted">Reading your site's climate…</p>
      {:else if siteData === 'sea'}
        <p>Your site's cell holds no land climate in the grid (it reads as sea), so there is nothing to set beside the habitat's.</p>
      {:else if siteData === 'unreached'}
        <p>Your site's climate was not reached just now, so nothing is compared. <button type="button" class="linkish" onclick={() => siteTry++}>Try again</button></p>
      {:else}
        {#each lensLines as l (l.k)}<p id="lens-{l.k}">{l.text}</p>{/each}
        <p class="small muted">{CLOSING} Your site's figures: CHELSA V2.1, 1981–2010, the 0.05° cell holding your site{siteStore.current.name ? ` (${siteStore.current.name})` : ''}, drawn dashed; only the one-degree square around it was asked of this site.</p>
      {/if}
    </div>
  {:else if lens === 'species'}
    <div class="lenscard" id="lens-card">
      <label class="small lensspace" for="lens-sp-q">Another species</label>
      <input id="lens-sp-q" type="search" autocomplete="off" placeholder="A species' name" bind:value={spQ} oninput={() => { if (spOther && typeof spOther === 'object' && spQ !== spOther.name) spOther = null; }} aria-controls="lens-sp-hits" />
      {#if spHits.length}
        <ul class="lenshits" id="lens-sp-hits">{#each spHits as h (h.key)}<li><button type="button" class="linkish" onclick={() => pickOther(h)}>{h.name}</button>{#if h.common}<span class="small muted"> · {h.common}</span>{/if}</li>{/each}</ul>
      {/if}
      <div role="status">
        {#if spOther === 'loading'}<p class="muted">Reading its page…</p>
        {:else if spOther === 'none'}<p>Its page holds no habitat climate, so nothing is compared.</p>
        {:else if spOther === 'unreached'}<p>Its page was not reached just now, so nothing is compared.</p>
        {:else if oth}
          {#if oS}<p class="small muted" id="lens-sp-shift">{oth.name} grows wild in the other hemisphere: its months are moved six, so each is drawn in its own season.</p>{/if}
          {#each spLines as l (l.k)}<p id="lens-sp-{l.k}">{l.text}</p>{/each}
          <p class="small muted">{CLOSING} {oth.name}'s medians are drawn dashed, without their bands. <a href="/compare?s={slug},{oth.slug}" id="lens-sp-full">The full comparison</a></p>
        {:else}<p class="small muted">Type a name to set its habitat's year beside this one.</p>{/if}
      </div>
    </div>
  {:else if lens !== 'none'}
    <div class="lenscard" id="lens-card" role="status">
      {#if !collection.ready}
        <p class="muted">Opening your collection…</p>
      {:else if !here}
        <p id="lens-ask">Add {KIND_WORD[lens]} in <a href="/places">Spaces</a> to compare.</p>
      {:else}
        {#if fits.length > 1}
          <label class="small lensspace">Your space <select id="lens-space" bind:value={spaceId}>{#each fits as x (x.l.id)}<option value={x.l.id}>{x.l.name}</option>{/each}</select></label>
        {:else}
          <p class="small muted">Your space: {here.l.name}</p>
        {/if}
        {#if lens === 'greenhouse'}
          {#if sp?.floorC == null}
            <p id="lens-ask">Set the temperature {here.l.name} is held at, or bottoms out at, on <a href="/places/{here.l.id}">its page</a> to compare.</p>
          {:else}
            {#each ghLines as l (l.k)}<p id="lens-{l.k}">{l.text}</p>{/each}
            {#each lensLines.filter((l) => l.k === 'floor') as l (l.k)}<p id="lens-site">Outdoors, {l.text.charAt(0).toLowerCase()}{l.text.slice(1)}</p>{/each}
            <p class="small muted">{GLASS}</p>
          {/if}
        {:else if lens === 'windowsill'}
          {#each wsLines as l (l.k)}<p id="lens-{l.k}">{l.text}</p>{/each}
          {#if sp?.ppfd == null || sp.lightHours == null}<p id="lens-ask">Set the light at {here.l.name} and its hours on <a href="/places/{here.l.id}">its page</a> (in µmol/m²/s or lux) to compare its light.</p>{/if}
          {#if sp?.floorC == null}<p id="lens-ask-night">Set {here.l.name}'s coldest temperature on <a href="/places/{here.l.id}">its page</a> to compare its winter night.</p>{/if}
          {#if wsLines.length}<p class="small muted">mol a day = µmol/m²/s × hours × 3,600 ÷ 1,000,000; the habitat's light is under open sky.</p>{/if}
        {:else if lens === 'lights'}
          {#each ltLines as l (l.k)}<p id="lens-{l.k}">{l.text}</p>{/each}
          {#if sp?.ppfd == null || sp.lightHours == null}<p id="lens-ask">Set your lamp's light at the plant and its hours on <a href="/places/{here.l.id}">{here.l.name}'s page</a> to mark it in the table.</p>{/if}
        {/if}
        <p class="small muted">{CLOSING} Your figures are the space's own, or the nearest space above it that sets them, and stay on this device.</p>
      {/if}
      {#if lens === 'lights' && table}
        <div class="scroll-x" role="region" aria-label="Light at the plant for the habitat's darkest month">
          <table class="wx lamptable" id="lamp-table">
            <thead><tr><th scope="col">µmol/m²/s at the plant</th>{#each LAMP_HOURS as h (h)}<th scope="col">{h} h</th>{/each}</tr></thead>
            <tbody>{#each table.rows as r, i (r.label)}<tr><th scope="row">{r.label}</th>{#each r.cells as c, j (j)}<td class:mine={mark?.[0] === i && mark?.[1] === j}>{c}{#if mark?.[0] === i && mark?.[1] === j}<span class="sr"> (your lamp)</span>{/if}</td>{/each}</tr>{/each}</tbody>
          </table>
        </div>
        <p class="small muted">Its darkest month, {table.dark.toFixed(1)} mol a day, is the least light the habitat's open sky gives in any month, and a lamp is usually held at one setting. µmol/m²/s = mol a day × share × 1,000,000 ÷ (hours × 3,600).</p>
      {/if}
    </div>
  {/if}
  {#if view === 'chart'}
    <div class="charts" aria-hidden="true">
      <svg viewBox="0 0 {W} 30" class="axis">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="30" class="nowcol" />
        {#each MON as m, k (k)}<text x={x(k)} y="12" text-anchor="middle">{m}</text>{#if s}<text x={x(k)} y="26" text-anchor="middle" class="hab">{MON[hm(k)]}</text>{/if}{/each}
      </svg>
      <p class="chartname">Temperature, {tu} <span class="key"><span class="kd">— days</span> <span class="kn">- - nights</span>{floorC != null ? ' · dotted: the cold floor' : ''}</span> <span class="nowfig">now {tDay[now]} / {tNight[now]} {tu}</span></p>
      <svg viewBox="0 0 {W} 130">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="130" class="nowcol" />
        {#each tSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, tSc, 130)} y2={y(t, tSc, 130)} class="grid" /><text x={L - 6} y={y(t, tSc, 130) + 4} text-anchor="end">{t}</text>{/each}
        <path d={band(tDay10, tDay90, tSc, 130)} class="bandw" />
        <path d={band(tN10, tN90, tSc, 130)} class="bandc" />
        <path d={path(tDay, tSc, 130)} class="linew" />
        <path d={path(tNight, tSc, 130)} class="linec dashed" />
        {#if floorC != null}<line x1={L} x2={W - R} y1={y(T(floorC), tSc, 130)} y2={y(T(floorC), tSc, 130)} class="floor" />{/if}
        {#if sDay && sNight}<path d={path(sDay, tSc, 130)} class="sitew" /><path d={path(sNight, tSc, 130)} class="sitec" />{/if}
        {#if oDay && oNight}<path d={path(oDay, tSc, 130)} class="sitew" /><path d={path(oNight, tSc, 130)} class="sitec" />{/if}
        {#if heldT != null}<line x1={L} x2={W - R} y1={y(heldT, tSc, 130)} y2={y(heldT, tSc, 130)} class="heldline" />{/if}
        {#if coldBelow}{#each coldBelow as b, k (k)}{#if b}<rect x={x(k) - cw * 0.4} y="124" width={cw * 0.8} height="5" class="belowfloor" />{/if}{/each}{/if}
      </svg>
      <p class="chartname">Rain, {rainUnit(units)} <span class="nowfig">now {rain(rMm[now] ?? 0, units)} ({rain(r10[now] ?? 0, units)}–{rain(r90[now] ?? 0, units)})</span></p>
      <svg viewBox="0 0 {W} 100">
        <rect x={x(now) - cw / 2} y="0" width={cw} height="100" class="nowcol" />
        {#each rSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, rSc, 100)} y2={y(t, rSc, 100)} class="grid" /><text x={L - 6} y={y(t, rSc, 100) + 4} text-anchor="end">{units === 'us' ? (t / 25.4).toFixed(1) : t}</text>{/each}
        {#each rMm as v, k (k)}<rect x={x(k) - cw * 0.3} width={cw * 0.6} y={y(v ?? 0, rSc, 100)} height={Math.max(0, y(0, rSc, 100) - y(v ?? 0, rSc, 100))} class="barc" /><line x1={x(k)} x2={x(k)} y1={y(r90[k] ?? 0, rSc, 100)} y2={y(r10[k] ?? 0, rSc, 100)} class="whisk" />{/each}
        {#if oRain}{#each oRain as v, k (k)}{#if v != null}<line x1={x(k) - cw * 0.38} x2={x(k) + cw * 0.38} y1={y(v, rSc, 100)} y2={y(v, rSc, 100)} class="siterain" />{/if}{/each}{/if}
        {#if sRain}{#each sRain as v, k (k)}<line x1={x(k) - cw * 0.38} x2={x(k) + cw * 0.38} y1={y(v, rSc, 100)} y2={y(v, rSc, 100)} class="siterain" />{/each}{/if}
      </svg>
      {#if lSc}
        <p class="chartname">Light, DLI under open sky <span class="small muted">the year's mean {fmt((lDli as number[]).reduce((t: number, v: number) => t + v, 0) / 12, 1)} mol a day</span> <span class="nowfig">now {fmt(lDli[now], 0)} ({fmt(l10[now], 0)}–{fmt(l90[now], 0)})</span></p>
        <svg viewBox="0 0 {W} 90">
          <rect x={x(now) - cw / 2} y="0" width={cw} height="90" class="nowcol" />
          {#each lSc.ticks as t (t)}<line x1={L} x2={W - R} y1={y(t, lSc, 90)} y2={y(t, lSc, 90)} class="grid" /><text x={L - 6} y={y(t, lSc, 90) + 4} text-anchor="end">{t}</text>{/each}
          <path d={band(l10, l90, lSc, 90)} class="bandw" />
          <path d={path(lDli, lSc, 90)} class="linew" />
          {#if oDli}<path d={path(oDli, lSc, 90)} class="sitew" />{/if}
          {#if spaceMol != null}<line x1={L} x2={W - R} y1={y(spaceMol, lSc, 90)} y2={y(spaceMol, lSc, 90)} class="heldline" />{/if}
        </svg>
      {/if}
      {#each rows as r (r.k)}
        <p class="chartname thin">{r.label}, {r.unit} <span class="small muted">{fmt(Math.min(...(r.v as number[])), r.d)}–{fmt(Math.max(...(r.v as number[])), r.d)} over the year</span> <span class="nowfig">now {fmt(r.v[now], r.d)}{now10(r.lo, r.hi, r.d) ? ` (${now10(r.lo, r.hi, r.d)})` : ''}</span></p>
        <svg viewBox="0 0 {W} 38" class="thinsvg">
          <rect x={x(now) - cw / 2} y="0" width={cw} height="38" class="nowcol" />
          {#if r.lo && r.hi}<path d={band(r.lo.map((v) => clamp(v!, r.span)), r.hi.map((v) => clamp(v!, r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="bandc" />{/if}
          <path d={path(r.v.map((v) => clamp(v!, r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="linec" />
          {#if oRow(r.k)}<path d={path(oRow(r.k)!.map((v) => clamp(v ?? r.span[0], r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="sitec" />{/if}
          {#if r.k === 'day' && sDays}<path d={path(sDays.map((v) => clamp(v, r.span)), { lo: r.span[0], hi: r.span[1] }, 38)} class="sitec" />{/if}
        </svg>
      {/each}
    </div>
  {/if}

  {#if view === 'table'}
    <p class="small"><button type="button" class="linkish" onclick={csv}>CSV</button> · <a href="/api/dossier/{dossierKey}">JSON</a></p>
  {/if}
  <!-- The table is the charts' text: shown with Table, and read by assistive technology always. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll-x" class:sr={view === 'chart'} tabindex={view === 'table' ? 0 : -1} role="region" aria-label="Habitat climate by month">
    <table class="wx bymonth">
      <thead><tr><th scope="col">Month</th>{#if s}<th scope="col">At the habitat</th>{/if}<th scope="col">Day {tu}</th><th scope="col">Night {tu}</th><th scope="col">Apart {tu}</th><th scope="col">Rain {rainUnit(units)}</th><th scope="col">DLI</th><th scope="col">RH %</th><th scope="col">VPD kPa</th><th scope="col">Wind m/s</th><th scope="col">Day h</th></tr></thead>
      <tbody>
        {#each MON as mo, k (k)}
          {@const h = hm(k)}
          <tr class:now={k === now}><td>{mo}</td>{#if s}<td>{MON[h]}</td>{/if}<td>{tempN(months[h].tmax, units, 0)}{#if spread(tempN(months[h].tmax, units, 0), tempN(p10[h].tmax, units, 0), tempN(p90[h].tmax, units, 0))}<span class="pp">{tempN(p10[h].tmax, units, 0)}–{tempN(p90[h].tmax, units, 0)}</span>{/if}</td><td>{tempN(months[h].tmin, units, 0)}{#if spread(tempN(months[h].tmin, units, 0), tempN(p10[h].tmin, units, 0), tempN(p90[h].tmin, units, 0))}<span class="pp">{tempN(p10[h].tmin, units, 0)}–{tempN(p90[h].tmin, units, 0)}</span>{/if}</td><td>{units === 'us' ? Math.round((months[h].tmax - months[h].tmin) * 1.8) : Math.round(months[h].tmax - months[h].tmin)}</td><td>{rain(months[h].precipMm, units).replace(/ (mm|in)$/, '')}{#if spread(rain(months[h].precipMm, units).replace(/ (mm|in)$/, ''), rain(p10[h].precipMm, units).replace(/ (mm|in)$/, ''), rain(p90[h].precipMm, units).replace(/ (mm|in)$/, ''))}<span class="pp">{rain(p10[h].precipMm, units).replace(/ (mm|in)$/, '')}–{rain(p90[h].precipMm, units).replace(/ (mm|in)$/, '')}</span>{/if}</td><td>{fmt(months[h].dli, 0)}{#if spread(fmt(months[h].dli, 0), fmt(p10[h].dli, 0), fmt(p90[h].dli, 0))}<span class="pp">{fmt(p10[h].dli, 0)}–{fmt(p90[h].dli, 0)}</span>{/if}</td><td>{fmt(months[h].rh, 0)}{#if spread(fmt(months[h].rh, 0), fmt(p10[h].rh, 0), fmt(p90[h].rh, 0))}<span class="pp">{fmt(p10[h].rh, 0)}–{fmt(p90[h].rh, 0)}</span>{/if}</td><td>{fmt(months[h].vpdKpa, 2)}{#if spread(fmt(months[h].vpdKpa, 2), fmt(p10[h].vpdKpa, 2), fmt(p90[h].vpdKpa, 2))}<span class="pp">{fmt(p10[h].vpdKpa, 2)}–{fmt(p90[h].vpdKpa, 2)}</span>{/if}</td><td>{fmt(months[h].windMs, 1)}{#if spread(fmt(months[h].windMs, 1), fmt(p10[h].windMs, 1), fmt(p90[h].windMs, 1))}<span class="pp">{fmt(p10[h].windMs, 1)}–{fmt(p90[h].windMs, 1)}</span>{/if}</td><td>{days[h].toFixed(1)}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if halves}
    <div class="halves">{#each halves as h (h.kind)}<p class="small">{half(h)}</p>{/each}</div>
  {/if}
</section>

<style>
  .yp { margin: 8px 0 14px; }
  .yphead { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: flex-start; justify-content: space-between; }
  h3 { margin: 0; font-size: var(--fs-base); }
  .yps { display: inline-flex; flex-wrap: wrap; gap: 4px; max-width: 100%; }
  .yps button { min-height: var(--tap); padding: 0 10px; border: 1px solid var(--rule); background: none; color: var(--ink2); font: inherit; font-size: var(--fs-sm); border-radius: var(--r-sm); cursor: pointer; }
  .yps button[aria-pressed='true'] { border-color: var(--ink); color: var(--ink); font-weight: 600; }
  .charts svg { display: block; width: 100%; height: auto; }
  .charts text { font-size: 11px; fill: var(--ink3); font-variant-numeric: tabular-nums; }
  .charts .hab { fill: var(--mut); font-size: 10px; }
  .chartname { margin: 10px 0 0; font-size: var(--fs-sm); color: var(--ink2); display: flex; flex-wrap: wrap; gap: 0 10px; }
  .chartname.thin { margin-top: 4px; }
  .nowfig { margin-left: auto; color: var(--ink); font-variant-numeric: tabular-nums; }
  .key { color: var(--ink3); }
  .grid { stroke: var(--rule2); }
  .nowcol { fill: var(--sunk); }
  .linew { fill: none; stroke: #a8702a; stroke-width: 2; }
  .linec { fill: none; stroke: #2d73a3; stroke-width: 2; }
  .dashed { stroke-dasharray: 5 3; }
  .bandw { fill: #a8702a; opacity: 0.16; }
  .bandc { fill: #2d73a3; opacity: 0.16; }
  .barc { fill: #2d73a3; opacity: 0.7; }
  .whisk { stroke: var(--ink2); stroke-width: 1; }
  .floor { stroke: var(--ink); stroke-width: 1.2; stroke-dasharray: 1.5 3; }
  /* The month table's layout, from the page's old "Figures by month" fold (round 118). */
  table.wx { margin-top: 6px; }
  table.bymonth { width: auto; min-width: min(100%, 640px); }
  @media print { .scroll-x { overflow: visible !important; } }
  .bymonth .pp { display: block; font-size: var(--fs-xs); color: var(--ink3); }
  .bymonth tr.now td { background: var(--sunk); }
  .halves { margin-top: 10px; }
  .halves p { margin: 4px 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; text-decoration: underline; }
  /* The lens (round 126): the reader's place dashed in the ink, the habitat's lines as before; months below the floor marked. */
  .sitew, .sitec { fill: none; stroke: var(--ink); stroke-width: 1.6; stroke-dasharray: 6 3; }
  .sitec { stroke-dasharray: 2 3; }
  .siterain { stroke: var(--ink); stroke-width: 2; stroke-dasharray: 4 2; }
  .belowfloor { fill: #4a6fa5; }
  .lenslab { align-self: center; margin-right: 2px; }
  .lenscard { margin: 10px 0; padding: 10px 12px; border: 1px solid var(--rule); border-radius: var(--r); }
  .lenscard p { margin: 0 0 6px; }
  .athome-anchor { display: block; scroll-margin-top: 64px; }
  .heldline { stroke: var(--ink); stroke-width: 1.8; }
  .lensspace { display: block; margin: 0 0 6px; }
  #lens-sp-q { width: 100%; max-width: 360px; min-height: var(--tap); font: inherit; }
  .lenshits { list-style: none; margin: 6px 0; padding: 0; }
  .lenshits li { min-height: var(--tap); display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
  .lamptable td.mine { font-weight: 700; text-decoration: underline; }
</style>

<script lang="ts">
  import Placeholder from '$lib/ui/Placeholder.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { goto, replaceState, afterNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { accNo } from '$lib/db/types';
  import { photoAt, photoHosts } from '$dossier/photo-size';
  import { entriesFor, searchCatalogue, catalogueRows, plantNumberShaped, type Found } from '$lib/ui/index.svelte';
  import { fillBefore } from '$lib/ui/fill';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount, tick } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { groupFor } from '$core/regions';
  import type { MySpecies } from '$lib/db/species-list';
  import Today from '$lib/ui/Today.svelte';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  import Glance from '$lib/ui/ref/Glance.svelte';
  import Climograph from '$lib/ui/Climograph.svelte';
  import { failedBeforeHydration } from '$lib/ui/ref/failed';
  import { tileCredit, OG_ALT } from '$lib/ui/ref/head';
  import { searchedSentence, type SearchedAnswer } from '$lib/ui/ref/searched';
  import { plantHref } from '$lib/db/links';
  import { site } from '$lib/ui/site.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { cultivationSheet } from '$core/sheet';
  import { climograph } from '$climate/climograph';
  import { inDemo } from '$lib/db/demo';
  import { enterExample, notEnteredWords, type NotEntered } from '$lib/ui/grow/example.svelte';
  let { data } = $props();
  /**
   * One featured species' figures, for "This is what a species page with a habitat climate shows" under the visitor's heading (round sixty;
   * visitor 1, the self-review's experience item 1). The server's load sends it (`feature`, the first of the day's strip
   * with a derived climate); until it does, the block is not drawn.
   */
  type Feature = {
    slug: string;
    name: string;
    family?: string | null;
    lat: number | null;
    climate: { months: Array<{ tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number }>; p10?: unknown; p90?: unknown; cells: number; records: number; extremes?: { minAbs: number; minP01: number; maxP99: number; years: number; frostDaysPerYear: number; frostNights?: number } | null; extremesStatus?: 'ok' | 'none' | 'refused' | 'skipped' | 'sea' | null; annualRain?: { p50?: number } | null };
  };
  const sentFeature = $derived((data as typeof data & { feature?: Feature | null }).feature ?? null);
  /**
   * The feature stays drawn when a row is opened from the page that showed it: the server sends none for `?open=`
   * (corpus 10), and with the feature among the first rows its going would move every row below it under the pointer
   * that opened one (round sixty-two; the outside triage's 2). A page loaded at `?open=` has none, as before.
   */
  let keptFeature = $state<Feature | null>(null);
  $effect(() => { if (sentFeature) keptFeature = sentFeature; });
  const feature = $derived(sentFeature ?? (data.open ? keptFeature : null));
  /** The feature follows this many rows of the first window, or all of them when there are fewer. */
  const FEATURE_AFTER = 3;
  // The feature's year, for the chart's hemisphere. Nothing on the front page is in the reader's months: the season card
  // stays on the species page, so a southern visitor is never shown northern months first (round sixty-one; visitor 19).
  /** The chart's drawn height, which does not depend on its width, for the box its column holds before it is drawn. */
  const featureChartH = $derived(feature ? climograph({ months: feature.climate.months, p10: feature.climate.months, p90: feature.climate.months, cells: feature.climate.cells }).height : 0);
  const featureSheet = $derived(feature ? cultivationSheet({ scientific: feature.name, family: feature.family ?? undefined, months: feature.climate.months, extremes: feature.climate.extremes ?? null, extremesStatus: feature.climate.extremesStatus ?? null, lat: feature.lat, units: units.current }) : null);
  // The search lives in the URL (?q=) so the back button and a shared link bring it back; the server ignores it.
  let q = $state(browser ? (new URLSearchParams(location.search).get('q') ?? '') : '');
  // Only on the catalogue view: on "Your species" the box searches your own plants and species, and what is typed there
  // (a number, a field number, a name as received) is the collection's, so it goes neither to the URL nor to the server (round forty, R2-1).
  $effect(() => {
    if (!browser) return;
    const u = new URL(location.href);
    if (q.trim() && !keepLocal) u.searchParams.set('q', q.trim()); else u.searchParams.delete('q');
    if (u.href !== location.href) replaceState(u, page.state);
  });
  /** Enter in the search opens the first match: the way a search box is expected to behave. While a catalogue search is in flight, Enter waits for its answer rather than opening the previous query's first hit (round forty, R1-2). */
  async function openTop(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (plantHits.length) {
      e.preventDefault();
      // A number typed whole that two plants share opens the chooser at that number: the first hit by list order was one of
      // the two by chance (round sixty-one; records 4). Otherwise the first hit, by id while its number is shared (round sixty).
      const typed = q.trim().toLowerCase();
      const same = plantHits.filter((a) => accNo(a).toLowerCase() === typed);
      goto(same.length > 1 ? `/plants/${encodeURIComponent(accNo(same[0]))}` : plantHref(plantHits[0]));
      return;
    }
    if (yourView) {
      const own = ownHits[0];
      if (own) { e.preventDefault(); goto(`/species/${own.slug}`); }
      return;
    }
    e.preventDefault();
    const gen = searchGen;
    if (searching && pendingSearch) await pendingSearch;
    if (gen !== searchGen) return; // the text changed while waiting: nothing opens
    const top = shownFound[0];
    if (top) goto(`/species/${top.slug}`);
  }
  /** The one search box also finds the grower's own plants by number, field number or name: a returning grower types "2026-0007" here first. */
  const plantHits = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !collection.ready || needle.length < 2) return [];
    return collection.accessions.filter((a) => accNo(a).toLowerCase().includes(needle) || (a.fieldNumber ?? '').toLowerCase().includes(needle) || (a.nameAsReceived ?? '').toLowerCase().includes(needle) || (a.cultivar ?? '').toLowerCase().includes(needle)).slice(0, 5);
  });
  /**
   * The feature's chart is drawn only on a wide screen, and only once the page knows it is one: on a phone it was shipped
   * in the HTML and hidden, 14 KB no one saw (round sixty-one; decision 9, a11y 16). Its column keeps its height from the
   * first paint (`.fchart`), so the chart arriving moves nothing below it.
   */
  let wide = $state(false);
  onMount(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const set = () => (wide = mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  });
  /** Focus the box on a desktop (a keyboard is there); never on a phone, where focus raises the keyboard over the page. */
  const focusOnDesktop = (el: HTMLInputElement) => { if (window.matchMedia('(min-width: 701px)').matches && !el.value) el.focus({ preventScroll: true }); };
  /** Featured tiles whose photograph did not load: shown as placeholders rather than blank cards. */
  let failedTiles = $state(new Set<string>());
  /** The climate chips are the server's now (`?chip=`): they filter the grouped catalogue rather than flattening the whole index on the client (round thirty-nine). */
  const chip = $derived(data.chip);
  // Shown from the server's render, so a stranger's first screen has it before hydration and nothing moves when the
  // scripts arrive: inserted on hydration it pushed the featured strip down by a line or two (a layout shift of 0.05,
  // half the home page's score; round forty-five, 1). A device that dismissed it hides it before first paint by a
  // flag app.html's inline script sets from localStorage, and the state here catches up at mount.
  let welcomeHidden = $state(false);
  /** One transparent pixel, inline: the desktop strip's photographs below the desktop's width, where that copy is hidden (R1, 8). */
  const NO_PIXELS = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  /** The welcome's "See the example collection" did not open it: said under the line, never a press answered with nothing (round sixty-three, the fix pass; R1, 7). */
  let exampleRefused = $state<NotEntered | null>(null);
  // A returning grower's device remembers that the page will be their species, not the catalogue: until the collection is
  // open, the server-rendered catalogue is swapped for a light skeleton so neither the wrong head nor "You grow 0" shows.
  // The server never sees the hint, so crawlers and first visits get the catalogue at once.
  const HINT = 'cultifolio.hasMine';
  let expectMine = $state(false);
  /*
   * The catalogue is 1,321 genera; as HTML that is ten thousand nodes, which a phone lays out before it can scroll, and as
   * data it was fifty kilobytes gzipped in every copy of the page before anything could paint (round forty-seven, 1). So
   * the server sends a first window of rows (enough to fill several screens) and the page fetches the rest from /api/rows
   * as the reader nears the end, in chunks large enough that a fling does not outrun it. A letter tap, a `#l-X` link and
   * a `?open=` row fetch what they need before they scroll to it, so they land where they say. Search and the chips read
   * the index, not these rows, and are unaffected. The "More" link is a plain navigation (`?at=`) for a reader without
   * JavaScript, and the fallback when a fetch fails.
   */
  const CHUNK = 160;
  /** The rows loaded, contiguous from `start`: the server's window first, then what the API appended. */
  // svelte-ignore state_referenced_locally
  let start = $state(data.start);
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(data.rows);
  /** Bumped when the server's window replaces the rows (a new grouping, letter or opened row): a fetch begun before it lands nowhere (round forty-nine, 2). */
  let rowsGen = 0;
  let firstWindow = true;
  // svelte-ignore state_referenced_locally
  let shownStart = data.start;
  $effect(() => {
    data.rows; data.start;
    const moved = data.start !== shownStart;
    shownStart = data.start;
    start = data.start; rows = data.rows; rowsGen++; tailPad = 0;
    // A row opened from a window other than the server's (after a letter jump, the server's window for `?open=` starts
    // fifteen rows above the row, not where the jump did) replaced the rows under a scroll position that no longer
    // meant anything, and the short tail of the catalogue clamped at the footer (the author's phone, round forty-nine).
    // When the window's start moved, the opened row is placed under the bar; when it did not (a row tapped within the
    // first window), the rows are the same rows and the row stays where it was tapped.
    if (firstWindow) { firstWindow = false; return; }
    if (data.open && moved) void tick().then(() => placeRow(data.open));
    // A row opened near the foot of a phone's screen opened below the tab bar, and the only sign was its "+" turning "−":
    // its tiles are brought into view, the row under the pinned bar (round sixty; visitor 11).
    else if (data.open) void tick().then(() => revealRow(data.open));
  });
  /** Bring an opened row's first tiles into view when they would start under the bottom bar or below the fold. */
  function revealRow(id: string | null) {
    if (!id) return;
    const el = document.getElementById(`g-${id}`);
    if (!el) return;
    const tabbar = document.getElementById('tabbar')?.getBoundingClientRect().height ?? 0;
    if (el.getBoundingClientRect().bottom + 120 > window.innerHeight - tabbar) placeRow(id);
  }
  /** Put the opened row under the pinned bar, padding the list when the page is too short to. */
  function placeRow(id: string) {
    const el = document.getElementById(`g-${id}`);
    if (!el) return;
    const under = 44 + Math.max(document.querySelector<HTMLElement>('.stickyhead')?.offsetHeight ?? 0, document.querySelector<HTMLElement>('.stickyhead .toolrow')?.offsetHeight ?? 0) + 4;
    const top = el.getBoundingClientRect().top;
    window.scrollTo({ top: top + window.scrollY - under });
    const short = el.getBoundingClientRect().top - under;
    if (short > 2) { tailPad = short; void tick().then(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - under })); }
  } // a new grouping, letter or opened row: start again from what the server sent
  const visibleRows = $derived(rows);
  const end = $derived(start + rows.length);
  let sentinel = $state<HTMLElement | null>(null);
  let fetching: Promise<boolean> | null = null;
  /** Append the next chunk from the API; false when it could not be reached (the "More" link then navigates). */
  function growOnce(): Promise<boolean> {
    if (fetching) return fetching;
    if (end >= data.rowCount) return Promise.resolve(false);
    const at = end;
    const gen = rowsGen;
    fetching = catalogueRows(data.by, data.chip, at, CHUNK).then((got) => {
      fetching = null;
      // A window from another catalogue than the page's (the corpus was replaced since the HTML was rendered: a different
      // row count) is not spliced in; the link then navigates, and the page comes back whole (round forty-nine, 2).
      if (!got || gen !== rowsGen || got.count !== data.rowCount || got.at !== at || at !== start + rows.length) return false;
      rows = [...rows, ...got.rows.map((r) => ({ ...r, items: undefined }))];
      return got.rows.length > 0;
    });
    return fetching;
  }
  /**
   * Prepend the chunk before the loaded rows, keeping what is on screen where it is: a window opened at a letter (W) has
   * everything before it still to come, and scrolling up must find it, not the top of the page (round forty-eight, 2).
   * The scroll is corrected by hand, since Safari does not anchor it.
   */
  let fetchingBefore: Promise<boolean> | null = null;
  /** Where the pinned bar ends: what is above it is out of sight. */
  const pinnedEdge = () => 44 + (document.querySelector<HTMLElement>('.stickyhead .toolrow')?.offsetHeight ?? 0);
  /** The first loaded row's top, on screen. */
  const anchorTop = () => document.querySelector<HTMLElement>('.rows .grow')?.getBoundingClientRect().top ?? Infinity;
  function growBefore(): Promise<boolean> {
    if (fetchingBefore) return fetchingBefore;
    if (start <= 0) return Promise.resolve(false);
    const at = Math.max(0, start - CHUNK);
    const n = start - at;
    const gen = rowsGen;
    fetchingBefore = catalogueRows(data.by, data.chip, at, n).then(async (got) => {
      fetchingBefore = null;
      if (!got || gen !== rowsGen || got.count !== data.rowCount || got.at !== at || at + n !== start) return false;
      // The view is moved by what the first loaded row moved, so what was on screen stays where it was: round
      // forty-eight corrected only when that row sat above the pinned edge, and after a jump to W it sat just under
      // it, so the chunk above pushed W down, the sentinel came back into reach, and the fill ran to A (round
      // forty-nine, 2; round twenty-seven, 1). Whether the fill runs on its own is decided before, in `fillBefore`.
      const anchor = document.querySelector<HTMLElement>('.rows .grow'); // the row itself, since the first row is another once the chunk is in
      const wasAt = anchor?.getBoundingClientRect().top;
      rows = [...got.rows.map((r) => ({ ...r, items: undefined })), ...rows];
      start = at;
      tailPad = 0;
      await tick();
      if (anchor && wasAt != null && anchor.isConnected) window.scrollBy(0, anchor.getBoundingClientRect().top - wasAt);
      return got.rows.length > 0;
    });
    return fetchingBefore;
  }
  let topSentinel = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!topSentinel || start <= 0) return;
    // The fill runs on its own only while the reader is within the rows (the first row at or under the pinned bar): on the
    // chips or the letters above them, as after A–Z, nothing is fetched, and the view stays on them (round forty-nine, 2).
    const el = topSentinel;
    const near = () => el.getBoundingClientRect().bottom > -1600 && el.getBoundingClientRect().top < window.innerHeight + 1600;
    const maybe = () => { if (near() && fillBefore(anchorTop(), pinnedEdge())) growBefore(); };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) maybe(); }, { rootMargin: '1600px 0px' });
    io.observe(el);
    // The observer fires on a change of reach, not on every scroll: a sentinel already within reach while the reader was on the
    // chips must still be filled from once they scroll into the rows.
    window.addEventListener('scroll', maybe, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', maybe); };
  });
  /** Keep appending while the end of the list is still within reach of the viewport (a tall screen, a fling that landed on it). */
  async function growWhileNear() {
    while (sentinel && end < data.rowCount && sentinel.getBoundingClientRect().top < window.innerHeight + 1600) {
      if (!(await growOnce())) return;
      await tick();
    }
  }
  $effect(() => {
    if (!sentinel || end >= data.rowCount) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) growWhileNear(); }, { rootMargin: '1600px 0px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
  /**
   * Scroll to a letter's heading, fetching its rows first when they are not loaded: a letter past the loaded rows opens a
   * window from its first row (as `?from=` does on the server); a letter above them is already there. The hash is kept
   * so the back button and a copied link behave.
   */
  async function jumpToLetter(l: string) {
    const first = data.letterAt[l];
    if (first == null) return;
    if (first < start || first >= end) {
      const gen = rowsGen;
      const got = await catalogueRows(data.by, data.chip, first, CHUNK);
      if (gen !== rowsGen) return; // the page moved on meanwhile
      if (!got || got.count !== data.rowCount) { location.href = `?by=${data.by}${chip !== 'all' ? `&chip=${chip}` : ''}&from=${l}#l-${l}`; return; }
      start = first;
      rows = got.rows.map((r) => ({ ...r, items: undefined }));
    }
    await tick();
    // Placed by hand under whatever is pinned (the whole head on a desktop, the search row on a phone), rather than by a
    // fixed scroll margin that left the previous letter's last card showing above the heading on a phone (round forty-nine).
    const h = document.getElementById(`l-${l}`);
    if (h) {
      // On a desktop the whole head is pinned and has a height; on a phone it is `display: contents` (height 0) and the
      // search row inside it is what is pinned. The larger of the two is what is in the way. (Reading the head's computed
      // position found "sticky" on the phone too, where the rule still applies to a box that no longer exists, and placed
      // the heading under the row; the author's phone, M.)
      const pinned = document.querySelector<HTMLElement>('.stickyhead .toolrow');
      const head = document.querySelector<HTMLElement>('.stickyhead');
      const under = 44 + Math.max(head?.offsetHeight ?? 0, pinned?.offsetHeight ?? 0) + 4;
      window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - under });
      // A letter near the end (W, Z) has fewer rows below it than a screen holds, so the page could not scroll far enough
      // and the browser clamped at the footer with the heading just above the fold (the author's phone, round forty-nine).
      // The list is padded by what was short, so the heading sits under the bar; the padding goes once a chunk has filled in above.
      const short = h.getBoundingClientRect().top - under;
      tailPad = short > 2 ? short : 0;
      if (tailPad) { await tick(); window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - under }); }
    }
    history.replaceState(history.state, '', `#l-${l}`);
  }
  /** Padding under the rows after a jump to a letter the page is too short to place; see `jumpToLetter`. Dropped once a chunk has filled in above (the page is tall enough then, and taking it away moves nothing on screen) or the server's window replaces the rows. */
  let tailPad = $state(0);
  let lettersEl = $state<HTMLElement | null>(null);
  /** Scroll the chips and the letter index back under the pinned search row, and put the keyboard on the first letter. */
  function showLetters() {
    if (!lettersEl) return;
    const bar = document.querySelector<HTMLElement>('.stickyhead .toolrow');
    const under = 44 + (bar?.offsetHeight ?? 0) + 8;
    const chips = lettersEl; // the chips are in the toolbar now (round sixty)
    // An instant move, not a smooth one: a smooth scroll upward crosses the sentinel above the rows, the chunk it fetches
    // lands mid-animation, and Safari stops the animation where it is, part of the way (the author's phone, round forty-nine).
    window.scrollTo({ top: chips.getBoundingClientRect().top + window.scrollY - under });
    lettersEl.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }
  // A page opened at ?open=<row> (a link or a bookmark) starts at the row, not at the top of a thousand rows. Not on Back:
  // there the browser's own saved position is the grower's place in the genus, and placing the row over it sent them to the
  // top of a forty-species genus on every return from a species page (round sixty; visitor 6).
  afterNavigate((nav) => {
    if (nav.type === 'popstate') return;
    if (nav.type === 'enter' && performance.getEntriesByType?.('navigation')?.[0] && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type === 'back_forward') return;
    if (data.open && window.scrollY < 10) placeRow(data.open);
  });
  onMount(() => {
    site.load();
    const fromHash = () => { const m = /^#l-(.+)$/.exec(location.hash); if (m) jumpToLetter(decodeURIComponent(m[1])); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    try {
      expectMine = localStorage.getItem(HINT) === '1';
    } catch {
      expectMine = false;
    }
    try {
      welcomeHidden = localStorage.getItem('cultifolio.welcomed') === '1';
    } catch {
      welcomeHidden = false;
    }
    void collection.load();
    return () => window.removeEventListener('hashchange', fromHash);
  });
  $effect(() => {
    if (!collection.ready) return;
    if (inDemo()) return; // the hint is the grower's own collection's, never the sample's (round sixty-one; the records review, 17)
    try {
      if (hasMine) localStorage.setItem(HINT, '1');
      else localStorage.removeItem(HINT);
    } catch {
      /* fine */
    }
  });
  const dismissWelcome = () => {
    welcomeHidden = true;
    try {
      localStorage.setItem('cultifolio.welcomed', '1');
    } catch {
      /* fine */
    }
  };
  // What you own, by species slug: the number when one, a count when several.
  const owned = $derived.by(() => {
    const m = new Map<string, string[]>();
    if (!collection.ready) return m;
    for (const a of collection.accessions) if (a.status === 'growing') m.set(speciesSlug(a.taxonName), [...(m.get(speciesSlug(a.taxonName)) ?? []), accNo(a)]);
    // and by key, so a tile under a suffixed homonym slug still shows the plants grown of it (round eighteen, 6)
    for (const a of collection.accessions) if (a.status === 'growing' && a.taxonKey != null) { const k = `key:${a.taxonKey}`; m.set(k, [...(m.get(k) ?? []), accNo(a)]); }
    return m;
  });
  // Your species: what you grow or follow. Empty until the collection is open, so the server-rendered catalogue stands until then.
  const mine = $derived(collection.ready ? collection.mySpecies : new Map<string, MySpecies>());
  const hasMine = $derived(mine.size > 0);
  // The page is a switch: your species when you have any, the catalogue otherwise or when you ask to browse it.
  // A link that names a group, a grouping or a letter (the genus pages' canonical addresses, the sitemap's) opens the
  // catalogue whatever the collection holds: a grower following `/?by=genus&open=copiapoa` got their own species
  // under a title that said Copiapoa (round thirty-four, 1).
  // svelte-ignore state_referenced_locally
  let browsing = $state(data.browse);
  $effect(() => { if (data.browse) browsing = true; });
  const yourView = $derived(hasMine && !browsing);
  // And in three more cases the text stays here whichever view this is (round forty-nine, 3; round thirty-five, R1-2):
  // before the collection has opened (the view is not yet known, and a grower's first keystrokes were going to the
  // server), while the text matches one of the grower's plants, and when it is shaped like a plant number under the
  // collection's own scheme ("ACC-0013" went to the server; round sixty-two, the self-review's triage N4).
  const keepLocal = $derived(yourView || !collection.ready || plantHits.length > 0 || plantNumberShaped(q, collection.scheme));
  // The hint says "your species" is coming; hold the catalogue back until the collection says which view this is.
  const settling = $derived(expectMine && !collection.ready);
  type Row = (typeof data.rows)[number];
  type Item = NonNullable<Row['items']>[number];
  // The search is the server's: the index never comes to the browser whole (round thirty-nine). Debounced a little,
  // and an answer is used only if it is still for the text in the box.
  let found = $state<Found[]>([]);
  let searching = $state(false);
  /** Why the last search gave nothing usable: not reached, rate-limited (with the wait in seconds), or offline. */
  let searchFailed = $state<null | { kind: 'unreached' | 'limited' | 'offline'; wait?: number }>(null);
  let searchGen = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSearch: Promise<unknown> | null = null;
  /**
   * What the server's answer says of the words it searched (`relaxed`) and of a similar spelling (`near`), said on the
   * page (round sixty; round sixty-two, the search review's 3 and 18: a name pasted with its author matched, and was said
   * to have matched nothing).
   */
  let relaxedFor = $state<SearchedAnswer | null>(null);
  const relaxedOf = (r: unknown): SearchedAnswer | null => (r && typeof r === 'object' ? (r as SearchedAnswer) : null);
  const searchedLine = $derived(searchedSentence(q, relaxedFor, found));
  /** The hits, whether the answer is the list itself or carries it as `hits` beside `relaxed`. */
  const hitsOf = (r: unknown): Found[] => (Array.isArray(r) ? (r as Found[]) : Array.isArray((r as { hits?: unknown } | null)?.hits) ? (r as { hits: Found[] }).hits : []);
  $effect(() => {
    const text = q.trim();
    const gen = ++searchGen;
    clearTimeout(searchTimer);
    // The catalogue is searched only on the catalogue view (round forty, R2-1), and never with text that is the collection's (`keepLocal`).
    if (!text || keepLocal) { found = []; searching = false; searchFailed = null; relaxedFor = null; return; }
    searching = true;
    searchTimer = setTimeout(() => {
      pendingSearch = searchCatalogue(text).then((r) => {
        if (gen !== searchGen) return;
        searching = false;
        if (r === null) { searchFailed = { kind: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unreached' }; found = []; relaxedFor = null; return; }
        if (!Array.isArray(r) && 'limited' in r) { searchFailed = { kind: 'limited', wait: r.limited }; found = []; relaxedFor = null; return; }
        searchFailed = null;
        found = hitsOf(r);
        relaxedFor = relaxedOf(r);
      });
    }, 150);
  });
  const retrySearch = () => { const t = q; q = ''; q = t; };
  const flat = $derived(!!q.trim());
  /** Typing is a mode: with text in the box the strip, the grouping, the chips and the letters step aside and the matches draw as rows under the pinned box; Cancel or an empty box puts the page back (round fifty, 2). */
  const searchMode = $derived(!!q.trim());
  let toolrowEl = $state<HTMLElement | null>(null);
  let filtersEl = $state<HTMLElement | null>(null);
  /** On a phone, focus pins the box under the top bar, so what is typed and what matches share the half of the screen the keyboard leaves. */
  function pinSearch() {
    if (!toolrowEl || !window.matchMedia('(max-width: 640px)').matches) return;
    const top = toolrowEl.getBoundingClientRect().top;
    if (top > 46) window.scrollTo({ top: window.scrollY + top - 44 });
  }
  function cancelSearch() {
    q = '';
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  /** The search's hits under the chip: a chip that is on filters the matches too (round forty, R1-4). */
  const shownFound = $derived(chip === 'climate' ? found.filter((c) => c.climate === 'ok') : chip === 'noclimate' ? found.filter((c) => c.climate !== 'ok') : found);
  /** The matches among your own species, found here and not on the server (round forty, R2-1). */
  const ownHits = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !yourView) return [];
    return [...mineTiles.grow, ...mineTiles.follow].filter((t) => t.name.toLowerCase().includes(needle) || (t.common ?? '').toLowerCase().includes(needle) || (t.family ?? '').toLowerCase().includes(needle));
  });
  /** Take the typed text to the catalogue: the one deliberate step on which what was typed leaves the device. */
  const searchTheCatalogue = () => { browsing = true; };
  // A grower's own tiles come from a small request for their own species; the whole catalogue is fetched only for a search or a chip.
  let ownEntries = $state<Map<string, Item> | null>(null);
  let ownFailed = $state(false);
  async function loadOwn() {
    if (ownFailed) return;
    const m = await entriesFor([...mine.keys()]);
    if (!m) { ownFailed = true; return; }
    ownEntries = new Map([...m.values()].map((e) => [e.slug, { key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, origin: e.origin ?? [], syn: e.syn, thumb: prefs.referencePhotos ? e.thumb : undefined, alt: prefs.referencePhotos && e.thumb ? e.name : undefined, thumbOff: !prefs.referencePhotos && !!e.thumb, credit: prefs.referencePhotos ? e.credit : undefined, photos: e.photos, open: e.open, climate: e.climate } as Item]));
  }
  $effect(() => { if (hasMine) { mine.size; prefs.referencePhotos; loadOwn(); } }); // rebuilt when the photograph preference changes
  const retryOwn = () => { ownFailed = false; loadOwn(); };
  const ownedN = $derived.by(() => {
    if (ownEntries) return [...owned.keys()].filter((k) => ownEntries!.has(k)).length;
    return [...owned.keys()].length; // until the entries are here, count what you grow, not what the corpus has of it
  });
  const byLabel = { genus: 'Genus', origin: 'Origin', family: 'Family' } as const;
  /** "1 genus", "3 genera": the row word by count (round sixty; visitor 7: "1 genera"). */
  const rowWord = (n: number) => (data.by === 'genus' ? (n === 1 ? 'genus' : 'genera') : data.by === 'family' ? (n === 1 ? 'family' : 'families') : n === 1 ? 'region' : 'regions');
  /** The species under the chip, not the whole catalogue's: each species sits in one row of a grouping (round sixty; visitor 7). */
  const chipSpecies = $derived(chip === 'climate' ? data.withClimate : chip === 'noclimate' ? data.total - data.withClimate : data.total);
  /** A row's species whose climate is pending, apart from those whose source did not answer (round sixty; words 10). */
  const pendingOf = (r: object) => (r as { pending?: number }).pending ?? 0;
  /** A tile's second line: the English name, unless it is only the genus again (Welwitschia's is "Welwitschia"), when the family says more (round fifty-nine; self review). */
  const commonOr = (c: { name: string; common?: string; family?: string }) => (c.common && c.common.toLowerCase() !== c.name.split(' ')[0].toLowerCase() ? c.common : c.family);
  const fmtN = (n: number) => n.toLocaleString('en-US');
  /**
   * The home page's description: the counts as they read, under 160 characters (round sixty). The list's whole reach, not
   * only cacti, succulents and bulbs, and the sync caveat beside the privacy claim (round sixty-two; outside review A2, A35).
   */
  const homeDesc = $derived(`Cactus, succulent and bulb species and the plants most grown alongside them: sourced habitat climate for ${fmtN(data.withClimate)} of ${fmtN(data.total)}. Your records, encrypted before sync.`);
  // A visitor: no plants on this device (until the collection has opened, the server's catalogue stands as the visitor's page).
  const visitor = $derived(!collection.ready || (!hasMine && !collection.accessions.length));
  /** The welcome line is drawn: a visitor's page, not dismissed, no search typed. */
  const showWelcome = $derived(visitor && !welcomeHidden && !searchMode);
  const openRow = $derived(data.rows.find((r) => r.id === data.open));
  const rowDesc = $derived(openRow ? `${openRow.label}: ${fmtN(openRow.count)} species in the reference, ${fmtN(openRow.withClimate)} with a habitat climate; every figure sourced.` : '');
  /** Species per page of an opened row (the server's HOME_ITEMS). */
  const ITEMS = 240;
  const partHref = (id: string, part: number) => `?by=${data.by}${chip !== 'all' ? `&chip=${chip}` : ''}&open=${id}${part > 0 ? `&part=${part}` : ''}`;
  const rowHref = (id: string) => `?by=${data.by}${chip !== 'all' ? `&chip=${chip}` : ''}${id === data.open ? '' : `&open=${id}`}`;
  /* ---- your species ---- */
  // A tile's data: a catalogue entry, or, until the index is here, the name alone. `missing`: the index is here and has no such species.
  type Tile = { slug: string; key?: number; name: string; family?: string; common?: string; thumb?: string; /** the photograph's credit, licence first, as the catalogue's tiles say it (round sixty-three, the fix pass; R1, 6b) */ credit?: string; alt?: string; open?: number; climate?: string; missing?: boolean; /** the reference has a photograph, and the grower has it switched off for their own tiles */ thumbOff?: boolean };
  const mineTiles = $derived.by(() => {
    const list = [...mine.values()].sort((a, b) => a.name.localeCompare(b.name));
    const bySlug = ownEntries;
    const toTile = (s: { slug: string; name: string }): Tile => {
      const e = bySlug?.get(s.slug) as Tile | undefined;
      if (!e) return { slug: s.slug, name: s.name, missing: !!bySlug };
      // From the whole index (after a search) the entry carries its photograph; an own tile shows it only when switched on.
      return e.thumb && !prefs.referencePhotos ? { ...e, thumb: undefined, alt: undefined, thumbOff: true } : e;
    };
    return { grow: list.filter((s) => s.grown > 0).map(toTile), follow: list.filter((s) => !s.grown && s.followed).map(toTile) };
  });
  const grownN = $derived(mineTiles.grow.length);
  const followingN = $derived(mineTiles.follow.length);
  const startBrowsing = () => {
    browsing = true;
    q = '';
  };
  const stopBrowsing = () => {
    browsing = false;
    q = '';
  };
  /** The climate state in words: a refusal is never shown as an absence. */
  const climateWord = (c: string) => (c === 'ok' ? 'habitat climate known' : c === 'pending' ? 'habitat climate pending' : c === 'refused' ? 'habitat climate not checked: a source refused or did not answer' : 'no habitat climate derived');
</script>

<svelte:head>
  {#if openRow}
    <!-- A genus (or family, or origin) opened by its address is its own page to a crawler: its own title, description and canonical, not the home page's 1,321 times over (round thirty-one, 5). -->
    <title>{openRow.label}, {openRow.count} species · Cultifolio</title>
    <!-- Only what holds for the row: its counts and how many have a climate (round sixty; the self-review's 14, A5). Not "where the
         sources answered": most without one lack it because their records allow none, which is no refusal (round sixty-two; the words review's 11). -->
    <meta name="description" content={rowDesc} />
    <link rel="canonical" href="https://cultifolio.com/?by={data.by}&open={data.open}" />
    <meta property="og:title" content="{openRow.label}, {openRow.count} species · Cultifolio" />
    <meta property="og:description" content={rowDesc} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Cultifolio" />
    <meta property="og:url" content="https://cultifolio.com/?by={data.by}&open={data.open}" />
    <meta property="og:image" content={openRow.thumb ? photoAt(openRow.thumb, 'medium') : 'https://cultifolio.com/og.png'} />
    {#if !openRow.thumb}<meta property="og:image:alt" content={OG_ALT} />{/if}
    <meta name="twitter:card" content="summary_large_image" />
  {:else}
    <!-- The list's whole reach: Hoya, Peperomia and Pelargonium are on it too (round sixty-two; outside review A2). -->
    <title>Cultifolio: cactus, succulent and bulb species, and the plants most grown alongside them, with a private plant record</title>
    <!-- Under 160 characters, so a search result shows it whole (round sixty). -->
    <meta name="description" content={homeDesc} />
    <link rel="canonical" href="https://cultifolio.com/" />
    <meta property="og:title" content="Cultifolio: cactus, succulent and bulb species, and the plants most grown alongside them, with a private plant record" />
    <meta property="og:description" content={homeDesc} />
    <meta property="og:site_name" content="Cultifolio" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://cultifolio.com/" />
    <meta property="og:image" content="https://cultifolio.com/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <!-- The image's own words: the alt described a line the image does not hold (round sixty-two; the words review's 2). -->
    <meta property="og:image:alt" content={OG_ALT} />
    <meta name="twitter:card" content="summary_large_image" />
  {/if}
  {#if visitor && data.featured.length}
    <!-- A visitor's largest first-screen paint is a featured tile on a third party's host: the first is preloaded from the head and the
         hosts of the first three are preconnected, so the handshakes start with the stylesheet (round forty-two, 1). A grower's own
         page replaces the strip after the collection opens; the one small file this costs them is cached by then. -->
    <!-- A desktop's only: on a phone the strip follows the first rows, and a row is the first screen's paint (round sixty-three, V4). -->
    <link rel="preload" as="image" href={photoAt(data.featured[0].thumb, 'small')} fetchpriority="high" media="(min-width: 701px)" />
    {#each photoHosts(data.featured.slice(0, 3).map((c) => c.thumb)) as h (h)}<link rel="preconnect" href={h} />{/each}
  {/if}
</svelte:head>

{#snippet featureBlock(feature: Feature)}
  <!-- After the first rows on a wide screen: above the toolbar it pushed the search to y 1224 at 1280 × 800, so a first
       desktop visit saw no search and no row; below the toolbar it stood between the chips and the rows they govern
       (round sixty-two; the outside triage's 2, outside review A10, B1). Here the search, the grouping, the chips and the
       first rows are on the first screen, and a chip click moves no row: the feature is kept on a chip's page, and it
       comes after the first rows, never above them. The four figures as a 2×2 block, the chart beside them, the season and
       the rest on the species page (round sixty-one; decision 9, visitor 9). Not drawn on a phone (below 900 px). -->
  <section class="feature" aria-labelledby="feature-h">
    <h2 class="featurehead" id="feature-h">This is what a species page with a habitat climate shows <span class="fname">· <a href="/species/{feature.slug}"><SpeciesName name={feature.name} /></a></span></h2>
    <div class="fglance"><Glance months={feature.climate.months} annualRain={feature.climate.annualRain ?? null} extremes={feature.climate.extremes ?? null} extremesStatus={feature.climate.extremesStatus ?? null} year={featureSheet?.year ?? null} season={false} chartHref={null} /></div>
    <div class="fchart" style:--fh="calc({featureChartH}px + 14rem)">{#if wide}<Climograph id="feature-climo" name={feature.name} south={featureSheet?.year?.south ?? null} climate={{ months: feature.climate.months, p10: feature.climate.p10 as never, p90: feature.climate.p90 as never, cells: feature.climate.cells, extremes: feature.climate.extremes ?? null }} />{/if}</div>
    <p class="small featurefoot"><a href="/species/{feature.slug}">The whole page for <i>{feature.name}</i></a>: {wide ? '' : 'the chart, '}the season in your months, the range and its records, photographs and every source. <a href="/about/how#feature">Chosen by rule</a> from today's strip above.</p>
  </section>
{/snippet}

{#snippet plantsFound()}
  {#if plantHits.length}
    <div class="plantsfound" role="status" data-sveltekit-preload-data="off">
      {#each plantHits.slice(0, 60) as a (a.id)}<a class="azrow accrow" href={plantHref(a)}><span class="im"></span><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span><span class="fam">your plant{a.locationId ? ` · ${collection.locationName(a.locationId)}` : ''}</span></span><span class="fig">open →</span></a>{/each}
    </div>
  {/if}
{/snippet}

{#snippet featured(titled = false, where: 'any' | 'wide' | 'phone' = 'any')}
  <!-- On a phone the strip follows the first rows (`where`: drawn twice, one shown per width by CSS): above the search it
       put the search, the chips and the first row under the tab bar on Safari's 390 × 664 page (round sixty-three, V4;
       docs/REVIEW-ROUND-62.md, section 7). The phone's copy loads its photographs lazily, so on a desktop, where it is
       hidden, it fetches nothing. The desktop's copy fetches its first three at once, and an eager image is fetched even
       inside `display: none`: below the desktop's width its picture names a pixel already on the page instead, so a phone
       does not spend two high-priority requests on photographs it does not show yet (round sixty-three, the fix pass; R1, 8). -->
  <section class="featured" class:wideonly={where === 'wide'} class:phoneonly={where === 'phone'} aria-label="From the reference">
    {#if titled}<h2 class="q grouptitle">From the reference</h2>{/if}
    <div class="strip">
      {#each data.featured as c, i (c.slug)}
        <a class="ftile" href="/species/{c.slug}">
          <!-- One size by surface, not by pixel density: a 150 px tile at `small` (240 px), never `medium`, which a phone's density promoted every tile to and made the phone's home page seven megabytes (round thirty-five, R2-7). -->
          <!-- The first phone viewport shows two or three tiles, and whichever is largest is the first-screen paint: the first three
               are fetched at once, the first with priority, the rest of the strip lazily (round thirty-seven, R2-4; round forty, R2-5).
               A photograph that does not load leaves a placeholder with the name, not a blank card (round forty, own). -->
          {#if failedTiles.has(c.slug)}<div class="fph"><Placeholder name={c.name} family={c.family} caption="photograph did not load" /></div>{:else if where === 'wide'}<picture><source media="(max-width: 700px)" srcset={NO_PIXELS} /><img src={photoAt(c.thumb, 'small')} width="240" height="240" alt="" loading={i < 3 ? 'eager' : 'lazy'} fetchpriority={i < 2 ? 'high' : 'auto'} use:failedBeforeHydration={() => (failedTiles = new Set([...failedTiles, c.slug]))} /></picture>{:else}<img src={photoAt(c.thumb, 'small')} width="240" height="240" alt="" loading={i < 3 && where !== 'phone' ? 'eager' : 'lazy'} fetchpriority={i < 2 && where !== 'phone' ? 'high' : 'auto'} use:failedBeforeHydration={() => (failedTiles = new Set([...failedTiles, c.slug]))} />{/if}
          <span class="fnm"><SpeciesName name={c.name} /></span>
          {#if commonOr(c)}<span class="fcom">{commonOr(c)}</span>{/if}
          <!-- The photograph's source on the tile, its author and licence on the page it opens (round sixty; rule 1, the round forty-two review G). -->
          <!-- A photograph that does not load takes its credit with it, but not the line's height: the strip shrank by that line
               as the photograph failed, and the rows under the reader moved 21 px a moment after a fill had put them back
               (round sixty-five; smoke 2819 in Safari's engine and Firefox; Chromium passed only by reading before the failure). -->
          {#if !failedTiles.has(c.slug) && tileCredit(c)}<span class="fcred">{tileCredit(c)}</span>{:else if tileCredit(c)}<span class="fcred" aria-hidden="true">&nbsp;</span>{/if}
        </a>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet tile(c: Tile)}
  {@const own = owned.get(c.slug) ?? (c.key != null ? owned.get(`key:${c.key}`) : undefined)}
  <a class="tile" href="/species/{c.slug}">
    {#if own?.length}<span class="ownchip" title="You grow {own.length === 1 ? own[0] : own.length + ' of these'}" aria-label="You grow {own.length === 1 ? own[0] : own.length + ' of these'}">{own.length === 1 ? own[0] : `× ${own.length}`}</span>{:else if mine.get(c.slug)?.followed}<span class="ownchip following" title="On your list without a plant of it" aria-label="Following: on your list without a plant of it">following</span>{/if}
    {#if c.thumb}<div class="im"><img src={c.thumb} alt={c.alt} loading="lazy" use:failedBeforeHydration={(im) => { const box = im.parentElement; im.style.display = 'none'; box?.classList.add('ph'); if (box) box.textContent = 'photograph did not load'; }} /></div>{:else if c.thumbOff}<div class="im"><Placeholder name={c.name} family={c.family} caption="reference photograph off" title="The reference has a photograph; showing it on your own tiles is off" /></div>{:else if c.climate}<div class="im"><Placeholder name={c.name} family={c.family} caption="no open photograph on file" /></div>{:else if c.missing}<div class="im"><Placeholder name={c.name} family={c.family} caption="not in the reference" /></div>{:else}<div class="im ph">{ownFailed ? 'reference not reached' : 'loading…'}</div>{/if}
    <div class="tx">
      <div class="nm"><SpeciesName name={c.name} /></div>
      <div class="fam">{commonOr(c) ?? ''}</div>
      {#if c.thumb && tileCredit(c)}<div class="cred">{tileCredit(c)}</div>{/if}
      <!-- the index carries the openly licensed count only; the species page's "in range" total is another figure, so this one is named for what it is (round eighteen, 7) -->
      <div class="fig" title={c.climate ? climateWord(c.climate) : undefined}>{c.climate === 'ok' ? `${c.open ? `${c.open} open record${c.open === 1 ? '' : 's'}` : 'habitat climate'}` : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : c.climate ? 'no habitat climate' : c.missing ? 'not in the reference' : ''}</div>
    </div>
  </a>
{/snippet}

{#snippet hit(c: Tile)}
  <!-- A match as a row, not a tile: five or six fit between the pinned box and a phone's keyboard, and update as the letters go in (round fifty, 2). -->
  <a class="azrow hitrow" href="/species/{c.slug}">
    <span class="im">{#if c.thumb}<img src={photoAt(c.thumb, 'square')} width="40" height="40" alt="" loading="lazy" use:failedBeforeHydration={(im) => { const ini = document.createElement('span'); ini.className = 'ini'; ini.textContent = c.name[0] ?? ''; im.replaceWith(ini); }} />{:else}<span class="ini">{c.name[0] ?? ''}</span>{/if}</span>
    <span>
      <span class="nm"><SpeciesName name={c.name} /></span>
      <span class="fam">{[c.common, c.family, c.climate === 'ok' ? 'climate known' : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : c.climate ? 'no habitat climate' : ''].filter(Boolean).join(' · ')}</span>
    </span>
    <span class="fig">›</span>
  </a>
{/snippet}

{#if settling}
  <div class="skeleton" aria-busy="true" aria-label="Opening your species">
    <div class="sk head"></div>
    <div class="sk line"></div>
    <div class="hgrid">
      {#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="sk tile"></div>{/each}
    </div>
  </div>
{:else if yourView}
  <PageHead title="Species" compact sub="The species you grow, want, or are reading up on; the whole reference is one switch away." count="{grownN} you grow{followingN ? ` · ${followingN} following` : ''}">
    <a class="btn pri headadd" href="/plants/new">Add a plant</a>
  </PageHead>

  <!-- The box above Today, focused on a desktop: a returning grower's first act is "find 2026-0013" (round forty-one, R11).
       Its placeholder fits a phone's box; the field number is named in its label (round sixty-two; the grower review's 7). -->
  <div class="stickyhead">
  <div class="toolrow" bind:this={toolrowEl}>
    <input class="searchbar" type="search" placeholder="Search your plants by number or name…" bind:value={q} onkeydown={openTop} onfocus={pinSearch} aria-label="Search your plants by number, name or field number, and species (on this device)" use:focusOnDesktop />
    {#if searchMode}
      <button class="btn small cancelsearch" type="button" onclick={cancelSearch}>Cancel</button>
    {:else}
      <!-- A switch of view on this page, not a move to another address: the one toggle group, not a nav of buttons marked current (round fifty-eight; the accessibility review). -->
      <ToggleGroup class="viewseg" label="Which species" options={[{ value: 'mine', label: 'Your species' }, { value: 'all', label: `All ${fmtN(data.total)}` }]} value="mine" onchange={(v) => { if (v === 'all') startBrowsing(); }} />
    {/if}
  </div>
  </div>

  <!-- Hidden while a search is typed, not unmounted: it was built again on every cleared box (round fifty-two, 5). -->
  <div hidden={!!q.trim()}><Today /></div>

  {#if q.trim()}
    {@render plantsFound()}
    {#if ownHits.length}
      <p class="seccount" style="margin: 8px 0" role="status">{fmtN(ownHits.length)} of your species {ownHits.length === 1 ? 'matches' : 'match'}{plantHits.length ? '' : ' · Enter opens the first'}</p>
      <div class="rows hits" data-sveltekit-preload-data="off">
        {#each ownHits.slice(0, 60) as c (c.slug)}{@render hit(c)}{/each}
        {#if ownHits.length > 60}<p class="seccount">{ownHits.length - 60} more: type more of the name.</p>{/if}
      </div>
    {:else if !plantHits.length}
      <div class="emptybox"><p class="muted">None of your plants or species matches.</p></div>
    {/if}
    <!-- Searched here, on the device; the catalogue is one deliberate step away, and that step is the one on which the text leaves the device (round forty, R2-1). -->
    <p class="seccount" style="margin-top: 10px"><button class="linkish" type="button" id="search-catalogue" onclick={searchTheCatalogue}>Search the whole catalogue for “{q.trim()}”</button></p>
  {:else}
    {#if ownFailed}
      <p class="seccount" style="margin-top: 14px">The reference could not be reached, so your tiles are without their photographs and climate. <button class="linkish" type="button" onclick={retryOwn}>Try again</button></p>
    {/if}
    {#if mineTiles.grow.length}
      <h2 class="q grouptitle">You grow</h2>
      <div class="hgrid mine" data-sveltekit-preload-data="off">
        {#each mineTiles.grow as c (c.slug)}{@render tile(c)}{/each}
      </div>
      <!-- The offer after the tiles, one line: it was a heading, a link and a paragraph between the grower and their plants (round fifty, 1). -->
      {#if [...mineTiles.grow, ...mineTiles.follow].some((c) => c.thumbOff)}
        <div class="offer"><RefPhotoOffer link what="the reference’s photographs on your tiles" /></div>
      {/if}
    {/if}
    {#if mineTiles.follow.length}
      <h2 class="q grouptitle">Following</h2>
      <div class="hgrid mine" data-sveltekit-preload-data="off">
        {#each mineTiles.follow as c (c.slug)}{@render tile(c)}{/each}
      </div>
    {/if}
    {#if mineTiles.grow.length + mineTiles.follow.length < 6 && data.featured.length}
      {@render featured(true)}
    {/if}

  {/if}
{:else}
  <!-- While a search is typed on a phone the head steps aside with the strip and the chips: the box is the page then (round fifty, 2). -->
  <div class="headwrap" class:searching={searchMode} class:withwelcome={showWelcome}>
  <!-- To a visitor the head says what this is in three short lines, not a 62-word sentence that read as a disclaimer, and then
       shows it: one species' figures and its chart, as its page shows them (round sixty; visitor 1, the self-review's
       experience item 1). To a grower it is the catalogue's head, as before. -->
  <PageHead title={visitor ? 'Cultifolio' : 'Species'} kick={visitor ? 'Species reference' : 'Cultifolio'} compact count="{fmtN(data.total)} species · {fmtN(data.withClimate)} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
    {#if !visitor}<a class="btn pri headadd" href="/plants/new">Add a plant</a>{/if}
  </PageHead>
  {#if visitor}
    <ul class="pitch">
      <!-- The counts once, in the line above, not again here (round sixty-one; visitor 22). -->
      <!-- The list's whole reach (round sixty-two; outside review A2). On a phone this line alone is the introduction, so the
           search, the grouping and a whole catalogue row fit above the tab bar (round sixty-two; outside review A10, B1). -->
      <li>A reference for cactus, succulent and bulb species, and the plants most grown alongside them, with each one's habitat climate where its records allow one.</li>
      <!-- Precise, and said first: the templates were written once, and nothing is written for one species (round sixty-one; visitor 11). -->
      <li>Every figure names its source. Nothing about a species is written per page by a person or by AI, apart from credited quotations (<a href="/about/how#written">how</a>).</li>
      <!-- On a phone the feature is not drawn: its cards sat between the search and the rows it acts on and put the first row two screens down (round fifty, 1), and a link to it took the line the first row needs. The strip's first photograph is the same species (found at the merge of round sixty-one). -->
      <li>No sign-up. Your plants stay on your device, or sync encrypted if you choose. <a href="https://github.com/zomethingje-eng/cultifolio">Free and open source</a>.</li>
    </ul>
  {/if}
  </div>

  <!-- The way in, in one line (round twenty-eight, 13; one line since round fifty, 1: the first screen is for the search, a glimpse of the photographs and the first rows). -->
  {#if showWelcome}
    <!-- The example first: the quickest way to see the record half without typing a plant (round sixty-one; decision 9).
         It opens on Today, the page that shows most of what the record does at once (round sixty-three, V2). What a grower
         gets is said in a few words, each a page the app has (round sixty-three, V3: a visitor "isn't given the knowledge
         of the app's capabilities"); short, so the first screen still holds a whole row on a phone (V4). -->
    <p class="welcome" id="welcome"><span><b>Grow some of these?</b> Keep their record on this device: watering read against each species' habitat season, places, seed batches, frost warnings, labels. <button class="linkish trysample" type="button" id="try-sample-home" onclick={() => { const r = enterExample('/today'); exampleRefused = r === true ? null : r; }}>See the example collection</button>, <a href="/plants/new">add your first plant</a> or <a href="/backup">restore a backup</a>.</span><button class="linkish dismiss" type="button" onclick={dismissWelcome} aria-label="Not now" title="Not now">×</button></p>
    {#if exampleRefused}<p class="small" role="status" id="try-sample-home-refused">{notEnteredWords(exampleRefused)}</p>{/if}
  {:else if collection.ready && !hasMine && !collection.accessions.length && !searchMode}
    <!-- "Not now" hides the welcome for good; the way in stays, in one line, or a visitor who comes back has to find /plants/new by the tab bar (round forty-one, R9). -->
    <!-- No "nothing leaves it": the about page lists what does (round sixty; words 17). -->
    <p class="welcome quiet" id="welcome-after"><a href="/plants/new">Keep a record of your plants</a>; it stays on this device unless you turn on sync.</p>
  {/if}

  {#if visitor && data.featured.length && !searchMode}
    <!-- A stranger sees plants before a list of them: one photographed species from each of the largest genera, by rule,
         rotated daily; above the one toolbar now, so the search, the grouping and the chips sit together (round sixty; visitor 16). -->
    {@render featured(false, 'wide')}
  {/if}


  <!-- One toolbar: the search, then Group by, then the chips, then A–Z, the same shape in every grouping and chip
       (round sixty; visitor 16). The letters scroll away under it; A–Z brings them back. -->
  <div class="stickyhead">
  <div class="toolrow" bind:this={toolrowEl}>
    {#if hasMine && !searchMode}
      <!-- round fifty-eight; the accessibility review: the same toggle group as on the grower's view -->
      <ToggleGroup class="viewseg" label="Which species" options={[{ value: 'mine', label: 'Your species' }, { value: 'all', label: `All ${fmtN(data.total)}` }]} value="all" onchange={(v) => { if (v === 'mine') stopBrowsing(); }} />
    {/if}
    <input class="searchbar" type="search" placeholder="Search species, genus, family or origin…" bind:value={q} onkeydown={openTop} onfocus={pinSearch} aria-label="Search the whole species catalogue" />
    {#if searchMode}
      <!-- Typing is a mode on a phone: the box pinned under the top bar, the strip, the grouping, the chips and the letters out of the way, the matches as rows under it, and Cancel to put the page back (round fifty, 2). -->
      <button class="btn small cancelsearch" type="button" onclick={cancelSearch}>Cancel</button>
    {:else}
      <div class="tools">
        <!-- Links between addresses: the current one is the page (round fifty-eight; the accessibility review). -->
        <nav class="seg" aria-label="Group by">
          {#each ['genus', 'origin', 'family'] as const as b (b)}<a href="?by={b}{chip !== 'all' ? `&chip=${chip}` : ''}" class:on={data.by === b} aria-current={data.by === b ? 'page' : undefined}>{byLabel[b]}</a>{/each}
        </nav>
        <!-- Links between addresses, so the current one is the page, not "true" (round fifty-eight; the accessibility review). -->
        <nav class="chiprow" aria-label="Filter by climate">
          <a class="chipbtn" class:on={chip === 'all'} aria-current={chip === 'all' ? 'page' : undefined} href="?by={data.by}" aria-label="All, {fmtN(data.total)}" data-sveltekit-noscroll>All<span class="n">{fmtN(data.total)}</span></a>
          <a class="chipbtn" class:on={chip === 'climate'} aria-current={chip === 'climate' ? 'page' : undefined} href="?by={data.by}&chip=climate" aria-label="Climate known, {fmtN(data.withClimate)}" data-sveltekit-noscroll>Climate known<span class="n">{fmtN(data.withClimate)}</span></a>
          <a class="chipbtn" class:on={chip === 'noclimate'} aria-current={chip === 'noclimate' ? 'page' : undefined} href="?by={data.by}&chip=noclimate" aria-label="Without climate, {fmtN(data.total - data.withClimate)}" data-sveltekit-noscroll>Without climate<span class="n">{fmtN(data.total - data.withClimate)}</span></a>
        </nav>
        <!-- Kept in place with no index to show (regions), so the toolbar does not change shape (round sixty; visitor 16). -->
        <button class="btn small azbtn" class:noaz={data.letters.length <= 1} type="button" onclick={showLetters} aria-label="A–Z, show the letter index" aria-hidden={data.letters.length <= 1 ? 'true' : undefined} tabindex={data.letters.length <= 1 ? -1 : undefined} disabled={data.letters.length <= 1}>A–Z</button>
      </div>
    {/if}
  </div>
  </div>

  {#if searchedLine && searchMode}<p class="seccount relaxed" role="status">{searchedLine}</p>{/if}

  {#if !searchMode && data.letters.length > 1}
  <div class="filters" bind:this={filtersEl}>
    <nav class="letters" aria-label="Jump to a letter" bind:this={lettersEl}>
      {#each data.letters as l (l)}<a href="?by={data.by}{chip !== 'all' ? `&chip=${chip}` : ''}&from={l}#l-{l}" onclick={(e) => { e.preventDefault(); jumpToLetter(l); }}>{l}</a>{/each}
    </nav>
  </div>
  {/if}

  {#if flat}
    {#if q.trim()}{@render plantsFound()}{/if}
    {#if searchFailed}
      <p class="seccount" style="margin-top: 14px" role="status">{searchFailed.kind === 'offline' ? 'Offline: the catalogue search needs a connection; your own plants are under “Your species”.' : searchFailed.kind === 'limited' ? `Too many searches from this network; try again in ${Math.max(1, Math.ceil((searchFailed.wait ?? 60) / 60))} minute${(searchFailed.wait ?? 60) > 60 ? 's' : ''}.` : 'The catalogue could not be reached.'} <button class="linkish" type="button" onclick={retrySearch}>Try again</button></p>
    {:else if searching && !found.length}
      <p class="seccount" style="margin-top: 14px">Searching…</p>
    {:else if !shownFound.length}
      <!-- A way forward, not a dead end: what the reference is, and the record that works without it (round fifty-eight). -->
      <div class="emptybox"><p class="muted">Nothing in the reference matches “{q.trim()}”{chip !== 'all' && found.length ? ` with the chip on (${fmtN(found.length)} without it)` : ''}. It holds a fixed list of {fmtN(data.total)} species (<a href="/about/how#list">which ones</a>), so a plant you grow may not be on it: you can still <a href="/plants/new?species={encodeURIComponent(q.trim())}">add it as a plant</a>; its record works without a species page.</p></div>
    {:else}
      <p class="seccount" style="margin: 8px 0" role="status">{fmtN(shownFound.length)} {shownFound.length === 1 ? 'match' : 'matches'} of {fmtN(data.total)}{chip !== 'all' && shownFound.length !== found.length ? ` (${fmtN(found.length - shownFound.length)} more without the chip)` : ''} · Enter opens the first</p>
      <div class="rows hits">
        {#each shownFound as c (c.slug)}{@render hit(c)}{/each}
      </div>
    {/if}
  {:else}
    <div class="rows" class:withletters={data.letters.length > 1} style:padding-bottom={tailPad ? `${tailPad}px` : undefined}>
      {#if start > 0}<div class="more before" bind:this={topSentinel}><a class="btn small" href="?by={data.by}{chip !== 'all' ? `&chip=${chip}` : ''}&at={Math.max(0, start - 60)}" onclick={async (e) => { e.preventDefault(); if (!(await growBefore())) location.href = (e.currentTarget as HTMLAnchorElement).href; }}>Earlier {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'}</a></div>{/if}
      {#each visibleRows as r, i (r.id)}
        {#if r.letter && (i === 0 || rows[i - 1].letter !== r.letter)}<h2 class="letter" id="l-{r.letter}">{r.letter}</h2>{/if}
        <a class="grow" class:open={r.id === data.open} id="g-{r.id}" href={rowHref(r.id)} data-sveltekit-noscroll aria-expanded={r.id === data.open}>
          {#if r.map}<div class="gmap">{@html r.map}</div>{:else if r.thumb}<div class="gthumb"><img src={photoAt(r.thumb, 'square')} width="56" height="56" alt="" loading="lazy" use:failedBeforeHydration={(im) => im.remove()} /></div>{:else}<div class="gthumb mono" aria-hidden="true">{r.label[0] ?? ''}</div>{/if}
          <div class="gtx">
            <span class="gname" class:sci={data.by === 'genus'}>{r.label}</span>
            {#if r.sub}<span class="d">{r.sub}</span>{/if}
            <span class="st">{fmtN(r.count)} species · {fmtN(r.withClimate)} with climate{#if pendingOf(r)}{' · '}{fmtN(pendingOf(r))} pending{/if}{#if r.notChecked}{' · '}{fmtN(r.notChecked)} not checked{/if}</span>
          </div>
          <span class="chev" aria-hidden="true">{r.id === data.open ? '–' : '+'}</span>
        </a>
        {#if r.id === data.open && r.items}
          <div class="hgrid opened">
            {#each r.items as c (c.slug)}{@render tile(c)}{/each}
          </div>
          {#if (r.itemsCount ?? 0) > r.items.length}
            {@const at = r.itemsAt ?? 0}
            <nav class="parts" aria-label="More of {r.label}">
              <span>{fmtN(at + 1)} to {fmtN(at + r.items.length)} of {fmtN(r.itemsCount ?? 0)}</span>
              {#if at > 0}<a class="btn small" href={partHref(r.id, at - ITEMS)} data-sveltekit-noscroll>Previous {ITEMS}</a>{/if}
              {#if at + r.items.length < (r.itemsCount ?? 0)}<a class="btn small" href={partHref(r.id, at + ITEMS)} data-sveltekit-noscroll>Next {Math.min(ITEMS, (r.itemsCount ?? 0) - at - r.items.length)}</a>{/if}
            </nav>
          {/if}
        {/if}
        {#if visitor && feature && start === 0 && i === Math.min(FEATURE_AFTER, visibleRows.length) - 1}{@render featureBlock(feature)}{/if}
        {#if visitor && data.featured.length && start === 0 && i === Math.min(FEATURE_AFTER, visibleRows.length) - 1}{@render featured(false, 'phone')}{/if}
      {/each}
      {#if end < data.rowCount}<div class="more" bind:this={sentinel}><a class="btn small" href="?by={data.by}{chip !== 'all' ? `&chip=${chip}` : ''}&at={end}" onclick={async (e) => { e.preventDefault(); if (!(await growOnce())) location.href = (e.currentTarget as HTMLAnchorElement).href; }}>More of the {fmtN(data.rowCount)} {rowWord(data.rowCount)}</a></div>{/if}
    </div>
    <p class="seccount" style="margin-top: 14px">{fmtN(data.rowCount)} {rowWord(data.rowCount)} · {fmtN(chipSpecies)} species{chip === 'climate' ? ' with habitat climate' : chip === 'noclimate' ? ' without habitat climate' : ''}</p>
  {/if}
{/if}

<style>
  .plantsfound { margin: 12px 0 4px; }
  .plantsfound .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .welcome { margin: 10px 0 0; font-size: var(--fs-md); color: var(--ink2); line-height: 1.6; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  /* A little closer on a phone, where the line is four or five lines and the first row must still show (round sixty-three, V4). */
  @media (max-width: 640px) { .welcome { line-height: 1.45; } :global(html:not([data-welcomed])) .welcome:not(.quiet) ~ .stickyhead .toolrow { margin-top: 6px; } }
  .welcome .dismiss { font-size: var(--fs-xl); line-height: 1; padding: 4px 8px; min-height: var(--tap); min-width: var(--tap); text-decoration: none; } /* 44 px under a finger (round sixty; visitor 17) */
  /* The visitor's three lines, then the product itself (round sixty; visitor 1). */
  .pitch { margin: -8px 0 6px; padding-left: 1.1em; font-size: var(--fs-md); color: var(--ink2); line-height: 1.5; display: grid; gap: 2px; max-width: 46rem; }
  .pitch li::marker { color: var(--accent); }
  /* On a phone the introduction is its first line alone, one sentence, so the search, the grouping and a whole catalogue
     row are on the first screen; what the other two lines say is on the about page (round sixty-two; outside
     review A10, B1). The four feature cards stay off phones. */
  @media (max-width: 640px) { .pitch { padding-left: 0; list-style: none; } .pitch li:not(:first-child) { display: none; } }
  /* While the welcome line is shown on a phone it is the introduction, under the head's "Species reference", and the
     pitch's sentence waits until it is dismissed: the two were eight lines, and with the welcome saying what a grower
     gets, Safari's page on an iPhone SE (375 × 548) had no room left for a row (round sixty-three, V3 and V4). A device
     that dismissed the welcome draws the pitch from the first paint (`data-welcomed`, set by app.html). */
  @media (max-width: 640px) { :global(html:not([data-welcomed])) .headwrap.withwelcome .pitch { display: none; } }
  /* On a phone the first letter's heading sits right under the letter index that names it: it is kept for a screen
     reader and for `#l-A`, and not drawn, which gave the first row its 46 px (round sixty-three, V4). */
  @media (max-width: 640px) { .rows > h2.letter:first-child { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
  .feature { margin: 14px 0 6px; }
  @media (max-width: 899px) { .feature { display: none; } }
  /* The four cards two by two at every width but the narrowest, where one column keeps 200% text inside the page (round sixty-one; decision 9). */
  .fglance :global(.gcards) { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 0; }
  @media (max-width: 359px) { .fglance :global(.gcards) { grid-template-columns: minmax(0, 1fr); } }
  .fchart { display: none; }
  .featurehead { font-size: var(--fs-xs); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); font-weight: 700; font-family: var(--ui); margin: 0 0 8px; }
  .featurehead .fname { text-transform: none; letter-spacing: 0; font-size: var(--fs-md); font-weight: 600; }
  .feature :global(.climo) { margin-top: 0; }
  .fglance { min-width: 0; }
  .featurefoot { margin: 8px 0 0; color: var(--ink2); }
  /* The chart's column holds its height from the first paint, so the chart drawn after hydration moves nothing (round sixty-one; a11y 16). */
  @media (min-width: 900px) {
    .feature { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'h h' 'g c' 'f c'; grid-template-rows: auto auto 1fr; gap: 0 18px; align-items: start; }
    .featurehead { grid-area: h; }
    .fglance { grid-area: g; }
    .featurefoot { grid-area: f; }
    /* The chart's own height (the geometry's, in px) and room for its caption's lines (rem): a box at least as tall as the chart. */
    .fchart { grid-area: c; display: block; min-height: var(--fh, 38rem); }
  }
  /* The toolbar's controls after the box: one line on a desktop; on a phone one line under the box that scrolls sideways (round sixty; visitor 16). */
  .tools { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; flex: 0 1 auto; overflow-x: auto; scrollbar-width: none; }
  .tools::-webkit-scrollbar { display: none; }
  .tools .chiprow { flex-wrap: nowrap; margin: 0; gap: 6px; }
  .tools .chiprow .chipbtn, .tools .seg { flex: none; }
  @media (max-width: 900px) { .tools { flex-basis: 100%; } }
  .azbtn.noaz { visibility: hidden; }
  .relaxed { margin: 8px 0 0; }
  .ftile .fcred, .tile .cred { display: block; font-size: var(--fs-xs); color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fcred { padding: 0 9px 8px; margin-top: -4px; }
  .tile .cred { margin-top: 2px; }
  /* the grower's main switch: yours or everything; it leads the tool row on both views */
  /* :global, since the switch is the toggle group's own markup (round fifty-eight; the accessibility review). */
  .toolrow :global(.viewseg) { order: -1; }
  @media (max-width: 700px) { .headadd { display: none; } }
  @media (max-width: 640px) { .headwrap.searching { display: none; } } /* the + in the top bar is the phone's add button */
  .toolrow :global(.viewseg > button) { font-weight: 700; }
  @media (max-width: 700px) { .toolrow :global(.viewseg) { flex-basis: 100%; } .toolrow :global(.viewseg > button) { flex: 1; text-align: center; } }
  .welcome a { font-weight: 600; }
  /* A button in the sentence, read and tapped as its links are (round sixty). */
  /* A link's weight and colour, not a pill: the pill's padding took a line on a phone and pushed the first catalogue row under the tab bar (round fifty, 1; the merge of round sixty-one). */
  .welcome .linkish.trysample { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; margin: 0; padding: 0; font-size: inherit; display: inline; min-height: 0; }
  .welcome.quiet { color: var(--ink3); font-size: var(--fs-md); }
  /* dismissed on this device: hidden before first paint, by the flag app.html sets, until the state catches up at mount */
  :global(html[data-welcomed]) .welcome:not(.quiet) { display: none; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: var(--fs-md); color: var(--accent); cursor: pointer; text-decoration: underline; }
  .welcome .linkish { color: var(--ink3); margin-left: 4px; }
  /* the featured strip: one row, scrolls sideways on a phone, six-up on a desktop */
  .featured { margin: 12px 0 2px; }
  /* One strip per width: above the search on a desktop, after the first rows on a phone (round sixty-three, V4). */
  @media (max-width: 700px) { .featured.wideonly { display: none; } .featured.phoneonly { margin: 6px 0 4px; } }
  @media (min-width: 701px) { .featured.phoneonly { display: none; } }
  /* A sampler, not the page: on a phone the tiles are 112px squares, three and a half across, the first one two tiles
     wide so one photograph gets room; on a desktop the six-up grid as before (round fifty, 1). */
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: 112px; gap: 10px; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 8px; margin: 0 -2px; scrollbar-width: thin; }
  .ftile:first-child { grid-column: span 2; }
  .ftile:first-child img, .ftile:first-child .fph { aspect-ratio: 2 / 1; }
  .ftile { scroll-snap-align: start; display: block; border-radius: var(--r); overflow: hidden; background: var(--card); box-shadow: var(--sh); color: inherit; text-decoration: none; transition: transform 0.18s, box-shadow 0.18s; }
  .ftile:hover { transform: translateY(-2px); box-shadow: var(--sh2); text-decoration: none; color: inherit; }
  /* `height: auto`, or the img's height attribute (240) beats the aspect ratio: a loaded photograph drew 240 px tall in a
     112 px tile, and the live strip was 320 px high (round sixty-two; outside review A10, B1: the fixture's photographs
     never load, so no test saw it). */
  .ftile picture { display: block; }
  .ftile img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sunk); }
  .ftile .fph { width: 100%; aspect-ratio: 1; }
  .ftile .fnm { display: block; padding: 6px 9px 0; font-family: var(--serif); font-style: italic; font-size: var(--fs-md); font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fcom { display: block; padding: 1px 9px 8px; font-size: var(--fs-xs); color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fnm:last-child { padding-bottom: 8px; }
  /* On a desktop the photographs are 3 : 2, not square: the strip was 257 px high, and with the feature after the first
     rows the search and a whole row now fit a first screen of 768 px (round sixty-two; the outside triage's 2). */
  @media (min-width: 701px) { .ftile .fnm { padding: 8px 11px 0; font-size: var(--fs-md); white-space: normal; } .ftile .fcom { padding: 2px 11px 10px; font-size: var(--fs-sm); } .ftile:first-child { grid-column: auto; } .ftile img, .ftile .fph, .ftile:first-child img, .ftile:first-child .fph { aspect-ratio: 3 / 2; } }
  @media (min-width: 701px) { .strip { grid-auto-columns: minmax(0, 1fr); grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-flow: row; overflow: visible; } .ftile:nth-child(n + 7) { display: none; } }
  @media (min-width: 1000px) { .strip { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .muted { color: var(--ink3); }
  .grouptitle { font-size: var(--fs-xl); margin: 22px 0 8px; }
  .skeleton { margin-top: 22px; }
  .sk { background: var(--sunk); border-radius: var(--r); }
  .sk.head { height: 34px; width: 40%; max-width: 220px; margin-bottom: 12px; }
  .sk.line { height: 14px; width: 70%; margin-bottom: 26px; }
  .sk.tile { aspect-ratio: 1 / 1.15; }
  /* The search row alone stays pinned under the top bar while the list scrolls, at every width (round fifty, 1: the chips
     and the letters used to pin with it on a desktop; the strip now sits between the row and them, and a pinned strip is
     no strip). The block is `display: contents` so the row's containing block is the page and it stays pinned through the
     whole list (round forty-eight, 1). The A–Z button brings the chips and the index back. */
  .stickyhead { display: contents; }
  .stickyhead .toolrow { position: sticky; top: 44px; z-index: 40; background: var(--bg); margin: 10px 0 0; padding: 4px 0 8px; border-bottom: 1px solid var(--rule); }
  @media (max-height: 30em) { .stickyhead .toolrow { position: static; } } /* in em: 960 px at 200% text (round sixty-two; the accessibility review, 1) */
  .rows { overflow-anchor: none; }
  .azbtn { display: inline-flex; margin-left: auto; }
  .cancelsearch { margin-left: auto; }
  .filters { margin: 6px 0 0; }
  /* A match as a row: a 40px thumbnail or the initial, the name, the family and whether its climate is known. */
  .hitrow .im { background: var(--sunk); }
  .hitrow .im .ini { font-family: var(--serif); font-style: italic; font-size: var(--fs-xl); color: var(--ink3); }
  .hitrow .nm, .hitrow .fam { display: block; }
  .hitrow .fam { font-size: var(--fs-sm); text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--ink2); }
  .hitrow .fig { font-size: var(--fs-lg); }
  .hits { margin-top: 4px; }
  /* The grower's tiles three across on a phone, two was a screen per four plants (round fifty, 1). */
  @media (max-width: 640px) { .hgrid.mine { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } }
  .offer { margin: -4px 0 10px; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 2px; }
  /* On a phone the letter index is one line that scrolls sideways: wrapped, the live corpus's 25 letters were four lines,
     176 px, between the chips and the first row (round sixty-two; outside review B1). */
  @media (max-width: 640px) { .letters { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; } .letters::-webkit-scrollbar { display: none; } .letters a { flex: none; } }
  .parts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 10px 0 16px; font-size: var(--fs-md); color: var(--ink2); }
  .letters a { font-family: var(--mono); font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); min-width: var(--tap); min-height: var(--tap); display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r-sm); }
  .letters a:hover { background: var(--sunk); text-decoration: none; color: var(--ink); }
  .letter { font-family: var(--mono); font-size: var(--fs-sm); letter-spacing: 0.12em; color: var(--ink3); margin: 22px 0 6px; scroll-margin-top: 210px; }
  @media (max-width: 640px) { .letter { scroll-margin-top: 150px; } } /* the `#l-X` hash without JavaScript: under the pinned search row, not the desktop's whole head */
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .more { display: flex; justify-content: center; padding: 18px 0 6px; } /* a button for a reader without the observer (or without JavaScript, where it does nothing) */
  .grow { display: grid; grid-template-columns: 56px minmax(0, 1fr) 28px; gap: 14px; align-items: center; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 8px 12px 8px 8px; color: inherit; text-decoration: none; min-height: 56px; scroll-margin-top: 210px; }
  .grow:hover { text-decoration: none; color: inherit; box-shadow: var(--sh2); }
  .grow.open { outline: 2px solid var(--accent); background: color-mix(in srgb, var(--accent-soft) 45%, var(--card)); }
  .grow .gthumb.mono, .grow .gthumb:empty { display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-style: italic; font-size: var(--fs-2xl); color: var(--ink3); }
  .grow .gthumb { width: 56px; height: 56px; border-radius: var(--r); overflow: hidden; background: var(--sunk); }
  .grow .gthumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .grow .gmap { width: 56px; aspect-ratio: 2 / 1; border-radius: var(--r-sm); overflow: hidden; background: var(--map-sea); }
  .grow .gmap :global(.map) { border-radius: 0; aspect-ratio: 2 / 1; }
  .grow .gtx { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; min-width: 0; }
  /* A long family name ("Welwitschiaceae") breaks rather than push the page sideways at 320 px and 200% text (round
     sixty-two, second pass; the self-review's N10, a11y 9: /?by=family was 323 px wide). */
  .grow .gname { font-family: var(--ui); font-weight: 700; font-size: var(--fs-base); color: var(--ink); max-width: 100%; overflow-wrap: anywhere; }
  .grow .gname.sci { font-family: var(--serif); font-style: italic; font-size: var(--fs-lg); }
  .grow .d { font-size: var(--fs-md); color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .grow .st { font-family: var(--mono); font-size: var(--fs-sm); color: var(--ink3); flex-basis: 100%; }
  .grow .chev { font-family: var(--mono); font-size: var(--fs-xl); color: var(--ink3); text-align: center; }
  .hgrid.opened { margin: 8px 0 18px; animation: fold 0.2s ease-out; transform-origin: top; }
  @keyframes fold { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  @media (max-width: 700px) { .grow { grid-template-columns: 48px minmax(0, 1fr) 24px; gap: 10px; } .grow .gthumb { width: 48px; height: 48px; } .grow .gmap { width: 48px; } }
  .ownchip.following { background: var(--card); color: var(--ink2); border: 1px solid var(--rule); box-shadow: var(--sh); }
</style>

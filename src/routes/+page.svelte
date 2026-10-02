<script lang="ts">
  import Placeholder from '$lib/ui/Placeholder.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { goto, replaceState } from '$app/navigation';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { accNo } from '$lib/db/types';
  import { photoAt, photoHosts } from '$dossier/photo-size';
  import { entriesFor, searchCatalogue, catalogueRows, type Found } from '$lib/ui/index.svelte';
  import { fillBefore } from '$lib/ui/fill';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount, tick } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { groupFor } from '$core/regions';
  import type { MySpecies } from '$lib/db/species-list';
  import Today from '$lib/ui/Today.svelte';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  let { data } = $props();
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
    if (plantHits.length) { e.preventDefault(); goto(`/plants/${accNo(plantHits[0])}`); return; }
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
  });
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
    const chips = document.querySelector<HTMLElement>('.chiprow') ?? lettersEl;
    // An instant move, not a smooth one: a smooth scroll upward crosses the sentinel above the rows, the chunk it fetches
    // lands mid-animation, and Safari stops the animation where it is, part of the way (the author's phone, round forty-nine).
    window.scrollTo({ top: chips.getBoundingClientRect().top + window.scrollY - under });
    lettersEl.querySelector<HTMLElement>('a')?.focus({ preventScroll: true });
  }
  onMount(() => {
    // A page opened at ?open=<row> (a link, a bookmark, the back button) starts at the row, not at the top of a thousand rows.
    if (data.open && window.scrollY < 10) placeRow(data.open);
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
  // server), while the text matches one of the grower's plants, and when it is shaped like a plant number.
  const keepLocal = $derived(yourView || !collection.ready || plantHits.length > 0 || /^\d{2,4}-?\d/.test(q.trim()));
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
  $effect(() => {
    const text = q.trim();
    const gen = ++searchGen;
    clearTimeout(searchTimer);
    // The catalogue is searched only on the catalogue view (round forty, R2-1), and never with text that is the collection's (`keepLocal`).
    if (!text || keepLocal) { found = []; searching = false; searchFailed = null; return; }
    searching = true;
    searchTimer = setTimeout(() => {
      pendingSearch = searchCatalogue(text).then((r) => {
        if (gen !== searchGen) return;
        searching = false;
        if (r === null) { searchFailed = { kind: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unreached' }; found = []; return; }
        if ('limited' in r) { searchFailed = { kind: 'limited', wait: r.limited }; found = []; return; }
        searchFailed = null;
        found = r;
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
    ownEntries = new Map([...m.values()].map((e) => [e.slug, { key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, origin: e.origin ?? [], syn: e.syn, thumb: prefs.referencePhotos ? e.thumb : undefined, alt: prefs.referencePhotos && e.thumb ? e.name : undefined, thumbOff: !prefs.referencePhotos && !!e.thumb, photos: e.photos, open: e.open, climate: e.climate } as Item]));
  }
  $effect(() => { if (hasMine) { mine.size; prefs.referencePhotos; loadOwn(); } }); // rebuilt when the photograph preference changes
  const retryOwn = () => { ownFailed = false; loadOwn(); };
  const ownedN = $derived.by(() => {
    if (ownEntries) return [...owned.keys()].filter((k) => ownEntries!.has(k)).length;
    return [...owned.keys()].length; // until the entries are here, count what you grow, not what the corpus has of it
  });
  const byLabel = { genus: 'Genus', origin: 'Origin', family: 'Family' } as const;
  const fmtN = (n: number) => n.toLocaleString('en-US');
  // A visitor: no plants on this device (until the collection has opened, the server's catalogue stands as the visitor's page).
  const visitor = $derived(!collection.ready || (!hasMine && !collection.accessions.length));
  const openRow = $derived(data.rows.find((r) => r.id === data.open));
  const rowHref = (id: string) => `?by=${data.by}${chip !== 'all' ? `&chip=${chip}` : ''}${id === data.open ? '' : `&open=${id}`}`;
  /* ---- your species ---- */
  // A tile's data: a catalogue entry, or, until the index is here, the name alone. `missing`: the index is here and has no such species.
  type Tile = { slug: string; key?: number; name: string; family?: string; common?: string; thumb?: string; alt?: string; open?: number; climate?: string; missing?: boolean; /** the reference has a photograph, and the grower has it switched off for their own tiles */ thumbOff?: boolean };
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
  const climateWord = (c: string) => (c === 'ok' ? 'habitat climate known' : c === 'pending' ? 'habitat climate pending' : c === 'refused' ? 'habitat climate not checked: a source did not answer' : 'no habitat climate derived');
</script>

<svelte:head>
  {#if openRow}
    <!-- A genus (or family, or origin) opened by its address is its own page to a crawler: its own title, description and canonical, not the home page's 1,321 times over (round thirty-one, 5). -->
    <title>{openRow.label} — {openRow.count} species — Cultifolio</title>
    <meta name="description" content="{openRow.label}: {openRow.count} species in the reference, each with its native range, habitat climate and sources." />
    <link rel="canonical" href="https://cultifolio.com/?by={data.by}&open={data.open}" />
  {:else}
    <title>Cultifolio — a record of a living collection</title>
    <meta name="description" content="A species reference that shows its sources, and a collection record that stays on your device." />
    <link rel="canonical" href="https://cultifolio.com/" />
  {/if}
  {#if visitor && data.featured.length}
    <!-- A visitor's largest first-screen paint is a featured tile on a third party's host: the first is preloaded from the head and the
         hosts of the first three are preconnected, so the handshakes start with the stylesheet (round forty-two, 1). A grower's own
         page replaces the strip after the collection opens; the one small file this costs them is cached by then. -->
    <link rel="preload" as="image" href={photoAt(data.featured[0].thumb, 'small')} fetchpriority="high" />
    {#each photoHosts(data.featured.slice(0, 3).map((c) => c.thumb)) as h (h)}<link rel="preconnect" href={h} />{/each}
  {/if}
</svelte:head>

{#snippet plantsFound()}
  {#if plantHits.length}
    <div class="plantsfound" role="status" data-sveltekit-preload-data="off">
      {#each plantHits as a (a.id)}<a class="azrow accrow" href="/plants/{accNo(a)}"><span class="im"></span><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span><span class="fam">your plant{a.locationId ? ` · ${collection.locationName(a.locationId)}` : ''}</span></span><span class="fig">open →</span></a>{/each}
    </div>
  {/if}
{/snippet}

{#snippet featured(titled = false)}
  <section class="featured" aria-label="From the reference">
    {#if titled}<h2 class="q grouptitle">From the reference</h2>{/if}
    <div class="strip">
      {#each data.featured as c, i (c.slug)}
        <a class="ftile" href="/species/{c.slug}">
          <!-- One size by surface, not by pixel density: a 150 px tile at `small` (240 px), never `medium`, which a phone's density promoted every tile to and made the phone's home page seven megabytes (round thirty-five, R2-7). -->
          <!-- The first phone viewport shows two or three tiles, and whichever is largest is the first-screen paint: the first three
               are fetched at once, the first with priority, the rest of the strip lazily (round thirty-seven, R2-4; round forty, R2-5).
               A photograph that does not load leaves a placeholder with the name, not a blank card (round forty, own). -->
          {#if failedTiles.has(c.slug)}<div class="fph"><Placeholder name={c.name} family={c.family} caption="photograph did not load" /></div>{:else}<img src={photoAt(c.thumb, 'small')} width="240" height="240" alt="" loading={i < 3 ? 'eager' : 'lazy'} fetchpriority={i < 2 ? 'high' : 'auto'} onerror={() => (failedTiles = new Set([...failedTiles, c.slug]))} />{/if}
          <span class="fnm"><SpeciesName name={c.name} /></span>
          {#if c.common}<span class="fcom">{c.common}</span>{/if}
        </a>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet tile(c: Tile)}
  {@const own = owned.get(c.slug) ?? (c.key != null ? owned.get(`key:${c.key}`) : undefined)}
  <a class="tile" href="/species/{c.slug}">
    {#if own?.length}<span class="ownchip" title="You grow {own.length === 1 ? own[0] : own.length + ' of these'}" aria-label="You grow {own.length === 1 ? own[0] : own.length + ' of these'}">{own.length === 1 ? own[0] : `× ${own.length}`}</span>{:else if mine.get(c.slug)?.followed}<span class="ownchip following" title="On your list without a plant of it" aria-label="Following: on your list without a plant of it">following</span>{/if}
    {#if c.thumb}<div class="im"><img src={c.thumb} alt={c.alt} loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.style.display = 'none'; im.parentElement?.classList.add('ph'); im.parentElement && (im.parentElement.textContent = 'photograph did not load'); }} /></div>{:else if c.thumbOff}<div class="im"><Placeholder name={c.name} family={c.family} caption="reference photograph off" title="The reference has a photograph; showing it on your own tiles is off" /></div>{:else if c.climate}<div class="im"><Placeholder name={c.name} family={c.family} caption="no open photograph on file" /></div>{:else if c.missing}<div class="im"><Placeholder name={c.name} family={c.family} caption="not in the reference" /></div>{:else}<div class="im ph">{ownFailed ? 'reference not reached' : 'loading…'}</div>{/if}
    <div class="tx">
      <div class="nm"><SpeciesName name={c.name} /></div>
      <div class="fam">{c.common ?? c.family ?? ''}</div>
      <!-- the index carries the openly licensed count only; the species page's "in range" total is another figure, so this one is named for what it is (round eighteen, 7) -->
      <div class="fig" title={c.climate ? climateWord(c.climate) : undefined}>{c.climate === 'ok' ? `${c.open ? `${c.open} open record${c.open === 1 ? '' : 's'}` : 'habitat climate'}` : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : c.climate ? 'no habitat climate' : c.missing ? 'not in the reference' : ''}</div>
    </div>
  </a>
{/snippet}

{#snippet hit(c: Tile)}
  <!-- A match as a row, not a tile: five or six fit between the pinned box and a phone's keyboard, and update as the letters go in (round fifty, 2). -->
  <a class="azrow hitrow" href="/species/{c.slug}">
    <span class="im">{#if c.thumb}<img src={photoAt(c.thumb, 'square')} width="40" height="40" alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{:else}<span class="ini">{c.name[0] ?? ''}</span>{/if}</span>
    <span>
      <span class="nm"><SpeciesName name={c.name} /></span>
      <span class="fam">{[c.common, c.family, c.climate === 'ok' ? 'climate known' : c.climate === 'pending' ? 'climate pending' : c.climate ? 'no habitat climate' : ''].filter(Boolean).join(' · ')}</span>
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

  <!-- The box above Today, focused on a desktop: a returning grower's first act is "find 2026-0013" (round forty-one, R11). -->
  <div class="stickyhead">
  <div class="toolrow" bind:this={toolrowEl}>
    <input class="searchbar" type="search" placeholder="Search your plants by number, name or field number…" bind:value={q} onkeydown={openTop} onfocus={pinSearch} aria-label="Search your plants and species (on this device)" use:focusOnDesktop />
    {#if searchMode}
      <button class="btn small cancelsearch" type="button" onclick={cancelSearch}>Cancel</button>
    {:else}
      <nav class="seg viewseg" aria-label="Which species">
        <button type="button" class="on" aria-current="true">Your species</button>
        <button type="button" onclick={startBrowsing}>All {fmtN(data.total)}</button>
      </nav>
    {/if}
  </div>
  </div>

  {#if !q.trim()}<Today />{/if}

  {#if q.trim()}
    {@render plantsFound()}
    {#if ownHits.length}
      <p class="seccount" style="margin: 8px 0" role="status">{fmtN(ownHits.length)} of your species {ownHits.length === 1 ? 'matches' : 'match'}{plantHits.length ? '' : ' · Enter opens the first'}</p>
      <div class="rows hits" data-sveltekit-preload-data="off">
        {#each ownHits as c (c.slug)}{@render hit(c)}{/each}
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
  <div class="headwrap" class:searching={searchMode}>
  <PageHead title="Species" compact sub={visitor ? 'A reference to the plants people grow, every figure with its source; your own plants stay on this device.' : undefined} count="{fmtN(data.total)} species · {fmtN(data.withClimate)} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
    {#if !visitor}<a class="btn pri headadd" href="/plants/new">Add a plant</a>{/if}
  </PageHead>
  </div>

  <!-- The way in, in one line (round twenty-eight, 13; one line since round fifty, 1: the first screen is for the search, a glimpse of the photographs and the first rows). -->
  {#if (!collection.ready || (!hasMine && !collection.accessions.length)) && !welcomeHidden && !searchMode}
    <p class="welcome" id="welcome"><span><b>New here?</b> <a href="/plants/new">Add a plant</a> · <a href="/backup">bring in a collection</a></span><button class="linkish dismiss" type="button" onclick={dismissWelcome} aria-label="Not now" title="Not now">×</button></p>
  {:else if collection.ready && !hasMine && !collection.accessions.length && !searchMode}
    <!-- "Not now" hides the welcome for good; the way in stays, in one line, or a visitor who comes back has to find /plants/new by the tab bar (round forty-one, R9). -->
    <p class="welcome quiet" id="welcome-after"><a href="/plants/new">Keep a record of your plants</a> on this device; nothing leaves it.</p>
  {/if}

  <div class="stickyhead">
  <div class="toolrow" bind:this={toolrowEl}>
    {#if hasMine && !searchMode}
      <nav class="seg viewseg" aria-label="Which species">
        <button type="button" onclick={stopBrowsing}>Your species</button>
        <button type="button" class="on" aria-current="true">All {fmtN(data.total)}</button>
      </nav>
    {/if}
    <input class="searchbar" type="search" placeholder="Search the catalogue by name, genus, family or origin…" bind:value={q} onkeydown={openTop} onfocus={pinSearch} aria-label="Search the whole species catalogue" />
    {#if searchMode}
      <!-- Typing is a mode on a phone: the box pinned under the top bar, the strip, the grouping, the chips and the letters out of the way, the matches as rows under it, and Cancel to put the page back (round fifty, 2). -->
      <button class="btn small cancelsearch" type="button" onclick={cancelSearch}>Cancel</button>
    {:else}
      <nav class="seg" aria-label="Group by">
        {#each ['genus', 'origin', 'family'] as const as b (b)}<a href="?by={b}{chip !== 'all' ? `&chip=${chip}` : ''}" class:on={data.by === b} aria-current={data.by === b ? 'true' : undefined}>{byLabel[b]}</a>{/each}
      </nav>
      <!-- The chips and the letter index scroll away under the pinned search row; this brings them back (round forty-eight, 1) -->
      {#if data.letters.length > 1}<button class="btn small azbtn" type="button" onclick={showLetters} aria-label="Show the letter index">A–Z</button>{/if}
    {/if}
  </div>
  </div>

  {#if visitor && data.featured.length && !searchMode}
    <!-- A stranger sees plants before a list of them: one photographed species from each of the largest genera, by rule, rotated daily; under the search since round fifty, as a sampler rather than the page. -->
    {@render featured()}
  {/if}

  {#if !searchMode}
  <div class="filters" bind:this={filtersEl}>
  <div class="chiprow">
    <a class="chipbtn" class:on={chip === 'all'} aria-current={chip === 'all' ? 'true' : undefined} href="?by={data.by}" data-sveltekit-noscroll>All<span class="n">{fmtN(data.total)}</span></a>
    <a class="chipbtn" class:on={chip === 'climate'} aria-current={chip === 'climate' ? 'true' : undefined} href="?by={data.by}&chip=climate" data-sveltekit-noscroll>Climate known<span class="n">{fmtN(data.withClimate)}</span></a>
    <a class="chipbtn" class:on={chip === 'noclimate'} aria-current={chip === 'noclimate' ? 'true' : undefined} href="?by={data.by}&chip=noclimate" data-sveltekit-noscroll>Without climate<span class="n">{fmtN(data.total - data.withClimate)}</span></a>
  </div>
  {#if data.letters.length > 1}
    <nav class="letters" aria-label="Jump to a letter" bind:this={lettersEl}>
      {#each data.letters as l (l)}<a href="?by={data.by}{chip !== 'all' ? `&chip=${chip}` : ''}&from={l}#l-{l}" onclick={(e) => { e.preventDefault(); jumpToLetter(l); }}>{l}</a>{/each}
    </nav>
  {/if}
  </div>
  {/if}

  {#if flat}
    {#if q.trim()}{@render plantsFound()}{/if}
    {#if searchFailed}
      <p class="seccount" style="margin-top: 14px" role="status">{searchFailed.kind === 'offline' ? 'Offline: the catalogue search needs a connection; your own plants are under “Your species”.' : searchFailed.kind === 'limited' ? `Too many searches from this network; try again in ${Math.max(1, Math.ceil((searchFailed.wait ?? 60) / 60))} minute${(searchFailed.wait ?? 60) > 60 ? 's' : ''}.` : 'The catalogue could not be reached.'} <button class="linkish" type="button" onclick={retrySearch}>Try again</button></p>
    {:else if searching && !found.length}
      <p class="seccount" style="margin-top: 14px">Searching…</p>
    {:else if !shownFound.length}
      <div class="emptybox"><p class="muted">Nothing matches{chip !== 'all' && found.length ? ` with the chip on (${fmtN(found.length)} without it)` : ''}.</p></div>
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
          {#if r.map}<div class="gmap">{@html r.map}</div>{:else if r.thumb}<div class="gthumb"><img src={photoAt(r.thumb, 'square')} width="56" height="56" alt="" loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.remove(); }} /></div>{:else}<div class="gthumb mono" aria-hidden="true">{r.label[0] ?? ''}</div>{/if}
          <div class="gtx">
            <span class="gname" class:sci={data.by === 'genus'}>{r.label}</span>
            {#if r.sub}<span class="d">{r.sub}</span>{/if}
            <span class="st">{r.count} species · {r.withClimate} with climate</span>
          </div>
          <span class="chev" aria-hidden="true">{r.id === data.open ? '–' : '+'}</span>
        </a>
        {#if r.id === data.open && r.items}
          <div class="hgrid opened">
            {#each r.items as c (c.slug)}{@render tile(c)}{/each}
          </div>
        {/if}
      {/each}
      {#if end < data.rowCount}<div class="more" bind:this={sentinel}><a class="btn small" href="?by={data.by}{chip !== 'all' ? `&chip=${chip}` : ''}&at={end}" onclick={async (e) => { e.preventDefault(); if (!(await growOnce())) location.href = (e.currentTarget as HTMLAnchorElement).href; }}>More of the {fmtN(data.rowCount)} {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'}</a></div>{/if}
    </div>
    <p class="seccount" style="margin-top: 14px">{fmtN(data.rowCount)} {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'} · {fmtN(data.total)} species</p>
  {/if}
{/if}

<style>
  .plantsfound { margin: 12px 0 4px; }
  .plantsfound .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .welcome { margin: 10px 0 0; font-size: 13.5px; color: var(--ink2); line-height: 1.6; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .welcome .dismiss { font-size: 20px; line-height: 1; padding: 4px 8px; min-height: 0; text-decoration: none; }
  /* the grower's main switch: yours or everything; it leads the tool row on both views */
  .viewseg { order: -1; }
  @media (max-width: 700px) { .headadd { display: none; } }
  @media (max-width: 640px) { .headwrap.searching { display: none; } } /* the + in the top bar is the phone's add button */
  .viewseg > button { font-weight: 700; }
  @media (max-width: 700px) { .viewseg { flex-basis: 100%; } .viewseg > button { flex: 1; text-align: center; } }
  .welcome a { font-weight: 600; }
  .welcome.quiet { color: var(--ink3); font-size: 13px; }
  /* dismissed on this device: hidden before first paint, by the flag app.html sets, until the state catches up at mount */
  :global(html[data-welcomed]) .welcome:not(.quiet) { display: none; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: 13px; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .welcome .linkish { color: var(--ink3); margin-left: 4px; }
  /* the featured strip: one row, scrolls sideways on a phone, six-up on a desktop */
  .featured { margin: 12px 0 2px; }
  /* A sampler, not the page: on a phone the tiles are 112px squares, three and a half across, the first one two tiles
     wide so one photograph gets room; on a desktop the six-up grid as before (round fifty, 1). */
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: 112px; gap: 10px; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 8px; margin: 0 -2px; scrollbar-width: thin; }
  .ftile:first-child { grid-column: span 2; }
  .ftile:first-child img, .ftile:first-child .fph { aspect-ratio: 2 / 1; }
  .ftile { scroll-snap-align: start; display: block; border-radius: var(--r); overflow: hidden; background: var(--card); box-shadow: var(--sh); color: inherit; text-decoration: none; transition: transform 0.18s, box-shadow 0.18s; }
  .ftile:hover { transform: translateY(-2px); box-shadow: var(--sh2); text-decoration: none; color: inherit; }
  .ftile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sunk); }
  .ftile .fph { width: 100%; aspect-ratio: 1; }
  .ftile .fnm { display: block; padding: 6px 9px 0; font-family: var(--serif); font-style: italic; font-size: 13px; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fcom { display: block; padding: 1px 9px 8px; font-size: 11px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fnm:last-child { padding-bottom: 8px; }
  @media (min-width: 701px) { .ftile .fnm { padding: 8px 11px 0; font-size: 14px; white-space: normal; } .ftile .fcom { padding: 2px 11px 10px; font-size: 11.5px; } .ftile:first-child { grid-column: auto; } .ftile:first-child img, .ftile:first-child .fph { aspect-ratio: 1; } }
  @media (min-width: 701px) { .strip { grid-auto-columns: minmax(0, 1fr); grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-flow: row; overflow: visible; } .ftile:nth-child(n + 7) { display: none; } }
  @media (min-width: 1000px) { .strip { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .muted { color: var(--ink3); }
  .grouptitle { font-size: 20px; margin: 22px 0 8px; }
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
  @media (max-height: 480px) { .stickyhead .toolrow { position: static; } }
  .rows { overflow-anchor: none; }
  .azbtn { display: inline-flex; margin-left: auto; }
  .cancelsearch { margin-left: auto; }
  .filters { margin: 6px 0 0; }
  .filters .chiprow { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 4px 0 6px; }
  .filters .chiprow .chipbtn { flex: none; }
  /* A match as a row: a 40px thumbnail or the initial, the name, the family and whether its climate is known. */
  .hitrow .im { background: var(--sunk); }
  .hitrow .im .ini { font-family: var(--serif); font-style: italic; font-size: 18px; color: var(--ink3); }
  .hitrow .nm, .hitrow .fam { display: block; }
  .hitrow .fam { font-size: 12px; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--ink2); }
  .hitrow .fig { font-size: 16px; }
  .hits { margin-top: 4px; }
  /* The grower's tiles three across on a phone, two was a screen per four plants (round fifty, 1). */
  @media (max-width: 640px) { .hgrid.mine { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } }
  .offer { margin: -4px 0 10px; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 2px; }
  .letters a { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--ink2); min-width: 30px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; }
  .letters a:hover { background: var(--sunk); text-decoration: none; color: var(--ink); }
  .letter { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; color: var(--ink3); margin: 22px 0 6px; scroll-margin-top: 210px; }
  @media (max-width: 640px) { .letter { scroll-margin-top: 150px; } } /* the `#l-X` hash without JavaScript: under the pinned search row, not the desktop's whole head */
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .more { display: flex; justify-content: center; padding: 18px 0 6px; } /* a button for a reader without the observer (or without JavaScript, where it does nothing) */
  .grow { display: grid; grid-template-columns: 56px minmax(0, 1fr) 28px; gap: 14px; align-items: center; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 8px 12px 8px 8px; color: inherit; text-decoration: none; min-height: 56px; scroll-margin-top: 210px; }
  .grow:hover { text-decoration: none; color: inherit; box-shadow: var(--sh2); }
  .grow.open { outline: 2px solid var(--accent); background: color-mix(in srgb, var(--accent-soft) 45%, var(--card)); }
  .grow .gthumb.mono, .grow .gthumb:empty { display: flex; align-items: center; justify-content: center; font-family: var(--serif); font-style: italic; font-size: 22px; color: var(--ink3); }
  .grow .gthumb { width: 56px; height: 56px; border-radius: 8px; overflow: hidden; background: var(--sunk); }
  .grow .gthumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .grow .gmap { width: 56px; aspect-ratio: 2 / 1; border-radius: 6px; overflow: hidden; background: var(--map-sea); }
  .grow .gmap :global(.map) { border-radius: 0; aspect-ratio: 2 / 1; }
  .grow .gtx { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; min-width: 0; }
  .grow .gname { font-family: var(--ui); font-weight: 700; font-size: 15px; color: var(--ink); }
  .grow .gname.sci { font-family: var(--serif); font-style: italic; font-size: 17px; }
  .grow .d { font-size: 12.5px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .grow .st { font-family: var(--mono); font-size: 11.5px; color: var(--ink3); flex-basis: 100%; }
  .grow .chev { font-family: var(--mono); font-size: 18px; color: var(--ink3); text-align: center; }
  .hgrid.opened { margin: 8px 0 18px; animation: fold 0.2s ease-out; transform-origin: top; }
  @keyframes fold { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  @media (max-width: 700px) { .grow { grid-template-columns: 48px minmax(0, 1fr) 24px; gap: 10px; } .grow .gthumb { width: 48px; height: 48px; } .grow .gmap { width: 48px; } }
  .ownchip.following { background: var(--card); color: var(--ink2); border: 1px solid var(--rule); box-shadow: var(--sh); }
</style>

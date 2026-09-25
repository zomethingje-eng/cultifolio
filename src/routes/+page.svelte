<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { goto, replaceState } from '$app/navigation';
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { accNo } from '$lib/db/types';
  import { photoAt } from '$dossier/photo-size';
  import { entriesFor } from '$lib/ui/index.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount, tick } from 'svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { groupFor } from '$core/regions';
  import type { MySpecies } from '$lib/db/species-list';
  import { prepare, search } from '$core/search';
  import Today from '$lib/ui/Today.svelte';
  let { data } = $props();
  // The search lives in the URL (?q=) so the back button and a shared link bring it back; the server ignores it.
  let q = $state(browser ? (new URLSearchParams(location.search).get('q') ?? '') : '');
  // The search lives in the URL (?q=) so the back button and a shared link bring it back; the server ignores it.
  $effect(() => {
    if (!browser) return;
    const u = new URL(location.href);
    if (q.trim()) u.searchParams.set('q', q.trim()); else u.searchParams.delete('q');
    if (u.href !== location.href) replaceState(u, page.state);
  });
  /** Enter in the search opens the first match: the way a search box is expected to behave. */
  function openTop(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    if (plantHits.length) { e.preventDefault(); goto(`/plants/${accNo(plantHits[0])}`); return; }
    const top = (yourView ? hits : found)[0];
    if (top) { e.preventDefault(); goto(`/species/${top.slug}`); }
  }
  /** The one search box also finds the grower's own plants by number, field number or name: a returning grower types "2026-0007" here first. */
  const plantHits = $derived.by(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !collection.ready || needle.length < 2) return [];
    return collection.accessions.filter((a) => accNo(a).toLowerCase().includes(needle) || (a.fieldNumber ?? '').toLowerCase().includes(needle) || (a.nameAsReceived ?? '').toLowerCase().includes(needle) || (a.cultivar ?? '').toLowerCase().includes(needle)).slice(0, 5);
  });
  let chip = $state<'all' | 'owned' | 'climate' | 'noclimate'>('all');
  let welcomeHidden = $state(true);
  // A returning grower's device remembers that the page will be their species, not the catalogue: until the collection is
  // open, the server-rendered catalogue is swapped for a light skeleton so neither the wrong head nor "You grow 0" shows.
  // The server never sees the hint, so crawlers and first visits get the catalogue at once.
  const HINT = 'cultifolio.hasMine';
  let expectMine = $state(false);
  /*
   * The catalogue is 1,321 genera; as HTML that is ten thousand nodes, which a phone lays out before it can scroll. So
   * the page renders a first window of rows (enough to fill several screens) and appends the rest as the reader nears
   * the end, in chunks large enough that a fling does not outrun it. A letter tap, a `#l-X` link and a `?open=` row all
   * render up to what they need before they scroll to it, so they land where they say. Search and the chips read the
   * index, not these rows, and are unaffected.
   */
  const WINDOW = 120, CHUNK = 160;
  /** Where the window starts: the letter asked for with `?from=` (a reader without JavaScript), else the top. */
  // svelte-ignore state_referenced_locally
  let start = $state(data.start);
  const firstNeeded = () => { const i = data.open ? data.rows.findIndex((r) => r.id === data.open) : -1; return Math.max(WINDOW, i - data.start + 30); };
  let shown = $state(firstNeeded());
  $effect(() => { data.rows; data.open; data.start; start = data.start; shown = firstNeeded(); }); // a new grouping, letter or opened row: start again from what it needs
  const visibleRows = $derived(data.rows.slice(start, start + shown));
  let sentinel = $state<HTMLElement | null>(null);
  /** Append a chunk, and keep appending while the end of the list is still within reach of the viewport (a tall screen, a fling that landed on it). */
  async function growWhileNear() {
    while (sentinel && start + shown < data.rows.length && sentinel.getBoundingClientRect().top < window.innerHeight + 1600) {
      shown = Math.min(data.rows.length - start, shown + CHUNK);
      await tick();
    }
  }
  $effect(() => {
    if (!sentinel || start + shown >= data.rows.length) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) growWhileNear(); }, { rootMargin: '1600px 0px' });
    io.observe(sentinel);
    return () => io.disconnect();
  });
  /** Render every row up to the end of a letter, then scroll to its heading; the hash is kept so the back button and a copied link behave. */
  async function jumpToLetter(l: string) {
    let first = -1, last = -1;
    data.rows.forEach((r, i) => { if (r.letter === l) { if (first < 0) first = i; last = i; } });
    if (last < 0) return;
    if (first < start) { shown += start; start = 0; } // a letter above the window: the window opens from the top
    shown = Math.max(shown, last + 1 - start);
    await tick();
    document.getElementById(`l-${l}`)?.scrollIntoView();
    history.replaceState(history.state, '', `#l-${l}`);
  }
  onMount(() => {
    // A page opened at ?open=<row> (a link, a bookmark, the back button) starts at the row, not at the top of a thousand rows.
    if (data.open && window.scrollY < 10) {
      const el = document.getElementById(`g-${data.open}`);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120 });
    }
    const fromHash = () => { const m = /^#l-(.+)$/.exec(location.hash); if (m) jumpToLetter(decodeURIComponent(m[1])); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    try {
      expectMine = localStorage.getItem(HINT) === '1';
    } catch {
      expectMine = false;
    }
    (async () => {
      await collection.load();
      try {
        welcomeHidden = localStorage.getItem('cultifolio.welcomed') === '1';
      } catch {
        welcomeHidden = false;
      }
    })();
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
    return m;
  });
  // Your species: what you grow or follow. Empty until the collection is open, so the server-rendered catalogue stands until then.
  const mine = $derived(collection.ready ? collection.mySpecies : new Map<string, MySpecies>());
  const hasMine = $derived(mine.size > 0);
  // The page is a switch: your species when you have any, the catalogue otherwise or when you ask to browse it.
  let browsing = $state(false);
  const yourView = $derived(hasMine && !browsing);
  // The hint says "your species" is coming; hold the catalogue back until the collection says which view this is.
  const settling = $derived(expectMine && !collection.ready);
  type Item = NonNullable<(typeof data.rows)[number]['items']>[number];
  // The full catalogue, fetched once and only when a search or a chip needs to cut across the grouping.
  let full = $state<Item[] | null>(null);
  let loadingFull = $state(false);
  let fullFailed = $state(false);
  async function loadFull() {
    if (full || loadingFull || fullFailed) return; // a failed load (offline) is retried by the button, never by the effect
    loadingFull = true;
    try {
      const r = await fetch('/api/index');
      if (!r.ok) fullFailed = true;
      if (r.ok) {
        const idx = (await r.json()) as Array<{ key: number; slug: string; name: string; family?: string; common?: string; origin?: string[]; thumb?: string; photos: number; open: number; climate: string }>;
        full = idx.map((e) => ({ key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, origin: e.origin ?? [], thumb: e.thumb, alt: e.thumb ? e.name : undefined, photos: e.photos, open: e.open, climate: e.climate }));
      }
    } catch {
      fullFailed = true;
    } finally {
      loadingFull = false;
    }
  }
  const retryFull = () => { fullFailed = false; loadFull(); };
  const flat = $derived(!!q.trim() || chip !== 'all');
  $effect(() => {
    if (flat) loadFull();
  });
  // A grower's own tiles come from a small request for their own species; the whole catalogue is fetched only for a search or a chip.
  let ownEntries = $state<Map<string, Item> | null>(null);
  let ownFailed = $state(false);
  async function loadOwn() {
    if (ownFailed) return;
    const m = await entriesFor([...mine.keys()]);
    if (!m) { ownFailed = true; return; }
    ownEntries = new Map([...m.values()].map((e) => [e.slug, { key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, origin: e.origin ?? [], thumb: e.thumb, alt: e.thumb ? e.name : undefined, photos: e.photos, open: e.open, climate: e.climate } as Item]));
  }
  $effect(() => { if (hasMine && !full) { mine.size; loadOwn(); } });
  const retryOwn = () => { ownFailed = false; loadOwn(); };
  const ownedN = $derived.by(() => {
    if (full) return [...owned.keys()].filter((k) => full!.some((c) => c.slug === k)).length;
    if (ownEntries) return [...owned.keys()].filter((k) => ownEntries!.has(k)).length;
    return [...owned.keys()].length; // until the full index is here, count what you grow, not what the corpus has of it
  });
  const prepared = $derived(full ? prepare(full) : null);
  const chipOk = (c: Item) => (chip === 'owned' ? owned.has(c.slug) : chip === 'climate' ? c.climate === 'ok' : chip === 'noclimate' ? c.climate !== 'ok' : true);
  // A search or a chip flattens the catalogue: matches across every group, so nothing hides inside a closed row. A search
  // is ranked (genus first, then names, then common names, families and origins; one typing error forgiven when the
  // exact spelling finds nothing); a chip alone is alphabetical.
  const found = $derived.by(() => {
    if (!flat || !full || !prepared) return [];
    const base = q.trim() ? search(prepared, q) : [...full].sort((a, b) => a.name.localeCompare(b.name));
    return base.filter(chipOk);
  });
  const byLabel = { genus: 'Genus', origin: 'Origin', family: 'Family' } as const;
  const fmtN = (n: number) => n.toLocaleString('en-US');
  // A visitor: no plants on this device (until the collection has opened, the server's catalogue stands as the visitor's page).
  const visitor = $derived(!collection.ready || (!hasMine && !collection.accessions.length));
  const openRow = $derived(data.rows.find((r) => r.id === data.open));
  const rowHref = (id: string) => `?by=${data.by}${id === data.open ? '' : `&open=${id}`}`;
  /* ---- your species ---- */
  // A tile's data: a catalogue entry, or, until the index is here, the name alone. `missing`: the index is here and has no such species.
  type Tile = { slug: string; name: string; family?: string; common?: string; thumb?: string; alt?: string; open?: number; climate?: string; missing?: boolean };
  const mineTiles = $derived.by(() => {
    const list = [...mine.values()].sort((a, b) => a.name.localeCompare(b.name));
    const bySlug = full ? new Map(full.map((c) => [c.slug, c])) : ownEntries;
    const toTile = (s: { slug: string; name: string }): Tile => bySlug?.get(s.slug) ?? { slug: s.slug, name: s.name, missing: !!bySlug };
    return { grow: list.filter((s) => s.grown > 0).map(toTile), follow: list.filter((s) => !s.grown && s.followed).map(toTile) };
  });
  const grownN = $derived(mineTiles.grow.length);
  const followingN = $derived(mineTiles.follow.length);
  // Catalogue matches for a search typed on your species view: the whole corpus, flat and alphabetical.
  const hits = $derived(yourView && q.trim() && prepared ? search(prepared, q) : []);
  const startBrowsing = () => {
    browsing = true;
    q = '';
  };
  const stopBrowsing = () => {
    browsing = false;
    q = '';
    chip = 'all';
  };
  /** The climate state in words: a refusal is never shown as an absence. */
  const climateWord = (c: string) => (c === 'ok' ? 'habitat climate known' : c === 'pending' ? 'habitat climate pending' : c === 'refused' ? 'habitat climate not checked: a source did not answer' : 'no habitat climate derived');
</script>

<svelte:head>
  <title>Cultifolio — a record of a living collection</title>
  <meta name="description" content="A species reference that shows its sources, and a collection record that stays on your device." />
</svelte:head>

{#snippet plantsFound()}
  {#if plantHits.length}
    <div class="plantsfound" role="status">
      {#each plantHits as a (a.id)}<a class="azrow accrow" href="/plants/{accNo(a)}"><span class="im"></span><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span><span class="fam">your plant{a.locationId ? ` · ${collection.locationName(a.locationId)}` : ''}</span></span><span class="fig">open →</span></a>{/each}
    </div>
  {/if}
{/snippet}

{#snippet featured(titled = false)}
  <section class="featured" aria-label="From the reference">
    {#if titled}<h2 class="q grouptitle">From the reference</h2>{/if}
    <div class="strip">
      {#each data.featured as c (c.slug)}
        <a class="ftile" href="/species/{c.slug}">
          <img src={c.thumb} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')} />
          <span class="fnm"><SpeciesName name={c.name} /></span>
          {#if c.common}<span class="fcom">{c.common}</span>{/if}
        </a>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet tile(c: Tile)}
  <a class="tile" href="/species/{c.slug}">
    {#if owned.get(c.slug)?.length}<span class="ownchip" title="You grow {owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : owned.get(c.slug)!.length + ' of these'}" aria-label="You grow {owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : owned.get(c.slug)!.length + ' of these'}">{owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : `× ${owned.get(c.slug)!.length}`}</span>{:else if mine.get(c.slug)?.followed}<span class="ownchip following" title="On your list without a plant of it" aria-label="Following: on your list without a plant of it">following</span>{/if}
    {#if c.thumb}<div class="im"><img src={c.thumb} alt={c.alt} loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.style.display = 'none'; im.parentElement?.classList.add('ph'); im.parentElement && (im.parentElement.textContent = 'photograph did not load'); }} /></div>{:else if c.climate}<div class="im ph">no open photograph on file</div>{:else if c.missing}<div class="im ph">not in the reference yet</div>{:else}<div class="im ph">{loadingFull ? 'loading…' : fullFailed || ownFailed ? 'reference not reached' : ''}</div>{/if}
    <div class="tx">
      <div class="nm"><SpeciesName name={c.name} /></div>
      <div class="fam">{c.common ?? c.family ?? ''}</div>
      <div class="fig" title={c.climate ? climateWord(c.climate) : undefined}>{c.climate === 'ok' ? `${c.open ? `${c.open} wild record${c.open === 1 ? '' : 's'}` : 'habitat climate'}` : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : c.climate ? 'no habitat climate' : c.missing ? 'not in the reference' : ''}</div>
    </div>
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
  <PageHead title="Species" sub="The species you grow, want, or are reading up on; the whole reference is one switch away." count="{grownN} you grow{followingN ? ` · ${followingN} following` : ''}">
    <a class="btn pri headadd" href="/plants/new">Add a plant</a>
  </PageHead>

  <Today />

  <div class="toolrow">
    <input class="searchbar" type="search" placeholder="Search all {fmtN(data.total)} species by name, genus, family or origin…" bind:value={q} onkeydown={openTop} aria-label="Search the whole species catalogue" />
    <nav class="seg viewseg" aria-label="Which species">
      <button type="button" class="on" aria-current="true">Your species</button>
      <button type="button" onclick={startBrowsing}>All {fmtN(data.total)}</button>
    </nav>
  </div>

  {#if q.trim()}
    {@render plantsFound()}
    {#if !full}
      <p class="seccount" style="margin-top: 14px">{fullFailed ? 'The catalogue could not be reached.' : 'Loading the whole catalogue…'}{#if fullFailed} <button class="linkish" type="button" onclick={retryFull}>Try again</button>{/if}</p>
    {:else if !hits.length}
      <div class="emptybox"><p class="muted">Nothing in the catalogue matches.</p></div>
    {:else}
      <div class="hgrid">
        {#each hits as c (c.slug)}{@render tile(c)}{/each}
      </div>
      <p class="seccount" style="margin-top: 14px" role="status">{fmtN(hits.length)} of {fmtN(data.total)} match; Enter opens the first.</p>
    {/if}
  {:else}
    {#if fullFailed || ownFailed}
      <p class="seccount" style="margin-top: 14px">The reference could not be reached, so your tiles are without their photographs and climate. <button class="linkish" type="button" onclick={() => { retryFull(); retryOwn(); }}>Try again</button></p>
    {/if}
    {#if mineTiles.grow.length}
      <h2 class="q grouptitle">You grow</h2>
      <div class="hgrid">
        {#each mineTiles.grow as c (c.slug)}{@render tile(c)}{/each}
      </div>
    {/if}
    {#if mineTiles.follow.length}
      <h2 class="q grouptitle">Following</h2>
      <div class="hgrid">
        {#each mineTiles.follow as c (c.slug)}{@render tile(c)}{/each}
      </div>
    {/if}
    {#if mineTiles.grow.length + mineTiles.follow.length < 6 && data.featured.length}
      {@render featured(true)}
    {/if}

  {/if}
{:else}
  <PageHead title="Species" sub={visitor ? 'A reference to the plants people grow, every figure with its source; your own plants stay on this device.' : undefined} count="{fmtN(data.total)} species · {fmtN(data.withClimate)} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
    {#if !visitor}<a class="btn pri headadd" href="/plants/new">Add a plant</a>{/if}
  </PageHead>

  {#if visitor && data.featured.length}
    <!-- A stranger sees plants before a list of them: one photographed species from each of the largest genera, by rule, rotated daily. -->
    {@render featured()}
  {/if}

  {#if collection.ready && !hasMine && !collection.accessions.length && !welcomeHidden}
    <p class="welcome" id="welcome"><b>New here.</b> <a href="/plants/new">Add your first plant</a> · <a href="/backup">Restore a backup or import from v2</a> <button class="linkish" type="button" onclick={dismissWelcome}>Not now</button></p>
  {/if}

  <div class="toolrow">
    {#if hasMine}
      <nav class="seg viewseg" aria-label="Which species">
        <button type="button" onclick={stopBrowsing}>Your species</button>
        <button type="button" class="on" aria-current="true">All {fmtN(data.total)}</button>
      </nav>
    {/if}
    <input class="searchbar" type="search" placeholder="Search by name, genus, family or origin…" bind:value={q} onkeydown={openTop} aria-label="Search species" />
    <nav class="seg" aria-label="Group by">
      {#each ['genus', 'origin', 'family'] as const as b (b)}<a href="?by={b}" class:on={data.by === b} aria-current={data.by === b ? 'true' : undefined}>{byLabel[b]}</a>{/each}
    </nav>
  </div>
  <div class="chiprow">
    <button class="chipbtn" class:on={chip === 'all'} aria-pressed={chip === 'all'} onclick={() => (chip = 'all')}>All<span class="n">{fmtN(data.total)}</span></button>
    <button class="chipbtn" class:on={chip === 'climate'} aria-pressed={chip === 'climate'} onclick={() => (chip = 'climate')}>Climate known<span class="n">{fmtN(data.withClimate)}</span></button>
    <button class="chipbtn" class:on={chip === 'noclimate'} aria-pressed={chip === 'noclimate'} onclick={() => (chip = 'noclimate')}>Without climate<span class="n">{fmtN(data.total - data.withClimate)}</span></button>
  </div>

  {#if flat}
    {#if q.trim()}{@render plantsFound()}{/if}
    {#if !full}
      <p class="seccount" style="margin-top: 14px">{loadingFull ? 'Loading the whole catalogue…' : 'The catalogue could not be reached.'}{#if fullFailed} <button class="linkish" type="button" onclick={retryFull}>Try again</button>{/if}</p>
    {:else if !found.length}
      <div class="emptybox"><p class="muted">Nothing matches.</p></div>
    {:else}
      <div class="hgrid">
        {#each found as c (c.slug)}{@render tile(c)}{/each}
      </div>
      <p class="seccount" style="margin-top: 14px" role="status">{fmtN(found.length)} of {fmtN(data.total)} shown{q.trim() ? '; Enter opens the first' : ''}.</p>
    {/if}
  {:else}
    {#if data.letters.length > 1}
      <nav class="letters" aria-label="Jump to a letter">
        {#each data.letters as l (l)}<a href="?by={data.by}&from={l}#l-{l}" onclick={(e) => { e.preventDefault(); jumpToLetter(l); }}>{l}</a>{/each}
      </nav>
    {/if}
    <div class="rows" class:withletters={data.letters.length > 1}>
      {#each visibleRows as r, i (r.id)}
        {#if r.letter && (i === 0 || data.rows[start + i - 1].letter !== r.letter)}<h2 class="letter" id="l-{r.letter}">{r.letter}</h2>{/if}
        <a class="grow" class:open={r.id === data.open} id="g-{r.id}" href={rowHref(r.id)} data-sveltekit-noscroll aria-expanded={r.id === data.open}>
          {#if r.map}<div class="gmap">{@html r.map}</div>{:else if r.thumb}<div class="gthumb"><img src={photoAt(r.thumb, 'small')} alt="" loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.remove(); }} /></div>{:else}<div class="gthumb mono" aria-hidden="true">{r.label[0] ?? ''}</div>{/if}
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
      {#if start + shown < data.rows.length}<div class="more" bind:this={sentinel}><a class="btn small" href="?by={data.by}&at={start + shown}" onclick={(e) => { e.preventDefault(); shown = Math.min(data.rows.length - start, shown + CHUNK); }}>More of the {fmtN(data.rows.length)} {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'}</a></div>{/if}
    </div>
    <p class="seccount" style="margin-top: 14px">{fmtN(data.rows.length)} {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'} · {fmtN(data.total)} species</p>
  {/if}
{/if}

<style>
  .plantsfound { margin: 12px 0 4px; }
  .plantsfound .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .welcome { margin: 12px 0 0; font-size: 13.5px; color: var(--ink2); line-height: 1.6; }
  /* the grower's main switch: yours or everything; it leads the tool row on both views */
  .viewseg { order: -1; }
  @media (max-width: 700px) { .headadd { display: none; } } /* the + in the top bar is the phone's add button */
  .viewseg > button { font-weight: 700; }
  @media (max-width: 700px) { .viewseg { flex-basis: 100%; } .viewseg > button { flex: 1; text-align: center; } }
  .welcome a { font-weight: 600; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: 13px; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .welcome .linkish { color: var(--ink3); margin-left: 4px; }
  /* the featured strip: one row, scrolls sideways on a phone, six-up on a desktop */
  .featured { margin: 14px 0 6px; }
  .strip { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(150px, 1fr); gap: 12px; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 8px; margin: 0 -2px; scrollbar-width: thin; }
  .ftile { scroll-snap-align: start; display: block; border-radius: var(--r); overflow: hidden; background: var(--card); box-shadow: var(--sh); color: inherit; text-decoration: none; transition: transform 0.18s, box-shadow 0.18s; }
  .ftile:hover { transform: translateY(-2px); box-shadow: var(--sh2); text-decoration: none; color: inherit; }
  .ftile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: var(--sunk); }
  .ftile .fnm { display: block; padding: 8px 11px 0; font-family: var(--serif); font-style: italic; font-size: 14px; font-weight: 600; line-height: 1.25; }
  .ftile .fcom { display: block; padding: 2px 11px 10px; font-size: 11.5px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ftile .fnm:last-child { padding-bottom: 10px; }
  @media (min-width: 701px) { .strip { grid-auto-columns: minmax(0, 1fr); grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-flow: row; overflow: visible; } .ftile:nth-child(n + 7) { display: none; } }
  @media (min-width: 1000px) { .strip { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .muted { color: var(--ink3); }
  .grouptitle { font-size: 20px; margin: 22px 0 8px; }
  .skeleton { margin-top: 22px; }
  .sk { background: var(--sunk); border-radius: var(--r); }
  .sk.head { height: 34px; width: 40%; max-width: 220px; margin-bottom: 12px; }
  .sk.line { height: 14px; width: 70%; margin-bottom: 26px; }
  .sk.tile { aspect-ratio: 1 / 1.15; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; margin: 6px 0 10px; }
  .letters a { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--ink2); min-width: 30px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; }
  .letters a:hover { background: var(--sunk); text-decoration: none; color: var(--ink); }
  .letter { font-family: var(--mono); font-size: 12px; letter-spacing: 0.12em; color: var(--ink3); margin: 22px 0 6px; scroll-margin-top: 120px; }
  .rows { display: flex; flex-direction: column; gap: 6px; }
  .more { display: flex; justify-content: center; padding: 18px 0 6px; } /* a button for a reader without the observer (or without JavaScript, where it does nothing) */
  .grow { display: grid; grid-template-columns: 56px minmax(0, 1fr) 28px; gap: 14px; align-items: center; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 8px 12px 8px 8px; color: inherit; text-decoration: none; min-height: 56px; scroll-margin-top: 120px; }
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

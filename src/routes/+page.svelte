<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { accNo } from '$lib/db/types';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount } from 'svelte';
  import { slugify } from '$core/names';
  import { groupFor } from '$core/regions';
  import type { MySpecies } from '$lib/db/species-list';
  import { prepare, search } from '$core/search';
  import Today from '$lib/ui/Today.svelte';
  let { data } = $props();
  let q = $state('');
  let chip = $state<'all' | 'owned' | 'climate' | 'noclimate'>('all');
  let welcomeHidden = $state(true);
  // A returning grower's device remembers that the page will be their species, not the catalogue: until the collection is
  // open, the server-rendered catalogue is swapped for a light skeleton so neither the wrong head nor "You grow 0" shows.
  // The server never sees the hint, so crawlers and first visits get the catalogue at once.
  const HINT = 'cultifolio.hasMine';
  let expectMine = $state(false);
  onMount(() => {
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
    for (const a of collection.accessions) if (a.status === 'growing') m.set(slugify(a.taxonName), [...(m.get(slugify(a.taxonName)) ?? []), accNo(a)]);
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
  async function loadFull() {
    if (full || loadingFull) return;
    loadingFull = true;
    try {
      const r = await fetch('/api/index');
      if (r.ok) {
        const idx = (await r.json()) as Array<{ key: number; slug: string; name: string; family?: string; common?: string; origin?: string[]; thumb?: string; photos: number; open: number; climate: string }>;
        full = idx.map((e) => ({ key: e.key, slug: e.slug, name: e.name, family: e.family, common: e.common, origin: e.origin ?? [], thumb: e.thumb, alt: e.thumb ? e.name : undefined, photos: e.photos, open: e.open, climate: e.climate }));
      }
    } finally {
      loadingFull = false;
    }
  }
  const flat = $derived(!!q.trim() || chip !== 'all');
  $effect(() => {
    if (flat || hasMine) loadFull();
  });
  const ownedN = $derived.by(() => {
    if (full) return [...owned.keys()].filter((k) => full!.some((c) => c.slug === k)).length;
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
  const openRow = $derived(data.rows.find((r) => r.id === data.open));
  const rowHref = (id: string) => `?by=${data.by}${id === data.open ? '' : `&open=${id}`}`;
  /* ---- your species ---- */
  // A tile's data: a catalogue entry, or, until the index is here, the name alone. `missing`: the index is here and has no such species.
  type Tile = { slug: string; name: string; family?: string; common?: string; thumb?: string; alt?: string; open?: number; climate?: string; missing?: boolean };
  const mineTiles = $derived.by(() => {
    const list = [...mine.values()].sort((a, b) => a.name.localeCompare(b.name));
    const bySlug = full ? new Map(full.map((c) => [c.slug, c])) : null;
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

{#snippet tile(c: Tile)}
  <a class="tile" href="/species/{c.slug}">
    {#if owned.get(c.slug)?.length}<span class="ownchip" title="You grow {owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : owned.get(c.slug)!.length + ' of these'}" aria-label="You grow {owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : owned.get(c.slug)!.length + ' of these'}">{owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : `× ${owned.get(c.slug)!.length}`}</span>{:else if mine.get(c.slug)?.followed}<span class="ownchip following" title="On your list without a plant of it" aria-label="Following: on your list without a plant of it">following</span>{/if}
    {#if c.climate}<span class="statedot dot {c.climate === 'ok' ? 'grow' : c.climate === 'refused' ? 'wake' : ''}" role="img" aria-label={climateWord(c.climate)} title={climateWord(c.climate)}></span>{/if}
    {#if c.thumb}<div class="im"><img src={c.thumb} alt={c.alt} loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.style.display = 'none'; im.parentElement?.classList.add('ph'); im.parentElement && (im.parentElement.textContent = 'photograph did not load'); }} /></div>{:else if c.climate}<div class="im ph">no open photograph on file</div>{:else if c.missing}<div class="im ph">not in the reference yet</div>{:else}<div class="im ph">{loadingFull ? 'loading…' : ''}</div>{/if}
    <div class="tx">
      <div class="nm"><SpeciesName name={c.name} /></div>
      <div class="fam">{c.common ?? c.family ?? ''}</div>
      <div class="fig">{c.climate ? `${c.climate === 'ok' ? 'climate' : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : 'no climate'}${c.open ? ` · ${c.open} open record${c.open === 1 ? '' : 's'}` : ''}` : c.missing ? 'no dossier yet' : ''}</div>
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
  <PageHead title="Species" sub="The kinds you grow, want, or are reading up on. The whole catalogue is a search away." count="{mine.size} {mine.size === 1 ? 'kind' : 'kinds'} · {grownN} you grow · {followingN} following">
    <a class="btn pri" href="/plants/new">Add a plant</a>
  </PageHead>

  <Today />

  <div class="toolrow">
    <input class="searchbar" type="search" placeholder="Search all {data.total} species by name, genus, family or origin…" bind:value={q} aria-label="Search the whole species catalogue" />
    <span class="toollab">{q.trim() ? 'Catalogue' : 'Your species'}</span>
  </div>

  {#if q.trim()}
    {#if !full}
      <p class="seccount" style="margin-top: 14px">Loading the whole catalogue…</p>
    {:else if !hits.length}
      <div class="emptybox"><p class="muted">Nothing in the catalogue matches.</p></div>
    {:else}
      <div class="hgrid">
        {#each hits as c (c.slug)}{@render tile(c)}{/each}
      </div>
      <p class="seccount" style="margin-top: 14px">{hits.length} of {data.total} match.</p>
    {/if}
  {:else}
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
    <p class="seccount" style="margin-top: 14px"><button class="linkish" type="button" onclick={startBrowsing}>Browse all {data.total} species</button></p>
  {/if}
{:else}
  <PageHead title="Species" count="{data.total} kinds · {data.withClimate} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
    <a class="btn pri" href="/plants/new">Add a plant</a>
  </PageHead>

  {#if collection.ready && !hasMine && !collection.accessions.length && !welcomeHidden}
    <div class="cult welcome" id="welcome">
      <div class="body">
        <p><b>New here.</b> The species pages are a reference, every figure with its source. Your own plants, each under its own number, are recorded on this device and nowhere else.</p>
        <div class="row">
          <a class="btn pri" href="/plants/new">Add your first plant</a>
          <a class="btn" href="/backup">Restore a backup or import from v2</a>
          <button class="linkish" type="button" onclick={dismissWelcome}>Not now</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="toolrow">
    <input class="searchbar" type="search" placeholder="Search by name, genus, family or origin…" bind:value={q} aria-label="Search species" />
    <nav class="seg" aria-label="Group by">
      {#each ['genus', 'origin', 'family'] as const as b (b)}<a href="?by={b}" class:on={data.by === b} aria-current={data.by === b ? 'true' : undefined}>{byLabel[b]}</a>{/each}
    </nav>
    {#if hasMine}<button class="linkish" type="button" onclick={stopBrowsing}>Back to your species</button>{/if}
  </div>
  <div class="chiprow">
    <button class="chipbtn" class:on={chip === 'all'} onclick={() => (chip = 'all')}>All<span class="n">{data.total}</span></button>
    {#if ownedN}<button class="chipbtn" class:on={chip === 'owned'} onclick={() => (chip = 'owned')}>You grow<span class="n">{ownedN}</span></button>{/if}
    <button class="chipbtn" class:on={chip === 'climate'} onclick={() => (chip = 'climate')}>Climate known<span class="n">{data.withClimate}</span></button>
    <button class="chipbtn" class:on={chip === 'noclimate'} onclick={() => (chip = 'noclimate')}>Without climate<span class="n">{data.total - data.withClimate}</span></button>
  </div>

  {#if flat}
    {#if !full}
      <p class="seccount" style="margin-top: 14px">{loadingFull ? 'Loading the whole catalogue…' : 'The catalogue could not be loaded; try again.'}</p>
    {:else if !found.length}
      <div class="emptybox"><p class="muted">Nothing matches.</p></div>
    {:else}
      <div class="hgrid">
        {#each found as c (c.slug)}{@render tile(c)}{/each}
      </div>
      <p class="seccount" style="margin-top: 14px">{found.length} of {data.total} shown.</p>
    {/if}
  {:else}
    {#if data.letters.length > 1}
      <nav class="letters" aria-label="Jump to a letter">
        {#each data.letters as l (l)}<a href="#l-{l}">{l}</a>{/each}
      </nav>
    {/if}
    <div class="rows" class:withletters={data.letters.length > 1}>
      {#each data.rows as r, i (r.id)}
        {#if r.letter && (i === 0 || data.rows[i - 1].letter !== r.letter)}<h2 class="letter" id="l-{r.letter}">{r.letter}</h2>{/if}
        <a class="grow" class:open={r.id === data.open} id="g-{r.id}" href={rowHref(r.id)} data-sveltekit-noscroll aria-expanded={r.id === data.open}>
          {#if r.map}<div class="gmap">{@html r.map}</div>{:else if r.thumb}<div class="gthumb"><img src={r.thumb} alt="" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} /></div>{:else}<div class="gthumb ph"></div>{/if}
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
    </div>
    <p class="seccount" style="margin-top: 14px">{data.rows.length} {data.by === 'genus' ? 'genera' : data.by === 'family' ? 'families' : 'regions'}, {data.total} species{openRow ? `; ${openRow.label} open` : ''}.{#if hasMine} <button class="linkish" type="button" onclick={stopBrowsing}>Back to your species</button>{/if}</p>
  {/if}
{/if}

<style>
  .welcome { margin: 14px 0 4px; border-left: 3px solid var(--accent); }
  .welcome .body { padding: 14px 17px; font-family: var(--ui); }
  .welcome p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: var(--ink2); }
  .welcome .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: 13px; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .welcome .linkish { color: var(--ink3); }
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
  .grow { display: grid; grid-template-columns: 56px minmax(0, 1fr) 28px; gap: 14px; align-items: center; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 8px 12px 8px 8px; color: inherit; text-decoration: none; min-height: 56px; scroll-margin-top: 120px; }
  .grow:hover { text-decoration: none; color: inherit; box-shadow: var(--sh2); }
  .grow.open { outline: 2px solid var(--accent); }
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
  .hgrid.opened { margin: 8px 0 18px; }
  @media (max-width: 700px) { .grow { grid-template-columns: 48px minmax(0, 1fr) 24px; gap: 10px; } .grow .gthumb { width: 48px; height: 48px; } .grow .gmap { width: 48px; } }
  .ownchip.following { background: var(--card); color: var(--ink2); border: 1px solid var(--rule); box-shadow: var(--sh); }
</style>

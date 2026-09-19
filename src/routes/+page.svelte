<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { accNo } from '$lib/db/types';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount } from 'svelte';
  import { slugify } from '$core/names';
  import { groupFor } from '$core/regions';
  import type { MySpecies } from '$lib/db/species-list';
  let { data } = $props();
  let q = $state('');
  let chip = $state<'all' | 'owned' | 'climate' | 'noclimate'>('all');
  let welcomeHidden = $state(true);
  onMount(async () => {
    await collection.load();
    try {
      welcomeHidden = localStorage.getItem('cultifolio.welcomed') === '1';
    } catch {
      welcomeHidden = false;
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
  type Item = (typeof data.groups)[number]['items'][number];
  // The full catalogue, fetched once and only when something needs more than the first page of a group.
  let full = $state<Item[] | null>(null);
  let loadingFull = $state(false);
  let opened = $state<Set<string>>(new Set());
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
  const needsFull = $derived(!!q.trim() || chip !== 'all' || opened.size > 0);
  $effect(() => {
    if (needsFull || hasMine) loadFull();
  });
  const ownedN = $derived.by(() => {
    if (full) return [...owned.keys()].filter((k) => full!.some((c) => c.slug === k)).length;
    return [...owned.keys()].length; // until the full index is here, count what you grow, not what the corpus has of it
  });
  const matchesQ = (c: Item) => !q.trim() || `${c.name} ${c.family ?? ''} ${c.common ?? ''} ${c.origin.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase());
  const matches = (c: Item) => {
    if (!matchesQ(c)) return false;
    if (chip === 'owned') return owned.has(c.slug);
    if (chip === 'climate') return c.climate === 'ok';
    if (chip === 'noclimate') return c.climate !== 'ok';
    return true;
  };
  // Every group, with its items: the page's first tiles when browsing, the full list when searching, filtering or opened.
  const shown = $derived.by(() => {
    const groupOf = new Map<string, Item[]>();
    if (needsFull && full) {
      for (const c of full) {
        const key = groupFor(c.origin);
        groupOf.set(key, [...(groupOf.get(key) ?? []), c]);
      }
    }
    return data.groups
      .map((g) => {
        const all = needsFull && full ? (groupOf.get(g.origin) ?? []).sort((a, b) => a.name.localeCompare(b.name)) : g.items;
        const items = all.filter(matches);
        const complete = needsFull ? !!full : items.length >= g.count;
        return { ...g, items: opened.has(g.origin) || q.trim() || chip !== 'all' ? items : items.slice(0, data.page), matching: items.length, complete };
      })
      .filter((g) => g.items.length);
  });
  const total = $derived(shown.reduce((n, g) => n + g.matching, 0));
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
  const hits = $derived(yourView && q.trim() && full ? full.filter(matchesQ).sort((a, b) => a.name.localeCompare(b.name)) : []);
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
      <div class="fig">{c.climate ? `${c.climate === 'ok' ? 'climate' : c.climate === 'pending' ? 'climate pending' : c.climate === 'refused' ? 'climate not checked' : 'no climate'}${c.open ? ` · ${c.open} records` : ''}` : c.missing ? 'no dossier yet' : ''}</div>
    </div>
  </a>
{/snippet}

{#if yourView}
  <PageHead title="Species" sub="The kinds you grow, want, or are reading up on. The whole catalogue is a search away." count="{mine.size} kinds · {grownN} you grow · {followingN} following">
    <a class="btn pri" href="/plants/new">Add a plant</a>
  </PageHead>

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
  <PageHead title="Species" sub="What plants are, and what they want. Anything you own turns up here too." count="{data.total} kinds · {data.withClimate} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
    <a class="btn pri" href="/plants/new">Add a plant</a>
  </PageHead>

  {#if collection.ready && !hasMine && !collection.accessions.length && !welcomeHidden}
    <div class="cult welcome" id="welcome">
      <div class="body">
        <p><b>New here.</b> The species pages are a reference: what a plant is, where it lives, what its habitat does through the year, and what that means in a pot, every figure with its source. The rest of the app is your own collection: each plant under its own number, with its timeline, photographs and place. It is recorded on this device and nowhere else.</p>
        <div class="row">
          <a class="btn pri" href="/plants/new">Add your first plant</a>
          <a class="btn" href="/benches">Make a place for it</a>
          <a class="btn" href="/backup">Restore a backup or import from v2</a>
          <button class="linkish" type="button" onclick={dismissWelcome}>Not now</button>
        </div>
      </div>
    </div>
  {/if}

  <div class="toolrow">
    <input class="searchbar" type="search" placeholder="Filter by name, genus, family or origin…" bind:value={q} aria-label="Filter species" />
    <span class="toollab">Grouped by origin</span>
    {#if hasMine}<button class="linkish" type="button" onclick={stopBrowsing}>Back to your species</button>{/if}
  </div>
  <div class="chiprow">
    <button class="chipbtn" class:on={chip === 'all'} onclick={() => (chip = 'all')}>All<span class="n">{data.total}</span></button>
    <button class="chipbtn" class:on={chip === 'owned'} onclick={() => (chip = 'owned')}>You grow<span class="n">{ownedN}</span></button>
    <button class="chipbtn" class:on={chip === 'climate'} onclick={() => (chip = 'climate')}>Climate known<span class="n">{data.withClimate}</span></button>
    <button class="chipbtn" class:on={chip === 'noclimate'} onclick={() => (chip = 'noclimate')}>Without climate<span class="n">{data.total - data.withClimate}</span></button>
  </div>

  {#if !shown.length}
    <div class="emptybox"><p class="muted">Nothing matches.</p></div>
  {/if}
  {#each shown as g, i (g.origin)}
    <div class="grouphead" id="r-{i}">
      <div class="gmap">{@html g.map}</div>
      <div>
        <h2>{g.origin}</h2>
        <div class="d">{g.origins.slice(0, 6).join(', ')}{g.origins.length > 6 ? ' …' : ''}</div>
        <div class="st">{g.count} species{ownedN ? ` · ${g.items.filter((c) => owned.has(c.slug)).length} you grow` : ''} · {g.withClimate} with climate</div>
      </div>
    </div>
    <div class="hgrid">
      {#each g.items as c (c.slug)}{@render tile(c)}{/each}
    </div>
    {#if !opened.has(g.origin) && !q.trim() && chip === 'all' && g.count > g.items.length}
      <p class="seccount" style="margin: 6px 0 14px"><button class="linkish" type="button" onclick={() => (opened = new Set([...opened, g.origin]))}>{loadingFull ? 'Loading…' : `Show all ${g.count} in ${g.origin}`}</button></p>
    {/if}
  {/each}
  <p class="seccount" style="margin-top: 14px">{needsFull && !full ? 'Loading the whole catalogue…' : `${total} of ${data.total} shown.`}{#if hasMine} <button class="linkish" type="button" onclick={stopBrowsing}>Back to your species</button>{/if}</p>
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
  .ownchip.following { background: var(--card); color: var(--ink2); border: 1px solid var(--rule); box-shadow: var(--sh); }
</style>

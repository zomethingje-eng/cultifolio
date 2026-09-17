<script lang="ts">
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onMount } from 'svelte';
  import { slugify } from '$core/names';
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
    for (const a of collection.accessions) if (a.status === 'growing') m.set(slugify(a.taxonName), [...(m.get(slugify(a.taxonName)) ?? []), a.id]);
    return m;
  });
  const ownedN = $derived([...owned.keys()].filter((k) => data.groups.some((g) => g.items.some((c) => c.slug === k))).length);
  const matches = (c: (typeof data.groups)[number]['items'][number]) => {
    if (q && !`${c.name} ${c.family ?? ''} ${c.common ?? ''} ${c.origin.join(' ')}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (chip === 'owned') return owned.has(c.slug);
    if (chip === 'climate') return c.climate === 'ok';
    if (chip === 'noclimate') return c.climate !== 'ok';
    return true;
  };
  const shown = $derived(data.groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length));
  const total = $derived(shown.reduce((n, g) => n + g.items.length, 0));

</script>

<svelte:head>
  <title>Cultifolio — a record of a living collection</title>
  <meta name="description" content="A species reference that shows its sources, and a collection record that stays on your device." />
</svelte:head>

<PageHead title="Species" sub="What plants are, and what they want. Anything you own turns up here too." count="{data.total} kinds · {data.groups.reduce((n, g) => n + g.withClimate, 0)} with habitat climate{ownedN ? ` · ${ownedN} you grow` : ''}">
  <a class="btn pri" href="/plants/new">Add a plant</a>
</PageHead>

{#if collection.ready && !collection.accessions.length && !welcomeHidden}
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
  <span class="toollab">Group</span>
  <div class="seg"><button class="on" type="button">Origin</button></div>
</div>
<div class="chiprow">
  <button class="chipbtn" class:on={chip === 'all'} onclick={() => (chip = 'all')}>All<span class="n">{data.total}</span></button>
  <button class="chipbtn" class:on={chip === 'owned'} onclick={() => (chip = 'owned')}>You grow<span class="n">{ownedN}</span></button>
  <button class="chipbtn" class:on={chip === 'climate'} onclick={() => (chip = 'climate')}>Climate known<span class="n">{data.groups.reduce((n, g) => n + g.withClimate, 0)}</span></button>
  <button class="chipbtn" class:on={chip === 'noclimate'} onclick={() => (chip = 'noclimate')}>No climate yet<span class="n">{data.total - data.groups.reduce((n, g) => n + g.withClimate, 0)}</span></button>
</div>

{#if !shown.length}
  <div class="emptybox"><p class="muted">Nothing matches.</p></div>
{/if}
{#each shown as g, i (g.origin)}
  <div class="grouphead" id="r-{i}">
    <div class="gmap">{@html g.map}</div>
    <div>
      <h2>{g.origin}</h2>
      <div class="d">{[...new Set(g.items.flatMap((c) => c.origin))].slice(0, 6).join(', ')}{[...new Set(g.items.flatMap((c) => c.origin))].length > 6 ? ' …' : ''}</div>
      <div class="st">{g.items.length} species{ownedN ? ` · ${g.items.filter((c) => owned.has(c.slug)).length} you grow` : ''} · {g.items.filter((c) => c.climate === 'ok').length} with climate</div>
    </div>
  </div>
  <div class="hgrid">
    {#each g.items as c (c.slug)}
      <a class="tile" href="/species/{c.slug}">
        {#if owned.get(c.slug)?.length}<span class="ownchip">{owned.get(c.slug)!.length === 1 ? owned.get(c.slug)![0] : `× ${owned.get(c.slug)!.length}`}</span>{/if}
        <span class="statedot dot {c.climate === 'ok' ? 'grow' : ''}" title={c.climate === 'ok' ? 'habitat climate known' : 'no habitat climate'}></span>
        {#if c.thumb}<div class="im"><img src={c.thumb} alt={c.alt} loading="lazy" onerror={(e) => { const im = e.currentTarget as HTMLImageElement; im.style.display = 'none'; im.parentElement?.classList.add('ph'); im.parentElement && (im.parentElement.textContent = 'photograph did not load'); }} /></div>{:else}<div class="im ph">no open photograph yet</div>{/if}
        <div class="tx">
          <div class="nm"><SpeciesName name={c.name} /></div>
          <div class="fam">{c.common ?? c.family ?? ''}</div>
          <div class="fig">{c.climate === 'ok' ? 'climate' : c.climate === 'pending' ? 'climate soon' : 'no climate'}{c.open ? ` · ${c.open} records` : ''}</div>
        </div>
      </a>
    {/each}
  </div>
{/each}
<p class="seccount" style="margin-top: 14px">{total} of {data.total} shown.</p>

<style>
  .welcome { margin: 14px 0 4px; border-left: 3px solid var(--accent); }
  .welcome .body { padding: 14px 17px; font-family: var(--ui); }
  .welcome p { margin: 0 0 12px; font-size: 14px; line-height: 1.5; color: var(--ink2); }
  .welcome .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .welcome .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: 13px; color: var(--ink3); cursor: pointer; text-decoration: underline; }
  .muted { color: var(--ink3); }
</style>

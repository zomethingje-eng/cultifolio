<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { addLeavesExample } from '$lib/ui/grow/example.svelte'; // the adds below lead out of the example first (round sixty-nine; triage-68 X7; S-C4)
  /**
   * A page whose data could not be read just now (a 503, `unreadable: true`) is not a name the reference lacks: it says
   * so, and that a moment later it may answer (rule 2; round sixty, the round forty-two review A6).
   */
  const unreadable = $derived(page.status === 503 || page.error?.unreadable === true);
  const heading = $derived(unreadable ? 'Could not be read' : page.status === 404 ? 'Not found' : String(page.status));
  /** The framework's own words for a status ("Not Found", "Internal Error") repeat the heading: said once, not twice (round fifty-nine). */
  const DEFAULTS = ['not found', 'internal error', 'something went wrong', 'service unavailable'];
  /** A sentence ends with its full stop, whoever wrote it ("…did not answer" had none; round sixty, words 20). */
  const stop = (t: string) => (/[.!?…]["”’)]?$/.test(t) ? t : `${t}.`);
  const message = $derived.by(() => {
    if (unreadable) return '';
    const m = (page.error?.message ?? '').trim();
    if (!m) return page.status === 404 ? '' : 'Something went wrong.';
    const low = m.replace(/[.!]$/, '').toLowerCase();
    return low === heading.toLowerCase() || DEFAULTS.includes(low) ? (page.status === 404 ? '' : 'Something went wrong.') : stop(m);
  });
  const onSpecies = $derived(page.url.pathname.startsWith('/species/'));
  /**
   * A real plant on the not-found page (round eighty-seven; plan D7): the first species the front page shows today, with
   * its lead photograph, its author, licence and the day its credit was read, asked of /about/data/today once the page
   * runs (an error page has no load of its own). Not on the pages about your own plants, which ask no outside host for a
   * photograph unless you switch that on, and send this site nothing they do not list (/about/how#privacy); not for an
   * address that could not be read, which is a moment's failure, not a missing page. A photograph that does not load
   * takes its credit with it.
   */
  type Today = { slug: string; name: string; common: string | null; photo: { src: string; page: string; credit: string; read: string; captive: boolean | null } | null };
  let plant = $state<Today | null>(null);
  let photoFailed = $state(false);
  const own = $derived(/^\/(plants|propagation|places|labels|backup|sync|settings|today|frost|offline)(\/|$)/.test(page.url.pathname));
  onMount(() => {
    if (page.status !== 404 || unreadable || own || onSpecies) return;
    const ask = new AbortController();
    void fetch('/about/data/today', { signal: ask.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ today?: Today | null }>) : null))
      .then((j) => { if (j?.today?.photo) plant = j.today; })
      .catch(() => { /* no plant: the page holds its search and links alone */ });
    return () => ask.abort();
  });
</script>
<svelte:head><title>{unreadable ? 'Could not be read' : page.status === 404 ? 'Not found' : 'Something went wrong'} · Cultifolio</title></svelte:head>
<div class="err">
  <h1>{heading}</h1>
  {#if message}<p class="muted">{message}</p>{/if}
  {#if unreadable}
    <p>{onSpecies ? 'This species page' : 'This page'} could not be read just now: the stored data did not answer. That is not a statement that the page does not exist; <a href={page.url.pathname + page.url.search}>try again</a> in a moment.</p>
    <p><a href="/">The front page</a> · <a href="/plants">My plants</a></p>
  {:else if page.status === 404 && onSpecies}
    {@const sp = page.error?.species}
    {#if sp}
      <!-- What the reference takes, and where the name is held elsewhere (round forty-one, R15). -->
      {#if sp.inGenus === 0}
        <!-- No "yet": the reference is built from a fixed list of names, and nothing is prepared on demand (round forty-one, R15) -->
        <p>The reference has no {sp.genus}: it is built from a fixed list of names, and none of this genus is on it. <a href="/about/how#list">Which species are here →</a></p>
      {:else}
        <!-- What the list is, as a fact about the list: not "Kew does not accept", which no source said here (round fifty-eight). -->
        <p>The reference has {sp.inGenus} {sp.genus}{sp.inGenus === 1 ? '' : ' species'}{sp.wholeGenus ? `, a genus the list takes whole, and this name as written is not among them` : `: the genus is not taken whole, only the species of it most often recorded as cultivated on iNaturalist`}. <a href="/about/how#list">Which species are here →</a></p>
      {/if}
      {#if sp.suggest?.length}
        <!-- The catalogue's own search, which retries on the first two words when the whole name finds nothing (round sixty). -->
        <p>Did you mean {#each sp.suggest as s, i (s.slug)}{i ? (i === sp.suggest.length - 1 ? ' or ' : ', ') : ''}<a href="/species/{s.slug}"><i>{s.name}</i></a>{/each}?</p>
      {/if}
      <p>Elsewhere: <a href="https://www.gbif.org/species/search?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">GBIF</a> · <a href="https://powo.science.kew.org/results?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">POWO (Kew)</a>. You can still <a href="/plants/new?species={encodeURIComponent(sp.accepted ?? sp.name)}" onclick={(e) => addLeavesExample(e, `/plants/new?species=${encodeURIComponent(sp.accepted ?? sp.name)}`)}>add it as a plant</a>; its record works without a species page.</p>
    {:else}
      <!-- "species page", not "dossier" (round fifty-eight; the accessibility review). -->
      <p>This species has no species page: the reference is built from a fixed list of names, and this one is not on it. You can still <a href="/plants/new" onclick={(e) => addLeavesExample(e, '/plants/new')}>add it as a plant</a>; its record works without a species page.</p>
    {/if}
    <!-- The search the other 404 has, so a misspelt address is one step from the page it meant (round sixty; visitor 14). -->
    <form class="find" action="/" method="get" role="search"><label for="nf-q">Search the species</label><input id="nf-q" class="searchbar" name="q" type="search" value={sp?.name ?? ''} placeholder="A name, a genus, a family or a region" /><button class="btn" type="submit">Search</button></form>
    {@render browse()}
  {:else if page.status === 404}
    <!-- Any other address: what was asked for, and a way back in, not a dead end (round fifty-eight; the address said, round sixty-one, visitor 18). -->
    {#if !message}<p>No page at <code>{page.url.pathname}</code>.</p>{/if}
    <form class="find" action="/" method="get" role="search"><label for="nf-q">Search the species</label><input id="nf-q" class="searchbar" name="q" type="search" placeholder="A name, a genus, a family or a region" /><button class="btn" type="submit">Search</button></form>
    {@render browse()}
    <p><a href="/">The front page</a> · <a href="/plants">My plants</a> · <a href="/about">About</a></p>
    {#if plant?.photo && !photoFailed}
      <!-- One species, by the front page's own rule: its lead photograph, credited in full (rule 4). -->
      <figure class="today" aria-labelledby="today-name">
        <a href="/species/{plant.slug}" class="plain"><img src={plant.photo.src} alt="{plant.name}{plant.photo.captive ? ', in cultivation' : ''}" width="500" height="375" loading="lazy" onerror={() => (photoFailed = true)} /></a>
        <figcaption>
          <p id="today-name"><a href="/species/{plant.slug}"><i>{plant.name}</i></a>{plant.common ? `, ${plant.common}` : ''}: the first species the front page shows today, by <a href="/about/how#feature">its rule</a>.</p>
          <p class="credit">Photograph: <a href={plant.photo.page} rel="noopener">{plant.photo.credit}</a>{plant.photo.captive ? ', in cultivation' : ''}. {plant.photo.read}.</p>
        </figcaption>
      </figure>
    {/if}
  {/if}
</div>

{#snippet browse()}
  <!-- The browse pages, for an address that named a place, a genus or a family (round eighty-seven; plan D7), only where
       the corpus has their table (`page.error.browse`, the server's; the review of stage 1, B2): without it each is a 503,
       and the line is left out rather than linking pages that cannot answer. -->
  {#if page.error?.browse === true}<p class="browse">Browse the species by <a href="/region">region</a>, <a href="/genus">genus</a> or <a href="/family">family</a>.</p>{/if}
{/snippet}
<style>
  .err { max-width: 60ch; padding-block: 2rem; }
  .find { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
  .find label { flex-basis: 100%; font-weight: 600; }
  /* The site's search bar, not the browser's default box; it shrinks with the column rather than pushing the page sideways at a large text size (round fifty-nine). */
  .find .searchbar { flex: 1 1 14rem; min-width: 0; min-height: var(--tap); }
  .today { margin: 24px 0 0; padding-top: 14px; border-top: 1px solid var(--rule); }
  /* The photograph's box is held at its shape before it loads, so the caption does not move when it arrives. */
  .today img { display: block; width: 100%; max-width: 500px; height: auto; aspect-ratio: 4 / 3; object-fit: contain; border-radius: 4px; background: var(--rule2, var(--rule)); }
  .today figcaption p { margin: 8px 0 0; }
  .today .credit { font-size: var(--fs-md); color: var(--ink2); overflow-wrap: anywhere; }
</style>

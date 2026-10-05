<script lang="ts">
  import { page } from '$app/state';
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
        <p>The reference has {sp.inGenus} {sp.genus}{sp.inGenus === 1 ? '' : ' species'}{sp.wholeGenus ? `, taking the genus whole as Kew's WCVP lists its accepted species, and this name as written is not among them` : `: the genus is not taken whole, only the species of it most often recorded as cultivated on iNaturalist`}. <a href="/about/how#list">Which species are here →</a></p>
      {/if}
      {#if sp.suggest?.length}
        <!-- The catalogue's own search, which retries on the first two words when the whole name finds nothing (round sixty). -->
        <p>Did you mean {#each sp.suggest as s, i (s.slug)}{i ? (i === sp.suggest.length - 1 ? ' or ' : ', ') : ''}<a href="/species/{s.slug}"><i>{s.name}</i></a>{/each}?</p>
      {/if}
      <p>Elsewhere: <a href="https://www.gbif.org/species/search?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">GBIF</a> · <a href="https://powo.science.kew.org/results?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">POWO (Kew)</a>. You can still <a href="/plants/new?species={encodeURIComponent(sp.accepted ?? sp.name)}">add it as a plant</a>; its record works without a species page.</p>
    {:else}
      <!-- "species page", not "dossier" (round fifty-eight; the accessibility review). -->
      <p>This species has no species page: the reference is built from a fixed list of names, and this one is not on it. You can still <a href="/plants/new">add it as a plant</a>; its record works without a species page.</p>
    {/if}
    <!-- The search the other 404 has, so a misspelt address is one step from the page it meant (round sixty; visitor 14). -->
    <form class="find" action="/" method="get" role="search"><label for="nf-q">Search the species</label><input id="nf-q" class="searchbar" name="q" type="search" value={sp?.name ?? ''} placeholder="A name, a genus, a family or a region" /><button class="btn" type="submit">Search</button></form>
  {:else if page.status === 404}
    <!-- Any other address: a way back in, not a dead end (round fifty-eight). -->
    <form class="find" action="/" method="get" role="search"><label for="nf-q">Search the species</label><input id="nf-q" class="searchbar" name="q" type="search" placeholder="A name, a genus, a family or a region" /><button class="btn" type="submit">Search</button></form>
    <p><a href="/">The front page</a> · <a href="/plants">My plants</a> · <a href="/about/how">How it is made</a></p>
  {/if}
</div>
<style>
  .err { max-width: 60ch; padding-block: 2rem; }
  .find { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 16px 0; }
  .find label { flex-basis: 100%; font-weight: 600; }
  /* The site's search bar, not the browser's default box; it shrinks with the column rather than pushing the page sideways at a large text size (round fifty-nine). */
  .find .searchbar { flex: 1 1 14rem; min-width: 0; min-height: var(--tap); }
</style>

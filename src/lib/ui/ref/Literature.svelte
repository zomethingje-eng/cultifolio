<script lang="ts">
  /**
   * Literature (round 133; SPECIES 23 with HANDOFF round 8; docs/PLAN-133.md): the works whose title names the species,
   * with a DOI, as OpenAlex counts them. The three most cited and the three newest, each with its authors, venue, year,
   * DOI in full, "book chapter" or "preprint" after the venue, and "free to read" where OpenAlex says a copy is free (not
   * "open access": the flag covers copies free without an open licence); "Papers by decade" as bars with their counts,
   * which sum to "All N"; "All N" opens the same search on OpenAlex. Nothing is summarised, and the section says so.
   */
  type P = { title: string; year?: number; doi?: string; url?: string; authors?: string[]; venue?: string; kind?: string; free?: boolean; cited?: number; list?: string };
  let { name, papers, counts, at }: { name: string; papers: P[]; counts: { total: number; decades: Array<[number, number]> }; at?: string } = $props();
  const cited = $derived(papers.filter((p) => p.list === 'cited'));
  const newest = $derived(papers.filter((p) => p.list === 'newest'));
  const top = $derived(Math.max(1, ...counts.decades.map(([, n]) => n)));
  const first = $derived(counts.decades[0]?.[0]);
  const search = $derived(`https://openalex.org/works?filter=title.search:${encodeURIComponent(`"${name}"`)},type:article|review|book-chapter|preprint,has_doi:true`);
</script>

<h2 class="sec" id="s-research">Literature</h2>
<p class="small muted litlead">Works whose title names <i>{name}</i>, with a DOI: articles, reviews, book chapters and preprints, as OpenAlex (CC0) counts them{at ? `, asked ${at.slice(0, 10)}` : ''}. Titles, authors and counts only: nothing here is summarised, and nothing on this page is drawn from them.</p>
{#snippet one(p: P)}
  <li class="paper">
    <a href={p.url} rel="noopener">{p.title}</a>
    <div class="meta">{p.authors?.join(', ')}{p.year ? ` (${p.year})` : ''}{p.venue ? ` · ${p.venue}` : ''}{p.kind ? ` · ${p.kind}` : ''}{p.cited != null ? ` · cited ${p.cited} ${p.cited === 1 ? 'time' : 'times'}` : ''}{#if p.free}{' · '}<span class="free">free to read</span>{/if}</div>
    {#if p.doi}<div class="doi small">doi:{p.doi}</div>{/if}
  </li>
{/snippet}
{#if cited.length}
  <h3 class="lith">Most cited</h3>
  <ul class="papers" id="lit-cited">{#each cited as p (p.doi ?? p.title)}{@render one(p)}{/each}</ul>
{/if}
{#if newest.length}
  <h3 class="lith">Newest</h3>
  <ul class="papers" id="lit-newest">{#each newest as p (p.doi ?? p.title)}{@render one(p)}{/each}</ul>
{/if}
{#if counts.decades.length}
  <h3 class="lith">Papers by decade</h3>
  <ol class="decades" id="lit-decades" aria-label="Papers by decade">
    {#each counts.decades as [dec, n] (dec)}
      <li><span class="dec">{dec}s</span><span class="bar" style="width: {Math.max(2, (n / top) * 100)}%"></span><span class="n">{n}</span></li>
    {/each}
  </ol>
{/if}
<p class="small"><a href={search} rel="noopener" id="lit-all">All {counts.total} {counts.total === 1 ? 'paper' : 'papers'}</a>{first ? ` since the ${first}s` : ''}, on OpenAlex.</p>

<style>
  .litlead { margin: 0 0 8px; }
  .lith { font-size: var(--fs-sm); margin: 12px 0 4px; }
  .papers { list-style: none; margin: 0; padding: 0; }
  .paper { margin: 0 0 8px; }
  .meta, .doi { color: var(--mut); }
  .doi { overflow-wrap: anywhere; font-variant-numeric: var(--figs); }
  .free { color: var(--ink); }
  .decades { list-style: none; margin: 4px 0 8px; padding: 0; max-width: 420px; }
  .decades li { display: grid; grid-template-columns: 4.5em 1fr 3em; align-items: center; gap: 6px; font-size: var(--fs-sm); font-variant-numeric: var(--figs); }
  .decades .bar { display: block; height: 8px; background: var(--ink2); }
  .decades .n { text-align: right; }
</style>

<script lang="ts">
  /**
   * The round records as a changelog (round eighty-seven; plan D6): each round's date, a few plain lines of what changed
   * for a reader, and a link to its full record, newest first. The lines are `$lib/changes/rounds`, written from the
   * records; the front page's "Changed lately" reads the same list (`changedLately`).
   */
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import AboutNav from '../about/AboutNav.svelte';
  import { ROUNDS, recordHref, dayText, REPO } from '$lib/changes/rounds';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about' }, { label: 'Changes' }]);
    return () => setCrumb([]);
  });
</script>

<svelte:head>
  <title>Changes · Cultifolio</title>
  <meta name="description" content="What changed on Cultifolio, round by round: a few plain lines for each, with a link to the full record." />
</svelte:head>

<PageHead title="Changes" kick="About" places={false} sub="The site is reviewed and corrected in rounds. Each round's full record is in the source; these are a few lines of each, for a reader." />

<AboutNav at="changes" />

<article class="changes">
  {#each ROUNDS as r (r.n)}
    <section id="round-{r.n}" aria-labelledby="round-{r.n}-h">
      <h2 id="round-{r.n}-h"><span class="n">Round {r.n}</span> <time datetime={r.date}>{dayText(r.date)}</time></h2>
      <ul>
        {#each r.lines as line, i (i)}<li>{line}</li>{/each}
      </ul>
      <p class="rec"><a href={recordHref(r.n)} rel="noopener">The full record of round {r.n}</a></p>
    </section>
  {/each}
  <p class="older">Each date is the day the round's record was finished. Older rounds, and round 83, which kept no record of its own, are in <a href={`${REPO}/tree/main/docs`} rel="noopener">the records in the source</a> and its history.</p>
</article>

<style>
  .changes { max-width: 72ch; }
  section { border-top: 1px solid var(--rule); padding: 12px 0 4px; }
  section:first-child { border-top: 1px solid var(--ink); }
  h2 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; margin: 0 0 6px; font-family: var(--ui); font-size: var(--fs-lg); font-weight: 600; }
  h2 time { font-size: var(--fs-md); font-weight: 400; color: var(--mut, var(--ink3)); font-variant-numeric: tabular-nums lining-nums; }
  ul { margin: 0 0 6px; padding-left: 1.1rem; }
  li { margin: 4px 0; line-height: 1.5; }
  .rec { margin: 4px 0 10px; font-size: var(--fs-md); }
  .older { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--rule); color: var(--ink2); font-size: var(--fs-md); }
  /* The repository's address breaks rather than pushing the page sideways at 320 px and 200% text. */
  a { overflow-wrap: anywhere; }
</style>

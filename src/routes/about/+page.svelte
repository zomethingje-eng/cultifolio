<script lang="ts">
  /**
   * The owner's page (round eighty-seven; plan D5). Built round the line the owner approved for the footer, in his voice
   * (the first paragraph, `#who`, which he may edit), and otherwise in the site's own: what the reference is, how AI was
   * used, what the site costs and keeps, and how the code is tested. The rules themselves stay on /about/how; this page
   * links them. Every sentence is held to the code (rule 5) by tests/unit/r87p-about.test.ts.
   */
  import { onMount } from 'svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import AboutNav from './AboutNav.svelte';
  import { COUNTS_ON, liveCounts, countText, type Counts } from '$lib/ui/about-counts';
  import { SOURCES } from './sources';
  import { REPO } from '$lib/changes/rounds';
  $effect(() => {
    setCrumb([{ label: 'About' }]);
    return () => setCrumb([]);
  });
  // The reference's counts now, read once the page runs; until then, and offline, those of a named day, as /about/how does.
  let live = $state<Counts | null>(null);
  onMount(() => { void liveCounts().then((c) => (live = c)); });
  const shown = $derived(live ?? COUNTS_ON);
  const held = $derived(live ? 'holds' : `held, on ${COUNTS_ON.on},`);
  const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
</script>

<svelte:head>
  <title>About · Cultifolio</title>
  <meta name="description" content="Who made Cultifolio and why, what the reference is, how AI was used to build it, and what the site costs and keeps." />
</svelte:head>

<PageHead title="About Cultifolio" kick="About" places={false} sub="A plant species reference in which every figure says where it came from, and a private record of your own plants." />

<AboutNav at="about" />

<article class="about">
  <section aria-labelledby="who">
    <h2 id="who">Who made it, and why</h2>
    <!-- The owner's words (round eighty-seven, plan D5): the line he approved for the footer, said here whole, with one
         sentence that says only what it says. His to edit. -->
    <p class="owner">Made by Jonathan, who grows cacti, succulents and rare bulbs and got tired of care advice that never said where it came from. So every figure here says where it came from. Built with Claude; no text about a species is written by it.</p>
  </section>

  <section aria-labelledby="what">
    <h2 id="what">What the reference is</h2>
    <p>The reference {held} <b>{countText(shown.species)}</b> species pages, one for each species, named as the World Checklist of Vascular Plants of the Royal Botanic Gardens, Kew names it. <a href="/about/how#list">Which species are here</a> was decided by a stated rule, not by hand.</p>
    <p>Each page gathers what public sources hold about its species: the native range in Kew's regions, wild records from GBIF, kept only where they lie inside that range, the habitat's climate month by month, openly licensed photographs with their credits, and the opening paragraph of its Wikipedia article, quoted. <b>{countText(shown.withClimate)}</b> of the pages have a habitat climate. A figure that could not be worked out is said to be missing, never filled in.</p>
    <p>Beside the reference is a record of your own plants: their numbers, spaces, waterings, sowings and photographs, with a plant's space set beside its species' habitat figures where the reference has them.</p>
  </section>

  <section aria-labelledby="ai">
    <h2 id="ai">How AI was used</h2>
    <p>The code was written with Claude, an AI model made by Anthropic, under written rules, and checked in repeated rounds of review. The rules it was written under:</p>
    <ul>
      <li>Every figure has a source and a date.</li>
      <li>A source that did not answer is "not checked", never "none".</li>
      <li>A name is matched to a source only where the match is certain, never guessed.</li>
      <li>Each photograph on a species page names its author, its licence and the day its credit was read.</li>
      <li>The about pages say what the code does.</li>
    </ul>
    <p>No text about a species is generated. Every sentence on a species page is a quotation, a figure with its source, or a template filled in by a fixed rule; the templates were written once, the same for every species (<a href="/about/how#written">who writes the words</a>).</p>
    <p>Every figure comes from a named source, and the day it was read: {list(SOURCES)}. <a href="/about/how#sources">What comes from where</a> gives each source's part and licence.</p>
    <p>Each round of review is recorded in the source. <a href="/changes">Changes</a> says, round by round, what was put right.</p>
  </section>

  <section aria-labelledby="cost">
    <h2 id="cost">What it costs, and what it keeps</h2>
    <p>It is free. There is no account, no tracking, no analytics and no advertising. Your plants stay on your device unless you turn on sync, which encrypts them on the device with a key only you hold, or download a backup. <a href="/about/how#privacy">What the site knows about you</a> lists everything the pages send.</p>
  </section>

  <section aria-labelledby="tests">
    <h2 id="tests">The tests</h2>
    <p>The code is checked by thousands of unit tests and browser tests, in desktop and phone browsers. The release script runs them all before it says a version may be deployed. They are in the source, under <a href={`${REPO}/tree/main/tests`} rel="noopener">tests</a>, beside the code they check.</p>
  </section>

  <section aria-labelledby="source">
    <h2 id="source">The source</h2>
    <p>Cultifolio is open source: the app under the GNU AGPL 3.0, the tooling that builds the reference under the MIT licence, at <a href={REPO} rel="noopener">github.com/zomethingje-eng/cultifolio</a>. Problems and corrections are welcome there. <a href="/about/data">The data</a> says how to download the index and cite the reference.</p>
  </section>
</article>

<style>
  .about { max-width: 68ch; }
  section { border-top: 1px solid var(--rule); padding: 6px 0 2px; }
  section:first-child { border-top: 0; }
  /* Section heads as the look sets them (round eighty-seven): small, uppercase, the muted ink. */
  h2 { margin: 14px 0 8px; font-family: var(--ui); font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  p { margin: 0 0 12px; line-height: 1.6; }
  ul { margin: 0 0 12px; padding-left: 1.1rem; }
  li { margin: 4px 0; line-height: 1.5; }
  b { font-variant-numeric: tabular-nums lining-nums; font-weight: 600; }
  .owner { font-size: var(--fs-lg); }
  a { overflow-wrap: anywhere; }
</style>

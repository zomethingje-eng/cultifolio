<script lang="ts">
  /**
   * /about/data (round eighty-seven; plan D6): what of the reference can be downloaded, under which licence each part is,
   * the source code, and how to cite it. The corpus id, its day and the GBIF downloads are read from the reference the
   * Worker serves (`+page.server.ts`), never written here. The derived dataset's section is drawn only once its DOI is
   * set (`GBIF_DERIVED_DOI`).
   */
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import AboutNav from '../AboutNav.svelte';
  import { REPO } from '$lib/changes/rounds';
  import { citation, GBIF_DERIVED_DOI } from './reference';
  import { countText } from '$lib/ui/about-counts';
  let { data } = $props();
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about' }, { label: 'The data' }]);
    return () => setCrumb([]);
  });
  const cited = $derived(data.cite ? citation(data.cite) : null);
  const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
  const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/';
  const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
</script>

<svelte:head>
  <title>The data · Cultifolio</title>
  <meta name="description" content="How to download the reference's index, which licence each part of it carries, where the source code is, and how to cite it." />
</svelte:head>

<PageHead title="The data" kick="About" places={false} sub="The reference can be downloaded, checked and cited. Each part keeps the licence of the source it came from." />

<AboutNav at="data" />

<article class="data">
  <section aria-labelledby="download">
    <h2 id="download">What you can download</h2>
    <p><a href="/api/index" download="cultifolio-index.json">The index</a> (JSON) lists every species page{#if data.species} ({countText(data.species)} now){/if}: its id and address, its name, family, English names and older names, its native regions, how many photographs and open records it has, whether it has a habitat climate, the six species of nearest climate, and its photograph's address and credit. It is a large file, and requests for it are counted per address (<a href="/about/formats#limits">the limits</a>).</p>
    <p>Each species page's own file, with every figure the page shows and a record of every source asked, is at <code>/api/dossier/&lt;id&gt;</code>, the page's id (<a href="/about/formats#dossier">its format</a>).</p>
  </section>

  <section aria-labelledby="licences">
    <h2 id="licences">Licences</h2>
    <p>Each part keeps the licence of the source it came from, and that licence governs its reuse.</p>
    <div class="tablewrap" role="region" aria-label="Licences" tabindex="-1">
    <table>
      <thead><tr><th scope="col">Part</th><th scope="col">Source</th><th scope="col">Licence</th></tr></thead>
      <tbody>
        <tr><td>Names, older names, GBIF keys and English names</td><td>GBIF Backbone Taxonomy</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
        <tr><td>Accepted names and authors, families, native ranges, Kew's own descriptions, where a name was published and a hybrid's parents</td><td>World Checklist of Vascular Plants (WCVP), RBG Kew</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
        <tr><td>Identifiers, article titles, and English names of a page with no GBIF key</td><td>Wikidata</td><td><a href={CC0}>CC0 1.0</a></td></tr>
        <tr><td>Wild records, the points on the maps (in each species file)</td><td>GBIF occurrence records, dataset by dataset</td><td>Per record, as its dataset publishes it: <a href={CC0}>CC0</a> or <a href={CC_BY}>CC BY</a>. CC BY-NC records are used for the derived figures and never published.</td></tr>
        <tr><td>Photographs: their addresses, authors and licences (the images are the photographers', and are not copied here)</td><td>iNaturalist, GBIF and Wikimedia Commons</td><td>Per file: <a href={CC0}>CC0</a>, public domain, <a href={CC_BY}>CC BY</a> or <a href={CC_BY_SA}>CC BY-SA</a></td></tr>
        <tr><td>The quoted summary (in each species file)</td><td>Wikipedia</td><td><a href={CC_BY_SA}>CC BY-SA 4.0</a>; reuse carries share-alike</td></tr>
        <tr><td>Predicted extinction risk: the model's probability, interval and confidence (in each species file)</td><td>Bachman et al. 2024, Kew's data on Zenodo (10.5281/zenodo.10605228)</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
        <tr><td>CITES Appendix status (in each species file)</td><td>The CITES Appendices, transcribed by hand</td><td>The Convention's text; no Species+ data</td></tr>
        <tr><td>Chromosome counts and their references (in each species file)</td><td>ChromoDB, IAPT/IOPB chromosome data, version 3.1 (10.5281/zenodo.24057855)</td><td><a href={CC_BY}>CC BY 4.0</a></td></tr>
        <tr><td>WFO's reading of the name (in each species file)</td><td>WFO Plant List, release 2026-06 (10.5281/zenodo.20782718)</td><td><a href={CC0}>CC0 1.0</a></td></tr>
        <tr><td>Wild plants observed in flower, counted by month (in each species file)</td><td>iNaturalist's research-grade observations</td><td>Counts read from iNaturalist's API and linked to its search; no observation is copied</td></tr>
        <tr><td>Monthly climate normals</td><td>CHELSA V2.1</td><td><a href={CC0}>CC0 1.0</a></td></tr>
        <tr><td>Elevation; daily temperatures; coastlines and the regions' shapes</td><td>ETOPO 2022 (NOAA); NASA POWER; Natural Earth</td><td>Public domain</td></tr>
      </tbody>
    </table>
    </div>
    <p>The habitat climates, map markers, seasons, cold floors, hardiness zones, climate classes and nearest climates are worked out by the build from these sources, by the rules on <a href="/about/how">How it is made</a>. The site states no licence of its own for them. The build's export, which packages a built reference as a dataset, puts the habitat centres, growing seasons, cold floors and the index under <a href={CC_BY}>CC BY 4.0</a>, each part above keeping its own licence.</p>
  </section>

  <section aria-labelledby="code">
    <h2 id="code">The source code</h2>
    <p>The app and the scripts that build the reference are at <a href={REPO} rel="noopener">github.com/zomethingje-eng/cultifolio</a>: the app under the GNU AGPL 3.0, the scripts under the MIT licence. Its NOTICE names every source, with its licence.</p>
  </section>

  <section aria-labelledby="cite">
    <h2 id="cite">How to cite it</h2>
    {#if cited && data.cite}
      <p>Cite the reference by the corpus the site serves, read from it just now:</p>
      <p class="citation" id="citation">{cited}</p>
      {#if !data.cite.built}<p class="muted small">The day this corpus was built is not recorded where the site reads it.</p>{/if}
    {:else}
      <p class="citation" id="citation">The corpus the site serves could not be read just now, so its id is not given here. Cite "Cultifolio species reference, https://cultifolio.com" with the day you read it.</p>
    {/if}
    <p>Cite the sources too: the figures are theirs. Kew's checklist: Govaerts R, Nic Lughadha E, Black N, Turner R, Paton A. The World Checklist of Vascular Plants, a continuously updated resource for exploring global plant diversity. Scientific Data 8, 215 (2021). CHELSA: Karger DN et al. Climatologies at high resolution for the earth's land surface areas. Scientific Data 4, 170122 (2017). NASA POWER: NASA Langley Research Center, Prediction Of Worldwide Energy Resources, daily data. GBIF: the download each page cites, below.</p>
  </section>

  <section aria-labelledby="gbif">
    <h2 id="gbif">GBIF's records</h2>
    <p>Each species page's record of its sources names the GBIF occurrence download its wild records were read from, with its DOI and, where the record has it, the day GBIF made it; a page whose records came through GBIF's search names that instead.</p>
    {#if data.from && data.downloads}
      {#if data.downloads.length}
        <p id="doi">The page of <a href="/species/{data.from.slug}"><i>{data.from.name}</i></a>, the first species the front page shows today, read just now, cites {#each data.downloads as d, i (d.doi)}{i ? (i === data.downloads.length - 1 ? ' and ' : ', ') : ''}<a href="https://doi.org/{d.doi}" rel="noopener">https://doi.org/{d.doi}</a>{d.day ? `, made ${d.day}` : ''}{/each}.</p>
      {:else}
        <p id="doi">The page of <a href="/species/{data.from.slug}"><i>{data.from.name}</i></a>, the first species the front page shows today, read just now, names no GBIF download.</p>
      {/if}
    {:else}
      <p id="doi">Which download today's pages cite could not be read just now; each species page names its own.</p>
    {/if}
  </section>

  {#if GBIF_DERIVED_DOI}
    <section aria-labelledby="derived">
      <h2 id="derived">The records read through GBIF's search</h2>
      <p>The records the build read through GBIF's search, not a download, are cited together as a GBIF derived dataset: <a href="https://doi.org/{GBIF_DERIVED_DOI}" rel="noopener">https://doi.org/{GBIF_DERIVED_DOI}</a>.</p>
    </section>
  {/if}
</article>

<style>
  .data { max-width: 72ch; }
  section { border-top: 1px solid var(--rule); padding: 6px 0 2px; }
  section:first-child { border-top: 0; }
  h2 { margin: 14px 0 8px; font-family: var(--ui); font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  p { margin: 0 0 12px; line-height: 1.6; }
  .citation { padding: 8px 0; border-top: 1px solid var(--rule2, var(--rule)); border-bottom: 1px solid var(--rule2, var(--rule)); }
  .tablewrap { overflow-x: auto; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-md); }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--rule); }
  thead th { font-weight: 600; border-bottom: 1px solid var(--ink); }
  @media (max-width: 520px) {
    /* A phone reads the table as stacked rows: each part a block, its source and licence under it. */
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table, tbody, tr, td { display: block; width: auto; }
    tr { border-bottom: 1px solid var(--rule); padding: 6px 0; }
    td { border: 0; padding: 2px 0; }
    td:first-child { font-weight: 600; }
  }
  a, code { overflow-wrap: anywhere; }
</style>

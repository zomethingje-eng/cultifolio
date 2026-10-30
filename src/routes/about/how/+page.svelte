<script lang="ts">
  import { onMount } from 'svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { COUNTS_ON, liveCounts, countText, type Counts } from '$lib/ui/about-counts';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about/how' }, { label: 'How it is made' }]);
    return () => setCrumb([]);
  });
  // The counts of the reference the site serves now, read once the page runs; until then, and offline, those of a named day.
  let live = $state<Counts | null>(null);
  onMount(() => {
    void liveCounts().then((c) => (live = c));
    // Print opens every list of rules in full, and closes again the ones the reader had closed.
    let opened: HTMLDetailsElement[] = [];
    const before = () => { opened = [...document.querySelectorAll<HTMLDetailsElement>('article.prose details:not([open])')]; for (const d of opened) d.open = true; };
    const after = () => { for (const d of opened) d.open = false; opened = []; };
    addEventListener('beforeprint', before);
    addEventListener('afterprint', after);
    return () => { removeEventListener('beforeprint', before); removeEventListener('afterprint', after); };
  });
  const shown = $derived(live ?? COUNTS_ON);
  const held = $derived(live ? 'now holds' : `held, on ${COUNTS_ON.on},`);
</script>

<svelte:head>
  <title>How it is made · Cultifolio</title>
  <meta name="description" content="Where every figure on a species page comes from, how the habitat climate and the map marker are worked out, and what the site asks, keeps and sends." />
</svelte:head>

<PageHead title="How it is made" kick="About" places={false} sub="Every figure on a species page has a source and a method; this page is the method. A number that cannot be derived is left out and said to be missing, never filled in." />

<nav class="seg topseg" aria-label="About"><a class="on" href="/about/how" aria-current="page">How it is made</a><a href="/about/formats">Formats</a></nav>

<article class="prose">
  <section class="brief" aria-labelledby="brief-h">
    <h2 id="brief-h">In brief</h2>
    <ul>
      <li>Each species page is built ahead of time from public data (GBIF, Kew's WCVP, CHELSA, ETOPO, NASA POWER, Natural Earth, iNaturalist, Wikimedia Commons, Wikidata, Wikipedia), and every figure names its source.</li>
      <li>Nothing about a species is written for its page by a person or by AI, apart from credited quotations (<a href="#written">who wrote the templates</a>).</li>
      <li>A source that did not answer is said as "not checked", and a call this site held back as "not asked"; never as "none".</li>
      <li>Your own plants are kept in this browser. They leave it only through sync, encrypted with a key only you hold, or a backup you download. A name you type or import may be looked up in the catalogue, as <a href="#privacy">the privacy section</a> says.</li>
      <li>No accounts, no analytics, no third-party scripts; the code is open.</li>
      <li>A page follows the rules of the day it was built, which its record of sources gives. Rules of 30 October 2026 (Kew's name heading every page with a Kew entry, the regions' shapes, the shared one-word names, the names under a species' varieties) reach a page when it is next built.</li>
    </ul>
    <p class="counts" id="counts">The reference {held} <b>{countText(shown.species)}</b> species pages in <b>{countText(shown.genera)}</b> genera, and <b>{countText(shown.withClimate)}</b> of those pages have a habitat climate.</p>
    <nav class="toc" aria-label="On this page">
      <a href="#sources">Sources</a> · <a href="#list">Which species</a> · <a href="#search">Search</a> · <a href="#written">Who writes</a> · <a href="#refusal">Refusals</a> · <a href="#records">Records</a> · <a href="#marker">Map marker</a> · <a href="#climate">Climate</a> · <a href="#extremes">Extremes</a> · <a href="#year">Seasons</a> · <a href="#floor">Cold floor</a> · <a href="#archetypes">Care groups</a> · <a href="#notes">The figures at the top</a> · <a href="#related">Similar climate</a> · <a href="#corpus">How it is stored</a> · <a href="#collection">Your collection</a> · <a href="#privacy">Privacy</a> · <a href="#glossary">Glossary</a> · <a href="#source">Source code</a>
    </nav>
  </section>

  <!-- ─────────────────────────── Sources ─────────────────────────── -->
  <section aria-labelledby="sources">
  <h2 id="sources">What comes from where</h2>
  <p class="sum">Every figure on a species page comes from a public source, named where it appears, with its licence. The table says which source gives what. The rules below it say how each source's record is matched to the right plant.</p>
  <div class="tablewrap" role="region" aria-label="The sources" tabindex="-1">
  <table class="src">
    <thead><tr><th scope="col">Source</th><th scope="col">What it gives a page</th><th scope="col">Licence</th></tr></thead>
    <tbody>
      <tr><th scope="row">GBIF Backbone Taxonomy</th><td>The name's key, its older names (synonyms), family and order, and English names.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
      <tr><th scope="row">GBIF occurrence records</th><td>Wild records for the map, the marker and the habitat climate.</td><td>Per record: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>; CC BY-NC records are used but never published.</td></tr>
      <tr><th scope="row">World Checklist of Vascular Plants (WCVP), RBG Kew</th><td>The accepted name and author, the native range, and Kew's one-line description.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
      <tr><th scope="row">CHELSA V2.1</th><td>Monthly climate normals, 1981–2010.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
      <tr><th scope="row">ETOPO 2022 (NOAA)</th><td>Elevation, and which grid cells are land.</td><td>Public domain</td></tr>
      <tr><th scope="row">NASA POWER</th><td>Daily temperatures, for the extremes and the cold floor.</td><td>Public domain</td></tr>
      <tr><th scope="row">Natural Earth</th><td>Coastlines for the maps, and the states and provinces the regions' shapes are made from.</td><td>Public domain</td></tr>
      <tr><th scope="row">iNaturalist</th><td>Photographs, and the taxon a page links.</td><td>Per photograph: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA</a></td></tr>
      <tr><th scope="row">Wikimedia Commons</th><td>Photographs where the others have too few.</td><td>Per file: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, public domain, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA</a></td></tr>
      <tr><th scope="row">Wikidata</th><td>Identifiers in other databases, the Wikipedia article's title, the list of botanic gardens, and English names for a page with no GBIF key.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
      <tr><th scope="row">Wikipedia</th><td>The quoted summary.</td><td><a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></td></tr>
    </tbody>
  </table>
  </div>
  <p>Each licence above links its text. The frost watch's forecasts come from MET Norway (CC BY 4.0) and, in the US, the National Weather Service (public domain); they are asked for your site when you use the watch, and are no part of the reference.</p>

  <h3 id="names">The name</h3>
  <p class="sum">A page is headed by the name Kew's World Checklist accepts for it, with Kew's author. GBIF's name for the same plant, where it differs, is listed as an older name. A name is matched to a source only where the match is certain.</p>
  <ul class="rules">
    <li>A page whose id begins <code>k</code> is headed by Kew's accepted name for that entry, with Kew's author, whole. A name below species carries its rank word (subsp., var., f.), on every page.</li>
    <li>GBIF's name for the page's key, where it is other words, is one of the page's older names, so its old address moves to the page, as any older name's does, and the search finds it.</li>
    <li>A page built before 30 October 2026 may still be headed by GBIF's name for its key, which on about 500 pages was not Kew's; the record of the page's sources gives its day.</li>
    <li>A plant you recorded under the old heading keeps its name and its GBIF key, and the key still leads to the page. The old name does too, as one of its older names, except where Kew's file holds that name for another plant.</li>
    <li>A plant filed under a name that has no page of its own offers "Is it an older name?". Pressed, it looks among the older names. Where the name is an older name of a page, the plant's page says so, links that page, and offers to file it there, the old name kept as received.</li>
    <li>A page without a Kew entry of its own, a <code>g</code> page, is headed by GBIF's name.</li>
    <li>The name is cited as Kew's World Checklist cites the entry whose number the page links. GBIF cites Ixora coccinea "Comm. ex Lam."; the page links and cites Kew's Ixora coccinea L., and says so under the name.</li>
    <li>Where GBIF's key is a usage with no synonyms and GBIF holds the name by Kew's author under another key, that usage's synonyms and common names are read too. GBIF's "Rubus parviflorus Kük." is not the thimbleberry, Rubus parviflorus Nutt.; the page says so under the name.</li>
    <li>A name the backbone holds as a synonym is followed to the species it accepts, and an accepted subspecies or variety one step further, to its species. The page says which name was asked for.</li>
    <li>A name other species of the reference hold too is said as that, never as a name the backbone accepts as this species.</li>
    <li>An older name of a species that is another species' accepted name here is shown with its author, as an older name of this species and not that species ("Annona muricata Vell." on Annona montana).</li>
  </ul>

  <h3 id="common">English names</h3>
  <p class="sum">The English name shown is one GBIF's sources give, picked by a fixed rule, never by hand. It is not always the name growers use most. Every English name a source gives is searched, whether shown or not.</p>
  <ul class="rules">
    <li>The common name is one of the English names GBIF reports. A page with no GBIF key takes Wikidata's (<a href="#no-gbif-key">below</a>).</li>
    <li>A source that lists several names in one entry, separated by commas ("Sago palm, King sago, Sago cycad"), gives each as a name of its own. A comma inside brackets does not part names: "Prickly pear (Indian fig, Barbary fig)" is one.</li>
    <li>Spellings of one name count as one name: case, hyphens, spaces, apostrophes, accents, a full stop at the end, and a compound written open or closed ("Century plant" and "Centuryplant").</li>
    <li>Names are put in order by a fixed rule: the name more of GBIF's sources give first, then a name GBIF marks preferred (a flag one dataset sets, so it only breaks a tie), then the order in which GBIF's list gives the names, which is not always the alphabet.</li>
    <li>A single word that names no species comes after every longer name, and is shown only when no source gives a fuller name. For Aloe vera, "Barbados aloe" is shown and "Aloe" stays among its names.</li>
    <li>A generic noun or a one-word name for a whole genus or family is never shown, as the heading or among the names, though it is still searched; a species no source gives a fuller name has no English name shown. The list: bulb, buttercup, cactus, cherry, cycad, daisy, fern, flameflower, flower, grass, herb, lily, orchid, palm, pipevine, plant, poppy, primrose, shrub, snowdrop, succulent, sumac, sumach, tree, vine and weed, each with an "s" too.</li>
    <li>A one-word name two or more species of one genus hold heads only the one whose sources give it most often, and none of them where two give it equally often. The others do not show it, and it stays searchable: Ficus carica keeps "Fig", and the other figs do not show it.</li>
    <li>A single word a source gives only inside a list ("Coral" from "Aloe, Coral") is set back the same way.</li>
    <li>A list of names separated by semicolons goes after every other name.</li>
    <li>Another genus of the reference named alone ("Osteospermum" for Dimorphotheca jucunda), or as the last word of a longer name ("String-of-Beads Senecio" for a Curio), goes after every other name.</li>
    <li>That rule spares a genus English uses as a noun of its own: acacia, agave, aloe, amaryllis, anemone, aralia, cereus, crocus, geranium, haworthia, iris, lotus, mimosa, petunia, verbena and yucca. "Lace aloe" and "Autumn crocus" stay.</li>
    <li>The species' own older name ("Senecio rowleyanus" for Curio rowleyanus) goes last too.</li>
    <li>Capitals are not read in these rules. A genus word that is not the last ("Arum lily") is not read, and the species' own genus only when it is the whole name.</li>
    <li>Of one name's spellings, one without a full stop at the end is shown first. Then a name ending in plant, tree, lily, daisy, palm, fern, cactus or orchid is shown open or hyphenated where some source writes it so ("Zebra-plant", not "Zebraplant").</li>
    <li>Then the spelling more sources give, so "Milkweed" and "Nannyberry" stay whole. Then, given by as many, a botanical source's before one only the World Register of Marine Species gives ("Showy tarweed", not "Showy tar weed").</li>
    <li>Then the spelling the species' botanical sources use more often across all its names ("Selfheal", as they write "Common selfheal"). Then one written open or hyphenated before one written closed ("Swamp-mahogany"), and last GBIF's first.</li>
    <li>A name's other spellings are not shown, but the search reads them: "blue mink" finds Ageratum houstonianum, shown as "Bluemink".</li>
    <li>Capitals are read word by word across every spelling. A capital some source gave on purpose is kept ("herb Robert", "star-of-Bethlehem"); one no source meant is taken off where some source writes the word in lower case. So "Butterfly milkweed" is shown over "Butterfly Milkweed".</li>
    <li>The first letter is shown as a capital. No letter is added or taken away, so a name a source cut short is shown as the source wrote it.</li>
    <li>Letters of another script left at the end of an English name ("Hairy phlox ا") are taken off, and a name that still holds a letter of another script is not shown.</li>
    <li>GBIF's preferred flag and the count of sources exist only for species whose names the build's <code>--names</code> step fetched again. For the rest, each source a listed spelling names counts once, and a spelling that names none counts as one.</li>
    <li>A common name that is a scientific name the reference or Kew's World Checklist holds ("Babiana odorata" for Babiana villosula) is not shown, and the record says so.</li>
    <li>Nor is the species' own scientific name, or one of its older names, or one of them spelt one letter otherwise, written as an English one ("Calathea musaica" for Goeppertia kegeljanii). The page is found by those names as older names.</li>
    <li>The species page and the catalogue use the same rule. The page shows the first four names under the name, separated by semicolons.</li>
  </ul>

  <h3 id="range">The native range</h3>
  <p class="sum">The native range is Kew's, from its World Checklist, in Kew's own regions. Wild records are tested against it, so a garden escape abroad does not set the climate. Where Kew's entry is not certainly the page's plant, no range is taken.</p>
  <ul class="rules">
    <li>The range is read from Kew's files of the day the page states: the "Extracted" day of Kew's README, 4 June 2026 for this reference. The record of the page's sources says "as of" that day, not the day the page was built.</li>
    <li><span id="regions">A range is in Kew's units, the level-3 regions of the World Geographical Scheme for Recording Plant Distributions (TDWG), under the scheme's own names, some of them historical (Yugoslavia, Czechoslovakia, Lebanon-Syria). A species page names them as Kew does and says so beside the range.</span></li>
    <li>Regions where Kew records the plant as extinct, or as doubtfully present, are shown labelled so, and records are never tested against them.</li>
    <li>Where Kew gives only a broad region, the region is named and records are not tested against it.</li>
    <li>A page of the species list reads the range of its own Kew entry wherever GBIF's name leads to another entry or to none (GBIF's Chamaenerion angustifolium is Kew's Epilobium angustifolium), and says whose range it is.</li>
    <li>Where Kew has no entry, the app falls back to national checklists and says so, at country level only.</li>
    <li>Kew's own one-line description of a species, its life form and climate class, is quoted and credited to WCVP, RBG Kew. Nothing is derived from it.</li>
    <li>Kew's own names for each page's plant (its accepted entry, the names Kew files under it, and older names Kew accepts as species of their own) are read from Kew's files. The page lists the last apart from its other older names.</li>
  </ul>
  <details class="more"><summary>How a name is matched to Kew's entry</summary>
  <ul class="rules">
    <li>An entry of Kew's is the page's own when its author is the backbone's, read in turn: the whole citation, the basionym's author in its brackets included.</li>
    <li>Then the author who published the name, read loosely ("Hook.f." is "Hook.fil."), with or without initials ("W.Heering" is "Heering"), and with letters such as "ı" read as "i".</li>
    <li>Then, where both cite one, the basionym's author: "(Engelm.) Lem." and "(Engelm.) Britton &amp; Rose" are one name, with or without an author before "ex" inside the brackets ("(Backeb. ex Spine)" and "(Backeb.)"); an author before "ex" alone never counts.</li>
    <li>Where Kew cites the author otherwise, it is the one entry Kew accepts under the name. Where Kew lists the name twice by one author, once accepted and once under another species, the accepted entry is the one (Datura metel L.).</li>
    <li>Kew's rows are read by the family of the entry Kew files each under. GBIF's Ixora coccinea "Comm. ex Lam." is a name Kew files under Embothrium coccineum, a Proteaceae; Kew's Ixora coccinea L. is the plant.</li>
    <li>A row Kew files under a subspecies or variety of the name itself gives way to the species Kew accepts by the name (Fragaria virginiana Duchesne, filed under F. virginiana subsp. virginiana, takes the range of Miller's species).</li>
    <li>An entry of the name by another author that Kew does not accept is another name, and the page says so. Kew's unplaced Ceropegia macrocarpa J.N.Haage &amp; E.Schmidt is not Ceropegia macrocarpa (Sprenger) Bruyns.</li>
    <li>Where the species' own row is one Kew holds as a synonym of another entry, the range is that entry's, and the page says so beside the map, with a link where that entry has a page here ("Kew holds Ceropegia mixta (Masson) Bruyns as a synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's").</li>
    <li>An epithet Kew spells in another gender is read so, by the same author: GBIF's Cyphostemma congoensis is Kew's Cyphostemma congoense.</li>
    <li>So is an epithet of six letters or more that Kew spells otherwise by at most two letters, under five conditions. Kew holds no row of the page's spelling; the authors are the same; only one such spelling is in the genus; its rows lead to one entry; and the reference has no page of it.</li>
    <li>So GBIF's Reicheocactus famatimensis is Kew's famatinensis, and its Aeonium tabulaeforme Kew's tabuliforme. Bisnaga hamatacantha (Muehlenpf.) is not Kew's Bisnaga haematacantha (Monv. ex Salm-Dyck).</li>
    <li>Where the range is Kew's entry of the name by another author than the page cites, the page says so beside the map. A name Kew holds as unplaced, or under an artificial hybrid, is said as that.</li>
    <li>Two entries that are the name by these rules leave it unresolved, and no range is attached.</li>
    <li>A name Kew holds no entry for is looked up under the species' older names (Kew files GBIF's Bisnaga glaucescens as Ferocactus glaucescens). A name Kew holds with no native range is Kew's answer, and is not looked up further.</li>
    <li>An older name counts only where its author is the author of Kew's entry for it. A synonym GBIF marks pro parte is not used.</li>
    <li>A range found so is taken only when the older names lead to exactly one accepted Kew entry, at species rank. The page names that entry and the older name that reached it ("Kew's entry Erythrina afra Thunb., reached by Chirocalyx pubescens Walp.").</li>
    <li>Older names that lead to more than one entry are said as not taken, and so is one older name Kew holds twice by one author under two entries.</li>
    <li>So is a page whose own basionym, the older name of its epithet by the author its name brackets, is a record Kew holds apart from the entry the older names reach. The plant is then two of Kew's records, and no range is taken from either (Monsonia lheritieri).</li>
    <li>GBIF's synonyms are read to the end of the list. A list cut short, refused or failed is no answer for these older names, and the page says they were not asked.</li>
  </ul>
  </details>

  <h3 id="hybrids">Hybrids</h3>
  <p class="sum">A named hybrid such as Mentha × piperita is a page like any species, written with the sign as Kew writes it. It has a habitat climate when its wild records allow one. A cross you record with no page of its own has no habitat.</p>
  <ul class="rules">
    <li>A hybrid's heading, title, tile and name in the search take Kew's name for its entry, with the sign, from <code>src/lib/core/hybrids.json</code>. <code>scripts/hybrid-names.ts</code> makes that file from the species list and Kew's file (485 hybrids, from Kew's file of 2026-06-04).</li>
    <li>The page says the parents Kew's file states.</li>
    <li>Names are compared without the sign, so GBIF's Lantana strigocamara is Kew's Lantana × strigocamara.</li>
    <li>Its address is the name without the sign. An address written with an "x" for it (<code>mentha-x-piperita</code>) moves there.</li>
    <li>A hybrid's POWO and IPNI links are its Kew entry's numbers wherever its record lacks either, and the page says so. Kew's copy at GBIF writes a hybrid's row with the sign, so the name without it never found that row.</li>
    <li>A cross you record from two parents, with no page of its own, has no habitat of its own, and its plant page says so. Where its parents have pages, it links them.</li>
  </ul>

  <h3 id="keys">GBIF keys, and pages that are one plant</h3>
  <p class="sum">GBIF sometimes files one plant's records under two names. A page reads the other name's records too, but only where Kew holds that name as the same plant. Two pages that are one plant are merged into one.</p>
  <ul class="rules">
    <li>Records come from GBIF under the page's own key, as GBIF held them on the day it made the download, which the page states.</li>
    <li>Where GBIF files the same plant under another key too, that key's records and photographs are read as well, asked of GBIF on the day of the build (up to 900 records a key). The page names each key.</li>
    <li>A key is read only when Kew's file holds its name and author as the page's own name or a name of the same type: the same name by the same author, a spelling variant, a synonym Kew marks homotypic, or an autonym of one.</li>
    <li>It must not be a key GBIF already files under the page's key, another page's key, a key GBIF files under another page, or a pro parte synonym.</li>
    <li>A heterotypic synonym's key is not read, unless the page it names was merged into this one.</li>
    <li>Within a key that is read, a record GBIF identifies as a name Kew holds as another plant, or as another type, is left out.</li>
    <li>A page that loses a key at a rebuild loses the records it read under that key too: a build carries the records of the build before only to a page whose GBIF key is the one they were read under.</li>
    <li>Pages that are one plant are one page under the name Kew accepts. These are two pages whose names Kew holds as synonyms of one type (Coryphantha macromeris and Pelecyphora macromeris).</li>
    <li>They are also pages merged by the reference's own decision. The list is <code>scripts/merged-pages.txt</code>: Weingartia pulchra into Weingartia canigueralii, Drosera parvula into Drosera paleacea, Ceropegia melanops into Ceropegia nigra, Copiapoa boliviana into Copiapoa calderana, and Echeveria sessiliflora into Echeveria pinetorum.</li>
    <li>And: Ceropegia nubica and Ceropegia cereiformis into Echidnopsis cereiformis; Echeveria peacockii into Echeveria desmetiana; and Bisnaga hamatacantha into Ferocactus hamatacanthus, one type (Echinocactus hamatacanthus Muehlenpf.), whose name Kew's file does not hold.</li>
    <li>Kew's file files the name Echeveria peacockii itself under Dudleya pulverulenta, whose page shows it among Kew's names.</li>
    <li>A merged page's key is read whatever its type, and its names are listed on the page. Its own name is an older name of the page in the search, which lists the page first for it.</li>
    <li>Its old address and a plant recorded under it lead to the page. A plant recorded under the old name or any key the page reads is listed among yours there, with your notes and following kept under the old name.</li>
  </ul>

  <h3 id="no-gbif-key">Species with no GBIF key</h3>
  <p class="sum">Some species Kew accepts are not one accepted species in GBIF's backbone. Their pages take their names and range from Kew, and their records only from GBIF keys Kew's file names as this plant. Where there are none, the page says its records were not checked, and why.</p>
  <ul class="rules">
    <li>A species Kew accepts is on the list by its own records, its collector genus or its page already here, whatever GBIF holds.</li>
    <li>Where GBIF's backbone holds no one accepted species of its name that is this plant, the page is never matched to GBIF by its name. GBIF may hold the name only as another species' synonym, not at all, only as several doubtful names, or only under a genus it files in another order than Kew's family while its accepted genus of that name is in that order (Xanthoceras sorbifolium, whose one accepted usage GBIF files in the grasses).</li>
    <li>Its id is Kew's, and its name, author, family, older names and range come from Kew's file.</li>
    <li>Its Wikidata item is the one that carries Kew's IPNI or POWO identifier for the name, taken only when exactly one taxon item does. Any GBIF key the item carries is not read.</li>
    <li>Its Wikipedia article is that item's, proved as any page's is. Its iNaturalist taxon is the item's or the one iNaturalist's name search gives, taken only when the taxon's name is the species' own or one of Kew's names for it and no other species here holds it.</li>
    <li>Its English names are that item's taxon common names (P1843) in English: the language <code>en</code> and every regional English (<code>en-gb</code>, <code>en-us</code> and the others), and no other language.</li>
    <li>A statement Wikidata ranks deprecated is refused. So is a name with a letter outside the Latin script, a scientific name written as an English one, a genus named alone, and a scientific name the reference holds as another species. The record lists each name refused, with why.</li>
    <li>The others are ordered by the rule above. A name's sources are Wikidata itself and each reference of its statement that names a source outside Wikimedia, each counted once; a reference that only says the name was imported from Wikipedia or Wikispecies counts nothing.</li>
    <li>So the name more references give is first; then one Wikidata ranks preferred, which only breaks a tie; then the alphabet, since Wikidata's query service gives no order of its own.</li>
    <li>The page says its English names are Wikidata's, spelt as Wikidata spells them, with the item and the day it was read. A slip in Wikidata's spelling ("Sierrra shootingstar") is kept, since correcting it would be a guess.</li>
    <li>Where Wikidata did not answer, or no one item was taken, the names are "not checked", with why. They are none only where Wikidata answered and holds none, or no item carries Kew's identifiers.</li>
    <li>They are read when the page is built, and again by the build's <code>--fill wikidata-names</code> step, two hundred items a query. Pages with a GBIF key take no names from Wikidata.</li>
    <li>Its GBIF records are read only under GBIF's keys for the names Kew's file holds as this plant (its own name and author, a spelling, a homotypic name, or an autonym of one), never a name matched. They are listed in <code>scripts/extra-keys-kew.txt</code>.</li>
    <li>Those records make the page's map, marker, habitat climate and record counts as any page's do. The page keeps no GBIF key of its own, and has no photographs from GBIF.</li>
    <li>A page Kew's synonymy gives no such key has its GBIF records not asked. It has no points on the map, no marker, no habitat climate and no species of nearest climate, and each says "not checked", with why, never "none".</li>
    <li>The why is the page's own, read by the same rule from what GBIF's backbone holds of Kew's names for it (<code>scripts/extra-keys-kew-none.txt</code>). GBIF files those names under another page here, which the page names and links; or the backbone holds none of them; or only as another type's names, as names partly another taxon's, or under another author than Kew's.</li>
    <li>Where Kew accepts that other page's species apart from this one, the page says GBIF lumps what Kew splits. A record is shown on one page only.</li>
    <li>A plant of it is found by its name. A GBIF key a plant records for it is compared with the keys the page reads GBIF's records under, and the plant's page says whether it is one of them.</li>
  </ul>

  <h3 id="climate-data">Climate and elevation</h3>
  <ul class="rules">
    <li>Monthly climate normals come from <b>CHELSA V2.1</b> (1981–2010, 30 arc-seconds), packed to a 0.05° grid: day and night temperature, rainfall, solar radiation, relative humidity, vapour-pressure deficit and wind.</li>
    <li>Elevation comes from <b>ETOPO 2022</b> on the same grid.</li>
    <li>Daily temperature extremes come from <b>NASA POWER</b>, from 1981 on. Each page states how many years its series covers.</li>
    <li>The coastlines of the maps on a species page are <b>Natural Earth</b>'s (public domain), drawn from files this site serves itself.</li>
    <li>Both maps draw each native region by its simplified shape, the range test's own, from files this site serves and browsers keep, as they keep the coastline. A region with no shape is drawn as its box. Where one region's shape holds the whole close-up, the map says the frame is inside it.</li>
  </ul>

  <h3 id="photos">Photographs</h3>
  <p class="sum">Photographs come from GBIF's records, iNaturalist and Wikimedia Commons, each with its author and licence. Wild plants lead; cultivated ones are marked so. A file that may be another plant, a map, a drawing or a pressed specimen is not shown.</p>
  <ul class="rules">
    <li>Photographs come first from the media that <b>GBIF</b>'s occurrence download carries, drawn from records under an open licence first. Research-grade iNaturalist observations and other observation datasets reach GBIF this way.</li>
    <li>Where the records came as GBIF's SQL download, which carries no media, a download of the same records that carry images is read, and for a species that download did not ask for, GBIF is asked instead, human observations only, as the download is read.</li>
    <li>The other GBIF keys' photographs come after the page's own key's.</li>
    <li>Then <b>iNaturalist</b>'s wild set, from its open data, the export it publishes each month on AWS. These are research-grade observations of the taxon or one below it, with a CC0, CC BY or CC BY-SA photograph.</li>
    <li>Of a taxon with more than 24 such observations, the 24 iNaturalist puts first by votes, asked of iNaturalist directly when the daily fill reaches the page, since the export holds no votes; until then, the 24 whose photographs iNaturalist received last.</li>
    <li>A set iNaturalist's API gave before the build read its open data is read again by this rule when the daily fill reaches the page, and until then is the 24 iNaturalist put first by votes the day it was asked, each with the locality iNaturalist names and its page by the observation's number.</li>
    <li>A photograph's page is its observation's, by the observation's uuid.</li>
    <li>A taxon newer than the export is asked of iNaturalist directly, for species the download gave few of.</li>
    <li>Then iNaturalist's cultivated set: observations marked captive or cultivated, which iNaturalist never makes research grade. Each is taken only when its identifications agree: two or more current ones, the community taxon the observation's own, and none disagreeing.</li>
    <li>Cultivated photographs are marked "cultivated" on the page and "in cultivation" in their credits.</li>
    <li>An observation of a taxon below the species that Kew's file places under another species is left out.</li>
    <li>Then, for a species the download does not hold and iNaturalist gave fewer than six, GBIF's records under an open licence (CC0 or CC BY). Last, <b>Wikimedia Commons</b>, whose files do not count towards the six.</li>
    <li>Every photograph is restricted by its own licence to CC0, public domain, CC BY and CC BY-SA, whatever dataset it came through. A GBIF photograph whose own media item states no licence is not published under its record's.</li>
    <li>Each carries its licence, and its author where the source names one. An iNaturalist photograph's author is its observer, by name or, where there is none, login, under CC0 too ("Alan Weakley, no rights reserved (CC0)").</li>
    <li>Under CC BY and CC BY-SA a photograph without an author is not published. An e-mail address is never published as an author, and a credit naming only one counts as none.</li>
    <li>iNaturalist's grey stand-in for a photograph it has not yet processed is not a photograph.</li>
    <li>A photograph in the public domain is labelled "Public domain", never CC0, which is a waiver only an author can make.</li>
    <li>The lead photograph is iNaturalist's wild one first, then GBIF's, then iNaturalist's cultivated, then Commons'. GBIF's media of a record that is not an observation of the living plant, or on a herbarium's own host, is not shown.</li>
    <li>A photograph that two species' pages would both show is shown on neither. The one exception is an iNaturalist observation GBIF files under the other page by an older name Kew accepts as the first page's species: it is shown on the first page only.</li>
    <li>On a species page and on the compare page each photograph shows its author and licence. A small tile elsewhere gives the licence and the author's name, cut to forty characters ("Photo: CC BY, Jane Doe").</li>
    <li>A tile names the site the photograph came from instead where the credit cannot be said short and true. The species page it opens gives the full credit and a link to the source.</li>
    <li>A credit whose author's line names one licence and whose source tags another says the two disagree.</li>
  </ul>
  <details class="more"><summary>Which Commons files are shown, and at what size</summary>
  <ul class="rules">
    <li>Commons' licence is read only from its short names CC0, CC BY, CC BY-SA, Public domain and PD. A file under any other, such as Commons' own "Attribution", is not shown.</li>
    <li>A Commons file's author is its Artist field, its first line, never its source ("Own work"); a derivative work names both, the original's author and its maker, and never the file's name.</li>
    <li>"See above", "Unknown author", a "(talk)" link, a web or e-mail address, a template's unfilled "MyName", and a derivative work's maker alone are not authors.</li>
    <li>"No machine-readable author provided. X assumed", "The original uploader was X at … Wikipedia", "Photo by X" and "Photograph by: X" name X. A signature's talk link and time, "Uploaded by …" and a footnote mark ("[1]") are taken off, keeping the person.</li>
    <li>A Commons file is shown only as a JPEG or WebP photograph whose name and categories mark it as none of the things below. The categories are read as Commons gave them to the build or to the fill.</li>
    <li>Not a map (in any language: "Areale", "mapa", "carte", "ареал"), or a file Commons keeps among a place's maps.</li>
    <li>Not a pressed, mounted or museum specimen, or one whose source is a herbarium's or museum's specimen record, or whose description calls it a herbarium, pressed, mounted, dried or preserved specimen, or a specimen of a natural-history museum (a plant on show in another museum is shown).</li>
    <li>A living plant in a garden is shown, whatever its category calls it, and where Commons got a file, GBIF or iNaturalist, is not read.</li>
    <li>Not a plate, drawing or other printed illustration, or a paper's figure. Not seeds (a pod on the plant is the plant), resin, a stamp, a book, a label or an information board.</li>
    <li>Not a photograph whose name names no plant and which Commons files as a place (a river, a valley, a landscape, a plantation).</li>
    <li>Not an animal named in the file's name ("nymphs", "bees"), or a file Commons files under an animal unless its name names the species. A flower with an insect on it is the plant.</li>
    <li>Not a plant Commons calls unidentified, a hybrid ("hybrid" in its name, or the sign), or a plant named "aff." or "cf.".</li>
    <li>Not a photograph Commons files under two or more species, unless its name names this species and none of the others ("Vertical garden" names no Aloe vera). The species' own names and varieties count as the species.</li>
    <li>Not one whose description strikes out a name, and not another plant.</li>
    <li>A genus named alone is another plant only where a species of the reference is accepted under it and it is not the last word of an English name before it ("Pariette Cactus", "Autumn Crocus").</li>
    <li>A name that holds no two-word name and none of the species' epithets, but holds another species' epithet in its genus ("Heterodoxa pt12"), names that species.</li>
    <li>The species' own names are its accepted name, its older names from GBIF and, once Kew's file has been read for the page, Kew's synonyms of its entry, less the older names Kew accepts as species of their own.</li>
    <li>A name one letter from the species' is the species' where Kew and GBIF hold no such species, or where GBIF's record of it is one of the species' names by the same author, spelt otherwise.</li>
    <li>A Commons copy of an iNaturalist photograph the page shows, known by the photograph Commons names as its source or by the number at the end of its name, is shown once.</li>
    <li>A credit naming a lithographer or draughtsman ("lith.", "del.") or a post office marks a printed work or a stamp. So does a year from 1500 to 1899 in the file's name with other print evidence (a plate's or a book's words in the name, a category of scans, a licence for old works).</li>
    <li>A year cited after a page ("- 19 (1827)") is no year. Another genus of the reference named alone in the name marks another plant.</li>
    <li>Every binomial in the name, of the species' own genera or any genus the reference holds, is compared with the species' own names as genus and epithet together.</li>
    <li>An older name's epithet counts only with that name's genus; an older name counts only where no species here holds it as its accepted name; and one below species only whole ("Babiana stricta var. purpurea" is Babiana purpurea's; "Babiana stricta" is not).</li>
    <li>Another spelling of the species' epithet is the species': a gender ending within one declension (-us, -a, -um, or -is, -e), so "Euphorbia peplis" is not Euphorbia peplus; an adjective in -er in any gender ("stolonifer", "stolonifera"); hyphens and spaces.</li>
    <li>Also "ae" for "e" within a word, "oe" for "e" before a consonant, "ii" for "i", "ai" for a genitive "ae" after a consonant, and "afr-" for the "caffr-" the Code replaced in 2024.</li>
    <li>So is an uploader's slip of five letters or more (one letter added, dropped, changed or moved), but only where the reference holds no species of that name in that genus, and neither Kew nor GBIF holds it as a species or a name of another species. The same name by the same author spelt otherwise is one name.</li>
    <li>Kew and GBIF are asked by the build or the fill; until then the file is not shown.</li>
    <li>So "Mammillaria mabudae" is Mammillaria matudae; "Echinocereus schereri" is a species of its own, and "Ceropegia mariae" Kew's synonym of Echidnopsis scutellata.</li>
    <li>Of the rest, files whose name holds the species' epithet come first, and of those, files at least 500 pixels wide. A Commons file leads only a page with no photograph of a living plant from iNaturalist or GBIF.</li>
    <li>A Commons photograph is loaded at whichever of Commons' own versions the place needs: 960 pixels wide for the lead (500 on a phone, or where the screen needs no more), and 500 on the compare page.</li>
    <li>It is loaded at 250 on a front-page tile, in the strip under a species' name and on a Related tile, and at 120 in a catalogue row or beside a genus.</li>
    <li>It is never loaded as the original upload where Commons has a version the place can use. An upload from 501 to 960 pixels wide leads at its own width.</li>
    <li>One no wider than 500 is loaded at Commons' largest version below its own width, 250 or 120, and whole only where it is 120 pixels wide or less, or its width is not known.</li>
    <li>One Commons gave no smaller version of is shown as uploaded.</li>
  </ul>
  </details>

  <h3 id="summary">The quoted summary</h3>
  <ul class="rules">
    <li>The summary is the opening of <b>Wikipedia</b>'s article, quoted as written, kept visibly apart and credited, with a link where more followed. It is four sentences at most, within the first 1,500 characters.</li>
    <li>It is cut only where a sentence ends. A summary that does not end a sentence, as Wikipedia gives it, ends with "…" and links the article, as one cut short does, whenever it was built.</li>
    <li>It is the first paragraph of the lead as Wikipedia gives it in plain text, its brackets kept, and none left empty where a pronunciation was taken out.</li>
  </ul>
  <details class="more"><summary>When a summary under another title is quoted</summary>
  <ul class="rules">
    <li>A summary under any title but the species' name is quoted only when that title is shown to be this species' article. That holds for a title Wikipedia reached through a redirect, and for the title of the species' Wikidata item.</li>
    <li>It is shown so when the title, or the taxon its Wikidata item names, is the species' name or an older name at species rank.</li>
    <li>Its epithet may differ only as the photographs' rule above allows, by a hyphen but not a space; a genitive in -ae is never read as a gender.</li>
    <li>Or when the title is the English article of the species' Wikidata item, but not when that title is a binomial, neither its name nor an older name, that GBIF holds as another species or under a variety or subspecies of this one and that Kew holds too.</li>
    <li>Or when another item has the same type as the species' item by Wikidata's basionym statements ("Huernia zebrina" for Ceropegia zebrina).</li>
    <li>Or when GBIF holds the title as a synonym of this species, or Kew holds the species' name under the title, both combinations of one basionym ("Zephyranthes formosissima" for Sprekelia formosissima).</li>
    <li>Or when the title's item carries the species' IPNI identifier, or one whose IPNI record is the species' name by its author ("Rosa lucieae" for Rosa luciae).</li>
    <li>Or when the title's item names this species as the plant it is a product of, and no other plant but its genus ("Apple").</li>
    <li>Or when the title is a genus in which Kew's checklist, as Kew publishes it through GBIF, holds one accepted species, and that species is this one ("Welwitschia").</li>
    <li>What the article's opening says is never taken as proof.</li>
    <li>A summary quoted from under another title names its proof: beside the quotation where the title is one of the species' older names, and in the page's record of its sources otherwise.</li>
    <li>One not quoted is recorded as Wikipedia redirecting one title to the other. One whose proof could not be read, because Wikidata, GBIF, Kew or IPNI did not answer, is recorded as not checked, and is not shown until it is read.</li>
  </ul>
  </details>

  <h3 id="ids">Identifiers and links</h3>
  <ul class="rules">
    <li>The species' identifiers in POWO, IPNI, World Flora Online and iNaturalist, and the title of its English Wikipedia article, come from <b>Wikidata</b>, from the item that carries the species' GBIF key.</li>
    <li>The IPNI and POWO links are Kew's number for the name and author wherever Kew holds one, read from the same file as the range, whether or not the Wikidata item gives a number, and whatever Wikidata answered. An item's number Kew holds for another author's name is never linked.</li>
    <li>A number Kew gives a name IPNI does not hold (one ending "-4") links POWO only. Where Kew holds the name only under another author, the page says so and links no POWO page.</li>
    <li>When Wikidata does not answer, the identifiers of the build that last read them are kept for at most 90 days. The page names that build and says beside its register links that they were not checked.</li>
    <li>Where that build's day is not known, they are kept for at most 90 days from the build that first kept them, and the page says so.</li>
    <li>Wikidata's items are read without waiting on its query service's lag, which no read of an item depends on, and a refusal or a busy answer is asked again after the wait it names, up to five times.</li>
  </ul>
  <details class="more"><summary>How the Wikidata item is chosen</summary>
  <ul class="rules">
    <li>A page with a Kew id is matched by those identifiers wherever Kew's file gives its name and author one. Of two items that carry its GBIF key, the one that carries Kew's IPNI or POWO identifier for it is taken; with none, the one item that carries either; otherwise no item, which the page says.</li>
    <li>Its label is read only where Kew gives its name and author no identifier (Mentha × piperita, whose name GBIF's copy of Kew's file writes with the sign), or on a page whose Wikidata record was made before this rule and is carried.</li>
    <li>Such an item is taken only once proved as below, by its IPNI or POWO number on nearly every such page. The record says so ("found by its label; its IPNI identifier 86934-2 is Kew's for Echeveria elegans Rose").</li>
    <li>When Wikidata finds no item that carries the key, the items in its first five answers to the name are read. An item counts when its label is the name exactly, or it gives the name as an alias (Fragaria virginiana's item is labelled "Virginia strawberry").</li>
    <li>An item whose label spells the epithet another way counts too: "Nepenthes burbidgeae" for Nepenthes burbidgei. That is a genitive ending only, never the adjective: an item labelled "Parodia ritteriana" is not Parodia ritteri.</li>
    <li>Each is a taxon by what Wikidata says it is (a print of the plant is passed over), and one is taken only when it shows it is this plant, in one of the ways below.</li>
    <li>It carries the species' GBIF key, or that of an older name with the same type. Or its POWO identifier is Kew's for this name by the backbone's author.</li>
    <li>Or its IPNI identifier is Kew's for this name by the backbone's author, or for the entry of these words Kew files that name under. If Kew cites the author otherwise, it may be Kew's for the one entry Kew accepts under the name, IPNI's own record of these words by that author, or IPNI's isonym of Kew's.</li>
    <li>The build asks IPNI itself, www.ipni.org, for the record of an identifier Kew does not hold, and of the identifiers a Wikipedia title's Wikidata item carries, at most once a second.</li>
    <li>An IPNI identifier that is Kew's for another author's name of these words refuses an item. A name with the same author before "ex" ("Welw. ex Hiern" for "Welw. ex Ficalho") is not another author's.</li>
    <li>A GBIF key of another author's name refuses it too, unless its POWO identifier proves it, and any other identifier proves nothing either way.</li>
    <li>Or, with no IPNI identifier, one of its GBIF keys (up to five are read) is GBIF's record of a synonym of the species, or of this name at species rank in the plant kingdom, and none is a record GBIF files under another species.</li>
    <li>Or, carrying no GBIF key GBIF still serves, it gives the name as its taxon name, which counts only when no other item shows more.</li>
    <li>Failing these, the item that carries Kew's IPNI identifier for the name is taken, before the older names with the same type are asked (Scilla siberica's item, labelled "Siberian squill", carries it).</li>
    <li>Two items that qualify are no answer, unless both name one basionym; then they are one plant, and the one Wikidata links to iNaturalist is taken.</li>
    <li>Of two items found by the older names, the one that carries the IPNI identifier of the entry Kew accepts is taken (Parrycactus flavovirens, Kew's synonym of Ferocactus flavovirens). The record says which rule took the item.</li>
    <li>Wikidata and iNaturalist are asked under older names when neither knows the species by its current name (Wikidata's item for Bisnaga glaucescens is Ferocactus glaucescens).</li>
    <li>That is only under the older names that share its type: the name it was first published under and names moved from it, never a name lumped in on another type. The answer is taken only when it is one item, or one taxon.</li>
    <li>GBIF or Kew not answering while an item is checked is said as theirs, and the previous identifiers are kept as when Wikidata does not answer.</li>
  </ul>
  </details>

  <h3 id="inat">The iNaturalist taxon</h3>
  <ul class="rules">
    <li>Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist: by the build, or, where the build left iNaturalist to the daily fill, by the fill, thirty ids a request, before it asks iNaturalist for any photograph of the taxon.</li>
    <li>Until the fill reaches it, a page may show the wild photographs the open data holds under an id not yet checked, or say it holds none.</li>
    <li>A build that leaves iNaturalist to the fill keeps the id the page had, and each of its iNaturalist rows says it was left to the fill.</li>
    <li>From iNaturalist, asked under older names, a taxon is taken only when its own name is one of the species' own names and never one this reference holds as another species. A variety it files an older name under, whose species is one of them, is read as that species. Its name search is limited to plants.</li>
    <li>An id iNaturalist has made inactive is followed to the one current taxon it names. An id from Wikidata or an earlier build is kept only when that taxon is this species, in one of the ways below.</li>
    <li>Its name is one of the species' own: its name, an older name with the same type, or another name GBIF holds as its synonym that no species of this reference holds as its own, in any spelling of the epithet.</li>
    <li>Or GBIF's backbone holds the name as this species, or corrects it as a misspelling to this very species (GBIF's fuzzy match: Othonna linearifolia, as Kew and iNaturalist spell the page's Othonna lineariifolia), while a correction to another species is never read as this one's.</li>
    <li>Or Kew holds it as a synonym of this species, or this species as a synonym of it.</li>
    <li>Or, where neither places it in this reference, it is this species' epithet in another genus (Zephyranthes formosissima for Sprekelia formosissima), or its epithet one letter otherwise where no species here holds that name (Echinocereus chisosensis for Echinocereus chisoensis). In either case no other species of the family here has that epithet.</li>
    <li>A name Kew accepts as a species, or holds as a synonym of another, is never a slip. Nor is one GBIF holds otherwise than as this species, unless GBIF's record is this species' name by its own author spelt otherwise (GBIF's Othonna cakilifolia DC., which Kew spells cakilefolia: one name).</li>
    <li>A name in another genus is never taken when Kew accepts both (Lupinus longifolius is not Acacia longifolia).</li>
    <li>A taxon GBIF holds as another species of this reference is never taken, however it was found (Pinguicula antarctica for Pinguicula chilensis), nor one Kew holds so, except a taxon iNaturalist's own name search files the species under, for which Kew is not asked.</li>
    <li>The taxon an inactive id named is not taken from the name search either.</li>
    <li>A variety that is the species' own type (Tricyrtis formosana var. formosana) gives way to iNaturalist's taxon of the species.</li>
  </ul>

  <h3 id="papers">Papers</h3>
  <ul class="rules">
    <li>The reference no longer asks <b>OpenAlex</b> for papers, so a page built since has no Papers section, and its record of sources says OpenAlex was not asked, and why.</li>
    <li>A page built before October 2026 may still list papers OpenAlex gave (CC0): works whose title or abstract names the species, most cited first. They are a pointer to the literature; nothing on the page is drawn from them.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── The species list ─────────────────────────── -->
  <section aria-labelledby="list">
  <h2 id="list">Which species are here</h2>
  <p class="sum">The list of species was derived by rule, not chosen by hand. It holds every species with at least three records of cultivated plants, and every species of 173 collector genera. A species that is not here says nothing about the plant, only about the list.</p>
  <ul class="rules">
    <li>The list is the file <code>scripts/species-list.txt</code> in the source, written by <code>scripts/select-species.ts</code> on 19 October 2026: 48,357 species.</li>
    <li>It holds every species Kew's World Checklist accepts with at least three records of cultivated plants.</li>
    <li>It holds every species Kew accepts of 173 collector genera taken whole: the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs and their like, less their hybrids. The list is <code>scripts/specialist-genera.txt</code>.</li>
    <li>It keeps every species that was already in the reference, so that no page falls out.</li>
    <li>Each page is the species of the Kew entry it cites, or of its name where Kew holds that name for one species alone; 26 species are here for that reason alone. Pages whose names Kew's checklist does not place keep GBIF's key (14 on 29 October 2026).</li>
    <li>The records counted are iNaturalist's observations marked captive or cultivated, and GBIF's living-specimen records from living collections.</li>
    <li>GBIF's count only from datasets that a stated rule finds to be living collections, by each dataset's own description. A dataset that names a genebank (germplasm, a seed bank, plant genetic resources or passport data, in the words of FAO's genebank standards) is left out.</li>
    <li>One whose title, keywords or publisher names a botanic garden, an arboretum, a garden or a living collection is counted. Any other, such as a register of street trees or a field survey, is not.</li>
    <li>The three lists are <code>scripts/counted-datasets.txt</code>, <code>scripts/excluded-datasets.txt</code> and <code>scripts/undecided-datasets.txt</code>. So the genebanks' 1.9 million records, mostly wheat, rice and barley, count for nothing, and a crop is here by its growers' own records.</li>
    <li>No family is left out.</li>
    <li>Each name is matched to a species Kew accepts only where the match is unambiguous. Every name of Kew's of those words leads to one species; or GBIF's name and author lead to one; or, for iNaturalist, whose plant names follow Kew's POWO, Kew accepts exactly one species of those words.</li>
    <li>iNaturalist lists where its names depart from Kew's, but that list could not be read, so those departures are not applied.</li>
    <li>Every name refused, and why, is in <code>scripts/species-refused.txt</code>. Each line of the list says why its species is there: its two counts, or its collector genus.</li>
    <li>The very large genera are not taken whole: Aloe has 199 of the 611 species Kew accepts, Euphorbia 401 of 2,118.</li>
  </ul>
  <h3 id="grown">"Popular genera"</h3>
  <ul class="rules">
    <li>The front page's catalogue is the same on every device: every genus and every species.</li>
    <li>Its chip "Popular genera", off until chosen, narrows it to the popular genera. These are the fewest genera that, taken from the most observed down, hold half of iNaturalist's observations of plants marked captive or cultivated, across the reference's genera that were counted.</li>
    <li>It is a measure of genera, not of species or of growers. Each genus is counted with every taxon under it.</li>
    <li>The count was made on 22 October 2026, over the 6,539 genera the reference and its species list then held; 6,449 of them were counted. <code>scripts/most-grown-genera.txt</code> holds every count, the query and iNaturalist's terms.</li>
    <li>A genus is counted only where iNaturalist holds exactly one active genus of plants of that name. One it holds only as an old name, such as Callistemon or Mahonia, or one whose count did not answer, is not counted and is not under the chip, and nor is a genus that joins the reference after the count, until it is made again.</li>
  </ul>
  <h3 id="feature">The photographs on the front page</h3>
  <ul class="rules">
    <li>The front page's photographs are chosen by rule, not by hand, from the "Popular genera", most grown first.</li>
    <li>Of each such genus, one species with eight photographs or more and a habitat climate: the one most observed in cultivation on iNaturalist, then the most photographed. The first 48 genera that have one make the strip, and twelve of them are shown a day, in turn.</li>
    <li>A reference built before 30 October 2026 chose them otherwise: of the 48 genera with the most photographed species, the species of each with the most open records.</li>
    <li>The strip sits above the search, on a phone as on a desktop.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Search ─────────────────────────── -->
  <section aria-labelledby="search">
  <h2 id="search">Search</h2>
  <p class="sum">Search finds a species by its name, an older name, an English name, its family or where it grows. A name you type exactly comes first, then the species whose English name it is. A query that matches nothing is tried again with a typing error forgiven, and the page says so.</p>
  <ul class="rules">
    <li>First, a name typed as a name, its genus first: <span class="ex" data-q="copi" data-order="Copiapoa" data-first>"copi" is the Copiapoas</span>. A genus that only begins with a word typed whole comes after the common names holding the word whole: <span class="ex" data-q="rose" data-order="Rosa | Rosenbergiodendron">"rose" is the roses before Rosenbergiodendron</span>.</li>
    <li>Then an older name typed as one: <span class="ex" data-q="Sansevieria trifasciata" data-order="Dracaena trifasciata" data-first>"Sansevieria trifasciata" is Dracaena trifasciata</span>. A species that holds the name exactly comes first: <span class="ex" data-q="Cornus mascula" data-order="Cornus mas | Cornus officinalis" data-first>"Cornus mascula" is Cornus mas before Cornus officinalis</span>.</li>
    <li>Then the species that keeps the name's epithet, then one that shows the name among its six: <span class="ex" data-q="Aloe variegata" data-order="Gonialoe variegata | Aloe vera" data-first>"Aloe variegata" is Gonialoe variegata before Aloe vera</span>.</li>
    <li>Then the query read whole against each English name, every word in one name: <span class="ex" data-q="Black eyed Susan" data-order="Rudbeckia hirta">"Black eyed Susan" is Rudbeckia hirta and the other black-eyed Susans</span>, however it is capitalised. <span class="ex" data-q="snake plant" data-order="Dracaena trifasciata" data-first>"snake plant" is Dracaena trifasciata</span>, never the words of two names.</li>
    <li>Then every other match, such as a word of an English name with a word of a place.</li>
    <li>A family is matched by a whole word, or from its start by a word of six letters or more that is neither a genus here nor a word of the species' own name. So "aizoac" finds the Aizoaceae, and "plant" is never the start of Plantaginaceae.</li>
    <li>Within each, a name that is exactly the query comes first, the shown English name before the others.</li>
    <li>Of the species that hold a one-word query as a name, one whose shown English name holds the word too comes first, wherever the name stands among its others: <span class="ex" data-q="snowdrop" data-order="Galanthus nivalis" data-first>"snowdrop" is Galanthus nivalis, "Common snowdrop", first</span>.</li>
    <li>A generic noun matched alone comes after every match of whole words, unless the species' shown name holds the word. So does a one-word name species of two genera or more are called, unless it is the species' own shown name: <span class="ex" data-q="peppermint" data-order="Mentha × piperita | Eucalyptus" data-first>"peppermint" is Mentha × piperita before the Eucalyptus</span>.</li>
    <li>A one-word name several species of one genus hold leads with the one of them that has the most photographs; a species headed by it with fewer comes after the others that hold it: <span class="ex" data-q="pepper" data-order="Piper nigrum | Piper ponapense">"pepper" lists Piper nigrum before Piper ponapense, which is headed "Pepper" but has fewer photographs</span>.</li>
    <li>Then a match of whole words, then a match whose shown English name holds every word.</li>
    <li>Among the English names' matches, a tie goes to the species whose matching name comes earlier among its names. Then to a name written as typed. Then to the species with more photographs: <span class="ex" data-q="jade plant" data-order="Crassula ovata | Crassula arborescens" data-first>"jade plant" is Crassula ovata before Crassula arborescens</span>.</li>
    <li>Then the alphabet: <span class="ex" data-q="fig" data-order="Ficus carica" data-first>"fig" is Ficus carica first</span>.</li>
    <li>A genus typed alone lists its species by how many English names the sources give them, then by their photographs, then the alphabet: <span class="ex" data-q="echeveria" data-order="Echeveria elegans" data-first>"echeveria" is Echeveria elegans first</span>.</li>
    <li>So does the genus still being typed or misspelt, where one genus answers ("echev", "echevaria"). Another genus that begins with the word comes after it: <span class="ex" data-q="aloe" data-order="Aloe | Aloestrela" data-first>"aloe" is Aloe before Aloestrela</span>. Several genera begun ("c") keep the alphabet.</li>
    <li>Apostrophes are taken out of a word before it is read: <span class="ex" data-q="devils backbone" data-order="Kalanchoe daigremontiana" data-first>"devils backbone" is Kalanchoe daigremontiana, "Devil's backbone"</span>.</li>
    <li>In a query of two words or more, a word of four letters or more read as an English plural is matched by its singular too. A word alone, and a scientific name, are matched as typed.</li>
    <li>Every older name the backbone gives a species at species rank is searched, though its entry shows six.</li>
    <li>So are the names GBIF or Kew files under one of the species' own varieties or subspecies, read as names of the species, as a name typed: <span class="ex" data-q="Trichocereus pachanoi" data-order="Trichocereus macrogonus" data-first>"Trichocereus pachanoi", the San Pedro cactus, finds the page of the species GBIF calls Trichocereus macrogonus and Kew Echinopsis macrogona</span>. A page does not show them.</li>
    <li>Kew's older names for the plant are searched only as a name typed: two words or more, the first the name's genus in full. <span class="ex" data-q="Echinocactus chrysacanthus" data-order="Ferocactus chrysacanthus" data-first>"Echinocactus chrysacanthus" is Ferocactus chrysacanthus</span>. They are never matched by a similar spelling or a word alone, and a page does not show them.</li>
    <li>An older name the record spells as another species' accepted name here, by another author or with no author, is searched only as a name typed. It comes after the species of that name and every species holding it as an older name of its own.</li>
    <li>Its row says "older name under another author: Sempervivum montanum Sibth. &amp; Sm.", as the species page says it. One the record writes by that species' own author is one name, which GBIF files under both, and stays an older name.</li>
    <li>The name of a page merged into another, typed as a name, lists the page it was merged into first, before every other species that holds the name as an older name: <span class="ex" data-q="Echeveria peacockii" data-order="Echeveria desmetiana | Dudleya pulverulenta" data-first>"Echeveria peacockii" is Echeveria desmetiana, then Dudleya pulverulenta</span>.</li>
    <li>Its row, in the catalogue and in the species picker, says "Echeveria peacockii is merged into this page".</li>
    <li>A match found by an older name says so on its row ("older name: Sansevieria trifasciata") and opens its page with the line that says whose name it is.</li>
  </ul>
  <h3 id="search-reading">How a query is read</h3>
  <ul class="rules">
    <li>A query is read as a botanical name written the way growers write it. Var., subsp., f., fo. and v. are ranks; after cv. the rest is a cultivar and is left out.</li>
    <li>"cf.", "cfr.", "aff.", "vel aff.", "nr." and "near" (between two words of a name) are skipped. "sp.", "spp." and "nov." end the name.</li>
    <li>"x" or "×" marks a hybrid, and the name starts again after it, so the word after the sign is never an author. A hybrid is found the same with the sign, with an "x" or with neither.</li>
    <li>A cultivar in quotes after the name, any quotes, is left out when it begins with a capital. Quotes around the whole query are taken off, and the text inside is searched.</li>
    <li>An author citation pasted after a name is left out, in either case ("L.", "l.", "Britton &amp; Rose").</li>
    <li>A capitalised word is read as an author only after an epithet of four letters or more. A word ending in a full stop, or a capitalised abbreviation of four characters or fewer ("St.", "L."), is read so only after an epithet or a rank. So "Lily of St. James" and "String of pearls." are searched whole.</li>
    <li>When the reading as a botanical name would leave words out, the whole query is read against the English names first.</li>
    <li>When nothing matches exactly, one typing error is allowed per word of four letters or more, against the species' names only. Family and places are matched only as written. The nearest spelling comes first.</li>
    <li>A genus of four letters or more still being typed, or misspelt, that several genera answer lists them by how near each is to the word typed, then the genus with more species, then the alphabet: <span class="ex" data-q="lithop" data-order="Lithops | Lithophragma" data-first>"lithop" is Lithops before Lithophragma</span>.</li>
    <li>A genus of the reference typed in full is matched only as typed. So "Aloe × nobilis", a hybrid the reference does not hold, is not Margaritaria nobilis by a word one letter from "aloe"; it is answered by its first parent.</li>
    <li>After a first word with a capital, a capitalised word is matched only against a whole word: <span class="ex" data-q="Aloe Verra" data-order="Aloe vera" data-first>"Aloe Verra" is Aloe vera</span>, not a plant of Algeria, and "Echeveria Lola" is not Echeveria lilacina.</li>
    <li>Then the query is tried again on its first two words. A hyphenated epithet is one word, and a hybrid formula is tried on its first parent. A single letter, two words whose second is a small word such as "of", or words of a sentence ("this is the one my grandmother grew"), are never tried again.</li>
    <li>Still nothing: a last word of five letters or more is read from fewer of its letters, as a name still being typed is (one, two and three fewer, then its first four), and the first reading that answers is shown. So "lithops lesleyi" is Lithops lesliei, and the page says which letters it read.</li>
    <li>Last, a genus followed by capitalised words (a cultivar without quotes, "Crassula Gollum") is answered with its genus, but only when the first word is a genus here. A common name in title case ("St Johns Wort") is never cut to its first word.</li>
    <li>Whenever words were left out, the page says so: "Searched for “Copiapoa cinerea”, leaving out “Phil.”". When the query was tried again: "Nothing matched … as written. Showing results for …". When matches came by a similar spelling, it says that too.</li>
    <li>The search finds its matches in files the reference is built with (<a href="#corpus">below</a>). Where those files say only that more than 2,000 species would have to be looked through for every word, it lists none and says "Too many species match “…” to list them all. Type another letter or another word to narrow it."</li>
    <li>That is a query of two words or more whose every word begins words of more than 2,000 species ("a e"), a typing error of such a word ("provinses"), or a typing error whose similar spellings would mean looking through more than 12,000 species or putting more than 2,000 in order.</li>
    <li>A word alone, however common, is answered, from the reference's own best hundred answers to it. So is a region of origin typed whole whose every word is that common ("Cape Provinces").</li>
    <li>A query that names a region of origin, whole or in part ("cape prov"), is also answered with the broad region it is part of in the Origin grouping, linked to that row. A region is read through a typing error only where no species answered the query as typed.</li>
    <li>The page says how many species match ("30 of 259 matches"). It shows thirty, and sixty more each time "Show more" is pressed. A genus typed alone links to its catalogue row, which lists every species of the genus.</li>
    <li>An address under an older name goes to the one species that holds it, so /species/arbutus-uva-ursi is Arctostaphylos uva-ursi.</li>
    <li>A name two species or more hold goes to none of them. The page says it is an older name of those species, and names each with the author under which its record holds the name ("Echeveria farinosa Lindl., now Dudleya farinosa; Echeveria farinosa VanHoutte, now Dudleya pulverulenta").</li>
    <li>Where GBIF files one name by one author under two of them it says so ("one name, not two").</li>
    <li>But the old address of a page merged into one of them goes to that one (/species/echeveria-peacockii is Echeveria desmetiana, though Kew's file also files the name under Dudleya pulverulenta). The page says the name is merged into it, and is also an older name of the others, with the author under which each one's record holds it.</li>
    <li>An address the backbone resolves through a subspecies or variety goes to its species, and the page says so while the server holds the backbone's answer, a day (/species/echinopsis-pachanoi is Trichocereus macrogonus).</li>
    <li>The search is kept in the page's address, so a reload or a shared link answers it again. Back from a species page returns to the same list, as long as it was, at the same place.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Who writes ─────────────────────────── -->
  <section aria-labelledby="written">
  <h2 id="written">Who writes the words</h2>
  <p class="sum">Nothing about a species is written for its page by a person or by AI, apart from credited quotations. Every sentence is a quotation, a figure with its source, or a labelled reading of a fixed rule. The templates were written once, the same for every species.</p>
  <ul class="rules">
    <li>The figures at the top, the season card and the cultivation sheet are figures with their sources, and the readings two fixed rules make of them. Each section's "How this section is made" says which figure each sentence rests on.</li>
    <li>The templates those sentences are filled into, the labels and the notices were written once, for every species, by the author with Claude, an AI model, as the code was. They are in the source (<code>src/lib/core/sheet.ts</code> and the page files), and no text is written or generated for any one species.</li>
    <li>The labels over the figures ("Cold floor (1 night in 100)", "Warmest month, mean daily high", "Rain a year (median across the range)", "Open-sky light") name the figures under them. They are not readings of them.</li>
    <li>No row says what a plant does, wants or tolerates, or what to do to it.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Refusals ─────────────────────────── -->
  <section aria-labelledby="refusal">
  <h2 id="refusal">A refusal is not an absence</h2>
  <p class="sum">Sources time out and go down. When one does, the page says "not checked" rather than showing an empty list. "We could not ask" and "there is nothing" are different facts, and a grower needs to know which.</p>
  <ul class="rules">
    <li>Where a page's records were not checked, it says so once, under the name, with why; each section that needs the records points there ("see under the name") rather than saying it again.</li>
    <li>Wherever there is no room for the sentence, the mark is one dashed pill reading "not checked", the same on every page, and tapping it says which source, and when.</li>
    <li>A source that refused is said to have refused. One that failed or was silent has not answered. A call this site held back, or a source a build did not ask, is "not asked".</li>
    <li>A source that answered with two records where the rule takes one (two Wikidata items, two iNaturalist taxa, two Kew entries) is said as "not taken: two items answered", and nothing is taken from it.</li>
    <li>When a source refuses, the build keeps what it gave last time, and records the date it was carried from.</li>
    <li>What is carried is exact. The summary and the photographs are carried per source, so a refused iNaturalist does not discard the Commons photographs the same build got.</li>
    <li>The range, the records, the map marker and the climate are carried as one snapshot, never piecemeal: a range from one build with records from another would be a page no build made. They are carried only to a page whose GBIF key is the one the records were read under.</li>
    <li>A species page whose data cannot be read at the moment it is asked for says so, and no cache keeps that answer. It is never said to be absent.</li>
    <li>On Today, when the species sheets do not answer within fifteen seconds, every plant past its rhythm is listed, and each stop says "Resting months not checked". The sheets are asked again on "Check again" and at the next visit.</li>
    <li>The same holds the other way. A species with no habitat climate on file gets no climate rows derived from one.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Records ─────────────────────────── -->
  <section aria-labelledby="records">
  <h2 id="records">Which records count</h2>
  <p class="sum">GBIF's records include garden plants, herbarium sheets placed at the herbarium, and plants outside their native range. A species page keeps only wild records inside Kew's native range. Every record left out is counted, and the page says why.</p>
  <ul class="rules">
    <li>The build takes every georeferenced record with no flagged geospatial issue.</li>
    <li>It drops living specimens (something somebody planted), and records marked introduced or managed.</li>
    <li>It drops every record within 1 km of a botanic garden, arboretum, herbarium or zoo on Wikidata's list of them (CC0). Such a record is most often a planted plant, or a sheet placed at the herbarium that keeps it. A wild plant within that kilometre is left out with them, and counted.</li>
  </ul>
  <h3 id="default-points">Default points</h3>
  <ul class="rules">
    <li>A record at a dataset's default point is left out too, and counted. A default point is a coordinate where the open records of 20 species or more of this reference lie, nearly all with no year.</li>
    <li>It is most often a country's or a province's middle that a dataset gives records it has no place for: one in the middle of Mexico is on the maps of 180 species. The points are read from the reference's own records and listed in <code>scripts/default-points.txt</code>.</li>
    <li>A record there whose dataset states it is placed to within 10 km is kept. Most such points are survey plots and local floras that state where they are, and a country's middle states no such thing.</li>
    <li>A record at a default point that names a place but states no accuracy is left out. Some of these are true localities (a village, an estate); the rule accepts that loss, which falls mostly on the maps, since a record with no stated accuracy seldom reaches the climate.</li><!-- decision 5 -->
  </ul>
  <h3 id="shapes">Inside the native range</h3>
  <ul class="rules">
    <li>Each record left is tested against the native range from Kew, and a record outside it is discarded. Restricted records are tested exactly as open ones are.</li>
    <li>A record is inside a native region when it lies in the region's shape, or within about 5 km (0.05°) of its edge.</li>
    <li>The shapes are Natural Earth's states and provinces (public domain), placed in Kew's regions by TDWG's own tables and simplified to about 2 km. TDWG's own outlines are not openly licensed, so they are not used.</li>
    <li>A province TDWG's tables write under an older code (the former Yugoslavia's), or under none (Somaliland, South Sudan, Northern Cyprus, the West Bank), is placed in its TDWG region. An islet the simplification would drop is kept as drawn.</li>
    <li>A remote island that does not fit its region is put in its own region, or left out, rather than costing the whole region its shape.</li>
    <li>366 of the 369 regions have a shape. The other three are tested by their boxes: Christmas Island and the Cocos (Keeling) Islands, which Natural Earth's provinces do not draw, and the South China Sea, whose Spratly Islands TDWG gives no country.</li>
    <li>A region's box is its bounding rectangle, tested with the same 5 km margin as a shape. A box takes in its neighbours' corners, so it can let in a record from a country next door.</li>
    <li>A record in no region's shape, at sea or on an islet the shapes do not draw, counts for the region whose drawn coast is nearest, within about 17 km (0.15°). A record on another region's land never does: Belgium is no part of France's range, however near.</li>
    <li>Each page's record of its sources says how its records, open and restricted alike, were tested: by the native regions' shapes, by their boxes, or by how many of each, and the rule of the shapes it used.</li>
    <li>A page's record of its sources gives the day it was built, and its records were tested by the rules of that day. A page whose record names no test was built before the regions had shapes, and was tested by every region's box; one that names no rule of the shapes was tested before 30 October 2026, by the shapes of 244 regions.</li>
    <li>The page counts the records it discards. Where every record lies outside the range it says so, and where two or more do, that the range and the records disagree.</li>
    <li>The range has to be Kew's, with native status stated. A national checklist that only reports a plant present cannot tell a wild record from a garden one. For a name Kew does not carry, the page shows the records, says the range is unverified, and derives no marker, climate or sheet from them.</li>
    <li>Restricted-licence records (CC BY-NC) inform the marker and the climate like any other. Only openly licensed records are published, on the map, in the data, or as the marker itself.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Marker ─────────────────────────── -->
  <section aria-labelledby="marker">
  <h2 id="marker">The map marker</h2>
  <p class="sum">The marker is where the records are densest, and it decides nothing else. It sits on a real record where it can. The climate is not read at the marker.</p>
  <ul class="rules">
    <li>Records are binned at 1°. The bin with most neighbours wins if it holds at least half the records or twice the runner-up.</li>
    <li>If no bin dominates at 1°, the test repeats at 2° and 4°, and the densest 4° block stands when none dominates even there.</li>
    <li>Inside the winning cluster the densest 1° population is found again. The marker is the openly licensed record nearest its middle, so the pin is somewhere the plant has been seen.</li>
    <li>When no openly licensed record lies in the population, the marker is the centre of the tenth-of-a-degree cell that holds the population's middle (moved a hundredth of a degree north when a restricted record lies exactly there), so a restricted record's place is never published.</li>
    <li>The page says which kind of point it is.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Climate ─────────────────────────── -->
  <section aria-labelledby="climate">
  <h2 id="climate">The climate across the range</h2>
  <p class="sum">The habitat climate is read across every well-placed wild record, not at one point. Each place is counted once, however often it was visited. The page shows the middle year and the span the species is recorded in.</p>
  <ul class="rules">
    <li>A record counts for the climate when it is placed to within 10 km. With no stated accuracy, a person's observation with coordinates to three decimals counts, the way a phone records them.</li>
    <li>A herbarium sheet placed at a locality's centre with no figure, and every vaguer record, stays on the map and off the climate.</li>
    <li>Each record that counts names one 0.05° cell of the climate grid, and each distinct cell is read once. A site visited a hundred times is one cell of climate, not a hundred votes.</li>
    <li>A cell at sea or on ice is dropped and counted. Land is the grid's elevation layer, which averages only land, so a cell with no land has no elevation. The few basins whose whole cell lies below sea level read as sea.</li>
    <li>A species recorded in strength on both sides of the equator takes its year from the larger side alone, since a January median over both is a month no place has. That is three or more cells poleward of 10° on the smaller side, and a fifth of the cells that far out.</li>
    <li>Cells within 10° of the equator stay in either way, and the page says what was left out.</li>
    <li>Three land cells holding in-range records placed to within 10 km are the minimum; with fewer, the page says so and derives nothing.</li>
    <li>Where there are in-range records and none is placed well enough, the page says how many records, at how many places, and that none is placed to within 10 km by the climate's rule.</li>
    <li>For each month and each measure the app takes the median across the cells: the year the sheet reads. It takes the 10th and 90th percentiles too: the span the species is recorded in.</li>
    <li>The page draws both on a chart, the median as a line and the span as a band, and prints them in a table. It states how many cells and records they rest on. The chart's legend says the band is across habitat cells, not across years.</li>
    <li>The chart is drawn in the habitat's own months, and says so with the habitat's hemisphere. It shades the three months around the coldest month as the cold quarter, a mark for the eye and not a rule the sheet uses.</li>
    <li>The yearly rain's span is the 10th and 90th percentile of each cell's own yearly total. It is never a sum of monthly percentiles, which would be a year no cell has.</li>
    <li>Radiation is CHELSA's daily mean shortwave flux, taken to a daily total and converted to a daily light integral (DLI). PAR is taken as 45% of shortwave at 4.6 µmol per joule, so 1 MJ/m²/day is about 2.07 mol/m²/day, a unit a grower can compare with a window or a lamp.</li>
  </ul>
  <h3 id="few">From few records</h3>
  <ul class="rules">
    <li>Three agreeing records are enough for a narrow endemic.</li>
    <li>A habitat climate read from fewer than 12 records, or from fewer than 5 grid cells, is marked "from few records" on the page's figures and in its climate section, with the two counts written out, and shown as read.</li>
    <li>On the reference of 29 October 2026, 4,839 of the 37,727 pages with a climate were marked so, counted from every page's own sheet.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Extremes ─────────────────────────── -->
  <section aria-labelledby="extremes">
  <h2 id="extremes">The extremes at a typical spot</h2>
  <p class="sum">Cold nights and hot days need one daily weather series, so they are read at one place in the range: a typical spot. They are corrected for height. Where the series cannot stand for the habitat, they are set aside, and the page says why.</p>
  <ul class="rules">
    <li>The typical spot is the grid cell whose coldest month's mean nightly low is nearest the median of that figure across the range.</li>
    <li>Its NASA POWER cell (0.5° by 0.625°) must be mostly land, by the same elevation layer. A cell on a coast or an island is averaged with the sea, so up to eleven more candidates within 2 °C of the median are tried.</li>
    <li>When none is mostly land, the nearest stands, and the page says what fraction of its POWER cell is land.</li>
    <li>The position printed for that cell is the cell's centre, never a record's coordinate.</li>
    <li>The app reduces POWER's daily series for the cell: the record low, the 1st-percentile night, the 99th-percentile day, and frost nights as a count over the whole record, so one frost in forty years is printed as one night.</li>
    <li>A series is used only if it covers twenty years at 95% completeness.</li>
    <li>POWER's cell and the grid cell stand at different heights, so the series is corrected at 6.5 °C per 1,000 m of the difference, and the page says by how much. The grid cell's elevation is its land's alone (the sea floor ETOPO gives under water is left out of a coastal cell's mean, and a cell with no land has no elevation).</li>
    <li>When no height is on file for either cell, no correction is applied, and the page says so. The Temperature card says "0 m or none" for either; the extremes' line under Evidence used says which.</li>
  </ul>
  <h3 id="set-aside">When extremes are set aside</h3>
  <ul class="rules">
    <li>The extremes are set aside, and no cold floor is read from them, for one of three reasons. The page names the one that applies, in its own words, wherever it says they were not used.</li>
    <li>The ground is too far off: the weather cell stands more than 1,000 m above or below the typical spot, so its extremes are other terrain's.</li>
    <li>The record low is warmer than the coldest month's mean nightly low across the range. At any one spot a record low is colder than any month's mean night, so the weather cell's nights and the habitat's months disagree.</li>
    <li>The 1-in-100 night is warmer than that month's mean nightly low. Some four nights in a hundred usually fall below that mean, so this is a check that the weather cell's nights and the habitat's months disagree.</li><!-- decision 7; B2 -->
    <li>Neither of these two checks proves that either source is wrong. It says the two do not describe the same place well enough to put a cold floor beside the habitat's months. The figures set aside stay in the page's record of its sources.</li><!-- decision 7; B2 -->
  </ul>
  </section>

  <!-- ─────────────────────────── Seasons ─────────────────────────── -->
  <section aria-labelledby="year">
  <h2 id="year">What the rules read</h2>
  <p class="sum">Two fixed rules read the middle year for seasons: one from the rain, one from the temperature. Every sentence they make is labelled as a reading. None of it says when the plant grows.</p>
  <ul class="rules">
    <li>The rain rule: the wet season is the smallest set of months that carries 70% of the median year's rain.</li>
    <li>A wet season more than half a degree cooler than the year's mean is a winter growing season; more than half a degree warmer, a summer one; within that band, neither.</li>
    <li>A wet season it would call winter, with a month whose mean nightly low is below 0 °C, is read as no growing season: a rainy season with nights below freezing. Today reads no resting months from it.</li>
    <li>A summer wet season keeps its reading when a month at its edge dips below freezing.</li>
    <li>When 70% of the rain takes eight months or more, the rule reads no short rainy season. The rain is spread, which says nothing against a long one.</li>
    <li>A temperature curve that moves less than 4 °C between its warmest and coldest month is flat. Then the rule infers no growing season even from a sharp rainy season, and the page says the rain is sharp and nothing is inferred from it.</li>
    <li>Under 120 mm in the median year (its twelve monthly medians added) there is no rainy season to read. The temperature rule then names the cooler six months, if they are at least a degree cooler than the other six; a flat year names nothing.</li>
    <li>A season that falls in two runs of months is printed as two runs.</li>
  </ul>
  <h3 id="shift">Your months</h3>
  <ul class="rules">
    <li>Wherever habitat months are printed, the page names the hemisphere they belong to.</li>
    <li>Where the shift rule applies, it gives them shifted six months for a collection in the other hemisphere. The rule applies where the temperature curve moves 4 °C or more and the habitat lies 10° or more from the equator.</li>
    <li>So a Namaqualand plant whose rain falls in May to August has that season in a northern greenhouse from November to February.</li>
    <li>The label line and the sheet format a season through one function, so they cannot disagree.</li>
    <li>The season card at the top of a species page draws the same reading as twelve months in your calendar. The months the rule names are shaded, and months under 5 mm of rain are marked; nothing is shaded for a spread year or a year with nothing to read.</li>
    <li>Your hemisphere is your site's, else that of your first space with coordinates, else the northern, and the card says which.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Floor ─────────────────────────── -->
  <section aria-labelledby="floor">
  <h2 id="floor">The cold floor</h2>
  <p class="sum">The cold floor is the night only one in a hundred is colder than, at a typical spot in the range. It is a fact about a place, not a tested limit for a plant in a pot. Where it cannot be read, a monthly figure stands in, named as what it is.</p>
  <ul class="rules">
    <li>The floor is the 1st-percentile night at a typical spot in the range, from NASA POWER.</li>
    <li>When no extremes are on file, no floor is read. That is when none were read, the source refused or was not asked, the weather cell is mostly sea, or they were set aside (<a href="#set-aside">above</a>).</li>
    <li>The coldest month's mean nightly low in the median year, from CHELSA, is shown in its place, named so. A line says it is not a floor, since a month's mean of its lows is warmer than the nights a floor is read from. A label prints no habitat night then.</li>
    <li>Nothing stands in for a floor: the care groups carry no figure.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Archetypes ─────────────────────────── -->
  <section aria-labelledby="archetypes">
  <h2 id="archetypes">Care groups</h2>
  <p class="sum">The app keeps a small table of care groups, such as "cactus or succulent". A page takes its group only where Kew's own description of the species agrees. The table gives no figure and no advice.</p>
  <ul class="rules">
    <li>The groups: cactus or succulent; bulb, tuber or caudex; tropical foliage plant; orchid; epiphyte; fern or moss; carnivorous plant; temperate garden plant. They are resolved species, then genus, then family.</li>
    <li>Most of the table lists whole genera, and a genus can hold more than one kind of plant. So a page takes its listing only where Kew's own description of the species (its life form and climate, shown as "Kew's description") agrees.</li>
    <li>"Succulent" or "semisucculent" for a cactus or succulent. A geophyte, bulb, corm, tuber or caudex for a bulb, tuber or caudex. An epiphyte for an epiphyte; an epiphyte, lithophyte or climber for an orchid.</li>
    <li>A tropical climate ("wet tropical", "seasonally dry tropical" or "montane tropical", not "subtropical") for a tropical foliage plant. A temperate, subalpine or subarctic climate for a temperate garden plant.</li>
    <li>No life form names a fern or a carnivorous plant, so those two need only a life form on file.</li>
    <li>Where Kew gives no description, or one that does not agree, the page states no group. Groundsel would be "a cactus or succulent" by its genus, Senecio, and bitter melon "a bulb, tuber or caudex" by Momordica.</li>
    <li>The page says which group, from which listing, and what Kew says, as the table's listing and not as a claim about the plant.</li>
    <li>The table once gave four groups an indoor minimum with no source; those were removed.</li>
    <li>Terrestrial and frost-hardy genera are kept out of the tropical groups. The terrestrial bromeliads (Dyckia, Puya, Hechtia, Deuterocohnia, Encholirium, Fascicularia and their like) are in no group.</li>
    <li>Nor are the terrestrial or temperate orchids (Bletilla, Pleione, Disa, Habenaria, Cypripedium, Calanthe, Dactylorhiza, Ophrys, Paphiopedilum, Phragmipedium, Phaius, Ludisia, Cynorkis, Cymbidium and their like), the rock and ground bromeliads Alcantarea and Billbergia, or Selaginella.</li>
    <li>Brocchinia and Catopsis, bromeliad genera with few carnivorous species, are listed by those species alone.</li>
    <li>A family that splits between groups (Bromeliaceae, Orchidaceae, Araceae and the like) assigns no group by the family alone. Only a genus or species on the table does; where neither is, the app guesses nothing.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── The figures at the top ─────────────────────────── -->
  <section aria-labelledby="notes">
  <h2 id="notes">The figures at the top</h2>
  <p class="sum">The top of a species page states each habitat figure once, with its source beside it. The cards further down hold the full sentences and rules. A plant's own page puts the same figures beside the space it lives in, and gives no verdict.</p>
  <ul class="rules">
    <li>On a phone, "Habitat in short" sits above the photographs: the cold floor (or, when none is read, the coldest month's mean nightly low, named so), the rain a year, the open-sky light and the season, each with its source, and the few-records mark where it applies. The full cards stay below.</li>
    <li>The cold floor (1 night in 100), with the record low over the same years beside it, both at a typical spot, from NASA POWER. When no floor is read, the coldest month's mean nightly low, named so.</li>
    <li>The warmest month's mean daily high.</li>
    <li>The rain a year: the median of the range's grid cells' own yearly totals, and how many months of the median year bring 25 mm or more. Each cell's twelve months are added first, then the middle of those totals is taken, or the halfway point between the two middle totals when the cells are even in number.</li>
    <li>A page built before October 2026 has no such median, and shows the twelve monthly medians added, named so.</li>
    <li>The open-sky light: the DLI of the darkest and brightest months.</li>
    <li>The rain and the light each have a bar on a fixed scale, said under it and to a screen reader: full at 1,200 mm a year, and at 70 DLI for the brightest month. A year over 1,200 mm takes a bar to the next thousand, so a bar is never shorter than its figure.</li>
    <li>All but the cold floor and the record low are from CHELSA, and all of those but the rain a year from the median year across the range.</li>
    <li>The chart draws each month's median, and its description gives their total as that. The season rules read the same median year, since "70% of the median year's rain" must be a share of the months it adds up. So the rain rule's total can differ from the figure at the top.</li>
    <li>The sheet's Rain line and the season reading give the median year's total, named "in the median year". Where the page has the cells' median too, the Rain line gives both and says which is which.</li>
    <li>Where two or more months tie for a figure as printed, every one of them is named.</li>
    <li>Then the season card. The cards further down hold the full sentences and rules, each closed until opened; printing the page opens them all.</li>
    <li>A plant's printed label carries three of these in one line: the season, the cold floor ("floor 6.5 °C (1 in 100, NASA POWER)", only when the extremes are on file) and the open-sky light ("open sky 30–65 DLI (CHELSA)").</li>
    <li>Each is printed whole or not at all. On a label too small for all three, the last are left off, never cut mid-figure.</li>
    <li>A plant's own page shows, for each compared figure, the habitat median with its 10th–90th span beside the space's setting. It gives no verdict: the sky over a habitat and a climate percentile are facts about places, not tolerances of a plant in a pot.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Related ─────────────────────────── -->
  <section aria-labelledby="related">
  <h2 id="related">Similar habitat climate</h2>
  <p class="sum">Near the foot of a species page, Related lists up to six species whose habitat climate is nearest. It compares climates month by month, and nothing else. Two plants from alike climates can still want different things in a pot.</p>
  <ul class="rules">
    <li>The distance is one number: the root of the mean squared difference, month by month, in mean daily high and mean nightly low, plus the difference in rain on a log scale.</li>
    <li>The rain is taken as each month's rain plus 1 mm, so a month with none can be compared, and weighted so that a factor of 2.7 in that figure counts as three degrees: in a month of 100 mm against one of 270 mm, three degrees; in a month of 1 mm against one of 2.7 mm, under two.</li>
    <li>Months are compared in calendar order, so a habitat with the same seasons six months apart is far, not near. On a bench in one hemisphere, two such plants want opposite halves of the year.</li>
    <li>Range, family and photographs do not enter. The list is computed once when the index is built, from the same figures the pages show, and the page says which figures were compared.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Corpus ─────────────────────────── -->
  <section aria-labelledby="corpus">
  <h2 id="corpus">How the reference is stored</h2>
  <p class="sum">The reference is built on a PC and uploaded as files: one per species page, and small files the server reads instead of the whole index. Each file is named by a hash of its content. So no cache can mix two versions, and a refresh uploads only what changed.</p>
  <ul class="rules">
    <li>Beside the species files, the build works out once what the server would otherwise work out for every request: the index, each hash group's entries and figure sheets, the search's files, and the catalogue's rows for each grouping and chip.</li>
    <li>The rows under "Popular genera" are worked out by the server from the genus rows' files and the counts' file, once for each reference.</li>
    <li>It writes the files every other name is looked up in. Each page's address, with what a page needs of each species (its tile, its older names, its nearest climates), sits in small files split by a hash of the address. Each other name the reference answers to sits in files of its own.</li>
    <li>It writes the genera with their counts, the front page's photographed species, and the sitemap's addresses.</li>
    <li>A manifest names every current file by its hash, and the server reads it first. A manifest whose files are not all there is not adopted, nor one whose genera do not count its species.</li>
    <li>The reference's id is a hash of every file's hash, so the same build is the same id.</li>
    <li>A species page, the front page, a species' data file, the sitemap and the search read only the few small files they need. The server never reads or holds the whole index.</li>
    <li>The search's files hold, for each one-, two- or three-letter beginning of a word of a species' names, family and regions, every species with a word so begun, and only what the order reads of it. So a new photograph rewrites none of them.</li>
    <li>A beginning shared by more than 200 species has files one letter longer too. A beginning shared by more than 2,000 species has no file of its own, but the reference's own best hundred answers to that word alone, and how many species match it.</li>
    <li>A second set holds the beginnings with one letter taken out, for similar spellings. Another holds, for each genus of Kew's older names, the species holding one of them.</li>
    <li>A query reads the file of its least common word and those species' photograph counts (kept apart, 4,096 to a file), and puts them in order by the rules above, so its answer is the one the whole index would give. Only then does it read the matches' own entries, from files of 16 species each.</li>
    <li>A reference built before the search's files is searched through its index, read whole.</li>
    <li>The build reads each Commons photograph's title against every name the reference holds, and stores the verdict with the photograph. So the server shows a page's photographs without holding those names.</li>
    <li>A species page's id is Kew's: <code>k</code> and the plant_name_id of the taxon Kew accepts for the page, where that taxon is the page's alone. Otherwise it is <code>g</code> and the page's GBIF Backbone key.</li>
    <li>A page whose Kew rows do not decide which taxon it is keeps its GBIF key. So do two pages Kew accepts as one taxon (which is Kew's is not guessed; merging them decides it), and a page merged into another.</li>
    <li>The id is worked out again each time the reference is built. A page's address is its name, not its id, so neither an address nor a link moves when an id does.</li>
    <li>A plant you record keeps the GBIF key the name service or the picker gave it. The reference's files hold each page's GBIF key beside its id, so a plant, an older name and a GBIF key in an address all find their page.</li>
    <li>The sitemap dates each species page by the day its data last changed in what the page shows, so a refresh that changes nothing does not move it. A genus row takes the latest of its species' days.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Collection ─────────────────────────── -->
  <section aria-labelledby="collection">
  <h2 id="collection">Your collection</h2>
  <p class="sum">Everything you record stays in this browser, as a log of changes. Two copies of a collection merge by one rule, so a restore or a sync loses nothing. Sync encrypts on the device with a key only you hold.</p>
  <ul class="rules">
    <li>Your records live in your browser's storage as an append-only log of field-level changes, each stamped with a hybrid logical clock.</li>
    <li>What the app shows is a reading of the log from the start. It is kept as a snapshot between loads, so opening the app does not read every change again; <a href="/about/formats#snapshot">the formats page</a> says when the snapshot is dropped.</li>
    <li>Two devices merge by taking the union of their logs, and for each field the latest change wins. Backup restore and sync both use that one rule, which is why restoring an old backup over a newer collection loses nothing, and why a sync interrupted halfway simply resumes.</li>
    <li>Sync encrypts every sync bundle on the device with a key only you hold. The server stores ciphertext and cannot read a plant name.</li>
    <li>The server holds a token derived from the key, which cannot be turned back into the key. It is sent with every request, so it is visible wherever request headers are, the platform included.</li>
    <li>Whoever holds the token can read the ciphertext, write junk into the vault up to its limit, and take a photograph's name before your upload does. They cannot open anything.</li>
    <li>The key sits in this browser's storage in the clear, as the collection does, so anyone with this browser profile has both. There is no rotation and no revocation yet.</li>
    <li>"Stop syncing" forgets the key on this device and revokes nothing on the server. A key you believe exposed means a new vault.</li>
    <li>Sync also trusts the server's listing. A device cannot detect a bundle the server withholds, since bundles carry no chain. It can detect a bundle altered in transit (the seal fails) and a photograph swapped (its hash is in the record).</li>
    <li>The <a href="/about/formats">formats page</a> has the details.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Privacy ─────────────────────────── -->
  <section aria-labelledby="privacy">
  <h2 id="privacy">What the site knows about you</h2>
  <p class="sum">There are no accounts, no analytics and no tracking. Your plants stay in this browser unless you turn on sync, which encrypts them first. The list below is everything your pages send, and everything the server keeps.</p>
  <ul class="plain">
    <li>No accounts, no analytics, no tracking, no third-party scripts.</li>
    <li>Your collection is stored in this browser. It leaves only through sync, encrypted on the device, or a backup file you download.</li>
    <li>Your plant pages ask the server for the reference's figures by hash group (a few hundred species each), never by name.</li>
    <li>A plant page's "Is it an older name?" sends that plant's species name to the catalogue's search, as the search box does, only when you press it.</li>
    <li>The frost watch sends the coordinates of your site and of any space that has them, rounded to about a kilometre, with an altitude if one is set, and your units. This server asks the weather services.</li>
    <li>Frost shows on Today, and in a line under the top bar on every page when a frost is within the next 72 hours, or a night below the floor of one of your spaces. It is red only at or below freezing, and dated. No notification is sent, since that would mean the server keeping a push address and a location for each device.</li>
    <li>A search typed in the catalogue or on the compare page goes to the server. A search of your own plants stays on the device.</li>
    <li>The species picker sends the name you are typing to the server twice. Once as typed, to the catalogue's search, which the server answers from the reference's own files. Once as its species part alone (the genus as typed and the epithet in lower case) to the name service, which the server passes on to GBIF.</li>
    <li>The species part never holds a qualifier, a rank and what follows it, a cultivar, an author or a field number. When the species is not found and the name is a genus followed by capitalised words, the genus alone is asked too.</li>
    <li>The names in a list you import are checked by hash group, then by the catalogue's search, never by GBIF's name service.</li>
    <li>The about pages ask this site once for the reference's counts (<code>/api/counts</code>), which carries nothing of yours.</li>
    <li>Two small cookies: your units (<code>cultifolio.units</code>), and once a site is set, its hemisphere (<code>cultifolio.hemi</code>).</li>
    <li>The app's service worker keeps the app on the device for use without a signal. It is installed from the second page this device opens on the site, or at once on a page of your own collection, or as soon as the device holds a collection (<a href="#on-device">in full below</a>).</li>
    <li>A visit of one page of the reference installs nothing, and nothing is fetched for offline use.</li>
    <li>The server keeps short-lived rate counters by address, dropped within two days, and nothing about your plants.</li>
    <li>Public answers are kept for a while by Cloudflare's edge, linked to no address, and the server keeps its own copies under keys that name the app's version, so a new version is never answered from an old one's copies.</li>
    <li>The edge keeps no copy of an error or of a redirect to another page: an address the reference does not hold is answered "not found" anew each time. The server keeps GBIF's answer on whether it is an older name for a day, and your browser may keep the page for five minutes, not when GBIF could not be asked. An older name's redirect to its species is made anew each time too, your browser keeping it for a day.</li>
    <li>Species pages, the front page and the compare page load photographs from iNaturalist (two hosts), Wikimedia Commons and GBIF's image cache, which see your address. Your own pages do not, unless you switch that on.</li>
  </ul>

  <details class="full" id="on-device"><summary>Full detail: the app kept on the device</summary>
  <ul class="rules">
    <li>The service worker is installed from the second page this device opens on the site: a page loaded in full, a reload, or a move inside the app to another address.</li>
    <li>It is installed at once on a page of your own collection (My plants, My spaces, Propagation, Today, Sync, Labels or Backup, an import among them), or as soon as the device holds a collection: a plant added, a species followed, a backup restored, sync set up.</li>
    <li>The install fetches, once, the app's own files that the pages working offline use: the scripts, styles and typefaces of the collection's pages, the front page and the offline page, the species page's styles, the tab's icon and the web manifest. It fetches the collection's pages, the offline page and the front page too.</li>
    <li>The app's other files (a species page's scripts, the maps, the large icons and the share image other sites show beside a link) are kept the first time a page asks for them.</li>
    <li>So a species page opened online, by its address or by a link inside the app, is readable offline after, until the app next updates itself; an update starts these copies afresh.</li>
    <li>From then on, when a page loads, the worker asks this site whether a new version is out: one conditional request for <code>/service-worker.js</code>, once each time a page is loaded in full. Moving between pages inside the app does not repeat it.</li>
    <li>When a move between pages fails or ends on an error page, the framework asks once for <code>/_app/version.json</code>, to learn whether a new version is out, and when one is, the app asks once more for <code>/service-worker.js</code>, so the new version's worker is fetched.</li>
  </ul>
  </details>

  <details class="full"><summary>Full detail: what is sent</summary>
  <ul class="rules">
    <li>Species pages are served from a static reference. Your collection (names, numbers, notes, dates, spaces, photographs) is stored in this browser, and sent nowhere unless you turn on sync, encrypted then.</li>
    <li>What the pages about your own plants do send this site's server is this list and nothing else.</li>
    <li>When any page loads, the service worker's check for a new version: one conditional request for <code>/service-worker.js</code>, once each time a page is loaded in full. Moving between pages inside the app does not repeat it. The framework's own five-minute version poll is turned off.</li>
    <li>The worker is installed by the first of these pages a device opens, if a second page had not installed it already. Its install fetches the app's own files, the collection's pages, the offline page and the front page, nothing of yours.</li>
    <li>A page is reloaded under a new version only when an older version was serving it and the new one says it is another. The page asks the worker itself, inside the browser, so a first visit, a second copy of the same version and a worker that does not say are never reloaded under you.</li>
    <li>It is reloaded at once only in its first four seconds, with nothing typed, ticked or chosen on it and nothing being written to your collection.</li>
    <li>Otherwise it waits until your next move to another page has finished, the page it reaches reloading when nothing is typed on it and nothing is being written. A page that asks before you leave it still asks, once. So nothing you have typed is lost to it.</li>
    <li>The hash group of each species you grow, when a page needs the reference's figures. The catalogue is split into groups of at most 320 species, and of at least about 160 once it holds more than 5,120.</li>
    <li>The number of groups doubles as the catalogue grows, and <code>/api/corpus</code> announces it. So a species is narrowed to one of its group's species and no further; <a href="/about/formats#privacy">the formats page</a> gives the rule.</li>
    <li>The coordinates of your site and of any space with coordinates, when the frost watch asks for a forecast (<code>/api/forecast</code>). They go with the space's altitude if one is set, and your units, so the answer comes back in them.</li>
    <li>They are rounded on the device before they leave it: to a hundredth of a degree, about a kilometre, and to ten metres.</li>
    <li>Once a site is set, the watch asks from any page: when a page opens or is returned to, every five minutes while one is in view, and at once when the site is changed in Settings.</li>
    <li>An answer is kept half an hour on the device, in this tab's session storage, or five minutes when the National Weather Service refused or did not answer for its alerts. The same site is not asked again until its answer is that old.</li>
    <li>A refused request, or no answer within ten seconds, is not kept, and is said as a check that did not happen.</li>
    <li>The two cookies, sent over HTTPS only: your units and, once a site is set, one letter for its hemisphere. The hemisphere goes only with species and compare pages, so they render your months the right way up before any script runs.</li>
    <li>The name you are typing in the species picker, sent twice: as typed to <code>/api/search</code>, answered from the reference's own files, and its species part to <code>/api/names</code>, which the server passes to GBIF's name service. A cross is asked about by its genus alone, and only of the name service.</li>
    <li>The names in a list you import that the hash groups do not settle, each asked of the catalogue's search as the front page asks it, never of GBIF's name service.</li>
    <li>A plant's species name, when you press "Is it an older name?" on its page (shown only where the name has no species page): sent to <code>/api/search</code> as the catalogue's search sends it.</li>
    <li>The hash group of the species a scanned plant label names, when this device holds no plant of that label. So the page can show that species, as a plant page asks for its own; the species is never sent by name.</li>
    <li>The text you type into the catalogue's search on the front page, or the search on the compare page. The server answers it from the reference's files, and it is the same thing a species page you then open already shows.</li>
    <li>Not the text you type on "Your species", which is searched on the device. Nor anything shaped like a plant number, nor anything typed before your collection has opened.</li>
    <li>The position of the catalogue's rows you scroll or jump to by letter: a grouping and a row number, nothing of yours.</li>
    <li>A species address the reference does not answer to, which the server asks the backbone about once, in case it is an older name of a species that is here. Never an older name two species of the reference hold, which the page names without asking.</li>
    <li>A request for the reference's current version (<code>/api/corpus</code>), once per page, which carries nothing but the request.</li>
    <li>After a move between pages that fails or ends on an error page, the framework's one request for the app's version (nothing of yours), and, when it says a new version is out, one more conditional request for the service worker, as above.</li>
    <li>When you follow a link to a species page, that species, since you opened it.</li>
    <li>Links on these pages are not preloaded on hover, anywhere on the page, the top bar and the footer included, so a name goes only when you click.</li>
    <li>No page address is sent as a referrer with any request, so a plant's number or a search never rides along with one.</li>
    <li>Those pages ask no outside host for anything unless you switch the reference's photographs on for them, in Settings or where a photograph is withheld. Then the photograph is fetched from its image host, which sees that this address asked for that species' picture.</li>
    <li>One path does reach the server: the address of a plant's page (<code>/plants/2026-0001</code>). It is fetched when that page is loaded in full before the service worker is in place on this device, and again if the browser's offline cache is cleared. After that the page is served from the device. The server does not log paths.</li>
  </ul>
  </details>

  <details class="full"><summary>Full detail: other hosts</summary>
  <ul class="rules">
    <li>Your browser does talk to outside image hosts on species pages, the front page and the compare page. They are iNaturalist's image hosts (inaturalist-open-data.s3.amazonaws.com and static.inaturalist.org), Wikimedia Commons (upload.wikimedia.org) and GBIF's image cache (api.gbif.org). Each sees your address, like any image host.</li>
    <li>Commons is asked at its 120-, 250-, 500- and 960-pixel sizes, or at a file's own size when it is narrower. A photograph that reached GBIF from another dataset is shown from GBIF's cache, not from that dataset's own server.</li>
    <li>The species picker's species part goes to this site's <code>/api/names</code>, which asks api.gbif.org from the server. So that host sees the server's address, not yours.</li>
    <li>The frost watch asks MET Norway (api.met.no) and, in the US and its territories (Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands and American Samoa, and all of Alaska, the Aleutians, St Lawrence Island and the Pribilofs included), the National Weather Service (api.weather.gov), from the server, never from your browser.</li>
    <li>The National Weather Service's are the only weather alerts read, so a place it does not cover says its forecast is clear, never "All clear.".</li>
    <li>A name the reference does not answer to is asked of GBIF (api.gbif.org) from the server too.</li>
    <li>Those three are the only hosts the server asks. Your browser asks no host but this site and the four image hosts. "Use my location" asks the browser for its position; how the browser finds it is the browser's own.</li>
    <li>One host is Cloudflare's own, not this site's choice. Cloudflare, which serves the site, adds two headers of its network error logging to every answer (<code>Report-To</code> and <code>NEL</code>), while that setting of Cloudflare's is on for the site, as it is in October 2026.</li>
    <li>A browser that honours them (Chrome, Edge and other Chromium browsers) then reports to <code>a.nel.cloudflare.com</code>, from your address and for a week, any request to this site that fails, naming the address that failed. The site's code cannot remove these headers; the setting is the owner's to turn off.</li>
    <li>The site's three typefaces are among its own files. Until they arrive, a page is set in faces the device already has, each scaled to the same average width, so the text hardly moves when they land: Segoe UI, Georgia and Consolas on Windows; Helvetica Neue, Georgia and Menlo on Apple devices; Liberation and DejaVu on Linux.</li>
  </ul>
  </details>

  <details class="full"><summary>Full detail: what the server keeps</summary>
  <ul class="rules">
    <li>The one thing the server keeps about a visitor is short-lived rate counters keyed by address: an IPv4 address or an IPv6 /64.</li>
    <li>For vault creation, sync, searches, reference reads and the requests that call another service, the /48 around an IPv6 address is counted too. For the calls to other services, the index and sync, so is an IPv4 address's /24.</li>
    <li>Requests are counted per ten minutes in KV. Calls to other services are counted per minute in the counter object's memory, never stored; without the counter object, in KV for two minutes.</li>
    <li>Bytes stored per day and vaults created per day are counted in a small counter object. The networks that took the most of a day's new-vault places are recorded once half the day's places are taken, for the operator.</li>
    <li>For each vault that takes a place, the network it was counted to is kept beside the vault's id with the day's counts. So a place given back on its day goes back to that network.</li>
    <li>Every address key is dropped within two days of the day it was written. The request windows a running Worker holds in memory are dropped as later requests arrive, each within ten minutes of its last use. None holds a page, a name or a record.</li>
    <li>The server's faults (a counter that did not answer, a lease not released) are counted by kind alone, a number a day kept for a week, with no address, path or name; Cloudflare's own request logs (Workers Logs) are off.</li>
    <li>Cloudflare's edge keeps copies of public answers, linked to no address, each under its full web address, and the server keeps its own copies of searches, figure sheets, name lookups, forecasts and old-name checks under keys that name the app's version.</li>
    <li>The requests the app's pages make name the app's version in their address too, so a new version is never answered from an old one's copies.</li>
    <li>It keeps a forecast for a rounded site for an hour, or five minutes when the National Weather Service refused or did not answer for its alerts, keyed by the version and the rounded position and altitude.</li>
    <li>It keeps a catalogue search for a day, by the version, the reference, the number asked for and the query, its case kept. It keeps a name typed into the species picker for a day, by the version and the name in lower case, with GBIF's answer.</li>
    <li>It keeps a species address the backbone was asked about for a day, by the version and the name in lower case.</li>
    <li>It keeps a hash group's figure sheets for a day, by the version, the group and the reference, and its index entries and a window of the catalogue's rows for a day, keyed the same way. It keeps robots.txt and the maps' files (the coastlines and the regions' shapes) for a day.</li>
    <li>It keeps the sitemap's index for five minutes, and each of its files for a day under an address that names the reference's version. It keeps the whole species index and the reference's counts for five minutes.</li>
    <li>It keeps the app's own files, named by their contents, for a year. It keeps the front page and each species page as rendered for a minute, keyed by the build, the reference's version, the address, the queries the page reads, the units and (on a species page) the hemisphere letter.</li>
    <li>The edge keeps no error answer and no redirect to another page. A species address the reference does not hold is answered "not found", with what the old-name check found or with the species that hold it as an older name, anew each time, from the server's day-old copy of the old-name check. The redirect from an older name to its species' page is made anew each time too.</li>
    <li>Your browser keeps the "not found" for five minutes (<code>public, max-age=300</code>; not at all when GBIF could not be asked or a species' record could not be read), and the redirect for a day (<code>public, max-age=86400</code>), under the page's address alone. So for that long your browser can show the answer the version before gave.</li>
    <li>None of these holds an address, a plant or anything of a grower's own.</li>
    <li>With sync on, the server also keeps each vault's stored size, beside the vault and in the counter object, for the storage allowance. A note of each removed object is kept for two days, so its size is given back once.</li>
    <li>It keeps how many log batches and how many photographs it stored, and how many pages of its log were listed, in each of the last sixty-one minutes (a minute and a number), for the hourly limits. A listing under way is kept (a random id, when it was asked, its pages) until it ends or a minute passes.</li>
    <li>It keeps when each photograph's name was last claimed by an upload, for two days, so a removal asked for before a newer upload leaves that upload alone.</li>
    <li>It keeps the count of vaults that hold something, with each one's id (the random name your key derives, which the server holds anyway) and the day of its last upload. So a vault is counted once, and a place left unused for 90 days is given back. Without the counter object, KV keeps the same as <code>vaultplace:&lt;id&gt;</code>.</li>
    <li>It keeps a small pointer beside the vault for each photograph removed, stored again after a removal, or uploaded again while already there. After a removal, it holds the removal's receipt (its proof, its time and the generation it removes), so the removal stands and one cut off partway is finished when the device asks again.</li>
    <li>For a vault whose place was given back after 90 days, it keeps when that was, until an upload takes a place again. While a removal is deleting, it keeps a note of it in the counter object for up to ten minutes, so the vault's size is not put right from a listing made halfway.</li>
    <li>For each photograph a removal, or a storing after a removal, has touched, it keeps a mark (the photograph's id and when), until the midnight sweep finds nothing of it left unnamed or has failed to read it on seven nights.</li>
    <li>For a moment while its midnight sweep is cut short, it keeps the name of the last key it read (<code>s:&lt;prefix&gt;</code>), deleted once the sweep finishes.</li>
    <li>A write to a vault from a page on another site is refused. Every sync request carries the header <code>X-Cultifolio-Sync: 1</code>, which a page on another site cannot send. So this site's own sync writes from a browser that does not say which site a request came from (Safari before 16.4, which sends <code>Origin: null</code>) are still let through.</li>
    <li>A photograph you remove is removed from the server too. Once the removal is ten minutes old (past any Undo), a device asks the server to drop the sealed bytes, with a proof only a holder of the sync key can make. So the bearer token alone, which can add to a vault, can never destroy in it.</li>
    <li>If another device's upload of that photograph lands after the removal, the server keeps it for up to two days, and the device asks again later, at most hourly. The bytes go once that claim has lapsed, unless the photograph was brought back.</li>
    <li>A photograph brought back after the server removed its bytes is stored again only by a device with the sync key.</li>
  </ul>
  </details>

  <details class="full"><summary>Full detail: the calls this site makes for everyone</summary>
  <ul class="rules">
    <li>The server also caps how often it asks the weather services and GBIF: each of MET Norway, the National Weather Service and GBIF has a share of 600 calls a minute for every visitor together.</li>
    <li>One address (an IPv4 address or an IPv6 /64) may take a tenth of a share in a minute, and an IPv4 /24 or an IPv6 /48 four tenths. A US forecast takes from both MET Norway's share and the NWS's, both or neither.</li>
    <li>The last quarter of each share is kept, every minute, for networks that have not yet called that service in it. Once three quarters are used, a network that has made two calls that minute is held back, and one that has made fewer may make up to two.</li>
    <li>So ten addresses can no longer spend a share; it takes at least 77 different networks in one minute. That is the limit that remains, since a share is 600 calls by design.</li>
    <li>The reserve is felt sooner than that. Two networks at their parts use up the open three quarters, and until the minute ends every other network gets two calls to that service. A grower typing a name can see the name service held back from the third name the edge has not kept that minute.</li>
    <li>Past the cap a forecast or a name is not asked, and the page says the site held the call back, not that the service did not answer: "this site's calls are used up for this minute" when the share is spent.</li>
    <li>"The rest of this site's calls for this minute are kept for visitors on networks that have not called yet" when only the reserve is left and this network has had its two calls. "This address has used its part" or "this network has used its part" for an address or a network past its part.</li>
    <li>The species page's line about GBIF says only that this site held its call back for this minute, which covers all four.</li>
    <li>A network here is a block of addresses (an IPv4 /24 or an IPv6 /48), which a mobile carrier, a university or a shared building may give to many people at once. A grower on such a network can be held back for calls others on it made, and is told so.</li>
    <li>The same holds for uploads: the 12 GB a day an IPv6 /48 may store is shared by every household its provider numbers inside it.</li>
    <li>The reserve is kept by the server's counter object. If that does not answer, each server process counts the shares and the parts itself, sharing its counts through KV once a second, and keeps no reserve.</li>
  </ul>
  </details>

  <details class="full" id="keys-kept"><summary>Full detail: every key kept on the device</summary>
  <p>What the device keeps outside the collection, every key:</p>
  <p class="store">in the browser's local storage:</p>
  <ul class="rules">
    <li><code>cultifolio.frost.site</code>: your site's coordinates and name, as you set them. "Use my location" keeps three decimals; they are rounded further only when a forecast is asked for.</li>
    <li><code>cultifolio.prefs</code>: your settings. <code>cultifolio.theme</code>: light or dark.</li>
    <li><code>cultifolio.compare</code>: the species in your comparison; in the example collection, that tab's own copy.</li>
    <li><code>cultifolio.corpus</code>: the reference's version last seen. <code>cultifolio.labels</code>: the label sheet's choices.</li>
    <li><code>cultifolio.lastLocation</code> and <code>cultifolio.lastSowLocation</code>: the space last used on the Add and sowing forms. <code>cultifolio.countMode</code>: how a batch page last took its counts.</li>
    <li><code>cultifolio.visits</code>, <code>cultifolio.lastVisit</code> and <code>cultifolio.installSnoozedUntil</code>: when to offer installing the app.</li>
    <li><code>cultifolio.views</code>: 1 or 2, whether this device has opened a page of the site before, so the service worker is installed from the second.</li>
    <li><code>cultifolio.welcomed</code>: the front page's welcome dismissed. <code>cultifolio.hasMine</code>: that this device has species of its own, so the front page opens on them; never written from the example collection.</li>
    <li><code>cultifolio.sampleGen</code>: the example collection's generation, a random value written anew by every Leave and every deletion of the example. A tab that was in the example while another tab left it opens your own collection on its next load.</li>
    <li><code>cultifolio.persistAfterFirst</code>: that the browser's answer to whether it will keep this site's storage was said (once there was a plant to keep, whichever page asked).</li>
    <li><code>cultifolio.persistAskedAt</code>: when a page last asked the browser that question, written before it asks. Every ask, the one after your first plant included, waits a month from the last, and a page asks once at most.</li>
    <li>An answer not yet said when your first plant comes within that month is read from the browser's own record, which asks nothing, and only once there is something of yours to keep, never for a visitor or in the example collection. Safari and Chrome answer by themselves, Firefox asks you, and no page waits for your answer.</li>
    <li><code>cultifolio.clockOffsetMs</code> and <code>cultifolio.clockPending</code>: a correction to the device's clock, read from the sync server's <code>Date</code> header, and one waiting for its second reading. The formats page has the rule.</li>
  </ul>
  <p class="store">in this tab's session storage:</p>
  <ul class="rules">
    <li><code>cultifolio.forecast</code>: the frost watch's answers, for half an hour, or five minutes when the National Weather Service refused or did not answer for the alerts.</li>
    <li><code>cultifolio.demo</code>: the example collection is open in this tab.</li>
    <li><code>cultifolio.demo.</code> and a setting's name: that setting, for the example's tab only, such as <code>cultifolio.demo.units</code> or <code>cultifolio.demo.compare</code>.</li>
    <li><code>cultifolio.demo.own</code>: whether this device had a collection of its own when the example was opened, so the example's bar says the right thing. <code>cultifolio.demo.gen</code>: the example's generation when this tab opened it. Both go with the example's other copies.</li>
    <li><code>cultifolio.keepDraft</code>: what an add form inside the example held when Keep it as my own was pressed, read once by the same form in your own collection and taken off.</li>
    <li><code>cultifolio.labelsPicked</code>: the plants picked on the labels page, written when the page is hidden or left, forgotten when you move to another page of the app, and read back only when that page is reloaded or brought back through the browser's history.</li>
    <li><code>cultifolio.sampleLeft</code>: this tab has just left the example by Leave, so its next page deletes the example's database. An address alone never does.</li>
    <li><code>cultifolio.sampleLeaving</code>: a one-use token Leave writes and its address carries (<code>?left=</code>). Only when the two match does the first page after Leave mark the example for deletion; the token is taken off as it is read.</li>
    <li><code>cultifolio.sampleEntering</code>: a one-use token the button Show the example collection writes and its address carries (<code>?enter=</code>). Only when the two match does the page it opens set <code>cultifolio.demo</code>.</li>
    <li><code>cultifolio.sampleClosed</code>: this tab was sent home because the example closed in another tab, so its next page opens outside it and says so.</li>
    <li><code>cultifolio.freshKey</code>: a sync key just made, so a reload still shows it.</li>
    <li><code>cultifolio.offline-tried</code>: the address the offline page last tried to open from the device's own copy, and when, so it tries each address once a minute and never in a loop.</li>
    <li><code>cultifolio.backupNudgeHidden</code>: the line suggesting a backup put away for this tab. <code>cultifolio.iosFirstHidden</code>: the iPhone and iPad card about the Home Screen put away for this tab. <code>storage-notice-hidden</code>: the plants list's storage notice dismissed.</li>
    <li>Two the framework writes in every tab: <code>sveltekit:scroll</code>, how far each page of the tab's history was scrolled, so Back returns there; and <code>sveltekit:snapshot</code>, what a page keeps for Back and Forward.</li>
    <li>The front page keeps which catalogue row or species tile was at the top of the screen and how far down, with the grouping and chip it was under, so Back returns to it; nothing of yours.</li>
  </ul>
  <p class="store">in IndexedDB, the collection itself:</p>
  <ul class="rules">
    <li><code>cultifolio</code>, your collection, and <code>cultifolio-staging</code>, a copy while a backup is being restored.</li>
    <li><code>cultifolio-demo</code>, the example collection, is deleted by the first page after you leave it or, when another tab still has it open, as that tab lets it go, which the page says.</li>
    <li>One left by a tab closed without leaving is deleted by a later page when nothing in it is yours. Otherwise it is offered back on each page until you answer (open it, delete it, or not now), and deleted, answered or not, once nothing in it has changed for 30 days.</li>
    <li>A browser without Web Locks cannot tell an open example from a left one, so there one left by a tab closed without leaving is kept.</li>
  </ul>
  <p class="store">in the cache storage, once the service worker is installed:</p>
  <ul class="rules">
    <li><code>cultifolio-</code> and the build's version: the app's own files, and the species pages you have opened since, for offline use.</li>
    <li><code>cultifolio-corpus</code>, the hash groups' entries and sheets your pages asked for, kept by the reference's version, so a new build of the app does not fetch them again.</li>
  </ul>
  <p class="store">in the browser's own HTTP cache, as for any site:</p>
  <ul class="rules" id="http-cache">
    <li>This site's answers are kept under their addresses for as long as each answer says.</li>
    <li>A catalogue search, the name you typed into the species picker as typed and its species part, a hash group's entries and figure sheets, and a window of the catalogue's rows: for a day.</li>
    <li>A forecast for a rounded site: for an hour, or five minutes when the National Weather Service refused or did not answer for its alerts.</li>
    <li>A page as rendered: for a minute.</li>
    <li>With sync on, each sealed batch of your log and each sealed photograph this browser fetched from the vault (encrypted, as the server holds them): for a year, since a sealed object never changes under its name.</li>
    <li>All of them are cleared with the browser's own history and cache controls.</li>
  </ul>
  <p class="store">and, while a page is open, names the browser holds for coordination and nothing else:</p>
  <ul class="rules">
    <li>The channel <code>cultifolio-vault</code> (<code>cultifolio-demo-vault</code> in the example), on which a tab tells this browser's other tabs that it wrote to the collection, so they read it again.</li>
    <li>The lock <code>cultifolio-sync:</code> and the vault id, so two tabs never sync at once. The lock <code>cultifolio-import</code>, so two tabs never write an import at once. The lock <code>cultifolio-replace</code>, so one tab at a time replaces the collection from a backup.</li>
    <li>In the example collection, the locks <code>cultifolio-sample-open</code> and <code>cultifolio-sample-seed</code> and the channel <code>cultifolio-sample</code>; <a href="/about/formats#sample">the formats page</a> says what they do.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Glossary ─────────────────────────── -->
  <section aria-labelledby="glossary">
  <h2 id="glossary">Words the app uses</h2>
  <p class="sum">The app uses a few words in a set sense. Each is defined here once. Where a page uses one, it means this.</p>
  <dl class="gloss">
    <dt>Plant</dt><dd>One plant (or one pot of a clump) under its own permanent number, the plant number. The number is never reused, even after the plant is gone.</dd>
    <dt>Batch</dt><dd>A sowing or a tray of cuttings, numbered like a plant, from which plants are potted up.</dd>
    <dt>Space</dt><dd>A room, bench, shelf or tray, nested, with the conditions a plant inherits from it.</dd>
    <dt>Vault</dt><dd>The encrypted copy of your collection on this site's server, which sync keeps. It holds sealed bundles of changes and photographs the server cannot read.</dd>
    <dt>Sync key</dt><dd>The thirty symbols that encrypt the vault and let a second device join it. There is no account behind it and no recovery.</dd>
    <dt>Sync bundle</dt><dd>A sealed bundle of changes one device sends, as the sync page names it; the formats page calls it a log batch. Also the unit a device keeps whole when it cannot read one.</dd>
    <dt>Reading the log</dt><dd>Applying every change in the log in order to get the collection you see; the formats page calls it folding. A change is folded when it is applied.</dd>
    <dt>Could not be read here</dt><dd>A sync bundle this version of the app could not read, usually from a newer version, kept whole on the sync page for a later version. Nothing in it is lost.</dd>
    <dt>Waiting</dt><dd>A record on this device that lacks a field this version requires (a name, a status), usually because its bundle could not be read here. It is kept, not shown, and completes when the field arrives.</dd>
    <dt>Not checked</dt><dd>A source that did not answer when a page was built: it refused or failed. Not the same as a source that answered "none".</dd>
    <dt>Not asked</dt><dd>A source the build skipped, or a call this site held back because its calls were used up for the minute. Not "none" either.</dd>
    <dt>Pending</dt><dd>The habitat climate has not been derived yet; not a refusal.</dd>
    <dt>Held</dt><dd>A change dated more than five minutes ahead of this device's clock, kept out of the collection until the clock reaches it.</dd>
    <dt>Parked</dt><dd>A change from a clock that was badly wrong (stamped more than two days past the arrival of its bundle), kept in the log but counted only if you apply it, on every device alike.</dd>
    <dt>Not reached</dt><dd>This site could not be reached from the device just now. Not the same as "not in the reference".</dd>
    <dt>Species page</dt><dd>The reference's page for one species, built ahead of time from the sources above.</dd>
    <dt>Older name</dt><dd>A name the species was once published under, or that a source still files it under: a synonym.</dd>
    <dt>Record</dt><dd>One sighting or specimen of a plant with a place, from GBIF. An open record is under CC0 or CC BY; a restricted one (CC BY-NC) is used but never published.</dd>
    <dt>Cell</dt><dd>One square of the climate grid, 0.05° (about 5 km) on a side.</dd>
    <dt>Box</dt><dd>A region's bounding rectangle, used to test records where the region has no shape.</dd>
    <dt>Default point</dt><dd>A coordinate a dataset gives records it has no place for, such as a country's middle. <a href="#default-points">Records there</a> are left out.</dd>
    <dt>Across the range</dt><dd>Across every cell of the climate grid that holds the species' wild records inside its range. A figure across the range is the median of those cells, with the 10th to 90th percentile span.</dd>
    <dt>A typical spot in the range</dt><dd>The one cell whose coldest month's mean nightly low is nearest the median across the range. The daily extremes, which need one weather series, are read there.</dd>
    <dt>Day and night</dt><dd>On the chart and in the table, CHELSA's monthly means of the daily maximum and the daily minimum. A month's "mean daily high" and "mean nightly low" are these, not its mean temperature.</dd>
    <dt>Cold floor</dt><dd>The 1st-percentile night at a typical spot in the range, from NASA POWER, so one night in a hundred is colder. <a href="#floor">The cold floor</a> above says how it is read, and what stands in when none is.</dd>
    <dt>Habitat months</dt><dd>Months as they fall where the species grows wild, in its hemisphere. The chart is drawn in them, and the season card turns them into yours.</dd>
    <dt>DLI</dt><dd>Daily light integral: the light a day delivers, in moles of photosynthetically active photons per square metre. The habitat's is the open sky's, converted at 2.07 mol of PAR per MJ, and says nothing of the shade a plant grows in.</dd>
    <dt>Hash group</dt><dd>One of the groups of a few hundred species your pages ask the reference for, by a hash of the species' address, so the server never learns which species you grow.</dd>
  </dl>
  </section>

  <section aria-labelledby="source">
  <h2 id="source">The source</h2>
  <p class="sum">Cultifolio is open source: the app under AGPL-3.0, the reference's tooling under MIT. Everything on this page can be checked, run and rebuilt from <a href="https://github.com/zomethingje-eng/cultifolio">github.com/zomethingje-eng/cultifolio</a>, including the scripts that build the reference. Problems and corrections are welcome there.</p>
  </section>
</article>

<style>
  .prose { max-width: 720px; font-size: var(--fs-base); line-height: 1.6; color: var(--ink); font-family: var(--ui); }
  .prose h2 { font-family: var(--serif); font-size: var(--fs-2xl); margin: 32px 0 8px; }
  .prose h3 { font-family: var(--ui); font-size: var(--fs-lg); margin: 20px 0 6px; }
  .prose p { margin: 0 0 12px; }
  .topseg { margin: 14px 0 6px; }
  .brief { background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 4px 18px 14px; margin: 0 0 18px; }
  .brief ul, .plain { padding-left: 1.1rem; }
  .brief li, .plain li { margin: 4px 0; }
  .counts { margin: 8px 0 10px; }
  .toc { font-size: var(--fs-md); line-height: 2; }
  /* The section's plain summary: what a grower reads first, before the rules (round eighty-four; the reviews' S5, A19). */
  .sum { font-size: var(--fs-lg); line-height: 1.55; margin: 0 0 12px; }
  .rules { padding-left: 1.1rem; margin: 0 0 12px; }
  .rules li { margin: 6px 0; }
  .more, .full { margin: 4px 0 14px; }
  .more > summary, .full > summary { cursor: pointer; font-weight: 600; min-height: var(--tap); display: flex; align-items: center; } /* 44 px under a finger */
  .store { margin: 10px 0 4px; font-weight: 600; }
  .gloss dt { font-weight: 700; margin-top: 10px; }
  .gloss dd { margin: 2px 0 0 0; }
  .tablewrap { overflow-x: auto; margin: 0 0 12px; }
  .src { border-collapse: collapse; width: 100%; font-size: var(--fs-md); }
  .src th, .src td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  .src thead th { font-weight: 700; }
  .src tbody th { font-weight: 600; }
  @media (max-width: 520px) {
    /* A phone reads the table as cards: each source a block, its three cells stacked (no sideways scroll at 320 px). */
    .src thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .src, .src tbody, .src tr, .src th, .src td { display: block; width: auto; }
    .src tr { border-bottom: 1px solid var(--line); padding: 6px 0; }
    .src th, .src td { border: 0; padding: 2px 0; }
  }
  /* An anchor, /privacy among them, lands under the top bar rather than beneath it. */
  .prose [id] { scroll-margin-top: calc(44px + 16px); }
  /* The repository's address breaks rather than pushing the page sideways at 320 px and 200% text. */
  .prose a, .prose code { overflow-wrap: anywhere; }
</style>

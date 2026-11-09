<script lang="ts">
  import { onMount } from 'svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import AboutNav from '../AboutNav.svelte';
  import { COUNTS_ON, liveCounts, countText, type Counts } from '$lib/ui/about-counts';
  import { revealHash, printOpens } from '$lib/ui/about-fold';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about' }, { label: 'How it is made' }]);
    return () => setCrumb([]);
  });
  // The counts of the reference the site serves now, read once the page runs; until then, and offline, those of a named day.
  let live = $state<Counts | null>(null);
  onMount(() => {
    void liveCounts().then((c) => (live = c));
    // A link to a rule inside a folded list (#regions, #set-aside) opens the lists around it; print opens every one, and
    // closes again those the reader had closed (round eighty-five: every list of rules is folded under its summary).
    const a = revealHash(), b = printOpens();
    return () => { a(); b(); };
  });
  const shown = $derived(live ?? COUNTS_ON);
  const held = $derived(live ? 'now holds' : `held, on ${COUNTS_ON.on},`);
</script>

<svelte:head>
  <title>How it is made · Cultifolio</title>
  <meta name="description" content="Where every figure on a species page comes from, how the habitat climate and the map marker are worked out, and what the site asks, keeps and sends." />
</svelte:head>

<PageHead title="How it is made" kick="About" places={false} sub="Every figure on a species page has a source and a method; this page is the method. A number that cannot be derived is left out and said to be missing, never filled in." />

<!-- The about pages' one row of links (round eighty-seven): the owner's page, the method, the formats, the data, the changes. -->
<AboutNav at="how" />

<article class="prose">
  <section class="brief" aria-labelledby="brief-h">
    <h2 id="brief-h">In brief</h2>
    <ul>
      <li>Each species page is built ahead of time from public data (GBIF, Kew's WCVP, CHELSA, ETOPO, NASA POWER, Natural Earth, iNaturalist, Wikimedia Commons, Wikidata, Wikipedia, Kew's extinction risk predictions, CITES Appendices, ChromoDB, WFO Plant List, Biodiversity Heritage Library), and every figure names its source.</li>
      <li>Nothing about a species is written for its page by a person or by AI, apart from credited quotations (<a href="#written">who wrote the templates</a>).</li>
      <li>A source that did not answer is said as "not checked", and one the build or this site did not ask as "not asked", each with why; never as "none".</li>
      <li>Your own plants are kept in this browser. They leave it only through sync, encrypted with a key only you hold, or a backup you download. A name you type or import may be looked up in the catalogue, as <a href="#privacy">the privacy section</a> says.</li>
      <li>No accounts, no analytics, no third-party scripts; the code is open.</li>
      <li>A page shows what its sources said on the day it was built; its record of its sources gives that day.</li>
      <li>Each section below opens with what a grower needs. The rules behind it are one tap away, under "The rules in full".</li>
    </ul>
    <p class="counts" id="counts">The reference {held} <b>{countText(shown.species)}</b> species pages in <b>{countText(shown.genera)}</b> genera, and <b>{countText(shown.withClimate)}</b> of those pages have a habitat climate.</p>
    <nav class="toc" aria-label="On this page">
      <a href="#sources">Sources</a> · <a href="#list">Which species</a> · <a href="#search">Search</a> · <a href="#written">Who writes</a> · <a href="#refusal">Refusals</a> · <a href="#records">Records</a> · <a href="#marker">Map marker</a> · <a href="#climate">Climate</a> · <a href="#extremes">Extremes</a> · <a href="#year">Seasons</a> · <a href="#floor">Cold floor</a> · <a href="#archetypes">Care groups</a> · <a href="#notes">The figures at the top</a> · <a href="#at-home">At home</a> · <a href="#related">Similar climate</a> · <a href="#corpus">How it is stored</a> · <a href="#collection">Your collection</a> · <a href="#browse-own">Browse, with your collection</a> · <a href="#privacy">Privacy</a> · <a href="#glossary">Glossary</a> · <a href="#source">Source code</a>
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
      <tr><th scope="row">GBIF occurrence records</th><td>Wild records for the map, the marker and the habitat climate; and records of cultivated plants, counted once to make the species list.</td><td>Per record: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>; CC BY-NC records are used but never published.</td></tr>
      <tr><th scope="row">World Checklist of Vascular Plants (WCVP), RBG Kew</th><td>The accepted name and author, the native range, Kew's one-line description, Kew's own words for the range, quoted, where the name was published, and a hybrid's parents.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
      <tr><th scope="row">CHELSA V2.1</th><td>Monthly climate normals, 1981–2010.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
      <tr><th scope="row">ETOPO 2022 (NOAA)</th><td>Elevation, and which grid cells are land.</td><td>Public domain</td></tr>
      <tr><th scope="row">NASA POWER</th><td>Daily temperatures, for the extremes and the cold floor.</td><td>Public domain</td></tr>
      <tr><th scope="row">Natural Earth</th><td>Coastlines for the maps, the states and provinces the regions' shapes are made from, and the minor islands too small to draw.</td><td>Public domain</td></tr>
      <tr><th scope="row">iNaturalist</th><td>Photographs, the taxon a page links, the counts of plants observed in cultivation that the species list and "Popular genera" were made from, and the counts of wild plants observed in flower, by month.</td><td>Per photograph: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA</a></td></tr>
      <tr><th scope="row">Wikimedia Commons</th><td>Photographs where the others have too few.</td><td>Per file: <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, public domain, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA</a></td></tr>
      <tr><th scope="row">Wikidata</th><td>Identifiers in other databases, linked under "Elsewhere", the Wikipedia article's title, the list of botanic gardens, and English names for a page with no GBIF key.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
      <tr><th scope="row">Wikipedia</th><td>The quoted summary.</td><td><a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></td></tr>
      <tr><th scope="row">Kew's extinction risk predictions (Bachman et al. 2024)</th><td>A model's probability that the species is threatened, with its 95% interval and the model's confidence: a prediction, not an assessment.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
      <tr><th scope="row">CITES Appendices</th><td>Whether the plant is listed in Appendix I, II or III, and by which listing, read from the Appendices themselves.</td><td>The Convention's text, transcribed by hand and linked; nothing of Species+ is used</td></tr>
      <tr><th scope="row">ChromoDB (IAPT/IOPB chromosome data)</th><td>Chromosome counts as published, each with its reference.</td><td><a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></td></tr>
      <tr><th scope="row">WFO Plant List</th><td>Whether World Flora Online accepts the page's name, holds it as a synonym, or does not hold it.</td><td><a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></td></tr>
      <tr><th scope="row">Biodiversity Heritage Library</th><td>A link to the page where a name was published, where its resolver gives one page for exactly Kew's citation.</td><td>A link only: nothing of BHL's is copied</td></tr>
      <tr><th scope="row">National checklists, through GBIF</th><td>A country-level range, only for a name Kew's checklist has no entry for, said as that.</td><td>Per checklist, as GBIF publishes it</td></tr>
    </tbody>
  </table>
  </div>
  <p>Each licence above links its text. <a href="#notice">The full list of sources</a> is the source code's NOTICE. The frost watch's forecasts come from MET Norway (CC BY 4.0) and, in the US, the National Weather Service (public domain); they are asked for your site when you use the watch, and are no part of the reference.</p>

  <h3 id="names">The name</h3>
  <p class="sum">A page is headed by the name Kew's World Checklist accepts for it, with Kew's author and Kew's family. GBIF's name for the same plant, where it differs, is listed under Names &amp; registers as GBIF's name, and a plant you recorded under it still finds the page. A name is matched to a source only where the match is certain.</p>
  <!-- Each fold is named by its section for a screen reader, which lists them by name: thirty-four folds all called "The rules in full" said one name over and over (round eighty-six; review W's W15). -->
  <details class="full in-full"><summary>The rules in full<span class="sr">: the name</span></summary>
  <ul class="rules">
    <li>A page whose id begins <code>k</code> is headed by Kew's accepted name for that entry, with Kew's author, whole. A name below species carries its rank word (subsp., var., f.), on every page.</li>
    <li>GBIF's name for the page's key, where it is other words, is one of the page's older names, so its old address moves to the page, as any older name's does, and the search finds it.</li>
    <li>The family shown is Kew's, from the same entry.</li>
    <li>Kew is the authority for names everywhere. A name of a page's record that Kew's file places only in another plant is taken off the page's older names, its search names and its addresses.</li>
    <li>That test reads the names as the record writes them. A name of GBIF's below the species keeps its rank word, whatever the word ("proles", "subvar.", "nothosubsp."), so it is never cut to its first two words and so to another species' name: GBIF's "Paeonia corallina proles ovatifolia" is not taken for Paeonia corallina, which Kew files under Paeonia mascula.</li>
    <li>A page reached by another name says whose verdict joins the two names. GBIF's backbone accepts Agave amica, and Kew's World Checklist holds it as a synonym of Polianthes tuberosa, which heads the page: the page says so, never that GBIF accepts the heading.</li>
    <li>A plant you recorded under the old heading keeps its name and its GBIF key. The reference files the page's figures under the old heading too, for a plant of the page's own GBIF key only. The plant's page then shows that page, says the plant is filed under GBIF's name for its key, and offers to file it under the page's name.</li>
    <li>The old name leads to the page too, as one of its older names, except where Kew's file holds that name for another plant.</li>
    <li>A plant filed under a name that has no page of its own offers "Is it an older name?". Pressed, it looks among the older names. Where the name is an older name of a page, the plant's page says so, links that page, and offers to file it there, the old name kept as received.</li>
    <li>Where a page holds a variety, subspecies or form of the name as an older name, and no page holds the name itself, that is said, with the name the page holds.</li>
    <li>The add form says a name is an older name of a page only when no page is headed by it and that page holds it as an older name, or the name's own page was merged into it. The same spelling by another author names another plant, so it is never called an older name.</li>
    <li>A name GBIF's name service gives the very key a page reads GBIF's records under is GBIF's name for that page, and the add form, the search, an imported plant's row and the plant's page all say so ("GBIF's name for Hoodia alstonii"), not that it is an older name.</li>
    <li>The add form and an import record with the plant which of the two they found the name to be. The plant's page asks the reference again when it opens, and says what the record holds only where the reference is not reached. With neither, it says only that the reference files the name under that page.</li>
    <li>When the field is left, or Return is pressed in it, the form first finishes asking whether the reference holds the name. Only when it does not, or holds it as an older name or GBIF's name of a page, does the button read "Add as typed", and then one press files the plant as typed. A press while the question is still out waits for its answer.</li>
    <li>A name you keep as typed after the add form or an import named its page carries that page. The plant's page shows that species at once, found by its hash group.</li>
    <li>A page without a Kew entry of its own, a <code>g</code> page, is headed by GBIF's name. There were {countText(COUNTS_ON.gPages)} such pages on {COUNTS_ON.on}.</li>
    <li>A species is headed by its species entry. A subspecies or variety never lists its own species' accepted name as an older name, and an autonym, such as Stapelia hirsuta var. hirsuta, has no author of its own, as the Code of nomenclature says.</li>
    <li>The name is cited as Kew's World Checklist cites the entry whose number the page links. GBIF cites Ixora coccinea "Comm. ex Lam."; the page links and cites Kew's Ixora coccinea L., and says so under the name.</li>
    <li>Where GBIF's key is a usage with no synonyms and GBIF holds the name by Kew's author under another key, that usage's synonyms and common names are read too. GBIF's "Rubus parviflorus Kük." is not the thimbleberry, Rubus parviflorus Nutt.; the page says so under the name.</li>
    <li>A name the backbone holds as a synonym is followed to the species it accepts, and an accepted subspecies or variety one step further, to its species. The page says which name was asked for.</li>
    <li>A name other species of the reference hold too is said as that, never as a name the backbone accepts as this species.</li>
    <li>An older name of a species that is another species' accepted name here is shown with its author, as an older name of this species and not that species ("Annona muricata Vell." on Annona montana).</li>
    <li id="wfo">Under Names and registers, one line says how the WFO Plant List (World Flora Online's release of June 2026, CC0) reads the page's name: accepted, a synonym of another name it names, held but not yet placed, or not held. WFO's row is found by the name's IPNI identifier. Where WFO holds the same name and authors under another identifier, or none, that row is taken and the line gives both identifiers. Of several rows, the one carrying Kew's own number for the name, or spelt as the page with its authors, is taken. A name WFO holds only under other authors is not decided, and the line says so. The line is WFO's reading, beside Kew's, and changes nothing on the page.</li>
  </ul>
  </details>

  <h3 id="common">English names</h3>
  <p class="sum">The English name shown is one GBIF's sources give, picked by a fixed rule, never by hand. It is not always the name growers use most. Every name GBIF's sources mark as English is searched, whether shown or not. A name with no language marked is never shown; only NCBI's are searched, so "peyote" finds Lophophora williamsii.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: English names</span></summary>
  <ul class="rules">
    <li>The common name is one of the English names GBIF reports: the rows GBIF's sources mark as English. A row with no language marked is never shown. A page with no GBIF key takes Wikidata's (<a href="#no-gbif-key">below</a>).</li>
    <li>The rows NCBI's taxonomy gives with no language marked are searched, never shown. Of 121 such names on 788 pages read, 114 were English ("peyote", "dragon fruit") and 7 were not ("babosa"), so they find a plant and never name it. Other sources' rows with no language marked are not read: Catalogue of Life's are in many languages ("Hingstkastanje", "Cekuh").</li>
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
    <li>GBIF's preferred flag and the count of sources exist only for species whose English names GBIF was asked for again, name by name. For the rest, each source a listed spelling names counts once, and a spelling that names none counts as one.</li>
    <li>A common name that is a scientific name the reference or Kew's World Checklist holds ("Babiana odorata" for Babiana villosula) is not shown, and the record says so.</li>
    <li>Nor is the species' own scientific name, or one of its older names, or one of them spelt one letter otherwise, written as an English one ("Calathea musaica" for Goeppertia kegeljanii). The page is found by those names as older names.</li>
    <li>The species page and the catalogue use the same rule. The page shows the first four names under the name, separated by semicolons.</li>
  </ul>
  </details>

  <h3 id="range">The native range</h3>
  <p class="sum">The native range is Kew's, from its World Checklist, in Kew's own regions. Wild records are tested against it, so a garden escape abroad does not set the climate. Where Kew's entry is not certainly the page's plant, no range is taken.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the native range</span></summary>
  <ul class="rules">
    <li>The range is read from Kew's files of the day the page states: the "Extracted" day of Kew's README, 4 June 2026 for this reference. The record of the page's sources says "as of" that day, not the day the page was built.</li>
    <li><span id="regions">A range is in Kew's units, the level-3 regions of the World Geographical Scheme for Recording Plant Distributions (TDWG), under the scheme's own names, some of them historical (Yugoslavia, Czechoslovakia, Lebanon-Syria). A species page names them as Kew does and says so beside the range.</span></li>
    <li>Regions where Kew records the plant as extinct, or as doubtfully present, are shown labelled so, and records are never tested against them.</li>
    <li>Where Kew gives only a broad region, the region is named and records are not tested against it.</li>
    <li>A page of the species list reads the range of its own Kew entry wherever GBIF's name leads to another entry or to none (GBIF's Chamaenerion angustifolium is Kew's Epilobium angustifolium), and says whose range it is.</li>
    <li>Where Kew has no entry, the range is the countries that national checklists report through GBIF, said as that. Those checklists state presence, not native status, so no record is tested against them.</li>
    <li>Kew's own one-line description of a species, its life form and climate class, is quoted and credited to WCVP, RBG Kew. Nothing is derived from it.</li>
    <li id="cultigen">A plant Kew lists only as a cultigen, its area given as "as a cultigen from Peru" (the tomato) or "as a cultigen from Greece" (saffron), has no wild range: its region is the one the crop comes from. The page names that region "(as a cultigen)" wherever it names it, quotes Kew's words, and reads no habitat climate from the plant's records, which are of gardens and fields.</li>
    <li>Kew's own names for each page's plant (its accepted entry, the names Kew files under it, and older names Kew accepts as species of their own) are read from Kew's files. The page lists the last apart from its other older names.</li>
  </ul>
  </details>
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
    <li>A name Kew holds no entry for is looked up under the species' older names. A name Kew holds with no native range is Kew's answer, and is not looked up further.</li>
    <li>An older name counts only where its author is the author of Kew's entry for it. A synonym GBIF marks pro parte is not used.</li>
    <li>A range found so is taken only when the older names lead to exactly one accepted Kew entry, at species rank. The page names that entry and the older name that reached it ("Kew's entry Erythrina afra Thunb., reached by Chirocalyx pubescens Walp.").</li>
    <li>Older names that lead to more than one entry are said as not taken, and so is one older name Kew holds twice by one author under two entries.</li>
    <li>So is a page whose own basionym, the older name of its epithet by the author its name brackets, is a record Kew holds apart from the entry the older names reach. The plant is then two of Kew's records, and no range is taken from either (Monsonia lheritieri).</li>
    <li>GBIF's synonyms are read to the end of the list. A list cut short, refused or failed is no answer for these older names, and the page says they were not asked.</li>
  </ul>
  </details>

  <h3 id="hybrids">Hybrids</h3>
  <p class="sum">A named hybrid such as Mentha × piperita is a page like any species, written with the sign as Kew writes it. It has a habitat climate when its wild records allow one. A cross you record with no page of its own has no habitat.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: hybrids</span></summary>
  <ul class="rules">
    <li>A hybrid's heading, title, tile and name in the search take Kew's name for its entry, with the sign, from <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/src/lib/core/hybrids.json">the list of hybrids</a>, made from the species list and Kew's file (486 hybrids, from Kew's file of 2026-06-04).</li>
    <li>The page says the parents Kew's file states for the hybrid's entry (its hybrid formula), and links each to its page here where Kew's ids lead to one.</li>
    <li>A parent is read by Kew's exact words, the genus written out only where Kew writes the hybrid's own genus by its initial ("A. glutinosa" under Alnus). Its words must name a row of Kew's file, and its page is the entry Kew accepts for that row.</li>
    <li>Where the words name other authors' names as well as the one Kew accepts, the accepted one is the parent, and the page says how many others there are. Words that name no row, or rows of more than one plant, are listed with why and linked nowhere.</li>
    <li>Each parent's habitat figures are shown beside the other's, each with its source, read from that parent's own page when the page is served: the coldest month's mean low, the warmest month's mean high and the year's rain (CHELSA), and the record low (NASA POWER). They are never combined into one climate for the hybrid.</li>
    <li>Names are compared without the sign, so GBIF's Lantana strigocamara is Kew's Lantana × strigocamara.</li>
    <li>Its address is the name without the sign. An address written with an "x" for it (<code>mentha-x-piperita</code>) moves there.</li>
    <li>A hybrid's POWO and IPNI links are its Kew entry's numbers wherever its record lacks either, and the page says so. Kew's copy at GBIF writes a hybrid's row with the sign, so the name without it never found that row.</li>
    <li>A cross you record from two parents, with no page of its own, has no habitat of its own, and its plant page says so. Where its parents have pages, it links them.</li>
  </ul>
  </details>

  <h3 id="keys">GBIF keys, and pages that are one plant</h3>
  <p class="sum">GBIF sometimes files one plant's records under two names. A page reads the other name's records too, but only where Kew holds that name as the same plant. Two pages that are one plant are merged into one.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: GBIF keys, and pages that are one plant</span></summary>
  <ul class="rules">
    <li>Records come from GBIF under the page's own key, as GBIF held them on the day it made the download, which the page states.</li>
    <li>Where GBIF files the same plant under another key too, that key's records and photographs are read as well: from GBIF's download where it holds them, and from GBIF's search otherwise, sampled as the page's own (<a href="#sample">below</a>). The page names each key and how its records were read.</li>
    <li>A key is read only when Kew's file holds its name and author as the page's own name or a name of the same type: the same name by the same author, a spelling variant, a synonym Kew marks homotypic, or an autonym of one.</li>
    <li>It must not be a key GBIF already files under the page's key, another page's key, a key GBIF files under another page, or a pro parte synonym.</li>
    <li>Except a variety or subspecies GBIF files under another page's species where Kew's file holds it, same type, under a species of its own that has a page here and no GBIF key. That page reads it, with the keys GBIF files under it, and the other page leaves those records and their photographs out and says so. Echinopsis pachanoi, San Pedro, reads GBIF's Trichocereus macrogonus var. pachanoi, and Echinopsis macrogona no longer counts it; Eucalyptus tasmaniensis reads GBIF's subspecies of Eucalyptus delegatensis. The keys are in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/extra-keys-infra.txt">the list of keys read from another page's species</a>.</li>
    <li>A heterotypic synonym's key is not read, unless the page it names was merged into this one.</li>
    <li>Within a key that is read, a record GBIF identifies as a name Kew holds as another plant, or as another type, is left out.</li>
    <li>A page that loses a key at a rebuild loses the records it read under that key too: a build carries the records of the build before only to a page whose GBIF key is the one they were read under.</li>
    <li>Pages that are one plant are one page under the name Kew accepts. These are two pages whose names Kew holds as synonyms of one type (Coryphantha macromeris and Pelecyphora macromeris).</li>
    <li id="merged">They are also pages merged by the reference's own decision, eleven names in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/merged-pages.txt">the list of merged pages</a>. Coryphantha macromeris is merged into Pelecyphora macromeris, Rebutia fidana into Weingartia fidana, Weingartia pulchra into Weingartia canigueralii, and Drosera parvula into Drosera paleacea.</li>
    <li>Ceropegia melanops is merged into Ceropegia nigra, Copiapoa boliviana into Copiapoa calderana, Echeveria sessiliflora into Echeveria pinetorum, and Echeveria peacockii into Echeveria desmetiana.</li>
    <li>Ceropegia nubica and Ceropegia cereiformis are merged into Echidnopsis cereiformis, and Bisnaga hamatacantha into Ferocactus hamatacanthus, one type (Echinocactus hamatacanthus Muehlenpf.), whose name Kew's file does not hold.</li>
    <li>Kew's file files the name Echeveria peacockii itself under Dudleya pulverulenta, whose page shows it among Kew's names.</li>
    <li>A merged page's key is read whatever its type, and its names are listed on the page. Its own name is an older name of the page in the search, which lists the page first for it.</li>
    <li>Its old address and a plant recorded under it lead to the page. A plant recorded under the old name or any key the page reads is listed among yours there, with your notes and following kept under the old name.</li>
  </ul>
  </details>

  <h3 id="no-gbif-key">Species with no GBIF key</h3>
  <p class="sum">Some species Kew accepts are not one accepted species in GBIF's backbone. Their pages take their names and range from Kew, and their records only from GBIF keys Kew's file names as this plant. Where there are none, the page says its records were not asked, and why.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: species with no GBIF key</span></summary>
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
    <li>They are read when the page is built, and again by a later fill of Wikidata's names, two hundred items a query. Pages with a GBIF key take no names from Wikidata.</li>
    <li>Its GBIF records are read only under GBIF's keys for the names Kew's file holds as this plant (its own name and author, a spelling, a homotypic name, or an autonym of one), never a name matched. They are listed in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/extra-keys-kew.txt">the list of keys from Kew</a>.</li>
    <li>Those records make the page's map, marker, habitat climate and record counts as any page's do. The page keeps no GBIF key of its own, and has no photographs from GBIF.</li>
    <li>A page Kew's synonymy gives no such key has its GBIF records not asked. It has no points on the map, no marker, no habitat climate and no species of nearest climate, and each says "not asked", with why, never "none".</li>
    <li>The why is the page's own, read by the same rule from what GBIF's backbone holds of Kew's names for it (<a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/extra-keys-kew-none.txt">the list of pages with no key</a>). GBIF files those names under another page here, which the page names and links; or the backbone holds none of them; or only as another type's names, as names partly another taxon's, or under another author than Kew's.</li>
    <li>Where Kew accepts that other page's species apart from this one, the page says GBIF lumps what Kew splits. A record is shown on one page only.</li>
    <li>A plant of it is found by its name. A GBIF key a plant records for it is compared with the keys the page reads GBIF's records under, and the plant's page says whether it is one of them.</li>
  </ul>
  </details>

  <h3 id="climate-data">Climate and elevation</h3>
  <p class="sum">The monthly climate is CHELSA's, the elevation ETOPO's and the daily extremes NASA POWER's, read on one grid of 0.05° squares. The maps' coasts and regions are Natural Earth's.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: climate and elevation</span></summary>
  <ul class="rules">
    <li>Monthly climate normals come from <b>CHELSA V2.1</b> (1981–2010, 30 arc-seconds), packed to a 0.05° grid: day and night temperature, rainfall, solar radiation, relative humidity, vapour-pressure deficit and wind.</li>
    <li>Elevation comes from <b>ETOPO 2022</b> on the same grid.</li>
    <li>Daily temperature extremes come from <b>NASA POWER</b>, from 1981 on. Each page states how many years its series covers.</li>
    <li>The coastlines of the maps on a species page are <b>Natural Earth</b>'s (public domain), drawn from files this site serves itself.</li>
    <li>Both maps draw each native region by its simplified shape, the range test's own, from files this site serves and browsers keep, as they keep the coastline. A region with no shape is drawn as its box. Where one region's shape holds the whole close-up, the map says the frame is inside it.</li>
  </ul>
  </details>

  <h3 id="photos">Photographs</h3>
  <p class="sum">Photographs come from GBIF's records, iNaturalist and Wikimedia Commons, each with its author and licence. A photograph of the plant in cultivation leads where iNaturalist has one; cultivated ones are marked so. A file that may be another plant, a map, a drawing or a pressed specimen is not shown.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: photographs</span></summary>
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
    <li>The credits under the gallery say the day each source was read: each photograph's own day where the build recorded it, else the day its source was asked, or, for GBIF's photographs read from a GBIF download, the day GBIF made the download.</li>
    <li>Each carries its licence, and its author where the source names one. An iNaturalist photograph's author is its observer, by name or, where there is none, login, under CC0 too ("Alan Weakley, no rights reserved (CC0)").</li>
    <li>Under CC BY and CC BY-SA a photograph without an author is not published. An e-mail address is never published as an author, and a credit naming only one counts as none.</li>
    <li>iNaturalist's grey stand-in for a photograph it has not yet processed is not a photograph.</li>
    <li>A photograph in the public domain is labelled "Public domain", never CC0, which is a waiver only an author can make.</li>
    <li>The lead photograph is taken from iNaturalist's cultivated set first, the plant as it is grown, then iNaturalist's wild set, then GBIF's, then Commons'. Of these, one its source states at least 640 pixels on its long side leads: one not upright first, and the first photograph of its observation before a later one. Where no source states such a size, the first not stated smaller leads, one not upright first. GBIF's media of a record that is not an observation of the living plant, or on a herbarium's own host, is not shown.</li>
    <li>A photograph that two species' pages would both show is shown on neither. The one exception is an iNaturalist observation GBIF files under the other page by an older name Kew accepts as the first page's species: it is shown on the first page only.</li>
    <li>On a species page and on the compare page each photograph shows its author and licence. A small tile elsewhere gives the licence and the author's name, cut to forty characters ("Photo: CC BY, Jane Doe").</li>
    <li>A tile names the site the photograph came from instead where the credit cannot be said short and true. The species page it opens gives the full credit and a link to the source.</li>
    <li>A credit whose author's line names one licence and whose source tags another says the two disagree.</li>
  </ul>
  </details>
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
    <li>The strip's photographs under a species' name are asked for only once the lead photograph has loaded or failed, or two and a half seconds after the page can wait for it, so on a slow connection the lead comes first. Their squares are kept meanwhile, so nothing moves when they arrive.</li>
    <li>It is never loaded as the original upload where Commons has a version the place can use. An upload from 501 to 960 pixels wide leads at its own width.</li>
    <li>One no wider than 500 is loaded at Commons' largest version below its own width, 250 or 120, and whole only where it is 120 pixels wide or less, or its width is not known.</li>
    <li>One Commons gave no smaller version of is shown as uploaded.</li>
  </ul>
  </details>

  <h3 id="summary">The quoted summary</h3>
  <p class="sum">The summary is the English Wikipedia article's opening paragraph, quoted word for word as plain text and credited, with the article's revision it was read at and the day it was read. It is quoted only where the article is shown to be about this plant.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the quoted summary</span></summary>
  <ul class="rules">
    <li>The summary is the article's opening paragraph: the first paragraph of the article's lead as <b>Wikipedia</b>'s API gives it in plain text (TextExtracts), word for word, its brackets kept. Where the plain text leaves a bracket empty, a pronunciation having been taken out, the empty bracket is closed up, and a label left with nothing after it ("US:") is taken out of a bracket that keeps words. It is kept visibly apart and credited, with a link where more followed. It is four sentences at most, within the first 1,500 characters.</li>
    <li>It is cut only where a sentence ends. A summary that does not end a sentence, as Wikipedia gives it, ends with "…" and links the article, as one cut short does, whenever it was built.</li>
    <li>The paragraph and the article's revision are read in one request, so the revision the page names and links is the one the words were read at. A build asks for one article a request, as does the fill that checks a summary's title; the fill that reads stored summaries again asks for twenty. The page gives the day it was read too.</li>
    <li>A summary read before November 2026 is the text of Wikipedia's summary service (its REST API's page summary), which leaves out words in brackets, a pronunciation and often more; its credit names the service. A fill reads each such summary again as the opening paragraph, under the title it was quoted from, and quotes it anew where it differs. Where Wikipedia now moves that title to another article, holds no article under it or gives no revision, the fill leaves the summary as it was, and its credit still names the service.</li>
  </ul>
  </details>
  <details class="more"><summary>When a summary under another title is quoted</summary>
  <ul class="rules">
    <li>A summary under any title but the species' name is quoted only when that title is shown to be this species' article. That holds for a title Wikipedia reached through a redirect, and for the title of the species' Wikidata item.</li>
    <li>It is shown so when the title, or the taxon its Wikidata item names, is the species' name or an older name at species rank.</li>
    <li>Its epithet may differ only as the photographs' rule above allows, by a hyphen but not a space; a genitive in -ae is never read as a gender.</li>
    <li>Or when the title is the English article of the species' Wikidata item, but not when that title is a binomial, neither its name nor an older name, that GBIF holds as another species or under a variety or subspecies of this one and that Kew holds too.</li>
    <li>Or when another item has the same type as the species' item by Wikidata's basionym statements.</li>
    <li>Or when GBIF holds the title as a synonym of this species, or Kew holds the species' name under the title, both combinations of one basionym.</li>
    <li>Or when the title's item carries the species' IPNI identifier, or one whose IPNI record is the species' name by its author ("Rosa lucieae" for Rosa luciae).</li>
    <li>Or when the title's item carries Kew's IPNI or POWO identifier for a name Kew's file holds with the same type as the species, as the Wikidata item's rule below reads it ("Pseudofumaria lutea", whose item is Corydalis lutea's).</li>
    <li>A page Kew's name heads asks for its item's article first; with none, for the article of the one item of such a name, then by Kew's name, then by GBIF's.</li>
    <li>Or when the title's item names this species as the plant it is a product of, and no other plant but its genus ("Apple").</li>
    <li>Or when the title is a genus in which Kew's checklist, as Kew publishes it through GBIF, holds one accepted species, and that species is this one ("Welwitschia").</li>
    <li>What the article's opening says is never taken as proof.</li>
    <li>A summary quoted from under another title names its proof: beside the quotation where the title is one of the species' older names, and in the page's record of its sources otherwise.</li>
    <li>One not quoted is recorded as Wikipedia redirecting one title to the other. One whose proof could not be read, because Wikidata, GBIF, Kew or IPNI did not answer, is recorded as not checked, and is not shown until it is read.</li>
  </ul>
  </details>

  <h3 id="ids">Identifiers and links</h3>
  <p class="sum">The links to POWO, IPNI, World Flora Online and iNaturalist come from Kew's file and from Wikidata, and the links under "Elsewhere" from the page's own Wikidata item. An identifier is linked only where it is shown to be this plant's.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: identifiers and links</span></summary>
  <ul class="rules">
    <li>The species' identifiers in POWO, IPNI, World Flora Online and iNaturalist, and the title of its English Wikipedia article, come from <b>Wikidata</b>, from the item that carries the species' GBIF key.</li>
    <li>The IPNI and POWO links are Kew's number for the name and author wherever Kew holds one, read from the same file as the range, whether or not the Wikidata item gives a number, and whatever Wikidata answered. An item's number Kew holds for another author's name is never linked.</li>
    <li>A number Kew gives a name IPNI does not hold (one ending "-4") links POWO only. Where Kew holds the name only under another author, the page says so and links no POWO page.</li>
    <li>A page that is Kew's entry links IPNI's record of Kew's name for it, or none. It never links another name's record in its place, not even its basionym's.</li>
    <li>When Wikidata does not answer, the identifiers of the build that last read them are kept for at most 90 days. The page names that build and says beside its register links that they were not checked.</li>
    <li>Where that build's day is not known, they are kept for at most 90 days from the build that first kept them, and the page says so.</li>
    <li>Wikidata's items are read without waiting on its query service's lag, which no read of an item depends on, and a refusal or a busy answer is asked again after the wait it names, up to five times.</li>
    <li>"Elsewhere" links the other registers and floras the page's own Wikidata item names: Tropicos, Catalogue of Life, Euro+Med, Species+ (CITES), the IUCN Red List, the Red List of South African Plants, NatureServe, Flora of North America, Flora of China, USDA PLANTS, Calflora, Reflora, Flora of Australia, APNI, FloraBase, VicFlora, NSW Flora, Missouri's Plant Finder, CalPhotos, BHL, EOL, ITIS and NCBI. Species+ is left out while the page's CITES line says "not asked".</li>
    <li>Each is the item's own identifier, made a link by the address Wikidata gives its property (<a href="https://github.com/zomethingje-eng/cultifolio/blob/main/src/lib/dossier/elsewhere-links.ts">the list, with each property</a>). The page's own registers, GBIF, POWO, IPNI, WFO and iNaturalist, are linked once, by the build's identifiers; the item's are used only for one the page does not link.</li>
    <li>The items are read fifty a request, and the page says the item and the day it was read. A preferred value is read first, and a deprecated one never. An item read for another item than the page's now is not shown.</li>
    <li>Until its item has been read, the line says "not asked"; where Wikidata did not answer, "not checked", with the day. An item Wikidata no longer serves under the page's id, deleted or merged into another, gives no links, and the page says it was not answered.</li>
  </ul>
  </details>
  <details class="more"><summary>How the Wikidata item is chosen</summary>
  <ul class="rules">
    <li>A page with a Kew id is matched by those identifiers wherever Kew's file gives its name and author one. Of two items that carry its GBIF key, the one that carries Kew's IPNI or POWO identifier for it is taken; with none, the one item that carries either.</li>
    <li>Failing those, the item that carries Kew's IPNI or POWO identifier for a name Kew's file holds with the same type as the page's. That is its basionym, or the name a replacement name replaced, a name moved from either, or a synonym Kew marks homotypic.</li>
    <li>Of two such items, the basionym's is taken; otherwise no item, which the page says. A synonym Kew holds on another type is never read, and no name is matched by its words.</li>
    <li>The record names the name and why ("found by Kew's identifier 559896-1 for Hibiscus acetosella Welw. ex Hiern, which Kew holds as this species' basionym (same type)").</li>
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
    <li>Of two items found by the older names, the one that carries the IPNI identifier of the entry Kew accepts is taken. The record says which rule took the item.</li>
    <li>Wikidata and iNaturalist are asked under older names when neither knows the species by its current name. A page Kew's name now heads is asked again under that name.</li>
    <li>That is only under the older names that share its type: the name it was first published under and names moved from it, never a name lumped in on another type. The answer is taken only when it is one item, or one taxon.</li>
    <li>GBIF or Kew not answering while an item is checked is said as theirs, and the previous identifiers are kept as when Wikidata does not answer.</li>
  </ul>
  </details>

  <h3 id="published">Where the name was published</h3>
  <p class="sum">The page quotes where its name was published, as Kew's file gives it. It links BHL only where BHL's resolver gives one page for exactly that citation.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: where the name was published</span></summary>
  <ul class="rules">
    <li>The citation is where Kew's file says the page's Kew entry was published, its title, volume and page, and year, quoted as Kew's file writes them ("Kew Bull. 16: 181 (1962)"), credited to WCVP with the day of Kew's file.</li>
    <li>BHL's resolver is asked only a citation it can be given whole: a title, a plain volume and page ("16: 181") or a page alone (": 293", a book), and one year ("(1962)"). Any other form, "5(9): 6" or "(1862 publ. 1863)", is not asked, and is shown as text.</li>
    <li>BHL's page is linked only when BHL answers one citation whose address is one page, numbered as the citation's page, in the citation's volume, dated in its year, and in a title whose words Kew's abbreviation begins, in order. A journal Kew cites with words in parentheses, as Bot. Mag. (Tokyo), is not taken for the abbreviation without them. Otherwise the citation is shown as text. No page is guessed.</li>
    <li>BHL is asked once a second at most, and 4,000 times a day. A citation it did not answer is asked again by the next run; one Kew's file changes is asked again.</li>
  </ul>
  </details>

  <h3 id="risk-cites">Extinction risk, CITES and chromosomes</h3>
  <p class="sum">Three lines come from files read whole by the build, offline. The risk and the chromosome counts are matched to the page by its IPNI identifier, and CITES by the exact name the Appendices print, or by a synonym Kew holds of it that is no other page's name, never by a likeness of names. Each names its source, the source's date, its licence and the day it was read.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: extinction risk, CITES and chromosomes</span></summary>
  <ul class="rules">
    <li id="risk">The extinction risk is Kew's model's (Bachman et al., New Phytologist, 2024), read from Kew's data of 1 February 2024. That is the probability the model gives that the species is threatened, its 95% interval, the class it predicts and whether it is confident of it. It covers flowering plants only.</li>
    <li>It is said as a model's prediction, never as an assessment. The file's Red List categories are not read, and the page shows none. Where the file marks the species as assessed by the IUCN Red List, the page says so and links IUCN's page, by the IUCN identifier the species' Wikidata item gives.</li>
    <li>The prediction is matched by the IPNI identifier of the page's name. The file's own numbers are an earlier form of Kew's, not those of the file the pages are built from.</li>
    <li id="cites">The CITES status is read from the plant listings of the Appendices, as CITES publishes them, transcribed by hand with the page and address each was read from. Nothing is read from Species+ or the CITES Checklist, whose terms do not allow it. Species+ is only linked, by the identifier the species' Wikidata item gives.</li>
    <li>A listing of the page's own name, or of a name it includes, is the page's. Failing that, a listing of a name Kew holds as a synonym of it, which the page names, unless that name is another page's own: then the listing is that plant's, and the page says so. A name the listing excepts (Aloe vera from Aloe spp.) is not listed.</li>
    <li>Failing those, a listing of its genus (Ariocarpus spp.), then of its family (CACTACEAE spp.), with the listing's exceptions.</li>
    <li>Not decided, and said so, where the page's names do not decide. That is where the Appendices' genus or family is narrower than Kew's (Kew's Didiereaceae holds Portulacaria, the listing does not), where only a synonym's genus is listed, or where the listing is of "succulent species only".</li>
    <li>The page says the Appendix, the listing and its level, its annotation and parenthesis, the day the Appendices are in force from, and links the official Appendices. It gives no reading of what a listing requires.</li>
    <li>The table is applied only once it has been checked, row by row, against the edition of the Appendices in force. Until then every page's CITES line says "not asked", never "not listed".</li>
    <li id="chromosomes">Chromosome counts are ChromoDB's, from the IAPT/IOPB chromosome data series, version 3.1 of 8 November 2026. Each number is as published (2n, then n), with its reference linked to its DOI or stable address, and the name it was published under where that is another.</li>
    <li>A count is the page's only when its record's identifier is the page's IPNI identifier and its accepted name, without its authors, is the page's name. Records under that identifier with the name spelt otherwise are not taken, and the line says it is not decided. Counts their authors retracted and numbers inferred from genome size are left out. A page shows at most twelve counts and says how many more there are.</li>
    <li>Where a file was not there when the page was built, or could not be read whole, the line says "not asked", and why. A file read and holding nothing for the page says that, with the file's date.</li>
  </ul>
  </details>

  <h3 id="inat">The iNaturalist taxon</h3>
  <p class="sum">The iNaturalist taxon a page links is checked with iNaturalist before any photograph of it is asked for. It is taken only where it is shown to be this species.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the iNaturalist taxon</span></summary>
  <ul class="rules">
    <li>Every iNaturalist taxon id, from Wikidata or kept from the previous build, is checked with iNaturalist: by the build, or, where the build left iNaturalist to the daily fill, by the fill, thirty ids a request, before it asks iNaturalist for any photograph of the taxon.</li>
    <li>Until the fill reaches it, a page may show the wild photographs the open data holds under an id not yet checked, or say it holds none.</li>
    <li>A build that leaves iNaturalist to the fill keeps the id the page had, and each of its iNaturalist rows says it was left to the fill.</li>
    <li>From iNaturalist, asked under older names, a taxon is taken only when its own name is one of the species' own names and never one this reference holds as another species. A variety it files an older name under, whose species is one of them, is read as that species. Its name search is limited to plants.</li>
    <li>Where the species' item gives no taxon, the taxon given by the item of a name Kew's file holds with the same type is taken, when there is one, or the basionym's item's. It is checked as any other.</li>
    <li>An id iNaturalist has made inactive is followed to the one current taxon it names. An id from Wikidata or an earlier build is kept only when that taxon is this species, in one of the ways below.</li>
    <li>Its name is one of the species' own: its name, an older name with the same type, or another name GBIF holds as its synonym that no species of this reference holds as its own, in any spelling of the epithet.</li>
    <li>Or GBIF's backbone holds the name as this species, or corrects it as a misspelling to this very species (GBIF's fuzzy match), while a correction to another species is never read as this one's.</li>
    <li>Or Kew holds it as a synonym of this species, or this species as a synonym of it.</li>
    <li>Or, where neither places it in this reference, it is this species' epithet in another genus, or its epithet one letter otherwise where no species here holds that name (Echinocereus chisosensis for Echinocereus chisoensis). In either case no other species of the family here has that epithet.</li>
    <li>A name Kew accepts as a species, or holds as a synonym of another, is never a slip. Nor is one GBIF holds otherwise than as this species, unless GBIF's record is this species' name by its own author spelt otherwise (GBIF's Othonna cakilifolia DC., which Kew spells cakilefolia: one name).</li>
    <li>A name in another genus is never taken when Kew accepts both (Lupinus longifolius is not Acacia longifolia).</li>
    <li>A taxon GBIF holds as another species of this reference is never taken, however it was found (Pinguicula antarctica for Pinguicula chilensis), nor one Kew holds so, except a taxon iNaturalist's own name search files the species under, for which Kew is not asked.</li>
    <li>The taxon an inactive id named is not taken from the name search either.</li>
    <li>A variety that is the species' own type (Tricyrtis formosana var. formosana) gives way to iNaturalist's taxon of the species.</li>
  </ul>
  </details>

  <h3 id="flowering">Flowering by month</h3>
  <p class="sum">A page shows how many of iNaturalist's research-grade observations of wild plants are marked as flowering, month by month. The months are the calendar's, as each plant was observed.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: flowering by month</span></summary>
  <ul class="rules">
    <li>The counts are iNaturalist's: research-grade observations, not captive or cultivated, annotated "Flowering", by the month they were observed in, for the page's iNaturalist taxon, its varieties and subspecies included. The page names the day they were read and links the same search on iNaturalist.</li>
    <li>An observation not annotated is not counted, so the counts say when people saw the plant in flower and said so, not how long it flowers.</li>
    <li>The months are never moved to your hemisphere: an observation is dated where the plant was seen. Where the habitat climate is read south of the equator, the page says so.</li>
    <li>Under 12 observations, the strip is marked "from few records", as a habitat climate is, and shown as read. Twelve months of nothing is said as no observation annotated, never as a plant that does not flower.</li>
    <li>Until a page has been read, it says "not asked"; where iNaturalist did not answer, "not checked", with the day. iNaturalist is asked one request a page, at most one every 2 seconds, within the reference's 4,000 requests a day to iNaturalist.</li>
  </ul>
  </details>

  <h3 id="papers">Published papers</h3>
  <p class="sum">No species page lists published papers. The reference does not ask OpenAlex for them, and each page's record of its sources says OpenAlex was not asked, and why.</p>
  </section>

  <!-- ─────────────────────────── The species list ─────────────────────────── -->
  <section aria-labelledby="list">
  <h2 id="list">Which species are here</h2>
  <p class="sum">The list of species was derived by rule, not chosen by hand. It holds every species with at least three records of cultivated plants, and every species of 173 collector genera. A species that is not here says nothing about the plant, only about the list.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: which species are here</span></summary>
  <ul class="rules">
    <li>The list is <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/species-list.txt">the species list</a> in the source code, made by rule on 19 October 2026 and added to since only by the rules below.</li>
    <li>It holds every species Kew's World Checklist accepts with at least three records of cultivated plants.</li>
    <li>It holds every species Kew accepts of 173 collector genera taken whole: the cacti, the mesembs, the stapeliads and caudiciforms, the winter-growing bulbs and their like, less their hybrids, in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/specialist-genera.txt">the list of collector genera</a>.</li>
    <li>It keeps every species that was already in the reference, so that no page falls out; 26 species are here for that reason alone.</li>
    <li>A species Kew accepts that GBIF folds into a variety or a synonym of another page's species gets a page of its own when growers name it. Echinopsis pachanoi, San Pedro, is one.</li>
    <li>Each page is the species of the Kew entry it cites, or of its name where Kew holds that name for one species alone. Pages whose names Kew's checklist does not place keep GBIF's key.</li>
    <li>The records counted are iNaturalist's observations marked captive or cultivated, and GBIF's living-specimen records from living collections.</li>
    <li>GBIF's count only from datasets that a stated rule finds to be living collections, by each dataset's own description. A dataset that names a genebank (germplasm, a seed bank, plant genetic resources or passport data, in the words of FAO's genebank standards) is left out.</li>
    <li>One whose title, keywords or publisher names a botanic garden, an arboretum, a garden or a living collection is counted. Any other, such as a register of street trees or a field survey, is not.</li>
    <li>The three lists are in the source code: <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/counted-datasets.txt">the datasets counted</a>, <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/excluded-datasets.txt">those left out</a> and <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/undecided-datasets.txt">those undecided</a>. So the genebanks' 1.9 million records, mostly wheat, rice and barley, count for nothing, and a crop is here by its growers' own records.</li>
    <li>No family is left out.</li>
    <li>Each name is matched to a species Kew accepts only where the match is unambiguous. Every name of Kew's of those words leads to one species; or GBIF's name and author lead to one; or, for iNaturalist, whose plant names follow Kew's POWO, Kew accepts exactly one species of those words.</li>
    <li>iNaturalist lists where its names depart from Kew's, but that list could not be read, so those departures are not applied.</li>
    <li>Every name refused, and why, is in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/species-refused.txt">the list of names refused</a>. Each line of the list says why its species is there: its two counts, or its collector genus.</li>
    <li>The very large genera are not taken whole: Aloe has 199 of the 611 species Kew accepts, Euphorbia 401 of 2,118.</li>
  </ul>
  </details>
  <h3 id="grown">"Popular genera"</h3>
  <p class="sum">"Popular genera" narrows the front page's catalogue to the genera growers record most often in cultivation on iNaturalist. It is a count of observations, made once and dated.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: "Popular genera"</span></summary>
  <ul class="rules">
    <li>The front page's catalogue is the same on every device: every genus and every species.</li>
    <li>Its chip "Popular genera", off until chosen, narrows it to the popular genera. These are the fewest genera that, taken from the most observed down, hold half of iNaturalist's observations of plants marked captive or cultivated, across the reference's genera that were counted.</li>
    <li>It is a measure of genera, not of species or of growers. Each genus is counted with every taxon under it.</li>
    <li>The count was made on 22 October 2026, over the 6,539 genera the reference and its species list then held; 6,449 of them were counted. <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/most-grown-genera.txt">The list of counts</a> holds every count, the query and iNaturalist's terms.</li>
    <li>A genus is counted only where iNaturalist holds exactly one active genus of plants of that name. One it holds only as an old name, such as Callistemon or Mahonia, or one whose count did not answer, is not counted and is not under the chip, and nor is a genus that joins the reference after the count, until it is made again.</li>
  </ul>
  </details>
  <h3 id="feature">The photographs on the front page</h3>
  <p class="sum">The front page's photographs are picked by rule from the popular genera, not by hand.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the photographs on the front page</span></summary>
  <ul class="rules">
    <li>The front page's photographs are chosen by rule, not by hand, from the "Popular genera", most grown first.</li>
    <li>Of each such genus, one species with eight photographs or more and a habitat climate: the one most observed in cultivation on iNaturalist, then the most photographed. The first 48 genera that have one make the strip, and twelve of them are shown a day, in turn.</li>
    <li>The strip sits above the search, on a phone as on a desktop.</li>
    <li>The figure at the top of the front page is the coldest night on record where the first of the day's photographed species whose page holds one grows wild. It is NASA POWER's lowest daily minimum over its years at the grid cell of a typical record. Beside it are the records and grid cells it rests on, where the records came from and on what day, and the rule they were counted by, each read from that species' page.</li>
    <li>Its photograph is shown with its author, its licence and the day its credit was read. A species whose lead photograph's credit has no such day is passed over for the next, as one without the figure is.</li>
    <li>Only the first three of the day are read. Where none of them holds one, and on a device that holds plants of its own, the front page shows no such figure.</li>
    <li>The not-found page of an address that is neither a species address nor a page of your own collection shows the first species of the day's strip, with its lead photograph, its author and licence, and the day its credit was read.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Search ─────────────────────────── -->
  <section aria-labelledby="search">
  <h2 id="search">Search</h2>
  <p class="sum">Search finds a species by its name, an older name, an English name, its family or where it grows. A name you type exactly comes first, then the species whose English name it is. A query that matches nothing is tried again with a typing error forgiven, and the page says so.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: search</span></summary>
  <ul class="rules">
    <li>First, a name typed as a name, its genus first: <span class="ex" data-q="copi" data-order="Copiapoa" data-first>"copi" is the Copiapoas</span>. A genus that only begins with a word typed whole comes after the common names holding the word whole: <span class="ex" data-q="rose" data-order="Rosa | Rosenbergiodendron">"rose" is the roses before Rosenbergiodendron</span>.</li>
    <li>Then an older name typed as one: <span class="ex" data-q="Sansevieria trifasciata" data-order="Dracaena trifasciata" data-first>"Sansevieria trifasciata" is Dracaena trifasciata</span>. A species that holds the name exactly comes first: <span class="ex" data-q="Cornus mascula" data-order="Cornus mas | Cornus officinalis" data-first>"Cornus mascula" is Cornus mas before Cornus officinalis</span>.</li>
    <li>Then the species that keeps the name's epithet, then one that shows the name among its six: <span class="ex" data-q="Aloe variegata" data-order="Gonialoe variegata | Aloe vera" data-first>"Aloe variegata" is Gonialoe variegata before Aloe vera</span>.</li>
    <li>Then the query read whole against each English name, every word in one name: <span class="ex" data-q="Black eyed Susan" data-order="Rudbeckia hirta">"Black eyed Susan" finds every black-eyed Susan, Rudbeckia hirta among them</span>, however it is capitalised. <span class="ex" data-q="snake plant" data-order="Dracaena trifasciata" data-first>"snake plant" is Dracaena trifasciata</span>, never the words of two names.</li>
    <li>Then every other match, such as a word of an English name with a word of a place.</li>
    <li>A family is matched by a whole word, or from its start by a word of six letters or more that is neither a genus here nor a word of the species' own name. So "aizoac" finds the Aizoaceae, and "plant" is never the start of Plantaginaceae.</li>
    <li>Within each, a name that is exactly the query comes first, the shown English name before the others.</li>
    <li>Of the species that hold a one-word query as a name, one whose shown English name holds the word too comes first, wherever the name stands among its others: <span class="ex" data-q="snowdrop" data-order="Galanthus nivalis" data-first>"snowdrop" is Galanthus nivalis, "Common snowdrop", first</span>.</li>
    <li>A generic noun matched alone comes after every match of whole words, unless the species' shown name holds the word. So does a one-word name species of two genera or more are called, unless it is the species' own shown name: <span class="ex" data-q="peppermint" data-order="Mentha × piperita | Eucalyptus" data-first>"peppermint" is Mentha × piperita before the Eucalyptus</span>.</li>
    <li>A one-word name several species of one genus hold leads with the one of them that has the most photographs; a species headed by it with fewer comes after the others that hold it: <span class="ex" data-q="pepper" data-order="Piper nigrum | Piper ponapense">"pepper" lists Piper nigrum before Piper ponapense, which has fewer photographs</span>.</li>
    <li>Then a match of whole words, then a match whose shown English name holds every word.</li>
    <li>Among the English names' matches, a tie goes to the species whose matching name comes earlier among its names. Then to a name written as typed. Then to the species with more photographs: <span class="ex" data-q="jade plant" data-order="Crassula ovata | Crassula arborescens" data-first>"jade plant" is Crassula ovata before Crassula arborescens</span>.</li>
    <li>Then the alphabet: <span class="ex" data-q="fig" data-order="Ficus carica" data-first>"fig" is Ficus carica first</span>.</li>
    <li>A genus typed alone lists its species by how many English names the sources give them, then by their photographs, then the alphabet: <span class="ex" data-q="echeveria" data-order="Echeveria elegans" data-first>"echeveria" is Echeveria elegans first</span>.</li>
    <li>So does the genus still being typed or misspelt, where one genus answers ("echev", "echevaria"). Another genus that begins with the word comes after it: <span class="ex" data-q="aloe" data-order="Aloe | Aloestrela" data-first>"aloe" is Aloe before Aloestrela</span>. Several genera begun ("c") keep the alphabet.</li>
    <li>Apostrophes are taken out of a word before it is read: <span class="ex" data-q="devils backbone" data-order="Kalanchoe daigremontiana" data-first>"devils backbone" is Kalanchoe daigremontiana, "Devil's backbone"</span>.</li>
    <li>In a query of two words or more, a word of four letters or more read as an English plural is matched by its singular too. A word alone, and a scientific name, are matched as typed.</li>
    <li>Every older name the backbone gives a species at species rank is searched, though its entry shows six.</li>
    <li>So are the names GBIF or Kew files under one of the species' own varieties or subspecies, read as names of the species, as a name typed. A page does not show them.</li>
    <li>Kew's older names for the plant are searched only as a name typed: two words or more, the first the name's genus in full. <span class="ex" data-q="Echinocactus chrysacanthus" data-order="Ferocactus chrysacanthus" data-first>"Echinocactus chrysacanthus" is Ferocactus chrysacanthus</span>. They are never matched by a similar spelling or a word alone, and a page does not show them.</li>
    <li>An older name the record spells as another species' accepted name here, by another author or with no author, is searched only as a name typed. It comes after the species of that name and every species holding it as an older name of its own.</li>
    <li>Its row says "older name under another author: Sempervivum montanum Sibth. &amp; Sm.", as the species page says it. One the record writes by that species' own author is one name, which GBIF files under both, and stays an older name.</li>
    <li>The name of a page merged into another, typed as a name, lists the page it was merged into first, before every other species that holds the name as an older name: <span class="ex" data-q="Echeveria peacockii" data-order="Echeveria desmetiana | Dudleya pulverulenta" data-first>"Echeveria peacockii" is Echeveria desmetiana, then Dudleya pulverulenta</span>.</li>
    <li>Its row, in the catalogue and in the species picker, says "Echeveria peacockii is merged into this page".</li>
    <li>A match found by an older name says so on its row ("older name: Sansevieria trifasciata") and opens its page with the line that says whose name it is.</li>
  </ul>
  </details>
  <h3 id="search-reading">How a query is read</h3>
  <p class="sum">A query is read as a botanical name written the way growers write it, so an author, a cultivar or "cf." is left out. A query that finds nothing is tried again, and the page says how it read it.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: how a query is read</span></summary>
  <ul class="rules">
    <li>A query is read as a botanical name written the way growers write it. Var., subsp., f., fo. and v. are ranks; after cv. the rest is a cultivar and is left out.</li>
    <li>"cf.", "cfr.", "aff.", "vel aff.", "nr." and "near" (between two words of a name) are skipped. "sp.", "spp." and "nov." end the name.</li>
    <li>"x" or "×" marks a hybrid, and the name starts again after it, so the word after the sign is never an author. A hybrid is found the same with the sign, with an "x" or with neither.</li>
    <li>A cultivar in quotes after the name, any quotes („…“ and «…» among them), is left out when it begins with a capital. A cultivar whose name holds an apostrophe is not read as one, and its words are searched: "Galanthus 'Wendy's Gold'" finds nothing. Quotes around the whole query are taken off, and the text inside is searched.</li>
    <li>An author citation pasted after a name is left out, in either case ("L.", "l.", "Britton &amp; Rose").</li>
    <li>A capitalised word is read as an author only after an epithet of four letters or more. A word ending in a full stop, or a capitalised abbreviation of four characters or fewer ("St.", "L."), is read so only after an epithet or a rank. So "Lily of St. James" and "String of pearls." are searched whole.</li>
    <li>When the reading as a botanical name would leave words out, the whole query is read against the English names first.</li>
    <li>When nothing matches exactly, one typing error is allowed per word of four letters or more, against the species' names only. Family and places are matched only as written. The nearest spelling comes first.</li>
    <li>A genus of four letters or more still being typed, or misspelt, that several genera answer lists them by how near each is to the word typed, then the genus with more species, then the alphabet: <span class="ex" data-q="lithop" data-order="Lithops | Lithophragma" data-first>"lithop" is Lithops before Lithophragma</span>.</li>
    <li>A genus of the reference typed in full is matched only as typed. So "Aloe × nobilis", a hybrid the reference does not hold, is not Margaritaria nobilis by a word one letter from "aloe"; it is answered by its first parent.</li>
    <li>After a first word with a capital, a capitalised word is matched only against a whole word: <span class="ex" data-q="Aloe Verra" data-order="Aloe vera" data-first>"Aloe Verra" is Aloe vera</span>, not a plant of Algeria, and "Echeveria Lola" is not Echeveria lilacina.</li>
    <li>Then the query is tried again on its first two words. A hyphenated epithet is one word, and a hybrid formula is tried on its first parent. A single letter, two words whose second is a small word such as "of", or words of a sentence ("this is the one my grandmother grew"), are never tried again.</li>
    <li>Still nothing: a last word of five letters or more is read from fewer of its letters, as a name still being typed is (one, two and three fewer, then its first four), and the first reading that answers is shown. So "lithops lesleyi" is Lithops lesliei, and the page says which letters it read. A query of two words or more is read so only when its first word is a genus here: "false roselle" is never read as "false rose".</li>
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
    <li>An address the backbone resolves through a subspecies or variety goes to its species, and the page says so, from the names its record holds under the species' varieties.</li>
    <li>An address under a name Kew's file holds as an older name of one species here goes to that species without asking GBIF; one Kew holds for two goes to neither. GBIF's answer never leads to a page whose record says Kew holds the name for another plant: the address is then answered "not found", saying what Kew holds.</li>
    <li>The search is kept in the page's address, so a reload or a shared link answers it again. Back from a species page returns to the same list, as long as it was, at the same place.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Who writes ─────────────────────────── -->
  <section aria-labelledby="written">
  <h2 id="written">Who writes the words</h2>
  <p class="sum">Nothing about a species is written for its page by a person or by AI, apart from credited quotations. Every sentence is a quotation, a figure with its source, or a labelled reading of a fixed rule. The templates were written once, the same for every species.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: who writes the words</span></summary>
  <ul class="rules">
    <li>The figures at the top, the season card and the cultivation sheet are figures with their sources, and the readings two fixed rules make of them. Each section's "How this section is made" says which figure each sentence rests on.</li>
    <li>The templates those sentences are filled into, the labels and the notices were written once, for every species, by the author with Claude, an AI model, as the code was. They are in <a href="#source">the source code</a>, and no text is written or generated for any one species.</li>
    <li>The labels over the figures ("Cold floor (1 night in 100)", "Warmest month, mean daily high", "Rain a year (median across the range)", "Open-sky light") name the figures under them. They are not readings of them.</li>
    <li>No row says what a plant does, wants or tolerates, or what to do to it.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Refusals ─────────────────────────── -->
  <section aria-labelledby="refusal">
  <h2 id="refusal">A refusal is not an absence</h2>
  <p class="sum">Sources time out and go down. When one does, the page says "not checked", and where a source was not asked, "not asked", rather than showing an empty list. "We have no answer" and "there is nothing" are different facts, and a grower needs to know which.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: a refusal is not an absence</span></summary>
  <ul class="rules">
    <li>Where a page's records were not checked, it says so once, under the name, with why; each section that needs the records points there ("see under the name") rather than saying it again.</li>
    <li>Wherever there is no room for the sentence, the mark is one dashed pill reading "not checked", or "not asked" for a source not asked, the same on every page, and tapping it says which source, and when.</li>
    <li>A source that refused is said to have refused. One that failed or was silent has not answered. A call this site held back, or a source a build did not ask, is "not asked".</li>
    <li>A source that answered with two records where the rule takes one (two Wikidata items, two iNaturalist taxa, two Kew entries) is said as "not taken: two items answered", and nothing is taken from it.</li>
    <li>When a source refuses, the build keeps what it gave last time, and records the date it was carried from, and what that build recorded of it.</li>
    <li>What is carried is exact. The summary and the photographs are carried per source, so a refused iNaturalist does not discard the Commons photographs the same build got.</li>
    <li>The range, the records, the map marker and the climate are carried as one snapshot, never piecemeal: a range from one build with records from another would be a page no build made. They are carried only to a page whose GBIF key is the one the records were read under.</li>
    <li>A species page whose data cannot be read at the moment it is asked for says so, and no cache keeps that answer. It is never said to be absent.</li>
    <li>On Today, when the species sheets do not answer within fifteen seconds, every plant past its rhythm is listed, and each stop says "Resting months not checked". The sheets are asked again on "Check again" and at the next visit.</li>
    <li>The same holds the other way. A species with no habitat climate on file gets no climate rows derived from one.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Records ─────────────────────────── -->
  <section aria-labelledby="records">
  <h2 id="records">Which records count</h2>
  <p class="sum">GBIF's records include garden plants, herbarium sheets placed at the herbarium, and plants outside their native range. A species page keeps only wild records inside Kew's native range. Every record left out is counted, and the page says why.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: which records count</span></summary>
  <ul class="rules">
    <li id="sample">The build reads a species' georeferenced records with no flagged geospatial issue: at most 2,000 from GBIF's download, or, where the download does not hold the species, up to three pages of 300 from GBIF's search.</li>
    <li>From the download, where GBIF holds more than 2,000, the sample is chosen by grid cell, not by the file's order: one record from every distinct 0.05° cell first, then more from each cell in turn. So a sample covers the whole range.</li>
    <li>GBIF's search has no order by location. Where it holds more than the pages read, the build also asks for the first 300 inside the box of each of up to five native regions, the largest first, so no region is read only where GBIF's order puts it.</li>
    <li>It drops living specimens (something somebody planted), and records marked introduced or managed.</li>
    <li>It drops every record within 1 km of a botanic garden, arboretum, herbarium or zoo on Wikidata's list of them (CC0). Such a record is most often a planted plant, or a sheet placed at the herbarium that keeps it. A wild plant within that kilometre is left out with them, and counted.</li>
  </ul>
  </details>
  <h3 id="default-points">Default points</h3>
  <p class="sum">Some datasets put records they have no locality for at a country's or a province's middle. A record at such a point is left out, unless its dataset states it is placed to within 10 km.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: default points</span></summary>
  <ul class="rules">
    <li>A record at a dataset's default point is left out too, and counted. A default point is a coordinate where the open records of 20 species or more of this reference lie, nearly all with no year.</li>
    <li>It is most often a country's or a province's middle that a dataset gives records it has no place for: one in the middle of Mexico is on the maps of 180 species. The points are read from the reference's own records and listed in <a href="https://github.com/zomethingje-eng/cultifolio/blob/main/scripts/default-points.txt">the list of default points</a>.</li>
    <li>A record there whose dataset states it is placed to within 10 km is kept. Most such points are survey plots and local floras that state where they are, and a country's middle states no such thing.</li>
    <li>A record at a default point that names a place but states no accuracy is left out. Some of these are true localities (a village, an estate); the rule accepts that loss, which falls mostly on the maps, since a record with no stated accuracy seldom reaches the climate.</li><!-- decision 5 -->
  </ul>
  </details>
  <h3 id="shapes">Inside the native range</h3>
  <p class="sum">Each record is tested against Kew's native regions, drawn from Natural Earth's provinces. A record just over a border, off a coast or on an island too small to draw counts only when it states that region's country, unless it lies on one of Natural Earth's minor islands placed in that region and states no other country. A record 0.02° or less inside a neighbouring region's shape counts for the native one only by its stated country and, where it names a state or province of one of the two regions (by its name, its ISO 3166-2 code or an old name), by that state.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: inside the native range</span></summary>
  <ul class="rules">
    <li>Each record left is tested against the native range from Kew, and a record outside it is discarded. Restricted records are tested exactly as open ones are.</li>
    <li>A record is inside a native region when it lies in the region's shape.</li>
    <li>A record in no region's shape counts for a native region within the buffer of 0.05° beyond its edge (about 5.6 km), or off its coast within the coast reach. That is only when it states the country of the region it would count for.</li>
    <li>A record that states no country counts only where it lies inside a native shape, inside the box of a native region with no shape, or on a native minor island: no region is guessed for it.</li>
    <li>The shapes are simplified to about 2 km (0.02°), so a border is drawn no closer than that. A record inside a neighbouring region's shape but within 0.02° of a native one counts for the native region when its stated country is that region's and not the neighbour's. Where both are of its country (the Free State and KwaZulu-Natal), the state or province the record names decides: it counts when that is the native region's, and not when it is the neighbour's. A state is read by its name, by its ISO 3166-2 code (KZN, TX, CN-YN) or by an old province's name (Natal, Transvaal). A code is read where ISO's subdivision is matched to one of Natural Earth's provinces, by its name or by hand: 238 of ISO's subdivisions are not, among them every one of Kiribati's and Morocco's. An old province that held land on both sides decides nothing, and the drawing does: the record lies in the neighbour's shape, so it is the neighbour's. A record that names no state or province, or a third region's, counts, since within the drawing's own accuracy the line cannot tell. So does a record whose state neither the shapes' names nor those codes and old names can match: it is read as naming none.</li>
    <li>Any other record inside another region's shape is that region's, native or not. Aloe vera's record at Khor Fakkan lies in the Gulf States' shape and states the Emirates, so it does not count for Oman, though Oman's border is in reach.</li>
    <li>These are the rules of shapes rule r87, which each page names: r86's, on the same shapes, with a record's stated state read by its ISO 3166-2 code and old provinces' names too. A page whose records were tested by r86 read a state by the shapes' names alone, so a record naming one by a code or an old province's name (Natal) counted, as one naming none. A page whose records were tested by r85 also let in, by the buffer and the coast reach, a record that stated no country, and none across a border.</li>
    <li>The shapes are Natural Earth's states and provinces (public domain), placed in Kew's regions by TDWG's own tables and simplified to about 2 km. TDWG's own outlines are not openly licensed, so they are not used.</li>
    <li>They follow TDWG's scheme exactly. Morocco's southern provinces are split at the Western Sahara line, Tarfaya to Morocco and the rest to Western Sahara, and Darjeeling is in the East Himalaya, as TDWG's EHM-DJ. Since rule r86, Gilgit-Baltistan and Azad Kashmir are in the West Himalaya, where TDWG's gazetteer files Gilgit and Baltistan (WHM-JK, Jammu-Kashmir), not in Pakistan.</li>
    <li>A region's countries are those GBIF states a record's, Svalbard's SJ, Bouvet Island's BV, the Caribbean Netherlands' BQ, Saint-Martin's MF and Clipperton Island's CP among them.</li>
    <li>Islands a coarser drawing missed are placed in their regions: the Kermadec Islands, Los Roques, the Aru Islands and Cocos Island. The Snares stay in New Zealand South, where TDWG's gazetteer files them, and Kenting's records lie just off the drawn coast of Taiwan, so they count by the buffer.</li>
    <li>A province TDWG's tables write under an older code (the former Yugoslavia's), or under none (Somaliland, South Sudan, Northern Cyprus, the West Bank), is placed in its TDWG region. An islet the simplification would drop is kept as drawn.</li>
    <li>A remote island that does not fit its region is put in its own region, or left out, rather than costing the whole region its shape.</li>
    <li>366 of the 369 regions have a shape. The other three are tested by their boxes: Christmas Island and the Cocos (Keeling) Islands, which Natural Earth's provinces do not draw, and the South China Sea, whose Spratly Islands TDWG gives no country.</li>
    <li>A region's box is its bounding rectangle, tested with the same buffer as a shape. A box takes in its neighbours' corners, so it can let in a record from a country next door.</li>
    <li id="coast-reach">The coast reach is 0.15° (about 16.7 km). A record in no region's shape, at sea or on an islet the shapes do not draw, counts for the region whose drawn coast is nearest within it, when it states that region's country. A record on another region's land never does: Belgium is no part of France's range, however near.</li>
    <li id="islands">A record beyond the coast reach, in no shape, counts for a native region where a source puts land there. That is an island of Natural Earth's minor islands, each given to the region of the nearest shape. Or the record states that region's country and lies within 0.5° of its shape (about 55 km), or inside its box, and no other country's drawn land lies nearer.</li>
    <li>So the Poor Knights lily's records on its own islands count for New Zealand North.</li>
    <li>Each page's record of its sources says how its records, open and restricted alike, were tested: by the native regions' shapes, by their boxes, or by how many of each, and the rule of the shapes it used.</li>
    <li>A page's record of its sources gives the day it was built, and its records were tested by the rules of that day.</li>
    <li>It counts how each record was let in: inside a shape, by the buffer, by the coast reach, or on a small island.</li>
    <li>The page counts the records it discards. Where every record lies outside the range it says so, and where two or more do, that the range and the records disagree.</li>
    <li>The range has to be Kew's, with native status stated. A national checklist that only reports a plant present cannot tell a wild record from a garden one. For a name Kew does not carry, the page shows the records, says the range is unverified, and derives no marker, climate or sheet from them.</li>
    <li>Restricted-licence records (CC BY-NC) inform the marker and the climate like any other. Only openly licensed records are published, on the map, in the data, or as the marker itself.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Marker ─────────────────────────── -->
  <section aria-labelledby="marker">
  <h2 id="marker">The map marker</h2>
  <p class="sum">The marker is where the records are densest, and it decides nothing else. It sits on a real record where it can. The climate is not read at the marker.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the map marker</span></summary>
  <ul class="rules">
    <li>Records are binned at 1°. The bin with most neighbours wins if it holds at least half the records or twice the runner-up.</li>
    <li>If no bin dominates at 1°, the test repeats at 2° and 4°, and the densest 4° block stands when none dominates even there.</li>
    <li>Inside the winning cluster the densest 1° population is found again. The marker is the openly licensed record nearest its middle, so the pin is somewhere the plant has been seen.</li>
    <li>When no openly licensed record lies in the population, the marker is the centre of the tenth-of-a-degree cell that holds the population's middle (moved a hundredth of a degree north when a restricted record lies exactly there), so a restricted record's place is never published.</li>
    <li>The page says which kind of point it is.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Climate ─────────────────────────── -->
  <section aria-labelledby="climate">
  <h2 id="climate">The climate across the range</h2>
  <p class="sum">The habitat climate is read across all the well-placed wild records read, not at one point. Each place is counted once, however often it was visited. The page shows the middle year and the span the species is recorded in.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the climate across the range</span></summary>
  <ul class="rules">
    <li>A record counts for the climate when it is placed to within 10 km. With no stated accuracy, a person's observation with coordinates to three decimals counts, the way a phone records them.</li>
    <li>A herbarium sheet placed at a locality's centre with no figure, and every vaguer record, stays on the map and off the climate.</li>
    <li>Each record that counts names one 0.05° cell of the climate grid, and each distinct cell is read once. A site visited a hundred times is one cell of climate, not a hundred votes.</li>
    <li>A cell at sea or on ice is dropped and counted. Land is the grid's elevation layer, which averages only land, so a cell with no land has no elevation. The few basins whose whole cell lies below sea level read as sea.</li>
    <li>A cell the elevation layer reads as sea is read all the same where a native region's drawn shape or minor island lies in it: an island narrower than the layer's 60″ pixels, such as Lord Howe Island. Its climate is the cell's, with no elevation, so no height correction is made there, and the page's record says how many such cells it read.</li>
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
  </details>
  <h3 id="koppen">Climate class</h3>
  <p class="sum">The page gives the habitat's Köppen–Geiger class, worked out from the median year's months by the thresholds of Peel, Finlayson and McMahon (2007), each letter with the test that gave it.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: climate class</span></summary>
  <ul class="rules">
    <li>The thresholds are those of Table 1 of <a href="https://doi.org/10.5194/hess-11-1633-2007">Peel, Finlayson and McMahon (2007)</a>. The arid class B is tested first; summer is the warmer of October to March and April to September. Where both the dry-summer and the dry-winter test hold, the half with more rain is summer's rain, as the paper decides it.</li>
    <li>The months read are the median year, each month's median across the range's cells. The class is that year's, not each cell's.</li>
    <li>A warmest month of exactly 10 °C is on the paper's boundary between the polar class and the others, and the page gives no class there.</li>
    <li>The same section names the months Walter and Lieth's climate diagrams draw as arid: those whose rain in millimetres is under twice the mean temperature in °C.</li>
  </ul>
  </details>
  <h3 id="few">From few records</h3>
  <p class="sum">A climate read from fewer than 12 records, or fewer than 5 grid cells, is marked "from few records", with both counts. It is shown as read.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: from few records</span></summary>
  <ul class="rules">
    <li>Three agreeing records are enough for a narrow endemic.</li>
    <li>A habitat climate read from fewer than 12 records, or from fewer than 5 grid cells, is marked "from few records" on the page's figures and in its climate section, with the two counts written out, and shown as read.</li>
    <li>A page with few records shows where its typical cell is, beside the figures read there, and Kew's own words for where the plant grows, where Kew gives them. The page does not judge whether the spot lies in Kew's area: Kew's words name islands and districts no shape here draws. The Poor Knights lily's spot is in Auckland, among garden plants, and Kew's area is "New Zealand (Poor Knights Is., Hen I.)".</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Extremes ─────────────────────────── -->
  <section aria-labelledby="extremes">
  <h2 id="extremes">The extremes at a typical spot</h2>
  <p class="sum">Cold nights and hot days need one daily weather series, so they are read at one place in the range: a typical spot. They are corrected for height. Where the series and the habitat disagree by more than that correction can explain, they are set aside, and the page says why.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the extremes at a typical spot</span></summary>
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
  </details>
  <h3 id="set-aside">When extremes are set aside</h3>
  <p class="sum">The extremes are set aside when the weather cell stands too far above or below the spot, or when its nights are more than 1.5 °C warmer than the habitat's coldest month allows. The page says which, and keeps the figures in its record.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: when extremes are set aside</span></summary>
  <ul class="rules">
    <li>The extremes are set aside, and no cold floor is read from them, for one of three reasons. The page names the one that applies, in its own words, wherever it says they were not used.</li>
    <li>The ground is too far off: the weather cell stands more than 1,000 m above or below the typical spot, so its extremes are other terrain's.</li>
    <li>The record low is more than 1.5 °C warmer than the coldest month's mean nightly low across the range. At any one spot a record low is colder than any month's mean night, so the weather cell's nights and the habitat's months disagree.</li>
    <li>The 1-in-100 night is more than 1.5 °C warmer than that month's mean nightly low. Usually several of that month's nights fall below its mean, more than one in a hundred of the year's, so this is a check that the weather cell's nights and the habitat's months disagree.</li>
    <li>The margin of 1.5 °C is the height correction's own uncertainty. A gap within it is no disagreement, and the extremes are kept.</li><!-- decision 7; B2 -->
    <li>Neither of these two checks proves that either source is wrong. It says the two do not describe the same place well enough to put a cold floor beside the habitat's months. The figures set aside stay in the page's record of its sources, which says NASA POWER was read and its figures set aside.</li><!-- decision 7; B2 -->
  </ul>
  </details>
  <h3 id="hardiness">Hardiness of the habitat</h3>
  <p class="sum">From the typical spot's nights, the page works out the USDA hardiness zone and the RHS hardiness band of the habitat. They are the habitat's, read from where the plant grows wild, not a tested hardiness of the plant.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: hardiness of the habitat</span></summary>
  <ul class="rules">
    <li>USDA's zones are the 30-year mean of each year's lowest temperature, in 10 °F zones from −60 °F, each split into 5 °F halves, "a" the colder (<a href="https://planthardiness.ars.usda.gov/">USDA Plant Hardiness Zone Map</a>).</li>
    <li>The app takes the lowest night of each calendar year from NASA POWER's daily series at the typical spot, corrected for height as the record low is. A year counts only with 347 of its days. It averages the years, turns the mean into °F (× 9 ÷ 5 + 32), and names the zone it falls in. The mean is of the years the series holds, up to 44 from 1981 to 2024, not USDA's 1991 to 2020, and the page says how many. Fewer than 20 complete years give no zone.</li>
    <li>The RHS rates a plant H1a to H7 by the coldest it takes (<a href="https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating">RHS hardiness rating</a>). The page says which band the record low falls in. A figure on a band's edge is in the warmer band, but for 15.0 °C, which is H1b, since H1a is warmer than 15 °C.</li>
    <li>A page whose extremes are set aside shows neither.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Seasons ─────────────────────────── -->
  <section aria-labelledby="year">
  <h2 id="year">What the rules read</h2>
  <p class="sum">Two fixed rules read the middle year for seasons: one from the rain, one from the temperature. Every sentence they make is labelled as a reading. None of it says when the plant grows.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: what the rules read</span></summary>
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
  </details>
  <h3 id="shift">Your months</h3>
  <p class="sum">Habitat months are named with their hemisphere. The season card shifts them by six months for a collection in the other hemisphere.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: your months</span></summary>
  <ul class="rules">
    <li>Wherever habitat months are printed, the page names the hemisphere they belong to.</li>
    <li>Where the shift rule applies, it gives them shifted six months for a collection in the other hemisphere. The rule applies where the temperature curve moves 4 °C or more and the habitat lies 10° or more from the equator.</li>
    <li>So a Namaqualand plant whose rain falls in May to August has that season in a northern greenhouse from November to February.</li>
    <li>The label line and the sheet format a season through one function, so they cannot disagree.</li>
    <li>The season card at the top of a species page draws the same reading as twelve months in your calendar. The months the rule names are shaded, and months under 5 mm of rain are marked; nothing is shaded for a spread year or a year with nothing to read.</li>
    <li>Your hemisphere is your site's, else that of your first space with coordinates, else the northern, and the card says which.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Floor ─────────────────────────── -->
  <section aria-labelledby="floor">
  <h2 id="floor">The cold floor</h2>
  <p class="sum">The cold floor is the night only one in a hundred is colder than, at a typical spot in the range. It is a fact about a place, not a tested limit for a plant in a pot. Where it cannot be read, a monthly figure stands in, named as what it is.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the cold floor</span></summary>
  <ul class="rules">
    <li>The floor is the 1st-percentile night at a typical spot in the range, from NASA POWER.</li>
    <li>When no extremes are on file, no floor is read. That is when none were read, the source refused or was not asked, the weather cell is mostly sea, or they were set aside (<a href="#set-aside">above</a>).</li>
    <li>The coldest month's mean nightly low in the median year, from CHELSA, is shown in its place, named so. A line says it is not a floor, since a month's mean of its lows is warmer than the nights a floor is read from. A label prints no habitat night then.</li>
    <li>Nothing stands in for a floor: the care groups carry no figure.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Archetypes ─────────────────────────── -->
  <section aria-labelledby="archetypes">
  <h2 id="archetypes">Care groups</h2>
  <p class="sum">The app keeps a small table of care groups, such as "cactus or succulent". A page takes its group only where Kew's own description of the species agrees. The table gives no figure and no advice.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: care groups</span></summary>
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
  </details>
  </section>

  <!-- ─────────────────────────── The figures at the top ─────────────────────────── -->
  <section aria-labelledby="notes">
  <h2 id="notes">The figures at the top</h2>
  <p class="sum">The top of a species page states each habitat figure once, with its source beside it. The cards further down hold the full sentences and rules. A plant's own page puts the same figures beside the space it lives in, and gives no verdict.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the figures at the top</span></summary>
  <ul class="rules">
    <li>On a phone, "Habitat in short" sits above the photographs: the cold floor (or, when none is read, the coldest month's mean nightly low, named so), the rain a year, the open-sky light and the season, each with its source, and the few-records mark where it applies. The full cards stay below.</li>
    <li>The cold floor (1 night in 100), with the record low over the same years beside it, both at a typical spot, from NASA POWER. When no floor is read, the coldest month's mean nightly low, named so.</li>
    <li>The warmest month's mean daily high.</li>
    <li>The rain a year: the median of the range's grid cells' own yearly totals, and how many months of the median year bring 25 mm or more. Each cell's twelve months are added first, then the middle of those totals is taken, or the halfway point between the two middle totals when the cells are even in number.</li>
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
  </details>
  </section>

  <!-- ─────────────────────────── At home (round eighty-seven, stage 2) ─────────────────────────── -->
  <section aria-labelledby="at-home">
  <h2 id="at-home">At home, aim for</h2>
  <p class="sum">A species page with a habitat climate gives a starting point for growing it: winter nights, summer days, grow light and humidity, each worked out from the page's own figures with its arithmetic beside it. It is not tested in cultivation.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: at home, aim for</span></summary>
  <ul class="rules">
    <li>Winter nights: the coldest month's mean nightly low, from the 10th to the 90th percentile across the range's cells, with the record low where the page shows one.</li>
    <li>Summer days: the warmest month's mean daily high, the same way.</li>
    <li>Grow light: the light that gives the year's mean daily light integral (DLI) in 14 hours, or 12 or 16 as the reader chooses: PPFD = DLI × 1,000,000 ÷ (hours × 3,600). The DLI is the open sky's; a plant among rocks or shrubs gets less.</li>
    <li>Humidity: the lowest and highest of the twelve monthly relative humidities, only where the habitat figures hold one for every month. Otherwise the page says none is worked out.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Related ─────────────────────────── -->
  <section aria-labelledby="related">
  <h2 id="related">Similar habitat climate</h2>
  <p class="sum">Near the foot of a species page, Related lists up to six species whose habitat climate is nearest. It compares climates month by month, and nothing else. Two plants from alike climates can still want different things in a pot.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: similar habitat climate</span></summary>
  <ul class="rules">
    <li>The distance is one number: the root of the mean squared difference, month by month, in mean daily high and mean nightly low, plus the difference in rain on a log scale.</li>
    <li>The rain is taken as each month's rain plus 1 mm, so a month with none can be compared, and weighted so that a factor of 2.7 in that figure counts as three degrees: in a month of 100 mm against one of 270 mm, three degrees; in a month of 1 mm against one of 2.7 mm, under two.</li>
    <li>Months are compared in calendar order, so a habitat with the same seasons six months apart is far, not near. On a bench in one hemisphere, two such plants want opposite halves of the year.</li>
    <li>Range, family and photographs do not enter. The list is computed once when the index is built, from the same figures the pages show, and the page says which figures were compared.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Corpus ─────────────────────────── -->
  <section aria-labelledby="corpus">
  <h2 id="corpus">How the reference is stored</h2>
  <p class="sum">The reference is built on a PC and uploaded as files: one per species page, and small files the server reads instead of the whole index. Each file is named by a hash of its content. So no cache can mix two versions, and a refresh uploads only what changed.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: how the reference is stored</span></summary>
  <ul class="rules">
    <li>Beside the species files, the build works out once what the server would otherwise work out for every request: the index, each hash group's entries and figure sheets, the search's files, and the catalogue's rows for each grouping and chip.</li>
    <li>The index carries each page's record low (<code>low</code>, °C to one decimal, where the page shows one) and the day it was first seen (<code>first</code>). A page's record keeps no first build of its own, so the first day is the earliest day the record still notes, or the day an earlier index gave. For the pages of the reference in November 2026 it is no earlier than the page's first build, and can be later: every day a record notes is a build's or a later reading's.</li>
    <li>The rows under "Popular genera" are worked out by the server from the genus rows' files and the counts' file, once for each reference.</li>
    <li>It writes the files every other name is looked up in. Each page's address, with what a page needs of each species (its tile, its older names, its nearest climates), sits in small files split by a hash of the address. Each other name the reference answers to sits in files of its own.</li>
    <li>It writes the genera with their counts, the front page's photographed species, the browse pages' table with the counts the front page shows of it, and the sitemap's addresses.</li>
    <li>A manifest names every current file by its hash, and the server reads it first. A manifest whose files are not all there is not adopted, nor one whose genera do not count its species.</li>
    <li>The reference's id is a hash of every file's hash, so the same build is the same id.</li>
    <li>A species page, the front page, a species' data file, the sitemap and the search read only the few small files they need. The server never reads or holds the whole index.</li>
    <li>The search's files hold, for each one-, two- or three-letter beginning of a word of a species' names, family and regions, every species with a word so begun, and only what the order reads of it. So a new photograph rewrites none of them.</li>
    <li>A beginning shared by more than 200 species has files one letter longer too. A beginning shared by more than 2,000 species has no file of its own, but the reference's own best hundred answers to that word alone, and how many species match it.</li>
    <li>A second set holds the beginnings with one letter taken out, for similar spellings. Another holds, for each genus of Kew's older names, the species holding one of them.</li>
    <li>A query reads the file of its least common word and those species' photograph counts (kept apart, 4,096 to a file), and puts them in order by the rules above, so its answer is the one the whole index would give. Only then does it read the matches' own entries, from files of 16 species each.</li>
    <li>The build reads each Commons photograph's title against every name the reference holds, and stores the verdict with the photograph. So the server shows a page's photographs without holding those names.</li>
    <li>A species page's id is Kew's: <code>k</code> and the plant_name_id of the taxon Kew accepts for the page, where that taxon is the page's alone. Otherwise it is <code>g</code> and the page's GBIF Backbone key.</li>
    <li>A page whose Kew rows do not decide which taxon it is keeps its GBIF key. So do two pages Kew accepts as one taxon (which is Kew's is not guessed; merging them decides it), and a page merged into another.</li>
    <li>The id is worked out again each time the reference is built. A page's address is its name, not its id, so neither an address nor a link moves when an id does.</li>
    <li>A plant you record keeps the GBIF key the name service or the picker gave it. The reference's files hold each page's GBIF key beside its id, so a plant, an older name and a GBIF key in an address all find their page.</li>
    <li>The sitemap dates each species page by the day its data last changed in what the page shows, so a refresh that changes nothing does not move it. A genus row takes the latest of its species' days.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Collection ─────────────────────────── -->
  <section aria-labelledby="collection">
  <h2 id="collection">Your collection</h2>
  <p class="sum">Everything you record stays in this browser, as a log of changes. Two copies of a collection merge by one rule, so a restore or a sync loses nothing. Sync encrypts on the device with a key only you hold.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: your collection</span></summary>
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
    <li>A plant number is at most 32 characters, with no more than 15 digits in a row. An import keeps a longer one in the plant's notes and gives the next free number.</li>
    <li>When you add a plant, start a batch or change a plant's name, the reference's own key for a name it heads is filed, whichever answer came first. One press of Add adds one plant.</li>
    <li>A pasted list knows a plant it added before by its line's words alone. Such lines are left out and said; one press adds them as new plants.</li>
    <!-- Round eighty-seven (t1): identity and provenance (src/lib/core/identity.ts). -->
    <li id="items">An offset, division or bulb split can be split off a plant as an item of its accession: a plant of its own under the accession's number and the next free letter, 2026-0012/A, then /B. A letter is never given twice.</li>
    <li>Renumber on an item gives it the accession's next free letter. A plant renumbered, or brought back under a new number, takes its items to that number, each with a line. An item an older version renumbered to a bare number is a plant of its own.</li>
    <li>An import links a plant numbered as an item to the line in the sheet that holds its accession's number. With no such line, it links it to your plant of that number only when the two have the same name, and otherwise adds it as a plant of its own and says why.</li>
    <li>The plants of one accession share their name, identification and provenance, so a change to one is saved on each. Each keeps its own space, log and photographs.</li>
    <li id="no-longer-held">A plant you no longer have is recorded as no longer held, with a reason (died, given away, lost, propagation failed, stolen, reaccessioned), a day and a note. Nothing is deleted: its page stays, with Restore, and it is listed under No longer held.</li>
    <li>A plant marked growing is held, whatever reason an older version left on it, and its next edit clears that reason.</li>
    <li>Recording a death records the plant as no longer held, died, on the death's day. Remove is for a record made by mistake, and a removed plant is listed under No longer held too, with Restore.</li>
    <li id="itf2">Provenance can be given in the codes of ITF2, the International Transfer Format botanic gardens use: the provenance type (W, Z, G or U) and the propagation history. Where your own provenance word means the same in ITF2, the plant's page shows that code and says it was read from the word.</li>
    <li>Wild-collected and F1 are read as W; cultivated seed and vegetative, which ITF2 splits into Z and G, are not read as a type. A pair of codes ITF2 does not allow together, or a code your provenance word contradicts, is refused with the reason.</li>
    <li id="field-numbers">A field number is kept as typed, and read as the collector's code and number where it reads as one: SB 829 is SB and 829, KK1398 is KK and 1398.</li>
    <li>A change of name keeps the name the plant had, the day it stopped and how it had been identified, under Earlier names. A qualifier in the name (cf., aff., nr.) is shown with what it means; sp. names the genus only.</li>
    <li>A rename whose line ("Renamed from … to …") is in the plant's log but whose earlier name is not under Earlier names, as an older version wrote it, is shown there from the line, dated by it, and kept by the plant's next edit.</li>
    <li>The plants sheet carries all of these, under ITF2's column names where ITF2 has a field (prot, prohis, cnam, cid, cdat, idql, vlev, vnam, vdat, vhist), and the import reads them back.</li>
    <li>The <a href="/about/formats">formats page</a> has the details.</li>
  </ul>
  </details>

  <h3 id="season">A plant's growing season</h3>
  <p class="sum">A plant can be a winter-grower, a summer-grower, or have no rest, with the months it rests. In those months Today does not count it as due, and says it is resting and why.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: a plant's growing season</span></summary>
  <ul class="rules">
    <li>A plant's page suggests a season from its species page's reading of the habitat (<a href="#year">what the rules read</a>), says it is a suggestion, and names the rule that made it. Nothing is written until you confirm it or set your own.</li>
    <li>The rain rule's winter or summer growing season suggests that season, resting in every month outside the rainy months, shifted to your hemisphere as the season card shifts them.</li>
    <li>Under 120 mm of rain a year, the temperature rule's cooler six months suggest a winter-grower resting in the other six. Rain spread over eight months or more suggests no rest.</li>
    <li>A rainy season at the year's mean temperature, a flat temperature curve, a wet season with nights below freezing, or no season at all suggests nothing; nor does a hybrid, which has no one habitat.</li>
    <li>A suggestion reads the habitat's rain and temperature, not the plant. You can change its months, and set a season on any plant.</li>
    <li>In a plant's rest months Today lists it under its space as resting, with no Water button, in one line that says the season, the months, and whether you confirmed it from the habitat or set it yourself.</li>
    <li>A plant's rest months add to its space's dry months: a plant with no rest, in a space kept dry in winter, is kept dry there.</li>
    <li>A plant with a season set is not listed apart in its habitat's dry season; its own months decide. The watering calendar leaves its rest months out too.</li>
  </ul>
  </details>

  <h3 id="attachments">Papers kept with a plant</h3>
  <p class="sum">A plant's page keeps its papers (a CITES permit or certificate, a phytosanitary certificate, an invoice) as a PDF, JPEG or PNG of up to 10 MB, synced and backed up as its photographs are.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: papers kept with a plant</span></summary>
  <ul class="rules">
    <li>A file is taken by its own first bytes, never by its name: a PDF, a JPEG or a PNG, up to 10 MB, and thirty a plant.</li>
    <li>It is kept in this browser as a photograph is, not encrypted on the device. With sync on it goes into the vault sealed on the device, and the device that receives it checks its hash.</li>
    <li>Open shows it in a new tab from the file on this device; Download saves it under its own name. A paper whose file has not yet come from the device that added it says so.</li>
    <li>A backup holds each paper's file and a restore puts it back. A version of the app made before papers keeps one as a record waiting for fields, syncs and backs up its file, and never shows it as a photograph.</li>
    <li>A collection's papers hold at most 300 MB in all, so the sync vault keeps room for photographs and the log, and a backup with every paper still opens on a phone. The Backup page shows how much the papers hold, warns from 240 MB, and a paper that would pass 300 MB is refused with a sentence saying so.</li>
  </ul>
  </details>

  <h3 id="labels">Labels</h3>
  <p class="sum">Labels print on Avery sheets, on strips to cut, or on label tape 12, 18 or 24 mm wide. Each label's QR code carries the plant's number and identity tag.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: labels</span></summary>
  <ul class="rules">
    <li>The code is the plant's address by its number, such as /plants/2026-0012, and after a # the plant's tag, six letters and digits made from its identity: /plants/2026-0012#i=k3x9q2. A sheet label's code adds the species and the name after the tag. What follows the # stays on the phone.</li>
    <li>The plant's page finds the plant by that number in the collection on this device, so it opens with no network, as the rest of your collection does. Any phone's camera shows the number in the address it reads.</li>
    <li>A number can change hands: two devices gave it out offline and one plant was renumbered, a plant brought back took a new number, or a plant came from another collection with its label. So the page opens the plant holding the number only when the code's tag is that plant's.</li>
    <li>When the tag is another plant's on this device, the page says the label was printed for a plant numbered otherwise now, lists that plant and the one holding the number, and opens neither.</li>
    <li>When no plant on this device has the tag, the page says the label names a plant this collection does not hold under that identity. It lists your plant with that number, if there is one, and offers the label's species, as it does for a label from a plant you do not have.</li>
    <li>A code printed by an earlier version carries the plant's identity, and still opens it. An address with a number and no tag opens the plant holding it, unless a renumbering moved another plant off that number: then it lists both.</li>
    <li>Label tape prints one label a page, 50, 60 or 70 mm long, the code and the text 1.5, 2 or 3 mm clear of each edge of the tape. Choose the tape printer in the print dialog, set its tape, and print at 100%.</li>
    <li>On 12 mm tape the code is 9 mm across, and is drawn with error correction L, which reads with up to 7% of it damaged: that keeps it 29 squares a side with the tag, each about 0.31 mm. The other stocks' codes use M, which reads with up to 15% damaged.</li>
    <li>A backup label is a second label for each plant with the number alone, as large as the label holds, for the back or the bottom of the pot.</li>
    <li>The large number prints the number at 14 points on a sheet label (9 on the pot-rim stock), or over a third of the tape's width, with the name on one line.</li>
    <li>A label's code and its care line have their room from the start, so nothing on the sheet moves as they arrive.</li>
  </ul>
  </details>

  <h3 id="exports">The plants sheet and the report</h3>
  <p class="sum">My plants downloads the plants as a spreadsheet, one column a field, and prints a collection report with photographs.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the plants sheet and the report</span></summary>
  <ul class="rules">
    <li>The sheet is the backup's plants.csv. After the columns it has always had come the GBIF key, the plant's own watering rhythm and the page its name is an older name of. Then its identity and provenance, the plant it was taken from and how, its season, rest months and where the season came from, its number of photographs and its papers, then its id.</li>
    <li>The log's bookkeeping (a notes edit's base, an import's key, the cover's id) is left out; the whole log is in the backup. An import of the sheet reads back the columns it always has, the identity and provenance, and the plant it was taken from. It names the others apart.</li>
    <li>The report lists each growing plant, or every plant, by number, with its cover photograph, name, provenance, source, space, season and papers, and its price and notes if you choose. It is made on this device and printed, or saved as a PDF, from the print dialog.</li>
    <li>Prices are totalled by currency as written, never converted.</li>
  </ul>
  </details>

  <h3 id="lock">The app lock</h3>
  <p class="sum">Settings can set a passcode this device asks for before it shows the app. It is a screen over the app, not encryption: it keeps out a casual look, not someone who can read the browser's storage.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: the app lock</span></summary>
  <ul class="rules">
    <li>The collection, its photographs and papers, and the sync key are kept in this browser's storage as they are. Sync encrypts what it sends; nothing is encrypted on the device.</li>
    <li>So anyone who can read the browser's storage, through its developer tools, the device's files or a copy of them, can read the collection with or without the passcode.</li>
    <li>The passcode is kept on this device only, as a salted PBKDF2-SHA-256 hash of 600,000 rounds. It is never synced and never in a backup, so each device has its own or none.</li>
    <li>Someone who can read the browser's storage can try passcodes against that hash as fast as their computer allows, and finds a short passcode that way. The hash keeps only a long passcode from being read off the device.</li>
    <li>It asks when the app opens in a new tab or window, and again once the app has been out of sight for the time set: at once, or after 1, 5 or 15 minutes. A reload of an unlocked tab stays unlocked.</li>
    <li>After five wrong passcodes it waits 30 seconds. The count and the wait are kept in this browser's storage, so a reload, another tab or a new window does not start them again. The about pages are never behind it.</li>
    <li>While it is locked, the tab is titled "Locked · Cultifolio", not by the page under it.</li>
    <li>If you forget the passcode, this device's sync key opens the app, and so does a backup file of this collection, read on the device and not restored. Either takes the passcode off, to be set again in Settings. The lock screen says which of the two this device has.</li>
    <li>Stopping sync on a locked device says first that the key is a way back, and offers to take the lock off or make a backup. The device keeps a SHA-256 hash of the key it synced with beside the lock, so that key still opens it.</li>
    <li>So it can be set only while sync is on or after a backup made in the last day. With neither the key nor a file, clearing the site's data in the browser takes the lock off, and the collection on this device with it.</li>
    <li>The example collection has no lock.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Lineage, batches and flowering (round eighty-seven, stage 3, t2) ─────────────────────────── -->
  <section aria-labelledby="lineage">
  <h2 id="lineage">Lineage, batches and flowering</h2>
  <p class="sum">A plant's parents and offspring, a batch's counts and the flowerings are read from what you record, never from a photograph.</p>
  <details class="full in-full"><summary>The rules in full<span class="sr">: lineage, batches and flowering</span></summary>
  <ul class="rules">
    <li>A cross is a Pollinated line on the seed parent, with the pollen parent chosen from your plants, and is written seed parent first: 2026-0001 × 2026-0002. A batch can be sown from it, and the plants potted up from that batch list both parents.</li>
    <li>A batch sown from a cross is filed under the seed parent's species name. The cross is said beside the name, never in its place; a parentage you write yourself stays yours.</li>
    <li>A graft is a Grafted line on the grafted plant, naming the plants its scion and its stock came from, either of which may be none of yours. A graft batch keeps the stock's plant beside the scion's.</li>
    <li>A plant added as an offset, a cutting, a division, a leaf or a bulbil of one of yours keeps a link to it, as a plant potted up from a batch of cuttings does through the batch.</li>
    <li>A plant's page shows its parents and its offspring, one step each way, as links. A parent or a child that is dead, archived or removed is still shown and linked, and one this device holds no record of is said as that.</li>
    <li>A batch's page lists each count as a checkpoint: what had come up or struck by then, what had been potted up and lost by that day, what was alive in the pot, and its share of what went in. Its losses are grouped by the cause you wrote, and a loss with none is said as not stated.</li>
    <li>Pot up splits a batch into plants, each with its own number and its batch.</li>
    <li>Fruit set and seed set are dated lines on a plant, as a flowering is.</li>
    <li>Today's "Flowered this week in past years" lists your plants with a Flowered line in an earlier year whose day and month fall within three days of today's. A line of 29 February counts as the 28th in a year without one. Dead plants are left out.</li>
    <li>The flowering calendar, under My plants, shows which plants flowered in which month, from their Flowered lines, every year together, with the number of years in each month. The species page's flowering by month is from wild records, and is another thing.</li>
    <li>The photo walk, under My plants, adds a room of plants one photograph at a time: take a photograph, name the plant, next. Each becomes a plant with its photograph, in the space chosen at the top.</li>
    <li>The name is the one you type, checked against the reference as the add form checks it. The photograph is resized and kept on this device as every photograph is, and is sent nowhere to be identified.</li>
  </ul>
  </details>
  </section>

  <!-- ─────────────────────────── Browse, with your collection (round eighty-seven, stage 2) ─────────────────────────── -->
  <section aria-labelledby="browse-own">
  <h2 id="browse-own">Browse, with your collection</h2>
  <p class="sum">The browse pages are the same for everyone. Pins and the collection lens are worked out in your browser from your own collection.</p>
  <ul class="plain">
    <li>A browse view can be pinned: its filters (regions, family, genus and the rest), not its order or its page. A pin is kept in your collection, so it syncs and is backed up with it; the pin itself goes nowhere else; its view is asked of the site as opening it would be.</li>
    <li>A pin keeps the page ids of the view's species as they were when it was pinned, or when its changes were last opened. Your front page and the empty search box show each pin, and "+3 · −1 since 12 Nov" is the species the reference has added to the view and taken from it since then.</li>
    <li>A view of more than 3,000 species keeps no such list, and its pin says it is too many to follow for changes.</li>
    <li>A pin of a region the reference no longer holds says so, by the region's code, and opens the rest of its view, which it does not follow for changes.</li>
    <li>Opening a pin from the front page or the search box opens its changes, each species by name; one taken from the view that the reference no longer holds is counted, not named. From then on the pin counts from the view's species of that day. That it was opened from a pin is carried by the move itself, never in the address or the browser's storage.</li>
    <li>At most fifty views are pinned; past that, Pin says so.</li>
    <li>On a region's, a genus's or a family's page, a collection with a growing plant shows which of the page's species you grow now and which of your plants belong there. Your plants are matched in this browser against the reference's entries for their species, asked by hash group. Yours and Not yours filter the page's results in this tab; neither is in the address or in any request.</li>
    <li>A plant filed under another page's name counts as that page's. A plant filed under its genus alone counts on its genus's page only.</li>
    <li>The map picker draws every TDWG level-3 region on the world map from this site's own files, and ticks a region by a press on it, by its keyboard, as the picker says, or by its list. Its files are fetched when it is opened.</li>
    <li>The results map shows how many of a view's species are native to each region, in steps its legend names. A region the view is filtered by holds every result and is drawn apart. Its files are fetched when the map is near the screen, and once the page is idle, so a printed page holds it.</li>
    <li>A region's page names the regions next door: those whose outlines in the shapes file touch it, a corner of one within 0.022 degrees (about 2.4 km) of the other's outline, minor islands left out. Three regions have no outline there (Cocos (Keeling) Is., Christmas I., the South China Sea), and their pages say none was worked out.</li>
    <li>The list's record low is the index's: the lowest night in NASA POWER's daily series at the habitat's typical spot, as the species page gives it. An index built without it says "not in this index" and offers no order by it.</li>
    <li>Names on the browse pages are in one alphabet, English at base strength: accents and case are not differences, Æ is read as Ae, and numbers as numbers.</li>
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
    <li id="bcss">A plant page's "Look up at BCSS Field Number Database" sends that plant's field number to the British Cactus and Succulent Society's database only when you press it. It opens in a new tab, without this page's address. The page never asks BCSS anything by itself.</li>
    <li>The frost watch sends the coordinates of your site and of any space that has them, rounded to about a kilometre, with an altitude if one is set, and your units. This server asks the weather services.</li>
    <li>Frost shows on Today, and in a line under the top bar on every page when a frost is within the next 72 hours, or a night below the floor of one of your spaces. It is red only at or below freezing, and dated. No notification is sent, since that would mean the server keeping a push address and a location for each device.</li>
    <li>A search typed in the catalogue or on the compare page goes to the server. A search of your own plants stays on the device.</li>
    <li>The species picker sends the name you are typing to the server twice. Once as typed, to the catalogue's search, which the server answers from the reference's own files. Once as its species part alone (the genus as typed and the epithet in lower case) to the name service, which the server passes on to GBIF.</li>
    <li>The species part never holds a qualifier, a rank and what follows it, a cultivar, an author or a field number. When the species is not found and the name is a genus followed by capitalised words, the genus alone is asked too.</li>
    <li>The names in a list you import are checked by hash group, then by the catalogue's search, never by GBIF's name service.</li>
    <li>The about pages ask this site once for the reference's counts (<code>/api/counts</code>), which carries nothing of yours. The not-found page asks once for the species of the day (<code>/about/data/today</code>), which carries nothing of yours either; under a species address or the address of a page of your own collection it asks nothing.</li>
    <li>A browse page's own requests (<code>/browse/data</code>) carry the view's query alone: its count as you tick regions on the map, its regions' counts, its species for a pin. A pin's changes are asked with that pin's query, one request a pin shown, as opening the view would. Nothing of your plants is sent, and the collection lens asks only by hash group.</li>
    <li>Two small cookies: your units (<code>cultifolio.units</code>), and once a site is set, its hemisphere (<code>cultifolio.hemi</code>).</li>
    <li>The app's service worker keeps the app on the device for use without a signal. It is installed from the second page this device opens on the site, or at once on a page of your own collection, or as soon as the device holds a collection (<a href="#on-device">in full below</a>).</li>
    <li>A visit of one page of the reference installs nothing, and nothing is fetched for offline use.</li>
    <li>The server keeps short-lived rate counters by address, dropped within two days, and nothing about your plants.</li>
    <li>Public answers are kept for a while by Cloudflare's edge, linked to no address, and the server keeps its own copies under keys that name the app's version, so a new version is never answered from an old one's copies.</li>
    <li>The edge keeps no copy of an error or of a redirect to another page: an address the reference does not hold is answered "not found" anew each time. The server keeps GBIF's answer on whether it is an older name for a day, and your browser may keep the page for five minutes, not when GBIF could not be asked. An older name's redirect to its species is made anew each time too, your browser keeping it for a day.</li>
    <li>Species pages, the front page, the browse pages (<code>/browse</code> and the pages of a region, a genus and a family), the compare page and the not-found page load photographs from iNaturalist (two hosts), Wikimedia Commons and GBIF's image cache, which see your address. Your own pages do not, unless you switch that on.</li>
  </ul>

  <details class="full" id="on-device"><summary>Full detail: the app kept on the device</summary>
  <ul class="rules">
    <li>The service worker is installed from the second page this device opens on the site: a page loaded in full, a reload, or a move inside the app to another address.</li>
    <li>It is installed at once on a page of your own collection (My plants, My spaces, Propagation, Today, Sync, Labels or Backup, an import among them), or as soon as the device holds a collection: a plant added, a species followed, a view pinned, a backup restored, sync set up.</li>
    <li>The install fetches, once, the app's own files that the pages working offline use: the scripts, styles and typefaces of the collection's pages, the front page and the offline page, the species page's styles, the tab's icon, the web manifest and the maps' two coastlines. It fetches the collection's pages, the offline page and the front page too.</li>
    <li>The app's other files (a species page's scripts, the maps, the large icons and the share image other sites show beside a link) are kept the first time a page asks for them.</li>
    <li>So a species page opened online, by its address or by a link inside the app, is readable offline after. When the app updates itself, it reads the last fifty species pages you opened again from the server, one request each, and each of their maps' files it does not already keep, so they stay readable offline, with their maps, in the new version. A species page read online also hands the worker its maps' files to keep. Its maps are drawn when you scroll near them, or once the lead photograph has loaded and the browser is idle, whichever comes first, so a page printed without scrolling holds them.</li>
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
    <li>The hash group of the species a scanned plant label names, when this device holds no plant of that label, or holds its number under another name. So the page can show that species, as a plant page asks for its own; the species is never sent by name.</li>
    <li>The text you type into the catalogue's search on the front page, the search box at the top of every page, or the search on the compare page. The server answers it from the reference's files (<code>/api/search</code>, and for the box's rows of genera, families, countries and regions, and of a genus or family in a region or country, <code>/api/suggest</code>), and it is the same thing a page you then open already shows.</li>
    <li>A browse view's query, to <code>/browse/data</code>, from the map picker (how many species the regions ticked give, and each region's count), from a pin (the view's species now, to count what changed), and for the names of the species a pin gained or lost (their page ids). The answer is the same for anyone who asks it.</li>
    <li>Not your plants, on a region's, a genus's or a family's page: the collection lens asks for their species by hash group only, as a plant's page does.</li>
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
    <li>Your browser does talk to outside image hosts on species pages, the front page, the browse pages (<code>/browse</code>, <code>/region/…</code>, <code>/genus/…</code> and <code>/family/…</code>), the compare page and the not-found page. They are iNaturalist's image hosts (inaturalist-open-data.s3.amazonaws.com and static.inaturalist.org), Wikimedia Commons (upload.wikimedia.org) and GBIF's image cache (api.gbif.org). Each sees your address, like any image host.</li>
    <li>Commons is asked at its 120-, 250-, 500- and 960-pixel sizes, or at a file's own size when it is narrower. A photograph that reached GBIF from another dataset is shown from GBIF's cache, not from that dataset's own server.</li>
    <li>The species picker's species part goes to this site's <code>/api/names</code>, which asks api.gbif.org from the server. So that host sees the server's address, not yours.</li>
    <li>The server waits eight seconds for GBIF's name service, and the picker ten seconds for the server. A name not answered by then is said as not checked, and the reference's own search, which the picker waits for apart, is not held up by it.</li>
    <li>The frost watch asks MET Norway (api.met.no) and, in the US and its territories (Puerto Rico, the US Virgin Islands, Guam, the Northern Mariana Islands and American Samoa, and all of Alaska, the Aleutians, St Lawrence Island and the Pribilofs included), the National Weather Service (api.weather.gov), from the server, never from your browser.</li>
    <li>The National Weather Service's are the only weather alerts read, so a place it does not cover says its forecast is clear, never "All clear.".</li>
    <li>A name the reference does not answer to is asked of GBIF (api.gbif.org) from the server too.</li>
    <li>Those three are the only hosts the server asks. Your browser asks no host but this site and the four image hosts. "Use my location" asks the browser for its position; how the browser finds it is the browser's own.</li>
    <li>One host is Cloudflare's own, not this site's choice. Cloudflare, which serves the site, adds two headers of its network error logging to every answer (<code>Report-To</code> and <code>NEL</code>), while that setting of Cloudflare's is on for the site, as it was when last checked, on 5 November 2026.</li>
    <li>A browser that honours them (Chrome, Edge and other Chromium browsers) then reports to <code>a.nel.cloudflare.com</code>, from your address and for a week, any request to this site that fails, naming the address that failed. The site's code cannot remove these headers; the setting is the owner's to turn off.</li>
    <li>The site's three typefaces are Adobe's Source Sans 3 for the text, Source Serif 4 italic for the scientific names and Source Code Pro for identifiers such as a plant's number, under the SIL Open Font Licence, and are among the site's own files. Until they arrive, a page is set in faces the device already has, each scaled to the same average width, so the text hardly moves when they land: Segoe UI, Georgia and Consolas on Windows; Helvetica Neue, Georgia and Menlo on Apple devices; Roboto and Noto Serif on Android; Liberation and DejaVu on Linux.</li>
  </ul>
  </details>

  <details class="full"><summary>Full detail: what the server keeps</summary>
  <ul class="rules">
    <li>The one thing the server keeps about a visitor is short-lived rate counters keyed by address: an IPv4 address or an IPv6 /64.</li>
    <li>For vault creation, sync, searches, reference reads and the requests that call another service, the /48 around an IPv6 address is counted too. For the calls to other services, the index and sync, so is an IPv4 address's /24.</li>
    <li>Pages rendered with no copy kept are counted per address under one allowance: 1,200 per ten minutes, and four times that for an IPv6 /48. They are Compare, a species page or the front page the server cannot keep a copy of (one reached by an older name, a move inside the app, a HEAD), every browse page (<code>/browse</code>, <code>/region</code>, <code>/genus</code>, <code>/family</code> and the pages under them) and a browse page's own requests (<code>/browse/data</code>). A browse page's address with a query it does not read, or spelt another way, is moved to its one spelling first.</li>
    <li>A browse view's CSV is counted with the whole index: six per ten minutes for one address, and four times that for its IPv4 /24 or IPv6 /48. Its file of columns and sources is counted as a page.</li>
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
    <li><code>cultifolio.corpus</code>: the reference's version last seen. <code>cultifolio.labels</code>: the label sheet's choices. <code>cultifolio.report</code>: the collection report's choices.</li>
    <li><code>cultifolio.lock</code>: the app lock's passcode, as a salted hash, and how long the app may be out of sight before it asks again; and, once this device stopped syncing while locked, a SHA-256 hash of the sync key it synced with, made with the prefix <code>cultifolio-lock-key:</code>, so that key still opens the lock.</li>
    <li><code>cultifolio.lock.tries</code>: how many wrong passcodes in a row, and until when the lock screen waits after five, so a reload or another tab does not start them again.</li>
    <li><code>cultifolio.lastLocation</code> and <code>cultifolio.lastSowLocation</code>: the space last used on the Add and sowing forms. <code>cultifolio.countMode</code>: how a batch page last took its counts.</li>
    <li><code>cultifolio.visits</code>, <code>cultifolio.lastVisit</code> and <code>cultifolio.installSnoozedUntil</code>: when to offer installing the app.</li>
    <li><code>cultifolio.views</code>: 1 or 2, whether this device has opened a page of the site before, so the service worker is installed from the second.</li>
    <li><code>cultifolio.recentSearches</code>: the last eight searches you opened from the search box at the top of every page (the words typed, the row's name and its address), shown when the box is empty and forgotten by its "Clear recent searches". Never sent.</li>
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
    <li><code>cultifolio.unlocked</code>: that the app lock was opened in this tab, and when the app went out of sight, so a reload stays unlocked and the time set is counted.</li>
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
    <li>The reference's counts and its whole index: for five minutes, as their answers say. The check run after every deploy and upload asks for both until Cloudflare's edge answers from its copy, and fails unless that copy says five minutes too.</li>
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
    <dt>Cross</dt><dd>A pollination you recorded between two of your plants, seed parent first, and the seed it gave.</dd>
    <dt>Checkpoint</dt><dd>A batch's count on a day, with what was alive in the pot that day.</dd>
    <dt>Space</dt><dd>A room, bench, shelf or tray, nested, with the conditions a plant inherits from it.</dd>
    <dt>Vault</dt><dd>The encrypted copy of your collection on this site's server, which sync keeps. It holds sealed bundles of changes and photographs the server cannot read.</dd>
    <dt>Sync key</dt><dd>The thirty symbols that encrypt the vault and let a second device join it. There is no account behind it and no recovery.</dd>
    <dt>Sync bundle</dt><dd>A sealed bundle of changes one device sends, as the sync page names it; the formats page calls it a log batch. Also the unit a device keeps whole when it cannot read one.</dd>
    <dt>Reading the log</dt><dd>Applying every change in the log in order to get the collection you see; the formats page calls it folding. A change is folded when it is applied.</dd>
    <dt>Could not be read here</dt><dd>A sync bundle this version of the app could not read, usually from a newer version, kept whole on the sync page for a later version. Nothing in it is lost.</dd>
    <dt>Waiting</dt><dd>A record on this device that lacks a field this version requires (a name, a status), usually because its bundle could not be read here. It is kept, not shown, and completes when the field arrives.</dd>
    <dt>Not checked</dt><dd>A source that did not answer when a page was built: it refused or failed. Not the same as a source that answered "none".</dd>
    <dt>Not asked</dt><dd>A source the build did not ask, such as GBIF's records for a page with no GBIF key, or a call this site held back because its calls were used up for the minute. Not "none" either.</dd>
    <dt>Pending</dt><dd>The habitat climate has not been derived yet; not a refusal.</dd>
    <dt>Held</dt><dd>A change dated more than five minutes ahead of this device's clock, kept out of the collection until the clock reaches it.</dd>
    <dt>Parked</dt><dd>A change from a clock that was badly wrong (stamped more than two days past the arrival of its bundle), kept in the log but counted only if you apply it, on every device alike.</dd>
    <dt>Not reached</dt><dd>This site could not be reached from the device just now. Not the same as "not in the reference".</dd>
    <dt>Backbone</dt><dd>GBIF's list of names, each with a number (its key), last built on 28 August 2023. GBIF now files its records under the Catalogue of Life too; this site reads them by the backbone's keys.</dd>
    <dt>Epithet</dt><dd>The second word of a species' name: "vera" in Aloe vera. A subspecies or variety has one of its own after its rank word.</dd>
    <dt>Basionym</dt><dd>The name a species was first published under, whose epithet a later name keeps: Echinocactus hamatacanthus is the basionym of Ferocactus hamatacanthus.</dd>
    <dt>Homotypic</dt><dd>Of two names: resting on one type specimen, so one plant by definition, as a basionym and every name moved from it are. A heterotypic synonym rests on another type: a botanist's judgement that two plants are one.</dd>
    <dt>Autonym</dt><dd>The name a species' own subspecies or variety takes when another is named, repeating the species' epithet: Stapelia hirsuta var. hirsuta. It has no author of its own.</dd>
    <dt>Pro parte</dt><dd>"In part": a synonym that stands for only part of a species. Its records are no one species', so they are not read.</dd>
    <dt>Buffer</dt><dd>How far beyond a region's drawn edge a record still counts for it: 0.05°, about 5.6 km, the drawing's own accuracy. Only for a record in no region's shape that states that region's country.</dd>
    <dt>Coast reach</dt><dd>How far off a drawn coast a record at sea, or on an islet too small to draw, still counts for the region whose coast is nearest: 0.15°, about 16.7 km. Only for a record that states that region's country.</dd>
    <dt>KV</dt><dd>Cloudflare's key-value store, in which the server keeps its short-lived counters and some copies.</dd>
    <dt>/24, /48, /64</dt><dd>A block of internet addresses that share their first part. An IPv4 /24 is 256 addresses, often one office or one mobile carrier's cell. An IPv6 /64 is usually one household, and a /48 one site or one customer of a provider.</dd>
    <dt>Species page</dt><dd>The reference's page for one species, built ahead of time from the sources above.</dd>
    <dt>Older name</dt><dd>A name the species was once published under, or that a source still files it under: a synonym.</dd>
    <dt>Record</dt><dd>One sighting or specimen of a plant with a place, from GBIF. An open record is under CC0 or CC BY; a restricted one (CC BY-NC) is used but never published.</dd>
    <dt>Cell</dt><dd>One square of the climate grid, 0.05° on a side: about 5.6 km north to south, and less east to west away from the equator.</dd>
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
  <p id="notice">The source code's NOTICE names every source the reference reads, with its licence: those in <a href="#sources">the table above</a>, and the lists read only as codes, names or links (TDWG's region codes and tables, IPNI's and POWO's identifiers, iNaturalist's taxon numbers, and GBIF's dataset descriptions).</p>
  </section>
</article>

<style>
  .prose { max-width: 720px; font-size: var(--fs-base); line-height: 1.6; color: var(--ink); font-family: var(--ui); }
  /* Headings in the text face, the brief flush with the page under a rule (round eighty-seven's look; the review of stage
     2's pages, 8): the serif is the scientific names' alone, and its roman is never loaded. */
  .prose h2 { font-family: var(--ui); font-weight: 400; font-size: 1.375rem; margin: 32px 0 8px; }
  .prose h3 { font-family: var(--ui); font-size: var(--fs-lg); margin: 20px 0 6px; }
  .prose p { margin: 0 0 12px; }
  .brief { background: none; border-radius: 0; box-shadow: none; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 4px 0 14px; margin: 0 0 18px; }
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
  /* The species page's "›", turned when open, so a fold reads as one that opens: display flex drops the browser's own
     triangle, and "The rules in full" read as a small heading (round eighty-six; review P's P8). */
  .more > summary::before, .full > summary::before { content: '›'; content: '›' / ''; display: inline-block; width: 1em; flex: none; color: var(--accent); font-weight: 700; transition: transform 0.15s; }
  .more[open] > summary::before, .full[open] > summary::before { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) { .more > summary::before, .full > summary::before { transition: none; } }
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
  /* An anchor, /privacy among them, lands 16 px under the top bar, whatever the bar's height: the page's own scroll
     padding is the bar's measured height (--bar-h, theme.css) and 12 px, and this adds 4. Until round eighty-seven it
     added 44 + 16 px, a bar of 44 px counted twice; the bar is 52 to 57 px now, and --bar-h follows it. */
  .prose [id] { scroll-margin-top: 4px; }
  /* The repository's address breaks rather than pushing the page sideways at 320 px and 200% text. */
  .prose a, .prose code { overflow-wrap: anywhere; }
</style>

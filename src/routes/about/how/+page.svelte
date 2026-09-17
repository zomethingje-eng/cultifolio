<script lang="ts">
  import { setCrumb } from '$lib/ui/crumb.svelte';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about/how' }, { label: 'How it is made' }]);
    return () => setCrumb([]);
  });
</script>

<svelte:head>
  <title>How Cultifolio is made</title>
  <meta name="description" content="Where every number on a species page comes from, how the habitat centre and the growing year are worked out, and what the app refuses to guess." />
</svelte:head>

<div class="kick" style="margin-top: 22px">About</div>
<h1 class="q">How it is made</h1>
<p class="secsub">Every figure on a species page has a source and a method. This page is the method. The rule underneath all of it: a number the app cannot derive is left out and said to be missing, never filled in.</p>

<nav class="seg topseg" aria-label="About"><a class="on" href="/about/how">How it is made</a><a href="/about/formats">Formats</a></nav>

<article class="prose">
  <h2 id="sources">What comes from where</h2>
  <p>A species page is assembled from public sources, each named on the page where its data appears, with the licence it came under. The name and its synonyms, family and order come from the <b>GBIF Backbone Taxonomy</b>. The native range comes from the <b>World Checklist of Vascular Plants</b> at Kew, which the app reads through GBIF; where WCVP has no entry the app falls back to national checklists and says so, at country level only. Occurrence records come from <b>GBIF</b>. Monthly climate normals come from <b>CHELSA V2.1</b> (1981–2010, 30 arc-second), packed to a 0.05° grid: day and night temperature, rainfall, solar radiation, relative humidity, vapour-pressure deficit and wind. Daily temperature extremes come from <b>NASA POWER</b> (1981 onward). Photographs come from <b>iNaturalist</b> research-grade observations and <b>Wikimedia Commons</b>, restricted to CC0, CC BY and CC BY-SA, and each carries its author and licence. The summary paragraph is <b>Wikipedia</b>'s, kept visibly separate and credited. Recent literature comes from <b>OpenAlex</b>.</p>
  <p>Nothing on a species page is written by a person or a language model. The cultivation sheet and the "In short" paragraph are assembled by rule from the figures above, and each row says which figure it rests on.</p>

  <h2 id="refusal">A refusal is not an absence</h2>
  <p>Sources rate-limit, time out and go down. When one does, the page says "not checked" for that section rather than showing an empty list, because "we could not ask" and "there is nothing" are different facts and a grower reading the page needs to know which. The corpus build keeps what a source gave last time when it refuses this time, and records the date it was carried from. The same rule applies in the other direction: a plant with no habitat climate on file gets no derived climate rows, and a hybrid gets none at all, since it has no habitat.</p>

  <h2 id="centre">The habitat centre</h2>
  <p>Most of the numbers on a species page are read at one point: the habitat centre. Getting that point right is most of the work, because a species' records on GBIF include herbarium sheets with rounded coordinates, garden plants, and specimens filed under the wrong country.</p>
  <p>The app takes every georeferenced record with no flagged geospatial issue, drops living specimens (something somebody planted) and records marked introduced or managed, and tests each against the native range from WCVP, discarding records outside it. The range has to be WCVP's, with native status stated: a national checklist that only reports a plant present in a country cannot tell a wild record from a garden one, so for a name WCVP does not carry the page shows the records on a map, says the range is unverified, and derives no habitat centre, no climate and no cultivation from them. On what remains it finds the densest cluster: records are binned at 1°, and the bin with most neighbours wins if it holds at least half the records or twice the runner-up; if no bin dominates at 1° the test repeats at 2° and 4°, and a range where nothing dominates even at 4° is called disjunct and gets no centre. Inside the winning cluster the densest 1° population is found again, and the centre is the openly licensed record nearest its middle, so the point is somewhere the plant has been seen and never the average of two mountain ranges. When no openly licensed record lies in the cluster, the centre is the nearest tenth-of-a-degree grid point instead, about 10 km of slack, so that a restricted record's coordinates are never published as the centre; the page says which kind of point it is.</p>
  <p>Restricted-licence records (CC BY-NC) are used for this clustering and for nothing else: every in-range coordinate may inform where the cluster is, but only openly licensed records are published on the map, in the data, or as the centre itself. Three agreeing records are enough for a narrow endemic; under a dozen the page says the evidence is thin.</p>

  <h2 id="climate">Climate at the centre</h2>
  <p>Monthly figures are read from the packed CHELSA grid at the centre's cell. Radiation is converted to a daily light integral (PAR taken as 45% of shortwave at 4.6 µmol per joule, so 1 MJ/m²/day ≈ 2.07 mol/m²/day), because that is the unit a grower can compare with a window or a lamp.</p>
  <p>Extremes need daily data, which CHELSA does not give, so the app fetches the NASA POWER daily series for the centre's 0.5° cell and reduces it: the absolute minimum, the 1st-percentile night, the 99th-percentile day, and frost nights per year over the whole record. POWER's cell elevation and the centre's elevation differ, so the series is lapse-corrected at 6.5 °C per 1,000 m of the difference, and the page says by how much. A series is used only if it covers twenty years at 95% completeness.</p>

  <h2 id="year">The growing year</h2>
  <p>The wet season is the smallest set of months that carries 70% of the year's rain. Four months that do is a sharp season; eight or more is no season, and so is a year whose monthly mean temperature moves less than 4 °C. Under 120 mm a year there is no rainy season to read, so the growing months are read from the temperature curve instead: the six coolest. That is a reading of two curves and nothing more; it does not say that the plant lives on fog, or when this plant grows, and the page words it that way. A wet season cooler than the year's mean is called a winter grower; warmer, a summer grower. What growers find in practice, that a plant from such a place grows in its cool months, is practice, and the page keeps the two apart.</p>
  <p>Months are given in the plant's own hemisphere and then shifted six months for a collection in the other one, and the page names both, because a Namaqualand plant that "grows in winter" grows in a northern greenhouse from November to February and the difference is the whole point.</p>

  <h2 id="floor">The cold floor</h2>
  <p>The floor on a page is the 1st-percentile night at the habitat centre, held up to a group minimum where a plant has no dormancy to meet the cold in (an aroid does not get a 4 °C floor because its habitat records one). It is a cautious floor worked back from what the place does, not a tested survival limit for a plant in a pot, and it says so.</p>

  <h2 id="archetypes">Archetypes</h2>
  <p>Some advice does not come from climate: what to feed, how often to repot, which pests to expect, whether to let the pot dry through. For these the app keeps a small table of care archetypes (cactus or succulent, bulb or caudex, tropical foliage, orchid, epiphyte, fern, carnivore, temperate) resolved species → genus → family, and each row that uses one says which archetype and why it was chosen. Where a family splits between archetypes and the genus is not on the table, the app guesses nothing.</p>

  <h2 id="notes">The note in short</h2>
  <p>The paragraph at the top of the cultivation section is the sheet's rows in one-sentence form: each row is written with its own short form by the same rule at the same moment, and the note is those sentences in card order and nothing else. There is no second rule that could disagree with a card. It lists the rows each sentence came from. It is not written by a person or a model, and the page says so.</p>
  <p>The same discipline holds on a plant's own page, where its habitat figures sit beside the bench it lives on: the page shows the two side by side and gives no verdict, because the sky over a habitat and a climate percentile are facts about a place, not measured tolerances of a plant in a pot. The papers listed on a species page are works whose title or abstract names the species, most cited first; they are a pointer to the literature, and nothing on the page is drawn from them.</p>

  <h2 id="collection">Your collection</h2>
  <p>Everything you record lives in your browser's storage on your device as an append-only log of field-level changes, each stamped with a hybrid logical clock. State is a fold over the log; two devices merge by taking the union of their logs, and for each field the latest change wins. That one rule is what backup restore, the v2 import and sync all use, which is why restoring an old backup over a newer collection loses nothing and why a sync interrupted halfway simply resumes. Sync encrypts every batch on the device with a key only you hold; the server stores ciphertext and cannot read a plant name. The <a href="/about/formats">formats page</a> has the details.</p>

  <h2 id="privacy">What the site knows about you</h2>
  <p>Nothing. There are no accounts, no analytics and no tracking. Species pages are served from a static corpus; your collection never leaves your device unless you turn on sync, and then it leaves encrypted.</p>

  <h2 id="source">The source</h2>
  <p>Cultifolio is open source: the app under AGPL-3.0, the corpus tooling under MIT. Everything described on this page can be checked, run and rebuilt from <a href="https://github.com/zomethingje-eng/cultifolio">github.com/zomethingje-eng/cultifolio</a>, including the scripts that build a species corpus from the sources above. Problems and corrections are welcome there.</p>
</article>

<style>
  .prose { max-width: 720px; font-size: 15px; line-height: 1.6; color: var(--ink); font-family: var(--ui); }
  .prose h2 { font-family: var(--serif); font-size: 22px; margin: 28px 0 8px; }
  .prose p { margin: 0 0 12px; }
  .topseg { margin: 14px 0 6px; }
</style>

<script lang="ts">
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { REGIONS_CITED_PAGE } from '$lib/browse/words';
  import { RANGE_SOURCE } from '$lib/browse/sources';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const desc = $derived(`The plants of ${fmt(data.total)} species pages by where they are native, in TDWG's regions: ${data.continents.length} continents, their regions and ${data.level3} botanical countries, with each count from Kew's World Checklist.`);
</script>

<svelte:head>
  <title>Plants by region · Cultifolio</title>
  <meta name="description" content={desc} />
  <link rel="canonical" href="https://cultifolio.com/region" />
  <meta property="og:title" content="Plants by region · Cultifolio" />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/region" />
</svelte:head>

<Crumbs parts={[{ label: 'Reference', href: '/' }, { label: 'Regions' }]} />
<h1 class="h1">Plants by region</h1>
<p class="lead">Where each species is native, by Kew's World Checklist, in the regions of TDWG's scheme: continents, their regions, and the {fmt(data.level3)} "botanical countries" Kew gives ranges in. A species counts in every region it is native to.</p>

<div class="cols">
  {#each data.continents as l1 (l1.code)}
    <section class="l1" aria-labelledby="c-{l1.code}">
      <h2 id="c-{l1.code}" class="sec"><a class="plain" href="/region/{l1.slug}">{l1.label}</a> <span class="n">{fmt(l1.n)}</span></h2>
      {#each l1.regions as l2 (l2.code)}
        <h3 class="l2"><a href="/region/{l2.slug}">{l2.label}</a> <span class="n">{fmt(l2.n)}</span></h3>
        <ul class="l3 plain">
          {#each l2.parts as l3 (l3.code)}<li><a href="/region/{l3.slug}">{l3.label}</a> <span class="n">{l3.n ? fmt(l3.n) : 'none here'}</span></li>{/each}
        </ul>
      {/each}
    </section>
  {/each}
</div>

<section aria-labelledby="by-country">
  <h2 id="by-country" class="sec">By country</h2>
  <p class="note">A country is the level-3 regions it holds: those it holds alone or most of, as Natural Earth's states and provinces assign them. Each opens the browse page with them ticked.</p>
  <ul class="countries plain">
    {#each data.countries as x (x.name)}<li><a href={x.href}>{x.name}</a> <span class="n">{fmt(x.n)}</span>{#if x.shared}<span class="sh"> · a region it shares</span>{/if}</li>{/each}
  </ul>
</section>

<p class="foot">{#if data.unplaced}{fmt(data.unplaced)} {data.unplaced === 1 ? 'species has' : 'species have'} no native region TDWG names in the reference, and {data.unplaced === 1 ? 'is' : 'are'} in no region's count. {/if}{RANGE_SOURCE} {REGIONS_CITED_PAGE}{data.built ? ` Counts ${data.built}.` : ''}</p>

<style>
  .h1 { margin: 10px 0 0; font-size: 2.125rem; font-weight: 400; line-height: 1.2; }
  .lead { max-width: 70ch; color: var(--ink2); margin: 8px 0 18px; padding-bottom: 14px; border-bottom: 1px solid var(--ink); }
  .cols { columns: 3 280px; column-gap: 40px; }
  .l1 { break-inside: avoid-column; margin-bottom: 18px; }
  .sec { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .sec a { color: inherit; }
  .l2 { margin: 10px 0 2px; font-size: var(--fs-base); font-weight: 600; border-top: 1px solid var(--rule); padding-top: 6px; }
  .l3, .countries { list-style: none; margin: 0; padding: 0; font-size: var(--fs-ui); }
  .l3 li, .countries li { padding: 3px 0; border-top: 1px solid var(--rule2, var(--rule)); display: flex; gap: 8px; }
  .l3 li a, .countries li a { flex: 1; min-width: 0; }
  .n { color: var(--mut, var(--ink3)); font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
  .countries { columns: 4 200px; column-gap: 32px; }
  .countries li { break-inside: avoid; }
  .sh { color: var(--mut, var(--ink3)); font-size: var(--fs-sm); }
  .note, .foot { font-size: var(--fs-head); color: var(--mut, var(--ink3)); max-width: 80ch; }
  .foot { margin-top: 24px; padding-top: 10px; border-top: 1px solid var(--rule); }
  @media (max-width: 899px) { .l3 li a, .countries li a { min-height: 44px; display: flex; align-items: center; } .h1 { font-size: 1.75rem; } }
</style>

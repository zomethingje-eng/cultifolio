<script lang="ts">
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { RANGE_SOURCE } from '$lib/browse/sources';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const desc = $derived(`The ${fmt(data.families.length)} plant families of Cultifolio's reference, ${data.families[0]?.name ?? ''} to ${data.families.at(-1)?.name ?? ''}, each with its species and genera.`);
</script>

<svelte:head>
  <title>Families · Cultifolio</title>
  <meta name="description" content={desc} />
  <link rel="canonical" href="https://cultifolio.com/family" />
  <meta property="og:title" content="Families · Cultifolio" />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/family" />
</svelte:head>

<Crumbs parts={[{ label: 'Reference', href: '/' }, { label: 'Families' }]} />
<h1 class="h1">Families</h1>
<p class="lead">{fmt(data.families.length)} families, as Kew's World Checklist puts each species{data.without ? `; ${fmt(data.without)} species have no family in the reference` : ''}.</p>
<table class="fl">
  <thead><tr><th scope="col">Family</th><th scope="col" class="num">Genera here</th><th scope="col" class="num">Species here</th></tr></thead>
  <tbody>
    {#each data.families as f (f.slug)}
      <tr><th scope="row"><a href="/family/{f.slug}">{f.name}</a></th><td class="num" data-label="Genera here">{fmt(f.genera)}</td><td class="num" data-label="Species here">{fmt(f.n)}</td></tr>
    {/each}
  </tbody>
</table>
<p class="foot">A genus is counted in the family most of its species here are in. {RANGE_SOURCE}</p>

<style>
  .h1 { margin: 10px 0 0; font-size: 2.125rem; font-weight: 400; }
  .lead { color: var(--ink2); margin: 8px 0 12px; }
  .fl { width: 100%; max-width: 720px; border-collapse: collapse; font-size: var(--fs-base); font-variant-numeric: tabular-nums lining-nums; }
  .fl thead th { text-align: left; font-size: var(--fs-sm); font-weight: 500; color: var(--mut, var(--ink3)); border-bottom: 1px solid var(--ink); padding: 6px 8px 6px 0; }
  .fl td, .fl tbody th { border-bottom: 1px solid var(--rule2, var(--rule)); padding: 6px 8px 6px 0; text-align: left; font-weight: 400; }
  .fl .num { text-align: right; }
  .foot { font-size: var(--fs-sm); color: var(--mut, var(--ink3)); margin-top: 16px; }
  @media (max-width: 899px) { .fl tbody th a { display: inline-flex; min-height: 44px; align-items: center; } }
</style>

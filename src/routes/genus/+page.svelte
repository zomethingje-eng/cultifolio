<script lang="ts">
  import Crumbs from '$lib/browse/Crumbs.svelte';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const desc = $derived(`The ${fmt(data.withPage)} genera with two species or more in Cultifolio's plant reference, A to Z, each with its family and its species' native ranges, habitat climate and growers' counts.`);
</script>

<svelte:head>
  <title>Genera{data.letter !== 'A' || data.asked ? `, ${data.letter}` : ''} · Cultifolio</title>
  <meta name="description" content={desc} />
  <link rel="canonical" href="https://cultifolio.com/genus{data.asked ? `?from=${data.letter}` : ''}" />
  <meta property="og:title" content="Genera · Cultifolio" />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/genus" />
</svelte:head>

<Crumbs parts={[{ label: 'Reference', href: '/' }, { label: 'Genera' }]} />
<h1 class="h1">Genera</h1>
<p class="lead">{fmt(data.withPage)} genera have two species or more in the reference, and a page here. {fmt(data.single)} more have one species each, reached by its own page.</p>
<nav class="letters plain" aria-label="Genera by letter">
  {#each data.letters as x (x.l)}<a href="/genus?from={x.l}" aria-current={x.l === data.letter ? 'page' : undefined} title="{x.n} genera">{x.l}</a>{/each}
</nav>
<table class="gl">
  <thead><tr><th scope="col">Genus</th><th scope="col">Family</th><th scope="col" class="num">Species here</th></tr></thead>
  <tbody>
    {#each data.genera as g (g.slug)}
      <tr><th scope="row"><a href="/genus/{g.slug}"><i>{g.name}</i></a></th><td data-label="Family">{#if g.family}<a class="plain" href="/family/{g.familySlug}">{g.family}</a>{/if}</td><td class="num" data-label="Species here">{fmt(g.n)}</td></tr>
    {/each}
  </tbody>
</table>

<style>
  .h1 { margin: 10px 0 0; font-size: 2.125rem; font-weight: 400; }
  .lead { color: var(--ink2); margin: 8px 0 12px; max-width: 70ch; }
  .letters { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 12px; padding-bottom: 10px; border-bottom: 1px solid var(--ink); }
  .letters a { min-width: 30px; min-height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; }
  .letters a[aria-current] { background: var(--ink); color: var(--bg); }
  .gl { width: 100%; border-collapse: collapse; font-size: var(--fs-base); font-variant-numeric: tabular-nums lining-nums; }
  .gl thead th { text-align: left; font-size: var(--fs-sm); font-weight: 500; color: var(--mut, var(--ink3)); border-bottom: 1px solid var(--ink); padding: 6px 8px 6px 0; }
  .gl td, .gl tbody th { border-bottom: 1px solid var(--rule2, var(--rule)); padding: 6px 8px 6px 0; text-align: left; font-weight: 400; }
  .gl .num { text-align: right; }
  i { font-family: var(--serif); }
  @media (max-width: 899px) { .letters a { min-width: 44px; min-height: 44px; } .gl tbody th a { display: inline-flex; min-height: 44px; align-items: center; } }
</style>

<script lang="ts">
  import BrowseView from '$lib/browse/BrowseView.svelte';
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { photoAt } from '$dossier/photo-size';
  import { RANGE_SOURCE } from '$lib/browse/sources';
  import Lens from '$lib/browse/Lens.svelte';
  import { LensState } from '$lib/browse/lens-state.svelte';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const f = $derived(data.figures);
  // The collection lens (C8): the grower's plants of this family, matched in this browser alone.
  const lens = new LensState(() => ({ kind: 'family', family: data.family }));
  const title = $derived(`${data.family}: ${fmt(f.total)} species · Cultifolio`);
  const desc = $derived(`The ${fmt(f.total)} species of the family ${data.family} in ${fmt(f.genera)} genera in Cultifolio's plant reference, ${fmt(f.climate)} with a habitat climate: native ranges from Kew's World Checklist, each figure with its source.`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  {#if data.view.qs}<meta name="robots" content="noindex, follow" />{/if}
  <link rel="canonical" href="https://cultifolio.com/family/{data.slug}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/family/{data.slug}" />
  {#if data.view.share}<meta property="og:image" content={photoAt(data.view.share.src, 'medium')} /><meta property="og:image:alt" content={data.view.share.alt} />{/if}
</svelte:head>

<Crumbs parts={[{ label: 'Families', href: '/family' }, { label: data.family }]} />
<header class="ehead">
  <h1 class="h1">{data.family}</h1>
  <p class="sub">{fmt(f.total)} species in {fmt(f.genera)} {f.genera === 1 ? 'genus' : 'genera'} · {fmt(f.climate)} with a habitat climate · {f.grown === null ? 'grown, per iNaturalist: not counted' : `${fmt(f.grown)} grown, per iNaturalist${f.grownNotCounted ? `, ${fmt(f.grownNotCounted)} not counted` : ''}`}</p>
  {#if data.regions.length}
    <p class="near plain"><span class="lbl">Most native to:</span> {#each data.regions as r, i (r.code)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href={r.href}>{r.label}</a> <span class="n">{fmt(r.n)}</span>{/each}</p>
  {/if}
  <p class="src">A species counts in every region it is native to. {RANGE_SOURCE}</p>
  <Lens state={lens} total={f.total} here="of the family here" />
</header>

<BrowseView view={data.view} heading={false} {lens} />

<style>
  .ehead { border-bottom: 1px solid var(--rule); padding-bottom: 12px; }
  .h1 { margin: 10px 0 0; font-size: 2.375rem; font-weight: 400; line-height: 1.15; }
  .sub { margin: 6px 0 0; color: var(--ink2); }
  .near { margin: 10px 0 0; font-size: var(--fs-ui); line-height: 1.7; }
  .lbl { color: var(--mut, var(--ink3)); }
  .n { color: var(--mut, var(--ink3)); font-variant-numeric: tabular-nums lining-nums; }
  .src { margin: 8px 0 0; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  @media (max-width: 899px) { .h1 { font-size: 1.875rem; } }
</style>

<script lang="ts">
  import BrowseView from '$lib/browse/BrowseView.svelte';
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { grownFigure } from '$lib/browse/view';
  import { photoAt } from '$dossier/photo-size';
  import { REGIONS_CITED_PAGE } from '$lib/browse/words';
  import Lens from '$lib/browse/Lens.svelte';
  import { LensState } from '$lib/browse/lens.svelte';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const r = $derived(data.region);
  const f = $derived(data.figures);
  const what = $derived(r.level === 3 ? `TDWG level-3 region ${r.code}` : r.level === 2 ? `TDWG region ${r.code}, ${r.parts} level-3 regions` : `TDWG continent ${r.code}, ${r.parts} level-3 regions`);
  const title = $derived(`Plants native to ${r.label} · Cultifolio`);
  const desc = $derived(`${fmt(f.total)} species native to ${r.label} (${what}), ${fmt(f.only)} of them native nowhere else, ${fmt(f.climate)} with a habitat climate: native ranges from Kew's World Checklist, each figure with its source.`);
  const indexable = $derived(!data.view.qs);
  // The collection lens (C8): this page's species and the regions next door, matched in this browser alone.
  const lens = new LensState(() => ({ kind: 'region', native: data.lens }), () => (data.next ?? []).map((x) => ({ key: x.key, of: { kind: 'region' as const, native: x.native } })));
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  {#if !indexable}<meta name="robots" content="noindex, follow" />{/if}
  <link rel="canonical" href="https://cultifolio.com/region/{r.slug}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/region/{r.slug}" />
  {#if data.view.share}<meta property="og:image" content={photoAt(data.view.share.src, 'medium')} /><meta property="og:image:alt" content={data.view.share.alt} />{/if}
</svelte:head>

<Crumbs parts={[{ label: 'Regions', href: '/region' }, ...data.line, { label: r.label }]} />
<header class="ehead">
  <h1 class="h1">{r.label}</h1>
  <p class="sub">{what}{r.name !== r.label ? ` · Kew writes "${r.name}"` : ''}</p>
  <table class="figs">
    <tbody>
      <tr><th scope="row">Species native here</th><td>{fmt(f.total)}</td></tr>
      {#if r.level === 3 || f.only}<tr><th scope="row">Native nowhere else</th><td>{fmt(f.only)}</td></tr>{/if}
      <tr><th scope="row">With a habitat climate</th><td>{fmt(f.climate)}</td></tr>
      <tr><th scope="row">Grown, per iNaturalist</th><td>{grownFigure(f, fmt)}</td></tr>
      <tr><th scope="row">Genera, families</th><td>{fmt(f.genera)}, {fmt(f.families)}</td></tr>
    </tbody>
  </table>
  {#if data.parts.length}
    <p class="near plain"><span class="lbl">In it:</span> {#each data.parts as x, i (x.code)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href="/region/{x.slug}">{x.label}</a> <span class="n">{fmt(x.n)}</span>{/each}</p>
  {/if}
  {#if data.siblings.length}
    <p class="near plain"><span class="lbl">Beside it in {data.up?.label}:</span> {#each data.siblings as x, i (x.code)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href="/region/{x.slug}">{x.label}</a> <span class="n">{fmt(x.n)}</span>{/each}</p>
  {/if}
  {#if data.next?.length}
    <p class="near plain"><span class="lbl">Next door:</span> {#each data.next as x, i (x.code)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href="/region/{x.slug}">{x.label}</a> <span class="n">{fmt(x.n)}</span>{/each}</p>
  {:else if data.next === null}
    <p class="near"><span class="lbl">Next door:</span> not worked out: the shapes file holds no outline of {r.label}.</p>
  {/if}
  {#if data.countries.length}
    <p class="near plain"><span class="lbl">Countries:</span> {#each data.countries as x, i (x.name)}{#if i}<span aria-hidden="true">{" · "}</span>{/if}<a href={x.href}>{x.name}</a> <span class="n">{fmt(x.n)}</span>{/each}</p>
  {/if}
  <p class="src">{REGIONS_CITED_PAGE} Next door: regions whose outlines touch, read from those shapes (TDWG's own tables give no neighbours).</p>
  <Lens state={lens} total={f.total} here="native here" next={(data.next ?? []).map((x) => ({ key: x.key, label: x.label, slug: x.slug, n: x.n }))} />
</header>

<BrowseView view={data.view} heading={false} {lens} />

<style>
  .ehead { border-bottom: 1px solid var(--rule); padding-bottom: 12px; }
  .h1 { margin: 10px 0 0; font-size: 2.375rem; font-weight: 400; line-height: 1.15; }
  .sub { margin: 4px 0 0; color: var(--ink2); }
  .figs { margin: 12px 0 0; border-collapse: collapse; font-size: var(--fs-base); min-width: min(100%, 360px); }
  .figs th { text-align: left; font-weight: 400; color: var(--mut, var(--ink3)); padding: 5px 24px 5px 0; border-top: 1px solid var(--rule); }
  .figs td { text-align: right; padding: 5px 0; border-top: 1px solid var(--rule); font-variant-numeric: tabular-nums lining-nums; }
  .figs tr:first-child th, .figs tr:first-child td { border-top-color: var(--ink); }
  .near { margin: 10px 0 0; font-size: var(--fs-ui); line-height: 1.7; }
  .lbl { color: var(--mut, var(--ink3)); }
  .n { color: var(--mut, var(--ink3)); font-variant-numeric: tabular-nums lining-nums; }
  .src { margin: 10px 0 0; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  @media (max-width: 899px) { .h1 { font-size: 1.875rem; } .figs { width: 100%; } }
</style>

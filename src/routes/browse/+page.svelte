<script lang="ts">
  import BrowseView from '$lib/browse/BrowseView.svelte';
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { photoAt } from '$dossier/photo-size';
  let { data } = $props();
  const v = $derived(data.view);
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const title = $derived(`${v.title}: ${fmt(v.total)} · Cultifolio`);
  const desc = $derived(`${fmt(v.total)} ${v.title.charAt(0).toLowerCase()}${v.title.slice(1)} in Cultifolio's plant reference: native ranges from Kew's World Checklist, habitat climate and growers' counts, each with its source.`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  <!-- A filtered view is one of countless combinations: for readers and their links, not for search engines (C2). -->
  {#if v.filtered || v.qs}<meta name="robots" content="noindex, follow" />{/if}
  <link rel="canonical" href="https://cultifolio.com/browse{v.filtered ? v.qs : ''}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/browse{v.qs}" />
  {#if v.share}<meta property="og:image" content={photoAt(v.share.src, 'medium')} /><meta property="og:image:alt" content={v.share.alt} />{/if}
</svelte:head>

<Crumbs parts={[{ label: 'Reference', href: '/' }, { label: 'Browse' }]} />
<BrowseView view={v} />

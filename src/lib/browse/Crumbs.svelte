<script lang="ts">
  /**
   * An entrance page's breadcrumbs (round eighty-seven, C2): drawn in the page, so a crawler and a reader without
   * scripts have them, with schema.org's BreadcrumbList beside them, as the species page gives its own record.
   */
  let { parts }: { parts: Array<{ label: string; href?: string; italic?: boolean }> } = $props();
  const ld = $derived(JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: parts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.label, ...(p.href ? { item: `https://cultifolio.com${p.href}` } : {}) })) }));
</script>

<svelte:head>{@html `<script type="application/ld+json">${ld.replace(/</g, '\\u003c')}</script>`}</svelte:head>
<nav class="crumbs plain" aria-label="Where this page is">
  <ol>
    {#each parts as p, i}
      <li>{#if i}<span aria-hidden="true">›</span>{/if}{#if p.href && i < parts.length - 1}<a href={p.href}>{#if p.italic}<i>{p.label}</i>{:else}{p.label}{/if}</a>{:else}<span aria-current="page">{#if p.italic}<i>{p.label}</i>{:else}{p.label}{/if}</span>{/if}</li>
    {/each}
  </ol>
</nav>

<style>
  .crumbs { margin: 16px 0 0; font-size: var(--fs-head); color: var(--mut, var(--ink3)); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 2px 6px; }
  li { display: flex; gap: 6px; }
  i { font-family: var(--serif); }
</style>

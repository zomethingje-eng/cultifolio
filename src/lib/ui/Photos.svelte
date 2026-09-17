<script lang="ts">
  import type { Photo } from '$dossier/schema';
  import { licenceLabel } from '$core/licence';
  let { photos, name, strip = false }: { photos: Photo[]; name: string; strip?: boolean } = $props();
  const wild = $derived(photos.filter((p) => !p.captive));
  const cult = $derived(photos.filter((p) => p.captive));
  const hero = $derived(wild[0] ?? cult[0]);
  const rest = $derived(photos.filter((p) => p !== hero));
  let showAll = $state(false);
  const LIMIT = 8;
  const shown = $derived(showAll ? rest : rest.slice(0, LIMIT));
  // One credit line for the strip instead of a caption under every thumbnail.
  const credits = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of shown) m.set(`${p.attribution} · ${licenceLabel(p.licence)}`, (m.get(`${p.attribution} · ${licenceLabel(p.licence)}`) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join('; ');
  });
</script>

{#if hero && !strip}
  <figure class="hero card">
    <a href={hero.page ?? hero.url} rel="noopener"><img src={hero.url} alt="{name}{hero.place ? ', ' + hero.place : ''}" loading="eager" fetchpriority="high" /></a>
    <figcaption class="faint small">{hero.attribution}{hero.captive ? ' · in cultivation' : ' · in habitat'}{hero.observedOn ? ' · ' + hero.observedOn : ''}</figcaption>
  </figure>
{/if}
{#if hero}
  {#if rest.length}
    <div class="grid">
      {#each shown as p (p.src + p.id)}
        <a class="ph" href={p.page ?? p.url} rel="noopener" title="{p.attribution} · {licenceLabel(p.licence)}{p.captive ? ' · in cultivation' : ''}"><img src={p.thumb} alt="{name}{p.captive ? ', in cultivation' : ''}" loading="lazy" />{#if p.captive}<span class="tag">cultivated</span>{/if}</a>
      {/each}
    </div>
    <p class="credits faint">Photographs: {credits}.{#if rest.length > LIMIT} <button class="linkish" type="button" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${photos.length}`}</button>{/if}</p>
  {/if}
{:else}
  <div class="empty card">
    <p class="k">No openly licensed photograph yet</p>
    <p class="muted">Photographs shown here must be CC0, CC BY or CC BY-SA so they can be shown to everyone. If you grow this plant, add your own photo to your record and offer it to the gallery.</p>
  </div>
{/if}

<style>
  .hero { margin: 0 0 0.6rem; overflow: hidden; }
  .hero img { width: 100%; max-height: 440px; object-fit: cover; }
  .hero figcaption { padding: 0.45rem 0.8rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 9px; margin-top: 12px; }
  .ph { position: relative; display: block; border-radius: 8px; overflow: hidden; background: var(--sunk); }
  .ph img { width: 100%; aspect-ratio: 1; object-fit: cover; }
  .ph .tag { position: absolute; left: 0.35rem; bottom: 0.35rem; font-family: var(--mono); font-size: 10px; padding: 0.1em 0.45em; border-radius: 999px; background: rgba(0, 0, 0, 0.55); color: #fff; }
  .credits { font-size: 12px; margin: 0.45rem 0 0; line-height: 1.4; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font-size: inherit; }
  .empty { padding: 1rem 1.2rem; }
  .small { font-size: 13px; }
</style>

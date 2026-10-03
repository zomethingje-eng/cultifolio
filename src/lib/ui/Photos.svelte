<script lang="ts">
  import type { Photo } from '$dossier/schema';
  import { heroOf } from '$dossier/dedupe';
  import { licenceLabel } from '$core/licence';
  let { photos, name, strip = false }: { photos: Photo[]; name: string; strip?: boolean } = $props();
  // "Wild" is what a source says, not what it leaves unsaid: iNaturalist marks each photograph; Commons and GBIF media
  // carry no flag, so those go unsaid rather than captioned as wild (round thirty, R2-12).
  const wild = $derived(photos.filter((p) => !p.captive));
  const cult = $derived(photos.filter((p) => p.captive));
  const hero = $derived(heroOf(photos));
  const rest = $derived(photos.filter((p) => p !== hero));
  let showAll = $state(false);
  const LIMIT = 6;
  const shown = $derived(showAll ? rest : rest.slice(0, LIMIT));
  // A credit names its licence only when the attribution does not already: "J. Doe (CC BY)" is not followed by "· CC BY".
  const credit = (p: Photo) => {
    const lic = licenceLabel(p.licence);
    // "CC BY", "CC-BY", "cc by 4.0" all name the same licence; "CC BY-SA" names another, so the label must end there.
    const norm = (t: string) => t.replace(/[\s-]+/g, ' ').trim().toLowerCase();
    const named = new RegExp(`(^|[^a-z0-9])${norm(lic).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9]| (?:sa|nc|nd)\\b)`).test(norm(p.attribution));
    return named ? p.attribution : `${p.attribution} · ${lic}`;
  };
  // One credit line for the strip instead of a caption under every thumbnail.
  const credits = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of shown) m.set(credit(p), (m.get(credit(p)) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join('; ');
  });
</script>

{#if hero && !strip}
  <figure class="hero card">
    <a href={hero.page ?? hero.url} rel="noopener"><img src={hero.url} alt="{name}{hero.place ? ', ' + hero.place : ''}" loading="eager" fetchpriority="high" /></a>
    <figcaption class="faint small">{hero.attribution}{hero.captive === true ? ' · in cultivation' : hero.captive === false ? ' · observed growing wild' : ''}{hero.observedOn ? ' · ' + hero.observedOn : ''}</figcaption>
  </figure>
{/if}
{#if hero}
  {#if rest.length}
    <div class="grid">
      {#each shown as p, i (p.src + p.id)}
        <a class="ph" href={p.page ?? p.url} rel="noopener" title="{credit(p)}{p.captive ? ' · in cultivation' : ''}" aria-label="{name}{p.captive ? ', in cultivation' : ''}: photograph {i + 1} of {shown.length}, {credit(p)}"><img src={p.thumb} alt="" loading="lazy" onerror={(e) => { const a = (e.currentTarget as HTMLImageElement).closest('a'); a?.classList.add('failed'); }} />{#if p.captive}<span class="tag">cultivated</span>{/if}<span class="nope">did not load</span></a>
      {/each}
    </div>
    <p class="credits faint">Photographs: {credits}.{#if rest.length > LIMIT}{' '}<button class="linkish" type="button" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${photos.length}`}</button>{/if}</p>
  {/if}
{:else}
  <div class="empty card">
    <p class="k">No openly licensed photograph yet</p>
    <p class="muted">Photographs shown here must be CC0, CC BY or CC BY-SA so they can be shown to everyone. If you grow this plant, add your own photo to your record and offer it to the gallery.</p>
  </div>
{/if}

<style>
  /* A thumbnail the host did not serve: a word in its square, not the browser's broken-image icon (round fifty-two, 6). */
  .ph .nope { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-family: var(--mono); font-size: 10px; color: var(--ink3); text-align: center; padding: 4px; }
  .ph:global(.failed) img { visibility: hidden; }
  .ph:global(.failed) .nope { display: flex; }
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

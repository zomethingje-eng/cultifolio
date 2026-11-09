<script lang="ts">
  import type { Photo } from '$dossier/schema';
  import { heroOf, spreadByObserver } from '$dossier/dedupe';
  import { photoCredit, shownAttribution } from '$lib/ui/ref/head';
  import { creditDays, type CreditUp } from '$lib/ui/ref/credit-days';
  // `upstream`: the page's record of sources, for the day each source's credits were read (round eighty-five, the owner's
  // decision 7); `lead`: the lead photograph's credit is said first, as it is shown above the gallery, not in it.
  let { photos, name, strip = false, upstream = {}, lead = false }: { photos: Photo[]; name: string; strip?: boolean; upstream?: CreditUp; lead?: boolean } = $props();
  // "Wild" is what a source says, not what it leaves unsaid: iNaturalist marks each photograph; Commons and GBIF media
  // carry no flag, so those go unsaid rather than captioned as wild (round thirty, R2-12).
  const wild = $derived(photos.filter((p) => !p.captive));
  const cult = $derived(photos.filter((p) => p.captive));
  const hero = $derived(heroOf(photos));
  // The first row from as many observers as there are (round eighty-four; W2).
  const rest = $derived(spreadByObserver(photos.filter((p) => p !== hero), 6));
  let showAll = $state(false);
  const LIMIT = 6;
  const shown = $derived(showAll ? rest : rest.slice(0, LIMIT));
  // A credit names its licence only when the attribution does not already, and says so when the two disagree: one helper
  // for the gallery, compare and the tests (round sixty-two; outside review A35).
  const credit = (p: Photo) => photoCredit(p);
  // One credit line for the strip instead of a caption under every thumbnail.
  const credits = $derived.by(() => {
    const m = new Map<string, number>();
    for (const p of shown) m.set(credit(p), (m.get(credit(p)) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => (n > 1 ? `${k} (${n})` : k)).join('; ');
  });
  /** The lead's own credit, with whether it was cultivated and its day, which the band on a phone leaves out (round eighty-five). */
  const leadCredit = $derived(hero && lead ? `${credit(hero)}${hero.captive === true ? ', in cultivation' : hero.captive === false ? ', observed growing wild' : ''}${hero.observedOn ? `, observed ${hero.observedOn}` : ''}` : '');
  /** The day each source's credits were read, for the photographs credited here (decision 7; `credit-days.ts`). */
  const days = $derived(creditDays(lead && hero ? [hero, ...shown] : shown, upstream));
</script>

{#if hero && !strip}
  <figure class="hero card">
    <a href={hero.page ?? hero.url} rel="noopener"><img src={hero.url} alt="{name}{hero.place ? ', ' + hero.place : ''}" loading="eager" fetchpriority="high" /></a>
    <figcaption class="faint small">{shownAttribution(hero)}{hero.captive === true ? ' · in cultivation' : hero.captive === false ? ' · observed growing wild' : ''}{hero.observedOn ? ' · observed ' + hero.observedOn : ''}</figcaption><!-- "observed": the observation's day, apart from the day the credit was read (round eighty-six; W11) -->
  </figure>
{/if}
{#if hero}
  <!-- One credit line for any count (round eighty-six; outside review B's 1): with a lead and nothing else, the line still
       names the lead's credit and the day it was read; the grid is drawn only when there is more to show. -->
  {#if rest.length}
    <div class="grid">
      {#each shown as p, i (p.src + p.id)}
        <a class="ph" href={p.page ?? p.url} rel="noopener" title="{credit(p)}{p.captive ? ' · in cultivation' : ''}" aria-label="{name}{p.captive ? ', in cultivation' : ''}: photograph {i + 1} of {shown.length}, {credit(p)}"><img src={p.thumb} alt="{name}, photograph {i + 1}" loading="lazy" onerror={(e) => { const a = (e.currentTarget as HTMLImageElement).closest('a'); a?.classList.add('failed'); }} />{#if p.captive}<span class="tag">cultivated</span>{/if}<span class="nope">did not load</span></a>
      {/each}
    </div>
  {/if}
  {#if rest.length || leadCredit}
    <p class="credits faint">{#if leadCredit}{rest.length ? 'The photograph at the top' : 'The photograph'}: {leadCredit}.{' '}{/if}{#if credits}Photographs: {credits}.{/if}{#if days}{' '}<span id="credit-days">{days}.</span>{/if} <a class="help" href="https://creativecommons.org/about/cclicenses/" rel="noopener">What each licence allows</a>.{#if rest.length > LIMIT}{' '}<button class="linkish" type="button" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${photos.length}`}</button>{/if}</p>
  {/if}
{:else}
  <div class="empty card">
    <p class="k">No openly licensed photograph yet</p>
    <p class="muted">Photographs shown here must be CC0, public domain, CC BY or CC BY-SA so they can be shown to everyone. A photograph you add to your own plant stays on your device and in your sync; it is never shown here.</p>
  </div>
{/if}

<style>
  /* A thumbnail the host did not serve: a word in its square, not the browser's broken-image icon (round fifty-two, 6). */
  .ph .nope { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-family: var(--ui); font-size: var(--fs-xs); color: var(--ink3); text-align: center; padding: 4px; }
  .ph:global(.failed) img { visibility: hidden; }
  .ph:global(.failed) .nope { display: flex; }
  .hero { margin: 0 0 0.6rem; overflow: hidden; }
  .hero img { width: 100%; max-height: 440px; object-fit: cover; }
  .hero figcaption { padding: 0.45rem 0.8rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 9px; margin-top: 12px; }
  .ph { position: relative; display: block; border-radius: var(--r); overflow: hidden; background: var(--sunk); }
  .ph img { width: 100%; aspect-ratio: 1; object-fit: cover; }
  .ph .tag { position: absolute; left: 0.35rem; bottom: 0.35rem; font-family: var(--ui); font-size: var(--fs-xs); padding: 0.1em 0.45em; border-radius: var(--r); background: rgba(0, 0, 0, 0.55); color: #fff; }
  .credits { font-size: var(--fs-sm); margin: 0.45rem 0 0; line-height: 1.4; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font-size: inherit; }
  .empty { padding: 1rem 1.2rem; }
  .small { font-size: var(--fs-md); }
</style>

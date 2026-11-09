<script lang="ts">
  /**
   * A printable collection report (round eighty-seven, t3; plan F11): every plant on one sheet of record, with its
   * photograph, number, name, provenance, source and papers, for an insurer or a society show. Made on this device from the
   * collection, and printed or saved as a PDF through the browser's own print dialog; nothing is sent anywhere. The screen
   * shows what the paper will hold; the print stylesheet keeps each plant whole on its page and leaves the app around it
   * out.
   */
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, kindOf, type Accession } from '$lib/db/types';
  import { localDate } from '$core/dates';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import PlantName from '$lib/ui/PlantName.svelte';
  import Opening from '$lib/db/Opening.svelte';
  import { spendOf, amountWords } from '$lib/ui/grow/spend';
  import { DOC_WORDS } from '$lib/attach/attach';
  import { seasonOf, seasonWords } from '$core/season';
  import { runs } from '$core/sheet';
  import { readSetting, writeSetting } from '$lib/ui/stored';

  onMount(() => { void collection.load(); });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Collection report' }]);
    return () => setCrumb([]);
  });
  /** The report's choices, kept on this device as the labels' are. */
  const KEY = 'cultifolio.report';
  const kept = (() => { try { const o = JSON.parse(readSetting(KEY, 'device') ?? 'null'); return o && typeof o === 'object' ? (o as Record<string, unknown>) : {}; } catch { return {}; } })();
  let which = $state<'growing' | 'all'>(kept.which === 'all' ? 'all' : 'growing');
  let withPhotos = $state(kept.photos !== false);
  let withPrices = $state(kept.prices === true);
  let withNotes = $state(kept.notes === true);
  let armed = false;
  $effect(() => { const v = JSON.stringify({ which, photos: withPhotos, prices: withPrices, notes: withNotes }); if (!armed) { armed = true; return; } writeSetting(KEY, 'device', v); });

  const plants = $derived(collection.ready ? [...collection.accessions].filter((a) => which === 'all' || a.status === 'growing').sort((a, b) => accNo(a).localeCompare(accNo(b), undefined, { numeric: true })) : []);
  const spend = $derived(spendOf(plants.map((a) => a.price)));
  const made = localDate();
  const provWords: Record<string, string> = { wild: 'wild-collected', f1: 'F1 from wild-collected seed', fn: 'cultivated seed', veg: 'vegetative', unknown: 'not stated' };
  const sourceOf = (a: Accession) => [a.sourceFrom, a.sourceRef, a.acquired ? `acquired ${a.acquired}` : null].filter(Boolean).join(' · ');
  const placeOf = (a: Accession) => (a.locationId && collection.location(a.locationId) ? collection.locationName(a.locationId) : null);
  const statusWords = (a: Accession) => (a.status === 'growing' ? null : a.status === 'dead' ? 'died' : 'archived');
</script>

<svelte:head><title>Collection report · Cultifolio</title>{@html '<style>@media print { @page { margin: 14mm; } }</style>'}</svelte:head>

<div class="ui">
  <PageHead title="Collection report" kick="My plants" places={false} sub="Every plant with its photograph, number, name, provenance and papers, to print or save as a PDF from the print dialog. Made on this device; nothing is sent." />
  <div class="cult opts">
    <div class="body row">
      <label class="field"><span>Plants</span><select id="rp-which" bind:value={which}><option value="growing">Growing</option><option value="all">All, archived and dead too</option></select></label>
      <label class="check"><input id="rp-photos" type="checkbox" bind:checked={withPhotos} /> Photographs</label>
      <label class="check"><input id="rp-prices" type="checkbox" bind:checked={withPrices} /> Prices</label>
      <label class="check"><input id="rp-notes" type="checkbox" bind:checked={withNotes} /> Notes</label>
      <span class="grow"></span>
      <button id="rp-print" class="btn pri" type="button" onclick={() => window.print()} disabled={!plants.length}>Print the report</button>
    </div>
  </div>
</div>

{#if !collection.ready}
  <div class="cult" id="rp-opening"><Opening cls="none" /></div>
{:else if !plants.length}
  <p class="muted" id="rp-none">{collection.accessions.length ? 'No growing plant; choose "All" to report the archived and dead ones.' : 'No plants yet.'}</p>
{:else}
  <article class="report" id="report">
    <header class="rhead">
      <h1>Collection report</h1>
      <p>{plants.length} {plants.length === 1 ? 'plant' : 'plants'}{which === 'growing' ? ' growing' : ''}, made {made} on this device by Cultifolio from the grower's own records.{#if withPrices && spend.counted}{' '}Prices as entered: {amountWords(spend)}{spend.skipped ? `; ${spend.skipped} ${spend.skipped === 1 ? 'price' : 'prices'} not read as an amount` : ''}; no currency is converted.{/if}</p>
    </header>
    <ol class="plants">
      {#each plants as a (a.id)}
        {@const cover = withPhotos ? collection.cover(a.id) : undefined}
        {@const papers = collection.attachments(a.id)}
        {@const season = seasonOf(a)}
        <li class="plant" class:nophoto={!withPhotos}>
          {#if withPhotos}<div class="pic">{#if cover}<PhotoImg id={cover.id} size="full" alt="" />{:else}<span class="nopic">No photograph</span>{/if}</div>{/if}
          <div class="facts">
            <p class="no">{accNo(a)}{#if statusWords(a)}<span class="st"> · {statusWords(a)}</span>{/if}</p>
            <p class="nm"><PlantName plant={a} /></p>
            <dl>
              {#if kindOf(a) === 'hybrid' && a.parentage}<dt>Parentage</dt><dd>{a.parentage}</dd>{/if}
              {#if a.fieldNumber}<dt>Field number</dt><dd>{a.fieldNumber}</dd>{/if}
              <dt>Provenance</dt><dd>{provWords[a.provenance ?? 'unknown'] ?? a.provenance}</dd>
              {#if sourceOf(a)}<dt>Source</dt><dd>{sourceOf(a)}</dd>{/if}
              {#if withPrices && a.price}<dt>Price</dt><dd>{a.price}</dd>{/if}
              {#if placeOf(a)}<dt>Kept</dt><dd>{placeOf(a)}</dd>{/if}
              {#if season}<dt>Season</dt><dd>{seasonWords(season.season)}{season.rest.length ? `, rests ${runs(season.rest)}` : ''}</dd>{/if}
              {#if papers.length}<dt>Papers</dt><dd>{papers.map((p) => `${DOC_WORDS[p.doc]} (${p.fileName})`).join('; ')}</dd>{/if}
              {#if withNotes && a.notes}<dt>Notes</dt><dd class="notes">{a.notes}</dd>{/if}
            </dl>
            {#if cover}<p class="pd">Photograph {cover.d}{cover.dFrom === 'added' ? ' (the day it was added)' : ''}</p>{/if}
          </div>
        </li>
      {/each}
    </ol>
    <footer class="rfoot">The photographs and the records are the grower's own. Names as the grower filed them; a species page on cultifolio.com gives each name's sources.</footer>
  </article>
{/if}

<style>
  .opts .body { padding: 12px 17px; font-family: var(--ui); }
  .row { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 16px; }
  .field { display: grid; gap: 4px; }
  .field > span { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .field select { font: inherit; font-size: var(--fs-md); padding: 7px 10px; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); max-width: 100%; }
  .check { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); min-height: var(--tap); }
  .grow { flex: 1; }
  .muted { color: var(--ink3); }
  .report { margin: 16px 0 40px; }
  .rhead h1 { font-size: var(--fs-xl, 1.5rem); margin: 0 0 4px; }
  .rhead p { margin: 0 0 12px; color: var(--ink2); font-size: var(--fs-md); }
  .plants { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
  .plant { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 14px; padding: 12px 0; border-top: 1px solid var(--rule); break-inside: avoid; page-break-inside: avoid; }
  .plant.nophoto { grid-template-columns: minmax(0, 1fr); }
  .pic { width: 160px; height: 160px; background: var(--rule2, var(--rule)); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .pic :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .nopic { font-size: var(--fs-sm); color: var(--ink3); }
  .facts p { margin: 0; }
  .no { font-family: var(--mono); font-weight: 700; font-size: var(--fs-md); font-variant-numeric: tabular-nums lining-nums; }
  .st { font-family: var(--ui); font-weight: 400; color: var(--ink3); }
  .nm { font-size: var(--fs-lg, 1.15rem); margin: 2px 0 6px !important; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 12px; margin: 0; font-size: var(--fs-md); }
  dt { color: var(--ink3); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .notes { white-space: pre-line; }
  .pd { font-size: var(--fs-sm); color: var(--ink3); margin-top: 6px !important; }
  .rfoot { margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--ink); font-size: var(--fs-sm); color: var(--ink3); }
  @media (max-width: 640px) {
    .plant { grid-template-columns: 96px minmax(0, 1fr); gap: 10px; }
    .pic { width: 96px; height: 96px; }
    dl { grid-template-columns: minmax(0, 1fr); }
    dt { margin-top: 4px; }
  }
  @media print {
    /* The report alone, black on white: the app around it is left off, as the labels page does. */
    :global(#topbar), :global(#tabbar), :global(footer), .ui, :global(.install), :global(.frostbar), :global(.clockbar), :global(.vaultnote), :global(.toastregion), :global(.cmppill), :global(.tray), :global(.demobar), :global(.backupnudge), :global(.iosfirst) { display: none !important; }
    :global(body) { background: #fff !important; color: #000 !important; }
    :global(main.wrap) { max-width: none !important; padding: 0 !important; }
    .report { margin: 0; color: #000; }
    .plant { grid-template-columns: 45mm minmax(0, 1fr); gap: 5mm; padding: 4mm 0; border-top-color: #999; }
    .plant.nophoto { grid-template-columns: minmax(0, 1fr); }
    .pic { width: 45mm; height: 45mm; background: #eee; }
    dt, .st, .pd, .rfoot, .rhead p { color: #333; }
    .rfoot { border-top-color: #000; }
  }
</style>

<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { site } from '$lib/ui/site.svelte';
  /**
   * Printable labels. Pick plants, pick a sheet, print. The page shows the
   * sheet at true size; @media print hides everything else and sets the page
   * size, so what you see is what the printer gets. A QR code on each label
   * opens the plant's page on this site.
   */
  import { onMount } from 'svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import { page } from '$app/state';
  import QRCode from 'qrcode';
  import { collection } from '$lib/db/collection.svelte';
  import { kindOf, type Accession } from '$lib/db/types';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { dossierForName } from '$lib/ui/index.svelte';
  import { slugify, speciesSlug, speciesOf } from '$core/names';
  import { careLine } from '$core/note';
  import type { Dossier } from '$dossier/schema';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';

  /** Sheet geometry in mm. Avery numbers are the common US and A4 stocks; the strip is for cutting by hand. */
  const SHEETS = [
    { k: '5160', label: 'Avery 5160 · 30 per sheet · 2⅝ × 1 in', page: [215.9, 279.4], cols: 3, rows: 10, w: 66.675, h: 25.4, left: 4.7625, top: 12.7, gapX: 3.175, gapY: 0, qr: true },
    { k: '5163', label: 'Avery 5163 · 10 per sheet · 4 × 2 in', page: [215.9, 279.4], cols: 2, rows: 5, w: 101.6, h: 50.8, left: 4.0, top: 12.7, gapX: 4.7, gapY: 0, qr: true },
    { k: '5167', label: 'Avery 5167 · 80 per sheet · 1¾ × ½ in (pot rim)', page: [215.9, 279.4], cols: 4, rows: 20, w: 44.45, h: 12.7, left: 7.3, top: 12.7, gapX: 7.6, gapY: 0, qr: false },
    { k: 'L7160', label: 'Avery L7160 · 21 per sheet · 63.5 × 38.1 mm (A4)', page: [210, 297], cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.2, top: 15.1, gapX: 2.5, gapY: 0, qr: true },
    { k: 'strip', label: 'Strips to cut · 70 × 18 mm · 3 across', page: [215.9, 279.4], cols: 3, rows: 14, w: 70, h: 18, left: 3, top: 10, gapX: 2, gapY: 1, qr: true }
  ] as const;
  type Sheet = (typeof SHEETS)[number];

  let sheetK = $state<Sheet['k']>('5160');
  const sheet = $derived(SHEETS.find((s) => s.k === sheetK)!);
  let skip = $state(0); // cells already used on a part-used sheet
  let withQr = $state(true);
  let withCare = $state(true);
  let withSource = $state(false);
  let q = $state('');
  let chosen = $state<Set<string>>(new Set());
  let qrs = $state<Record<string, string>>({});
  let care = $state<Record<string, string>>({});

  onMount(async () => {
    site.load();
    await collection.load();
    const acc = page.url.searchParams.get('acc');
    const loc = page.url.searchParams.get('loc');
    if (acc) chosen = new Set(acc.split(',').map((x) => collection.accession(x)?.id).filter((x): x is string => !!x)); // numbers or ids in the URL; identities inside
    else if (loc) chosen = new Set(collection.plantsAt(loc, true).map((a) => a.id));
    else chosen = new Set(collection.accessions.filter((a) => a.status === 'growing').map((a) => a.id));
    try {
      const s = localStorage.getItem('cultifolio.labels');
      if (s) {
        const o = JSON.parse(s);
        if (SHEETS.some((x) => x.k === o.sheetK)) sheetK = o.sheetK;
        withQr = o.withQr ?? true;
        withCare = o.withCare ?? true;
        withSource = o.withSource ?? false;
      }
    } catch {
      /* fine */
    }
  });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Labels' }]);
    return () => setCrumb([]);
  });
  $effect(() => {
    try {
      localStorage.setItem('cultifolio.labels', JSON.stringify({ sheetK, withQr, withCare, withSource }));
    } catch {
      /* fine */
    }
  });

  const all = $derived(collection.accessions.filter((a) => a.status === 'growing' || chosen.has(a.id)));
  const filtered = $derived(all.filter((a) => !q.trim() || `${accNo(a)} ${a.taxonName} ${a.cultivar ?? ''} ${a.fieldNumber ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const picked = $derived(all.filter((a) => chosen.has(a.id)));
  const toggle = (id: string) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    chosen = n;
  };
  const pickAll = (on: boolean) => (chosen = on ? new Set([...chosen, ...filtered.map((a) => a.id)]) : new Set([...chosen].filter((id) => !filtered.some((a) => a.id === id))));

  // One request per species, not per plant: five Astrophytum labels share one dossier.
  const dossiers = new Map<number, Promise<Dossier | 'none' | null>>();
  const fetchDossier = (key: number) => { let p = dossiers.get(key); if (!p) { p = fetch(`/api/dossier/${key}`).then((r): Promise<Dossier | 'none' | null> => (r.ok ? (r.json() as Promise<Dossier>) : Promise.resolve(r.status === 404 ? 'none' : null))).catch(() => null); dossiers.set(key, p); } return p; };
  async function dossierFor(a: Accession): Promise<Dossier | null> {
    const d = await dossierForName<Dossier>(a.taxonName, a.taxonKey, fetchDossier, (k) => { if (a.taxonKey !== k) collection.put('accession', a.id, { taxonKey: k }); });
    return d && d !== 'none' ? d : null;
  }
  // QR codes and care lines are made once per plant, lazily.
  $effect(() => {
    for (const a of picked) {
      if (withQr && !qrs[a.id]) QRCode.toString(`${location.origin}/plants/${a.id}`, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 }).then((svg) => (qrs = { ...qrs, [a.id]: svg }));
      if (withCare && care[a.id] === undefined && kindOf(a) !== 'hybrid') {
        care = { ...care, [a.id]: '' };
        // The plant's own key first (one small file, the one the offline worker keeps); the index only for a plant without one.
        dossierFor(a).then(async (d) => {
          const readerLat = site.current?.lat ?? collection.locations.map((l) => l.lat).find((x): x is number => x != null) ?? null;
          const line = careLine({ scientific: a.taxonName, family: d?.name.family, months: d?.climate.status === 'ok' ? d.climate.months : null, extremes: d?.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, lat: d?.centroid?.lat ?? null, units: units.current }, { readerLat });
          care = { ...care, [a.id]: line };
        });
      }
    }
  });

  /** Cells per page, with `skip` blanks first; then pages. */
  const perPage = $derived(sheet.cols * sheet.rows);
  const cells = $derived<Array<Accession | null>>([...Array(skip).fill(null), ...picked]);
  const pages = $derived(Array.from({ length: Math.max(1, Math.ceil(cells.length / perPage)) }, (_, p) => cells.slice(p * perPage, (p + 1) * perPage)));
  const sourceLine = (a: Accession) => [a.sourceFrom, a.acquired].filter(Boolean).join(' · ');
  const tiny = $derived(sheet.h < 16);
</script>

<svelte:head>
  <title>Labels — Cultifolio</title>
  {@html `<style>@page { size: ${sheet.page[0]}mm ${sheet.page[1]}mm; margin: 0; }</style>`}
</svelte:head>

<div class="ui">
  <PageHead title="Labels" kick="My plants" places={false} sub="Pick plants and a sheet, then print at 100%; each label carries the number, the name and a code that opens the plant." />

  <div class="cult opts">
    <div class="body">
      <div class="row">
        <label class="field"><span>Sheet</span><select id="lb-sheet" bind:value={sheetK}>{#each SHEETS as s}<option value={s.k}>{s.label}</option>{/each}</select></label>
        <label class="field"><span>Skip used cells</span><input id="lb-skip" type="number" min="0" max={perPage - 1} bind:value={skip} /></label>
        <label class="check"><input type="checkbox" bind:checked={withQr} disabled={!sheet.qr} /> QR code{#if !sheet.qr} <span class="faint">(too small)</span>{/if}</label>
        <label class="check"><input type="checkbox" bind:checked={withCare} /> Care line</label>
        <label class="check"><input type="checkbox" bind:checked={withSource} /> Source and date</label>
        <span class="grow"></span>
        <button id="lb-print" class="btn pri" onclick={() => window.print()} disabled={!picked.length}>Print {picked.length} {picked.length === 1 ? 'label' : 'labels'}</button>
      </div>
    </div>
  </div>

  <div class="secrule"><h2>Plants</h2><div class="line"></div><span class="n">{picked.length} of {all.length} picked</span></div>
  <div class="toolrow" style="position: static">
    <input id="lb-q" class="searchbar" type="search" placeholder="Filter by name, number, field number…" aria-label="Filter plants" bind:value={q} />
    <button class="chipbtn" onclick={() => pickAll(true)}>Pick all shown</button>
    <button class="chipbtn" onclick={() => pickAll(false)}>Clear shown</button>
  </div>
  <div class="cult picklist">
    {#each filtered as a (a.id)}
      <label class="pick"><input type="checkbox" checked={chosen.has(a.id)} onchange={() => toggle(a.id)} /><span class="accno">{accNo(a)}</span><span class="nm"><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</span>{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span class="faint">{collection.locationName(a.locationId)}</span>{/if}</label>
    {:else}
      <div class="none">No plants match.</div>
    {/each}
  </div>

  <div class="secrule"><h2>Preview</h2><div class="line"></div><span class="n">{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span></div>
  <p class="small muted previewnote">The sheet is shown at its true size, {sheet.page[0]} mm wide; on a narrow screen it scrolls sideways.</p>
</div>

<div class="sheets" style="--pw: {sheet.page[0]}mm; --ph: {sheet.page[1]}mm; --lw: {sheet.w}mm; --lh: {sheet.h}mm; --left: {sheet.left}mm; --top: {sheet.top}mm; --gx: {sheet.gapX}mm; --gy: {sheet.gapY}mm; --cols: {sheet.cols}">
  {#each pages as cellsOnPage, pi}
    <div class="page" class:tiny>
      {#each cellsOnPage as a, i}
        {@const col = i % sheet.cols}
        {@const row = Math.floor(i / sheet.cols)}
        <div class="label" style="left: calc(var(--left) + {col} * (var(--lw) + var(--gx))); top: calc(var(--top) + {row} * (var(--lh) + var(--gy)))">
          {#if a}
            {#if withQr && sheet.qr && qrs[a.id]}<div class="qr">{@html qrs[a.id]}</div>{/if}
            <div class="txt">
              <div class="no">{accNo(a)}{#if a.fieldNumber} <span class="fn">{a.fieldNumber}</span>{/if}</div>
              <div class="sci"><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}<span class="cv">‘{a.cultivar}’</span>{/if}{#if kindOf(a) === 'hybrid' && a.parentage}{' '}<span class="cv">({a.parentage})</span>{/if}</div>
              {#if withCare && care[a.id]}<div class="care">{care[a.id]}</div>{/if}
              {#if withSource && sourceLine(a)}<div class="src">{sourceLine(a)}</div>{/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style>
  .opts .body { padding: 12px 17px; font-family: var(--ui); }
  .picklist { font-family: var(--ui); }
  .row { display: flex; flex-wrap: wrap; align-items: end; gap: 10px 16px; }
  .field { display: grid; gap: 4px; }
  .field > span { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .field select, .field input { font: inherit; font-size: 13.5px; padding: 7px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--card); color: var(--ink); }
  .field input { width: 5em; }
  .check { display: flex; align-items: center; gap: 6px; font-size: 13.5px; padding-bottom: 8px; }
  .grow { flex: 1; }
  .faint { color: var(--ink3); }
  .picklist { max-height: 320px; overflow: auto; padding: 4px 8px; }
  .pick { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: 7px; cursor: pointer; font-size: 14px; }
  .pick:hover { background: var(--sunk); }
  .pick .nm { font-family: var(--serif); font-size: 15px; }
  .pick .faint { margin-left: auto; font-size: 12px; }
  .none { padding: 14px; color: var(--ink3); font-style: italic; }

  /* The sheet, at true size on screen and on paper. */
  .sheets { margin: 12px 0 40px; display: grid; gap: 16px; overflow-x: auto; }
  .page { position: relative; width: var(--pw); height: var(--ph); background: #fff; box-shadow: var(--sh2); color: #000; }
  .label { position: absolute; width: var(--lw); height: var(--lh); display: flex; gap: 1.5mm; padding: 1.6mm 2mm; box-sizing: border-box; overflow: hidden; outline: 0.2mm dashed #bbb; outline-offset: -0.2mm; }
  /* The code never takes more than 22 mm: on a tall label (4 × 2 in) the name, not the code, gets the room. */
  .qr { flex: none; height: 100%; max-height: 22mm; aspect-ratio: 1; align-self: center; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; justify-content: center; line-height: 1.15; }
  .no { font-family: var(--mono); font-size: 7.5pt; font-weight: 700; letter-spacing: 0.02em; }
  .no .fn { font-weight: 400; color: #333; margin-left: 1mm; }
  /* A name is never cut to "…": it wraps to a second line before anything else gives way. */
  .sci { font-family: var(--serif); font-size: 9.5pt; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sci .cv { font-style: normal; font-weight: 500; }
  .care { font-family: var(--ui); font-size: 6.2pt; color: #222; margin-top: 0.6mm; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; }
  .src { font-family: var(--ui); font-size: 6pt; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page.tiny .label { padding: 0.8mm 1.5mm; }
  .page.tiny .no { font-size: 6pt; }
  .page.tiny .sci { font-size: 7pt; -webkit-line-clamp: 1; line-clamp: 1; }
  .page.tiny .care, .page.tiny .src { display: none; }

  @media print {
    :global(body) { background: #fff !important; }
    :global(#topbar), :global(#tabbar), :global(footer), .ui { display: none !important; }
    :global(main.wrap) { max-width: none !important; padding: 0 !important; margin: 0 !important; }
    .sheets { margin: 0; gap: 0; overflow: visible; display: block; }
    .page { box-shadow: none; page-break-after: always; break-after: page; margin: 0; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .label { outline: 0; }
  }
</style>

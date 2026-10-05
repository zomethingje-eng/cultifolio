<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import NotChecked from '$lib/ui/NotChecked.svelte';
  import { units } from '$lib/ui/units.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { site, readerLat } from '$lib/ui/site.svelte';
  import { defaultSheet } from '$lib/ui/label-sheet';
  /**
   * Printable labels. Pick plants, pick a sheet, print. The page shows the
   * sheet at true size; @media print hides everything else and sets the page
   * size, so what you see is what the printer gets. A QR code on each label
   * opens the plant's page on this site.
   */
  import { onMount } from 'svelte';
  import { accNo, PROP_METHODS } from '$lib/db/types';
  import { page } from '$app/state';
  import QRCode from 'qrcode';
  import { collection } from '$lib/db/collection.svelte';
  import { kindOf, sowNo, type Accession, type Sowing } from '$lib/db/types';
  /**
   * What a label is printed for: a plant, or a propagation batch (round forty-one, R10). A seed sower labels trays
   * first; the batch label carries the number, the name, the date sown and the count, and its code opens the batch.
   */
  type Item = { id: string; batch: boolean; no: string; taxonName: string; cultivar: string | null; fieldNumber: string | null; parentage: string | null; taxonKey: number | null; locationId: string | null; sourceFrom: string | null; when: string | null; count: number | null; method: string | null; rec: Accession | Sowing };
  const ofPlant = (a: Accession): Item => ({ id: a.id, batch: false, no: accNo(a), taxonName: a.taxonName, cultivar: a.cultivar ?? null, fieldNumber: a.fieldNumber ?? null, parentage: a.parentage ?? null, taxonKey: a.taxonKey ?? null, locationId: a.locationId ?? null, sourceFrom: a.sourceFrom ?? null, when: a.acquired ?? null, count: null, method: null, rec: a });
  const ofBatch = (s: Sowing): Item => ({ id: s.id, batch: true, no: sowNo(s), taxonName: s.taxonName, cultivar: s.cultivar ?? null, fieldNumber: s.fieldNumber ?? null, parentage: s.parentage ?? null, taxonKey: s.taxonKey ?? null, locationId: s.locationId ?? null, sourceFrom: s.sourceFrom ?? null, when: s.sown ?? null, count: s.count ?? null, method: s.method ?? null, rec: s });
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { sheetForName, sheetsFor, type Sheet as SpeciesSheet } from '$lib/ui/index.svelte';
  import { slugify, speciesSlug, speciesOf } from '$core/names';
  import { numberOrNull } from '$core/units';
  import { careLine } from '$core/note';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import PlantName from '$lib/ui/PlantName.svelte';
  import { plantQrUrl } from '$lib/ui/grow'; // round sixty, agent F: the species in the code's fragment

  /** Sheet geometry in mm. Avery numbers are the common US and A4 stocks; the strip is for cutting by hand. */
  const SHEETS = [
    { k: '5160', label: 'Avery 5160 · 30 per sheet · 2⅝ × 1 in', page: [215.9, 279.4], cols: 3, rows: 10, w: 66.675, h: 25.4, left: 4.7625, top: 12.7, gapX: 3.175, gapY: 0, qr: true },
    { k: '5163', label: 'Avery 5163 · 10 per sheet · 4 × 2 in', page: [215.9, 279.4], cols: 2, rows: 5, w: 101.6, h: 50.8, left: 4.0, top: 12.7, gapX: 4.7, gapY: 0, qr: true },
    { k: '5167', label: 'Avery 5167 · 80 per sheet · 1¾ × ½ in (pot rim)', page: [215.9, 279.4], cols: 4, rows: 20, w: 44.45, h: 12.7, left: 7.3, top: 12.7, gapX: 7.6, gapY: 0, qr: false },
    { k: 'L7160', label: 'Avery L7160 · 21 per sheet · 63.5 × 38.1 mm (A4)', page: [210, 297], cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.2, top: 15.1, gapX: 2.5, gapY: 0, qr: true },
    { k: 'strip', label: 'Strips to cut · 70 × 18 mm · 3 across', page: [215.9, 279.4], cols: 3, rows: 14, w: 70, h: 18, left: 3, top: 10, gapX: 2, gapY: 1, qr: true }
  ] as const;
  type Sheet = (typeof SHEETS)[number];

  // US Letter stock for the US and Canada, A4 for everyone else, until the grower picks one (it is remembered then): en-GB
  // opened on Avery 5160 and a first print came out on the wrong paper (round sixty; the grower review, 9).
  let sheetK = $state<Sheet['k']>(defaultSheet(typeof navigator !== 'undefined' ? navigator.language : undefined));
  const sheet = $derived(SHEETS.find((s) => s.k === sheetK)!);
  let skip = $state<number | null>(0); // cells already used on a part-used sheet; null once cleared (Svelte binds an emptied number input to null)
  /** The skip as a whole number inside the sheet: a cleared box is 0, 2.5 is 2, 99 on a 30-cell sheet is 29 (round thirteen, 10). */
  let withQr = $state(true);
  let withCare = $state(true);
  let withSource = $state(false);
  let q = $state('');
  let chosen = $state<Set<string>>(new Set());
  /** What the link picked (?acc=, ?batch=, ?loc=): listed first, so ten plants just potted up are not scattered through three hundred (round fifty-eight; the grower review). */
  let arrived = $state<Set<string>>(new Set());
  /** Numbers in the link that name more than one plant: picked by nobody, said under the head. */
  let ambiguous = $state<string[]>([]);
  let qrs = $state<Record<string, string>>({});
  const qrInflight = new Set<string>();
  let care = $state<Record<string, string | null>>({}); // '' while asked, null when the reference was not reached

  onMount(async () => {
    site.load();
    await collection.load();
    const acc = page.url.searchParams.get('acc');
    const batch = page.url.searchParams.get('batch');
    const loc = page.url.searchParams.get('loc');
    if (acc) {
      // Numbers or ids in the URL; identities inside. A number two plants share picks neither, and says so: picking one
      // by load order printed a label for the wrong plant (round sixty; the self-review's 2).
      const ids: string[] = [];
      const shared: string[] = [];
      for (const x of acc.split(',')) {
        const hits = collection.withNumber('accession', x);
        if (hits.length > 1) shared.push(x);
        else if (hits[0]) ids.push(hits[0].id);
      }
      chosen = new Set(ids);
      ambiguous = shared;
    }
    else if (batch) chosen = new Set(batch.split(',').map((x) => collection.sowing(x)?.id).filter((x): x is string => !!x)); // a tray's label from the batch page (round forty-one, R10)
    else if (loc) chosen = new Set(collection.plantsAt(loc, true).map((a) => a.id));
    if (acc || batch || loc) arrived = new Set(chosen);
    else {
      // From the menu: every growing plant is picked when they fit a sheet or two; past that nothing is, since a tap
      // on Print was three hundred labels, and "Pick all shown" is one tap (round forty-nine, 3).
      const growing = collection.accessions.filter((a) => a.status === 'growing');
      chosen = new Set(growing.length <= 24 ? growing.map((a) => a.id) : []);
    }
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

  const all = $derived<Item[]>([...collection.accessions.filter((a) => a.status === 'growing' || chosen.has(a.id)).map(ofPlant), ...collection.sowings.filter((b) => b.status === 'active' || chosen.has(b.id)).map(ofBatch)]);
  // The filter reads the place and the source too, and matches every word, as the plants list does: "Windowsill" and "Mesa" find their plants (round twenty-six, 15).
  const filtered = $derived.by(() => { const words = q.toLowerCase().split(/\s+/).filter(Boolean); return all.filter((a) => { const hay = `${a.no} ${a.taxonName} ${a.cultivar ?? ''} ${a.fieldNumber ?? ''} ${a.locationId ? collection.locationName(a.locationId) : ''} ${a.sourceFrom ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); }); });
  const picked = $derived(all.filter((a) => chosen.has(a.id)));
  // A stable split, not a re-sort: within each part the list keeps its own order (round fifty-eight; the grower review).
  const arrivedFirst = (xs: Item[]) => (arrived.size ? [...xs.filter((x) => arrived.has(x.id)), ...xs.filter((x) => !arrived.has(x.id))] : xs);
  const plantsShown = $derived(arrivedFirst(filtered.filter((x) => !x.batch)));
  const batchesShown = $derived(arrivedFirst(filtered.filter((x) => x.batch)));
  /** No plant on file at all, said as such rather than as an empty picker; a filter that matches nothing is a different sentence (round fifty-eight; the grower review). */
  const noPlants = $derived(collection.ready && !collection.accessions.length);
  const toggle = (id: string) => {
    const n = new Set(chosen);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    chosen = n;
  };
  /** Pick or clear what one section shows under the filter: plants from the plants' row, batches from the batches' own; one button for both picked the seed tray a grower had already labelled (round sixty; the grower review, 10). */
  const pickAll = (on: boolean, batch = false) => { const shown = new Set((batch ? batchesShown : plantsShown).map((a) => a.id)); chosen = on ? new Set([...chosen, ...shown]) : new Set([...chosen].filter((id) => !shown.has(id))); }; // a set, not a scan per id (round fifty-two, 5)

  /** A plant's species sheet, by hash bucket: the labels page never names or keys the species it prints. Five Astrophytum labels are one lookup in one cached bucket. */
  async function dossierFor(a: Item): Promise<SpeciesSheet | null | 'unreachable'> {
    const d = await sheetForName(a.taxonName, a.taxonKey); // read, never written back: printing a label is not an edit (round fifty-eight)
    return d === null ? 'unreachable' : d === 'none' ? null : d;
  }
  /** Care lines that could not be made because the reference was not reached: said on the sheet and on the page, never printed as if the species had no data (round thirteen, 6). */
  const unchecked = $derived(picked.filter((a) => care[a.id] === null));
  /** Plants whose species' climate was refused when the reference was built: printed as "climate not checked", counted on the page (round fifteen, 5). */
  const refused = $derived(picked.filter((a) => care[a.id] === 'climate not checked'));
  /** And those whose climate is still to be built: said apart from a refusal (round fifty-two, 6). */
  const stillPending = $derived(picked.filter((a) => care[a.id] === 'climate pending'));
  /** Plants whose species has a climate but whose daily extremes source refused: the care line prints without the habitat night rather than with a warmer, different figure (round seventeen, 7). */
  // Reactive sets mutated in place: a copy of the set per answer was quadratic over a thousand plants (round fifty-two, 5).
  const nightOff = new SvelteSet<string>();
  const nightOffCount = $derived(picked.filter((a) => nightOff.has(a.id)).length);
  /** Plants whose sheet has been asked for and not yet answered: its own set, since an answer can be an empty line (a species with no climate) and must count as answered (round fourteen, 3). */
  const asking = new SvelteSet<string>();
  const pending = $derived(withCare && picked.some((a) => asking.has(a.id)));
  function retryCare() {
    const again: Record<string, string | null> = { ...care };
    for (const a of unchecked) delete again[a.id];
    care = again;
  }
  // QR codes and care lines are made once per plant, lazily.
  $effect(() => {
    // Every bucket the picked plants need, asked for in one request; the per-plant lookups below then find their bucket cached.
    // Asked once per plant, not once per effect run: every answer re-ran the effect, which asked for every slug again (round fifty-two, 5).
    if (withCare) { const slugs = picked.filter((a) => care[a.id] === undefined && !asking.has(a.id) && kindOf(a.rec) !== 'hybrid').map((a) => speciesSlug(a.taxonName)); if (slugs.length) void sheetsFor(slugs); }
    // The codes are made in one batch and assigned once: one assignment per code copied the whole map each time, which
    // with fifteen hundred plants was thirty seconds with the page frozen (round fifty-one, 5).
    // A stock with no room for a code makes none (round fifty-eight; the grower review).
    const needQr = withQr && sheet.qr ? picked.filter((a) => !qrs[a.id] && !qrInflight.has(a.id)) : [];
    if (needQr.length) {
      for (const a of needQr) qrInflight.add(a.id);
      void Promise.all(needQr.map((a) => QRCode.toString(a.batch ? `${location.origin}/propagation/${a.id}` : plantQrUrl(location.origin, a.rec as Accession), { type: 'svg', errorCorrectionLevel: 'M', margin: 0 }).then((svg) => [a.id, svg] as const, () => [a.id, ''] as const))).then((pairs) => {
        const next = { ...qrs };
        for (const [id, svg] of pairs) { if (svg) next[id] = svg; qrInflight.delete(id); }
        qrs = next;
      });
    }
    for (const a of picked) {
      if (withCare && care[a.id] === undefined && !asking.has(a.id) && kindOf(a.rec) !== 'hybrid') {
        asking.add(a.id);
        const done = () => { asking.delete(a.id); };
        dossierFor(a).then(async (d) => {
          done();
          if (d === 'unreachable') { care[a.id] = null; return; } // not "no data": not reached
          const lat = readerLat(collection.locations); // the site, else the first place with coordinates: one helper with Today and the plant page (round sixty)
          const line = careLine({ scientific: a.taxonName, climateStatus: d?.climate.status, family: d?.name.family, months: d?.climate.status === 'ok' ? d.climate.months : null, extremes: d?.climate.status === 'ok' ? (d.climate.extremes ?? null) : null, extremesStatus: d?.climate.status === 'ok' ? d.climate.extremesStatus : null, lat: d?.habitatLat ?? null, units: units.current }, { readerLat: lat });
          care[a.id] = line; // one key, not a copy of the map per answer (round fifty-one, 5)
          if (d && d.climate.status === 'ok' && !d.climate.extremes) nightOff.add(a.id); // the night is left off this label; counted below (round seventeen, 7)
        }).catch(() => { done(); care[a.id] = null; });
      }
    }
  });

  /** Cells per page, with `skip` blanks first; then pages. */
  const perPage = $derived(sheet.cols * sheet.rows);
  const skipN = $derived(Math.min(Math.max(0, Math.floor(numberOrNull(skip) ?? 0)), Math.max(0, perPage - 1)));
  const cells = $derived<Array<Item | null>>([...Array(skipN).fill(null), ...picked]);
  // The box says what the sheet uses: 99 typed on a 30-cell sheet, or 25 left over from a 30-cell sheet after choosing a
  // 24-cell one, becomes the clamped figure in the box itself, not only in the print (round twenty-three, 18).
  $effect(() => {
    if (skip != null && skip !== skipN && (skip < 0 || skip > perPage - 1 || !Number.isInteger(skip))) skip = skipN;
  });
  const pages = $derived(Array.from({ length: Math.max(1, Math.ceil(cells.length / perPage)) }, (_, p) => cells.slice(p * perPage, (p + 1) * perPage)));
  const sourceLine = (a: Item) => [a.sourceFrom, a.when].filter(Boolean).join(' · ');
  /** A batch's own line: the date sown, the count, the method. */
  // The method's own unit and verb: "12 cuttings, started", not "sown … 12 cutting" (round fifty-eight).
  const batchLine = (a: Item) => {
    const m = PROP_METHODS.find((x) => x.k === (a.method ?? 'seed')) ?? PROP_METHODS[0];
    const unit = a.count === 1 ? (m.unit === 'leaves' ? 'leaf' : m.unit.replace(/s$/, '')) : m.unit;
    return [a.when ? `${m.veg ? 'started' : 'sown'} ${a.when}` : null, a.count != null ? `${a.count} ${unit}` : null].filter(Boolean).join(' · ');
  };
  const tiny = $derived(sheet.h < 16);
</script>

<svelte:head>
  <title>Labels · Cultifolio</title>
  {@html `<style>@page { size: ${sheet.page[0]}mm ${sheet.page[1]}mm; margin: 0; }</style>`}
</svelte:head>

<div class="ui">
  <PageHead title="Labels" kick="My plants" places={false} sub="Pick plants or batches and a sheet, then print at 100%; each label carries the number, the name and a code that opens the record." />
  {#if ambiguous.length}<p class="notice" id="lb-ambiguous" role="status">{ambiguous.join(', ')} {ambiguous.length === 1 ? 'is the number of more than one plant' : 'are each the number of more than one plant'}, so {ambiguous.length === 1 ? 'it was' : 'they were'} not picked: tick the one you mean below, or renumber one from its page.</p>{/if}

  <div class="cult opts">
    <div class="body">
      <div class="row">
        <label class="field"><span>Sheet</span><select id="lb-sheet" bind:value={sheetK}>{#each SHEETS as s}<option value={s.k}>{s.label}</option>{/each}</select></label>
        <label class="field"><span>Skip used cells</span><input id="lb-skip" type="number" min="0" max={perPage - 1} bind:value={skip} onchange={() => (skip = skipN)} /></label>
        <!-- A stock that cannot carry a code shows the box empty, not ticked and greyed: a ticked box read as "the code will print" on 5167. The choice is kept for the next sheet that can (round fifty-eight; the grower review). -->
        <label class="check"><input id="lb-qr" type="checkbox" checked={withQr && sheet.qr} onchange={(e) => (withQr = e.currentTarget.checked)} disabled={!sheet.qr} aria-describedby={sheet.qr ? undefined : 'lb-qr-why'} /> QR code{#if !sheet.qr}{' '}<span class="faint small" id="lb-qr-why">(not on this stock: at {sheet.h} mm tall the label has no room for a code)</span>{/if}</label>
        <label class="check"><input type="checkbox" bind:checked={withCare} /> Care line</label>
        <label class="check"><input type="checkbox" bind:checked={withSource} /> Source and date</label>
        <span class="grow"></span>
        <button id="lb-print" class="btn pri" onclick={() => window.print()} disabled={!picked.length || pending}>{pending ? 'Reading the reference…' : `Print ${picked.length} ${picked.length === 1 ? 'label' : 'labels'}`}</button>
      </div>
      {#if withCare && stillPending.length}
        <p class="small muted" role="status">{stillPending.length === 1 ? 'One care line' : `${stillPending.length} care lines`} say "climate pending": the reference has not built that species' climate yet.</p>
      {/if}
      {#if withCare && refused.length}
        <p class="small muted" role="status">{refused.length === 1 ? 'One care line' : `${refused.length} care lines`} <NotChecked inline why="The climate source did not answer when the species page was built." />: the preview marks {refused.length === 1 ? 'it' : 'them'}; the printed labels leave {refused.length === 1 ? 'it' : 'them'} blank.</p>
      {/if}
      {#if withCare && nightOffCount}
        <!-- "so not used", not "set aside": what it means (round fifty-eight; the accessibility review). -->
        <p class="small muted" role="status">{nightOffCount === 1 ? 'One label prints' : `${nightOffCount} labels print`} no habitat night: the species has no daily extremes series on file (none read, the source did not answer or was not asked, or it was read at a weather cell that is mostly sea and so not used); the mean night is a different, warmer figure, so it is left off rather than printed in its place.</p>
      {/if}
      {#if withCare && unchecked.length}
        <div class="notice" id="lb-unchecked" role="status">{unchecked.length === 1 ? 'One care line' : `${unchecked.length} care lines`} <NotChecked inline why="The species reference could not be reached from here." />: the preview marks {unchecked.length === 1 ? 'it' : 'them'}; the printed labels leave {unchecked.length === 1 ? 'it' : 'them'} blank. <button type="button" class="linkish" onclick={retryCare}>Try again</button> before printing.</div>
      {/if}
    </div>
  </div>

  <div class="secrule"><h2>Plants</h2><div class="line"></div>{#if !noPlants}<span class="n">{picked.filter((x) => !x.batch).length} of {all.filter((x) => !x.batch).length} picked</span>{/if}</div>
  {#if noPlants}
    <!-- Nothing on file is said, with the way to fix it, not shown as an empty filter and an empty list (round fifty-eight; the grower review). -->
    <div class="cult picklist" id="lb-noplants"><p class="none">No plants yet. <a href="/plants/new">Add a plant</a> and its label can be printed here.</p></div>
  {:else}
  <div class="toolrow" style="position: static">
    <input id="lb-q" class="searchbar" type="search" placeholder="Filter by name, number, field number…" aria-label="Filter plants" bind:value={q} />
    <button class="chipbtn" id="lb-pick-plants" onclick={() => pickAll(true)}>Pick all shown</button>
    <button class="chipbtn" onclick={() => pickAll(false)}>Clear shown</button>
  </div>
  <div class="cult picklist">
    {#each plantsShown as a (a.id)}
      <label class="pick"><input type="checkbox" checked={chosen.has(a.id)} onchange={() => toggle(a.id)} /><span class="accno">{a.no}</span><span class="nm"><PlantName plant={a.rec} /></span>{#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span>{/if}{#if a.locationId}<span class="faint">{collection.locationName(a.locationId)}</span>{/if}</label>
    {:else}
      <!-- An empty filter is not "no match": with nothing typed, the plants on file are all past growing (round fifty-eight; the grower review). -->
      <div class="none">{q.trim() ? 'No plants match.' : 'No plant is growing; labels are made for growing plants and open batches.'}</div>
    {/each}
  </div>
  {/if}

  {#if batchesShown.length || collection.sowings.some((b) => b.status === 'active')}
    <div class="secrule"><h2>Batches</h2><div class="line"></div><span class="n">{picked.filter((x) => x.batch).length} of {all.filter((x) => x.batch).length} picked</span></div>
    {#if batchesShown.length}<div class="chiprow batchpick"><button class="chipbtn" id="lb-pick-batches" onclick={() => pickAll(true, true)}>Pick all shown batches</button><button class="chipbtn" onclick={() => pickAll(false, true)}>Clear shown batches</button></div>{/if}
    <div class="cult picklist" id="batch-picks">
      {#each batchesShown as a (a.id)}
        <label class="pick"><input type="checkbox" checked={chosen.has(a.id)} onchange={() => toggle(a.id)} /><span class="accno">{a.no}</span><span class="nm"><PlantName plant={a.rec} /></span><span class="faint">{batchLine(a)}</span></label>
      {:else}
        <div class="none">No batches match.</div>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>Preview</h2><div class="line"></div><span class="n">{pages.length} {pages.length === 1 ? 'page' : 'pages'}</span></div>
  <p class="small muted previewnote">The sheet is shown at its true size, {sheet.page[0]} mm wide; on a narrow screen it scrolls sideways.</p>
</div>

<!-- The preview scrolls sideways on a narrow screen: reachable and scrollable by keyboard, and named (round fifty-eight; the accessibility review). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="sheets" tabindex="0" role="region" aria-label="Label sheets as they will print" style="--pw: {sheet.page[0]}mm; --ph: {sheet.page[1]}mm; --lw: {sheet.w}mm; --lh: {sheet.h}mm; --left: {sheet.left}mm; --top: {sheet.top}mm; --gx: {sheet.gapX}mm; --gy: {sheet.gapY}mm; --cols: {sheet.cols}">
  {#each pages as cellsOnPage, pi}
    <div class="page" class:tiny>
      {#each cellsOnPage as a, i}
        {@const col = i % sheet.cols}
        {@const row = Math.floor(i / sheet.cols)}
        <div class="label" style="left: calc(var(--left) + {col} * (var(--lw) + var(--gx))); top: calc(var(--top) + {row} * (var(--lh) + var(--gy)))">
          {#if a}
            {#if withQr && sheet.qr && qrs[a.id]}<div class="qr">{@html qrs[a.id]}</div>{/if}
            <div class="txt">
              <div class="no">{a.no}{#if a.fieldNumber}{' '}<span class="fn">{a.fieldNumber}</span>{/if}</div>
              <div class="sci"><SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}<span class="cv">‘{a.cultivar}’</span>{/if}{#if kindOf(a.rec) === 'hybrid' && a.parentage}{' '}<span class="cv">({a.parentage})</span>{/if}</div>
              {#if a.batch && batchLine(a)}<div class="src">{batchLine(a)}</div>{/if}
              {#if withCare && care[a.id]}<div class="care" class:unchecked={care[a.id] === 'climate not checked' || care[a.id] === 'climate pending'}>{care[a.id]}</div>{:else if withCare && care[a.id] === null}<div class="care unchecked">care line not checked: the reference was not reached</div>{/if}
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
  .field > span { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .field select, .field input { font: inherit; font-size: var(--fs-md); padding: 7px 10px; min-height: var(--tap); border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .field input { width: 5em; }
  .check { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); padding-bottom: 8px; }
  .grow { flex: 1; }
  .faint { color: var(--ink3); }
  .picklist { max-height: 320px; overflow: auto; padding: 4px 8px; }
  .pick { display: flex; align-items: center; gap: 10px; padding: 7px 9px; border-radius: var(--r-sm); cursor: pointer; font-size: var(--fs-md); }
  .pick:hover { background: var(--sunk); }
  .pick .nm { font-family: var(--serif); font-size: var(--fs-base); }
  .pick .faint { margin-left: auto; font-size: var(--fs-sm); }
  .batchpick { margin: 0 0 8px; }
  @media (max-width: 640px) { .batchpick .chipbtn { min-height: 44px; } }
  .none { padding: 14px; margin: 0; color: var(--ink3); font-style: italic; }
  /* A row to tick and the option boxes are a thumb's tap on a phone: 44px (round fifty-eight; the grower review). */
  @media (max-width: 640px) { .pick, .check { min-height: 44px; } .check { padding-bottom: 0; } .toolrow .chipbtn { min-height: 44px; } }

  /* The sheet, at true size on screen and on paper. */
  .sheets { margin: 12px 0 40px; display: grid; gap: 16px; overflow-x: auto; }
  .page { position: relative; width: var(--pw); height: var(--ph); background: #fff; box-shadow: var(--sh2); color: #000; }
  /* A page off screen is not laid out until it scrolls near: fifty preview pages were twenty-six thousand nodes laid out at once (round fifty-one, 5). Print lays out every page. */
  @media screen { .page { content-visibility: auto; contain-intrinsic-size: auto var(--pw) auto var(--ph); } }
  .label { position: absolute; width: var(--lw); height: var(--lh); display: flex; gap: 1.5mm; padding: 1.6mm 2mm; box-sizing: border-box; overflow: hidden; outline: 0.2mm dashed #bbb; outline-offset: -0.2mm; }
  /* The code never takes more than 22 mm: on a tall label (4 × 2 in) the name, not the code, gets the room. */
  .qr { flex: none; height: 100%; max-height: 22mm; aspect-ratio: 1; align-self: center; }
  .qr :global(svg) { width: 100%; height: 100%; display: block; }
  .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; justify-content: center; line-height: 1.15; }
  /* The preview's text is the print's, at true size: 7.5 pt numbers and a 6 pt care line are what the label carries, and
     the point of the preview is to show what the sheet will hold. The accessibility review counted it as the only text
     under 11 px; that is kept on purpose, and the same words are on each plant's page at reading size (round sixty). */
  .no { font-family: var(--mono); font-size: 7.5pt; font-weight: 700; letter-spacing: 0.02em; }
  .no .fn { font-weight: 400; color: #333; margin-left: 1mm; }
  /* A name is never cut to "…": it wraps to a second line before anything else gives way. */
  .sci { font-family: var(--serif); font-size: 9.5pt; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .sci .cv { font-style: normal; font-weight: 500; }
  .care.unchecked { font-style: italic; color: #666; }
  @media print { .care.unchecked { display: none; } } /* on paper the line is simply blank: a label lives in a pot for years, and the notice belongs on the screen, not in the pot */
  .care { font-family: var(--ui); font-size: 6.2pt; color: #222; margin-top: 0.6mm; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; }
  .src { font-family: var(--ui); font-size: 6pt; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page.tiny .label { padding: 0.8mm 1.5mm; }
  .page.tiny .no { font-size: 6pt; }
  .page.tiny .sci { font-size: 7pt; -webkit-line-clamp: 1; line-clamp: 1; }
  .page.tiny .care, .page.tiny .src { display: none; }

  @media print {
    :global(body) { background: #fff !important; }
    :global(#topbar), :global(#tabbar), :global(footer), .ui { display: none !important; }
    /* The app around the page is hidden for every printed page by the theme; said again here, where a stray card costs a sheet of labels (round sixty; the self-review's 6). */
    :global(.install), :global(.frostbar), :global(.clockbar), :global(.vaultnote), :global(.toastregion), :global(.cmppill), :global(.tray) { display: none !important; }
    :global(main.wrap) { max-width: none !important; padding: 0 !important; margin: 0 !important; }
    .sheets { margin: 0; gap: 0; overflow: visible; display: block; }
    .page { box-shadow: none; page-break-after: always; break-after: page; margin: 0; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .label { outline: 0; }
  }
</style>

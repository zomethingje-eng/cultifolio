<script lang="ts">
  /**
   * Import (round sixty; the grower review's 2 and §4, the product review's 4, the self-review's experience item 4): a list
   * pasted one plant per line, or a spreadsheet saved as CSV, read on this device. Each name is checked against the
   * reference; a review list lets the grower fix or drop lines; "Add N plants" writes them through the collection's own add
   * functions, with the next free numbers (a sheet's own number is kept when it is free). Nothing is sent but the
   * reference lookups the add form already makes.
   */
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { accNo } from '$lib/db/types';
  import { getMeta } from '$lib/db/vault';
  import { localDate } from '$core/dates';
  import { parseName } from '$core/names';
  import { entriesFor, searchCatalogue } from '$lib/ui/index.svelte';
  import { parsePaste } from '$lib/import/paste';
  import { parseCsv, detectHeader, guessMapping, unmappedColumns, ambiguousDates, FIELDS, FIELD_LABEL, type Mapping, type Field } from '$lib/import/csv';
  import { rowsFromPaste, rowsFromSheet } from '$lib/import/rows';
  import { checkNames, checkKey, type NameCheck, type Lookup } from '$lib/import/check';
  import { planNumbers, placesToMake, resolvePlace, splitPath, markAlreadyImported, type ImportRow, type NumberPlan } from '$lib/import/plan';
  import { commitImport, type ImportResult } from '$lib/import/commit';

  onMount(() => { void collection.load(); });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Import' }]);
    return () => setCrumb([]);
  });
  const MAX_ROWS = 2000;
  let mode = $state<'paste' | 'csv'>('paste');
  /* ---- paste ---- */
  let text = $state('');
  let placeId = $state<string | null>(null);
  let acquired = $state('');
  let source = $state('');
  let pasteMsg = $state('');
  /* ---- sheet ---- */
  let fileName = $state('');
  let sheet = $state<string[][] | null>(null);
  let header = $state(true);
  let mapping = $state<Mapping>({});
  let sheetMsg = $state('');
  let csvText = $state('');
  /** Dates like 09/03/2024: one choice for the whole sheet, "leave them" until the grower says otherwise (round sixty-one; the grower review, 4). */
  let dateOrder = $state<'leave' | 'dmy' | 'mdy'>('leave');
  /** The columns no field takes go into each plant's notes unless the grower says not (round sixty-one; the grower review, 3). */
  let extraToNotes = $state(true);
  function readPastedSheet() {
    reset();
    fileName = 'The pasted sheet';
    readSheet(csvText);
  }
  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    reset();
    if (!f) return;
    fileName = f.name;
    readSheet(await f.text().catch(() => ''));
  }
  function readSheet(textIn: string) {
    sheetMsg = '';
    try {
      const rows = parseCsv(textIn);
      if (!rows.length) { sheetMsg = 'That file has no rows.'; sheet = null; return; }
      sheet = rows;
      header = detectHeader(rows);
      mapping = guessMapping(rows, header);
      dateOrder = 'leave';
      extraToNotes = true;
    } catch (err) {
      sheet = null;
      sheetMsg = `That file could not be read as a spreadsheet: ${err instanceof Error ? err.message : String(err)}.`;
    }
  }
  $effect(() => { if (sheet) mapping = guessMapping(sheet, header); }); // a header switched on or off is a new mapping
  const columns = $derived(sheet ? Math.max(...sheet.slice(0, 50).map((r) => r.length)) : 0);
  const colName = (i: number) => (sheet && header ? sheet[0][i]?.trim() || `Column ${i + 1}` : `Column ${i + 1}`);
  const preview = $derived(sheet ? sheet.slice(header ? 1 : 0, (header ? 1 : 0) + 3) : []);
  const unmapped = $derived(sheet ? unmappedColumns(sheet, mapping, header) : { extra: [], own: [] });
  const amb = $derived(sheet ? ambiguousDates(sheet, mapping, header, localDate()) : { n: 0, first: null });
  /** The two readings of the sheet's first ambiguous date, for the choice's own words. */
  const ambWords = $derived.by(() => {
    const m = amb.first ? /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(amb.first.trim()) : null;
    if (!m) return null;
    const mon = (n: number) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][n - 1];
    return { text: amb.first, dmy: `${+m[1]} ${mon(+m[2])}`, mdy: `${+m[2]} ${mon(+m[1])}` };
  });
  function setMap(f: Field, v: string) {
    const next: Mapping = { ...mapping };
    if (v === '') delete next[f]; else next[f] = Number(v);
    mapping = next;
  }

  /* ---- review ---- */
  let rows = $state<ImportRow[]>([]);
  let checks = $state<Map<string, NameCheck>>(new Map());
  let checking = $state(false);
  let makePlaces = $state(false);
  let adding = $state<{ done: number; total: number } | null>(null);
  let result = $state<ImportResult | null>(null);
  let noName = $state(0);
  let repeatedHeader = $state(0);
  let truncated = $state(false);
  /** The numbers each plant will get, worked out once when the list is read and again only when a line is dropped or kept: frozen while adding, so 300 commits do not plan 300 times (round sixty-one; the records review, 16). */
  let plan = $state.raw<NumberPlan | null>(null);
  let ledger: string[] = [];
  /** Show only the lines that need the grower: a 300-line review is then the dozen that matter (round sixty-one; the grower review, friction 2). */
  let onlyNeeds = $state(false);
  /** The last watering for every plant in the list, when the grower knows it: Today then counts from it (round sixty-one; the grower review, friction 6). */
  let lastWatered = $state('');
  let waterMsg = $state('');
  /** What the page says as it works, in one status line that is always there (round sixty-one; the accessibility review, 2). */
  let status = $state('');
  const look: Lookup = { entries: (slugs) => entriesFor(slugs), search: (q) => searchCatalogue(q, 5) };
  function reset() { rows = []; checks = new Map(); result = null; noName = 0; repeatedHeader = 0; truncated = false; plan = null; onlyNeeds = false; }
  function replan() {
    plan = collection.ready ? planNumbers(rows, new Set([...ledger, ...collection.accessions.map(accNo)]), collection.scheme, Number(localDate().slice(0, 4)), (n) => collection.isNumberTaken(n)) : null;
  }
  async function review() {
    if (checking || !collection.ready) return;
    result = null;
    let next: ImportRow[];
    if (mode === 'paste') {
      pasteMsg = acquired && acquired > localDate() ? `${acquired} is in the future; the number is minted for the acquisition year, for good.` : acquired && acquired < '1900-01-01' ? `${acquired} is before 1900.` : '';
      if (pasteMsg) return;
      const lines = parsePaste(text);
      if (!lines.some((l) => l.name)) { pasteMsg = 'Nothing to read: paste one plant per line.'; return; }
      next = rowsFromPaste(lines, { placeId, acquired: acquired || null, source: source.trim() || null });
      noName = lines.filter((l) => !l.name).length;
      repeatedHeader = 0;
    } else {
      if (!sheet) return;
      if (mapping.name === undefined && mapping.genus === undefined) { sheetMsg = 'Choose the column that holds the name.'; return; }
      const r = rowsFromSheet(sheet, mapping, header, localDate(), { dateOrder: dateOrder === 'leave' ? null : dateOrder, extra: extraToNotes ? unmapped.extra : [] });
      next = r.rows;
      noName = r.noName;
      repeatedHeader = r.repeatedHeader;
    }
    truncated = next.length > MAX_ROWS;
    if (truncated) next = next.slice(0, MAX_ROWS);
    // A line whose number a plant here already holds under the same name: most likely added by a first run that was cut off. Skipped unless kept (round sixty-one; the grower review, 6).
    rows = markAlreadyImported(next, (no) => collection.withNumber('accession', no) as Array<{ taxonName: string; cultivar?: string | null }>);
    ledger = (await getMeta<string[]>('issued:accession').catch(() => undefined)) ?? [];
    replan();
    await recheck();
    status = `${rows.length} line${rows.length === 1 ? '' : 's'} read; the review is below.`;
    await tick();
    const h = document.getElementById('imp-review-h');
    h?.scrollIntoView({ block: 'start' });
    h?.focus({ preventScroll: true });
  }
  /** Ask about every name not yet answered (or answered "not checked"): after the first read, after an edit, on "Check again". */
  async function recheck() {
    const ask = [...new Set(rows.filter((r) => !r.drop).map((r) => r.name))].filter((n) => { const c = checks.get(checkKey(n)); return !c || c.s === 'unchecked'; });
    if (!ask.length) return;
    checking = true;
    try {
      const got = await checkNames(ask, look);
      checks = new Map([...checks, ...got]);
    } finally {
      checking = false;
    }
  }
  const live = $derived(rows.filter((r) => !r.drop));
  const nodes = $derived(collection.locations.map((l) => ({ id: l.id, name: l.name, parentId: (collection.locationPath(l.id).at(-2)?.id ?? null) as string | null })));
  const toMake = $derived(placesToMake([...new Set(live.map((r) => r.placePath).filter((p): p is string => !!p))], nodes));
  const plantsN = $derived(live.reduce((n, r) => n + r.qty, 0));
  const statusOf = (r: ImportRow) => checks.get(checkKey(r.name));
  const counts = $derived.by(() => {
    const c = { found: 0, near: 0, missing: 0, unchecked: 0, hybrid: 0, waiting: 0 };
    for (const r of live) { const s = statusOf(r); if (!s) c.waiting++; else c[s.s]++; }
    return c;
  });
  const alreadyRows = $derived(rows.filter((r) => r.already));
  const renumberedKeys = $derived(new Set(plan?.renumbered.map((x) => x.key) ?? []));
  const inFileRenumbered = $derived(plan?.renumbered.filter((x) => x.inFile !== undefined) ?? []);
  const hereRenumbered = $derived(plan?.renumbered.filter((x) => x.inFile === undefined) ?? []);
  /** A line that needs the grower: something not read as given, a name to look at, a number changed, a place not here, or one that looks already imported. */
  const needs = (r: ImportRow): boolean => {
    if (r.already || r.problems.length || renumberedKeys.has(r.key)) return true;
    const c = statusOf(r);
    if (!c || c.s === 'near' || c.s === 'missing' || c.s === 'unchecked') return true;
    return !!r.placePath && !r.placeId && !('id' in resolvePlace(r.placePath, nodes)) && !makePlaces;
  };
  const needN = $derived(rows.filter(needs).length);
  const shown = $derived(onlyNeeds ? rows.filter(needs) : rows);
  function useSuggestion(r: ImportRow, name: string) {
    const p = r.name.match(/[‘'"].+[’'"]/)?.[0];
    rename(r, p ? `${name} ${p}` : name);
  }
  function rename(r: ImportRow, name: string) {
    const i = rows.findIndex((x) => x.key === r.key);
    if (i < 0 || !name.trim()) return;
    rows[i] = { ...rows[i], name: name.trim() };
    void recheck();
  }
  function drop(r: ImportRow, on: boolean) {
    const i = rows.findIndex((x) => x.key === r.key);
    if (i >= 0) rows[i] = { ...rows[i], drop: on };
    replan();
  }
  function keepAlready() {
    rows = rows.map((r) => (r.already ? { ...r, drop: false } : r));
    replan();
  }
  const placeWords = (r: ImportRow): string => {
    if (r.placeId) return collection.locationName(r.placeId);
    if (!r.placePath) return '';
    const hit = resolvePlace(r.placePath, nodes);
    return 'id' in hit ? collection.locationName(hit.id) : makePlaces ? `${splitPath(r.placePath).join(' › ')} (new)` : `${r.placePath}: not a place here, so no place unless made below`;
  };
  async function add() {
    if (!plan || adding || !live.length || checking) return;
    waterMsg = lastWatered && lastWatered > localDate() ? `${lastWatered} is in the future.` : '';
    if (waterMsg) { document.getElementById('imp-watered')?.focus(); return; }
    adding = { done: 0, total: live.length };
    status = `Adding ${plantsN} plant${plantsN === 1 ? '' : 's'}…`;
    try {
      result = await commitImport(rows, checks, plan, { makePlaces, lastWatered: lastWatered || null, thisYear: Number(localDate().slice(0, 4)), onProgress: (done, total) => (adding = { done, total }) });
      if (!result.failed) { rows = []; text = ''; sheet = null; fileName = ''; plan = null; }
      else {
        // The rest stay for a second try; the added ones are on My plants. A row of several plants stopped partway keeps only the plants still to add.
        const done = new Set(result.doneKeys);
        const part = result.partial;
        rows = rows.filter((r) => !done.has(r.key)).map((r) => (part && r.key === part.key ? { ...r, qty: r.qty - part.written, number: null } : r));
        replan();
      }
    } catch (e) {
      result = { added: [], renumbered: [], failed: { line: null, error: collection.lastWriteError ?? (e instanceof Error ? e.message : String(e)) }, doneKeys: [], partial: null, placesMade: 0, watered: null, ms: 0 };
    } finally {
      adding = null;
    }
    status = result?.failed ? 'The import stopped; the reason is below.' : `${result?.added.length ?? 0} plants added.`;
    await tick();
    document.getElementById('imp-done-h')?.focus();
  }
  // While the plants are being added, leaving would stop the import partway: asked first, in the app and by the browser (round sixty-one; the grower review, 6).
  beforeNavigate((nav) => {
    if (adding && !nav.willUnload && nav.type !== 'leave') {
      if (!confirm(`Leave while the import is adding plants? ${adding.done} of ${adding.total} lines are in; the rest would not be added.`)) nav.cancel();
      return;
    }
    if (!rows.length || result || nav.willUnload || nav.type === 'leave') return;
    if (!confirm('Leave the import? The review list will be lost; nothing has been added yet.')) nav.cancel();
  });
  function guardUnload(e: BeforeUnloadEvent) {
    if (adding) e.preventDefault();
  }
  /**
   * The numbers added, by scheme: "0001 to 0300, and A1 to A95", in number order within each, not a string sort over
   * all of them, which said "0001 to A95" (round sixty-one; the grower review, 10).
   */
  const range = (r: ImportResult) => {
    const groups = new Map<string, string[]>();
    for (const no of r.added.map(accNo)) { const k = no.replace(/\d+$/, ''); const g = groups.get(k); if (g) g.push(no); else groups.set(k, [no]); }
    const parts = [...groups.values()].map((ns) => { ns.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); return ns.length > 1 ? `${ns[0]} to ${ns[ns.length - 1]}` : ns[0]; });
    return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} and others` : parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? '');
  };
  /** "cf.", "aff.", "sp.": the name is filed as written, and the reference was asked about the species part only. */
  const qualifierOf = (r: ImportRow) => parseName(r.name).qualifier;
</script>

<svelte:head><title>Import plants · Cultifolio</title></svelte:head>

<PageHead title="Import plants" kick="My plants" places={false} sub="From a list you paste or a spreadsheet saved as CSV. Read on this device; each name is checked against the reference, and you review the list before anything is added." />

{#if collection.lastWriteError}<div class="notice err" role="alert">This change was not saved: {collection.lastWriteError}.</div>{/if}

<!-- Always in the page, so what it says is announced when it changes: a status inserted with its text often is not (round sixty-one; the accessibility review, 2). -->
<p class="sr" role="status" id="imp-status">{status}</p>

{#if result}
  <div class="cult done" id="imp-done">
    <div class="body">
      <h2 class="donehead" id="imp-done-h" tabindex="-1">{result.failed ? 'The import stopped' : 'The import is done'}</h2>
      <p><b>{result.added.length} plant{result.added.length === 1 ? '' : 's'} added</b>{result.added.length ? `, numbered ${range(result)}` : ''}{result.placesMade ? `, and ${result.placesMade} new place${result.placesMade === 1 ? '' : 's'}` : ''}. <span class="muted">({(result.ms / 1000).toFixed(1)} s)</span></p>
      {#if result.renumbered.length}<p>{result.renumbered.length === 1 ? 'One number was' : `${result.renumbered.length} numbers were`} taken, so the next free one was given: {result.renumbered.slice(0, 12).map((x) => `line ${x.line}, ${x.given} → ${x.got}`).join('; ')}{result.renumbered.length > 12 ? '; …' : ''}.</p>{/if}
      {#if result.watered}{#if result.watered.failed}<p class="bad">The last watering was not recorded: {result.watered.failed}. The plants stand; record it from Today or My plants.</p>{:else}<p>Last watered on {lastWatered || 'the date given'}: recorded on {result.watered.lines} plant{result.watered.lines === 1 ? '' : 's'}.</p>{/if}{/if}
      {#if result.failed}
        {#if result.failed.line === null}<p class="bad">Stopped before any plant was added: {result.failed.error}.{result.placesMade ? ` ${result.placesMade === 1 ? 'One new place was' : `${result.placesMade} new places were`} made, and stay${result.placesMade === 1 ? 's' : ''}; a second try finds ${result.placesMade === 1 ? 'it' : 'them'} and makes no other.` : ''} Every line is still in the list below.</p>
        {:else}<p class="bad">Stopped at line {result.failed.line}: {result.failed.error}. The lines before it were added; the rest are still in the list below{result.partial ? `, line ${result.failed.line} with the ${result.partial.written === 1 ? 'one plant' : `${result.partial.written} plants`} added taken off it` : ''}.</p>{/if}
      {/if}
      <p><a class="btn pri" href="/plants">See them on My plants</a> {#if result.added.length}<a class="btn" href="/labels?acc={result.added.map((a) => a.id).join(',')}">Labels for these</a>{/if}</p>
    </div>
  </div>
{/if}

<ToggleGroup label="Import from" options={[{ value: 'paste', label: 'Paste a list', id: 'imp-mode-paste' }, { value: 'csv', label: 'A spreadsheet (CSV)', id: 'imp-mode-csv' }]} bind:value={mode} onchange={() => reset()} />

{#if mode === 'paste'}
  <div class="cult form">
    <label class="full"><span class="lab">One plant per line</span>
      <textarea id="imp-text" rows="10" bind:value={text} spellcheck="false" placeholder={'Copiapoa cinerea\nHaworthia truncata; Lime Green\nGymnocalycium ragonesei; ; 2024-0031; club sale; two heads'}></textarea>
      <span class="hint">The name, then if you like: cultivar; number; where it came from; notes, each after a semicolon. Leave a part empty to skip it. Columns copied from a spreadsheet work too.</span>
    </label>
    <p class="hint full">The same for every line:</p>
    <div class="full"><span class="lab">Place</span><LocationPicker bind:value={placeId} id="imp-loc" label="Place" /></div>
    <label><span class="lab">Date acquired</span><input id="imp-date" type="date" bind:value={acquired} /><span class="hint">Blank: not stated; numbers take this year.</span></label>
    <label><span class="lab">From</span><input id="imp-from" type="text" bind:value={source} placeholder="a nursery, a club sale, a friend" /></label>
    {#if pasteMsg}<p class="bad full" role="alert">{pasteMsg}</p>{/if}
    <div class="full acts"><button class="btn pri" type="button" id="imp-check" onclick={review} aria-disabled={!text.trim() || checking || !collection.ready}>{checking ? 'Checking names…' : 'Check names'}</button></div>
  </div>
{:else}
  <div class="cult form">
    <label class="full"><span class="lab">A spreadsheet saved as CSV</span><input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onchange={onFile} /><span class="hint">In your spreadsheet: File, then Save as or Download, then CSV. A Cultifolio plants.csv reads back as it is, its batch links and photographs apart.</span></label>
    <details class="full" id="imp-csv-paste-box"><summary class="small">Or paste the sheet's text</summary>
      <textarea id="imp-csv-text" rows="6" bind:value={csvText} spellcheck="false" placeholder={'number,species,location,acquired\n2024-0001,Copiapoa cinerea,Greenhouse › Bench 1,2024-05-01'}></textarea>
      <button class="btn small" type="button" id="imp-csv-read" onclick={readPastedSheet} disabled={!csvText.trim()}>Read it</button>
    </details>
    {#if sheetMsg}<p class="bad full" role="alert">{sheetMsg}</p>{/if}
    {#if sheet}
      <p class="full small">{fileName}: {sheet.length - (header ? 1 : 0)} row{sheet.length - (header ? 1 : 0) === 1 ? '' : 's'}, {columns} column{columns === 1 ? '' : 's'}. <label class="inline"><input type="checkbox" id="imp-header" bind:checked={header} /> The first row is a header</label></p>
      <div class="full map" role="group" aria-label="Which column is which">
        {#each FIELDS as f (f)}
          <div class="maprow"><label class="lab" for="map-{f}">{FIELD_LABEL[f]}{f === 'name' ? ' (needed)' : ''}</label>
            <select id="map-{f}" aria-describedby={mapping[f] !== undefined ? `map-eg-${f}` : undefined} value={mapping[f] === undefined ? '' : String(mapping[f])} onchange={(e) => setMap(f, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">Not in this sheet</option>
              {#each Array.from({ length: columns }, (_, i) => i) as i (i)}<option value={String(i)}>{colName(i)}</option>{/each}
            </select>
            <!-- The examples describe the select; inside its label they were read as its name (round sixty-one; the accessibility review, 11 and 14). -->
            <span class="eg mono" id="map-eg-{f}">{#each preview as row, j (j)}{#if mapping[f] !== undefined && row[mapping[f]!]?.trim()}<span>{row[mapping[f]!].trim().slice(0, 40)}</span>{/if}{/each}</span>
          </div>
        {/each}
      </div>
      {#if unmapped.extra.length || unmapped.own.length}
        <div class="full unmapped" id="imp-unmapped">
          {#if unmapped.extra.length}
            <p class="small">Not matched to a field: <b>{unmapped.extra.map((c) => c.name).join(', ')}</b>.</p>
            <label class="check"><input type="checkbox" id="imp-extra" bind:checked={extraToNotes} /> Add {unmapped.extra.length === 1 ? 'it' : 'them'} to each plant's notes, as "{unmapped.extra[0].name}: …"</label>
            {#if !extraToNotes}<p class="small warn">{unmapped.extra.length === 1 ? 'This column is' : 'These columns are'} then left out of the import.</p>{/if}
          {/if}
          {#if unmapped.own.length}<p class="small muted">{unmapped.own.join(' and ')}: the sheet's own links to its batches and records, which mean nothing in another collection, so not imported.</p>{/if}
        </div>
      {/if}
      {#if amb.n}
        <fieldset class="full dates" id="imp-dates">
          <legend class="small">{amb.n === 1 ? 'One date' : `${amb.n} dates`} in this sheet, like {ambWords?.text ?? amb.first}, could be read day first or month first. How are they written?</legend>
          <label class="check"><input type="radio" name="imp-date-order" value="dmy" bind:group={dateOrder} /> Day first{ambWords ? ` (${ambWords.dmy})` : ''}</label>
          <label class="check"><input type="radio" name="imp-date-order" value="mdy" bind:group={dateOrder} /> Month first{ambWords ? ` (${ambWords.mdy})` : ''}</label>
          <label class="check"><input type="radio" name="imp-date-order" value="leave" bind:group={dateOrder} /> Leave them: the text goes into the notes, and the plant is numbered for the year written</label>
        </fieldset>
      {/if}
      <div class="full acts"><button class="btn pri" type="button" id="imp-check" onclick={review} aria-disabled={checking || (mapping.name === undefined && mapping.genus === undefined) || !collection.ready}>{checking ? 'Checking names…' : 'Check names'}</button></div>
    {/if}
  </div>
{/if}

{#if rows.length && plan}
  <section id="imp-review" aria-labelledby="imp-review-h">
    <div class="secrule"><h2 id="imp-review-h" tabindex="-1">Review</h2><div class="line"></div><span class="n">{plantsN} plant{plantsN === 1 ? '' : 's'}</span></div>
    <p class="small" id="imp-summary">
      {live.length} line{live.length === 1 ? '' : 's'}{rows.length - live.length ? ` (${rows.length - live.length} dropped)` : ''}, {plantsN} plant{plantsN === 1 ? '' : 's'}.
      Matched in the reference: {counts.found}{counts.near ? ` · ambiguous, another name suggested: ${counts.near}` : ''}{counts.missing ? ` · not in the reference, added as typed: ${counts.missing}` : ''}{counts.hybrid ? ` · crosses, filed under the genus: ${counts.hybrid}` : ''}{counts.unchecked ? ` · not checked (the reference did not answer): ${counts.unchecked}` : ''}{counts.waiting ? ` · still checking: ${counts.waiting}` : ''}.
      {#if counts.unchecked && !checking}<button class="linkish" type="button" onclick={recheck}>Check again</button>{/if}
      {#if noName}{noName} {mode === 'paste' ? 'line' : 'row'}{noName === 1 ? '' : 's'} with no name {noName === 1 ? 'was' : 'were'} left out.{/if}
      {#if repeatedHeader}{repeatedHeader === 1 ? 'A row repeating the header was' : `${repeatedHeader} rows repeating the header were`} left out.{/if}
      {#if truncated}Only the first {MAX_ROWS} lines are read at once; import the rest after.{/if}
    </p>
    {#if alreadyRows.length}<p class="small notice" id="imp-already">{alreadyRows.length === 1 ? 'One line looks' : `${alreadyRows.length} lines look`} already imported: {alreadyRows.length === 1 ? 'its number is' : 'their numbers are'} held here by a plant of the same name, so {alreadyRows.length === 1 ? 'it is' : 'they are'} skipped. {#if alreadyRows.some((r) => r.drop)}<button class="linkish" type="button" id="imp-keep-already" onclick={keepAlready}>Add {alreadyRows.length === 1 ? 'it' : 'them'} anyway, under new numbers</button>{/if}</p>{/if}
    {#if hereRenumbered.length}<p class="small" id="imp-renumbered">{hereRenumbered.length === 1 ? 'One number given is' : `${hereRenumbered.length} numbers given are`} already used here: {hereRenumbered.length === 1 ? 'that plant gets' : 'those plants get'} the next free number ({hereRenumbered.slice(0, 6).map((x) => `${x.given} → ${x.got}`).join(', ')}{hereRenumbered.length > 6 ? ', …' : ''}).</p>{/if}
    {#if inFileRenumbered.length}<p class="small" id="imp-dupes">{inFileRenumbered.length === 1 ? 'One number is' : `${inFileRenumbered.length} numbers are`} given twice in this sheet: the first line keeps it, and the later one gets the next free number ({inFileRenumbered.slice(0, 6).map((x) => `line ${x.line}, as on line ${x.inFile}: ${x.given} → ${x.got}`).join('; ')}{inFileRenumbered.length > 6 ? '; …' : ''}).</p>{/if}
    {#if toMake.length}<label class="small makeplaces"><input type="checkbox" id="imp-make-places" bind:checked={makePlaces} /> Make {toMake.length === 1 ? 'this place' : `these ${toMake.length} places`}, which {toMake.length === 1 ? 'is' : 'are'} not here yet: {toMake.map((p) => p.join(' › ')).join(', ')}</label>{/if}
    <div class="reviewopts">
      <label class="check"><input type="checkbox" id="imp-only-needs" bind:checked={onlyNeeds} /> Show only lines that need me ({needN})</label>
      <label class="watered"><span class="lab">Last watered, for every plant (if you know)</span><input id="imp-watered" type="date" bind:value={lastWatered} max={localDate()} oninput={() => (waterMsg = '')} aria-invalid={!!waterMsg} aria-describedby={waterMsg ? 'imp-watered-bad' : undefined} />{#if waterMsg}<span class="bad small" id="imp-watered-bad">{waterMsg}</span>{/if}</label>
    </div>
    <ol class="rv">
      {#each shown as r (r.key)}
        {@const c = statusOf(r)}
        {@const nos = plan.byRow.get(r.key)?.numbers ?? []}
        {@const qual = qualifierOf(r)}
        <li class:dropped={r.drop} class="rvrow" data-line={r.line}>
          <span class="ln mono">{r.line}</span>
          <span class="main">
            <input class="nm" type="text" value={r.name} aria-label="Name on line {r.line}" disabled={r.drop} onchange={(e) => rename(r, (e.currentTarget as HTMLInputElement).value)} />
            <span class="facts small">
              {#if r.drop}<span class="muted">{r.already ? 'already imported: skipped' : 'dropped'}</span>{:else}
                {#if nos.length}<span class="mono">{nos.length > 1 ? `${nos[0]} …${nos.length}` : nos[0]}{#if r.number && !plan.byRow.get(r.key)?.kept}{' '}<span class="warn">({r.number.trim()} is taken: next free number)</span>{/if}</span>{/if}
                {#if r.cultivar}<span>‘{r.cultivar}’</span>{/if}
                {#if r.fieldNumber}<span class="fnchip">{r.fieldNumber}</span>{/if}
                {#if r.qty > 1}<span>× {r.qty}</span>{/if}
                {#if placeWords(r)}<span class="muted">{placeWords(r)}</span>{/if}
                {#if r.acquired && mode === 'csv'}<span class="muted">{r.acquired}</span>{/if}
                {#if r.source && (mode === 'csv' || r.source !== source.trim())}<span class="muted">from {r.source}</span>{/if}
                {#if r.price}<span class="muted">{r.price}</span>{/if}
                {#if r.notes}<span class="muted note" title={r.notes}>{r.notes.length > 60 ? `${r.notes.slice(0, 60)}…` : r.notes}</span>{/if}
                {#if r.already}<span class="warn">its number is held here by a plant of the same name</span>{/if}
                {#if !c}<span class="muted">checking…</span>
                {:else if c.s === 'found'}<span class="ok">{qual ? `filed as written; the reference was asked about ${c.refName}` : `matched${c.refName.toLowerCase() !== checkKey(r.name).toLowerCase() ? ` as ${c.refName}` : ''}`}</span>
                {:else if c.s === 'near'}<span class="warn">ambiguous: not under this name; {c.why === 'older name' ? 'an older name for' : 'did you mean'} <SpeciesName name={c.suggestion} />? <button class="linkish" type="button" aria-label="Use it: {c.suggestion} on line {r.line}" onclick={() => useSuggestion(r, c.suggestion)}>Use it</button></span>
                {:else if c.s === 'missing'}<span class="warn">not in the reference; added as typed</span>
                {:else if c.s === 'hybrid'}<span class="muted">a cross, filed under its genus</span>
                {:else}<span class="warn">not checked: the reference did not answer</span>{/if}
                {#each r.problems as p}<span class="warn">{p}</span>{/each}
              {/if}
            </span>
          </span>
          <button class="btn small" type="button" onclick={() => drop(r, !r.drop)} aria-label="{r.drop ? 'Keep' : 'Drop'} line {r.line}">{r.drop ? 'Keep' : 'Drop'}</button>
        </li>
      {:else}
        <li class="rvrow none">No line needs you: every name matched and every value was read.</li>
      {/each}
    </ol>
    <div class="addbar">
      <button class="btn pri" type="button" id="imp-add" onclick={add} aria-disabled={!!adding || !plantsN || checking}>{adding ? `Adding ${adding.done} of ${adding.total}…` : `Add ${plantsN} plant${plantsN === 1 ? '' : 's'}`}</button>
      <span class="small muted">Each gets the number shown{[...plan.byRow.values()].some((x) => x.kept) ? ': its own from the sheet when free, else the next free one' : ''}.{adding ? ' Keep this page open until it is done.' : ''}</span>
    </div>
  </section>
{/if}

<svelte:window onbeforeunload={guardUnload} />

<style>
  .form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 16px; padding: 14px 16px; margin-top: 10px; }
  .form .full { grid-column: 1 / -1; }
  .form label { display: grid; gap: 4px; align-content: start; }
  .lab { font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); }
  .hint { font-size: var(--fs-sm); color: var(--ink3); margin: 0; }
  textarea { width: 100%; box-sizing: border-box; font-family: var(--mono); font-size: var(--fs-md); line-height: 1.5; padding: 8px 10px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .acts { display: flex; gap: 8px; }
  .acts .btn, .addbar .btn { min-height: var(--tap); }
  .inline { display: inline-flex !important; align-items: center; gap: 6px; margin-left: 8px; min-height: var(--tap); } /* a thumb's tap (round sixty-one; the accessibility review, 18) */
  .map { display: grid; gap: 6px; }
  .maprow { grid-template-columns: 9rem minmax(0, 12rem) minmax(0, 1fr); align-items: center; display: grid; gap: 4px 8px; }
  .maprow select { min-height: var(--tap); }
  /* --ink2: --ink3 at 12 px was 4.05:1 on the card (round sixty-one; the accessibility review, 12). */
  .eg { display: flex; gap: 8px; overflow: hidden; white-space: nowrap; font-size: var(--fs-sm); color: var(--ink2); }
  .eg span { overflow: hidden; text-overflow: ellipsis; max-width: 12rem; }
  .rv { list-style: none; margin: 8px 0 0; padding: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  .rvrow { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 10px; }
  .rvrow + .rvrow { border-top: 1px solid var(--rule); }
  .rvrow.dropped { opacity: 0.55; }
  .rvrow .ln { color: var(--ink3); font-size: var(--fs-sm); text-align: right; }
  .rvrow .main { display: grid; gap: 2px; min-width: 0; }
  .rvrow .nm { width: 100%; box-sizing: border-box; min-height: var(--tap); font-style: italic; }
  .rvrow.none { display: block; padding: 12px; color: var(--ink3); font-style: italic; }
  .facts { display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .ok { color: var(--accent); }
  .warn { color: var(--warm-ink, var(--ink2)); }
  .bad { color: var(--bad); }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  .makeplaces { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
  .addbar { position: sticky; bottom: calc(env(safe-area-inset-bottom, 0px) + 72px); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r); box-shadow: var(--sh); }
  .done .body { white-space: normal; font-family: var(--ui); font-size: var(--fs-md); }
  .done p { margin: 0 0 8px; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; }
  .check { display: flex !important; grid-template-columns: none; align-items: center; gap: 8px; min-height: var(--tap); font-size: var(--fs-md); }
  .unmapped p, .dates legend { margin: 0 0 4px; }
  .dates { border: 1px solid var(--rule); border-radius: var(--r); padding: 8px 12px; margin: 0; }
  .reviewopts { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 20px; margin: 8px 0; }
  .watered { display: grid; gap: 4px; }
  .watered input { min-height: var(--tap); }
  .donehead { font-size: var(--fs-base); margin: 0 0 8px; }
  .donehead:focus { outline: none; }
  #imp-review-h:focus { outline: none; }
  [aria-disabled='true'] { opacity: 0.55; cursor: not-allowed; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 640px) {
    .form { grid-template-columns: minmax(0, 1fr); }
    .maprow { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .maprow .eg { grid-column: 1 / -1; }
  }
</style>

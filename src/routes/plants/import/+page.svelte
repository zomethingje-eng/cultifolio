<script lang="ts">
  /**
   * Import (round sixty; the grower review's 2 and §4, the product review's 4, the self-review's experience item 4): a list
   * pasted one plant per line, or a spreadsheet saved as CSV, read on this device. Each name is checked against the
   * reference; a review list lets the grower fix or drop lines; "Add N plants" writes them through the collection's own add
   * functions, with the next free numbers (a sheet's own number is kept when it is free). Nothing is sent but the
   * reference lookups the add form already makes.
   */
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { accNo } from '$lib/db/types';
  import { getMeta } from '$lib/db/vault';
  import { localDate } from '$core/dates';
  import { entriesFor, searchCatalogue } from '$lib/ui/index.svelte';
  import { parsePaste } from '$lib/import/paste';
  import { parseCsv, detectHeader, guessMapping, FIELDS, FIELD_LABEL, type Mapping, type Field } from '$lib/import/csv';
  import { rowsFromPaste, rowsFromSheet } from '$lib/import/rows';
  import { checkNames, checkKey, type NameCheck, type Lookup } from '$lib/import/check';
  import { planNumbers, placesToMake, resolvePlace, splitPath, type ImportRow } from '$lib/import/plan';
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
    } catch (err) {
      sheet = null;
      sheetMsg = `That file could not be read as a spreadsheet: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  $effect(() => { if (sheet) mapping = guessMapping(sheet, header); }); // a header switched on or off is a new mapping
  const columns = $derived(sheet ? Math.max(...sheet.slice(0, 50).map((r) => r.length)) : 0);
  const colName = (i: number) => (sheet && header ? sheet[0][i]?.trim() || `Column ${i + 1}` : `Column ${i + 1}`);
  const preview = $derived(sheet ? sheet.slice(header ? 1 : 0, (header ? 1 : 0) + 3) : []);
  function setMap(f: Field, v: string) {
    const next: Mapping = { ...mapping };
    if (v === '') delete next[f]; else next[f] = Number(v);
    mapping = next;
  }

  /* ---- review ---- */
  let rows = $state<ImportRow[]>([]);
  let checks = $state<Map<string, NameCheck>>(new Map());
  let checking = $state(false);
  let ledger = $state<string[]>([]);
  let makePlaces = $state(false);
  let adding = $state<{ done: number; total: number } | null>(null);
  let result = $state<ImportResult | null>(null);
  let noName = $state(0);
  const look: Lookup = { entries: (slugs) => entriesFor(slugs), search: (q) => searchCatalogue(q, 5) };
  function reset() { rows = []; checks = new Map(); result = null; noName = 0; }
  async function review() {
    result = null;
    let next: ImportRow[];
    if (mode === 'paste') {
      pasteMsg = acquired && acquired > localDate() ? `${acquired} is in the future; the number is minted for the acquisition year, for good.` : acquired && acquired < '1900-01-01' ? `${acquired} is before 1900.` : '';
      if (pasteMsg) return;
      const lines = parsePaste(text);
      if (!lines.length) { pasteMsg = 'Nothing to read: paste one plant per line.'; return; }
      next = rowsFromPaste(lines, { placeId, acquired: acquired || null, source: source.trim() || null });
      noName = 0;
    } else {
      if (!sheet) return;
      if (mapping.name === undefined) { sheetMsg = 'Choose the column that holds the name.'; return; }
      const r = rowsFromSheet(sheet, mapping, header, localDate());
      next = r.rows;
      noName = r.noName;
    }
    if (next.length > MAX_ROWS) next = next.slice(0, MAX_ROWS);
    rows = next;
    ledger = (await getMeta<string[]>('issued:accession').catch(() => undefined)) ?? [];
    await recheck();
    setTimeout(() => document.getElementById('imp-review')?.scrollIntoView({ block: 'start' }), 0);
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
  const taken = $derived(new Set([...ledger, ...collection.accessions.map(accNo)]));
  const plan = $derived(collection.ready ? planNumbers(rows, taken, collection.scheme, Number(localDate().slice(0, 4)), (n) => collection.isNumberTaken(n)) : null);
  const nodes = $derived(collection.locations.map((l) => ({ id: l.id, name: l.name, parentId: (collection.locationPath(l.id).at(-2)?.id ?? null) as string | null })));
  const toMake = $derived(placesToMake([...new Set(live.map((r) => r.placePath).filter((p): p is string => !!p))], nodes));
  const plantsN = $derived(live.reduce((n, r) => n + r.qty, 0));
  const statusOf = (r: ImportRow) => checks.get(checkKey(r.name));
  const counts = $derived.by(() => {
    const c = { found: 0, near: 0, missing: 0, unchecked: 0, hybrid: 0, waiting: 0 };
    for (const r of live) { const s = statusOf(r); if (!s) c.waiting++; else c[s.s]++; }
    return c;
  });
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
  }
  const placeWords = (r: ImportRow): string => {
    if (r.placeId) return collection.locationName(r.placeId);
    if (!r.placePath) return '';
    const hit = resolvePlace(r.placePath, nodes);
    return 'id' in hit ? collection.locationName(hit.id) : makePlaces ? `${splitPath(r.placePath).join(' › ')} (new)` : `${r.placePath}: not a place here, so no place unless made below`;
  };
  async function add() {
    if (!plan || adding || !live.length) return;
    adding = { done: 0, total: live.length };
    try {
      result = await commitImport(rows, checks, plan, { makePlaces, onProgress: (done, total) => (adding = { done, total }) });
      if (!result.failed) { rows = []; text = ''; sheet = null; fileName = ''; }
      else { const done = new Set(result.doneKeys); rows = rows.filter((r) => !done.has(r.key)); } // the rest stay for a second try; the added ones are on My plants
    } finally {
      adding = null;
    }
  }
  beforeNavigate((nav) => {
    if (!rows.length || result || nav.willUnload || nav.type === 'leave') return;
    if (!confirm('Leave the import? The review list will be lost; nothing has been added yet.')) nav.cancel();
  });
  const range = (r: ImportResult) => { const ns = r.added.map(accNo).sort(); return ns.length > 1 ? `${ns[0]} to ${ns[ns.length - 1]}` : ns[0] ?? ''; };
</script>

<svelte:head><title>Import plants · Cultifolio</title></svelte:head>

<PageHead title="Import plants" kick="My plants" places={false} sub="From a list you paste or a spreadsheet saved as CSV. Read on this device; each name is checked against the reference, and you review the list before anything is added." />

{#if collection.lastWriteError}<div class="notice err" role="alert">This change was not saved: {collection.lastWriteError}.</div>{/if}

{#if result}
  <div class="cult done" id="imp-done" role="status">
    <div class="body">
      <p><b>{result.added.length} plant{result.added.length === 1 ? '' : 's'} added</b>{result.added.length ? `, numbered ${range(result)}` : ''}{result.placesMade ? `, and ${result.placesMade} new place${result.placesMade === 1 ? '' : 's'}` : ''}. <span class="muted">({(result.ms / 1000).toFixed(1)} s)</span></p>
      {#if result.renumbered.length}<p>{result.renumbered.length === 1 ? 'One number was' : `${result.renumbered.length} numbers were`} already used here, so the next free one was given: {result.renumbered.slice(0, 12).map((x) => `line ${x.line}, ${x.given} → ${x.got}`).join('; ')}{result.renumbered.length > 12 ? '; …' : ''}.</p>{/if}
      {#if result.failed}<p class="bad">Stopped at line {result.failed.line}: {result.failed.error}. The lines before it were added; the rest are still in the list below.</p>{/if}
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
    <div class="full acts"><button class="btn pri" type="button" id="imp-check" onclick={review} disabled={!text.trim() || checking || !collection.ready}>{checking ? 'Checking names…' : 'Check names'}</button></div>
  </div>
{:else}
  <div class="cult form">
    <label class="full"><span class="lab">A spreadsheet saved as CSV</span><input id="imp-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onchange={onFile} /><span class="hint">In your spreadsheet: File, then Save as or Download, then CSV. A Cultifolio backup's plants.csv reads back as it is.</span></label>
    <details class="full" id="imp-csv-paste-box"><summary class="small">Or paste the sheet's text</summary>
      <textarea id="imp-csv-text" rows="6" bind:value={csvText} spellcheck="false" placeholder={'number,species,location,acquired\n2024-0001,Copiapoa cinerea,Greenhouse › Bench 1,2024-05-01'}></textarea>
      <button class="btn small" type="button" id="imp-csv-read" onclick={readPastedSheet} disabled={!csvText.trim()}>Read it</button>
    </details>
    {#if sheetMsg}<p class="bad full" role="alert">{sheetMsg}</p>{/if}
    {#if sheet}
      <p class="full small">{fileName}: {sheet.length - (header ? 1 : 0)} row{sheet.length - (header ? 1 : 0) === 1 ? '' : 's'}, {columns} column{columns === 1 ? '' : 's'}. <label class="inline"><input type="checkbox" id="imp-header" bind:checked={header} /> The first row is a header</label></p>
      <div class="full map" role="group" aria-label="Which column is which">
        {#each FIELDS as f (f)}
          <label class="maprow"><span class="lab">{FIELD_LABEL[f]}{f === 'name' ? ' (needed)' : ''}</span>
            <select id="map-{f}" value={mapping[f] === undefined ? '' : String(mapping[f])} onchange={(e) => setMap(f, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">Not in this sheet</option>
              {#each Array.from({ length: columns }, (_, i) => i) as i (i)}<option value={String(i)}>{colName(i)}</option>{/each}
            </select>
            <span class="eg mono">{#each preview as row, j (j)}{#if mapping[f] !== undefined && row[mapping[f]!]?.trim()}<span>{row[mapping[f]!].trim().slice(0, 40)}</span>{/if}{/each}</span>
          </label>
        {/each}
      </div>
      <div class="full acts"><button class="btn pri" type="button" id="imp-check" onclick={review} disabled={checking || mapping.name === undefined || !collection.ready}>{checking ? 'Checking names…' : 'Check names'}</button></div>
    {/if}
  </div>
{/if}

{#if rows.length && plan}
  <section id="imp-review" aria-labelledby="imp-review-h">
    <div class="secrule"><h2 id="imp-review-h">Review</h2><div class="line"></div><span class="n">{plantsN} plant{plantsN === 1 ? '' : 's'}</span></div>
    <p class="small" id="imp-summary">
      {live.length} line{live.length === 1 ? '' : 's'}{rows.length - live.length ? ` (${rows.length - live.length} dropped)` : ''}, {plantsN} plant{plantsN === 1 ? '' : 's'}.
      Matched in the reference: {counts.found}{counts.near ? ` · ambiguous, another name suggested: ${counts.near}` : ''}{counts.missing ? ` · not in the reference, added as typed: ${counts.missing}` : ''}{counts.hybrid ? ` · crosses, filed under the genus: ${counts.hybrid}` : ''}{counts.unchecked ? ` · not checked (the reference did not answer): ${counts.unchecked}` : ''}{counts.waiting ? ` · still checking: ${counts.waiting}` : ''}.
      {#if counts.unchecked && !checking}<button class="linkish" type="button" onclick={recheck}>Check again</button>{/if}
      {#if noName}{noName} row{noName === 1 ? '' : 's'} with no name {noName === 1 ? 'was' : 'were'} left out.{/if}
      {#if rows.length >= MAX_ROWS}Only the first {MAX_ROWS} lines are read at once; import the rest after.{/if}
    </p>
    {#if plan.renumbered.length}<p class="small" id="imp-renumbered">{plan.renumbered.length === 1 ? 'One number given is' : `${plan.renumbered.length} numbers given are`} already used here: {plan.renumbered.length === 1 ? 'that plant gets' : 'those plants get'} the next free number ({plan.renumbered.slice(0, 6).map((x) => `${x.given} → ${x.got}`).join(', ')}{plan.renumbered.length > 6 ? ', …' : ''}).</p>{/if}
    {#if toMake.length}<label class="small makeplaces"><input type="checkbox" id="imp-make-places" bind:checked={makePlaces} /> Make {toMake.length === 1 ? 'this place' : `these ${toMake.length} places`}, which {toMake.length === 1 ? 'is' : 'are'} not here yet: {toMake.map((p) => p.join(' › ')).join(', ')}</label>{/if}
    <ol class="rv">
      {#each rows as r (r.key)}
        {@const c = statusOf(r)}
        {@const nos = plan.byRow.get(r.key)?.numbers ?? []}
        <li class:dropped={r.drop} class="rvrow" data-line={r.line}>
          <span class="ln mono">{r.line}</span>
          <span class="main">
            <input class="nm" type="text" value={r.name} aria-label="Name on line {r.line}" disabled={r.drop} onchange={(e) => rename(r, (e.currentTarget as HTMLInputElement).value)} />
            <span class="facts small">
              {#if r.drop}<span class="muted">dropped</span>{:else}
                {#if nos.length}<span class="mono">{nos.length > 1 ? `${nos[0]} …${nos.length}` : nos[0]}{#if r.number && !plan.byRow.get(r.key)?.kept}{' '}<span class="warn">({r.number.trim()} is taken: next free number)</span>{/if}</span>{/if}
                {#if r.cultivar}<span>‘{r.cultivar}’</span>{/if}
                {#if r.fieldNumber}<span class="fnchip">{r.fieldNumber}</span>{/if}
                {#if r.qty > 1}<span>× {r.qty}</span>{/if}
                {#if placeWords(r)}<span class="muted">{placeWords(r)}</span>{/if}
                {#if r.acquired && mode === 'csv'}<span class="muted">{r.acquired}</span>{/if}
                {#if r.source && (mode === 'csv' || r.source !== source.trim())}<span class="muted">from {r.source}</span>{/if}
                {#if r.price}<span class="muted">{r.price}</span>{/if}
                {#if r.notes}<span class="muted note" title={r.notes}>{r.notes.length > 60 ? `${r.notes.slice(0, 60)}…` : r.notes}</span>{/if}
                {#if !c}<span class="muted">checking…</span>
                {:else if c.s === 'found'}<span class="ok">matched{c.refName.toLowerCase() !== checkKey(r.name).toLowerCase() ? ` as ${c.refName}` : ''}</span>
                {:else if c.s === 'near'}<span class="warn">ambiguous: not under this name; {c.why === 'older name' ? 'an older name for' : 'did you mean'} <SpeciesName name={c.suggestion} />? <button class="linkish" type="button" onclick={() => useSuggestion(r, c.suggestion)}>Use it</button></span>
                {:else if c.s === 'missing'}<span class="warn">not in the reference; added as typed</span>
                {:else if c.s === 'hybrid'}<span class="muted">a cross, filed under its genus</span>
                {:else}<span class="warn">not checked: the reference did not answer</span>{/if}
                {#each r.problems as p}<span class="warn">{p}</span>{/each}
              {/if}
            </span>
          </span>
          <button class="btn small" type="button" onclick={() => drop(r, !r.drop)} aria-label="{r.drop ? 'Keep' : 'Drop'} line {r.line}">{r.drop ? 'Keep' : 'Drop'}</button>
        </li>
      {/each}
    </ol>
    <div class="addbar">
      <button class="btn pri" type="button" id="imp-add" onclick={add} disabled={!!adding || !plantsN || checking}>{adding ? `Adding ${adding.done} of ${adding.total}…` : `Add ${plantsN} plant${plantsN === 1 ? '' : 's'}`}</button>
      <span class="small muted">Each gets the next free number{plan.byRow.size && [...plan.byRow.values()].some((x) => x.kept) ? ', or its own from the sheet when free' : ''}.</span>
    </div>
  </section>
{/if}

<style>
  .form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px 16px; padding: 14px 16px; margin-top: 10px; }
  .form .full { grid-column: 1 / -1; }
  .form label { display: grid; gap: 4px; align-content: start; }
  .lab { font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); }
  .hint { font-size: var(--fs-sm); color: var(--ink3); margin: 0; }
  textarea { width: 100%; box-sizing: border-box; font-family: var(--mono); font-size: var(--fs-md); line-height: 1.5; padding: 8px 10px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .acts { display: flex; gap: 8px; }
  .acts .btn, .addbar .btn { min-height: var(--tap); }
  .inline { display: inline-flex !important; align-items: center; gap: 6px; margin-left: 8px; }
  .map { display: grid; gap: 6px; }
  .maprow { grid-template-columns: 9rem minmax(0, 12rem) minmax(0, 1fr); align-items: center; display: grid !important; }
  .maprow select { min-height: var(--tap); }
  .eg { display: flex; gap: 8px; overflow: hidden; white-space: nowrap; font-size: var(--fs-sm); color: var(--ink3); }
  .eg span { overflow: hidden; text-overflow: ellipsis; max-width: 12rem; }
  .rv { list-style: none; margin: 8px 0 0; padding: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  .rvrow { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 10px; }
  .rvrow + .rvrow { border-top: 1px solid var(--rule); }
  .rvrow.dropped { opacity: 0.55; }
  .rvrow .ln { color: var(--ink3); font-size: var(--fs-sm); text-align: right; }
  .rvrow .main { display: grid; gap: 2px; min-width: 0; }
  .rvrow .nm { width: 100%; box-sizing: border-box; min-height: 36px; font-style: italic; }
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
  @media (max-width: 640px) {
    .form { grid-template-columns: minmax(0, 1fr); }
    .maprow { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .maprow .eg { grid-column: 1 / -1; }
  }
</style>

<script lang="ts">
  /**
   * Type a name; get suggestions from the reference's own index first (this
   * site's /api/search) and from the GBIF backbone as you type, through this
   * site's /api/names so the browser talks to no third-party host. Picking sets the
   * accepted name and the GBIF key; typing a name nobody resolves is allowed
   * and flagged, never silently guessed.
   *
   * The list is a combobox: ArrowUp/ArrowDown move a highlight, Enter picks
   * it, Escape closes. Enter never submits the form from this field: a
   * keyboard user pressing Enter to "choose" must not file a plant by
   * accident; the Add button is the deliberate act. A suggestion from another
   * genus (a spelling one edit away) is labelled as such, and a name nothing
   * resolved is flagged, with the nearest reference name offered by name.
   */
  import { parseName } from '$core/names';
  import { searchCatalogue, type Found } from '$lib/ui/index.svelte';
  import { pickedName, filesKey, requestName, cultivarRest, searchText, cleanTyped, sameName, droppedByPick } from '$lib/ui/picked-name';
  import SpeciesName from './SpeciesName.svelte';
  import type { NameKind } from '$core/names';
  // `received`: the text as typed, when the last pick wrote a name that left some of it out; the form files it as the
  // name as received (round sixty-two; the grower review, 9).
  let { value = $bindable(''), taxonKey = $bindable<number | null>(null), cultivar = $bindable<string | null>(null), kind = $bindable<NameKind>('species'), parentage = $bindable<string | null>(null), id = 'species-name', unresolved = $bindable(false), armed = $bindable(false), received = $bindable<string | null>(null) }: { value?: string; taxonKey?: number | null; cultivar?: string | null; kind?: NameKind; parentage?: string | null; id?: string; unresolved?: boolean; armed?: boolean; received?: string | null } = $props();
  // `similar`: found by a similar spelling (the server's near pass); `asCultivar`: the genus offered for a genus followed by
  // capitalised words, the rest kept as a cultivar; a key below 1 is a row with no key to file (round sixty-two; A7).
  type Sugg = { key: number; name: string; family?: string; rank?: string; status?: string; local?: boolean; far?: boolean; similar?: boolean; asCultivar?: string };
  let suggestions = $state<Sugg[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every keystroke: a search or exact check answers only if it is still the latest, so a slow answer for text since changed never replaces the menu (round eighteen, B2). */
  let reqGen = 0;
  let resolved = $state<'yes' | 'no' | 'unknown' | 'unreached'>('unknown');
  // Said to the form: a name that nothing resolved (not a reference name, or the service did not answer) is not filed on
  // one click; the form arms first, as Enter does here, so a half-typed name in a greenhouse without signal is not a plant (round twenty-three, 4).
  $effect(() => { unresolved = !taxonKey && (resolved === 'no' || resolved === 'unreached'); });
  /** The highlighted row, or -1 for none. */
  let hi = $state(-1);
  /** Enter was pressed once on a name nothing resolved; the next press submits it as typed. */
  // Why the site did not ask the name service, in the server's own words: a refusal (a 400 for what is typed, a 429, a
  // held 503) is "not asked", never "did not answer" (round sixty-one; round sixty-two: the server review, 1 and 7; A8).
  let nameRefusal = $state<string | null>(null);
  /** The last pick filed no key on purpose (a qualifier, a variety the species does not name): said, and not asked about again (round sixty-two; B3). */
  let keyless = $state(false);
  let nameServiceDown = $state(false); // /api/names refused or unreachable: said under the field (round seventeen, 1)
  // The reference's own search (/api/search) did not answer, or this site asked this device to wait: said under the field,
  // never silence, and the hint no longer says "only the reference's own species are offered" then (round sixty-two; the
  // self-review's corpus 10g, triage N2; rule 2).
  let refDown = $state<null | 'unreached' | 'limited'>(null);
  /** The last check read a genus followed by capitalised words as the genus and a cultivar, since no species of that name was found: said once, before Add files it. */
  let readAsCultivar = $state<string | null>(null);
  $effect(() => { if (!value) received = null; });
  let root = $state<HTMLDivElement | null>(null);
  const uid = $props.id();
  const listId = `species-menu-${uid}`;
  const menuOpen = $derived(open && suggestions.length > 0);
  const optionId = (i: number) => `${listId}-${i}`;

  type Row = { key: number; canonicalName?: string; scientificName?: string; family?: string; rank?: string; status?: string };
  /** The name service's last answer, by the name asked: the exact-spelling check on blur asks the same question the search just asked, and reads this instead of sending it again (round twenty-eight, 14). */
  // The request itself is what is kept, not only its answer: a blur while the search's request is still in the air
  // would otherwise ask the same question again (round twenty-nine, R2-3). A refused or failed request is forgotten, so
  // the next asker tries again.
  /** The site did not ask: `message` is its reason. */
  class Refused extends Error {}

  let lastRows: { q: string; rows: Promise<Row[]> } | null = null;
  function namesFor(q: string): Promise<Row[]> {
    if (lastRows && lastRows.q === q) return lastRows.rows;
    // /api/names proxies GBIF's species/suggest (same JSON shape) from the Worker, so no name you type leaves this site from the browser.
    const rows = fetch(`/api/names?q=${encodeURIComponent(q)}`).then(async (r) => {
      // A call the site refused or held back is said as that, with the server's own reason, not as a silence (round
      // sixty-one; the server review, 4; round sixty-two: the server review, 1 and 7; A8): a 400 is what is typed, a 429
      // this address's part (held or not), a held 503 the site's minute.
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: unknown; held?: unknown } | null;
        const said = typeof body?.error === 'string' ? body.error.replace(/^not asked:\s*/i, '').replace(/[.\s]+$/, '') : '';
        if (r.status === 400) throw new Refused('what is typed is not a name it can look up');
        if (r.status === 429 || (r.status === 503 && body?.held === true)) throw new Refused(said || 'this site asked this device to wait');
        throw new Error(String(r.status));
      }
      return (await r.json()) as Row[];
    });
    const entry = { q, rows };
    lastRows = entry;
    rows.catch(() => { if (lastRows === entry) lastRows = null; });
    return rows;
  }

  /** What the form files reads the field again: cultivar, kind and parentage follow the name in it. */
  function reparse(q: string) {
    const p = parseName(q);
    cultivar = p.cultivar ?? null;
    kind = p.kind;
    parentage = p.parentage ?? null;
    return p;
  }
  async function search(q: string) {
    const gen = ++reqGen;
    const live = () => gen === reqGen;
    const p = reparse(q);
    const genusOnly = !p.epithet;
    // The name service is asked about the species part, the epithet in lower case, and never about a qualifier, a rank
    // tail, a cultivar, an author or a field number (`requestName`); the catalogue's own search is sent the text whole,
    // as the catalogue's search box sends it, and its readings leave those out (`searchText`; round sixty-two: the
    // corpus review, 2; the server review, 1; B3; the verification review's search 4, 6 and 14).
    const needle = requestName(q);
    const text = searchText(q);
    // A genus followed by capitalised words: a capitalised epithet ("Copiapoa Tenuissima") or a cultivar ("Echeveria
    // Lola"). The species is asked about; the genus is offered with the rest kept as a cultivar only when it is a genus
    // (round sixty-two; A7; the verification review's search 4 and 5).
    const shape = cultivarRest(q);
    // The reference's own suggestions come from the server's search over the index (round thirty-nine), not from the
    // whole index fetched here; the name typed already went to /api/names, so nothing new leaves the device. The corpus
    // index is species-level; for a genus-only name (a hybrid) its rows would be wrong suggestions.
    // Both asked at once (round forty, R2-3): the reference's own suggestions and the name service are independent, and a
    // slow catalogue search must not hold the backbone's answer for its ten seconds.
    const typedGenus = (needle.split(/\s+/)[0] ?? '').toLowerCase();
    let local: Sugg[] = [];
    let remote: Sugg[] = [];
    let genusRows: Sugg[] = [];
    // The reference has the genus: its search answered the genus reading for the shape (the server keeps that reading
    // only for a genus of the reference).
    let refGenus = false;
    const show = () => {
      // Exact reference rows first; then the backbone's exact species; then, for a genus followed by capitalised words with
      // no exact row, the genus with the rest as a cultivar, when it is a genus; then similar spellings, never first for
      // that shape (round sixty-two; A7); then the rest of the backbone's.
      const exact = local.filter((l) => !l.similar);
      const exactRemote = shape ? remote.filter((x) => sameName(x.name, needle)) : [];
      let genus: Sugg[] = [];
      const g = shape ? genusRows.find((x) => x.name.toLowerCase() === shape.genus.toLowerCase()) : undefined;
      if (shape && !exact.length && (g || refGenus)) genus = [{ key: g?.key ?? -1, name: g?.name ?? shape.genus, family: g?.family, rank: 'GENUS', asCultivar: shape.rest }];
      const listed = [...exact, ...exactRemote, ...genus, ...local.filter((l) => l.similar)];
      suggestions = [...listed, ...remote.filter((x) => !listed.some((l) => l.key === x.key))];
      if (hi >= suggestions.length) hi = -1;
      open = true;
    };
    hi = -1;
    open = true;
    // A cross or a cultivar of a bare genus is not looked for among the species; anything else is, a common name too.
    const indexP = ((genusOnly && p.kind === 'hybrid') || text.length < 2 ? Promise.resolve([] as Found[]) : searchCatalogue(text, 6)).then((answer) => {
      if (!live()) return;
      // Said, never silence: the reference's search did not answer, or this site asked this device to wait (rule 2).
      refDown = answer === null ? 'unreached' : !Array.isArray(answer) ? 'limited' : null;
      // A hit whose genus is not the one typed came from the one-edit fallback ("polyphylla" → Lupinus polyphyllus): say so.
      // An answer for other words than the name typed is offered only when they are its genus and epithet, the rest left
      // out or retried ("Copiapoa cinerea var. columna-alba", "Copiapoa cinerea Phil."): its rows then file no key for
      // what was left out (`filesKey`). A genus answered alone is the genus row's to offer (round sixty-one; the corpus
      // review, 5; round sixty-two: the verification review's search 6, the grower review, 9).
      // An answer by a similar spelling says so on each row (round sixty-two; A7, B2).
      const hits = Array.isArray(answer) ? answer : [];
      const relaxed = Array.isArray(answer) && 'relaxed' in answer ? answer.relaxed?.query : undefined;
      const words = (s: string) => s.trim().split(/\s+/).slice(0, 2).join(' ');
      const species = q.trim().split(/\s+/).length >= 2 ? words(cleanTyped(q)) : '';
      refGenus = !!shape && !!relaxed && sameName(relaxed, shape.genus);
      const similar = Array.isArray(answer) && 'near' in answer && answer.near === true;
      const offered = !relaxed || (relaxed.trim().split(/\s+/).length === 2 && !!species && sameName(words(relaxed), species));
      local = (offered ? hits : []).map((e) => ({ key: e.key, name: e.name, family: e.family, local: true, similar, far: !e.name.toLowerCase().startsWith(typedGenus.slice(0, Math.min(4, typedGenus.length))) }));
      show();
      // The reference answered after the field's check had concluded (a leave, or Enter, before this answer, with the name
      // service silent), or after the grower had left the field (a leave within the search's 180 ms, whose check this
      // search made stale): a name typed in full that the reference holds is resolved by it now, as the check would have.
      // Otherwise the field said "Not a reference name. Did you mean Copiapoa cinerea?" of Copiapoa cinerea, or nothing,
      // and the line arriving moved Add under the press (round sixty-six; the all-engines run, r60 12 in Firefox; rule 2).
      if (!taxonKey && !keyless && (resolved === 'no' || resolved === 'unreached' || (resolved === 'unknown' && !root?.contains(document.activeElement)))) {
        const exact = local.find((s) => !s.similar && sameName(s.name, p.scientific));
        if (exact) { taxonKey = exact.key; resolved = 'yes'; }
      }
    });
    // Rows the name service answered: the species part asked; for a genus followed by capitalised words with no species
    // of that name in the answer, the genus asked too, for the genus row's key.
    const toRows = (rows: Row[]) => rows
      .map((x) => ({ key: x.key, name: x.canonicalName ?? x.scientificName ?? '', family: x.family, rank: x.rank, status: x.status }))
      // The backbone lists a subspecies under several keys (accepted, synonyms of one another); one line per name and rank is enough.
      .filter((x, i, arr) => arr.findIndex((y) => y.name === x.name && y.rank === x.rank) === i);
    const namesP = needle.length < 3 ? Promise.resolve() : namesFor(needle).then(async (rows) => {
      if (!live()) return;
      nameServiceDown = false;
      nameRefusal = null;
      const all = toRows(rows);
      genusRows = all.filter((x) => x.rank === 'GENUS');
      // A genus followed by capitalised words: only species that begin with what was asked are offered.
      remote = all.filter((x) => (genusOnly ? x.rank === 'GENUS' : /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '') && (!shape || x.name.toLowerCase().startsWith(needle.toLowerCase()))));
      show();
      if (shape && needle.includes(' ') && !genusRows.length && !remote.some((x) => sameName(x.name, needle))) {
        const more = await namesFor(shape.genus).catch(() => [] as Row[]);
        if (!live()) return;
        genusRows = toRows(more).filter((x) => x.rank === 'GENUS');
        show();
      }
    }, (e: unknown) => {
      // A refusal is said, not shown as an empty list: the grower can still type the name and let the plant page repair the key later (round seventeen, 1).
      if (live()) { nameServiceDown = true; nameRefusal = e instanceof Refused ? e.message : null; } // offline: local suggestions only, and said
    });
    await Promise.all([indexP, namesP]);
  }

  function onInput() {
    // Read as the server reads a query, before anything: a full-width name or a pasted zero-width space (round sixty-two;
    // the verification review's search 12).
    const clean = cleanTyped(value);
    if (clean !== value) value = clean;
    reqGen++;
    taxonKey = null;
    keyless = false;
    received = null;
    readAsCultivar = null;
    resolved = 'unknown';
    armed = false;
    hi = -1;
    clearTimeout(timer);
    timer = setTimeout(() => search(value), 180);
  }
  function pick(s: Sugg) {
    // Keep the cross as typed; only the matched part changes, and a species keeps the rank and epithet typed after it (`pickedName`).
    // A key only when the name filed is the picked taxon's own (round sixty-two; B3, A7): a kept qualifier, an unmatched
    // variety or a variety reached through a synonym is filed with no key, and said.
    const key = s.key > 0 && filesKey(value, s) ? s.key : null;
    const written = pickedName(value, s);
    received = droppedByPick(value, written);
    value = written;
    reparse(value);
    readAsCultivar = null;
    taxonKey = key;
    keyless = key == null;
    resolved = 'yes';
    armed = false;
    open = false;
    hi = -1;
  }
  async function checkExact() {
    if (taxonKey || keyless || value.trim().length < 4) return;
    const gen = reqGen;
    const p = parseName(value);
    // A reference name typed in full resolves from the reference's own index, with or without the name service: the
    // greenhouse case (round twenty-three, 4).
    const local = suggestions.find((s) => s.local && !s.similar && sameName(s.name, p.scientific));
    if (local) {
      taxonKey = local.key;
      resolved = 'yes';
      return;
    }
    try {
      // An exact spelling among the suggestions resolves the name; a genus-only name (a hybrid, a cultivar of unstated parentage) resolves at genus rank.
      // The question asked is the search's (`requestName`): a species typed with a capitalised epithet is asked about,
      // and never called "not in the backbone" unasked (round sixty-two; the verification review's search 4).
      const rows = await namesFor(requestName(value));
      if (gen !== reqGen) return; // the field changed while this was asked
      const m = rows.find((x) => sameName(x.canonicalName ?? x.scientificName ?? '', p.scientific) && (p.epithet ? /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '') : x.rank === 'GENUS'));
      const shape = cultivarRest(value);
      if (m) {
        taxonKey = m.key;
        resolved = 'yes';
      } else if (shape) {
        // No species of that name: a genus followed by capitalised words is the genus with a cultivar, when the genus is
        // one (the backbone's, or the reference's genus row), and the field says so before Add files it ("Echeveria
        // Lola" was filed as the species "Echeveria lola"; round sixty-two, the verification review's search 13).
        const genusRow = (await namesFor(shape.genus).catch(() => [] as Row[])).find((x) => x.rank === 'GENUS' && sameName(x.canonicalName ?? x.scientificName ?? '', shape.genus));
        if (gen !== reqGen) return;
        const refRow = suggestions.find((x) => x.asCultivar && x.rank === 'GENUS');
        if (!genusRow && !refRow) { resolved = 'no'; return; }
        value = `${genusRow?.canonicalName ?? shape.genus} '${shape.rest}'`;
        reparse(value);
        reqGen++;
        readAsCultivar = shape.genus;
        taxonKey = genusRow?.key ?? null;
        keyless = !genusRow;
        resolved = 'yes';
        armed = true;
      } else resolved = 'no';
    } catch {
      if (gen === reqGen) resolved = 'unreached';
    }
  }
  /** For the form: resolve now, and say whether the name stands. Awaited before a plant is filed, so a click that outran the blur's check still checks (round twenty-three, 4). */
  export async function check(): Promise<boolean> {
    if (kind === 'hybrid' || keyless) return !readAsCultivar || !armed; // a pick that filed no key on purpose stands as picked
    clearTimeout(timer);
    if (value.trim() && !suggestions.length) await search(value);
    await checkExact();
    // A name the check has just read as the genus and a cultivar is shown before it is filed: the next Add files it.
    if (readAsCultivar && armed) return false;
    return !!taxonKey || resolved === 'yes';
  }
  /**
   * What a row says beyond its name and rank (round sixty-two; A7, B3): a similar spelling as that; a reference row
   * whose pick would file no key as "compared species is in the reference; no key filed"; a genus offered for a
   * cultivar as the cultivar kept; any other row with no key to file as that.
   */
  function rowNote(s: Sugg): string {
    if (s.asCultivar) return ` · '${s.asCultivar}' kept as the cultivar${s.key > 0 ? '' : '; no key filed'}`;
    if (s.similar) return s.far ? ' · similar spelling, another genus' : ' · similar spelling';
    const keyed = s.key > 0 && filesKey(value, s);
    // "Compared" is the wording of "cf." and "aff."; a variety or a cultivar typed after its species is that species' own
    // (round sixty-two; the grower review, 9).
    const q = parseName(value).qualifier;
    const compared = q === 'cf.' || q === 'aff.' || q === 'nr.' || q === 'vel aff.';
    if (s.local) return keyed ? (s.far ? ' · has a species page, under another genus' : ' · has a species page') : compared ? ' · compared species is in the reference; no key filed' : ' · its species is in the reference; no key filed';
    return keyed ? '' : ' · no key filed';
  }
  // The two services' silences, each in its own words: a refusal as "not asked", a failure as "did not answer" (rule 2).
  const namesSaid = $derived(nameServiceDown ? (nameRefusal ? `The name service was not asked: ${nameRefusal}. ` : 'The name service did not answer. ') : '');
  const refSaid = $derived(refDown === 'limited' ? "The reference's own search was not asked: this site asked this device to wait. " : refDown ? "The reference's own search did not answer. " : '');
  /** The nearest reference name when the typed one resolved to nothing: offered by name, never taken on its own. */
  const nearest = $derived(resolved === 'no' || resolved === 'unreached' ? (suggestions.find((x) => x.local && !x.far) ?? suggestions.find((x) => x.local)) : undefined);
  function onBlur(e: FocusEvent) {
    // Focus moving inside the picker (a click on a row) is not a leave.
    if (e.relatedTarget instanceof Node && root?.contains(e.relatedTarget)) return;
    setTimeout(() => {
      open = false;
      hi = -1;
      checkExact();
    }, 150);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!suggestions.length) return;
      open = true;
      const n = suggestions.length;
      hi = hi < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (hi + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      document.getElementById(optionId(hi))?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Escape') {
      if (menuOpen) {
        e.preventDefault();
        open = false;
        hi = -1;
      }
      return;
    }
    if (e.key !== 'Enter') return;
    if (menuOpen && hi >= 0) {
      e.preventDefault();
      pick(suggestions[hi]);
      return;
    }
    // Enter never submits from this field. The exact spelling of a suggestion is a pick; anything else is asked about.
    e.preventDefault();
    if (taxonKey || keyless || !value.trim()) return;
    const want = parseName(value).scientific;
    const exact = suggestions.find((s) => !s.similar && sameName(s.name, want));
    if (exact) {
      pick(exact);
      return;
    }
    open = false;
    hi = -1;
    armed = true;
    checkExact();
  }
</script>

<div class="picker" bind:this={root}>
  <input
    {id}
    type="text"
    autocomplete="off"
    spellcheck="false"
    placeholder="Genus species"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={menuOpen}
    aria-controls={listId}
    aria-activedescendant={menuOpen && hi >= 0 ? optionId(hi) : undefined}
    aria-describedby={armed ? `${listId}-hint` : undefined}
    bind:value
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => value && (open = true)}
    onblur={onBlur}
  />
  {#if taxonKey}<span class="pill ok">GBIF {taxonKey}</span>{:else if keyless}<span class="pill">no key filed</span>{:else if resolved === 'no'}<span class="pill warn">not in the backbone, kept as typed</span>{:else if resolved === 'unreached'}<span class="pill warn">{nameRefusal ? 'name service not asked' : 'name service not reached'}, kept as typed</span>{/if}
  {#if kind === 'hybrid'}<span class="pill">hybrid{parentage ? '' : ', parentage not stated'}</span>{:else if kind === 'cultivar'}<span class="pill">cultivar</span>{/if}
  <!-- One line under the field, not three stacked: the service's silence is folded into the line that asks (round sixty; the grower review, 18). -->
  {#if nearest}<p class="hint" role="status">Not a reference name. Did you mean <button type="button" class="linkish" onclick={() => pick(nearest)}><SpeciesName name={nearest.name} /></button>? Otherwise Add keeps exactly what you typed.</p>
  {:else if readAsCultivar && armed}<p class="hint" id="{listId}-hint" role="status">No species of that name was found, so it is read as the genus <i>{readAsCultivar}</i> with a cultivar. Press Add to keep it, or change the name.</p>
  {:else if armed}<p class="hint" id="{listId}-hint" role="status">{namesSaid}{refSaid}Pick a name from the list, or press Add to keep exactly what you typed.</p>
  {:else if nameServiceDown && refDown}<p class="hint svc" role="status">{namesSaid}{refSaid}A name typed in full is kept as typed and checked later.</p>
  {:else if nameServiceDown}<p class="hint svc" role="status">{nameRefusal ? `The name service was not asked: ${nameRefusal}. Only` : 'The name service did not answer, so only'} the reference's own species are offered; a name typed in full is kept as typed and checked later.</p>
  {:else if refDown}<p class="hint svc" role="status">{refDown === 'limited' ? "The reference's own search was not asked: this site asked this device to wait, so" : "The reference's own search did not answer, so"} only the backbone's names are offered.</p>
  {:else if received}<p class="hint svc" role="status">What you typed, “{received}”, is kept as the name as received.</p>{/if}
  <ul class="menu card" role="listbox" id={listId} aria-label="Suggested names" hidden={!menuOpen}>
    {#each suggestions as s, i (s.key)}
      <!-- "has a species page", not "has a dossier": the glossary's plain words (round fifty-eight; the accessibility review). -->
      <li role="option" id={optionId(i)} aria-selected={i === hi} class:hi={i === hi} tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(s)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s); } }} onmousemove={() => (hi = i)}><SpeciesName name={s.asCultivar ? `${s.name} '${s.asCultivar}'` : s.name} /> <span class="faint">{s.family ?? ''}{s.rank === 'GENUS' ? ' · genus' : s.rank === 'SUBSPECIES' ? ' · subspecies' : s.rank === 'VARIETY' ? ' · variety' : s.rank === 'FORM' ? ' · form' : ''}{rowNote(s)}</span></li>
    {/each}
  </ul>
</div>

<style>
  .picker { position: relative; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  input { flex: 1; min-width: 14rem; padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: var(--r); background: var(--card); }
  .hint { flex-basis: 100%; margin: 0; font-size: var(--fs-md); color: var(--ink2); }
  .hint.svc { color: var(--ink3); }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; list-style: none; margin: 0.3rem 0 0; padding: 0.3rem; box-shadow: var(--sh2); max-height: 18rem; overflow: auto; }
  .menu[hidden] { display: none; }
  .menu li { display: block; width: 100%; text-align: left; padding: 0.45em 0.6em; border-radius: var(--r-sm); cursor: pointer; }
  .menu li:hover, .menu li.hi { background: var(--sunk); }
</style>

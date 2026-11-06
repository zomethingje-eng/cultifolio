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
  import { parseName, speciesNotStated } from '$core/names';
  import { version } from '$app/environment';
  import { searchCatalogue, type Found } from '$lib/ui/index.svelte';
  import { mergedSentence, gbifNameWords } from '$lib/ui/ref/searched';
  import { localRow, olderLine, offeredReading, genusReading, type PickerRow } from '$lib/ui/picker-rows';
  import { pickedName, filesKey, requestName, cultivarRest, searchText, cleanTyped, sameName, droppedByPick, rankedName } from '$lib/ui/picked-name';
  import SpeciesName from './SpeciesName.svelte';
  import type { NameKind } from '$core/names';
  // `received`: the text as typed, when the last pick wrote a name that left some of it out; the form files it as the
  // name as received (round sixty-two; the grower review, 9).
  // `reserve`: keep the room the check's words take under the field, so what follows never moves when they arrive
  // (round sixty-seven; triage-66 P10).
  let { reserve = false, linked = false, addLabel = 'Add', value = $bindable(''), taxonKey = $bindable<number | null>(null), cultivar = $bindable<string | null>(null), kind = $bindable<NameKind>('species'), parentage = $bindable<string | null>(null), id = 'species-name', labelledby = undefined, describedby = undefined, unresolved = $bindable(false), armed = $bindable(false), received = $bindable<string | null>(null), pressing = false }: { /** The form's press is being checked (its "Checking the name…"): a check concluding meanwhile is the press's to answer, and arms nothing itself (round eighty-six; review-s S3, review-c C2). */ pressing?: boolean; /** The field's name, by id: the label around the field also holds the check's pills and lines, which a screen reader read as its name (round eighty-one; the desktop review's 7). */ labelledby?: string; /** The form's own hint under the field, by id. */ describedby?: string; reserve?: boolean; /** the name and its key came with the link (a species page's "Add one"): until the grower types, only the key's pill can still change, so the room kept is one line (round eighty) */ linked?: boolean; /** what the form's button reads once the name is armed, for the line that names it (round eighty) */ addLabel?: string; value?: string; taxonKey?: number | null; cultivar?: string | null; kind?: NameKind; parentage?: string | null; id?: string; unresolved?: boolean; armed?: boolean; received?: string | null } = $props();
  // `similar`: found by a similar spelling (the server's near pass); `asCultivar`: the genus offered for a genus followed by
  // capitalised words, the rest kept as a cultivar; a key below 1 is a row with no key to file (round sixty-two; A7).
  // `merged`: a reference row found by the name of a page merged into it, which the search lists first for that name (round eighty-three).
  // `older`: a reference row found by one of its older names, which the row says, as the catalogue's row does; `hom`, by
  // the name of its record under another author (round eighty-four; review-s S8).
  // Round eighty-five: the rows and the older-name line are read by `$lib/ui/picker-rows`, tested over real index entries.
  type Sugg = PickerRow;
  let suggestions = $state<Sugg[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped on every keystroke: a search or exact check answers only if it is still the latest, so a slow answer for text since changed never replaces the menu (round eighteen, B2). */
  let reqGen = 0;
  let resolved = $state<'yes' | 'no' | 'unknown' | 'unreached'>('unknown');
  /**
   * Where the key in `taxonKey` came from: a pick, the reference's own row, GBIF's name service, or the form (a link's key,
   * a draft). The reference's key wins over the name service's for a name the reference heads, whichever answered first
   * (round eighty-five; review-c C2: "Hoodia alstonii" was filed under GBIF's synonym key 5525665 whenever the search was
   * slower than the leave's check, and the plant opened with an amber "key differs" notice).
   */
  let keyFrom: 'pick' | 'ref' | 'names' | null = null;
  // Said to the form: a name that nothing resolved (not a reference name, or the service did not answer) is not filed on
  // one click; the form arms first, as Enter does here, so a half-typed name in a greenhouse without signal is not a plant (round twenty-three, 4).
  $effect(() => { unresolved = !taxonKey && (resolved === 'no' || resolved === 'unreached'); });
  /** The highlighted row, or -1 for none. */
  let hi = $state(-1);
  /** Enter was pressed once on a name nothing resolved; the next press submits it as typed. */
  // Why the site did not ask the name service, in the server's own words: a refusal (a 400 for what is typed, a 429, a
  // held 503) is "not asked", never "did not answer" (round sixty-one; round sixty-two: the server review, 1 and 7; A8).
  let nameRefusal = $state<string | null>(null);
  /** GBIF itself refused this site's request (round sixty-seven; triage-66 S8): said as that, not as "did not answer". */
  let gbifRefused = $state(false);
  /** The last pick filed no key on purpose (a qualifier, a variety the species does not name): said, and not asked about again (round sixty-two; B3). */
  let keyless = $state(false);
  let nameServiceDown = $state(false); // /api/names refused or unreachable: said under the field (round seventeen, 1)
  // The reference's own search (/api/search) did not answer, or this site asked this device to wait: said under the field,
  // never silence, and the hint no longer says "only the reference's own species are offered" then (round sixty-two; the
  // self-review's corpus 10g, triage N2; rule 2).
  // Round sixty-nine (triage-68 W6, R46-7): a search the server answered it could not run just now (`unread`), or refused
  // (`refused`), is said as that; only no answer at all is "did not answer".
  let refDown = $state<null | 'unreached' | 'limited' | 'unread' | 'refused' | 'narrow'>(null);
  /** The last check read a genus followed by capitalised words as the genus and a cultivar, since no species of that name was found: said once, before Add files it. */
  let readAsCultivar = $state<string | null>(null);
  $effect(() => { if (!value) received = null; });
  /**
   * The text this picker last put in the field itself (typed, picked, or rewritten by its check). A value set from outside
   * (the add form's "Save and add another" clearing it, a link's name) makes every answer still in flight stale: one for
   * the previous name settled its key onto the emptied field (round sixty-seven; triage-66 P8, R45-25).
   */
  let ownValue = value;
  $effect.pre(() => {
    if (value === ownValue) return;
    ownValue = value;
    reqGen++;
    clearTimeout(timer);
    suggestions = [];
    open = false;
    hi = -1;
    resolved = 'unknown';
    keyFrom = null;
    keyless = false;
    readAsCultivar = null;
  });
  let root = $state<HTMLDivElement | null>(null);
  /**
   * The list opens only while the field (or the list) has focus (round eighty-four; review-c C1, C2, outside review A22):
   * an answer that landed after the grower had left the field reopened the list over the next fields, and a tap meant for
   * the Space field picked a species they never chose. An answer that arrives later updates the pill and the line only.
   */
  const focused = () => !!root && typeof document !== 'undefined' && root.contains(document.activeElement);
  const uid = $props.id();
  const listId = `species-menu-${uid}`;
  /**
   * The rows the list shows: every suggestion, or, when the name typed is the first row's own (a page of the reference),
   * only the rows of that name (round eighty-five; review-p P5: with "Crassula ovata" typed, the list of six covered the
   * next three fields, and a tap meant for Acquired picked its fourth row). The rest come back with the next letter.
   */
  const rows = $derived.by(() => {
    const want = parseName(value).scientific;
    const first = suggestions[0];
    if (!first?.local || first.similar || !want || !sameName(first.name, want)) return suggestions;
    return suggestions.filter((x) => sameName(x.name, want));
  });
  const menuOpen = $derived(open && rows.length > 0);
  const optionId = (i: number) => `${listId}-${i}`;

  type Row = { key: number; canonicalName?: string; scientificName?: string; family?: string; rank?: string; status?: string };
  /** The name service's last answer, by the name asked: the exact-spelling check on blur asks the same question the search just asked, and reads this instead of sending it again (round twenty-eight, 14). */
  // The request itself is what is kept, not only its answer: a blur while the search's request is still in the air
  // would otherwise ask the same question again (round twenty-nine, R2-3). A refused or failed request is forgotten, so
  // the next asker tries again.
  /** The site did not ask: `message` is its reason. */
  class Refused extends Error {}
  /** GBIF refused this site's request (round sixty-seven; S8). */
  class GbifRefused extends Error {}

  let lastRows: { q: string; rows: Promise<Row[]> } | null = null;
  /** How long the name service is waited for. */
  const NAMES_WAIT_MS = 10_000;
  function namesFor(q: string): Promise<Row[]> {
    if (lastRows && lastRows.q === q) return lastRows.rows;
    // /api/names proxies GBIF's species/suggest (same JSON shape) from the Worker, so no name you type leaves this site from the browser.
    // The build in the URL, so the adapter's cache does not answer a new build with the old one's (round sixty-seven; S7).
    // Ten seconds at most, as every reference request waits (round eighty-five; outside review A13): a half-open connection
    // held Add's check for as long as the browser kept the request, and the name service is never what the check needs first.
    const rows = fetch(`/api/names?q=${encodeURIComponent(q)}&v=${encodeURIComponent(version)}`, { signal: AbortSignal.timeout(NAMES_WAIT_MS) }).then(async (r) => {
      // A call the site refused or held back is said as that, with the server's own reason, not as a silence (round
      // sixty-one; the server review, 4; round sixty-two: the server review, 1 and 7; A8): a 400 is what is typed, a 429
      // this address's part (held or not), a held 503 the site's minute.
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: unknown; held?: unknown } | null;
        const said = typeof body?.error === 'string' ? body.error.replace(/^not asked:\s*/i, '').replace(/[.\s]+$/, '') : '';
        if (r.status === 400) throw new Refused('what is typed is not a name it can look up');
        if (r.status === 429 || (r.status === 503 && body?.held === true)) throw new Refused(said || 'this site asked this device to wait');
        // GBIF itself refused this site's request (its 429 or 403, passed on as a 502 with `refused: true`): a refusal,
        // never "did not answer" (round sixty-seven; triage-66 S8, R45-11).
        if (body && (body as { refused?: unknown }).refused === true) throw new GbifRefused("GBIF refused this site's request");
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
  /**
   * The search for the field's text, while it is the latest: the check before a plant is filed awaits it, whatever has
   * already answered (round eighty-four; review-c C2: the name service's answer filled the list, the reference's search was
   * still out, and Add armed "Add as typed" for a name the reference holds).
   */
  // `ref` settles when the reference's own search has answered and been read, `names` when the name service has: the check
  // before a plant is filed awaits the reference's alone, and the name service only for a name the reference does not
  // settle (round eighty-five; outside review A13: Add waited for GBIF's answer, with no timeout, behind the reference's).
  let current: { q: string; gen: number; ref: Promise<void>; names: Promise<void> } | null = null;
  /** `quiet`: asked by the form's check, under a press; it never opens the list (outside review A22). */
  function search(q: string, quiet = false): Promise<void> {
    const run = runSearch(q, quiet); // its first step, synchronous, takes the next generation
    current = { q, gen: reqGen, ...run };
    return Promise.all([run.ref, run.names]).then(() => undefined);
  }
  function runSearch(q: string, quiet: boolean): { ref: Promise<void>; names: Promise<void> } {
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
      if (hi >= rows.length) hi = -1;
      open = !quiet && focused();
    };
    hi = -1;
    open = !quiet && focused();
    // A cross or a cultivar of a bare genus is not looked for among the species; anything else is, a common name too.
    const indexP = ((genusOnly && (p.kind === 'hybrid' || speciesNotStated(p))) || text.length < 2 ? Promise.resolve([] as Found[]) : searchCatalogue(text, 6)).then((answer) => {
      if (!live()) return;
      // Said, never silence: the reference's search did not answer, or this site asked this device to wait (rule 2).
      refDown = answer === null ? 'unreached' : !Array.isArray(answer) ? (answer.kind ?? 'limited') : null;
      // Too many of the reference's species match every word to list them (round seventy-seven): said, not "none".
      if (!refDown && Array.isArray(answer) && 'narrow' in answer && answer.narrow === true) refDown = 'narrow';
      // A hit whose genus is not the one typed came from the one-edit fallback ("polyphylla" → Lupinus polyphyllus): say so.
      // An answer for other words than the name typed is offered only when they are its genus and epithet, the rest left
      // out or retried ("Copiapoa cinerea var. columna-alba", "Copiapoa cinerea Phil."): its rows then file no key for
      // what was left out (`filesKey`). A genus answered alone is the genus row's to offer (round sixty-one; the corpus
      // review, 5; round sixty-two: the verification review's search 6, the grower review, 9).
      // An answer by a similar spelling says so on each row (round sixty-two; A7, B2).
      const hits = Array.isArray(answer) ? answer : [];
      const relaxed = Array.isArray(answer) && 'relaxed' in answer ? answer.relaxed?.query : undefined;
      refGenus = !!shape && !!relaxed && sameName(relaxed, shape.genus);
      const similar = (Array.isArray(answer) && 'near' in answer && answer.near === true) || genusReading(relaxed, q);
      // Its first two words are the genus and epithet typed, whatever the reading left out after them: a pasted label
      // ("Lithops lesliei (N.E.Br.) N.E.Br. subsp. lesliei var. lesliei C001 Kimberley") was answered "Lithops lesliei
      // subsp. lesliei …", which was not offered, though the catalogue lists Lithops lesliei first (round eighty-four;
      // review-s S9); or the genus typed and the start of the epithet, the server's reading of a misspelt epithet
      // ("lithops lesleyi"; round eighty-five, review-s S7). `offeredReading`.
      const offered = offeredReading(relaxed, q);
      // A row's key is the GBIF key a plant files (round seventy-eight): the page's `gbif`, never its id.
      // A row found by an older name, or by the name of its record under another author, says so, as the catalogue's
      // row does (round eighty-four; review-s S8). "Under another genus" only for a row not found by a common name
      // (round eighty-five; review-s S7). `localRow`.
      local = (offered ? hits : []).map((e) => localRow(text, e as Found & { homBy?: string[][] }, similar));
      show();
      // The reference answered after the field's check had concluded (a leave, or Enter, before this answer, with the name
      // service silent), or after the grower had left the field (a leave within the search's 180 ms, whose check this
      // search made stale): a name typed in full that the reference holds is resolved by it now, as the check would have.
      // Otherwise the field said "Not a reference name. Did you mean Copiapoa cinerea?" of Copiapoa cinerea, or nothing,
      // and the line arriving moved Add under the press (round sixty-six; the all-engines run, r60 12 in Firefox; rule 2).
      // And a key the name service gave for a name the reference heads is the reference's now (round eighty-five;
      // review-c C2): the reference's own key wins, whichever answered first.
      const fromNames = !!taxonKey && keyFrom === 'names';
      if ((!taxonKey || fromNames) && !keyless && (fromNames || resolved === 'no' || resolved === 'unreached' || (resolved === 'unknown' && !root?.contains(document.activeElement)))) {
        const exact = local.find((s) => !s.similar && sameName(s.name, p.scientific));
        // A page without a GBIF key (round seventy-nine) resolves the name and files no key: there is none to file.
        // And the button's "Add as typed" goes with the line that asked for it: the name is the reference's (round
        // eighty-four; review-c C2).
        if (exact && !readAsCultivar) { taxonKey = exact.key > 0 ? exact.key : null; keyFrom = 'ref'; keyless = exact.key <= 0; resolved = 'yes'; armed = false; }
      }
    });
    // Rows the name service answered: the species part asked; for a genus followed by capitalised words with no species
    // of that name in the answer, the genus asked too, for the genus row's key.
    const toRows = (rows: Row[]) => rows
      // A name below the species with its rank word, shown and written so (`rankedName`; round eighty-two, review 1's 17).
      .map((x) => ({ key: x.key, name: rankedName(x.canonicalName ?? x.scientificName ?? '', x.rank), family: x.family, rank: x.rank, status: x.status }))
      // The backbone lists a subspecies under several keys (accepted, synonyms of one another); one line per name and rank is enough.
      .filter((x, i, arr) => arr.findIndex((y) => y.name === x.name && y.rank === x.rank) === i);
    const namesP = needle.length < 3 ? Promise.resolve() : namesFor(needle).then(async (rows) => {
      if (!live()) return;
      nameServiceDown = false;
      nameRefusal = null;
      gbifRefused = false;
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
      if (live()) { nameServiceDown = true; nameRefusal = e instanceof Refused ? e.message : null; gbifRefused = e instanceof GbifRefused; } // offline: local suggestions only, and said
    });
    return { ref: indexP, names: namesP };
  }

  /** The grower has typed in the field: the full room for the check's words is kept from then on. */
  let typed = $state(false);
  function onInput() {
    typed = true;
    // Read as the server reads a query, before anything: a full-width name or a pasted zero-width space (round sixty-two;
    // the verification review's search 12).
    const clean = cleanTyped(value);
    if (clean !== value) value = clean;
    ownValue = value;
    reqGen++;
    taxonKey = null;
    keyFrom = null;
    keyless = false;
    received = null;
    readAsCultivar = null;
    resolved = 'unknown';
    armed = false;
    hi = -1;
    clearTimeout(timer);
    timer = setTimeout(() => void search(value), 180);
  }
  function pick(s: Sugg) {
    // Keep the cross as typed; only the matched part changes, and a species keeps the rank and epithet typed after it (`pickedName`).
    // A key only when the name filed is the picked taxon's own (round sixty-two; B3, A7): a kept qualifier, an unmatched
    // variety or a variety reached through a synonym is filed with no key, and said.
    const key = s.key > 0 && filesKey(value, s) ? s.key : null;
    const written = pickedName(value, s);
    // The page's row picked for a name typed in full that is one of its older names, or GBIF's name for it: the name
    // typed is kept as the name as received, as "File it under" keeps it on the plant's page (round eighty-six; review-w
    // W3: "Hibiscus acetosella" picked as Sabdariffa acetosella kept nothing of what was typed).
    const typedName = parseName(value).scientific;
    received = s.local && !s.similar && (s.older || s.gname) && sameName(s.older ?? s.gname ?? '', typedName) && !sameName(written, value) ? value.trim() : droppedByPick(value, written);
    value = written;
    ownValue = written;
    reparse(value);
    readAsCultivar = null;
    taxonKey = key;
    keyFrom = 'pick';
    keyless = key == null;
    resolved = 'yes';
    armed = false;
    open = false;
    hi = -1;
  }
  /**
   * The search for the text in the field, asked now if none is out for it (a leave within the keystroke's 180 ms, or a
   * press): it never opens the list. The reference's part, to be awaited.
   */
  function searchNow(): Promise<void> {
    if (!(current && current.q === value && current.gen === reqGen)) { clearTimeout(timer); void search(value, true); }
    return current!.ref;
  }
  /**
   * The name settled before it is filed, as the leave and the press ask: the reference's own search first, whatever has
   * answered already, so a name the reference heads takes its key (round eighty-five; review-c C2: a leave's check took the
   * name service's key while the search was still out); then the name service, waited for at most ten seconds, only for
   * a name the reference does not settle (outside review A13).
   */
  async function checkExact() {
    if ((taxonKey && keyFrom !== 'names') || keyless || value.trim().length < 4) return;
    await searchNow();
    const gen = reqGen;
    if ((taxonKey && keyFrom !== 'names') || keyless) return; // the reference's answer settled it meanwhile
    const p = parseName(value);
    // A reference name typed in full resolves from the reference's own index, with or without the name service: the
    // greenhouse case (round twenty-three, 4).
    const local = suggestions.find((s) => s.local && !s.similar && sameName(s.name, p.scientific));
    if (local) {
      // A page without a GBIF key (round seventy-nine): the name stands, and no key is filed.
      taxonKey = local.key > 0 ? local.key : null;
      keyFrom = 'ref';
      keyless = local.key <= 0;
      resolved = 'yes';
      armed = false; // an Enter that armed for a name nothing had answered yet: the reference holds it
      return;
    }
    if (taxonKey) return; // the name service's key, for a name the reference does not head
    try {
      // An exact spelling among the suggestions resolves the name; a genus-only name (a hybrid, a cultivar of unstated parentage) resolves at genus rank.
      // The question asked is the search's (`requestName`): a species typed with a capitalised epithet is asked about,
      // and never called "not in the backbone" unasked (round sixty-two; the verification review's search 4).
      const rows = await namesFor(requestName(value));
      if (gen !== reqGen) return; // the field changed while this was asked
      if (taxonKey || keyless) return; // the reference's late answer settled it while the name service was asked
      const m = rows.find((x) => (sameName(x.canonicalName ?? x.scientificName ?? '', p.scientific) || sameName(rankedName(x.canonicalName ?? x.scientificName ?? '', x.rank), p.scientific)) && (p.epithet ? /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '') : x.rank === 'GENUS'));
      const shape = cultivarRest(value);
      if (m) {
        taxonKey = m.key;
        keyFrom = 'names';
        resolved = 'yes';
        armed = false;
      } else if (shape) {
        // No species of that name: a genus followed by capitalised words is the genus with a cultivar, when the genus is
        // one (the backbone's, or the reference's genus row), and the field says so before Add files it ("Echeveria
        // Lola" was filed as the species "Echeveria lola"; round sixty-two, the verification review's search 13).
        const genusRow = (await namesFor(shape.genus).catch(() => [] as Row[])).find((x) => x.rank === 'GENUS' && sameName(x.canonicalName ?? x.scientificName ?? '', shape.genus));
        if (gen !== reqGen) return;
        const refRow = suggestions.find((x) => x.asCultivar && x.rank === 'GENUS');
        if (!genusRow && !refRow) { resolved = 'no'; return; }
        value = `${genusRow?.canonicalName ?? shape.genus} '${shape.rest}'`;
        ownValue = value;
        reparse(value);
        reqGen++;
        readAsCultivar = shape.genus;
        taxonKey = genusRow?.key ?? null;
        keyFrom = 'names';
        keyless = !genusRow;
        resolved = 'yes';
        armed = true;
      } else if (!taxonKey) resolved = 'no';
    } catch {
      // A key the reference's own search found meanwhile stands: the name service's silence does not unresolve it.
      if (gen === reqGen && !taxonKey) resolved = 'unreached';
    }
  }
  /** For the form: resolve now, and say whether the name stands. Awaited before a plant is filed, so a click that outran the blur's check still checks (round twenty-three, 4). */
  export async function check(): Promise<boolean> {
    // A pick that filed no key on purpose stands as picked; a cross, and a cultivar whose species is not stated, are filed
    // under the genus with nothing to ask (round eighty-four; review-w W5).
    if (kind === 'hybrid' || keyless || speciesNotStated(parseName(value))) return !readAsCultivar || !armed;
    // A key a pick, the reference or the link gave stands, with nothing to ask.
    if (taxonKey && keyFrom !== 'names') return !readAsCultivar || !armed;
    clearTimeout(timer);
    // The search for this text: the one out, awaited whatever has answered already, or a new one, which never opens the
    // list under the press (round eighty-four; review-c C2, outside review A22). A key the name service gave while it was
    // out gives way to the reference's (round eighty-five; review-c C2).
    if (value.trim()) await searchNow();
    await checkExact();
    // A name the check has just read as the genus and a cultivar is shown before it is filed: the next Add files it.
    if (readAsCultivar && armed) return false;
    return !!taxonKey || resolved === 'yes';
  }
  /**
   * For the form, before a name the field resolved is filed: when it is an older name of a page of the reference, or the
   * name of a page merged into one, the first press asks, as an unknown name does, and the line says which page (round
   * eighty-four; review-w W6: "Aloe aristata", which GBIF keeps as a synonym with a key, was filed at once with no species
   * page). True when it asked. Never for a name that came with the link and was not typed, and never for a name the
   * reference heads (round eighty-five; review-s S1, review-p P2: `olderLine`).
   */
  export async function olderFirst(): Promise<boolean> {
    if (!typed || armed || !value.trim()) return false;
    if (current && current.q === value && current.gen === reqGen) await current.ref; // the reference's answer alone (outside review A13)
    if (!olderRow) return false;
    armed = true;
    return true;
  }
  /**
   * The page the line named, when the grower files the name as typed after it: the form carries it into the plant's record
   * (`olderOf`), so the plant's page says it at once (round eighty-five; outside review A16a: the plant page said "No
   * species page under this name" right after the form had said whose older name it is). Null when no line was shown.
   */
  export function olderAnswer(): string | null {
    return olderRow?.name ?? null;
  }
  /**
   * What a row says beyond its name and rank (round sixty-two; A7, B3): a similar spelling as that; a reference row
   * whose pick would file no key as "compared species is in the reference; no key filed"; a genus offered for a
   * cultivar as the cultivar kept; any other row with no key to file as that.
   */
  /**
   * What a row says beyond its name and rank, `shown` on the screen and `sr` to a screen reader only (round eighty-five;
   * outside review A16g: every reference row ended "· has a species page", which a list headed "Species pages" says once).
   */
  function rowNote(s: Sugg): { sr: string; shown: string } {
    const said = (shown: string) => ({ sr: '', shown });
    if (s.asCultivar) return said(` · '${s.asCultivar}' kept as the cultivar${s.key > 0 ? '' : '; no key filed'}`);
    if (s.similar) return said(s.far ? ' · similar spelling, another genus' : ' · similar spelling');
    const keyed = s.key > 0 && filesKey(value, s);
    // "Compared" is the wording of "cf." and "aff."; a variety or a cultivar typed after its species is that species' own
    // (round sixty-two; the grower review, 9).
    const q = parseName(value).qualifier;
    const compared = q === 'cf.' || q === 'aff.' || q === 'nr.' || q === 'vel aff.';
    const page = { sr: ' · has a species page' };
    // A row found by the name of a page merged into it says so, as the catalogue's row does (round eighty-three).
    if (s.local && s.merged) return { ...page, shown: ` · ${mergedSentence(s.merged)}${keyed ? '' : '; no key filed'}` };
    // Why the row is offered, when it is by an older name or another author's (round eighty-four; review-s S8).
    // GBIF's name for the page's key is said as that, never "older name" (round eighty-six; review-w W1).
    if (s.local && s.gname) return { ...page, shown: ` · ${gbifNameWords(s.gname)}${keyed ? '' : '; no key filed'}` };
    if (s.local && (s.older || s.hom)) return { ...page, shown: ` · ${s.older ? `older name: ${s.older}` : `older name under another author: ${s.hom!.text}`}${keyed ? '' : '; no key filed'}` };
    // A page without a GBIF key (round seventy-nine): its own page, with no key to file, which is said as that, whenever a
    // pick files its own name, typed in full or not (round eighty-five; review-s S7: "Echinopsis cuzcoensis · its species
    // is in the reference" was said of the page that is the species).
    if (s.local && s.key <= 0 && !compared && filesKey(value, s)) return { ...page, shown: s.far ? ' · under another genus, with no GBIF key; no key filed' : ' · with no GBIF key; no key filed' };
    if (s.local) return keyed ? { ...page, shown: s.far ? ' · under another genus' : '' } : said(compared ? ' · compared species is in the reference; no key filed' : ' · its species is in the reference; no key filed');
    // GBIF's name service's row of a name whose reference page holds no GBIF key looked the same as that page's row
    // (round eighty, A's need; the desktop review's 4): it says where it is from, and that the page holds no key.
    if (s.key > 0 && suggestions.some((x) => x.local && x.key <= 0 && sameName(x.name, s.name))) return said(` · GBIF's name service, key ${s.key}; the species page of this name holds no GBIF key${keyed ? '' : '; no key filed'}`);
    return said(keyed ? '' : ' · no key filed');
  }
  /** The heading over a run of rows from one source: the reference's pages, or GBIF's names (outside review A16g). */
  const sourceOf = (s: Sugg) => (s.local ? 'page' : 'gbif');
  // The two services' silences, each in its own words: a refusal as "not asked", a failure as "did not answer" (rule 2).
  const namesSaid = $derived(nameServiceDown ? (gbifRefused ? "GBIF refused this site's request for names. " : nameRefusal ? `The name service was not asked: ${nameRefusal}. ` : 'The name service did not answer. ') : '');
  /** Why the reference's own search gave no rows, as a clause with no full stop. */
  function refWords(d: NonNullable<typeof refDown>): string {
    if (d === 'limited') return "The reference's own search was not asked: this site asked this device to wait";
    if (d === 'unread') return "The reference's own search could not be read just now";
    if (d === 'refused') return "The server refused the reference's own search just now";
    if (d === 'narrow') return "Too many of the reference's species match what is typed to list them; type another letter or word";
    return "The reference's own search did not answer";
  }
  const refSaid = $derived(refDown ? `${refWords(refDown)}. ` : '');
  /** A cultivar under a genus alone: filed so, and said so (round eighty-four; review-w W5, outside review A9). */
  const notStated = $derived(kind === 'cultivar' && speciesNotStated(parseName(value)));
  /** The nearest reference name when the typed one resolved to nothing: offered by name, never taken on its own. */
  // Never beside a key: a name the reference's own search resolved while the name service failed was offered "Not a
  // reference name. Did you mean" itself, under its GBIF pill (round sixty-seven; seen in the P10 probe).
  // The page whose older name is the very name typed comes first, under whatever genus (round eighty-four; review-w W6:
  // "Aloe aristata" is an older name of Aristaloe aristata, and the line said only "Did you mean").
  const olderOfTyped = (x: Sugg) => x.local && sameName(x.older ?? x.hom?.name ?? '', parseName(value).scientific);
  /**
   * The reference's page of which the name typed is an older name, or into which the page of that name was merged, said
   * whether or not the name service knows the name (it keeps "Aloe aristata" as a synonym, with a key of its own): a plant
   * filed under it had no species page and no word of Aristaloe aristata (round eighty-four; review-w W6). Not once that
   * page is picked. Never for a name the reference heads, nor for another author's name of the same spelling (round
   * eighty-five; review-s S1, review-p P2): Aloe vera, Crassula ovata and Echeveria elegans were each called "an older name
   * of" a page that holds the same spelling by another author, and the first press of Add was taken to say so.
   */
  const older = $derived(resolved === 'unknown' ? undefined : olderLine(suggestions, parseName(value).scientific));
  const olderRow = $derived(older?.row);
  /**
   * The name typed is GBIF's name for the page's own key, where Kew's name heads the page (round eighty-six; review-w W1,
   * review-p P10): the key the name service gave for it is the page's GBIF key, or the reference's row says so (`gname`).
   * Said "GBIF's name for", as the species page says it, never "an older name of": Ceropegia alstonii is Bruyns's 2017
   * name, newer than Hoodia alstonii.
   */
  const gbifNamed = $derived(!!olderRow && older?.why === 'older' && ((taxonKey != null && olderRow.key > 0 && taxonKey === olderRow.key) || (!!olderRow.gname && sameName(olderRow.gname, parseName(value).scientific))));
  const nearest = $derived(!taxonKey && (resolved === 'no' || resolved === 'unreached') ? (olderRow ?? suggestions.find(olderOfTyped) ?? suggestions.find((x) => x.local && !x.far) ?? suggestions.find((x) => x.local)) : undefined);
  function onBlur(e: FocusEvent) {
    // Focus moving inside the picker (a click on a row) is not a leave.
    if (e.relatedTarget instanceof Node && root?.contains(e.relatedTarget)) return;
    setTimeout(() => {
      if (focused()) return; // back in the field meanwhile
      open = false;
      hi = -1;
      const left = value;
      void checkExact().then(() => armIfConcluded(left));
    }, 150);
  }
  /**
   * The one place a name typed is armed (round eighty-six; review-c C2, review-s S3, review-p P5): once a leave's or an
   * Enter's check has concluded that the reference holds the name as no page's own (nothing resolved it, or it is an older
   * name of a page, or GBIF's name for one), the button reads "Add as typed" and the line says that it keeps the name, so
   * the first press does what the line says. Enter armed before the reference's search had answered, and a press inside
   * that window filed a plant the reference holds with no key; a leave armed nothing, and the line said "Add keeps exactly
   * what you typed" of a press that only armed. A check that concludes under the form's own press is the press's to answer
   * (`pressing`): the press then shows the line and arms, and the next files.
   */
  /** A check that concluded while a press outside the picker was down: armed when the press is over, unless it was the form's. */
  let armAfterHold: string | null = null;
  function armIfConcluded(asked: string) {
    if (pressing || armed || value !== asked || !value.trim()) return;
    // Under a finger already down (the room is held, and what the check says is not yet shown): the press began on the
    // button as it was, so it is the press's to answer; armed after it, if it was not the form's (`held`).
    if (held) { armAfterHold = asked; return; }
    // Only a name the form would ask about: a cross, a cultivar of a genus alone and a name with "cf.", "aff." or "sp." are
    // filed as written with nothing to ask (`check`, the form's `save`), so arming one said "Add as typed" and "Pick a name
    // from the list" of a hybrid the form files under its genus (round eighty-six; smoke-1's hybrid on the merged base).
    const p = parseName(value);
    if (kind === 'hybrid' || p.kind === 'hybrid' || p.qualifier || speciesNotStated(p)) return;
    if ((!taxonKey && !keyless && (resolved === 'no' || resolved === 'unreached')) || (typed && olderRow)) armed = true;
  }
  /**
   * A press anywhere outside the picker closes the list at once (round eighty-four; review-c C1), and holds the room under
   * the field at its height until the press is over (outside review A22): leaving the field starts its check, whose
   * line arriving between the finger going down on Add and coming up moved Add from under it, and the press was lost.
   * Released at the click the press makes, or soon after the finger lifts if it makes none.
   */
  let statusEl = $state<HTMLDivElement | null>(null);
  /** The room's height and its top margin (which an empty room has none of) while held. */
  let held = $state<{ h: number; m: string } | null>(null);
  $effect(() => {
    let undo: (() => void) | null = null;
    const down = (e: PointerEvent) => {
      if (!root || (e.target instanceof Node && root.contains(e.target))) return;
      open = false;
      hi = -1;
      if (!statusEl || undo) return;
      held = { h: statusEl.getBoundingClientRect().height, m: getComputedStyle(statusEl).marginTop };
      let late: ReturnType<typeof setTimeout> | undefined;
      const release = () => { undo?.(); };
      const lifted = () => { clearTimeout(late); late = setTimeout(release, 600); };
      const clicked = () => { setTimeout(release, 0); };
      const longest = setTimeout(release, 10_000);
      addEventListener('click', clicked, true);
      addEventListener('pointerup', lifted, true);
      addEventListener('pointercancel', release, true);
      undo = () => {
        clearTimeout(late); clearTimeout(longest);
        removeEventListener('click', clicked, true);
        removeEventListener('pointerup', lifted, true);
        removeEventListener('pointercancel', release, true);
        held = null;
        undo = null;
        if (armAfterHold != null) { const asked = armAfterHold; armAfterHold = null; armIfConcluded(asked); }
      };
    };
    addEventListener('pointerdown', down, true);
    return () => { removeEventListener('pointerdown', down, true); undo?.(); };
  });
  /**
   * The list's height, bounded by what is seen of the window under the field and by any bar pinned over the page's foot
   * (the add form's Add bar, the tab bar; `data-cover="bottom"`), so no row runs under one (round eighty-five; outside
   * review A16b: with a phone's keyboard up, five of seven rows were under the pinned Cancel and Add). Measured while the
   * list is open, again when the window or the visual viewport changes size or scrolls. At least one row; never more than
   * the list's own 18 rem.
   */
  let menuEl = $state<HTMLUListElement | null>(null);
  let room = $state<number | null>(null);
  function measureRoom() {
    const input = root?.querySelector('input');
    if (!input || !menuEl) return;
    const r = input.getBoundingClientRect();
    const vv = window.visualViewport;
    let bottom = vv ? vv.offsetTop + vv.height : innerHeight;
    for (const bar of document.querySelectorAll<HTMLElement>('[data-cover="bottom"]')) {
      if (root?.contains(bar) || bar.contains(root)) continue;
      const pos = getComputedStyle(bar).position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      const b = bar.getBoundingClientRect();
      if (b.height <= 0 || b.top <= r.bottom || b.right <= r.left || b.left >= r.right) continue;
      bottom = Math.min(bottom, b.top);
    }
    const most = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * 18;
    const row = 44;
    room = Math.round(Math.max(row, Math.min(most, bottom - r.bottom - 10)));
  }
  $effect(() => {
    if (!menuOpen) { room = null; return; }
    void rows.length;
    measureRoom();
    let frame = 0;
    const soon = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; measureRoom(); }); };
    addEventListener('resize', soon);
    addEventListener('scroll', soon, true);
    window.visualViewport?.addEventListener('resize', soon);
    window.visualViewport?.addEventListener('scroll', soon);
    return () => {
      removeEventListener('resize', soon);
      removeEventListener('scroll', soon, true);
      window.visualViewport?.removeEventListener('resize', soon);
      window.visualViewport?.removeEventListener('scroll', soon);
      if (frame) cancelAnimationFrame(frame);
    };
  });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      open = true;
      const n = rows.length;
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
      pick(rows[hi]);
      return;
    }
    // Enter never submits from this field. The exact spelling of a suggestion is a pick; anything else is asked about.
    e.preventDefault();
    if (taxonKey || keyless || !value.trim()) return;
    const want = parseName(value).scientific;
    const exactIn = () => suggestions.find((s) => s.local && !s.similar && sameName(s.name, want)) ?? suggestions.find((s) => !s.similar && sameName(s.name, want));
    const exact = exactIn();
    if (exact?.local) {
      pick(exact);
      return;
    }
    // Only the name service's row is spelt so: the reference's own search for this text is awaited first, and its row
    // picked when it holds the name (round eighty-five; review-c C2: GBIF's synonym key was filed for Kew's heading).
    if (exact) {
      const typedNow = value;
      void searchNow().then(() => {
        if (value !== typedNow || taxonKey || keyless) return;
        const now = exactIn();
        if (now) pick(now);
      });
      return;
    }
    open = false;
    hi = -1;
    // Armed once the check has concluded, never before (round eighty-six; review-c C2: Enter, then Add while the
    // reference's search was out, filed "Copiapoa humilis" with no key in 10 of 10 runs). A name too short to check has
    // nothing to wait for.
    if (value.trim().length < 4) { armed = true; return; }
    const asked = value;
    void checkExact().then(() => armIfConcluded(asked));
  }
</script>

<div class="picker" class:reserve={reserve && !(linked && !typed)} class:reserveone={reserve && linked && !typed} bind:this={root}>
  <div class="inputrow">
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
    aria-labelledby={labelledby}
    aria-describedby={[armed ? `${listId}-hint` : '', describedby ?? ''].filter(Boolean).join(' ') || undefined}
    bind:value
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => { if (value) open = true; }}
    onblur={onBlur}
  />
  <ul class="menu card" role="listbox" id={listId} aria-label="Suggested names" hidden={!menuOpen} bind:this={menuEl} style:max-height={room != null ? `${room}px` : undefined}>
    {#each rows as s, i (s.key > 0 ? s.key : `${s.local ? 'page' : 'row'}:${s.rank ?? ''}:${s.name}`)}
      {@const note = rowNote(s)}
      <!-- A heading where the rows' source changes, so a row need not say it (round eighty-five; outside review A16g). Hidden
           from a screen reader, which reads each row's own words, "has a species page" among them. -->
      {#if i === 0 || sourceOf(rows[i - 1]) !== sourceOf(s)}<li class="grp" role="presentation" aria-hidden="true" onmousedown={(e) => e.preventDefault()}>{s.local ? 'Species pages' : "GBIF's names"}</li>{/if}
      <!-- "has a species page", not "has a dossier": the glossary's plain words (round fifty-eight; the accessibility review). -->
      <li role="option" id={optionId(i)} aria-selected={i === hi} class:hi={i === hi} tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(s)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s); } }} onmousemove={() => (hi = i)}><SpeciesName name={s.asCultivar ? `${s.name} '${s.asCultivar}'` : s.name} /> <span class="faint">{s.family ?? ''}{s.rank === 'GENUS' ? ' · genus' : /\s(?:(?:notho)?(?:var|subsp)|f|nothof)\.\s/.test(s.name) ? '' : s.rank === 'SUBSPECIES' ? ' · subspecies' : s.rank === 'VARIETY' ? ' · variety' : s.rank === 'FORM' ? ' · form' : ''}{#if note.sr}<span class="sr">{note.sr}</span>{/if}{note.shown}</span></li>
    {/each}
  </ul>
  </div>
  <!-- The name check's words under the field, in a space kept for them when the form asks (`reserve`): on the add form
       the pill and the line arrived a second after the field was left and moved "Use my own number" and Add by up to
       120 px, so a tap begun before the answer landed on nothing (round sixty-seven; triage-66 P10, S-E2, decision D5). -->
  <div class="status" bind:this={statusEl} class:held={held != null} style:height={held ? `${held.h}px` : undefined} style:margin-top={held ? held.m : undefined}>
  {#if taxonKey}<span class="pill ok" title="Filed under GBIF's key {taxonKey}, the number GBIF's backbone gives this name">GBIF {taxonKey}</span>{:else if keyless}<span class="pill">no key filed</span>{:else if resolved === 'no'}<span class="pill warn">not in the backbone{nearest ? '' : ', kept as typed'}</span>{:else if resolved === 'unreached'}<span class="pill warn">{nameRefusal ? 'name service not asked' : 'name service not reached'}{nearest ? '' : ', kept as typed'}</span>{/if}
  {#if kind === 'hybrid'}<span class="pill">hybrid{parentage ? '' : ', parentage not stated'}</span>{:else if kind === 'cultivar'}<span class="pill">cultivar{notStated ? ', species not stated' : ''}</span>{/if}
  <!-- One line under the field, not three stacked: the service's silence is folded into the line that asks (round sixty; the grower review, 18). -->
  {#if olderRow}<p class="hint" id={armed ? `${listId}-hint` : undefined} role="status">{older?.why === 'merged' ? 'Its page was merged into ' : gbifNamed ? "GBIF's name for " : 'An older name of '}<button type="button" class="linkish" onclick={() => pick(olderRow)}><SpeciesName name={olderRow.name} /></button>, which has a species page: pick it, or {armed ? `press “${addLabel}” to keep` : 'Add keeps'} exactly what you typed.</p>
  {:else if nearest}<p class="hint" id={armed ? `${listId}-hint` : undefined} role="status">Not a reference name. Did you mean <button type="button" class="linkish" onclick={() => pick(nearest)}><SpeciesName name={nearest.name} /></button>? Otherwise {armed ? `“${addLabel}”` : 'Add'} keeps exactly what you typed.</p><!-- the button's own words once armed (round eighty-six; review-s S3) -->
  {:else if readAsCultivar && armed}<p class="hint" id="{listId}-hint" role="status">No species of that name was found, so it is read as the genus <i>{readAsCultivar}</i> with a cultivar. Press Add to keep it, or change the name.</p>
  {:else if armed}<p class="hint" id="{listId}-hint" role="status">{resolved === 'unreached' && !gbifRefused && !nameRefusal ? '' : namesSaid}{refSaid}Pick a name from the list, or press {addLabel === 'Add' ? 'Add' : `“${addLabel}”`} to keep exactly what you typed.</p><!-- a plain failure of the name service is the pill's to say ("name service not reached"): said twice, the line ran to a fourth line on a phone once a leave armed it, and moved what follows (round eighty-six; r67p P10) --><!-- the button's own words: it reads "Add as typed" by then (round eighty; the desktop review's 11) -->
  {:else if nameServiceDown && refDown}<p class="hint svc" role="status">{namesSaid}{refSaid}A name typed in full is kept as typed and checked later.</p>
  <!-- With a key found, or a pill that already says the name is kept as typed, the line does not say it again: it then fits the room kept for it (round sixty-seven; triage-66 P10). -->
  {:else if nameServiceDown}<p class="hint svc" role="status">{gbifRefused ? "GBIF refused this site's request for names, so only" : nameRefusal ? `The name service was not asked: ${nameRefusal}. Only` : 'The name service did not answer, so only'} the reference's own species are offered{taxonKey || resolved === 'no' || resolved === 'unreached' ? '' : '; a name typed in full is kept as typed and checked later'}.</p>
  {:else if refDown}<p class="hint svc" role="status">{refWords(refDown)}, so only the backbone's names are offered.</p>
  {:else if received}<p class="hint svc" role="status">What you typed, “{received}”, is kept as the name as received.</p>
  {:else if notStated}<p class="hint svc" role="status">Filed under the genus <i>{parseName(value).genus}</i>. Name its species before the quotes if you know it, for its species page.</p>{/if}
  </div>
</div>

<style>
  .picker { display: block; }
  /* The menu hangs from the field itself, not from the words under it. */
  .inputrow { position: relative; display: flex; }
  input { flex: 1; min-width: 0; width: 100%; padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: var(--r); background: var(--card); }
  /* The pills and the line flow as one block under the field. */
  .status { font-size: var(--fs-md); line-height: 1.4; }
  /* Held at its height under a press outside the picker (\`held\`): what arrives meanwhile shows when the press is over. */
  .status.held { overflow: hidden; }
  .status:has(*) { margin-top: 0.35rem; }
  .status .pill { margin: 0 0.4em 0.25em 0; vertical-align: baseline; }
  /* Kept for them on a form whose buttons must not move (\`reserve\`): a pill row and two lines of words, the most the
     check says on a phone for a name it resolves or does not know; the space is there before the field is left. */
  .picker.reserve .status { min-height: calc(1.4em * 3 + 0.5em); margin-top: 0.35rem; } /* three lines, one of them with a pill's padding */
  /* A name that came with its key from a species page: only the pill can change until the grower types, so one pill's line
     is kept, not three; the three came back the moment they type. Three left about 70 px of nothing under "GBIF 7284333" on
     a phone (round eighty; the phone review's 9). */
  .picker.reserveone .status { min-height: calc(1.4em + 0.5em); margin-top: 0.35rem; }
  /* The line runs on after the pills, so a pill and its sentence take the fewest lines. */
  .hint { display: inline; margin: 0; font-size: var(--fs-md); color: var(--ink2); }
  .hint.svc { color: var(--ink3); }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; list-style: none; margin: 0.3rem 0 0; padding: 0.3rem; box-shadow: var(--sh2); max-height: 18rem; overflow: auto; }
  .menu[hidden] { display: none; }
  .menu li { display: block; width: 100%; text-align: left; padding: 0.45em 0.6em; border-radius: var(--r-sm); cursor: pointer; }
  .menu li:hover, .menu li.hi { background: var(--sunk); }
  /* The source's heading: small, and never a target. */
  .menu li.grp { padding: 0.35em 0.6em 0.1em; font-size: var(--fs-xs); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink3); cursor: default; }
  .menu li.grp:hover { background: none; }
</style>

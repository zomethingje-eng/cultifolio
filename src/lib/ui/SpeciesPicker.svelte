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
  import { pickedName } from '$lib/ui/picked-name';
  import SpeciesName from './SpeciesName.svelte';
  import type { NameKind } from '$core/names';
  let { value = $bindable(''), taxonKey = $bindable<number | null>(null), cultivar = $bindable<string | null>(null), kind = $bindable<NameKind>('species'), parentage = $bindable<string | null>(null), id = 'species-name', unresolved = $bindable(false), armed = $bindable(false) }: { value?: string; taxonKey?: number | null; cultivar?: string | null; kind?: NameKind; parentage?: string | null; id?: string; unresolved?: boolean; armed?: boolean } = $props();
  type Sugg = { key: number; name: string; family?: string; rank?: string; status?: string; local?: boolean; far?: boolean };
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
  let nameHeld = $state(false); // the site held the call back: "not asked", never "did not answer" (round sixty-one)
  let nameServiceDown = $state(false); // /api/names refused or unreachable: said under the field (round seventeen, 1)
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
  let lastRows: { q: string; rows: Promise<Row[]> } | null = null;
  function namesFor(q: string): Promise<Row[]> {
    if (lastRows && lastRows.q === q) return lastRows.rows;
    // /api/names proxies GBIF's species/suggest (same JSON shape) from the Worker, so no name you type leaves this site from the browser.
    const rows = fetch(`/api/names?q=${encodeURIComponent(q)}`).then(async (r) => {
      // A call the site held back (its minute of calls to GBIF used up) is said as that, not as a silence (round sixty-one; the server review, 4).
      if (!r.ok) throw new Error((r.status === 503 || r.status === 429) && (await r.json().then((b: unknown) => (b as { held?: unknown } | null)?.held === true, () => false)) ? 'held' : String(r.status));
      return (await r.json()) as Row[];
    });
    const entry = { q, rows };
    lastRows = entry;
    rows.catch(() => { if (lastRows === entry) lastRows = null; });
    return rows;
  }

  async function search(q: string) {
    const gen = ++reqGen;
    const live = () => gen === reqGen;
    const p = parseName(q);
    cultivar = p.cultivar ?? null;
    kind = p.kind;
    parentage = p.parentage ?? null;
    const genusOnly = !p.epithet;
    const needle = p.scientific.toLowerCase();
    // The reference's own suggestions come from the server's search over the index (round thirty-nine), not from the
    // whole index fetched here; the name typed already went to /api/names, so nothing new leaves the device. The corpus
    // index is species-level; for a genus-only name (a hybrid) its rows would be wrong suggestions.
    // Both asked at once (round forty, R2-3): the reference's own suggestions and the name service are independent, and a
    // slow catalogue search must not hold the backbone's answer for its ten seconds.
    const typedGenus = needle.split(/\s+/)[0] ?? '';
    let local: Sugg[] = [];
    let remote: Sugg[] = [];
    const show = () => {
      suggestions = [...local, ...remote.filter((x) => !local.some((l) => l.key === x.key))];
      if (hi >= suggestions.length) hi = -1;
      open = true;
    };
    hi = -1;
    open = true;
    const indexP = (genusOnly || needle.length < 2 ? Promise.resolve([] as Found[]) : searchCatalogue(needle, 6)).then((answer) => {
      if (!live()) return;
      // A hit whose genus is not the one typed came from the one-edit fallback ("polyphylla" → Lupinus polyphyllus): say so.
      // A retried answer ("Showing results for …") is not offered: it answers other words than the name typed, and "Copiapoa
      // cinerea var. columna-alba" was offered the species as if it were the variety (round sixty-one; the corpus review, 5).
      local = (Array.isArray(answer) && !('relaxed' in answer && answer.relaxed) ? answer : []).map((e) => ({ key: e.key, name: e.name, family: e.family, local: true, far: !e.name.toLowerCase().startsWith(typedGenus.slice(0, Math.min(4, typedGenus.length))) }));
      show();
    });
    const namesP = needle.length < 3 ? Promise.resolve() : namesFor(p.scientific).then((rows) => {
      if (!live()) return;
      nameServiceDown = false;
      nameHeld = false;
      remote = rows
        .filter((x) => (genusOnly ? x.rank === 'GENUS' : /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '')))
        .map((x) => ({ key: x.key, name: x.canonicalName ?? x.scientificName ?? '', family: x.family, rank: x.rank, status: x.status }))
        // The backbone lists a subspecies under several keys (accepted, synonyms of one another); one line per name and rank is enough.
        .filter((x, i, arr) => arr.findIndex((y) => y.name === x.name && y.rank === x.rank) === i);
      show();
    }, (e: unknown) => {
      // A refusal is said, not shown as an empty list: the grower can still type the name and let the plant page repair the key later (round seventeen, 1).
      if (live()) { nameServiceDown = true; nameHeld = e instanceof Error && e.message === 'held'; } // offline: local suggestions only, and said
    });
    await Promise.all([indexP, namesP]);
  }

  function onInput() {
    reqGen++;
    taxonKey = null;
    resolved = 'unknown';
    armed = false;
    hi = -1;
    clearTimeout(timer);
    timer = setTimeout(() => search(value), 180);
  }
  function pick(s: Sugg) {
    // Keep the cross as typed; only the matched part changes, and a species keeps the rank and epithet typed after it (`pickedName`).
    value = pickedName(value, s);
    taxonKey = s.key;
    resolved = 'yes';
    armed = false;
    open = false;
    hi = -1;
  }
  async function checkExact() {
    if (taxonKey || value.trim().length < 4) return;
    const gen = reqGen;
    const p = parseName(value);
    // A reference name typed in full resolves from the reference's own index, with or without the name service: the
    // greenhouse case (round twenty-three, 4).
    const want0 = p.scientific.toLowerCase();
    const local = suggestions.find((s) => s.local && s.name.toLowerCase() === want0);
    if (local) {
      taxonKey = local.key;
      resolved = 'yes';
      return;
    }
    try {
      // An exact spelling among the suggestions resolves the name; a genus-only name (a hybrid, a cultivar of unstated parentage) resolves at genus rank.
      const rows = await namesFor(p.scientific);
      if (gen !== reqGen) return; // the field changed while this was asked
      const want = p.scientific.toLowerCase();
      const m = rows.find((x) => (x.canonicalName ?? x.scientificName ?? '').toLowerCase() === want && (p.epithet ? /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '') : x.rank === 'GENUS'));
      if (m) {
        taxonKey = m.key;
        resolved = 'yes';
      } else resolved = 'no';
    } catch {
      if (gen === reqGen) resolved = 'unreached';
    }
  }
  /** For the form: resolve now, and say whether the name stands. Awaited before a plant is filed, so a click that outran the blur's check still checks (round twenty-three, 4). */
  export async function check(): Promise<boolean> {
    if (kind === 'hybrid') return true;
    clearTimeout(timer);
    if (value.trim() && !suggestions.length) await search(value);
    await checkExact();
    return !!taxonKey || resolved === 'yes';
  }
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
    if (taxonKey || !value.trim()) return;
    const want = parseName(value).scientific.toLowerCase();
    const exact = suggestions.find((s) => s.name.toLowerCase() === want);
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
  {#if taxonKey}<span class="pill ok">GBIF {taxonKey}</span>{:else if resolved === 'no'}<span class="pill warn">not in the backbone, kept as typed</span>{:else if resolved === 'unreached'}<span class="pill warn">name service not reached, kept as typed</span>{/if}
  {#if kind === 'hybrid'}<span class="pill">hybrid{parentage ? '' : ', parentage not stated'}</span>{:else if kind === 'cultivar'}<span class="pill">cultivar</span>{/if}
  <!-- One line under the field, not three stacked: the service's silence is folded into the line that asks (round sixty; the grower review, 18). -->
  {#if nearest}<p class="hint" role="status">Not a reference name. Did you mean <button type="button" class="linkish" onclick={() => pick(nearest)}><SpeciesName name={nearest.name} /></button>? Otherwise Add keeps exactly what you typed.</p>
  {:else if armed}<p class="hint" id="{listId}-hint" role="status">{nameServiceDown ? (nameHeld ? "The name service was not asked: this site's calls to it are used up for this minute. " : 'The name service did not answer. ') : ''}Pick a name from the list, or press Add to keep exactly what you typed.</p>
  {:else if nameServiceDown}<p class="hint svc" role="status">{nameHeld ? "The name service was not asked (this site's calls to it are used up for this minute)" : 'The name service did not answer'}, so only the reference's own species are offered; a name typed in full is kept as typed and checked later.</p>{/if}
  <ul class="menu card" role="listbox" id={listId} aria-label="Suggested names" hidden={!menuOpen}>
    {#each suggestions as s, i (s.key)}
      <!-- "has a species page", not "has a dossier": the glossary's plain words (round fifty-eight; the accessibility review). -->
      <li role="option" id={optionId(i)} aria-selected={i === hi} class:hi={i === hi} tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(s)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s); } }} onmousemove={() => (hi = i)}><SpeciesName name={s.name} /> <span class="faint">{s.family ?? ''}{s.rank === 'GENUS' ? ' · genus' : s.rank === 'SUBSPECIES' ? ' · subspecies' : s.rank === 'VARIETY' ? ' · variety' : s.rank === 'FORM' ? ' · form' : ''}{s.far ? ' · similar spelling, another genus' : s.local ? ' · has a species page' : ''}</span></li>
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

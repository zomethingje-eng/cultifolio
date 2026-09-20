<script lang="ts">
  /**
   * Type a name; get suggestions from the dossier index first (instant, local
   * to this site) and from the GBIF backbone as you type, through this site's
   * /api/names so the browser talks to no third-party host. Picking sets the
   * accepted name and the GBIF key; typing a name nobody resolves is allowed
   * and flagged, never silently guessed.
   *
   * The list is a combobox: ArrowUp/ArrowDown move a highlight, Enter picks
   * it, Escape closes. Enter on a name nothing resolved does not file the
   * plant under a half-typed name: the first press asks, the second is the
   * grower's deliberate act and lets the form submit exactly what was typed.
   */
  import { parseName } from '$core/names';
  import { prepare, search as searchIndex, type Prepared } from '$core/search';
  import SpeciesName from './SpeciesName.svelte';
  import type { NameKind } from '$core/names';
  let { value = $bindable(''), taxonKey = $bindable<number | null>(null), cultivar = $bindable<string | null>(null), kind = $bindable<NameKind>('species'), parentage = $bindable<string | null>(null) } = $props();
  type Sugg = { key: number; name: string; family?: string; rank?: string; status?: string; local?: boolean };
  let suggestions = $state<Sugg[]>([]);
  let open = $state(false);
  type Entry = { key: number; slug: string; name: string; family?: string; common?: string };
  let index: Entry[] | null = null;
  let prepared: Prepared<Entry>[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolved = $state<'yes' | 'no' | 'unknown'>('unknown');
  /** The highlighted row, or -1 for none. */
  let hi = $state(-1);
  /** Enter was pressed once on a name nothing resolved; the next press submits it as typed. */
  let armed = $state(false);
  let root = $state<HTMLDivElement | null>(null);
  const uid = $props.id();
  const listId = `species-menu-${uid}`;
  const menuOpen = $derived(open && suggestions.length > 0);
  const optionId = (i: number) => `${listId}-${i}`;

  async function loadIndex() {
    if (index) return index;
    try {
      index = await (await fetch('/api/index')).json();
    } catch {
      index = [];
    }
    return index!;
  }

  async function search(q: string) {
    const p = parseName(q);
    cultivar = p.cultivar ?? null;
    kind = p.kind;
    parentage = p.parentage ?? null;
    const genusOnly = !p.epithet;
    const needle = p.scientific.toLowerCase();
    const idx = await loadIndex();
    // The corpus index is species-level; for a genus-only name (a hybrid) its rows would be wrong suggestions.
    if (!prepared) prepared = prepare(idx);
    const local: Sugg[] = genusOnly ? [] : searchIndex(prepared!, needle, 6).map((e) => ({ key: e.key, name: e.name, family: e.family, local: true }));
    suggestions = local;
    hi = -1;
    open = true;
    if (needle.length < 3) return;
    try {
      // /api/names proxies GBIF's species/suggest (same JSON shape) from the Worker, so no name you type leaves this site from the browser.
      const r = await fetch(`/api/names?q=${encodeURIComponent(p.scientific)}`);
      if (!r.ok) return;
      const rows = (await r.json()) as Array<{ key: number; canonicalName?: string; scientificName: string; family?: string; rank?: string; status?: string }>;
      const remote: Sugg[] = rows
        .filter((x) => (genusOnly ? x.rank === 'GENUS' : /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '')))
        .map((x) => ({ key: x.key, name: x.canonicalName ?? x.scientificName, family: x.family, rank: x.rank, status: x.status }))
        .filter((x) => !local.some((l) => l.key === x.key));
      suggestions = [...local, ...remote];
      if (hi >= suggestions.length) hi = -1;
    } catch {
      /* offline: local suggestions only */
    }
  }

  function onInput() {
    taxonKey = null;
    resolved = 'unknown';
    armed = false;
    hi = -1;
    clearTimeout(timer);
    timer = setTimeout(() => search(value), 180);
  }
  function pick(s: Sugg) {
    // Keep the cross as typed; only the matched part changes.
    value = parentage ? `${parentage}${cultivar ? ` '${cultivar}'` : ''}` : s.name + (cultivar ? ` '${cultivar}'` : '');
    taxonKey = s.key;
    resolved = 'yes';
    armed = false;
    open = false;
    hi = -1;
  }
  async function checkExact() {
    if (taxonKey || value.trim().length < 4) return;
    const p = parseName(value);
    try {
      // An exact spelling among the suggestions resolves the name; a genus-only name (a hybrid, a cultivar of unstated parentage) resolves at genus rank.
      const r = await fetch(`/api/names?q=${encodeURIComponent(p.scientific)}`);
      if (!r.ok) throw new Error(String(r.status));
      const rows = (await r.json()) as Array<{ key: number; canonicalName?: string; scientificName?: string; rank?: string }>;
      const want = p.scientific.toLowerCase();
      const m = rows.find((x) => (x.canonicalName ?? x.scientificName ?? '').toLowerCase() === want && (p.epithet ? /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '') : x.rank === 'GENUS'));
      if (m) {
        taxonKey = m.key;
        resolved = 'yes';
      } else resolved = 'no';
    } catch {
      resolved = 'unknown';
    }
  }
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
    // A resolved name, an empty field, or the second press: the form decides.
    if (taxonKey || armed || !value.trim()) return;
    // The exact spelling of a suggestion is a pick, not a partial name.
    const want = parseName(value).scientific.toLowerCase();
    const exact = suggestions.find((s) => s.name.toLowerCase() === want);
    if (exact) {
      e.preventDefault();
      pick(exact);
      return;
    }
    e.preventDefault();
    open = false;
    hi = -1;
    armed = true;
  }
</script>

<div class="picker" bind:this={root}>
  <input
    id="species-name"
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
  {#if taxonKey}<span class="pill ok">GBIF {taxonKey}</span>{:else if resolved === 'no'}<span class="pill warn">not in the backbone — kept as typed</span>{/if}
  {#if kind === 'hybrid'}<span class="pill">hybrid{parentage ? '' : ', parentage not stated'}</span>{:else if kind === 'cultivar'}<span class="pill">cultivar</span>{/if}
  {#if armed}<p class="hint" id="{listId}-hint" role="status">Pick a name from the list, or press Enter again to use exactly what you typed.</p>{/if}
  <ul class="menu card" role="listbox" id={listId} aria-label="Suggested names" hidden={!menuOpen}>
    {#each suggestions as s, i (s.key)}
      <li role="option" id={optionId(i)} aria-selected={i === hi} class:hi={i === hi} tabindex="-1" onmousedown={(e) => e.preventDefault()} onclick={() => pick(s)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(s); } }} onmousemove={() => (hi = i)}><SpeciesName name={s.name} /> <span class="faint">{s.family ?? ''}{s.rank === 'GENUS' ? ' · genus' : ''}{s.local ? ' · has a dossier' : ''}</span></li>
    {/each}
  </ul>
</div>

<style>
  .picker { position: relative; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  input { flex: 1; min-width: 14rem; padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: 8px; background: var(--card); }
  .hint { flex-basis: 100%; margin: 0; font-size: 12.5px; color: var(--ink2); }
  .menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; list-style: none; margin: 0.3rem 0 0; padding: 0.3rem; box-shadow: var(--sh2); max-height: 18rem; overflow: auto; }
  .menu[hidden] { display: none; }
  .menu li { display: block; width: 100%; text-align: left; padding: 0.45em 0.6em; border-radius: 6px; cursor: pointer; }
  .menu li:hover, .menu li.hi { background: var(--sunk); }
</style>

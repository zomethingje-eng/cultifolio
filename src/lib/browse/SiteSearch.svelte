<script lang="ts">
  /**
   * The search box at the top of every page (round eighty-seven, C3), for the layout's header. As you type it suggests,
   * in two groups: Browse, the views a query names (a genus with a place, a genus, a family, a country, a TDWG region;
   * /api/suggest), and Species, the catalogue's own search unchanged (/api/search: older names, GBIF's names, common
   * names, typing errors, each row saying why it matched). A full species name typed wins Enter; otherwise Enter opens
   * the row picked, the first by default. The empty box shows the views pinned in the collection (round eighty-seven,
   * C6; each opens its view with what changed since it was last seen) and the searches chosen here before, kept in this
   * browser only ($lib/browse/recent).
   *
   * The combobox pattern of ARIA 1.2: the input owns a listbox; arrows move through its options, Enter opens one,
   * Escape closes the list and then empties the box, Tab leaves. "/" anywhere outside a field puts the cursor here: the
   * layout's one handler of the key does it (`slashKey`), for this box and the front page's own alike, so the key is
   * handled once. The key's hint is hidden where there is no keyboard to press it (hover: none). Without scripts it is a
   * form that opens the front page's catalogue search for the words. The box is the look's `.site-search-box` (theme.css),
   * styled there once; only what is this component's own (the list, Cancel, the hint hidden while typing) is here. A text field with the combobox's role, not a search field: a page's
   * own search box is the first `input[type=search]` the browser suites find on it (the front page's, the 404's).
   */
  import { goto } from '$app/navigation';
  import { searchCatalogue, suggestRows, plantNumberShaped, type SearchFound } from '$lib/ui/index.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { olderNameOf, homonymOf, mergedOf, mergedSentence, gbifNameWords, isGbifName, searchedSentence, narrowSentence } from '$lib/ui/ref/searched';
  import { recentSearches, rememberSearch, forgetSearches, pinnedViews, type Recent } from './recent';
  import { openPin } from './pinned.svelte';
  import type { Suggestion } from './suggest';

  let { placeholder = 'Search a plant, a genus, a region', id = 'site-search' }: { placeholder?: string; id?: string } = $props();

  type Group = 'pinned' | 'recent' | 'browse' | 'species' | 'all' | 'clear';
  type Option = { id: string; group: Group; label: string; /** The whole label is a scientific name, or this part of it is. */ sci?: boolean | string; sub?: string; href: string; exact?: boolean; /** A pin's browse query. */ view?: string };

  let q = $state('');
  let open = $state(false);
  let focused = $state(false);
  let active = $state(-1);
  let browse = $state<Suggestion[]>([]);
  let species = $state<SearchFound | null>(null);
  let note = $state<string | null>(null);
  let busy = $state(false);
  let recent = $state<Recent[]>([]);
  let pinned = $state<Recent[]>([]);
  let input: HTMLInputElement | undefined = $state();
  let asked = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The words typed while the collection was still opening, asked once it has (or once it cannot open). */
  let waiting = $state<string | null>(null);
  /**
   * What stays on this device (round eighty-seven, the integration; /about/how#privacy): text shaped like one of the
   * collection's plant numbers is never sent, as the front page's search never sends it (`plantNumberShaped`, by the
   * collection's own scheme), and nothing is sent before the collection has opened, while that scheme is not known. The
   * box says so, and its last row still opens the front page's search for the words, on purpose.
   */
  const KEPT_HERE = 'Not searched: it is shaped like one of your plant numbers, which stay on this device.';
  $effect(() => { if (waiting !== null && (collection.ready || collection.failed)) { const t = waiting; waiting = null; ask(t); } });
  // The pinned views, read again when the collection opens with the box already open (round eighty-seven, the owner's
  // third predeploy: in Safari's engine a press on the box as the page came read them before the collection had opened,
  // found none, and the list stayed without them; r87b 2). Read once more, at that moment only, so the list does not
  // change under the reader after.
  let pinsRead = false;
  $effect(() => { if (focused && collection.ready && !pinsRead) { pinsRead = true; pinned = pinnedViews(); } });

  const listId = $derived(`${id}-list`);
  const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/×/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** A species row's words: why it matched (an older name, GBIF's name, a merged page, another author's name), its English name, its family. */
  function speciesOption(h: SearchFound[number], i: number, typed: string): Option {
    const merged = mergedOf(typed, h);
    const older = merged ? null : olderNameOf(typed, h);
    const homonym = older || merged ? null : homonymOf(typed, h);
    const was = older ?? homonym?.name;
    const why = merged ? mergedSentence(merged) : older && isGbifName(older, h) ? gbifNameWords(older) : older ? `older name: ${older}` : homonym ? `older name under another author: ${homonym.text}` : '';
    const t = fold(typed);
    const exact = !!t && (fold(h.name) === t || (!!older && fold(older) === t) || (!!merged && fold(merged) === t));
    return { id: `${id}-s${i}`, group: 'species', label: h.name, sci: true, sub: [why, h.common, h.family].filter(Boolean).join(' · '), href: `/species/${h.slug}${was ? `?was=${encodeURIComponent(was)}` : ''}`, exact };
  }

  const options = $derived.by((): Option[] => {
    const typed = q.trim();
    if (!typed) {
      const out: Option[] = [
        ...pinned.map((r, i) => ({ id: `${id}-p${i}`, group: 'pinned' as const, label: r.label, sub: r.sub, href: r.href, view: r.view })),
        ...recent.map((r, i) => ({ id: `${id}-r${i}`, group: 'recent' as const, label: r.label, sub: r.q !== r.label ? `searched “${r.q}”` : undefined, href: r.href }))
      ];
      if (recent.length) out.push({ id: `${id}-clear`, group: 'clear', label: 'Clear recent searches', href: '' });
      return out;
    }
    const b: Option[] = browse.map((s, i) => ({ id: `${id}-b${i}`, group: 'browse' as const, label: s.label, ...(s.sci ? { sci: s.sci } : {}), sub: s.sub, href: s.href }));
    const sp: Option[] = Array.isArray(species) ? species.slice(0, 6).map((h, i) => speciesOption(h, i, typed)) : [];
    return [...b, ...sp, { id: `${id}-all`, group: 'all', label: `Every species matching “${typed}”`, href: `/?q=${encodeURIComponent(typed)}` }];
  });
  /** The row Enter opens with nothing picked: a full species name typed, else the first row. */
  const firstPick = $derived.by(() => { const e = options.findIndex((o) => o.exact); return e >= 0 ? e : options.length ? 0 : -1; });
  const shown = $derived(open && options.length > 0);
  const activeId = $derived(shown && active >= 0 && options[active] ? options[active].id : undefined);

  function ask(text: string) {
    const n = ++asked;
    clearTimeout(timer);
    if (!text.trim()) { browse = []; species = null; note = null; busy = false; waiting = null; return; }
    if (!collection.ready && !collection.failed) { waiting = text; busy = true; return; }
    waiting = null;
    if (plantNumberShaped(text, collection.ready ? collection.scheme : null)) { browse = []; species = null; note = KEPT_HERE; busy = false; return; }
    busy = true;
    timer = setTimeout(async () => {
      const [b, s] = await Promise.all([
        suggestRows<Suggestion>(text),
        searchCatalogue(text, 6)
      ]);
      if (n !== asked) return; // a later query is on its way
      browse = b;
      species = Array.isArray(s) ? s : null;
      note = s === null ? 'The reference could not be reached, so no species are listed.' : !Array.isArray(s) ? `The search is resting for this address; try again in ${Math.max(1, Math.round(s.limited / 60))} minute${Math.round(s.limited / 60) > 1 ? 's' : ''}.` : s.narrow ? narrowSentence(text) : searchedSentence(text, s, s);
      busy = false;
      active = -1;
    }, 120);
  }

  function choose(o: Option | undefined) {
    if (!o) return;
    if (o.group === 'clear') { forgetSearches(); recent = []; active = -1; input?.focus(); return; }
    const typed = q.trim();
    if (typed || o.group === 'recent') rememberSearch({ q: typed || o.label, label: o.label, href: o.href });
    open = false;
    q = '';
    browse = []; species = null; note = null;
    input?.blur();
    if (o.group === 'pinned' && o.view !== undefined) openPin(o.href, o.view); // the view opens with its changes (C9)
    else goto(o.href);
  }
  function onkeydown(e: KeyboardEvent) {
    const n = options.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { open = true; active = firstPick; return; } if (n) active = active < 0 ? firstPick : (active + 1) % n; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) { open = true; } if (n) active = active <= 0 ? n - 1 : active - 1; }
    else if (e.key === 'Home' && shown && active >= 0) { e.preventDefault(); active = 0; }
    else if (e.key === 'End' && shown && active >= 0) { e.preventDefault(); active = n - 1; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown) choose(options[active >= 0 ? active : firstPick]);
      else if (q.trim()) choose({ id: '', group: 'all', label: q.trim(), href: `/?q=${encodeURIComponent(q.trim())}` });
    } else if (e.key === 'Escape') {
      if (shown) { e.preventDefault(); open = false; active = -1; }
      else if (q) { e.preventDefault(); q = ''; ask(''); }
    } else if (e.key === 'Tab') { open = false; }
  }
  function oninput() { open = true; active = -1; ask(q); }
  function onfocus() { focused = true; recent = recentSearches(); pinned = pinnedViews(); pinsRead = collection.ready; open = true; }
  function onblur() { focused = false; setTimeout(() => { if (!focused) open = false; }, 120); }

  const groupLabel: Record<Group, string> = { pinned: 'Pinned', recent: 'Recent searches', browse: 'Browse', species: 'Species', all: '', clear: '' };
  const groups = $derived.by(() => {
    const out: Array<{ g: Group; items: Array<{ o: Option; i: number }> }> = [];
    options.forEach((o, i) => { const last = out[out.length - 1]; const g = o.group === 'clear' ? 'recent' : o.group; if (last && last.g === g) last.items.push({ o, i }); else out.push({ g, items: [{ o, i }] }); });
    return out;
  });
  /**
   * What the live region says: how many rows, and the note's reason (round eighty-seven, M4): "0 suggestions" was all a
   * screen reader heard for a plant number kept on this device, or a reference not reached.
   */
  const status = $derived.by(() => {
    if (!q.trim()) return '';
    if (busy) return 'Searching';
    const n = browse.length + (Array.isArray(species) ? Math.min(6, species.length) : 0);
    return n ? `${n} suggestion${n === 1 ? '' : 's'}${note ? `. ${note}` : ''}` : (note ?? 'No suggestions');
  });
</script>

<form class="sitesearch" class:focused role="search" action="/" method="get" onsubmit={(e) => e.preventDefault()}>
  <label class="box site-search-box">
    <span class="sr">Search the reference</span>
    <input
      bind:this={input}
      bind:value={q}
      {id}
      name="q"
      type="text"
      inputmode="search"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
      {placeholder}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={shown}
      aria-controls={listId}
      aria-activedescendant={activeId}
      aria-describedby={note ? `${id}-hint ${id}-note` : `${id}-hint`}
      {onkeydown}
      {oninput}
      {onfocus}
      {onblur}
    />
    <kbd class="hint" aria-hidden="true">/</kbd>
  </label>
  <span class="sr" id="{id}-hint">Press slash to come here from anywhere on the page.</span>
  {#if focused}<button class="cancel" type="button" onmousedown={(e) => e.preventDefault()} onclick={() => { q = ''; ask(''); open = false; input?.blur(); }}>Cancel</button>{/if}
  <!-- The panel holds the listbox and, outside it, its foot: a listbox holds options and groups of them alone (round
       eighty-seven, the review of stage 1, M4). The note shown among the rows is the eyes' copy; a screen reader is given
       it by the status and the box's description, which are outside the listbox. -->
  <div class="list" hidden={!shown}>
  <div id={listId} role="listbox" aria-label="Suggestions">
    {#each groups as grp (grp.g + grp.items[0].o.id)}
      <div class="grp" role="group" aria-labelledby={groupLabel[grp.g] ? `${id}-g-${grp.g}` : undefined} aria-label={groupLabel[grp.g] ? undefined : 'More'}>
        {#if groupLabel[grp.g]}<div class="gh" id="{id}-g-{grp.g}" role="presentation">{groupLabel[grp.g]}</div>{/if}
        <!-- The note on the species rows, or, with none (not reached, or kept on this device), above the last row. -->
        {#if note && (grp.g === 'species' || (grp.g === 'all' && !groups.some((x) => x.g === 'species')))}<p class="note" aria-hidden="true">{note}</p>{/if}
        {#each grp.items as { o, i } (o.id)}
          <a class="opt {o.group}" id={o.id} role="option" aria-selected={i === active} href={o.href || undefined} tabindex="-1"
            onmousedown={(e) => e.preventDefault()} onmousemove={() => (active = i)}
            onclick={(e) => { e.preventDefault(); choose(o); }}>
            <span class="lab">{#if o.sci === true}<i>{o.label}</i>{:else if typeof o.sci === 'string' && o.label.includes(o.sci)}{o.label.slice(0, o.label.indexOf(o.sci))}<i>{o.sci}</i>{o.label.slice(o.label.indexOf(o.sci) + o.sci.length)}{:else}{o.label}{/if}</span>
            {#if o.sub}<span class="sub">{o.sub}</span>{/if}
            {#if i === (active >= 0 ? active : firstPick) && o.group !== 'clear'}<span class="enter" aria-hidden="true">Enter</span>{/if}
          </a>
        {/each}
      </div>
    {/each}
  </div>
    {#if q.trim()}<p class="foot">↑ ↓ to move · Enter opens the row marked; a full species name typed comes first · names from Kew's checklist, regions from TDWG</p>{/if}
  </div>
  <span class="sr" id="{id}-note">{note ?? ''}</span>
  <span class="sr" role="status" aria-live="polite">{status}</span>
</form>

<style>
  .sitesearch { position: relative; flex: 1; max-width: 480px; min-width: 0; display: flex; align-items: center; gap: 8px; }
  /* The box, its field and the "/" hint are the look's (.site-search-box and kbd, theme.css): only the box's share of the row is here. */
  .box { flex: 1; }
  .focused .hint { visibility: hidden; }
  .cancel { display: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 80; background: var(--bg); border: 1px solid var(--edge, var(--field-edge)); border-radius: 4px; padding: 4px 0; max-height: min(70vh, 560px); overflow-y: auto; min-width: min(480px, 92vw); }
  .list[hidden] { display: none; }
  .grp + .grp { border-top: 1px solid var(--rule); margin-top: 4px; padding-top: 4px; }
  .gh { padding: 4px 12px 2px; font-size: var(--fs-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  .note { margin: 2px 12px 4px; font-size: var(--fs-head); color: var(--ink2); }
  .opt { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; padding: 6px 12px; color: var(--ink); text-decoration: none; cursor: pointer; }
  .opt[aria-selected='true'] { background: var(--rule2, var(--rule)); }
  .lab { min-width: 0; overflow-wrap: anywhere; }
  .lab i { font-family: var(--serif); }
  .sub { grid-column: 1; font-size: var(--fs-head); color: var(--mut, var(--ink3)); overflow-wrap: anywhere; }
  .enter { grid-column: 2; grid-row: 1; font-size: var(--fs-xs); color: var(--mut, var(--ink3)); border: 1px solid var(--kbd, var(--rule2)); border-radius: 3px; padding: 0 4px; align-self: center; }
  .opt.all .lab, .opt.clear .lab { color: var(--link, var(--accent)); }
  .foot { margin: 6px 12px 2px; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  @media (max-width: 899px) {
    .sitesearch.focused .cancel { display: inline-flex; align-items: center; min-height: 44px; padding: 0 6px; border: 0; background: none; color: var(--link, var(--accent)); font: inherit; }
    .box { height: 40px; }
    .list { position: fixed; top: var(--bar-h, 56px); left: 0; right: 0; bottom: 0; max-height: none; border: 0; border-top: 1px solid var(--rule); border-radius: 0; min-width: 0; }
    .opt { min-height: 44px; align-content: center; padding: 8px 16px; }
  }
</style>

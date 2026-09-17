<script lang="ts">
  /**
   * Type a name; get suggestions from the dossier index first (instant, local
   * to this site) and from the GBIF backbone as you type. Picking sets the
   * accepted name and the GBIF key; typing a name nobody resolves is allowed
   * and flagged, never silently guessed.
   */
  import { parseName } from '$core/names';
  import SpeciesName from './SpeciesName.svelte';
  import type { NameKind } from '$core/names';
  let { value = $bindable(''), taxonKey = $bindable<number | null>(null), cultivar = $bindable<string | null>(null), kind = $bindable<NameKind>('species'), parentage = $bindable<string | null>(null) } = $props();
  type Sugg = { key: number; name: string; family?: string; rank?: string; status?: string; local?: boolean };
  let suggestions = $state<Sugg[]>([]);
  let open = $state(false);
  let index: Array<{ key: number; slug: string; name: string; family?: string }> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolved = $state<'yes' | 'no' | 'unknown'>('unknown');

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
    const local: Sugg[] = genusOnly ? [] : idx.filter((e) => e.name.toLowerCase().startsWith(needle)).slice(0, 6).map((e) => ({ key: e.key, name: e.name, family: e.family, local: true }));
    suggestions = local;
    open = true;
    if (needle.length < 3) return;
    try {
      const r = await fetch(`https://api.gbif.org/v1/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=8&q=${encodeURIComponent(p.scientific)}`);
      if (!r.ok) return;
      const rows = (await r.json()) as Array<{ key: number; canonicalName?: string; scientificName: string; family?: string; rank?: string; status?: string }>;
      const remote: Sugg[] = rows
        .filter((x) => (genusOnly ? x.rank === 'GENUS' : /SPECIES|SUBSPECIES|VARIETY|FORM/.test(x.rank ?? '')))
        .map((x) => ({ key: x.key, name: x.canonicalName ?? x.scientificName, family: x.family, rank: x.rank, status: x.status }))
        .filter((x) => !local.some((l) => l.key === x.key));
      suggestions = [...local, ...remote];
    } catch {
      /* offline: local suggestions only */
    }
  }

  function onInput() {
    taxonKey = null;
    resolved = 'unknown';
    clearTimeout(timer);
    timer = setTimeout(() => search(value), 180);
  }
  function pick(s: Sugg) {
    // Keep the cross as typed; only the matched part changes.
    value = parentage ? `${parentage}${cultivar ? ` '${cultivar}'` : ''}` : s.name + (cultivar ? ` '${cultivar}'` : '');
    taxonKey = s.key;
    resolved = 'yes';
    open = false;
  }
  async function checkExact() {
    if (taxonKey || value.trim().length < 4) return;
    const p = parseName(value);
    try {
      const r = await fetch(`https://api.gbif.org/v1/species/match?strict=false&name=${encodeURIComponent(p.scientific)}`);
      const m = (await r.json()) as { usageKey?: number; matchType?: string; canonicalName?: string };
      // A genus-only name (a hybrid, a cultivar of unstated parentage) is correctly matched at genus rank.
      if (m.usageKey && m.matchType !== 'NONE' && (m.matchType !== 'HIGHERRANK' || !p.epithet)) {
        taxonKey = m.usageKey;
        resolved = 'yes';
      } else resolved = 'no';
    } catch {
      resolved = 'unknown';
    }
  }
</script>

<div class="picker">
  <input id="species-name" type="text" autocomplete="off" spellcheck="false" placeholder="Genus species" bind:value oninput={onInput} onfocus={() => value && (open = true)} onblur={() => setTimeout(() => { open = false; checkExact(); }, 150)} />
  {#if taxonKey}<span class="pill ok">GBIF {taxonKey}</span>{:else if resolved === 'no'}<span class="pill warn">not in the backbone — kept as typed</span>{/if}
  {#if kind === 'hybrid'}<span class="pill">hybrid{parentage ? '' : ', parentage not stated'}</span>{:else if kind === 'cultivar'}<span class="pill">cultivar</span>{/if}
  {#if open && suggestions.length}
    <ul class="menu card" role="listbox">
      {#each suggestions as s}
        <li><button type="button" onmousedown={() => pick(s)}><SpeciesName name={s.name} /> <span class="faint">{s.family ?? ''}{s.rank === 'GENUS' ? ' · genus' : ''}{s.local ? ' · has a dossier' : ''}</span></button></li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .picker { position: relative; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  input { flex: 1; min-width: 14rem; padding: 0.5em 0.8em; border: 1px solid var(--rule2); border-radius: 8px; background: var(--card); }
  .menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; list-style: none; margin: 0.3rem 0 0; padding: 0.3rem; box-shadow: var(--sh2); max-height: 18rem; overflow: auto; }
  .menu button { width: 100%; text-align: left; border: 0; background: transparent; padding: 0.45em 0.6em; border-radius: 6px; cursor: pointer; }
  .menu button:hover { background: var(--sunk); }
</style>

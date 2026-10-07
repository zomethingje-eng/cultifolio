<script lang="ts">
  /**
   * The foot of My plants (round sixty): the Wanted list, the species the grower follows and does not grow yet, each with
   * an optional note and price seen (the grower review's §2 table), and what the plants acquired this year cost, from
   * their prices where a price is a plain number (the product review's 4.7). Both are readings of the grower's own
   * records; the Wanted note is written to the species' own notes, one line, on Save.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { today as day } from '$lib/ui/day.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { focusNext } from '$lib/ui/focus';
  import { readWanted, writeWanted } from './wanted';
  import { spendOf, spendWords } from './spend';
  const wanted = $derived(collection.ready ? [...collection.mySpecies.values()].filter((s) => s.followed && !s.grown).sort((a, b) => a.name.localeCompare(b.name)) : []);
  let editing = $state<string | null>(null);
  let note = $state('');
  let price = $state('');
  function edit(slug: string) {
    const w = readWanted(collection.taxon(slug)?.myNotes);
    note = w.note; price = w.price; editing = slug;
  }
  /** The form's way out: focus back on the row's own button, which the form was opened from; it fell to the page (round sixty-one; the accessibility review, 2). */
  async function done(slug: string) {
    editing = null;
    await focusNext(`#wedit-${CSS.escape(slug)}`);
  }
  async function save(slug: string, name: string) {
    const t = collection.taxon(slug);
    await collection.put('taxon', slug, { name: t?.name ?? name, myNotes: writeWanted(t?.myNotes, note, price) });
    await done(slug);
    toast.show('Saved in the species’ own notes.');
  }
  const year = $derived(day.current.slice(0, 4));
  // Every plant ever entered counts, archived and dead ones too: the money was spent either way.
  const spendYear = $derived(collection.ready ? spendOf(collection.accessions.filter((a) => a.acquired?.startsWith(year)).map((a) => a.price)) : null);
  const spendAll = $derived(collection.ready ? spendOf(collection.accessions.map((a) => a.price)) : null);
  const spendLines = $derived(spendYear && spendAll ? spendWords(spendYear, spendAll, year) : null);
  /** The other half of a species' notes, beside the Wanted line: its first line, cut short. */
  const otherNotes = (myNotes: string | null | undefined): string => {
    const line = (myNotes ?? '').split('\n').find((l) => l.trim() && !l.startsWith('Wanted:'))?.trim() ?? '';
    return line.length > 90 ? `${line.slice(0, 90)}…` : line;
  };
</script>

{#if wanted.length}
  <section class="wanted" aria-labelledby="wanted-h" id="wanted">
    <div class="secrule"><h2 id="wanted-h">Wanted</h2><div class="line"></div><span class="n">{wanted.length}</span></div>
    <p class="muted small">Species you follow and do not grow yet. Follow or stop on a species page.</p>
    <ul class="wl">
      {#each wanted as s (s.slug)}
        {@const w = readWanted(collection.taxon(s.slug)?.myNotes)}
        <li>
          <div class="wrow">
            <a href="/species/{s.slug}"><SpeciesName name={s.name} /></a>
            {#if w.note || w.price}<span class="muted">{[w.note, w.price ? `price seen ${w.price}` : ''].filter(Boolean).join(' · ')}</span>{/if}
            {#if otherNotes(collection.taxon(s.slug)?.myNotes)}<span class="muted spnote">{otherNotes(collection.taxon(s.slug)?.myNotes)}</span>{/if}
            <!-- Named from its own words, then the species, so a voice saying "Add a note" finds it (round sixty-one; the accessibility review, 14); it says whether its form is open (11). -->
            <span class="acts"><button class="linkish" type="button" id="wedit-{s.slug}" onclick={() => (editing === s.slug ? done(s.slug) : edit(s.slug))} aria-expanded={editing === s.slug} aria-controls={editing === s.slug ? `wform-${s.slug}` : undefined} aria-label="{w.note || w.price ? 'Edit the note' : 'Add a note'} for {s.name}">{w.note || w.price ? 'Edit' : 'Add a note'}</button> <a class="linkish" href="/plants/new?species={encodeURIComponent(s.name)}{s.gbifKey ? `&key=${s.gbifKey}` : ''}">Got it</a></span>
          </div>
          {#if editing === s.slug}
            <form class="wform" id="wform-{s.slug}" onsubmit={(e) => { e.preventDefault(); void save(s.slug, s.name); }}>
              <label><span>Note</span><input type="text" bind:value={note} placeholder="e.g. a seedling, not a graft" /></label>
              <label><span>Price seen</span><input type="text" bind:value={price} placeholder="e.g. 18 at the spring sale" /></label>
              <div class="wacts"><button class="btn" type="button" onclick={() => done(s.slug)}>Cancel</button><button class="btn pri" type="submit">Save</button></div>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if spendLines}
  <details class="spend small" id="spend">
    <summary>Spent this year: {spendLines.year}</summary>
    <p>All time: {spendLines.all}</p>
    {#if spendLines.left}<p class="muted">{spendLines.left}</p>{/if}
    <p class="muted">Counted from each plant's price where it is a plain number, by the date it was acquired. Each currency is totalled apart, as written; none is converted.</p>
  </details>
{/if}

<style>
  .wanted { margin-top: 20px; }
  .wl { list-style: none; margin: 0; padding: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  .wl li { padding: 8px 12px; }
  .wl li + li { border-top: 1px solid var(--rule); }
  .wrow { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; min-height: var(--tap); }
  .wrow .acts { margin-left: auto; display: flex; gap: 12px; }
  .wform { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; margin: 6px 0 4px; }
  .wform label { display: grid; gap: 2px; font-size: var(--fs-md); }
  /* The fields shrink to the screen: at 320 px with 200% text the form was 411 px wide (round sixty-one; the accessibility review, 7). */
  .wform input { min-height: var(--tap); min-width: 0; width: 100%; box-sizing: border-box; }
  .wacts { flex-wrap: wrap; }
  .wacts { display: flex; gap: 8px; justify-content: flex-end; }
  .muted { color: var(--ink3); }
  .small { font-size: var(--fs-md); }
  .spend { margin: 12px 0 0; color: var(--ink2); }
  .spend summary { cursor: pointer; min-height: var(--tap); display: flex; align-items: center; }
  .spend p { margin: 4px 0 0; }
  .spnote { font-style: normal; }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); display: inline-flex; align-items: center; }
</style>

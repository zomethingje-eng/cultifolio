<script lang="ts">
  import { goto, beforeNavigate } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { localDate } from '$core/dates';
  import { accNo } from '$lib/db/types';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { today as day } from '$lib/ui/day.svelte';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { parseName, slugify, type NameKind, speciesSlug, speciesOf } from '$core/names';
  import { numberOrNull } from '$core/units';
  import { sheetForName } from '$lib/ui/index.svelte';
  import type { Provenance } from '$lib/db/types';
  /** The reference's key for a species-rank name when the reference answers; otherwise the key as given (the plant page repairs it later). */
  async function checkedKey(sp: string | null, k: number): Promise<number> {
    if (!sp || speciesOf(sp) !== sp) return k;
    const s = await sheetForName(sp, k);
    return s && s !== 'none' ? s.key : k;
  }
  onMount(async () => {
    await collection.load();
    // Arriving from a species page: /plants/new?species=Copiapoa%20cinerea&key=7284333
    const sp = page.url.searchParams.get('species');
    const k = Number(page.url.searchParams.get('key'));
    if (sp) name = sp;
    // Arriving from a bench page: /plants/new?loc=<id>. Otherwise the place you used last time. Set now, before the
    // reference is asked anything: the form is live during that wait, and a default applied after it would overwrite a
    // place the grower had already chosen (round seventeen, A3). Only a place not yet touched by hand takes it.
    const loc = page.url.searchParams.get('loc');
    let last: string | null = null;
    try {
      last = localStorage.getItem('cultifolio.lastLocation');
    } catch {
      /* fine */
    }
    // A ?loc= naming a bench since removed falls back to the last-used one rather than dropping both (round eighteen, 18).
    const want = loc && collection.location(loc) ? loc : last;
    if (want && collection.location(want) && locationId == null) { locationId = want; if (want === last && !(loc && collection.location(loc))) lastUsedLoc = want; }
    // The key in the link is not trusted on its own: a copied, edited or stale link can pair a name with another species'
    // key. For a name at species rank the reference's own key for that name is the one kept (round eleven, 2). The answer
    // is taken only if the name is still the one asked about: the form is live during the wait, and a grower who has
    // typed another name must not get the first name's key back (round eighteen, 5).
    if (k) {
      keyCheck = checkedKey(sp, k).then((checked) => { if (name === sp) taxonKey = checked; });
      await keyCheck;
    }
  });
  /** The key in the link being checked against the reference; an Add clicked before the answer waits for it rather than filing the plant without its key or asking about a name that came with one (round twenty-three, 4). */
  let keyCheck: Promise<void> | null = null;
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Add a plant' }]);
    return () => setCrumb([]);
  });

  let name = $state('');
  let taxonKey = $state<number | null>(null);
  let cultivar = $state<string | null>(null);
  let kind = $state<NameKind>('species');
  let parentage = $state<string | null>(null);
  let nameAsReceived = $state('');
  let fieldNumber = $state('');
  let provenance = $state<Provenance>('unknown');
  let acquired = $state(day.current); // follows the calendar while the form is open (round twenty-five, 4)
  let acquiredDefault = day.current;
  $effect(() => { const t = day.current; if (t !== acquiredDefault) { if (acquired === acquiredDefault) acquired = t; acquiredDefault = t; } });
  let sourceFrom = $state('');
  let price = $state('');
  let sourceForm = $state('plant');
  let locationId = $state<string | null>(null);
  /** The place the form filled from the last one used, said under the field (round fifty-eight; the grower review). */
  let lastUsedLoc = $state<string | null>(null);
  let notes = $state('');
  let count = $state<number | null>(1); // null once cleared
  /** Whole plants only, one to two hundred: 2.5 is two, a cleared box is one, and a number is never minted for a fraction (round thirteen, 10). */
  const countN = $derived(Math.min(200, Math.max(1, Math.floor(numberOrNull(count) ?? 1))));
  let useOwnNumber = $state(false);
  let ownNumber = $state('');
  const ownTaken = $derived(useOwnNumber && !!ownNumber.trim() && collection.isNumberTaken(ownNumber));
  let busy = $state(false);
  let checking = $state(false); // the name (or the link's key) is being checked against the reference: the button says so rather than sitting there (round twenty-four, 15)
  const nextNo = $derived(collection.ready ? collection.nextAccessionNumber(undefined, acquired) : '…'); // the year the number will carry is the acquired date's, so the preview and the number agree across New Year (round twenty-five, 4)

  let nameUnresolved = $state(false);
  let nameArmed = $state(false);
  let picker = $state<{ check: () => Promise<boolean> } | null>(null);
  let dateMsg = $state('');
  /** "Save and add another" keeps the form open with the place, the date, the source and the provenance; the name and what belongs to the one plant are cleared (round forty-nine, 3). */
  let addAnother = $state(false);
  /** Whether the form has anything typed that leaving would lose; a save clears it before the page moves on. */
  const dirty = $derived(!!(name.trim() || nameAsReceived.trim() || fieldNumber.trim() || notes.trim() || sourceFrom.trim() || price.trim() || (count ?? 1) !== 1 || provenance !== 'unknown' || acquired !== acquiredDefault));
  let saved = $state(false);
  beforeNavigate((nav) => {
    // An in-app move away from a half-filled form asks first (a tab-bar tap, the back button); a full unload is asked about below (round forty-nine, 3; round fifty-one, 4).
    if (!dirty || saved || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave this page? What you typed for this plant will be lost.')) nav.cancel();
  });
  /** A reload, a closed tab or Back out of the app: the browser asks, since the form would be lost (round fifty-one, 4). */
  function guardUnload(e: BeforeUnloadEvent) {
    if (dirty && !saved && !busy) e.preventDefault();
  }
  // The toast sits above the pinned action bar on this page, not on it: after "Save and add another" it covered the buttons for eight seconds (round fifty-one, 4).
  $effect(() => { document.body.classList.add('stickyacts'); return () => document.body.classList.remove('stickyacts'); });
  /** The fields a second plant from the same source shares; the rest are the one plant's. */
  let moreOpen = $state(false);
  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || busy || checking) return; // a second tap during a slow name check made a second plant (round fifty-one, 4)
    if (ownTaken) return;
    // The number is minted for the acquisition year and never reused, so a future date (2099 for 2026) would give the plant a wrong identity for good; refused before anything is checked or written (round twenty-six, 3).
    // And a year before any living collection (1026 for 2026) would mint 1026-0001 for good, the same way (round fifty-two, 4).
    dateMsg = acquired && acquired > localDate() ? `${acquired} is in the future.` : acquired && acquired < '1900-01-01' ? `${acquired} is before 1900; the number would be minted for that year, for good.` : '';
    if (dateMsg) { document.getElementById('f-date')?.focus(); return; }
    checking = true;
    try {
      if (keyCheck) await keyCheck.catch(() => undefined);
      // A name nothing resolved is filed on the second Add, not the first: the first arms and the picker says so (round twenty-three, 4).
      if (!taxonKey && kind !== 'hybrid' && !nameArmed && !(await picker?.check())) { nameArmed = true; return; }
    } finally {
      checking = false;
    }
    void nameUnresolved;
    busy = true;
    const wanted = countN;
    try {
      const p = parseName(name);
      const taxonName = p.scientific;
      // Keep a taxon record so the species has a home for your notes even before a dossier exists.
      const slug = speciesSlug(taxonName);
      if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: speciesOf(taxonName), gbifKey: taxonKey });
      // One commit for the whole batch: all the plants land with consecutive numbers, or none does (round sixteen, 14).
      const recs = await collection.addAccessions(wanted, {
        acc: useOwnNumber && ownNumber.trim() ? ownNumber.trim() : undefined,
        taxonName,
        taxonKey,
        cultivar: cultivar ?? p.cultivar ?? null,
        // The picker parses the name on a debounce; the form parses it again here so a quick Add cannot file a hybrid as a species.
        nameKind: p.kind !== 'species' ? p.kind : kind,
        parentage: p.kind === 'hybrid' || kind === 'hybrid' ? (parentage?.trim() || p.parentage || null) : null,
        nameAsReceived: nameAsReceived.trim() || (nameAsReceived !== name ? null : null),
        fieldNumber: fieldNumber.trim() || null,
        provenance,
        acquired: acquired || null,
        sourceFrom: sourceFrom.trim() || null,
        price: price.trim() || null,
        sourceForm,
        locationId,
        notes: notes.trim() || null
      });
      const firstId = accNo(recs[0]);
      // Several new pots want labels next: the toast opens the labels page with these plants picked, by identity as the plant page's Label does (round fifty-eight; the grower review).
      const labelsFor = { label: 'Labels', run: () => { void goto('/labels?acc=' + recs.map((r) => r.id).join(',')); } };
      try { if (locationId) localStorage.setItem('cultifolio.lastLocation', locationId); } catch { /* fine */ }
      if (addAnother) {
        addAnother = false;
        toast.show(wanted > 1 ? `${wanted} plants added` : `${firstId} added`, 8000, wanted > 1 ? labelsFor : { label: `Open ${firstId}`, run: () => { void goto(`/plants/${firstId}`); } });
        name = ''; taxonKey = null; cultivar = null; kind = 'species'; parentage = null; nameAsReceived = ''; fieldNumber = ''; notes = ''; price = ''; count = 1; useOwnNumber = false; ownNumber = ''; nameArmed = false;
        setTimeout(() => document.querySelector<HTMLElement>('.picker input')?.focus(), 0);
        return;
      }
      saved = true;
      if (wanted > 1) toast.show(`${wanted} plants added`, 8000, labelsFor);
      else toast.show(`${firstId} added`);
      goto(wanted > 1 ? '/plants' : `/plants/${firstId}`);
    } catch {
      /* the store has recorded why in lastWriteError, which the notice above the form shows; the form stays open with what
         was typed, and nothing was written: the batch is one commit (round fifteen, 9; round sixteen, 14) */
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Add plant · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} />

{#if collection.lastWriteError}
  {@const numberClash = /already used/.test(collection.lastWriteError)}
  <!-- Worded by cause: a number already used is not a full phone (round sixteen, 14) -->
  <div class="notice err" role="alert" id="write-error">{countN > 1 ? 'None of the plants was saved' : 'This change was not saved'}: {collection.lastWriteError}{#if !numberClash}{' '}Free space or <a href="/backup">back up now</a>.{/if}</div>
{/if}
<form class="form" onsubmit={save}>
  <PageHead title="Add a plant" kick="My plants" places={false}>
    {#snippet subline()}{#if countN > 1}{#if useOwnNumber && ownNumber.trim()}The first will be numbered <span class="accno">{ownNumber.trim()}</span>, the rest from <span class="accno">{nextNo}</span>.{:else}They will be numbered from <span class="accno">{nextNo}</span>, one each.{/if}{:else}It will be numbered <span class="accno">{useOwnNumber && ownNumber ? ownNumber : nextNo}</span>.{/if} A number is never reused; its year is the year acquired.{/snippet}
  </PageHead>
  <div class="cult sheet">

  <label class="field"><span>Species</span><SpeciesPicker bind:value={name} bind:taxonKey bind:cultivar bind:kind bind:parentage bind:unresolved={nameUnresolved} bind:armed={nameArmed} bind:this={picker} />
    <span class="faint small">A species, a cultivar (<i>Haworthia truncata</i> 'Lime Green'), or a hybrid: write the cross (<i>Ariocarpus retusus</i> × <i>trigonus</i>), or the genus and the name (<i>Echeveria</i> 'Blue Curls') when the parents are not known.</span></label>
  {#if kind === 'hybrid'}
    <label class="field"><span>Parentage <span class="faint">(if known)</span></span><input id="f-parentage" type="text" bind:value={parentage} placeholder="Seed parent × pollen parent" /><span class="faint small">The plant is filed under the genus; its parents' species pages carry the biology. A hybrid has no habitat of its own, so the climate-derived cultivation rows do not apply to it.</span></label>
  {/if}

  <div class="two">
    <div class="field"><span>Place</span><LocationPicker bind:value={locationId} id="f-loc" label="Place" lastUsed={lastUsedLoc} /></div>
    <label class="field"><span>Acquired</span><input id="f-date" type="date" bind:value={acquired} oninput={() => (dateMsg = '')} aria-invalid={!!dateMsg} aria-describedby={dateMsg ? 'f-date-bad' : undefined} />{#if dateMsg}<span class="bad small" id="f-date-bad">{dateMsg}</span>{/if}</label>
  </div>

  <!-- The short form is the species, the place and the date: what every plant has. The rest is one tap away, and stays open once opened (round forty-nine, 3; U3). -->
  <details class="moredetails" bind:open={moreOpen}>
  <summary class="faint">More: name as received, field number, provenance, source, price, how many, notes</summary>
  <div class="two">
    <label class="field"><span>Name as received <span class="faint">(if different)</span></span><input id="f-received" type="text" bind:value={nameAsReceived} placeholder="e.g. Copiapoa cinerea v. albispina" /></label>
    <label class="field"><span>Field number</span><input id="f-field" type="text" bind:value={fieldNumber} placeholder="e.g. KK 1462" /></label>
  </div>

  <div class="two">
    <label class="field"><span>Provenance</span>
      <select id="f-prov" bind:value={provenance}>
        <option value="unknown">Not stated</option>
        <option value="wild">Wild-collected</option>
        <option value="f1">F1: raised from wild-collected seed</option>
        <option value="fn">Cultivated seed (Fn)</option>
        <option value="veg">Vegetative</option>
      </select>
      <span class="faint small">A field number alone is not a provenance; say what you know.</span>
    </label>
    <label class="field"><span>Form</span>
      <select id="f-form" bind:value={sourceForm}>
        <option value="plant">Plant</option><option value="seedling">Seedling</option><option value="seed">Seed</option><option value="cutting">Cutting</option>
      </select>
    </label>
  </div>

  <div class="two">
    <label class="field"><span>From</span><input id="f-from" type="text" bind:value={sourceFrom} placeholder="Nursery, seller, friend" /></label>
    <label class="field"><span>Price <span class="faint">(optional)</span></span><input id="f-price" type="text" bind:value={price} placeholder="what it cost, as you like to write it" /></label>
  </div>

  <div class="two">
    <label class="field"><span>How many</span><input id="f-count" type="number" min="1" max="200" step="1" bind:value={count} /><span class="faint small">Each gets its own number.{#if numberOrNull(count) != null && numberOrNull(count) !== countN} {countN === 1 ? 'One plant' : `${countN} plants`} will be added.{/if}</span></label>
  </div>

  <label class="field"><span>Notes</span><textarea id="f-notes" rows="3" bind:value={notes}></textarea></label>
  </details>

  <details class="own">
    <summary class="faint">Use my own number</summary>
    <!-- Both with visible names: the box's placeholder was its only one, and "accession" is the trade's word, not the app's (round fifty-eight; the accessibility review). -->
    <div class="ownrow"><label class="ownchk"><input id="f-own" type="checkbox" bind:checked={useOwnNumber} /> Use my own number</label> <label class="ownno"><span class="eyebrow">Your plant number</span><input id="f-own-no" type="text" bind:value={ownNumber} placeholder="e.g. 2019-0147" disabled={!useOwnNumber} aria-invalid={ownTaken} aria-describedby={ownTaken ? 'f-own-taken' : undefined} /></label></div>
    {#if ownTaken}<p class="bad small" id="f-own-taken" role="alert">{ownNumber.trim()} is already used by <a href="/plants/{collection.accession(ownNumber.trim())?.id}">{collection.accession(ownNumber.trim())?.taxonName ?? 'a plant no longer growing'}</a>. A number is never reused; pick another.</p>{/if}
  </details>
  </div>

  <!-- Pinned on a phone, so Add is under the thumb however long the form; "Add as typed" is the second press for a name the reference does not know (round forty-nine, 3). -->
  <!-- Add is first in the markup, so Enter (the phone's Go) is Add, not "Save and add another"; the order on screen is set by CSS (round fifty-one, 4). -->
  <!-- The second press keeps the count in its words: "Add as typed" read as one plant when ten were asked for, and growers set the count back to one (round fifty-eight; the grower review). -->
  <div class="actions sticky">
    <button class="btn pri add" type="submit" onclick={() => (addAnother = false)} disabled={!name.trim() || busy || checking || ownTaken} aria-live="polite">{checking ? 'Checking the name…' : busy ? 'Adding…' : nameArmed ? `Add${countN > 1 ? ` ${countN}` : ''} as typed` : `Add${countN > 1 ? ` ${countN} plants` : ''}`}</button>
    <a class="btn cancel" href="/plants">Cancel</a>
    <button class="btn another" type="submit" onclick={() => (addAnother = true)} disabled={!name.trim() || busy || checking || ownTaken} title="Add this plant and keep the form open for the next, with the place, date, source and provenance kept">Save and add another</button>
  </div>
</form>

<style>
  .form { max-width: 720px; }
  .sheet { padding: 6px 17px 14px; margin-top: 12px; }
  .field { margin: 12px 0; display: block; }
  .field > span:first-child { display: block; font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin-bottom: 5px; }
  .field > span:first-child .faint { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .field input[type='text'], .field input[type='date'], .field input[type='number'], .field select, .field textarea { width: 100%; font: inherit; font-size: 0.875rem; padding: 9px 12px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .field input:focus, .field select:focus, .field textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .field .small { display: block; margin-top: 4px; font-size: var(--fs-sm); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .moredetails { margin-top: 8px; }
  .moredetails > summary { cursor: pointer; font-size: var(--fs-md); padding: 8px 0; }
  .actions.sticky .cancel { order: 1; } .actions.sticky .another { order: 2; } .actions.sticky .add { order: 3; }
  @media (max-width: 640px) { .actions.sticky .btn { min-height: 44px; } } /* the pinned bar is the thumb's target: 44px, as the grower review asks of every tap (round fifty-eight; the grower review) */
  @media (max-width: 700px) { .actions.sticky { position: sticky; bottom: calc(56px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); padding: 10px 0; margin: 8px 0 0; z-index: 5; } }
  .own { margin-top: 8px; }
  .own summary { cursor: pointer; font-size: var(--fs-md); }
  .ownrow { display: flex; align-items: flex-end; gap: 8px 14px; margin-top: 8px; flex-wrap: wrap; }
  /* The box and its words, and the number with its small name over it (round fifty-eight; the accessibility review). */
  .ownchk { display: inline-flex; align-items: center; gap: 8px; min-height: var(--tap); font-size: var(--fs-md); }
  .ownno { display: grid; gap: 3px; flex: 1 1 200px; }
  .ownrow input[type='text'] { width: 100%; font: inherit; font-size: var(--fs-md); padding: 8px 11px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); }
  @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
</style>

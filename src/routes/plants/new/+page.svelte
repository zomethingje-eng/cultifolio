<script lang="ts">
  import { goto } from '$app/navigation';
  import { toast } from '$lib/ui/toast.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { localDate } from '$core/dates';
  import { accNo } from '$lib/db/types';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { parseName, slugify, type NameKind } from '$core/names';
  import type { Provenance } from '$lib/db/types';
  onMount(async () => {
    await collection.load();
    // Arriving from a species page: /plants/new?species=Copiapoa%20cinerea&key=7284333
    const sp = page.url.searchParams.get('species');
    const k = Number(page.url.searchParams.get('key'));
    if (sp) name = sp;
    if (k) taxonKey = k;
    // Arriving from a bench page: /plants/new?loc=<id>. Otherwise the place you used last time.
    const loc = page.url.searchParams.get('loc');
    let want: string | null = loc;
    try {
      want = loc ?? localStorage.getItem('cultifolio.lastLocation');
    } catch {
      /* fine */
    }
    if (want && collection.location(want)) locationId = want;
  });
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
  let acquired = $state(localDate());
  let sourceFrom = $state('');
  let price = $state('');
  let sourceForm = $state('plant');
  let locationId = $state<string | null>(null);
  let notes = $state('');
  let count = $state(1);
  let useOwnNumber = $state(false);
  let ownNumber = $state('');
  const ownTaken = $derived(useOwnNumber && !!ownNumber.trim() && collection.isNumberTaken(ownNumber));
  let busy = $state(false);
  const nextNo = $derived(collection.ready ? collection.nextAccessionNumber() : '…');

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    if (ownTaken) return;
    busy = true;
    const p = parseName(name);
    const taxonName = p.scientific;
    // Keep a taxon record so the species has a home for your notes even before a dossier exists.
    const slug = slugify(taxonName);
    if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: taxonName, gbifKey: taxonKey });
    let firstId = '';
    for (let i = 0; i < Math.max(1, count); i++) {
      const rec = await collection.addAccession({
        acc: useOwnNumber && ownNumber.trim() && i === 0 ? ownNumber.trim() : undefined,
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
      if (!firstId) firstId = accNo(rec);
    }
    try { if (locationId) localStorage.setItem('cultifolio.lastLocation', locationId); } catch { /* fine */ }
    toast.show(count > 1 ? `${count} plants added` : `${firstId} added`);
    goto(count > 1 ? '/plants' : `/plants/${firstId}`);
  }
</script>

<svelte:head><title>Add plant — Cultifolio</title></svelte:head>

<form class="form" onsubmit={save}>
  <PageHead title="Add a plant" kick="My plants" places={false}>
    {#snippet subline()}{#if count > 1}They will be numbered from <span class="accno">{nextNo}</span>, one each.{:else}It will be numbered <span class="accno">{useOwnNumber && ownNumber ? ownNumber : nextNo}</span>.{/if} A number is never reused.{/snippet}
  </PageHead>
  <div class="cult sheet">

  <label class="field"><span>Species</span><SpeciesPicker bind:value={name} bind:taxonKey bind:cultivar bind:kind bind:parentage />
    <span class="faint small">A species, a cultivar (<i>Haworthia truncata</i> 'Lime Green'), or a hybrid: write the cross (<i>Ariocarpus retusus</i> × <i>trigonus</i>), or the genus and the name (<i>Echeveria</i> 'Blue Curls') when the parents are not known.</span></label>
  {#if kind === 'hybrid'}
    <label class="field"><span>Parentage <span class="faint">(if known)</span></span><input id="f-parentage" type="text" bind:value={parentage} placeholder="Seed parent × pollen parent" /><span class="faint small">The plant is filed under the genus; its parents' species pages carry the biology. A hybrid has no habitat of its own, so the climate-derived cultivation rows do not apply to it.</span></label>
  {/if}

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
    <label class="field"><span>Acquired</span><input id="f-date" type="date" bind:value={acquired} /></label>
    <label class="field"><span>From</span><input id="f-from" type="text" bind:value={sourceFrom} placeholder="Nursery, seller, friend" /></label>
    <label class="field"><span>Price <span class="faint">(optional)</span></span><input id="f-price" type="text" bind:value={price} placeholder="what it cost, as you like to write it" /></label>
  </div>

  <div class="two">
    <div class="field"><span>Location</span><LocationPicker bind:value={locationId} id="f-loc" label="Location" /></div>
    <label class="field"><span>How many</span><input id="f-count" type="number" min="1" max="200" bind:value={count} /><span class="faint small">Each gets its own number.</span></label>
  </div>

  <label class="field"><span>Notes</span><textarea id="f-notes" rows="3" bind:value={notes}></textarea></label>

  <details class="own">
    <summary class="faint">Use my own number</summary>
    <label class="ownrow"><input id="f-own" type="checkbox" bind:checked={useOwnNumber} /> <input id="f-own-no" type="text" bind:value={ownNumber} placeholder="e.g. 2019-0147" disabled={!useOwnNumber} aria-invalid={ownTaken} /></label>
    {#if ownTaken}<p class="bad small" id="f-own-taken">{ownNumber.trim()} is already used by <a href="/plants/{collection.accession(ownNumber.trim())?.id}">{collection.accession(ownNumber.trim())?.taxonName ?? 'a plant no longer growing'}</a>. A number is never reused; pick another.</p>{/if}
  </details>
  </div>

  <div class="actions">
    <a class="btn" href="/plants">Cancel</a>
    <button class="btn pri" type="submit" disabled={!name.trim() || busy || ownTaken}>Add{count > 1 ? ` ${count} plants` : ''}</button>
  </div>
</form>

<style>
  .form { max-width: 720px; }
  .sheet { padding: 6px 17px 14px; margin-top: 12px; }
  .field { margin: 12px 0; display: block; }
  .field > span:first-child { display: block; font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin-bottom: 5px; }
  .field > span:first-child .faint { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .field input[type='text'], .field input[type='date'], .field input[type='number'], .field select, .field textarea { width: 100%; font: inherit; font-size: 14px; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .field input:focus, .field select:focus, .field textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .field .small { display: block; margin-top: 4px; font-size: 12px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .own { margin-top: 8px; }
  .own summary { cursor: pointer; font-size: 13px; }
  .ownrow { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .ownrow input[type='text'] { flex: 1; font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
</style>

<script lang="ts">
  import { readSetting, writeSetting } from '$lib/ui/stored';
  import { batchHref } from '$lib/db/links';
  import { units } from '$lib/ui/units.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { localDate } from '$core/dates';
  import { temp, tempUnit, cToF, bottomHeat as heatCheck, numberOrNull } from '$core/units';
  import { goto, beforeNavigate } from '$app/navigation';
  import { accNo, sowNo } from '$lib/db/types';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { today as day } from '$lib/ui/day.svelte';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { parseName, slugify, type NameKind, speciesSlug, speciesOf } from '$core/names';
  import { sheetForName } from '$lib/ui/index.svelte';
  import { PROP_METHODS, kindOf, type Accession, type PropMethod, type Provenance } from '$lib/db/types';
  import { setCrumb } from '$lib/ui/crumb.svelte';

  let name = $state('');
  let taxonKey = $state<number | null>(null);
  let cultivar = $state<string | null>(null);
  let kind = $state<NameKind>('species');
  let parentage = $state<string | null>(null);
  let method = $state<PropMethod>('seed');
  let parentAcc = $state<string | null>(null);
  let sown = $state(day.current); // follows the calendar while the form is open (round twenty-five, 4)
  let sownDefault = day.current;
  $effect(() => { const t = day.current; if (t !== sownDefault) { if (sown === sownDefault) sown = t; sownDefault = t; } });
  // Never guessed: a count the grower did not give would become the denominator of every germination figure.
  let count = $state<number | null>(null);
  let countMissing = $state(false);
  let dateMsg = $state('');
  let heatMsg = $state('');
  let sourceFrom = $state('');
  let sourceRef = $state('');
  let fieldNumber = $state('');
  let provenance = $state<Provenance>('unknown');
  let medium = $state('');
  let container = $state('');
  let treatment = $state('');
  let bottomHeat = $state<string | number | null>(''); // Svelte binds a cleared number input to null
  let covered = $state(false);
  let locationId = $state<string | null>(null);
  /** The place the form filled from the last one used, said under the field (round fifty-eight; the grower review). */
  let lastUsedLoc = $state<string | null>(null);
  let notes = $state('');
  let busy = $state(false);
  let saved = $state(false);
  const formDirty = () => !saved && !busy && !!(name.trim() || count != null || sourceFrom.trim() || notes.trim());
  // A half-done form is not lost to a tab-bar tap or a reload without asking (round fifty-two, 4; the Add form has had this since round forty-nine).
  beforeNavigate((nav) => {
    if (!formDirty() || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave this page? What you typed here will be lost.')) nav.cancel();
  });
  function guardUnload(e: BeforeUnloadEvent) {
    if (formDirty()) e.preventDefault();
  }
  // The action bar is pinned on a phone, as on the Add form; the toast sits above it, not on it (round fifty-eight; the grower review).
  $effect(() => { document.body.classList.add('stickyacts'); return () => document.body.classList.remove('stickyacts'); });


  const m = $derived(PROP_METHODS.find((x) => x.k === method) ?? PROP_METHODS[0]);
  const parent = $derived(parentAcc ? collection.accession(parentAcc) : undefined);
  /**
   * The parent list, by number from the first, narrowed by what is typed above it (number, name or cultivar, every word):
   * at thirty-odd plants a flat list of numbers could not be found in. The plant already chosen stays in the list
   * whatever is typed, so a filter never quietly changes the choice (round fifty-eight; the grower review).
   */
  let parentQ = $state('');
  const growing = $derived(collection.accessions.filter((a) => a.status === 'growing' || a.id === parentAcc).slice().sort((a, b) => accNo(a).localeCompare(accNo(b), undefined, { numeric: true })));
  const parentWords = $derived(parentQ.toLowerCase().split(/\s+/).filter(Boolean));
  const parentMatch = (a: Accession) => parentWords.every((w) => `${accNo(a)} ${a.taxonName} ${a.cultivar ?? ''}`.toLowerCase().includes(w));
  const parentMatches = $derived(growing.filter(parentMatch));
  const parentOptions = $derived(parentWords.length ? growing.filter((a) => a.id === parentAcc || parentMatch(a)) : growing);
  /** Picking a parent takes its name, as the hint under the list says: the batch was filed under whatever was in the species box (round fifty-eight; the grower review). */
  function takeParent() {
    const a = parentAcc ? collection.accession(parentAcc) : undefined;
    if (!a) return;
    name = a.taxonName;
    taxonKey = a.taxonKey ?? null;
    cultivar = a.cultivar ?? null;
    kind = kindOf(a);
    parentage = a.parentage ?? null;
  }
  /** Why Start batch cannot be pressed, in words, next to it: a greyed button said nothing (round fifty-eight; the grower review). A missing count is not one of these: it is refused with a sentence on the press. */
  const startBlocked = $derived(busy ? 'Saving the batch…' : !name.trim() ? 'Name the species first.' : '');
  const nextNo = $derived(collection.ready ? collection.nextSowingNumber(Number(sown.slice(0, 4)) || undefined) : '…');

  $effect(() => {
    setCrumb([{ label: 'Propagation', href: '/propagation' }, { label: 'New batch' }]);
    return () => setCrumb([]);
  });
  /** The reference's key for a species-rank name when the reference answers; otherwise the key as given (the plant page repairs it later). */
  async function checkedKey(sp: string | null, k: number): Promise<number> {
    if (!sp || speciesOf(sp) !== sp) return k;
    const s = await sheetForName(sp, k);
    return s && s !== 'none' ? s.key : k;
  }
  onMount(async () => {
    await collection.load();
    // /propagation/new?species=…&key=… from a species page
    const sp = page.url.searchParams.get('species');
    const k = Number(page.url.searchParams.get('key'));
    if (sp) name = sp;
    // The key in the link is not trusted on its own: a copied, edited or stale link can pair a name with another species'
    // key. For a name at species rank the reference's own key for that name is the one kept (round eleven, 2).
    if (k) taxonKey = await checkedKey(sp, k);
    const loc = page.url.searchParams.get('loc');
    let want: string | null = loc;
    try {
      want = loc ?? readSetting('cultifolio.lastSowLocation', 'collection');
    } catch {
      /* fine */
    }
    if (want && collection.location(want)) { locationId = want; if (!loc) lastUsedLoc = want; }
    // /propagation/new?parent=2026-0004 → a vegetative batch from that plant, species prefilled. By identity first, then
    // by number, and never one of two plants that share a number: one picked by load order recorded the wrong parent
    // (round sixty-one; the records review's 4). For two, the method is set and the parent list is filtered to them,
    // so the grower picks one, as the labels page asks.
    const p = page.url.searchParams.get('parent');
    const hits = p ? collection.withNumber('accession', p) : [];
    if (p && hits.length > 1) { method = 'offset'; parentQ = p; }
    if (p && hits.length === 1) {
      const a = hits[0] as Accession;
      parentAcc = a.id;
      name = a.taxonName;
      taxonKey = a.taxonKey ?? null;
      cultivar = a.cultivar ?? null;
      kind = kindOf(a);
      parentage = a.parentage ?? null;
      method = 'offset';
      locationId = a.locationId ?? null;
    }
  });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    const n = numberOrNull(count) == null ? null : Math.floor(numberOrNull(count)!); // whole seeds or cuttings: 2.5 is 2, a cleared box is missing (round fifteen, 10)
    if (n == null || !Number.isFinite(n) || n < 1) {
      countMissing = true;
      document.getElementById('s-count')?.focus();
      return;
    }
    // A batch is numbered by its year and counts its days from its date, so a date in the future would number it into
    // next year and count backwards; a cutting cannot be taken before its parent arrived.
    dateMsg = !sown ? 'Give the batch a date.' : sown > localDate() ? `${sown} is in the future.` : sown < '1900-01-01' ? `${sown} is before 1900; the batch number would be minted for that year.` : m.veg && parent?.acquired && sown < parent.acquired ? `${sown} is before ${accNo(parent)} arrived on ${parent.acquired}.` : '';
    if (dateMsg) {
      document.getElementById('s-date')?.focus();
      return;
    }
    // Bottom heat outside anything a propagator does is a figure in the wrong units, not a setting: seed is not sown at 77 °C.
    const heat = heatCheck(bottomHeat, units.current);
    heatMsg = heat.msg;
    if (heatMsg) {
      document.getElementById('s-heat')?.focus();
      return;
    }
    busy = true;
    try {
      const p = parseName(name);
      const taxonName = p.scientific;
      const slug = speciesSlug(taxonName);
      if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: speciesOf(taxonName), gbifKey: taxonKey });
      const rec = await collection.addSowing({
        taxonName,
        taxonKey,
        cultivar: cultivar ?? p.cultivar ?? null,
        // The picker parses the name on a debounce; the form parses it again here so a quick Add cannot file a hybrid as a species.
          nameKind: p.kind !== 'species' ? p.kind : kind,
        parentage: p.kind === 'hybrid' || kind === 'hybrid' ? (parentage?.trim() || p.parentage || null) : null,
        method,
        parentAcc: m.veg ? parentAcc : null,
        sown,
        count: n,
        sourceFrom: m.veg ? null : sourceFrom.trim() || null,
        sourceRef: m.veg ? null : sourceRef.trim() || null,
        fieldNumber: m.veg ? null : fieldNumber.trim() || null,
        provenance: m.veg ? 'veg' : provenance,
        medium: medium.trim() || null,
        container: container.trim() || null,
        treatment: treatment.trim() || null,
        bottomHeatC: heat.c,
        covered,
        locationId,
        notes: notes.trim() || null
      });
      if (locationId) writeSetting('cultifolio.lastSowLocation', 'collection', locationId); // the sample keeps its own (round sixty-one; decision 10)
      saved = true;
      goto(batchHref(rec)); // by identity while another batch shares the number (round sixty)
    } catch {
      /* lastWriteError is shown above the form; the form stays open (round fifteen, 9) */
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>New batch · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} />

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}. Free space or <a href="/backup">back up now</a>.</div>
{/if}
<form class="form" novalidate onsubmit={save}>
  <PageHead title={m.veg ? 'Start a propagation' : 'Sow seed'} kick="Propagation" places={false}>
    {#snippet subline()}Batch <span class="accno">{nextNo}</span>. Plants potted up from it are numbered then, not now.{/snippet}
  </PageHead>
  <div class="cult sheet">

  <label class="field"><span>Method</span>
    <select id="s-method" bind:value={method}>{#each PROP_METHODS as pm}<option value={pm.k}>{pm.label}</option>{/each}</select>
  </label>

  {#if m.veg}
    <div class="field"><label for="s-parent">From which plant</label>
      {#if growing.length > 1}
        <input id="s-parent-q" class="pfilter" type="search" bind:value={parentQ} placeholder="Filter by number or name" aria-label="Filter the plants by number or name" aria-controls="s-parent" autocomplete="off" />
        {#if parentWords.length}<span class="faint small" role="status">{parentMatches.length === 0 ? 'No plant matches; clear the filter to see them all.' : `${parentMatches.length} of ${growing.length} shown.`}</span>{/if}
      {/if}
      <select id="s-parent" bind:value={parentAcc} onchange={takeParent}>
        <option value={null}>Not one of my plants</option>
        {#each parentOptions as a (a.id)}<option value={a.id}>{accNo(a)} · {a.taxonName}{a.cultivar ? ` ‘${a.cultivar}’` : ''}</option>{/each}
      </select>
      {#if parent}<span class="faint small">The species is taken from the parent; its field number and cultivar carry to every plant raised.</span>{/if}
    </div>
  {/if}

  <label class="field"><span>Species</span><SpeciesPicker bind:value={name} bind:taxonKey bind:cultivar bind:kind bind:parentage />
    <span class="faint small">A species, a cultivar (<i>Haworthia truncata</i> 'Lime Green'), or a hybrid: write the cross (<i>Ariocarpus retusus</i> × <i>trigonus</i>), or the genus and the name (<i>Echeveria</i> 'Blue Curls') when the parents are not known.</span></label>
  {#if kind === 'hybrid'}
    <label class="field"><span>Parentage <span class="faint">(if known)</span></span><input id="s-parentage" type="text" bind:value={parentage} placeholder="Seed parent × pollen parent" /><span class="faint small">The plant is filed under the genus; its parents' species pages carry the biology. A hybrid has no habitat of its own, so the climate-derived cultivation rows do not apply to it.</span></label>
  {/if}

  <div class="two">
    <label class="field"><span>Date</span><input id="s-date" type="date" max={localDate()} bind:value={sown} oninput={() => (dateMsg = '')} aria-invalid={!!dateMsg} aria-describedby={dateMsg ? 's-date-bad' : undefined} />{#if dateMsg}<span class="bad small" id="s-date-bad">{dateMsg}</span>{/if}</label>
    <label class="field"><span>How many {m.unit}</span><input id="s-count" type="number" min="1" max="5000" required bind:value={count} oninput={() => (countMissing = false)} aria-invalid={countMissing} aria-describedby={countMissing ? 's-count-missing' : undefined} />{#if countMissing}<span class="bad small" id="s-count-missing">Say how many {m.unit} went in; the germination figures divide by it.</span>{/if}</label>
  </div>

  {#if !m.veg}
    <div class="two">
      <label class="field"><span>Seed from</span><input id="s-from" type="text" bind:value={sourceFrom} placeholder="Seller, society exchange, own pollination" /></label>
      <label class="field"><span>Field number</span><input id="s-fn" type="text" bind:value={fieldNumber} placeholder="e.g. KK 1462: carried to every plant potted up" /></label>
      <label class="field"><span>Lot</span><input id="s-ref" type="text" bind:value={sourceRef} placeholder="the seller's lot code" /></label>
    </div>
    <label class="field"><span>Seed provenance</span>
      <select id="s-prov" bind:value={provenance}>
        <option value="unknown">Not stated</option>
        <option value="wild">Wild-collected seed (plants raised will be F1)</option>
        <option value="f1">Seed from F1 plants in cultivation (plants raised will be Fn)</option>
        <option value="fn">Seed from cultivated plants (Fn)</option>
      </select>
    </label>
  {/if}

  <div class="two">
    <label class="field"><span>Medium</span><input id="s-medium" type="text" bind:value={medium} placeholder="e.g. 50/50 pumice and sieved loam" /></label>
    <label class="field"><span>Container</span><input id="s-container" type="text" bind:value={container} placeholder="e.g. 7 cm square, bagged" /></label>
  </div>
  <div class="two">
    <label class="field"><span>Pre-treatment</span><input id="s-treat" type="text" bind:value={treatment} placeholder="soak, GA3, smoke, scarified, callused 5 days…" /></label>
    <label class="field"><span>Bottom heat {tempUnit(units.current)}</span><input id="s-heat" type="number" step="0.5" bind:value={bottomHeat} placeholder="blank if none" oninput={() => (heatMsg = '')} aria-invalid={!!heatMsg} aria-describedby={heatMsg ? 's-heat-bad' : undefined} />{#if heatMsg}<span class="bad small" id="s-heat-bad">{heatMsg}</span>{/if}</label>
  </div>
  <label class="check"><input id="s-covered" type="checkbox" bind:checked={covered} /> Covered (bag, lid, propagator)</label>

  <div class="field"><span>Where</span><LocationPicker bind:value={locationId} id="s-loc" label="Where" lastUsed={lastUsedLoc} /></div>
  <label class="field"><span>Notes</span><textarea id="s-notes" rows="3" bind:value={notes}></textarea></label>
  </div>

  <!-- Pinned on a phone above the tab bar, as on the Add form, so Start batch is under the thumb however long the form; a greyed button says why next to it (round fifty-eight; the grower review). -->
  <div class="actions sticky">
    {#if startBlocked}<span class="why small" id="s-start-why" role="status">{startBlocked}</span>{/if}
    <a class="btn" href="/propagation">Cancel</a>
    <button class="btn pri" type="submit" disabled={!name.trim() || busy} aria-describedby={startBlocked ? 's-start-why' : undefined}>Start batch</button>
  </div>
</form>

<style>
  .form { max-width: 720px; }
  .sheet { padding: 6px 17px 14px; margin-top: 12px; }
  .field { margin: 12px 0; display: block; }
  .field > span:first-child, .field > label:first-child { display: block; font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin-bottom: 5px; }
  .field input[type='text'], .field input[type='date'], .field input[type='number'], .field select, .field textarea { width: 100%; font: inherit; font-size: 0.875rem; padding: 9px 12px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); } /* the theme's outline stays: "outline: 0" left only the caret in forced colours (round sixty; the accessibility review, 4) */
  .field .small { display: block; margin-top: 4px; font-size: var(--fs-sm); }
  .bad { color: var(--bad); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; }
  .check { display: flex; align-items: center; gap: 8px; font-size: var(--fs-md); margin: 12px 0; }
  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .actions .why { color: var(--ink2); margin-right: auto; }
  /* The filter sits on the list it narrows; the list follows it (round fifty-eight; the grower review). */
  .pfilter { width: 100%; font: inherit; font-size: var(--fs-md); padding: 9px 12px; border: 1px solid var(--field-edge); border-radius: var(--r); background: var(--card); color: var(--ink); margin-bottom: 6px; }
  .pfilter + .small { margin: -2px 0 6px; }
  /* The Add form's pinned bar, copied: the toast lifts above it through body.stickyacts (round fifty-eight; the grower review). */
  @media (max-width: 700px) { .actions.sticky { position: sticky; bottom: calc(56px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); padding: 10px 0; margin: 8px 0 0; z-index: 5; } }
  @media (max-width: 640px) { .actions .btn, .pfilter, .field select { min-height: 44px; } }
  @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
</style>

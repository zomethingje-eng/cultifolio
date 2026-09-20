<script lang="ts">
  import { goto } from '$app/navigation';
  import { accNo, sowNo } from '$lib/db/types';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { parseName, slugify, type NameKind } from '$core/names';
  import { PROP_METHODS, kindOf, type PropMethod, type Provenance } from '$lib/db/types';
  import { setCrumb } from '$lib/ui/crumb.svelte';

  let name = $state('');
  let taxonKey = $state<number | null>(null);
  let cultivar = $state<string | null>(null);
  let kind = $state<NameKind>('species');
  let parentage = $state<string | null>(null);
  let method = $state<PropMethod>('seed');
  let parentAcc = $state<string | null>(null);
  let sown = $state(new Date().toISOString().slice(0, 10));
  // Never guessed: a count the grower did not give would become the denominator of every germination figure.
  let count = $state<number | null>(null);
  let countMissing = $state(false);
  let sourceFrom = $state('');
  let sourceRef = $state('');
  let provenance = $state<Provenance>('unknown');
  let medium = $state('');
  let container = $state('');
  let treatment = $state('');
  let bottomHeat = $state('');
  let covered = $state(false);
  let locationId = $state<string | null>(null);
  let notes = $state('');
  let busy = $state(false);

  const m = $derived(PROP_METHODS.find((x) => x.k === method) ?? PROP_METHODS[0]);
  const parent = $derived(parentAcc ? collection.accession(parentAcc) : undefined);
  const nextNo = $derived(collection.ready ? collection.nextSowingNumber(Number(sown.slice(0, 4)) || undefined) : '…');

  $effect(() => {
    setCrumb([{ label: 'Sowings', href: '/sowings' }, { label: 'New sowing' }]);
    return () => setCrumb([]);
  });
  onMount(async () => {
    await collection.load();
    // /sowings/new?species=…&key=… from a species page
    const sp = page.url.searchParams.get('species');
    const k = Number(page.url.searchParams.get('key'));
    if (sp) name = sp;
    if (k) taxonKey = k;
    const loc = page.url.searchParams.get('loc');
    let want: string | null = loc;
    try {
      want = loc ?? localStorage.getItem('cultifolio.lastSowLocation');
    } catch {
      /* fine */
    }
    if (want && collection.location(want)) locationId = want;
    // /sowings/new?parent=2026-0004 → a vegetative batch from that plant, species prefilled.
    const p = page.url.searchParams.get('parent');
    if (p && collection.accession(p)) {
      const a = collection.accession(p)!;
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
    const n = count;
    if (n == null || !Number.isFinite(n) || n < 1) {
      countMissing = true;
      document.getElementById('s-count')?.focus();
      return;
    }
    busy = true;
    const p = parseName(name);
    const taxonName = p.scientific;
    const slug = slugify(taxonName);
    if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: taxonName, gbifKey: taxonKey });
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
      provenance: m.veg ? 'veg' : provenance,
      medium: medium.trim() || null,
      container: container.trim() || null,
      treatment: treatment.trim() || null,
      bottomHeatC: bottomHeat !== '' && !Number.isNaN(Number(bottomHeat)) ? Number(bottomHeat) : null,
      covered,
      locationId,
      notes: notes.trim() || null
    });
    try { if (locationId) localStorage.setItem('cultifolio.lastSowLocation', locationId); } catch { /* fine */ }
    goto(`/sowings/${sowNo(rec)}`);
  }
</script>

<svelte:head><title>New sowing — Cultifolio</title></svelte:head>

<form class="form" novalidate onsubmit={save}>
  <div class="kick" style="margin-top: 22px">Sowings</div>
  <h1 class="q">{m.veg ? 'Start a propagation' : 'Sow seed'}</h1>
  <p class="secsub">Batch <span class="accno">{nextNo}</span>. Plants potted up from it are numbered then, not now.</p>
  <div class="cult sheet">

  <label class="field"><span>Method</span>
    <select id="s-method" bind:value={method}>{#each PROP_METHODS as pm}<option value={pm.k}>{pm.label}</option>{/each}</select>
  </label>

  {#if m.veg}
    <label class="field"><span>From which plant</span>
      <select id="s-parent" bind:value={parentAcc}>
        <option value={null}>Not one of my plants</option>
        {#each collection.accessions.filter((a) => a.status === 'growing') as a}<option value={a.id}>{accNo(a)} · {a.taxonName}{a.cultivar ? ` ‘${a.cultivar}’` : ''}</option>{/each}
      </select>
      {#if parent}<span class="faint small">The species is taken from the parent; its field number and cultivar carry to every plant raised.</span>{/if}
    </label>
  {/if}

  <label class="field"><span>Species</span><SpeciesPicker bind:value={name} bind:taxonKey bind:cultivar bind:kind bind:parentage />
    <span class="faint small">A species, a cultivar (<i>Haworthia truncata</i> 'Lime Green'), or a hybrid: write the cross (<i>Ariocarpus retusus</i> × <i>trigonus</i>), or the genus and the name (<i>Echeveria</i> 'Blue Curls') when the parents are not known.</span></label>
  {#if kind === 'hybrid'}
    <label class="field"><span>Parentage <span class="faint">(if known)</span></span><input id="s-parentage" type="text" bind:value={parentage} placeholder="Seed parent × pollen parent" /><span class="faint small">The plant is filed under the genus; its parents' species pages carry the biology. A hybrid has no habitat of its own, so the climate-derived cultivation rows do not apply to it.</span></label>
  {/if}

  <div class="two">
    <label class="field"><span>Date</span><input id="s-date" type="date" bind:value={sown} /></label>
    <label class="field"><span>How many {m.unit}</span><input id="s-count" type="number" min="1" max="5000" required bind:value={count} oninput={() => (countMissing = false)} aria-invalid={countMissing} aria-describedby={countMissing ? 's-count-missing' : undefined} />{#if countMissing}<span class="bad small" id="s-count-missing">Say how many {m.unit} went in; the germination figures divide by it.</span>{/if}</label>
  </div>

  {#if !m.veg}
    <div class="two">
      <label class="field"><span>Seed from</span><input id="s-from" type="text" bind:value={sourceFrom} placeholder="Seller, society exchange, own pollination" /></label>
      <label class="field"><span>Lot / field number</span><input id="s-ref" type="text" bind:value={sourceRef} placeholder="e.g. KK 1462, or the seller's lot code" /></label>
    </div>
    <label class="field"><span>Seed provenance</span>
      <select id="s-prov" bind:value={provenance}>
        <option value="unknown">Not stated</option>
        <option value="wild">Wild-collected seed (plants raised will be F1)</option>
        <option value="f1">Seed from ex-habitat plants (plants raised will be Fn)</option>
        <option value="fn">Seed from cultivated plants</option>
      </select>
    </label>
  {/if}

  <div class="two">
    <label class="field"><span>Medium</span><input id="s-medium" type="text" bind:value={medium} placeholder="e.g. 50/50 pumice and sieved loam" /></label>
    <label class="field"><span>Container</span><input id="s-container" type="text" bind:value={container} placeholder="e.g. 7 cm square, bagged" /></label>
  </div>
  <div class="two">
    <label class="field"><span>Pre-treatment</span><input id="s-treat" type="text" bind:value={treatment} placeholder="soak, GA3, smoke, scarified, callused 5 days…" /></label>
    <label class="field"><span>Bottom heat °C</span><input id="s-heat" type="number" step="0.5" bind:value={bottomHeat} placeholder="blank if none" /></label>
  </div>
  <label class="check"><input id="s-covered" type="checkbox" bind:checked={covered} /> Covered (bag, lid, propagator)</label>

  <div class="field"><span>Where</span><LocationPicker bind:value={locationId} id="s-loc" label="Where" /></div>
  <label class="field"><span>Notes</span><textarea id="s-notes" rows="3" bind:value={notes}></textarea></label>
  </div>

  <div class="actions">
    <a class="btn" href="/sowings">Cancel</a>
    <button class="btn pri" type="submit" disabled={!name.trim() || busy}>Start batch</button>
  </div>
</form>

<style>
  .form { max-width: 720px; }
  .sheet { padding: 6px 17px 14px; margin-top: 12px; }
  .field { margin: 12px 0; display: block; }
  .field > span:first-child { display: block; font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; margin-bottom: 5px; }
  .field input[type='text'], .field input[type='date'], .field input[type='number'], .field select, .field textarea { width: 100%; font: inherit; font-size: 14px; padding: 9px 12px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .field input:focus, .field select:focus, .field textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .field .small { display: block; margin-top: 4px; font-size: 12px; }
  .bad { color: var(--bad); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; align-items: start; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 12px 0; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
</style>

<script lang="ts">
  /**
   * The photo walk (round eighty-seven, C12): a room of plants added one photograph at a time. Take a photograph, name
   * the plant with the add form's own name picker, checked against the reference as the add form checks it, then the
   * next. Each makes a plant with its photograph attached, in the space chosen at the top.
   *
   * The photograph is resized on this device and stored with the collection, as every photograph is; nothing is sent to
   * be identified, and no service guesses the name: the name is the one the grower types. The picker asks the reference's
   * search for the words typed, as the add form's does, and nothing else.
   */
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import { collection } from '$lib/db/collection.svelte';
  import { CLOSED_WORDS } from '$lib/db/demo';
  import { storageErrorText } from '$lib/db/vault';
  import { processImage, today, type Processed } from '$lib/photo/process';
  import PageHead from '$lib/ui/PageHead.svelte';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { settlePlaces } from '$lib/ui/places-pending';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { readSetting, writeSetting } from '$lib/ui/stored';
  import { parseName, speciesSlug, speciesName, type NameKind } from '$core/names';
  import { accNo, type Accession } from '$lib/db/types';
  import { plantHref } from '$lib/db/links';
  import { olderKindLooker } from '$lib/ui/ref/older-kind-look';
  onMount(async () => {
    await collection.load();
    const last = readSetting('cultifolio.lastLocation', 'collection');
    if (last && collection.location(last) && locationId == null) locationId = last;
  });
  $effect(() => {
    setCrumb([{ label: 'My plants', href: '/plants' }, { label: 'Photo walk' }]);
    return () => setCrumb([]);
  });
  let locationId = $state<string | null>(null);
  /** The photograph taken for the plant being named: resized on the device as soon as it is chosen, so a file that cannot be read is said before a plant is made for it. */
  let shot = $state<Processed | null>(null);
  let preview = $state<string | null>(null);
  let reading = $state(false);
  let photoMsg = $state('');
  let name = $state('');
  let taxonKey = $state<number | null>(null);
  let cultivar = $state<string | null>(null);
  let kind = $state<NameKind>('species');
  let parentage = $state<string | null>(null);
  let nameArmed = $state(false);
  let pickReceived = $state<string | null>(null);
  let checking = $state(false);
  let busy = $state(false);
  let picker = $state<{ check: () => Promise<boolean>; olderFirst: () => Promise<boolean>; olderAnswer: () => string | null } | null>(null);
  let added = $state<Array<{ id: string; photo: boolean; why?: string }>>([]);
  /**
   * Which kind of name the picker's line named a page for, asked while the line shows, as the add form asks it: filed as
   * `olderKind` with the plant, and `olderKindOf` beside it by `addAccessions` (round eighty-seven, stage-3 integration).
   */
  const olderKind = olderKindLooker();
  $effect(() => {
    if (!nameArmed || !picker) return;
    const page = picker.olderAnswer();
    if (page) olderKind.look(parseName(name).scientific, page);
  });
  let lastMsg = $state('');
  function clearShot() {
    if (preview) URL.revokeObjectURL(preview);
    preview = null; shot = null; photoMsg = '';
  }
  async function take(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    clearShot();
    lastMsg = ''; // the last plant's line belongs to it, not to the photograph just taken
    reading = true;
    try {
      const r = await processImage(file);
      shot = r;
      preview = URL.createObjectURL(r.thumb);
      setTimeout(() => document.getElementById('walk-name')?.focus(), 0);
    } catch (err) {
      photoMsg = err instanceof Error && err.message ? err.message : 'That file could not be read as a photograph.';
    } finally {
      reading = false;
    }
  }
  const blocked = $derived(reading ? 'Reading the photograph…' : !shot ? 'Take a photograph first.' : !name.trim() ? 'Name the plant.' : checking ? 'Checking the name against the reference…' : busy ? 'Adding the plant…' : '');
  async function addNext(e: SubmitEvent) {
    e.preventDefault();
    if (!shot || !name.trim() || busy || checking || reading) return;
    // The add form's check (plants/new's `save`): a name nothing resolved is kept on the second press, after the picker's
    // line has said so; an older name of a page is asked about once; "cf.", "aff." and "sp." are filed as written.
    checking = true;
    try {
      if (kind !== 'hybrid' && !nameArmed && !parseName(name).qualifier && (picker ? !(await picker.check()) : !taxonKey)) { nameArmed = true; return; }
      if (!nameArmed && !parseName(name).qualifier && (await picker?.olderFirst())) { nameArmed = true; return; }
    } finally {
      checking = false;
    }
    const olderOf = picker?.olderAnswer() ?? null;
    const photo = shot;
    busy = true;
    lastMsg = '';
    let rec: Accession;
    try {
      await settlePlaces('walk-loc');
      const p = parseName(name);
      const taxonName = p.scientific;
      const key = p.qualifier ? null : taxonKey;
      const slug = speciesSlug(taxonName);
      if (!collection.taxon(slug)) await collection.put('taxon', slug, { name: speciesName(taxonName), gbifKey: key });
      rec = await collection.addAccession({
        taxonName,
        taxonKey: key,
        cultivar: cultivar ?? p.cultivar ?? null,
        nameKind: p.kind !== 'species' ? p.kind : kind,
        parentage: p.kind === 'hybrid' || kind === 'hybrid' ? (parentage?.trim() || p.parentage || null) : null,
        nameAsReceived: (p.aside ? name.trim() : null) || pickReceived,
        locationId,
        notes: null,
        ...(olderOf ? { olderOf } : {}),
        ...(olderOf && olderKind.kindFor(taxonName, olderOf) ? { olderKind: olderKind.kindFor(taxonName, olderOf) } : {})
      });
    } catch {
      busy = false;
      return; // lastWriteError is said above the form; the photograph and the name stay for another press
    }
    if (locationId) writeSetting('cultifolio.lastLocation', 'collection', locationId);
    // The plant stands if its photograph cannot be stored (a full device): said on its line, with the reason.
    let why: string | undefined;
    try {
      await collection.addPhoto({ acc: rec.id, sowing: null, d: photo.taken ?? today(), dFrom: photo.taken ? 'exif' : 'added', caption: null, w: photo.w, h: photo.h, bytes: photo.bytes, sha: photo.sha, blob: photo.blob, thumb: photo.thumb });
    } catch (err) {
      why = (await storageErrorText(err)) ?? (err instanceof Error && err.message ? err.message : 'the photograph could not be stored');
    }
    added = [{ id: rec.id, photo: !why, ...(why ? { why } : {}) }, ...added];
    lastMsg = why ? `${accNo(rec)} added; its photograph was not stored: ${why}.` : `${accNo(rec)} added with its photograph. Next plant.`;
    clearShot();
    name = ''; taxonKey = null; cultivar = null; kind = 'species'; parentage = null; nameArmed = false; pickReceived = null;
    busy = false;
    setTimeout(() => document.getElementById('walk-camera')?.focus(), 0);
  }
  const dirty = () => !busy && (!!shot || !!name.trim());
  beforeNavigate((nav) => {
    if (!dirty() || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave the walk? The photograph and name not yet added will be lost.')) nav.cancel();
  });
</script>

<svelte:head><title>Photo walk · Cultifolio</title></svelte:head>

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError.replace(/\.$/, '')}.{#if collection.lastWriteError !== CLOSED_WORDS}{' '}Free space or <a href="/backup">back up now</a>.{/if}</div>
{/if}

<PageHead title="Photo walk" kick="My plants" places={false} sub="A room of plants, one photograph at a time: take it, name the plant, next." />

<p class="small muted" id="walk-how">Each photograph is resized and kept on this device with your collection, as every photograph you add is. Nothing identifies the plant from it: the name is the one you type, checked against the reference as the add form checks it.</p>

<div class="walk">
  <div class="field"><span class="lab">Space for these plants</span><LocationPicker bind:value={locationId} id="walk-loc" label="Space" /></div>

  <form class="step" novalidate onsubmit={addNext}>
    <div class="shot">
      {#if preview}<img src={preview} alt="The photograph for the plant being named" class="pv" />{:else}<div class="pv empty">{reading ? 'Reading the photograph…' : 'No photograph yet'}</div>{/if}
      <div class="takes">
        <label class="btn pri"><input id="walk-camera" type="file" accept="image/*" capture="environment" onchange={take} disabled={reading || busy} />{shot ? 'Take it again' : 'Take a photo'}</label>
        <label class="btn"><input id="walk-file" type="file" accept="image/*" onchange={take} disabled={reading || busy} />Choose a photo</label>
      </div>
      {#if photoMsg}<p class="bad small" role="alert" id="walk-photo-bad">{photoMsg}</p>{/if}
    </div>
    <label class="field"><span class="lab" id="walk-name-lab">Name</span><SpeciesPicker reserve id="walk-name" labelledby="walk-name-lab" addLabel="Add as typed" bind:value={name} bind:taxonKey bind:cultivar bind:kind bind:parentage bind:armed={nameArmed} bind:received={pickReceived} pressing={checking} bind:this={picker} /></label>
    <div class="actions">
      {#if blocked}<span class="why small" role="status" id="walk-why">{blocked}</span>{/if}
      <a class="btn" href="/plants">Done</a>
      <button class="btn pri" type="submit" id="walk-add" disabled={!!blocked && !checking} aria-describedby={blocked ? 'walk-why' : undefined}>{checking ? 'Checking the name…' : nameArmed ? 'Add as typed, and next' : 'Add and next'}</button>
    </div>
    {#if lastMsg}<p class="small" role="status" id="walk-last">{lastMsg}</p>{/if}
  </form>

  {#if added.length}
    <div class="secrule"><h2>Added on this walk</h2><div class="line"></div><span class="n">{added.length}</span></div>
    <ul class="added" id="walk-added">
      {#each added as x (x.id)}
        {@const a = collection.accession(x.id)}
        {#if a}<li><a href={plantHref(a)}><span class="accno">{accNo(a)}</span>{' '}<SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}‘{a.cultivar}’{/if}</a><span class="muted small">{' '}{x.photo ? 'with its photograph' : `no photograph: ${x.why}`}</span></li>{/if}
      {/each}
    </ul>
    <p><a class="btn" href="/labels?acc={added.map((x) => x.id).join(',')}">Labels for these {added.length}</a></p>
  {/if}
</div>

<style>
  .walk { max-width: 720px; }
  .field { display: block; margin: 12px 0; }
  .lab { display: block; font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 600; margin-bottom: 5px; }
  .step { border-top: 1px solid var(--ink); padding-top: 12px; }
  .shot { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 12px; align-items: center; }
  .pv { width: 160px; height: 160px; object-fit: cover; border-radius: 4px; background: var(--sunk); display: flex; align-items: center; justify-content: center; text-align: center; color: var(--ink3); font-size: var(--fs-sm); padding: 0; }
  .pv.empty { border: 1px dashed var(--rule); padding: 8px; }
  .takes { display: flex; gap: 8px; flex-wrap: wrap; }
  .takes label { position: relative; overflow: hidden; }
  .takes input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .actions .why { margin-right: auto; color: var(--ink2); }
  .added { list-style: none; margin: 0 0 10px; padding: 0; }
  .added li { padding: 7px 0; border-bottom: 1px solid var(--rule); font-size: var(--fs-md); }
  .small { font-size: var(--fs-sm); }
  .muted { color: var(--ink3); }
  .bad { color: var(--bad); }
  @media (max-width: 520px) { .shot { grid-template-columns: minmax(0, 1fr); } .pv { width: 100%; height: 220px; } }
  @media (max-width: 640px) { .actions .btn, .takes .btn { min-height: 44px; } }
  /* Round eighty-seven, stage-3 integration (DESIGN-87: data looks like data, no chips): a number as plain figures. */
  .accno { background: none; padding: 0; border-radius: 0; font-variant-numeric: tabular-nums lining-nums; }
</style>

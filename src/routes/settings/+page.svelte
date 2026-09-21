<script lang="ts">
  /**
   * Settings: everything that is about you rather than about a plant. Units
   * and appearance are this device's; your site is this device's too (the
   * frost watch and the hemisphere of the months read it); numbering is a
   * synced setting of the vault, since two devices must mint the same numbers.
   * Nothing here is sent anywhere.
   */
  import { onMount } from 'svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { theme } from '$lib/ui/theme.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { nextAccession, type NumberingScheme } from '$core/accession';
  import { temp, rain } from '$core/units';

  $effect(() => {
    setCrumb([{ label: 'Settings' }]);
    return () => setCrumb([]);
  });
  onMount(async () => {
    site.load();
    theme.load();
    await collection.load();
    const s = collection.scheme;
    mode = s.mode;
    prefix = s.prefix ?? '';
    width = String(s.width);
  });

  /* ---- your site ---- */
  let lat = $state(''), lon = $state(''), siteName = $state('');
  let siteMsg = $state('');
  let locating = $state(false);
  $effect(() => {
    if (site.loaded && site.current && lat === '' && lon === '') {
      lat = String(site.current.lat);
      lon = String(site.current.lon);
      siteName = site.current.name ?? '';
    }
  });
  const benches = $derived(collection.ready ? collection.locations.filter((l) => l.lat != null && l.lon != null) : []);
  function saveSite() {
    const la = Number(lat), lo = Number(lon);
    if (!lat.trim() || !lon.trim() || Number.isNaN(la) || Number.isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      siteMsg = 'Latitude is −90 to 90 and longitude −180 to 180; check the figures.';
      return;
    }
    site.set({ lat: +la.toFixed(4), lon: +lo.toFixed(4), name: siteName.trim() || undefined });
    siteMsg = 'Saved on this device.';
  }
  function clearSite() {
    site.set(null);
    lat = lon = siteName = '';
    siteMsg = 'Cleared.';
  }
  function useBench(id: string) {
    const b = benches.find((x) => x.id === id);
    if (!b || b.lat == null || b.lon == null) return;
    lat = String(b.lat);
    lon = String(b.lon);
    siteName = b.name;
    saveSite();
  }
  function locate() {
    if (!navigator.geolocation) {
      siteMsg = 'This browser has no location service; type coordinates instead.';
      return;
    }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lat = p.coords.latitude.toFixed(3);
        lon = p.coords.longitude.toFixed(3);
        locating = false;
        saveSite();
      },
      (e) => {
        locating = false;
        siteMsg = e.message;
      },
      { timeout: 10000 }
    );
  }

  /* ---- numbering ---- */
  let mode = $state<'year' | 'prefix'>('year');
  let prefix = $state('');
  let width = $state('4');
  let numMsg = $state('');
  /** Letters and digits, upper case: the same rule for the preview and the save, so what is previewed is what is minted. */
  const cleanPrefix = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  /** Two to six digits, whole: 2.5 digits is not a width, and the input's own min/max are advice the keyboard ignores. */
  const parseWidth = (v: string): number | null => (/^\s*[2-6]\s*$/.test(v) ? Number(v) : null);
  const preview = $derived.by(() => {
    const w = parseWidth(width) ?? 4;
    const s: NumberingScheme = mode === 'year' ? { mode, width: w } : { mode, prefix: cleanPrefix(prefix) || 'ACC', width: w };
    return collection.ready ? nextAccession(collection.accessions.map((a) => a.id), s) : '';
  });
  async function saveScheme() {
    const w = parseWidth(width);
    if (w == null) {
      numMsg = 'Digits is a whole number from 2 to 6.';
      return;
    }
    const s: NumberingScheme = mode === 'year' ? { mode, width: w } : { mode, prefix: cleanPrefix(prefix), width: w };
    if (s.mode === 'prefix' && !s.prefix) {
      numMsg = 'A prefix needs at least one letter or digit.';
      return;
    }
    await collection.setScheme(s);
    numMsg = `Saved${sync.configured ? ' and synced' : ''}. Numbers already given are kept; the next plant is ${nextAccession(collection.accessions.map((a) => a.id), s)}.`;
  }
</script>

<svelte:head><title>Settings — Cultifolio</title></svelte:head>

<div class="kick" style="margin-top: 22px">Cultifolio</div>
<h1 class="q">Settings</h1>
<p class="secsub">What is about you rather than about a plant. Units, appearance and your site stay on this device; numbering is a setting of your vault and syncs.</p>

<h2 class="sec" id="units">Units</h2>
<div class="cult">
  <div class="body">
    <div class="seg" role="group" aria-label="Units">
      <button type="button" class:on={units.current === 'metric'} aria-pressed={units.current === 'metric'} onclick={() => units.set('metric')}>°C and mm</button>
      <button type="button" class:on={units.current === 'us'} aria-pressed={units.current === 'us'} onclick={() => units.set('us')}>°F and inches</button>
    </div>
    <p class="small muted" style="margin: 10px 0 0">Every figure and every sentence follows this: a cold floor reads {temp(6.5, units.current, 1)}, a year's rain {rain(72, units.current)}. The data underneath stays in the units the sources measured in, and the page says so where it matters. Any temperature figure on a species page switches this too.</p>
  </div>
</div>

<h2 class="sec" id="site">Your site</h2>
<div class="cult">
  <div class="body">
    <p class="small" style="margin: 0 0 10px">Where you grow. The frost watch reads the forecast here and shows it on the front page when it turns; the months in the cultivation notes are given for this hemisphere.{#if !site.current && benches.length} Until it is set, the first bench with coordinates stands in.{/if}</p>
    <div class="fields">
      <label><span>Name</span><input type="text" bind:value={siteName} placeholder="home, the greenhouse" /></label>
      <label><span>Latitude</span><input type="text" inputmode="decimal" bind:value={lat} placeholder="40.43" /></label>
      <label><span>Longitude</span><input type="text" inputmode="decimal" bind:value={lon} placeholder="-80.01" /></label>
    </div>
    <div class="row">
      <button class="btn pri" type="button" onclick={saveSite}>Save</button>
      <button class="btn" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'Use my location'}</button>
      {#if benches.length}
        <label class="inline"><span>or a bench:</span><select onchange={(e) => useBench((e.currentTarget as HTMLSelectElement).value)}><option value="">choose</option>{#each benches as b (b.id)}<option value={b.id}>{b.name}</option>{/each}</select></label>
      {/if}
      {#if site.current}<button class="linkish" type="button" onclick={clearSite}>Clear</button>{/if}
    </div>
    {#if siteMsg}<p class="small muted" role="status" style="margin: 8px 0 0">{siteMsg}</p>{/if}
    {#if site.current}<p class="small muted" style="margin: 8px 0 0">Set: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/frost">frost watch</a>.</p>{/if}
  </div>
</div>

<h2 class="sec" id="appearance">Appearance</h2>
<div class="cult">
  <div class="body">
    <div class="seg" role="group" aria-label="Appearance">
      {#each [['system', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']] as const as [t, label] (t)}
        <button type="button" class:on={theme.current === t} aria-pressed={theme.current === t} onclick={() => theme.set(t)}>{label}</button>
      {/each}
    </div>
  </div>
</div>

<h2 class="sec" id="numbering">Numbering</h2>
<div class="cult">
  <div class="body">
    <p class="small" style="margin: 0 0 10px">How new plants are numbered. A number is never reused and numbers already given are kept; this is a setting of the vault, so every device mints the same way.</p>
    <div class="seg" role="group" aria-label="Numbering scheme">
      <button type="button" class:on={mode === 'year'} aria-pressed={mode === 'year'} onclick={() => (mode = 'year')}>Year: 2026-0001</button>
      <button type="button" class:on={mode === 'prefix'} aria-pressed={mode === 'prefix'} onclick={() => (mode = 'prefix')}>Prefix: ABC-0001</button>
    </div>
    <div class="fields" style="margin-top: 10px">
      {#if mode === 'prefix'}<label><span>Prefix</span><input type="text" bind:value={prefix} placeholder="your initials or the collection's" maxlength="8" /></label>{/if}
      <label><span>Digits</span><input type="number" min="2" max="6" step="1" inputmode="numeric" bind:value={width} /></label>
    </div>
    <div class="row">
      <button class="btn pri" type="button" onclick={saveScheme} disabled={!collection.ready}>Save</button>
      {#if preview}<span class="small muted">next plant: <span class="accno">{preview}</span></span>{/if}
    </div>
    {#if numMsg}<p class="small muted" role="status" style="margin: 8px 0 0">{numMsg}</p>{/if}
  </div>
</div>

<h2 class="sec" id="labels">Labels</h2>
<div class="cult"><div class="body"><p class="small" style="margin: 0">The label stock and what goes on a label are chosen on the <a href="/labels">labels page</a> and remembered on this device.</p></div></div>

<h2 class="sec" id="data">Your data</h2>
<div class="cult">
  <div class="body">
    <p class="small" style="margin: 0 0 10px">Your collection lives in this browser and nowhere else{#if sync.configured}, and in an encrypted vault only your key opens{/if}. Nothing on this site is stored about you; there are no accounts and no analytics.</p>
    <div class="row">
      <a class="btn" href="/backup">Back up, restore or import from v2</a>
      <a class="btn" href="/sync">Sync between devices</a>
      <a class="btn" href="/about/formats">The file formats</a>
      <a class="btn" href="/about/how#privacy">What the site knows about you</a>
    </div>
  </div>
</div>

<style>
  .cult .body { padding: 14px 17px 15px; font-family: var(--ui); }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .fields label, .inline { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink2); }
  .inline { flex-direction: row; align-items: center; gap: 6px; }
  .fields input, .inline select { font: inherit; font-size: 14px; padding: 8px 10px; border: 1px solid var(--rule); border-radius: 8px; background: var(--card); color: var(--ink); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  .seg > button { min-height: 40px; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: 13px; color: var(--ink3); cursor: pointer; text-decoration: underline; }
  .muted { color: var(--ink3); }
</style>

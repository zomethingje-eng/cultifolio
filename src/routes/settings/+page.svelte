<script lang="ts">
  /**
   * Settings: everything that is about you rather than about a plant. Units
   * and appearance are this device's; your site is this device's too (the
   * frost watch and the hemisphere of the months read it); numbering is a
   * synced setting of the vault, since two devices must mint the same numbers.
   * Nothing here is sent anywhere.
   */
  import { onMount } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { theme } from '$lib/ui/theme.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { nextAccession, type NumberingScheme } from '$core/accession';
  import { temp, rain } from '$core/units';
  import ToggleGroup from '$lib/ui/ToggleGroup.svelte';

  $effect(() => {
    setCrumb([{ label: 'Settings' }]);
    return () => setCrumb([]);
  });
  onMount(async () => {
    site.load();
    theme.load();
    prefs.load();
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
    // The watch reads the new site now: the old site's nights are not this site's, and are not shown meanwhile (round fifty-eight).
    void frost.check(true);
    siteMsg = 'Saved on this device.';
  }
  function clearSite() {
    site.set(null);
    void frost.check(true);
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
    const s: NumberingScheme = mode === 'year' ? { mode, width: w } : { mode, prefix: cleanPrefix(prefix) || 'ABC', width: w };
    return collection.ready ? collection.nextAccessionNumber(s) : '';
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
    numMsg = `Saved${sync.configured ? ' and synced' : ''}. Numbers already given are kept; the next plant is ${collection.nextAccessionNumber(s)}.`;
  }
</script>

<svelte:head><title>Settings · Cultifolio</title></svelte:head>

<PageHead title="Settings" places={false} sub="Units, appearance and your site stay on this device; numbering is a setting of your vault and syncs." />

<!-- One heading per subject, one option per line with its hint under it; the Today option has its own heading, not the
     photographs' (round fifty-eight; the grower review). -->
<h2 class="sec" id="units">Units</h2>
<div class="cult">
  <div class="body">
    <div class="opt">
      <p class="optlab" id="units-temp">Temperature and rain</p>
      <!-- The one toggle group, named by the line above it (round fifty-eight; the accessibility review). -->
      <ToggleGroup labelledby="units-temp" options={[{ value: 'metric', label: '°C and mm' }, { value: 'us', label: '°F and inches' }]} value={units.current} onchange={(v) => units.set(v)} />
      <p class="hint">A cold floor reads {temp(6.5, units.current, 1)}, a year's rain {rain(72, units.current)}; the sources stay in what they measured. The °C / °F button on a species page's cold floor switches this too.</p><!-- the switch is its own button now (round fifty-eight; the accessibility review) -->
    </div>
    <!-- Lengths on their own switch, following the temperature until the grower chooses (round fifty-eight; the grower review). -->
    <div class="opt">
      <p class="optlab" id="units-len">Lengths (measurements, pot sizes)</p>
      <!-- Following is a third value of the choice, not a state beside it (round fifty-eight; the accessibility review). -->
      <ToggleGroup labelledby="units-len" options={[{ value: 'mm', label: 'Millimetres' }, { value: 'in', label: 'Inches' }, { value: 'follow', label: 'Follow temperature' }]} value={prefs.current.lengthUnits ?? 'follow'} onchange={(v) => prefs.set({ lengthUnits: v === 'follow' ? null : v })} />
      <p class="hint">{prefs.lengthUnitsFollow ? `Following the temperature: lengths are in ${prefs.lengthUnits === 'in' ? 'inches' : 'millimetres'} now, inches with °F and millimetres with °C.` : `Lengths are in ${prefs.lengthUnits === 'in' ? 'inches' : 'millimetres'} whatever the temperature units.`}</p>
    </div>
  </div>
</div>

<!-- Reachable at /settings#site from the first-visit setup; h2.sec carries the scroll margin for the sticky top bar (round fifty-eight; the grower review). -->
<h2 class="sec" id="site">Your site</h2>
<div class="cult">
  <div class="body">
    <p class="small" style="margin: 0 0 10px">Where you grow: the frost watch reads its forecast here, and the months in the notes follow its hemisphere.{#if !site.current && benches.length} Until it is set, the first place with coordinates decides the hemisphere for the months; the frost watch here and on the front page needs the site itself, and a place with coordinates is watched on its own page regardless.{/if}</p>
    <!-- Placeholders that read as examples, muted, not as figures already set (round fifty-eight; the grower review). -->
    <div class="fields">
      <label><span>Name</span><input type="text" bind:value={siteName} placeholder="e.g. home, the greenhouse" /></label>
      <label><span>Latitude (decimal degrees)</span><input id="site-lat" type="text" inputmode="decimal" bind:value={lat} placeholder="e.g. 51.5" /></label>
      <label><span>Longitude (decimal degrees)</span><input id="site-lon" type="text" inputmode="decimal" bind:value={lon} placeholder="e.g. -0.12" /></label>
    </div>
    <p class="hint">North and east are positive, south and west negative.</p>
    <div class="row">
      <button class="btn pri" type="button" onclick={saveSite}>Save</button>
      <button class="btn" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'Use my location'}</button>
      {#if benches.length}
        <label class="inline"><span>or a place:</span><select onchange={(e) => useBench((e.currentTarget as HTMLSelectElement).value)}><option value="">choose</option>{#each benches as b (b.id)}<option value={b.id}>{b.name}</option>{/each}</select></label>
      {/if}
      {#if site.current}<button class="linkish" type="button" onclick={clearSite}>Clear</button>{/if}
    </div>
    {#if siteMsg}<p class="small muted" role="status" style="margin: 8px 0 0">{siteMsg}</p>{/if}
    {#if site.current}<p class="small muted" style="margin: 8px 0 0">Set: {site.current.name ? site.current.name + ', ' : ''}{site.current.lat}, {site.current.lon} · <a href="/today#frost">frost watch</a>.</p>{/if}
  </div>
</div>

<h2 class="sec" id="appearance">Appearance</h2>
<div class="cult">
  <div class="body">
    <!-- round fifty-eight; the accessibility review: the one toggle group -->
    <ToggleGroup label="Appearance" options={[{ value: 'system', label: 'Follow the system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} value={theme.current} onchange={(t) => theme.set(t)} />
  </div>
</div>

<h2 class="sec" id="today">Today</h2>
<div class="cult">
  <div class="body">
    <div class="opt">
      <label class="check"><input id="pref-keeping" type="checkbox" aria-describedby="pref-keeping-hint" checked={!prefs.current.hideKeeping} onchange={(e) => prefs.set({ hideKeeping: !e.currentTarget.checked })} /><span>Show where the collection stands</span></label>
      <p class="hint indent" id="pref-keeping-hint">A line on Today with the last backup, the last sync, and records waiting.</p>
    </div>
  </div>
</div>

<h2 class="sec" id="privacy">Photographs</h2>
<div class="cult">
  <div class="body">
    <div class="opt">
      <label class="check"><input id="pref-refphotos" type="checkbox" aria-describedby="pref-refphotos-hint" checked={prefs.current.referencePhotos} onchange={(e) => prefs.set({ referencePhotos: e.currentTarget.checked })} /><span>Show the reference photograph on my own pages</span></label>
      <p class="hint indent" id="pref-refphotos-hint">The species' photograph on my plants, my batches and my tiles when a plant has no photograph of its own. Off, your own pages ask no outside host for anything. On, the photograph comes straight from iNaturalist, Wikimedia Commons or the GBIF image cache, so that host sees this address ask for that species' picture; Cultifolio's server is not involved and learns nothing. Species pages you open are unaffected either way.</p>
    </div>
  </div>
</div>

<h2 class="sec" id="numbering">Numbering</h2>
<div class="cult">
  <div class="body">
    <p class="small" style="margin: 0 0 10px">How new plants are numbered; a number is never reused, and numbers already given are kept. With the year scheme the year is the plant's acquisition year (a plant acquired on 31 December and filed on 2 January is a 2026 plant), and a batch's is the year it was started.</p>
    <!-- Year needs nothing typed, so the tap is the save; Prefix waits for its letters and Save (round forty-nine, 3). The one toggle group (round fifty-eight; the accessibility review). -->
    <ToggleGroup label="Numbering scheme" options={[{ value: 'year', label: 'Year: 2026-0001' }, { value: 'prefix', label: 'Prefix: ABC-0001' }]} bind:value={mode} onchange={(v) => { if (v === 'year' && collection.ready) void saveScheme(); }} />
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
    <p class="small" style="margin: 0 0 10px">Your collection lives in this browser and nowhere else{#if sync.configured}, and in an encrypted vault only your key opens{/if}. Nothing on this site is stored about you beyond short-lived rate counters by address and, with sync on, your encrypted vault, whose sizes and timing the server can see and whose contents it cannot (<a href="/about/formats#sync">what the server can see</a>); there are no accounts and no analytics.</p>
    <div class="row">
      <a class="btn" href="/backup">Back up or restore</a>
      <a class="btn" href="/sync">Sync between devices</a>
      <a class="btn" href="/about/formats">The file formats</a>
      <a class="btn" href="/about/how#privacy">What the site knows about you</a>
    </div>
  </div>
</div>

<style>
  .cult .body { padding: 14px 17px 15px; font-family: var(--ui); }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
  .fields label, .inline { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); color: var(--ink2); }
  .inline { flex-direction: row; align-items: center; gap: 6px; }
  .fields input, .inline select { font: inherit; font-size: var(--fs-md); padding: 8px 10px; min-height: 44px; box-sizing: border-box; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; }
  .body :global(.seg > button) { min-height: 44px; } /* reaches into the toggle group's own markup (round fifty-eight; the accessibility review) */
  /* One option per line, its name above and its hint under it (round fifty-eight; the grower review). */
  .opt + .opt { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); }
  .optlab { margin: 0 0 8px; font-size: var(--fs-md); font-weight: 600; color: var(--ink); }
  .hint { margin: 6px 0 0; font-size: var(--fs-md); line-height: 1.5; color: var(--ink3); }
  .hint.indent { padding-left: 32px; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: var(--fs-md); font-weight: 600; color: var(--ink); cursor: pointer; }
  .check input { width: 20px; height: 20px; margin: 0 2px; flex: none; accent-color: var(--accent); }
  .fields input::placeholder { color: var(--ink3); opacity: 0.8; font-style: italic; }
  .linkish { background: none; border: 0; padding: 0 4px; font: inherit; font-size: var(--fs-md); color: var(--ink3); cursor: pointer; text-decoration: underline; }
  .muted { color: var(--ink3); }
</style>

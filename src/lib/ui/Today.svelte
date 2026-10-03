<script lang="ts">
  import { localDateYearAgo, daysBetween } from '$core/dates';
  import { site } from '$lib/ui/site.svelte';

  /**
   * What needs you, on the front page of a grower's collection: the frost watch when a site is remembered and the
   * forecast turns, sowings still in the tray, plants not photographed in a year. Each line is a link, and a line
   * that has nothing to say is not shown; a forecast that did not answer says so rather than nothing.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, sowNo, PROP_METHODS, kindOf } from '$lib/db/types';
  import { onMount } from 'svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { sheetsFor, type Sheet } from '$lib/ui/index.svelte';
  import { growingYear, forReader } from '$core/sheet';
  import { speciesSlug } from '$core/names';
  import { localDate } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import { getMeta } from '$lib/db/vault';
  import { sync } from '$lib/sync/engine.svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  /** Where the lines are shown: the front page carries them all; the Today tab shows the frost and the watering in full above, so those two lines are left to it (round fifty-three, 3). */
  let { where = 'home' }: { where?: 'home' | 'today' } = $props();
  const hasSite = $derived(frost.hasSite);
  const readForecast = () => frost.check(true);
  onMount(() => { void frost.check(); });
  /** The site from the device's own location, in one tap from the line that asks for it, as Settings offers (round forty-nine, 3; U4). Rounded to three decimals, as Settings rounds. */
  let locating = $state(false);
  let locateMsg = $state('');
  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { locateMsg = 'This browser has no location service; set the site in Settings.'; return; }
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (p) => { site.set({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); locating = false; void readForecast(); },
      (e) => { locating = false; locateMsg = e.message; },
      { timeout: 10000 }
    );
  }
  const today = new Date();
  const yearAgo = localDateYearAgo(today);
  /** When this device last wrote a backup file, for the line below (round forty-nine, 3). */
  let lastBackup = $state<string | null>(null);
  onMount(() => { void getMeta<string>('lastBackup').then((v) => (lastBackup = v ?? null)); });
  const sowings = $derived(collection.ready ? collection.sowings.filter((s) => s.status === 'active').sort((a, b) => a.sown.localeCompare(b.sown) || a.id.localeCompare(b.id)) : []); // two batches sown the same day: the one made first is the older (round twenty-five, 16)
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  // A plant recorded this spring is not "without a photograph in twelve months" yet: the line counts records older than
  // six months, so a new grower's first weeks are not a reproach (round forty-nine, 3).
  const halfYearAgo = (() => { const d = new Date(today); d.setMonth(d.getMonth() - 6); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  // Counted from the acquisition date on purpose (round forty-nine, 3; kept in round fifty-four against the second reviewer's finding 25): a plant the grower says they have had since 2015 and never photographed is the plant this line is for; a plant acquired last month is not.
  const unphotographed = $derived(growing.filter((a) => (a.acquired ?? a.importedOn ?? localDate()) <= halfYearAgo && !collection.photos(a.id).some((p) => p.d >= yearAgo)));
  // The two facts the plants list and the place pages already flag, said once here: not watered for three weeks (by the
  // log, from the day the record was made when nothing is logged), and missed at the last audit or not seen for ninety
  // days. Facts from the log, not a schedule (round twenty-four, 11).
  const dry = $derived(collection.ready ? collection.due : []); // the collection's own figure, shared with the plants list (round twenty-five, R1-1)
  /**
   * Of the plants not watered, those whose habitat is in its dry season now, by the species sheet's growing year
   * (the rain rule, shifted to the grower's hemisphere): a fact about the habitat, said beside the fact about the
   * record, since a cactus unwatered through its rest is not a plant forgotten (round forty-nine, 3; round twenty-seven).
   * Species only (a hybrid has no one habitat); read from the sheets the page already fetches for its tiles.
   */
  let sheets = $state<Map<string, Sheet> | null>(null);
  let sheetsSettled = $state(false); // the button waits for the sheets, as the Today tab's do: its count must not change under a reading eye (round fifty-five, 5)
  $effect(() => {
    const slugs = [...new Set(dry.filter((a) => kindOf(a) === 'species').map((a) => speciesSlug(a.taxonName)))];
    if (!slugs.length) { sheets = null; sheetsSettled = true; return; }
    sheetsSettled = false;
    void sheetsFor(slugs).then((m) => { if (m) sheets = m; }).finally(() => { sheetsSettled = true; });
  });
  const resting = $derived.by(() => {
    if (!sheets) return [];
    const month = today.getMonth() + 1;
    const lat = site.current?.lat ?? null;
    return dry.filter((a) => {
      const sh = sheets!.get(speciesSlug(a.taxonName));
      if (!sh || sh.climate.status !== 'ok') return false;
      const year = growingYear(sh.climate.months, sh.habitatLat);
      if (!year || year.none || year.grow === 'even') return false;
      return !forReader(year, lat).includes(month);
    });
  });
  /** One tap waters every plant on the dry line, dated today, as a place's "Water all" does; one tap takes exactly those lines back. */
  let watering = $state(false);
  async function waterDry() {
    if (watering) return; // one tap, one set of lines (round fifty-two, 3)
    watering = true;
    try {
      const ids = await collection.addEventsIds(toWater.map((a) => ({ acc: a.id, d: localDate(), t: 'water' as const, note: 'from Today: every plant on the not-watered line', auto: true })));
      toast.show(`Watered ${ids.length} plant${ids.length === 1 ? '' : 's'}.`, 8000, { label: 'Undo', run: () => { void collection.removeEvents(ids).then(() => toast.show(`Undone: the ${ids.length} watering line${ids.length === 1 ? '' : 's'} removed.`)); } });
    } finally {
      watering = false;
    }
  }
  /** Where the collection stands outside this device: a backup's age, sync's state, and what is waiting (round forty-nine, 3; round twenty-seven). Said once, as a fact, not a nag: hidden once the grower has asked to. */
  const keeping = $derived.by(() => {
    if (!collection.ready || !growing.length) return null;
    const backup = lastBackup ? `backup ${daysBetween(lastBackup.slice(0, 10)) === 0 ? 'today' : `${daysBetween(lastBackup.slice(0, 10))} d ago`}` : 'no backup yet';
    const synced = sync.configured ? (sync.lastSync ? `synced ${daysBetween(sync.lastSync.slice(0, 10)) === 0 ? 'today' : `${daysBetween(sync.lastSync.slice(0, 10))} d ago`}` : 'sync set up, not yet synced') : 'not synced';
    const waiting = collection.incomplete ? `, ${collection.incomplete} record${collection.incomplete === 1 ? '' : 's'} waiting` : '';
    const stale = !lastBackup || daysBetween(lastBackup.slice(0, 10)) > 30;
    return { text: `Kept on this device: ${backup}, ${synced}${waiting}.`, tone: stale && !sync.configured ? 'warn' : 'muted' };
  });
  const unseen = $derived(growing.filter((a) => { if (collection.missedAt(a.id)) return true; const s = collection.lastSeen(a.id); return s != null && daysBetween(s) > 90; }));
  const frostLine = $derived(frost.line); // the sentence names its level itself ("Frost forecast: …"), so the level is not said twice (round twenty-five, 16)
  // A plant with no watering recorded is not a plant not watered for three weeks: it is a plant whose waterings were never
  // written down, counted from the day its record was made. The two are said apart (round fifty-three, 3; the second reviewer's condition).
  // A watering dated ahead of today is not due (round fifty-five, 5): `dry` has none, and the line does not count them.
  const unknown = $derived(dry.filter((a) => !collection.lastWatered(a.id)));
  const overdue = $derived(dry.length - unknown.length);
  /** What "Water these" waters: the dry plants not in their habitat's rest, as the Today tab's stop button does; the resting ones are said, not watered by the one tap (round fifty-five, 5; the first reviewer's finding 6). */
  const toWater = $derived(dry.filter((a) => !resting.includes(a)));
  const dryText = $derived.by(() => {
    const parts: string[] = [];
    if (overdue) parts.push(`${overdue} of ${growing.length} plants not watered for three weeks or more`);
    if (unknown.length) parts.push(`${unknown.length}${overdue ? '' : ` of ${growing.length}`} with no watering recorded yet, ${unknown.length === 1 ? 'its record' : 'their records'} three weeks old or more`);
    return parts.join(', and ') + (resting.length ? `; ${resting.length === dry.length ? (dry.length === 1 ? 'it is' : 'all of them are') : `${resting.length} of them ${resting.length === 1 ? 'is' : 'are'}`} in the habitat's dry season by the species sheet` : '') + '.';
  });
  type Line = { href: string; tone: string; text: string; water?: boolean; keeping?: boolean };
  const lines = $derived(
    ([
      frostLine && where === 'home' ? { href: '/today#frost', tone: frostLine.tone, text: frostLine.text } : null,
      dry.length && where === 'home' ? { href: '/today#water', tone: 'warn', text: dryText, water: true } : null,
      unseen.length ? { href: '/places', tone: 'warn', text: `${unseen.length} plant${unseen.length === 1 ? '' : 's'} missed at the last audit or not seen for ninety days${unseen.length <= 3 ? ': ' + unseen.map(accNo).join(', ') : ''}.` } : null,
      sowings.length ? { href: '/propagation', tone: 'ok', text: `${sowings.length} propagation batch${sowings.length === 1 ? '' : 'es'} in the tray, the oldest ${sowNo(sowings[0])} (${sowings[0].taxonName}) ${PROP_METHODS.find((x) => x.k === sowings[0].method)?.veg ? 'started' : 'sown'} ${sowings[0].sown}.` } : null,
      unphotographed.length && growing.length ? { href: '/plants?show=nophoto', tone: 'muted', text: `${unphotographed.length} of ${growing.length} plants without a photograph in the last twelve months${unphotographed.length <= 3 ? ': ' + unphotographed.map(accNo).join(', ') : ''}.` } : null,
      keeping && !prefs.hideKeeping ? { href: sync.configured ? '/sync' : '/backup', tone: keeping.tone, text: keeping.text, keeping: true } : null
    ] as Array<Line | null>).filter((x): x is Line => !!x)
  );
</script>

{#if lines.length}
  <div class="today" aria-label="Today" data-sveltekit-preload-data="off">
    {#each lines as l (l.href)}
      {#if l.water}
        <div class="line {l.tone} withact"><a href={l.href}>{l.text}</a>{#if toWater.length}<button class="btn small" type="button" onclick={waterDry} disabled={watering || !sheetsSettled} title="One watering line on each, dated today, leaving the plants in their habitat's rest; Undo takes them back">Water these {toWater.length}</button>{/if}</div>
      {:else if l.keeping}
        <div class="line {l.tone} withact"><a href={l.href}>{l.text}</a><button class="btn small" type="button" onclick={() => (prefs.hideKeeping = true)} title="Hide this line; Settings brings it back">Hide</button></div>
      {:else}
        <a class="line {l.tone}" href={l.href}>{l.text}</a>
      {/if}
    {/each}
    {#if !hasSite && where === 'home'}<span class="small muted">Frost watch needs a site: <button class="linkish" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'use my location'}</button> or <a href="/settings#site">set one in Settings</a>.{#if locateMsg} {locateMsg}{/if}</span>{/if}
  </div>
{:else if collection.ready && !hasSite && growing.length && where === 'home'}
  <p class="small muted todaynote">Frost watch needs a site: <button class="linkish" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'use my location'}</button> or <a href="/settings#site">set one in Settings</a>, and the forecast shows here when it turns.{#if locateMsg} {locateMsg}{/if}</p>
{/if}

<style>
  .today { display: flex; flex-direction: column; margin: 12px 0 4px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .line { display: block; padding: 10px 14px; font-size: 13.5px; color: var(--ink); border-left: 3px solid var(--rule); border-top: 1px solid var(--rule); }
  .line:first-child { border-top: 0; }
  .withact { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .withact a { color: inherit; flex: 1; min-width: 0; }
  .withact a:hover { text-decoration: underline; }
  .withact .btn { flex: none; min-height: 36px; }
  .line:hover { text-decoration: none; background: var(--sunk); }
  .today > .small { padding: 8px 14px; border-top: 1px solid var(--rule); }
  .line.bad { border-left-color: var(--bad); }
  .line.warn { border-left-color: var(--warn, #b8692a); }
  .line.ok { border-left-color: var(--accent); }
  .muted { color: var(--ink3); }
  .todaynote { margin: 8px 0 0; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
  /* Tighter on a phone: the lines are a glance before the grower's own plants, not the page (round fifty, 4). */
  @media (max-width: 640px) {
    .today { margin: 8px 0 2px; }
    .line { padding: 8px 12px; font-size: 13px; line-height: 1.4; }
    .today > .small { padding: 6px 12px; font-size: 12px; }
    .withact .btn { min-height: 32px; padding: 4px 10px; font-size: 12.5px; }
  }
</style>

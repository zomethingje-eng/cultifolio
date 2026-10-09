<script lang="ts">
  import { daysBetween } from '$core/dates';
  import { site, readerLat } from '$lib/ui/site.svelte';
  import { plantLabel } from '$lib/ui/plant-label';
  import { ruleRain } from '$core/units';
  import { units } from '$lib/ui/units.svelte';

  /**
   * What needs you, on the front page of a grower's collection: the frost watch when a site is remembered and the
   * forecast turns, sowings still in the tray, plants not photographed in a year. Each line is a link, and a line
   * that has nothing to say is not shown; a forecast that did not answer says so rather than nothing.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, sowNo, PROP_METHODS, kindOf } from '$lib/db/types';
  import { onMount, tick } from 'svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { sheetsFor, type Sheet } from '$lib/ui/index.svelte';
  import { growingYear, forReader } from '$core/sheet';
  import { speciesSlug } from '$core/names';
  import { localDate } from '$core/dates';
  import { toast } from '$lib/ui/toast.svelte';
  import { wateredHere } from '$lib/ui/watered.svelte';
  import { getMeta } from '$lib/db/vault';
  import { sync } from '$lib/sync/engine.svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { photoDue, photoDueDays } from '$lib/ui/photo-due';
  import { today as day } from '$lib/ui/day.svelte';
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
  /** When this device last wrote a backup file, for the line below (round forty-nine, 3). */
  let lastBackup = $state<string | null>(null);
  onMount(() => { void getMeta<string>('lastBackup').then((v) => (lastBackup = v ?? null)); });
  const sowings = $derived(collection.ready ? collection.sowings.filter((s) => s.status === 'active').sort((a, b) => a.sown.localeCompare(b.sown) || a.id.localeCompare(b.id)) : []); // two batches sown the same day: the one made first is the older (round twenty-five, 16)
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  // A plant recorded this spring is not "without a photograph in twelve months" yet: the line counts records six months
  // old or more, by the acquisition date on purpose (round forty-nine, 3; kept in round fifty-four). The rule is the plants
  // list's own, so the chip this line opens lists the same plants (round sixty-one; the grower review, 11). Cut on the
  // shared day store's corrected day, as the list is, never the raw device clock (round sixty-two; outside review B4).
  const photoDays = $derived(photoDueDays(day.current));
  const unphotographed = $derived(growing.filter((a) => photoDue(a, collection, photoDays)));
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
  /** The sheets did not answer: no plant on the line is set apart for its habitat's rest, and the line says so, never "none resting" (round sixty-two; rule 2, the grower review, 1). */
  let sheetsFailed = $state(false);
  $effect(() => {
    const slugs = [...new Set(dry.filter((a) => kindOf(a) === 'species').map((a) => speciesSlug(a.taxonName)))];
    if (!slugs.length) { sheets = null; sheetsSettled = true; sheetsFailed = false; return; }
    sheetsSettled = false;
    void sheetsFor(slugs).then((m) => { if (m) sheets = m; sheetsFailed = !m; }, () => { sheetsFailed = true; }).finally(() => { sheetsSettled = true; });
  });
  /** Each resting plant with the rule that rests it: the rain rule's season, or under 120 mm a year the temperature rule's cooler six months, worded apart as the Today tab words them (round fifty-nine). */
  const restingBy = $derived.by(() => {
    const out = new Map<string, 'rain' | 'cool'>();
    if (!sheets) return out;
    const month = Number(day.current.slice(5, 7)); // the corrected day's month (round sixty-two; outside review B4)
    const lat = readerLat(collection.locations); // the site, else the first place with coordinates, as the species page reads it (round sixty; the self-review's 10)
    for (const a of dry) {
      const sh = sheets.get(speciesSlug(a.taxonName));
      if (!sh || sh.climate.status !== 'ok') continue;
      const year = growingYear(sh.climate.months, sh.habitatLat);
      if (!year || year.none || year.grow === 'even') continue;
      if (!forReader(year, lat).includes(month)) out.set(a.id, year.fog ? 'cool' : 'rain');
    }
    return out;
  });
  const resting = $derived(dry.filter((a) => restingBy.has(a.id)));
  /**
   * One tap waters every plant on the dry line, dated today, as a place's "Water all" does. The line stays where it was,
   * saying what was done, with its own Undo in the line: the toast's Undo sat where the next tap landed, and the line
   * that vanished moved the page under the finger (round fifty-eight; as the Today tab's stops do since round fifty-five).
   */
  let watering = $state(false);
  let undoing = $state(false);
  const HOME = 'home';
  const done = $derived(wateredHere.get(HOME));
  let lineHeight = 0;
  async function waterDry(e: MouseEvent) {
    if (watering || !sheetsSettled) return; // one tap, one set of lines (round fifty-two, 3); the button says aria-disabled meanwhile, keeping focus (round sixty)
    watering = true;
    try {
      lineHeight = (e.currentTarget as HTMLElement).closest('.line')?.getBoundingClientRect().height ?? 0;
      const plants = [...toWater];
      const ids = await collection.addEventsIds(plants.map((a) => ({ acc: a.id, d: localDate(), t: 'water' as const, note: 'from Today: every plant on the not-watered line' })));
      wateredHere.add(HOME, ids, plants.map((a) => ({ id: a.id, no: accNo(a), name: plantLabel(a) })), lineHeight);
      toast.show(`Watered ${ids.length}.`);
    } finally {
      watering = false;
    }
  }
  /** The line's Undo: the entry is let go only once the lines are gone, so a failed Undo can be tried again. */
  async function undoDry() {
    const w = wateredHere.get(HOME);
    if (!w || undoing) return;
    undoing = true;
    try {
      await collection.removeEvents(w.ids);
      wateredHere.take(HOME);
      toast.show(`Undone: ${w.ids.length} watering line${w.ids.length === 1 ? '' : 's'} removed.`);
      // The Undo went with the done line: focus goes to the Water button that is back in its place, else to the line's link (round fifty-nine).
      await tick();
      // Each in turn: one querySelector over the list took the first in page order, whichever it was (round sixty; the outside review's A35).
      for (const sel of ['.today .waterbtn', '.today .withact.warn > a']) { const to = document.querySelector<HTMLElement>(sel); if (to) { to.focus(); break; } }
    } catch (err) {
      toast.show(`Not undone: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    } finally {
      undoing = false;
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
  const unseen = $derived(growing.filter((a) => collection.unseenWhy(a.id)));
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
    if (overdue) parts.push(`${overdue} of ${growing.length} plants past their watering rhythm`);
    if (unknown.length) parts.push(`${unknown.length}${overdue ? '' : ` of ${growing.length}`} with no watering recorded yet, ${unknown.length === 1 ? 'its record' : 'their records'} as old as the rhythm or more`);
    // Worded by the rule that applied: a fog-belt habitat has no rainy season to be outside of (round fifty-nine).
    const rules = new Set(restingBy.values());
    // Never "dry season" or "rest" for the temperature rule, which reads a year of under 120 mm by its cooler months (round sixty; the words review).
    const its = resting.length === 1 ? 'its' : 'their';
    const cool = `in ${its} habitat's warmer six months (a year of under ${ruleRain(120, units.current)} of rain, read by temperature)`;
    const rain = `in ${its} habitat's dry season`;
    const where = rules.size === 2 ? `${rain} or ${cool}` : rules.has('cool') ? cool : rain;
    // The sheets did not answer: said, so no line reads as "none of them resting" (round sixty-two; rule 2).
    const unread = sheetsFailed && !resting.length && dry.some((a) => kindOf(a) === 'species') ? '; resting months not checked: the species sheets did not answer' : '';
    return parts.join(', and ') + (resting.length ? `; ${resting.length === dry.length ? (dry.length === 1 ? 'it is' : 'all of them are') : `${resting.length} of them ${resting.length === 1 ? 'is' : 'are'}`} ${where}` : '') + unread + '.';
  });
  type Line = { href: string; tone: string; text: string; water?: boolean; keeping?: boolean };
  const lines = $derived(
    ([
      frostLine && where === 'home' ? { href: '/today#frost', tone: frostLine.tone, text: frostLine.text } : null,
      (dry.length || done) && where === 'home' ? { href: '/today#water', tone: 'warn', text: dry.length ? dryText : '', water: true } : null,
      unseen.length ? { href: '/places', tone: 'warn', text: `${unseen.length} plant${unseen.length === 1 ? '' : 's'} missed at the last audit or not seen for ninety days${unseen.length <= 3 ? ': ' + unseen.map(accNo).join(', ') : ''}.` } : null,
      sowings.length ? { href: '/propagation', tone: 'ok', text: `${sowings.length} propagation batch${sowings.length === 1 ? '' : 'es'} in the tray, the oldest ${sowNo(sowings[0])} (${plantLabel(sowings[0])}) ${PROP_METHODS.find((x) => x.k === sowings[0].method)?.veg ? 'started' : 'sown'} ${sowings[0].sown}.` } : null,
      unphotographed.length && growing.length ? { href: '/plants?show=nophoto', tone: 'muted', text: `${unphotographed.length} of ${growing.length} plants without a photograph in the last twelve months${unphotographed.length <= 3 ? ': ' + unphotographed.map(accNo).join(', ') : ''}.` } : null,
      keeping && !prefs.hideKeeping ? { href: sync.configured ? '/sync' : '/backup', tone: keeping.tone, text: keeping.text, keeping: true } : null
    ] as Array<Line | null>).filter((x): x is Line => !!x)
  );
</script>

{#if lines.length}
  <!-- A region named Today on the front page; on /today it sits under the page's own "Also today" heading, where a second
       region called Today was announced inside it (round sixty-three; the screen-reader reading, U4). -->
  <div class="today" role={where === 'home' ? 'region' : undefined} aria-label={where === 'home' ? 'Today' : undefined} data-sveltekit-preload-data="off">
    {#each lines as l (l.href)}
      {#if l.water}
        <div class="line {l.tone} withact" class:doneline={!!done} style:min-height={done?.height ? `${done.height}px` : undefined}>
          {#if done}
            <span class="donetext">Watered {done.ids.length} just now{#if l.text}; still: <a href={l.href}>{l.text}</a>{/if}</span><button class="btn small" type="button" onclick={undoDry} aria-disabled={undoing}>Undo</button>
          {:else}
            <!-- One plant to water is named by its number, and to a screen reader by its name too: "Water this one" after "3 of 3 plants past their rhythm; 2 of them resting" did not say which (round sixty-two; the verification review's grower, smaller). -->
            <a href={l.href}>{l.text}</a>{#if toWater.length}<!-- While it waits, the reason is said beside it, not only on hover (round sixty-one; the accessibility review, 13). -->{#if !sheetsSettled}<span class="small muted waitwhy" id="today-water-why">Reading the species sheets first…</span>{/if}<button class="btn small waterbtn" type="button" onclick={waterDry} aria-disabled={watering || !sheetsSettled} aria-describedby={!sheetsSettled ? 'today-water-why' : undefined} title="One watering line on each, dated today, leaving out the plants listed as resting by their habitat's seasons; Undo takes them back" aria-label={toWater.length === 1 ? `Water ${accNo(toWater[0])} ${plantLabel(toWater[0])}` : undefined}>{toWater.length === 1 ? `Water ${accNo(toWater[0])}` : `Water these ${toWater.length}`}</button>{/if}
          {/if}
        </div>
      {:else if l.keeping}
        <div class="line {l.tone} withact"><a href={l.href}>{l.text}</a><button class="btn small" type="button" onclick={() => (prefs.hideKeeping = true)} title="Hide this line; Settings brings it back">Hide</button></div>
      {:else}
        <a class="line {l.tone}" href={l.href}>{l.text}</a>
      {/if}
    {/each}
    {#if !hasSite && where === 'home'}<span class="small muted">Frost watch needs a site: <button class="linkish" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'use my location'}</button> or <a href="/settings#site">set one in Settings</a>.{#if locateMsg}{' '}{locateMsg}{/if}</span>{/if}
  </div>
{:else if collection.ready && !hasSite && growing.length && where === 'home'}
  <p class="small muted todaynote">Frost watch needs a site: <button class="linkish" type="button" onclick={locate} disabled={locating}>{locating ? 'Locating…' : 'use my location'}</button> or <a href="/settings#site">set one in Settings</a>, and the forecast shows here when it turns.{#if locateMsg}{' '}{locateMsg}{/if}</p>
{/if}

<style>
  .today { display: flex; flex-direction: column; margin: 12px 0 4px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .line { display: block; padding: 10px 14px; font-size: var(--fs-md); color: var(--ink); border-left: 3px solid var(--rule); border-top: 1px solid var(--rule); }
  .line:first-child { border-top: 0; }
  .withact { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .withact a { color: inherit; flex: 1; min-width: 0; min-height: var(--tap); display: flex; align-items: center; }
  .withact a:hover { text-decoration: underline; }
  .withact .btn { flex: none; min-height: var(--tap); }
  .line:hover { text-decoration: none; background: var(--sunk); }
  .today > .small { padding: 8px 14px; border-top: 1px solid var(--rule); }
  .line.bad { border-left-color: var(--bad); }
  .line.warn { border-left-color: var(--warn, #b8692a); }
  .line.ok { border-left-color: var(--accent); }
  .line.doneline { border-left-color: var(--accent); }
  .donetext { flex: 1; min-width: 0; }
  .waitwhy { flex: none; font-size: var(--fs-sm); }
  .donetext a { color: inherit; text-decoration: underline; }
  .muted { color: var(--ink3); }
  .todaynote { margin: 8px 0 0; }
  .linkish { background: none; border: 0; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; }
  /* Tighter on a phone: the lines are a glance before the grower's own plants, not the page (round fifty, 4). */
  @media (max-width: 640px) {
    .today { margin: 8px 0 2px; }
    .line { padding: 8px 12px; font-size: var(--fs-md); line-height: 1.4; }
    .today > .small { padding: 6px 12px; font-size: var(--fs-sm); }
    .withact .btn { min-height: var(--tap); padding: 4px 12px; font-size: var(--fs-md); }
  }
</style>

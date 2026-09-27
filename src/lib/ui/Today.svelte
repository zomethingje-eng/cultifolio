<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { localDateYearAgo, daysBetween } from '$core/dates';
  import { site } from '$lib/ui/site.svelte';
  import { tempUnit, rainUnit, tempN, rainN } from '$core/units';
  /**
   * What needs you, on the front page of a grower's collection: the frost watch when a site is remembered and the
   * forecast turns, sowings still in the tray, plants not photographed in a year. Each line is a link, and a line
   * that has nothing to say is not shown; a forecast that did not answer says so rather than nothing.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import { onMount } from 'svelte';
  import { getForecast, forecastRefusal } from '$lib/weather/client';
  type Risk = { level: string; text: string };
  let frost = $state<{ risk: Risk } | { unchecked: string } | null>(null);
  let hasSite = $state(false);
  onMount(async () => {
    site.load();
    const s = site.current;
    if (!s) return;
    hasSite = true;
    try {
      const r = await getForecast<{ risk: Risk }>(s.lat, s.lon, units.current);
      frost = r.ok ? { risk: r.body.risk } : { unchecked: forecastRefusal(r.status, 'Frost') };
    } catch {
      frost = { unchecked: forecastRefusal(null, 'Frost') };
    }
  });
  const today = new Date();
  const yearAgo = localDateYearAgo(today);
  const sowings = $derived(collection.ready ? collection.sowings.filter((s) => s.status === 'active').sort((a, b) => a.sown.localeCompare(b.sown) || a.id.localeCompare(b.id)) : []); // two batches sown the same day: the one made first is the older (round twenty-five, 16)
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  const unphotographed = $derived(growing.filter((a) => !collection.photos(a.id).some((p) => p.d >= yearAgo)));
  // The two facts the plants list and the place pages already flag, said once here: not watered for three weeks (by the
  // log, from the day the record was made when nothing is logged), and missed at the last audit or not seen for ninety
  // days. Facts from the log, not a schedule (round twenty-four, 11).
  const dry = $derived(collection.ready ? collection.due : []); // the collection's own figure, shared with the plants list (round twenty-five, R1-1)
  const unseen = $derived(growing.filter((a) => { if (collection.missedAt(a.id)) return true; const s = collection.lastSeen(a.id); return s != null && daysBetween(s) > 90; }));
  const frostLine = $derived(frost && 'unchecked' in frost ? { tone: 'warn', text: frost.unchecked } : frost && frost.risk.level !== 'none' ? { tone: 'bad', text: frost.risk.text } : null); // the sentence names its level itself ("Frost forecast: …"), so the level is not said twice (round twenty-five, 16)
  const lines = $derived(
    [
      frostLine ? { href: '/frost', tone: frostLine.tone, text: frostLine.text } : null,
      dry.length ? { href: '/plants?show=due', tone: 'warn', text: `${dry.length} of ${growing.length} plants not watered, or not recorded as watered, for three weeks or more.` } : null,
      unseen.length ? { href: '/places', tone: 'warn', text: `${unseen.length} plant${unseen.length === 1 ? '' : 's'} missed at the last audit or not seen for ninety days${unseen.length <= 3 ? ': ' + unseen.map(accNo).join(', ') : ''}.` } : null,
      sowings.length ? { href: '/propagation', tone: 'ok', text: `${sowings.length} propagation batch${sowings.length === 1 ? '' : 'es'} in the tray, the oldest ${sowNo(sowings[0])} (${sowings[0].taxonName}) sown ${sowings[0].sown}.` } : null,
      unphotographed.length && growing.length ? { href: '/plants?show=nophoto', tone: 'muted', text: `${unphotographed.length} of ${growing.length} plants without a photograph in the last twelve months${unphotographed.length <= 3 ? ': ' + unphotographed.map(accNo).join(', ') : ''}.` } : null
    ].filter((x): x is { href: string; tone: string; text: string } => !!x)
  );
</script>

{#if lines.length}
  <div class="today" aria-label="Today" data-sveltekit-preload-data="off">
    {#each lines as l (l.href)}<a class="line {l.tone}" href={l.href}>{l.text}</a>{/each}
    {#if !hasSite}<span class="small muted">Frost watch needs a site: <a href="/settings#site">set one in Settings</a>.</span>{/if}
  </div>
{:else if collection.ready && !hasSite && growing.length}
  <p class="small muted todaynote">Frost watch needs a site: <a href="/settings#site">set one in Settings</a>, and the forecast shows here when it turns.</p>
{/if}

<style>
  .today { display: flex; flex-direction: column; margin: 12px 0 4px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .line { display: block; padding: 10px 14px; font-size: 13.5px; color: var(--ink); border-left: 3px solid var(--rule); border-top: 1px solid var(--rule); }
  .line:first-child { border-top: 0; }
  .line:hover { text-decoration: none; background: var(--sunk); }
  .today > .small { padding: 8px 14px; border-top: 1px solid var(--rule); }
  .line.bad { border-left-color: var(--bad); }
  .line.warn { border-left-color: var(--warn, #b8692a); }
  .line.ok { border-left-color: var(--accent); }
  .muted { color: var(--ink3); }
  .todaynote { margin: 8px 0 0; }
</style>

<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { localDate, localDateYearAgo } from '$core/dates';
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
  import { getForecast } from '$lib/weather/client';
  type Risk = { level: string; text: string };
  let frost = $state<{ risk: Risk } | 'unchecked' | null>(null);
  let hasSite = $state(false);
  onMount(async () => {
    site.load();
    const s = site.current;
    if (!s) return;
    hasSite = true;
    try {
      const r = await getForecast<{ risk: Risk }>(s.lat, s.lon, units.current);
      frost = r.ok ? { risk: r.body.risk } : 'unchecked';
    } catch {
      frost = 'unchecked';
    }
  });
  const today = new Date();
  const yearAgo = localDateYearAgo(today);
  const sowings = $derived(collection.ready ? collection.sowings.filter((s) => s.status === 'active').sort((a, b) => a.sown.localeCompare(b.sown)) : []);
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  const unphotographed = $derived(growing.filter((a) => !collection.photos(a.id).some((p) => p.d >= yearAgo)));
  const frostLine = $derived(frost === 'unchecked' ? { tone: 'warn', text: 'Frost not checked: the forecast source did not answer.' } : frost && frost.risk.level !== 'none' ? { tone: 'bad', text: `${frost.risk.level}: ${frost.risk.text}` } : null);
  const lines = $derived(
    [
      frostLine ? { href: '/frost', tone: frostLine.tone, text: frostLine.text } : null,
      sowings.length ? { href: '/sowings', tone: 'ok', text: `${sowings.length} sowing${sowings.length === 1 ? '' : 's'} in the tray, the oldest ${sowNo(sowings[0])} (${sowings[0].taxonName}) sown ${sowings[0].sown}.` } : null,
      unphotographed.length && growing.length ? { href: '/plants?show=nophoto', tone: 'muted', text: `${unphotographed.length} of ${growing.length} plants without a photograph this year${unphotographed.length <= 3 ? ': ' + unphotographed.map(accNo).join(', ') : ''}.` } : null
    ].filter((x): x is { href: string; tone: string; text: string } => !!x)
  );
</script>

{#if lines.length}
  <div class="today" aria-label="Today">
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

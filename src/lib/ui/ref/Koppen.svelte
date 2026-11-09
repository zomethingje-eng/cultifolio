<script lang="ts">
  /**
   * The habitat's Köppen–Geiger class (round eighty-seven, derived agent; `$dossier/koppen`): the class, each letter's
   * meaning and the test of Peel and others (2007) that gave it, in the median year's figures. And the Walter–Lieth reading
   * of the same year (`$climate/walter-lieth`): the months whose rain in millimetres is under twice the mean temperature.
   * Figures in °C and mm, the units the thresholds are written in. Shown only on a page with a habitat climate.
   */
  import { koppenReasons, KOPPEN_CITED, KOPPEN_DOI, type KoppenFigures } from '$dossier/koppen';
  import { walterLieth, monthRuns } from '$climate/walter-lieth';
  // `src`: the months' own source as the climate section names it (round eighty-seven, the integration; rule 1).
  let { koppen, months, cells = 0, src = null }: { koppen: KoppenFigures | null | undefined; months: ReadonlyArray<{ tmean: number; precipMm: number }> | null | undefined; cells?: number; src?: string | null } = $props();
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const reasons = $derived(koppen ? koppenReasons(koppen) : []);
  const wl = $derived(walterLieth(months));
  const runs = $derived(wl ? monthRuns(wl.arid) : []);
  const runWords = (r: [number, number]) => (r[0] === r[1] ? MONTH[r[0]] : r[0] === 0 && r[1] === 11 ? 'every month' : `${MONTH[r[0]]} to ${MONTH[r[1]]}`);
  const minus = (s: string) => s.replace(/(^|[\s(])-(?=\d)/g, '$1−');
</script>

{#if months?.length === 12}
  <section class="kop" aria-labelledby="kop-t" id="climate-class">
    <h2 id="kop-t">Climate class</h2>
    {#if koppen?.cls}
      <p class="cls"><b>{koppen.cls}</b> <span>Köppen–Geiger, worked out from the median year of the range&rsquo;s {cells > 1 ? `${cells} cells` : 'one cell'}</span></p>
      <table>
        <tbody>
          {#each reasons as [l, m, test] (l)}
            <tr><th scope="row"><b>{l}</b> {m}</th><td>{minus(test)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="note">By the thresholds of <a href={KOPPEN_DOI}>{KOPPEN_CITED}</a>; summer is the warmer of October to March and April to September. The class of the median year, each month&rsquo;s median across the cells, not of each cell.</p>
    {:else if koppen?.why}
      <p class="note">No Köppen–Geiger class: {koppen.why}.</p>
    {:else}
      <p class="note">No Köppen–Geiger class is worked out for this page yet: its record was written before the class was.</p>
    {/if}
    {#if wl}
      <p class="wl">Walter–Lieth: {#if runs.length}arid in {runs.map(runWords).join(' and ')}, where the month&rsquo;s rain in mm is under twice its mean temperature in °C ({minus(wl.arid.slice(0, 1).map((i) => `${MONTH[i]} ${wl.months[i].p} mm against 2 × ${(wl.months[i].twoT / 2).toFixed(1)} = ${wl.months[i].twoT.toFixed(1)}`).join(''))}){:else}no arid month: every month&rsquo;s rain in mm is at least twice its mean temperature in °C{/if}. The scale of Walter and Lieth&rsquo;s climate diagrams (1960–1967), 10 °C to 20 mm.</p>
    {/if}
    {#if src}<p class="note" id="climate-class-src">The months read: {src}.</p>{/if}
  </section>
{/if}

<style>
  .kop { margin: 28px 0 0; }
  h2 { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut); }
  .cls { margin: 0 0 4px; font-size: var(--fs-base); }
  .cls b { font-size: var(--fs-xl); font-weight: 600; margin-right: 6px; }
  .cls span { color: var(--ink2); font-size: var(--fs-ui); }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-ui); }
  tr { border-bottom: 1px solid var(--rule2); }
  th { padding: 6px 0; width: 190px; text-align: left; font-weight: 400; vertical-align: top; }
  td { padding: 6px 0 6px 24px; color: var(--ink2); vertical-align: top; font-variant-numeric: tabular-nums lining-nums; }
  .note, .wl { margin: 6px 0 0; font-size: var(--fs-head); color: var(--mut); }
  @media (max-width: 640px) {
    table, tbody, tr, th, td { display: block; width: auto; }
    tr { padding: 5px 0; }
    th, td { padding: 0; }
    td { padding-top: 2px; }
  }
</style>

<script lang="ts">
  /**
   * "On <space>, against its habitat" (round 130; MYPLANTS 31, item 5): SPECIES 20's lens for this plant's space, on the
   * plant's page, open. The space's kind chooses the view, as on the species page (`$climate/lens-spaces`); its own or
   * inherited temperature and light are set against the habitat's figures, a small chart beside, then the fixed closing
   * line and the species page. A missing input is its prompt, never a figure. Nothing leaves the device: the habitat's
   * figures are the species page's, already read for this page, and the space's are the collection's.
   */
  import { tempN, tempUnit, type Units } from '$core/units';
  import { viewOfPath, greenhouseLines, windowsillLines, lightsLines, molADay, type SpaceLine } from '$climate/lens-spaces';
  import { CLOSING } from '$climate/lens-outdoors';
  import { dayLengths } from '$climate/day-length';
  type M = { tmax: number; tmin: number; dli?: number };
  let { months, floorC, lat, space, units, speciesHref }: {
    months: M[]; floorC: number | null; lat: number | null;
    space: { id: string; name: string; kinds: Array<string | null>; floorC: number | null; floorHeld: boolean; ppfd: number | null; lightHours: number | null };
    units: Units; speciesHref: string;
  } = $props();

  const fmtT = (c: number) => `${tempN(c, units, 1)} ${tempUnit(units)}`;
  const fmtD = (c: number) => `${units === 'us' ? (c * 1.8).toFixed(1) : c.toFixed(1)} ${tempUnit(units)}`;
  const lamp = $derived(space.ppfd != null && space.lightHours != null ? space.lightHours : null);
  /** Its view by its kind; a space of no kind is read by what it sets: a temperature as under glass, a light as a sill. */
  const view = $derived(viewOfPath(space.kinds, lamp) ?? (space.floorC != null ? 'greenhouse' : 'windowsill'));
  const lines = $derived.by((): SpaceLine[] => {
    const f = { temp: fmtT, dtemp: fmtD };
    if (view === 'lights') return lightsLines({ ppfd: space.ppfd, hours: space.lightHours, habitat: months, days: dayLengths(lat ?? 0), ...f }).filter((l) => l.k === 'lamp');
    if (view === 'windowsill') return windowsillLines({ ppfd: space.ppfd, hours: space.lightHours, nightC: space.floorC, habitat: months, ...f });
    // Greenhouse, and Outdoors: what the space is set to hold or bottom out at, against the floor and the coolest nights.
    return space.floorC != null ? greenhouseLines({ heldC: space.floorC, held: space.floorHeld, floorC, habitat: months, ...f }) : [];
  });
  const ask = $derived(
    view === 'windowsill' || view === 'lights'
      ? (space.ppfd == null || space.lightHours == null ? { what: 'Set its light', why: 'and its hours, in µmol/m²/s or lux, to compare its light' } : null)
      : space.floorC == null ? { what: 'Set its temperature', why: 'the coldest it gets or the heater holds, to compare it' } : null
  );
  const askNight = $derived(view === 'windowsill' && space.floorC == null && !ask ? { what: 'Set its coldest temperature', why: 'to compare its winter night' } : null);

  // The small chart: the habitat's days and nights through its year, and the space's own temperature or light across it.
  const W = 260, H = 70, P = 4;
  const nights = $derived(months.map((m) => m.tmin)), days = $derived(months.map((m) => m.tmax));
  const own = $derived(view === 'windowsill' || view === 'lights' ? null : space.floorC);
  const mol = $derived(space.ppfd != null && space.lightHours != null ? molADay(space.ppfd, space.lightHours) : null);
  const dli = $derived(months.every((m) => m.dli != null) ? months.map((m) => m.dli!) : null);
  const series = $derived(own != null || !dli ? { a: days, b: nights, line: own, unit: tempUnit(units) } : { a: dli, b: null as number[] | null, line: mol, unit: 'mol a day' });
  const lo = $derived(Math.min(...series.a, ...(series.b ?? []), ...(series.line != null ? [series.line] : [])));
  const hi = $derived(Math.max(...series.a, ...(series.b ?? []), ...(series.line != null ? [series.line] : [])));
  const yy = (v: number) => P + ((hi - v) / (hi - lo || 1)) * (H - 2 * P);
  const xx = (k: number) => P + (k * (W - 2 * P)) / 11;
  const path = (v: number[]) => v.map((y, k) => `${k ? 'L' : 'M'}${xx(k).toFixed(1)},${yy(y).toFixed(1)}`).join('');
</script>

<section class="cmpcard" id="compare-card" aria-labelledby="compare-card-h">
  <div class="secrule"><h2 id="compare-card-h">On {space.name}, against its habitat</h2><div class="line"></div></div>
  <div class="cmpbody">
    <svg viewBox="0 0 {W} {H}" class="cmpchart" aria-hidden="true">
      <path d={path(series.a)} class="ca" />
      {#if series.b}<path d={path(series.b)} class="cb" />{/if}
      {#if series.line != null}<line x1={P} x2={W - P} y1={yy(series.line)} y2={yy(series.line)} class="cl" />{/if}
    </svg>
    <div class="cmptext">
      {#each lines as l (l.k)}<p id="cmp-{l.k}">{l.text}</p>{/each}
      {#if ask}<p id="cmp-ask"><a class="tap" href="/places/{space.id}?edit=1">{ask.what}</a> {ask.why}.</p>{/if}
      {#if askNight}<p id="cmp-ask-night"><a class="tap" href="/places/{space.id}?edit=1">{askNight.what}</a> {askNight.why}.</p>{/if}
      <p class="small muted">{CLOSING} <a href="/species/{speciesHref}#year-panel">The species page</a> compares it month by month.</p>
    </div>
  </div>
</section>

<style>
  .cmpcard { margin: 18px 0 6px; }
  .cmpbody { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
  .cmpchart { width: 260px; max-width: 100%; height: auto; flex: none; }
  .cmptext { flex: 1 1 220px; min-width: 0; }
  .cmptext p { margin: 0 0 6px; }
  .ca { fill: none; stroke: var(--ink2); stroke-width: 1.6; }
  .cb { fill: none; stroke: var(--ink2); stroke-width: 1.6; stroke-dasharray: 4 3; }
  .cl { stroke: var(--ink); stroke-width: 2; }
</style>

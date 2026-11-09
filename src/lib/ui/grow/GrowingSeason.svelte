<script lang="ts">
  /**
   * A plant's growing season on its page (round eighty-seven, t3; plan F7): what is set, or what the species page's
   * reading of the habitat suggests, said as a suggestion with the rule that made it. Nothing is written until the grower
   * confirms the suggestion or sets a season of their own; until then the plant is watered by its space's rules, and
   * Today lists a species in its habitat's dry season apart, as before. Once set, Today does not count the plant as due in
   * its rest months, and says it is resting and why.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { seasonOf, suggestSeason, seasonWords, ruleWords, type Season, type SeasonFrom } from '$core/season';
  import { runs, type Year } from '$core/sheet';
  import type { Accession } from '$lib/db/types';
  import { toast } from '$lib/ui/toast.svelte';

  /** `year`: the species page's reading of the habitat (`growingYear`), null when there is none; `readerLat`: where the months are read for; `why`: why there is no reading, when there is none (for the sentence). */
  let { plant, year, readerLat, why = null }: { plant: Accession; year: Year | null; readerLat: number | null; why?: string | null } = $props();
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const set = $derived(seasonOf(plant));
  const suggestion = $derived(suggestSeason(year, readerLat));
  let editing = $state(false);
  let busy = $state(false);
  let f = $state<{ season: Season; rest: number[] }>({ season: 'winter', rest: [] });
  /** The three months of the reader's summer or winter, for a season set with no suggestion to start from: a starting point the form shows, not a reading. */
  const quarter = (s: Season) => ((readerLat ?? 40) < 0) === (s === 'winter') ? [12, 1, 2] : [6, 7, 8];
  function open() {
    if (set) f = { season: set.season, rest: [...set.rest] };
    else if (suggestion) f = { season: suggestion.season, rest: [...suggestion.rest] };
    else f = { season: 'winter', rest: quarter('winter') };
    editing = true;
  }
  function pick(s: Season) {
    f.season = s;
    if (s === 'none') return;
    f.rest = suggestion && suggestion.season === s ? [...suggestion.rest] : quarter(s);
  }
  async function write(season: Season | null, rest: number[], from: SeasonFrom | null) {
    if (busy) return;
    busy = true;
    try {
      await collection.put('accession', plant.id, { season, restMonths: season && season !== 'none' ? [...rest].sort((a, b) => a - b) : null, seasonFrom: from });
      editing = false;
      toast.show(season ? 'Growing season saved.' : 'Growing season cleared; the plant follows its space.');
    } catch (e) {
      toast.show(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy = false;
    }
  }
  const confirm = () => suggestion && write(suggestion.season, suggestion.rest, suggestion.rule);
  /** The form's own: the suggestion's rule only when what is saved is the suggestion as it was read. */
  function save() {
    if (f.season !== 'none' && (!f.rest.length || f.rest.length >= 12)) return;
    const same = suggestion && suggestion.season === f.season && suggestion.rest.join() === [...f.rest].sort((a, b) => a - b).join();
    void write(f.season, f.rest, same ? suggestion!.rule : 'grower');
  }
  const restBad = $derived(f.season !== 'none' && (!f.rest.length || f.rest.length >= 12));
  const fromWords = (p: { from: SeasonFrom }) => (p.from === 'rain' ? "confirmed by you from its species page's rain rule" : p.from === 'cool' ? "confirmed by you from its species page's temperature rule" : p.from === 'spread' ? "confirmed by you from its species page's spread rain" : 'set by you');
</script>

<div class="season" id="growing-season">
  <div class="secrule"><h2>Growing season</h2><div class="line"></div></div>
  {#if !editing}
    {#if set}
      <p id="season-set"><b>{seasonWords(set.season).replace(/^a /, 'A ').replace(/^no rest/, 'No rest')}</b>{#if set.season !== 'none'}, resting {set.rest.length ? runs(set.rest) : 'in no month'}{/if}; {fromWords(set)}. {#if set.season !== 'none'}Today does not count it as due in those months, and says it is resting.{:else}Today counts it as due by its rhythm all year, outside any months its space is kept dry.{/if} <button class="linkish" type="button" id="season-change" onclick={open}>Change</button></p>
    {:else if suggestion}
      <p id="season-suggested"><b>Suggested: {seasonWords(suggestion.season)}</b>{#if suggestion.rest.length}, resting {runs(suggestion.rest)}{/if}, {ruleWords(suggestion)}.</p>
      <p class="small muted">A suggestion read from the habitat's rain and temperature, not from this plant: nothing changes until you confirm it. Confirmed, Today does not count it as due in its rest months.</p>
      <p class="acts"><button class="btn small" type="button" id="season-confirm" onclick={confirm} aria-disabled={busy}>Confirm</button> <button class="btn small" type="button" id="season-other" onclick={open}>Set another</button></p>
    {:else}
      <p id="season-none">No growing season set{why ? `: ${why}` : ''}. It is watered by its space's rhythm and dry months. <button class="linkish" type="button" id="season-open" onclick={open}>Set one</button></p>
    {/if}
  {:else}
    <form class="seasonform" onsubmit={(e) => { e.preventDefault(); save(); }}>
      <fieldset class="kinds"><legend>It grows</legend>
        <label><input type="radio" name="season" checked={f.season === 'winter'} onchange={() => pick('winter')} /> In winter (a winter-grower)</label>
        <label><input type="radio" name="season" checked={f.season === 'summer'} onchange={() => pick('summer')} /> In summer (a summer-grower)</label>
        <label><input type="radio" name="season" checked={f.season === 'none'} onchange={() => pick('none')} /> All year, no rest</label>
      </fieldset>
      {#if f.season !== 'none'}
        <fieldset class="months"><legend>Rests in</legend>
          {#each MON as m, i (i)}<label class="mo"><input type="checkbox" checked={f.rest.includes(i + 1)} onchange={(e) => { const on = e.currentTarget.checked; f.rest = on ? [...new Set([...f.rest, i + 1])] : f.rest.filter((x) => x !== i + 1); }} />{m}</label>{/each}
        </fieldset>
        {#if restBad}<p class="small bad" id="season-bad">Tick from one to eleven months.</p>{/if}
      {/if}
      <p class="acts"><button class="btn pri small" type="submit" id="season-save" aria-disabled={busy || restBad}>Save</button> <button class="btn small" type="button" onclick={() => (editing = false)}>Cancel</button>{#if set}{' '}<button class="linkish" type="button" id="season-clear" onclick={() => write(null, [], null)}>Clear it, follow its space</button>{/if}</p>
    </form>
  {/if}
</div>

<style>
  .season p { margin: 6px 0 0; font-size: var(--fs-md); line-height: 1.5; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .acts .btn { min-height: var(--tap); }
  .linkish { background: none; border: 0; padding: 0; color: var(--link, var(--accent)); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  .muted { color: var(--ink3); }
  .bad { color: var(--bad); }
  fieldset { border: 0; padding: 0; margin: 8px 0 0; }
  legend { font-size: var(--fs-sm); font-weight: 600; color: var(--ink2); padding: 0; }
  .kinds label { display: flex; align-items: center; gap: 8px; min-height: var(--tap); font-size: var(--fs-md); }
  .months { display: flex; flex-wrap: wrap; gap: 0 4px; }
  .months legend { width: 100%; }
  .mo { display: inline-flex; align-items: center; gap: 4px; min-height: var(--tap); min-width: 4.2em; font-size: var(--fs-md); }
</style>

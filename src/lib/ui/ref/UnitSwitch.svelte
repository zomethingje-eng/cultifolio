<script lang="ts">
  /**
   * The °C | °F switch of a species page (from the glance row's head, `Glance.svelte`, where it stood until round 106; in
   * the Climate section's head since). Both units shown, the current one marked: a lone "°F" beside a figure in °C read as
   * a contradiction (round sixty; visitor 13). It works by script, so it is hidden, not removed, until the app is drawn:
   * with scripts off it stood pressed and did nothing (round eighty-four; A13).
   */
  import { units } from '$lib/ui/units.svelte';
  const u = $derived(units.current);
</script>

<div class="useg" role="group" aria-label="Units">
  <button type="button" class:on={u !== 'us'} aria-pressed={u !== 'us'} aria-label="°C, Celsius and millimetres" onclick={() => units.set('metric')}>°C</button><span aria-hidden="true">|</span><button type="button" class:on={u === 'us'} aria-pressed={u === 'us'} aria-label="°F, Fahrenheit and inches" onclick={() => units.set('us')}>°F</button>
</div>

<style>
  :global(html:not([data-ready])) .useg { visibility: hidden; }
  /* The look's segmented control (the review of stage 2's pages, 8): a 3:1 edge, the paper, a thin rule between its two
     halves, the chosen half ink on paper turned round. */
  .useg { display: inline-flex; align-items: center; gap: 0; border: 1px solid var(--edge); border-radius: var(--r); overflow: hidden; background: var(--bg); color: var(--ink3); }
  .useg button { min-width: var(--tap); min-height: var(--tap); padding: 0 10px; border: 0; background: none; color: var(--ink2); font-family: var(--ui); font-size: var(--fs-sm); font-weight: 400; cursor: pointer; }
  .useg button.on { background: var(--ink); color: var(--bg); font-weight: 600; }
  .useg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
  .useg > span { align-self: stretch; width: 1px; background: var(--rule); font-size: 0; color: transparent; }
  @media (forced-colors: active) { .useg button.on { forced-color-adjust: none; background: Highlight; color: HighlightText; } }
</style>

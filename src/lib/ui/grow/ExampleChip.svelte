<script lang="ts">
  /**
   * "Example" in the top bar while the page shows the example collection (round sixty-nine; triage-68 X8; R46-26). The
   * bar under the top bar scrolls away, and a scrolled plant page offered "the original stays in your camera roll" and
   * "every plant of this species you own", with nothing on screen saying whose plants they were. The top bar stays.
   *
   * Drawn from the server on every page and shown by `html[data-demo]`, which app.html sets before the first paint, as
   * the bar is (`DemoBar`): set after hydration it would move the crumb sideways. No script of its own, so the root
   * layout carries nothing of the example for it (scripts/check-bundle.mjs). It leads to the bar, which says what the
   * example is and has Leave.
   */
</script>

<a class="examplechip" href="#demobar" id="example-chip" aria-label="Example collection: nothing here is yours or kept">Example</a>

<style>
  .examplechip { flex: none; display: inline-flex; align-items: center; min-height: max(32px, var(--tap)); padding: 0 10px; border: 1px solid var(--accent); border-radius: 999px; color: var(--accent); background: var(--accent-soft, var(--card)); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; white-space: nowrap; }
  .examplechip:hover { text-decoration: none; }
  :global(html:not([data-demo])) .examplechip { display: none; }
  @media print { .examplechip { display: none; } }
</style>

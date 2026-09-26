<script lang="ts">
  /**
   * The one mark for "a source was not asked, or did not answer": a dashed pill reading "not checked", the reason on tap.
   * A refusal is not an absence, and the site says so once, here, instead of in a sentence beside every figure it touches
   * (improvements, 5). `what` names the thing (Climate, Photographs, Alerts); `why` is the reason as a sentence.
   */
  let { what = '', why, inline = false }: { what?: string; why: string; inline?: boolean } = $props();
</script>

<details class="nc" class:inline>
  <summary><span class="tok">{what ? `${what} ` : ''}not checked</span></summary>
  <span class="why">{why} Not asked, or not answered, is not "none": nothing here claims there is none. <a href="/about/how#refusal">Why the site says it this way</a>.</span>
</details>

<style>
  .nc { display: inline-block; font-family: var(--ui); vertical-align: middle; max-width: 100%; }
  .nc summary { list-style: none; cursor: pointer; display: inline-block; border-radius: 999px; }
  .nc summary::-webkit-details-marker { display: none; }
  .nc summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tok { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; padding: 3px 10px; border-radius: 999px; border: 1.5px dashed var(--warm); color: var(--warm); background: transparent; white-space: nowrap; line-height: 1.3; }
  .nc[open] .tok { background: var(--warm-soft); }
  .nc .why { display: block; font-size: 12.5px; font-weight: 400; letter-spacing: 0; color: var(--ink2); margin-top: 5px; max-width: 60ch; line-height: 1.4; white-space: normal; text-align: left; }
  .nc.inline .tok { font-size: 10.5px; padding: 2px 8px; }
</style>

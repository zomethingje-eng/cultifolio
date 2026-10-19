<script lang="ts">
  /**
   * An empty Today, My spaces or Propagation (round sixty-three, V2; opt-in since round seventy-four, the owner's
   * decision: a new visitor starts on the real site, blank). Drawn by the page where its own empty state is, once the
   * collection is open.
   *
   * - The page's own empty state, always (`children`).
   * - Under it, on a device whose own collection is empty and outside the example: one button, "Show the example
   *   collection", which opens it on this same page, and one sentence saying it is a sample kept apart from the grower's
   *   own collection that can be closed. Nothing opens it by itself.
   * - In the example while it is being set out: "Setting out the example collection", not the empty page under it.
   */
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { PAGE_IN_DEMO } from '$lib/db/demo';
  import { example, enterExample, notEnteredWords, offersHere, SHOW_EXAMPLE, EXAMPLE_APART, type NotEntered } from './example.svelte';
  let { children }: { children: Snippet } = $props();
  const demo = PAGE_IN_DEMO; // the page's collection, read as it loaded (round sixty-seven; triage-66 V3)
  /**
   * Whether to offer it waits for the layout to have read both the collection and sync's key (`example.settled`): a
   * device with sync set up is a grower's, and one whose key is not read yet is not known (round sixty-three, the fix
   * pass; R1, 2). Until then the button is not drawn, so it is never drawn and then taken away.
   */
  const offer = $derived(!demo && example.settled && offersHere());
  /** Why the example did not open, said where the button is: never a press answered with nothing (rule 2). */
  let refused = $state<NotEntered | null>(null);
  function show() {
    const r = enterExample(page.url.pathname);
    refused = r === true ? null : r;
  }
</script>

{#if demo && example.seeding}
  <p class="small muted exampleopening" role="status" id="example-opening">Setting out the example collection…</p>
{:else}
  {@render children()}
  {#if !demo && example.entering}
    <!-- the button was pressed and the page is on its way into the example (at an address with the entry's token, whose page sets the tab's flag; round seventy-seven) -->
    <p class="small muted exampleopening exampleoffer" role="status" id="example-opening">Opening the example collection…</p>
  {:else if offer}
    <div class="exampleoffer" id="example-offer">
      <p class="acts"><button class="btn" type="button" id="see-example" onclick={show}>{SHOW_EXAMPLE}</button> <span class="muted small" id="example-apart">{EXAMPLE_APART}</span></p>
      {#if refused}<p class="small" role="status">{notEnteredWords(refused)}</p>{/if}
    </div>
  {/if}
{/if}

<style>
  .exampleoffer { margin: 12px 0 0; }
  .exampleoffer p { margin: 0; }
  .exampleoffer .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .exampleoffer .btn { min-height: var(--tap); white-space: normal; height: auto; max-width: 100%; text-align: start; } /* wraps at 200% text on a 320 px screen */
  .exampleoffer .muted { color: var(--ink3); }
</style>

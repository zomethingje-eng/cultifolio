<script lang="ts">
  /**
   * An empty Today, Places or Propagation (round sixty-three, V2). Drawn by the page where its own empty state was, once
   * the collection is open: never before, so nothing is decided on a collection not yet read, and the empty page is never
   * drawn first.
   *
   * - Outside the example, on a device whose own collection is empty and a tab that has not left the example: the page
   *   goes into the example by itself, on this same page, and says so meanwhile ("Opening the example collection").
   * - The same, but the tab has left the example, or its storage refuses the flag: what the page does for a grower, in a
   *   sentence or two, then "See the example collection" (into it, on this page) and "Add your first plant".
   * - In the example while it is being set out: "Setting out the example collection", not the empty page under it.
   * - Otherwise (a grower with plants elsewhere, or the example emptied by the visitor): the page's own empty state, as before.
   */
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { inDemo } from '$lib/db/demo';
  import { example, entersHere, enterExample, notEnteredWords, ownEmpty, type NotEntered } from './example.svelte';
  let { what, hold = false, children }: { what: 'today' | 'places' | 'propagation'; /** the page asked for something else first (the add form): not entered by itself */ hold?: boolean; children: Snippet } = $props();
  const demo = inDemo();
  /**
   * Decided once, when the layout has read both the collection and sync's key (`example.settled`; the page draws this
   * only once the collection is open, and the key is read a moment later): a device with sync set up is a grower's, and
   * deciding before its key was read took it into the example (round sixty-three, the fix pass; R1, 2). Until then
   * nothing is drawn here, so neither the offer nor the empty page is drawn and then replaced. True from the first frame
   * after, so the offer is never drawn and then replaced; false again if the tab's storage refuses the flag, and the
   * offer stands.
   */
  // svelte-ignore state_referenced_locally
  let decided = $state(example.settled);
  // svelte-ignore state_referenced_locally
  let going = $state(example.settled && !hold && entersHere());
  $effect(() => {
    if (decided || !example.settled) return;
    decided = true;
    going = !hold && entersHere();
  });
  /** Why the example did not open, said where the button is: never a press answered with nothing (rule 2). */
  let refused = $state<NotEntered | null>(null);
  /**
   * Into the example once; a load called off (a "Leave site?" answered Cancel) takes `example.entering` back, and the page
   * then shows the offer rather than ask again (round sixty-three, the fix pass; R1, 1).
   */
  let tried = false;
  $effect(() => {
    if (!going) return;
    if (!tried) {
      if (example.entering) return;
      tried = true;
      if (enterExample(page.url.pathname) !== true) going = false;
      return;
    }
    if (!example.entering) going = false;
  });
  const offer = $derived(!demo && ownEmpty() && !going);
  function see() {
    tried = true;
    const r = enterExample(page.url.pathname);
    going = r === true;
    refused = r === true ? null : r;
  }
  const words = {
    today: 'Today says what needs water, place by place: each plant against its own watering rhythm or its place\'s, with a plant whose species\' habitat is in its dry season now set apart. Under it, the frost watch reads the forecast for your site.',
    places: 'Places are the greenhouses, rooms, benches and windowsills your plants live on, one inside another. Each can keep its own watering rhythm, dry months and lowest temperature, and what is set on a place applies to everything inside it.',
    propagation: 'Propagation keeps each sowing, cutting, offset or division as a batch: how many went in, how many came up and when, and each one potted up becomes a plant with its own number.'
  } as const;
</script>

{#if !decided}
  <!-- the collection is open, sync's key not yet read: a moment, with nothing drawn that is then replaced -->
{:else if going || (demo && example.seeding)}
  <p class="small muted exampleopening" role="status" id="example-opening">{going ? 'Opening the example collection…' : 'Setting out the example collection…'}</p>
{:else if offer}
  <div class="emptybox exampleoffer" id="example-offer">
    <p>{words[what]}</p>
    <p class="acts">
      <button class="btn pri" type="button" id="see-example" onclick={see}>See the example collection</button>
      <a class="btn" href="/plants/new" id="offer-add">Add your first plant</a>
    </p>
    {#if refused}<p class="small" role="status">{notEnteredWords(refused)}</p>{/if}
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .exampleoffer p { margin: 0 0 10px; color: var(--ink2); }
  .exampleoffer .acts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
  .exampleoffer .btn { min-height: var(--tap); white-space: normal; height: auto; } /* wraps at 200% text on a 320 px screen */
</style>

<script lang="ts">
  /**
   * A scanned label from someone else's collection (round sixty; the product review's 8): the plant page found no plant of
   * that identity on this device, and the address carries the species and the printed name in its fragment, which never
   * reached the server. The name is shown as the label printed it, as text; the species page is offered when the
   * reference has it (asked by hash group, as the plants list asks), so the link is never to a page that is not there.
   */
  import { onMount } from 'svelte';
  import { entriesFor } from '$lib/ui/index.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { labelFromHash } from './qr';
  let label = $state<{ slug: string | null; name: string | null }>({ slug: null, name: null });
  let entry = $state<{ name: string; slug: string } | null | 'unreached' | 'none'>(null);
  onMount(() => {
    label = labelFromHash(location.hash);
    const want = label.slug;
    if (!want) return;
    void entriesFor([want]).then((m) => { entry = m === null ? 'unreached' : (m.get(want) ?? 'none'); }, () => (entry = 'unreached'));
  });
</script>

{#if label.slug || label.name}
  <div class="foreign" id="foreign-label">
    <p><b>This label is from someone's collection{label.name ? ':' : '.'}</b>{#if label.name}{' '}<SpeciesName name={label.name} />{/if}</p>
    <p class="muted">Their plant is kept on their own device, not here.</p>
    {#if entry && typeof entry === 'object'}
      <p><a href="/species/{entry.slug}" id="foreign-species">The species page for <SpeciesName name={entry.name} /></a> · <a href="/plants/new?species={encodeURIComponent(entry.name)}">add one to my plants</a></p>
    {:else if entry === 'none'}
      <p>Its species has no page in the reference yet.</p>
    {:else if entry === 'unreached'}
      <p>The reference could not be reached just now to check its species page. <a href="/species/{label.slug}">Try the page</a></p>
    {/if}
  </div>
{/if}

<style>
  .foreign { margin: 12px 0; padding: 12px 14px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); font-size: var(--fs-md); }
  .foreign p { margin: 0; }
  .foreign p + p { margin-top: 6px; }
  .muted { color: var(--ink3); }
</style>

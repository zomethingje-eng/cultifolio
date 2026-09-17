<script lang="ts">
  /** An <img> for one of your own photos, resolved from the vault to an object URL. */
  import { collection } from '$lib/db/collection.svelte';
  let { id, size = 'thumb', alt = '', ...rest }: { id: string; size?: 'thumb' | 'full'; alt?: string; [k: string]: unknown } = $props();
  let src = $state<string | null>(null);
  $effect(() => {
    let live = true;
    src = null;
    collection.photoUrls(id).then((u) => {
      if (live) src = u ? u[size] : null;
    });
    return () => {
      live = false;
    };
  });
</script>

{#if src}<img {src} {alt} {...rest} />{:else}<span class="ph-wait" aria-hidden="true"></span>{/if}

<style>
  .ph-wait { display: block; width: 100%; height: 100%; min-height: 40px; background: var(--rule); }
</style>

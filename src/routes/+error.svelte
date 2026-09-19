<script lang="ts">
  import { page } from '$app/state';
</script>
<div class="err">
  <h1>{page.status}</h1>
  <p class="muted">{page.error?.message ?? 'Something went wrong.'}</p>
  {#if page.status === 404 && page.url.pathname.startsWith('/species/')}
    <p>This species has no dossier yet: the reference is built from a fixed list of names, and this one is not on it. You can still <a href="/plants/new">add it as a plant</a>; its record works without a species page.</p>
  {/if}
</div>
<style>.err{max-width:60ch;padding-block:2rem}</style>

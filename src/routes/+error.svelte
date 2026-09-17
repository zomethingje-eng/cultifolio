<script lang="ts">
  import { page } from '$app/state';
</script>
<div class="err">
  <h1>{page.status}</h1>
  <p class="muted">{page.error?.message ?? 'Something went wrong.'}</p>
  {#if page.status === 404 && page.url.pathname.startsWith('/species/')}
    <p>This species has no dossier yet. <a href="/plants/new">Add it as a plant</a> and one will be prepared.</p>
  {/if}
</div>
<style>.err{max-width:60ch;padding-block:2rem}</style>

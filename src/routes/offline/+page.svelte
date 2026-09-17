<script lang="ts">
  import PageHead from '$lib/ui/PageHead.svelte';
</script>

<svelte:head><title>Offline — Cultifolio</title></svelte:head>

<PageHead title="No connection" sub="Your collection is on this device and works without one. Species pages you have opened before are kept; one you have not opened needs the network once." />
<div class="cult"><div class="body"><p>Your plants, benches, sowings, labels and backups all work offline. <a href="/plants">Go to your plants.</a></p><p class="small muted">A species page is fetched the first time you open it and kept after that, so the ones you grow are usually here already.</p></div></div>

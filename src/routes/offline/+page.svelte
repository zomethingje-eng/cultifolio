<script lang="ts">
  import PageHead from '$lib/ui/PageHead.svelte';
</script>

<svelte:head><title>Offline · Cultifolio</title></svelte:head>

<!-- Said once: the species pages' line was here twice (round sixty-one; visitor 17). Only pages opened are kept, grown or
     not (round sixty-two; visitor-words 17). -->
<PageHead title="No connection" sub="Your collection is on this device and works without one." />
<div class="cult"><div class="body"><p>Your plants, places, propagation, labels and backups all work offline. <a href="/plants">Go to your plants.</a></p><p class="small muted">A species page is kept once you have opened it, so the ones you have opened are here; one you have not opened needs the network once.</p></div></div>

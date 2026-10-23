<script lang="ts">
  import PageHead from '$lib/ui/PageHead.svelte';
  import { onMount } from 'svelte';
  import { goto, preloadCode } from '$app/navigation';
  import { version } from '$app/environment';
  import { keptData, mayTryKept } from '$lib/ui/offline-kept';
  /**
   * This page answers, offline, a page the worker holds no copy of as a page. A species page read by a link inside the app
   * is kept as its data (`__data.json`) and its scripts, not as a page, so a reload, a Back after the installed app was
   * closed, or Safari reopening its tabs, which all open by address, came here although the page was on the device
   * (round eighty-one; the phone review's 3). When this device holds that data, the app opens the page from it, once:
   * a second arrival here for the same address within a minute (its scripts not kept, say) stays here, and says so.
   */
  let opening = $state(false);
  onMount(() => {
    const path = location.pathname;
    if (path === '/offline') return;
    void (async () => {
      if (!(await keptData(path, version)) || !mayTryKept(path)) return;
      // Its scripts first: a page whose scripts this device does not hold would end on the framework's error page, not here.
      try {
        await preloadCode(path);
      } catch {
        return;
      }
      opening = true;
      try {
        await goto(location.pathname + location.search + location.hash, { replaceState: true });
      } catch {
        opening = false;
      }
    })();
  });
</script>

<svelte:head><title>Offline · Cultifolio</title></svelte:head>

<!-- Said once: the species pages' line was here twice (round sixty-one; visitor 17). Only pages opened are kept, grown or
     not (round sixty-two; visitor-words 17); since the app's last update, which starts its copies afresh (round eighty-one). -->
<PageHead title="No connection" sub="Your collection is on this device and works without one." />
<div class="cult"><div class="body"><p>Your plants, spaces, propagation, labels and backups all work offline. <a href="/plants">Go to your plants.</a></p><p class="small muted" id="offline-kept">{opening ? 'This page is kept on this device; opening it…' : 'A species page is kept once you have opened it on this device since the app last updated itself, so the ones you have opened are here; one you have not opened needs the network once.'}</p></div></div>

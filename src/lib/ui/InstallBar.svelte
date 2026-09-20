<script lang="ts">
  /**
   * "Add to your home screen", once, after the second visit, never inside an installed app. Chrome and Edge hand us
   * their own prompt (beforeinstallprompt); Safari on iPhone has no such event, so the bar says which two taps do it.
   * Dismissed is remembered for thirty days in this browser. Nothing here is sent anywhere.
   */
  import { onMount } from 'svelte';
  type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
  let deferred = $state<BIP | null>(null);
  let show = $state(false);
  let ios = $state(false);
  const VISITS = 'cultifolio.visits', SNOOZE = 'cultifolio.installSnoozedUntil';
  onMount(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    let visits = 0, snoozed = 0;
    try {
      visits = (Number(localStorage.getItem(VISITS)) || 0) + 1;
      localStorage.setItem(VISITS, String(visits));
      snoozed = Number(localStorage.getItem(SNOOZE)) || 0;
    } catch {
      return; // no storage: no way to keep the promise of asking once, so do not ask
    }
    if (visits < 2 || Date.now() < snoozed) return;
    ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (ios) show = true;
    const onBip = (e: Event) => {
      e.preventDefault();
      deferred = e as BIP;
      show = true;
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  });
  function snooze() {
    show = false;
    try {
      localStorage.setItem(SNOOZE, String(Date.now() + 30 * 86_400_000));
    } catch {
      /* fine */
    }
  }
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') show = false;
    else snooze();
  }
</script>

{#if show}
  <div class="install" role="region" aria-label="Add to your home screen">
    <img src="/icon-192.png" alt="" width="36" height="36" />
    <div class="tx">
      <b>Cultifolio on your home screen.</b>
      {#if deferred}<span>Opens like an app, works on the bench without a signal.</span>{:else if ios}<span>In Safari: tap <span class="k" aria-label="share">⎋</span> Share, then <b>Add to Home Screen</b>.</span>{:else}<span>Your browser's menu has "Install app" or "Add to home screen".</span>{/if}
    </div>
    {#if deferred}<button class="btn pri" type="button" onclick={install}>Install</button>{/if}
    <button class="btn" type="button" onclick={snooze}>Not now</button>
  </div>
{/if}

<style>
  .install { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 14px 0 0; padding: 10px 14px; background: var(--card); border: 1px solid var(--rule); border-radius: 12px; box-shadow: var(--sh); font-size: 13.5px; }
  .install img { border-radius: 9px; flex: none; }
  .tx { flex: 1 1 240px; min-width: 0; line-height: 1.45; }
  .tx b { display: block; }
  .tx span { color: var(--ink2); }
  .k { font-family: system-ui, sans-serif; }
</style>

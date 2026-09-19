<script lang="ts">
  import '@fontsource-variable/public-sans';
  import '@fontsource-variable/newsreader';
  // Italic (botanical names) from the weight-only Latin file, 64 KB, not the optical-size one at 147 KB: the difference is invisible at text sizes and the file is on every first visit.
  import newsreaderItalic from '@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2?url';
  import '@fontsource/dm-mono';
  import '$lib/ui/theme.css';
  import { page } from '$app/state';
  import { crumb } from '$lib/ui/crumb.svelte';
  import { onMount } from 'svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { onVaultNotice } from '$lib/db/vault';
  let { children } = $props();
  let vaultNote = $state<string | null>(null);
  // Sync wakes with the app when a vault key is on this device; it does nothing otherwise.
  onMount(async () => {
    // The app shell offline: registered after load so it never competes with the page's own requests.
    if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch(() => {});
    onVaultNotice((t) => (vaultNote = t));
    await collection.load();
    await sync.init();
    if (sync.configured) sync.schedule(1500);
  });
  const places = [
    { href: '/', label: 'Species', on: (p: string) => p === '/' || p.startsWith('/species') },
    { href: '/plants', label: 'Plants', on: (p: string) => p.startsWith('/plants') },
    { href: '/benches', label: 'Benches', on: (p: string) => p.startsWith('/benches') },
    { href: '/sowings', label: 'Sowings', on: (p: string) => p.startsWith('/sowings') },
    { href: '/frost', label: 'Frost', on: (p: string) => p.startsWith('/frost') }
  ];
  // The crumb: what a detail page set, else the section this path belongs to.
  const parts = $derived(crumb.parts.length ? crumb.parts : [{ label: places.find((p) => p.on(page.url.pathname))?.label === 'Plants' ? 'My plants' : (places.find((p) => p.on(page.url.pathname))?.label ?? 'Cultifolio') }]);
  const isDetail = $derived(crumb.parts.length > 1);
  const back = $derived(isDetail ? (crumb.parts[crumb.parts.length - 2]?.href ?? '/') : null);
</script>

<svelte:head>
  {@html `<style>@font-face{font-family:'Newsreader Variable';font-style:italic;font-display:swap;font-weight:200 800;src:url(${newsreaderItalic}) format('woff2-variations');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}</style>`}
  <title>Cultifolio</title>
</svelte:head>

<div id="topbar">
  {#if back}<a class="iconbtn" href={back} aria-label="Back">‹</a>{:else}<a class="iconbtn brand" href="/" aria-label="Cultifolio">✳</a>{/if}
  <div class="crumb">
    {#each parts as c, i}
      {#if i}<span class="sep">›</span>{/if}
      {#if c.href && i < parts.length - 1}<a href={c.href}>{c.label}</a>{:else}<span class:last={i === parts.length - 1 && parts.length > 1}>{c.label}</span>{/if}
    {/each}
  </div>
  <a class="iconbtn sync" href="/sync" title={sync.configured ? (sync.busy ?? (sync.lastError ? 'Sync: ' + sync.lastError : 'Synced')) : 'Sync'} aria-label="Sync" class:on={sync.configured} class:busy={!!sync.busy} class:err={!!sync.lastError}>⟳</a>
  <a class="iconbtn" href="/plants/new" title="Add a plant" aria-label="Add a plant">+</a>
</div>
{#if vaultNote}<p class="vaultnote">{vaultNote}</p>{/if}

<main class="wrap">
  {@render children()}
</main>

<footer class="credits">
  <p>Taxonomy: GBIF Backbone (CC BY). Distributions: WCVP, RBG Kew (CC BY 4.0). Climate: CHELSA V2.1 (CC0), NASA POWER. Photographs carry their own licence and credit. Summaries: Wikipedia (CC BY-SA 4.0). Coastlines: Natural Earth. Nothing on this site is stored about you; your collection lives on your device{#if sync.configured}, and in an encrypted vault only your key opens{/if}. <a href="/about/how">How it is made</a> · <a href="/about/formats">Formats</a> · <a href="https://github.com/zomethingje-eng/cultifolio">Source</a>.</p>
</footer>

<nav id="tabbar" aria-label="Places">
  {#each places as pl}
    <a href={pl.href} class:on={pl.on(page.url.pathname)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if pl.label === 'Species'}<path d="M12 3v18M5 8c4 0 7 2 7 6M19 8c-4 0-7 2-7 6M7 15c3 0 5 1.5 5 4M17 15c-3 0-5 1.5-5 4" />
        {:else if pl.label === 'Plants'}<path d="M6 21h12M9 21V10a3 3 0 0 1 6 0v11M12 10V4M9 6c0 0 3-2 3-2s3 2 3 2" />
        {:else if pl.label === 'Benches'}<path d="M3 10h18M3 15h18M6 10v11M18 10v11M6 15v-5M18 15v-5" />
        {:else if pl.label === 'Sowings'}<path d="M4 19h16M6 19c0-6 3-9 6-9s6 3 6 9M12 10V4M9 7l3-3 3 3" />
        {:else}<path d="M12 2v20M4 6l16 12M20 6L4 18M2 12h20" />{/if}
      </svg>
      <span>{pl.label}</span>
    </a>
  {/each}
</nav>

<style>
  .iconbtn.sync { color: var(--ink3); }
  .vaultnote { margin: 0; padding: 8px 16px; background: var(--bad); color: #fff; font-size: 14px; }
  .iconbtn.sync.on { color: var(--accent); }
  .iconbtn.sync.busy { animation: spin 1.2s linear infinite; }
  .iconbtn.sync.err { color: var(--bad); }
  @keyframes spin { to { transform: rotate(360deg); } }
  #topbar { position: sticky; top: 0; z-index: 60; background: color-mix(in srgb, var(--card) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--rule); display: flex; align-items: center; gap: 8px; padding: 7px 16px; margin-inline: calc(-1 * max(16px, env(safe-area-inset-left))) calc(-1 * max(16px, env(safe-area-inset-right))); min-height: 44px; }
  .crumb { font-size: 11px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .crumb a { color: var(--ink3); }
  .crumb a:hover { color: var(--ink); text-decoration: none; }
  .crumb .sep { opacity: 0.45; margin: 0 5px; }
  .crumb .last { color: var(--ink); }
  .iconbtn { border: 1px solid transparent; background: none; color: var(--ink2); font: inherit; font-size: 15px; font-weight: 600; padding: 4px 10px; border-radius: 8px; line-height: 1.2; min-width: 32px; text-align: center; }
  .iconbtn:hover { background: var(--sunk); color: var(--ink); text-decoration: none; }
  .iconbtn.brand { color: var(--accent); }
  main { padding-block: 0 3rem; max-width: 980px; }
  footer.credits { border-top: 1px solid var(--rule); margin: 44px auto 0; padding: 18px 0 40px; max-width: 980px; font-size: 11.5px; line-height: 1.75; color: var(--ink3); }
  footer.credits p { margin: 0; }
  #tabbar { display: none; }
  @media (max-width: 700px) {
    main { padding-bottom: calc(56px + 2rem + env(safe-area-inset-bottom)); }
    #tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; display: grid; grid-template-columns: repeat(5, 1fr); background: color-mix(in srgb, var(--card) 94%, transparent); backdrop-filter: blur(10px); border-top: 1px solid var(--rule); padding-bottom: env(safe-area-inset-bottom); }
    #tabbar a { color: var(--ink3); font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
    #tabbar a:hover { text-decoration: none; }
    #tabbar a.on { color: var(--accent); }
  }
</style>

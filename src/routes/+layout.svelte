<script lang="ts">
  import '@fontsource-variable/public-sans';
  import '@fontsource-variable/newsreader';
  // Italic (botanical names) from the weight-only Latin file, 64 KB, not the optical-size one at 147 KB: the difference is invisible at text sizes and the file is on every first visit.
  import newsreaderItalic from '@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2?url';
  // The two faces every page paints with, preloaded so the title and the body do not reflow when they arrive.
  import publicSansLatin from '@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2?url';
  import newsreaderLatin from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url';
  import '@fontsource/dm-mono';
  import '$lib/ui/theme.css';
  import { page, updated } from '$app/state';
  import { crumb } from '$lib/ui/crumb.svelte';
  import { onMount } from 'svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { today } from '$lib/ui/day.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { onVaultNotice } from '$lib/db/vault';
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import CompareBar from '$lib/ui/CompareBar.svelte';
  import InstallBar from '$lib/ui/InstallBar.svelte';
  import { GrowLayer } from '$lib/ui/grow'; // round sixty, agent F: the sample's banner, persist after the first plant, the backup nudge
  import ToastBar from '$lib/ui/ToastBar.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { METRIC } from '$core/units';
  import { keepFocusClear } from '$lib/ui/focus';
  import { syncWords } from '$lib/ui/sync-words';
  let { children } = $props();
  // Seed before anything renders. A server-rendered page carries the reader's units in its data (from the cookie or the
  // language); a client-rendered page has no server data and the store reads the cookie itself. So the first paint is in
  // the reader's units, and no page needs the server for it, which the collection's pages, offline, must not.
  $effect.pre(() => units.seed(page.data.units as typeof METRIC | 'us' | undefined));
  // svelte-ignore state_referenced_locally
  if (!browser) units.seed((page.data.units as typeof METRIC | 'us' | undefined) ?? METRIC);
  // The menu: everything the app has, from anywhere, behind the mark in the corner. Closes on navigation, Escape, or a tap outside.
  let menuOpen = $state(false);
  let menuBtn = $state<HTMLButtonElement | null>(null);
  const menu = [
    { href: '/', label: 'Species' },
    { href: '/plants', label: 'My plants' },
    { href: '/places', label: 'Places' },
    { href: '/propagation', label: 'Propagation' },
    { href: '/today', label: 'Today' },
    null,
    { href: '/compare', label: 'Compare species' },
    { href: '/labels', label: 'Labels' },
    { href: '/settings', label: 'Settings' },
    { href: '/backup', label: 'Backup' },
    { href: '/sync', label: 'Sync' },
    null,
    { href: '/about/how', label: 'How it is made' },
    { href: '/about/formats', label: 'Formats' },
    { href: 'https://github.com/zomethingje-eng/cultifolio', label: 'Source' }
  ];
  let mainEl = $state<HTMLElement | null>(null);
  /** The routes about the grower's own collection: what they link to says what is grown. */
  const privateRoute = $derived(/^\/(plants|propagation|places|labels|backup|sync|settings|today|frost)(\/|$)/.test(page.url.pathname));
  // How many pages this session has moved through inside the app: the back control goes to the previous one when there is one.
  let hops = 0;
  /** Whether the session's first page has arrived: its arrival is not a move, and focus stays where the browser starts it, so the first Tab reaches the skip link (round fifty-nine). */
  let arrived = false;
  afterNavigate((nav) => {
    if (browser) void frost.check();
    menuOpen = false;
    // A new page starts with the tab bar in view (round fifty-eight; the grower review).
    tabAway = false;
    if (browser) lastY = scrollY;
    if (nav.from && nav.type !== 'popstate') hops++;
    else if (nav.type === 'popstate' && hops > 0) hops--;
    // A new page: focus its content, not the top bar again (a same-page hash jump keeps the browser's own focus handling).
    // Not on the first load of the session (`from` is null): the browser's own start, the top of the document, is where a
    // screen reader expects to begin, and a page that moves focus on arrival reads as having done something (round twenty-eight, 11).
    // The first call is that first load whatever `from` says: a private page loaded directly reported a `from` and took
    // focus to #main, so the first Tab skipped the skip link (round fifty-nine; measured on /plants, /places, /today).
    const first = !arrived;
    arrived = true;
    if (first || nav.type === 'enter' || !nav.from || nav.to?.url.hash) return;
    mainEl?.focus({ preventScroll: true });
  });
  const closeMenu = () => {
    menuOpen = false;
    menuBtn?.focus();
  };
  // Open: focus goes to the first item and Tab stays inside until Escape or a choice; closed: it returns to the mark.
  let menuEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (menuOpen && menuEl) visible(menuEl)[0]?.focus();
  });
  /** The menu's focusable items that are actually shown: the close button is hidden on a desktop and must not swallow the focus. */
  const visible = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('a, button')].filter((x) => x.offsetParent !== null);
  function trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !menuEl) return;
    const items = visible(menuEl);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  let vaultNote = $state<string | null>(null);
  let takingOver = false;
  let reloadOnNext = false;
  const skipTo = (w: ServiceWorker | null) => { if (w) { takingOver = true; w.postMessage('skip'); } };
  $effect(() => {
    if (!updated.current || !browser || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      if (reg.waiting) return skipTo(reg.waiting);
      await reg.update().catch(() => {});
      if (reg.waiting) skipTo(reg.waiting);
    });
  });
  beforeNavigate((nav) => {
    // The new build takes over at a page boundary: a full load of the destination, never a reload of a page being worked on.
    if (reloadOnNext && nav.to && nav.type !== 'leave') { nav.cancel(); location.href = nav.to.url.href; }
  });
  // The phone's tab bar steps out of the way while the reader scrolls down a page and comes back on the way up or at the
  // page's end: a species page with two compared had 212 of 844 px fixed. Never while a text field has focus (the bar is
  // where the keyboard's owner expects it), never with reduced motion, never with the menu open (round fifty-eight; the grower review).
  let tabAway = $state(false);
  let lastY = 0;
  const SCROLL_STEP = 8;
  /** A field that takes typing: a checkbox or a button is not one. */
  const typing = (el: Element | null) =>
    !!el && ((el instanceof HTMLInputElement && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(el.type)) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable));
  function onScroll() {
    const y = Math.max(0, scrollY);
    const dy = y - lastY;
    // The top and the end of the page show it whatever the step: the last few pixels of a scroll are often under the threshold.
    if (y <= 56 || innerHeight + y >= document.documentElement.scrollHeight - 2) { tabAway = false; lastY = y; return; }
    if (Math.abs(dy) < SCROLL_STEP) return;
    lastY = y;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    tabAway = dy > 0 && !still && !menuOpen && !typing(document.activeElement);
  }
  $effect(() => {
    addEventListener('scroll', onScroll, { passive: true });
    const show = (e: FocusEvent) => { if (typing(e.target as Element)) tabAway = false; };
    addEventListener('focusin', show);
    return () => { removeEventListener('scroll', onScroll); removeEventListener('focusin', show); };
  });
  // What the "+" adds is what the section is about: a place on Places, a batch on Propagation, a plant everywhere else (round fifty-eight; the grower review).
  const adds = $derived(
    page.url.pathname.startsWith('/places') ? { href: '/places#add', path: '', label: 'Add a place' }
    : page.url.pathname.startsWith('/propagation') ? { href: '/propagation/new', path: '/propagation/new', label: 'Start a propagation batch' }
    : { href: '/plants/new', path: '/plants/new', label: 'Add a plant' }
  );
  // Sync wakes with the app when a vault key is on this device; it does nothing otherwise.
  // Focus moved by keyboard is scrolled clear of the sticky and fixed bars (WCAG 2.4.11; round fifty-nine).
  onMount(() => keepFocusClear());
  // Hydrated: the end-to-end tests wait for this before typing into a bound field, since a value typed into the
  // server's HTML is dropped when the field hydrates and a click before then has no handler (round fifty-nine; a slow Windows run).
  onMount(() => { document.documentElement.dataset.ready = '1'; });
  // The server's placeholder for a page drawn only here ("Opening your plants…", app.html) goes once the app is drawn;
  // CSS already hides it then, and this is for a browser without :has() (round sixty; the accessibility review, 7).
  onMount(() => document.getElementById('shell')?.remove());
  // The bars' heights, for the page's scroll padding: anchors and Tab land clear of them at any text size (round sixty; the visitor review, 5).
  onMount(() => {
    const root = document.documentElement;
    const ro = new ResizeObserver(() => {
      const top = document.getElementById('topbar')?.getBoundingClientRect().height;
      const tab = document.getElementById('tabbar')?.getBoundingClientRect().height;
      if (top) root.style.setProperty('--bar-h', `${Math.round(top)}px`);
      if (tab) root.style.setProperty('--tab-h', `${Math.round(tab)}px`);
    });
    for (const id of ['topbar', 'tabbar']) { const el = document.getElementById(id); if (el) ro.observe(el); }
    return () => ro.disconnect();
  });
  onMount(async () => {
    today.start();
    prefs.load(); // whether private pages may fetch the reference's photographs: off until switched on
    // The app shell offline: registered after load so it never competes with the page's own requests.
    if ('serviceWorker' in navigator && !import.meta.env.DEV) {
      // A new build's worker waits until every tab of the old one has closed, which an installed app never does. So a
      // waiting worker is told to take over on every load (a returning visitor's first page after a deploy is the common
      // case, and the version poll never fires for it), and again when the poll sees a deploy mid-session. The worker keeps
      // the previous build's cache for one generation, so a tab still on the old build finds its chunks.
      navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).then((reg) => {
        if (reg.waiting) skipTo(reg.waiting);
        reg.update().catch(() => {}); // one conditional GET of the script: the browser's own check after a navigation is not guaranteed on every load
        reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) skipTo(w); }); });
      }).catch((e) => console.warn('service worker not registered; offline use is off', e));
      // The reload under the new worker happens at once only in the first seconds of a page (nothing is half-done yet);
      // later it waits for the next navigation, so a half-filled form or an audit in progress is never thrown away.
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!takingOver) return;
        if (performance.now() < 4000) location.reload();
        else reloadOnNext = true;
      });
    }
    onVaultNotice((t) => (vaultNote = t));
    await collection.load();
    // The frost watch for every tab (round fifty-three, 3): read once, and again on every navigation and every return to
    // the tab when the site changed or the answer is older than half an hour, so a page left open overnight shows the
    // frost that appeared (round fifty-four, 4).
    void frost.check();
    frost.start();
    await sync.init();
    if (sync.configured) sync.schedule(1500);
  });
  /**
   * The phone's tabs: a grower's five places, or for a visitor with no plants the four that show something (Species,
   * Compare, My plants, About): Places, Propagation and Today opened empty private pages (round sixty; the visitor review,
   * ranked 9). Which set is drawn first is read from the front page's hint (`cultifolio.hasMine`) as the layout starts,
   * before its first render, so a page drawn here does not swap one set for the other on load; the layout keeps the hint
   * true once the collection is open. (A page the server drew shows a visitor's set until the scripts run.)
   */
  if (browser) {
    try {
      if (localStorage.getItem('cultifolio.hasMine') === '1') document.documentElement.dataset.grower = '1';
    } catch {
      /* no storage: a visitor's set until the collection opens */
    }
  }
  const tabs: Array<{ href: string; label: string; who: 'all' | 'grower' | 'visitor'; on: (p: string) => boolean }> = [
    { href: '/', label: 'Species', who: 'all', on: (p) => p === '/' || p.startsWith('/species') },
    { href: '/compare', label: 'Compare', who: 'visitor', on: (p) => p.startsWith('/compare') },
    { href: '/plants', label: 'Plants', who: 'all', on: (p) => p.startsWith('/plants') },
    { href: '/places', label: 'Places', who: 'grower', on: (p) => p.startsWith('/places') },
    { href: '/propagation', label: 'Propagation', who: 'grower', on: (p) => p.startsWith('/propagation') },
    { href: '/today', label: 'Today', who: 'grower', on: (p) => p.startsWith('/today') || p.startsWith('/frost') },
    { href: '/about/how', label: 'About', who: 'visitor', on: (p) => p.startsWith('/about') }
  ];
  $effect(() => {
    if (!collection.ready) return;
    // A plant, a batch, or a species followed: the front page's own reading of the hint, and more, so the two never disagree about a grower.
    const grower = collection.accessions.length > 0 || collection.sowings.length > 0 || collection.mySpecies.size > 0;
    const html = document.documentElement;
    if (grower) html.dataset.grower = '1';
    else delete html.dataset.grower;
    try {
      if (grower) localStorage.setItem('cultifolio.hasMine', '1');
      else localStorage.removeItem('cultifolio.hasMine');
    } catch {
      /* the hint is a convenience: without it the tabs are a visitor's until the collection opens */
    }
  });
  const places = [
    { href: '/', label: 'Species', on: (p: string) => p === '/' || p.startsWith('/species') },
    { href: '/plants', label: 'Plants', on: (p: string) => p.startsWith('/plants') },
    { href: '/places', label: 'Places', on: (p: string) => p.startsWith('/places') },
    { href: '/propagation', label: 'Propagation', on: (p: string) => p.startsWith('/propagation') },
    { href: '/today', label: 'Today', on: (p: string) => p.startsWith('/today') || p.startsWith('/frost') }
  ];
  // The crumb: what a detail page set, else the section this path belongs to.
  const parts = $derived(crumb.parts.length ? crumb.parts : [{ label: places.find((p) => p.on(page.url.pathname))?.label === 'Plants' ? 'My plants' : (places.find((p) => p.on(page.url.pathname))?.label ?? 'Cultifolio') }]);
  const isDetail = $derived(crumb.parts.length > 1);
  const back = $derived(isDetail ? (crumb.parts[crumb.parts.length - 2]?.href ?? '/') : null);
</script>

<svelte:head>
  <link rel="preload" as="font" type="font/woff2" href={publicSansLatin} crossorigin="anonymous" />
  <link rel="preload" as="font" type="font/woff2" href={newsreaderLatin} crossorigin="anonymous" />
  {@html `<style>@font-face{font-family:'Newsreader Variable';font-style:italic;font-display:swap;font-weight:200 800;src:url(${newsreaderItalic}) format('woff2-variations');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}</style>`}
  <!-- No <title> here: every page sets its own, and this one won on the server, so every species page was served as
       "Cultifolio" to crawlers and link previews (round fifty-nine; the accessibility and words review). -->
</svelte:head>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); }} />

<!-- The first thing focusable in the document, ahead of the top bar's eight or so stops; it sat after the bar and the
     menu, where a keyboard reached it last (round fifty-eight; the accessibility review). -->
<a class="skip" href="#main">Skip to content</a>

<!-- The top bar is the page's banner; the crumb is a breadcrumb trail, an ordered list in its own nav (round fifty-eight; the accessibility review). -->
<header id="topbar" data-cover="top">
  <!-- A disclosure of links, not an ARIA menu: expanded and controls say all of it, and "has a popup" promised menu keys it never had (round fifty-eight; the accessibility review). -->
  <button class="iconbtn brand" type="button" bind:this={menuBtn} aria-label="Menu" aria-expanded={menuOpen} aria-controls="menu" onclick={() => (menuOpen = !menuOpen)}>✳</button>
  {#if back}<a class="iconbtn" href={back} aria-label="Back" onclick={(e) => { if (hops > 0) { e.preventDefault(); history.back(); } }}>‹</a>{/if}
  <nav class="crumb" aria-label="Breadcrumb">
    <ol>
      {#each parts as c, i}
        <li>{#if i}<span class="sep" aria-hidden="true">›</span>{/if}{#if c.href && i < parts.length - 1}<a href={c.href}>{c.label}</a>{:else}<span class:last={i === parts.length - 1 && parts.length > 1} aria-current={i === parts.length - 1 ? 'page' : undefined}>{c.label}</span>{/if}</li>
      {/each}
    </ol>
  </nav>
  <!-- The five places, from every page, in the bar that is always there; the phone has them in the tab bar instead. The
       current one says so to a screen reader, not only in colour (round fifty-eight; the accessibility review). -->
  <nav class="seg topseg" aria-label="Main">
    {#each places as pl}<a href={pl.href} class:on={pl.on(page.url.pathname)} aria-current={pl.on(page.url.pathname) ? 'page' : undefined}>{pl.label === 'Plants' ? 'My plants' : pl.label}</a>{/each}
  </nav>
  <a class="iconbtn sync" href="/sync" title={sync.configured ? (sync.busy ?? (sync.offline ? (sync.unreached === 'server' ? 'Sync: the server did not answer; changes are kept here' : 'Sync: offline; changes are kept here') : sync.lastError ? 'Sync: ' + (syncWords(sync.lastError)?.text ?? sync.lastError) : sync.runs ? 'Synced' : 'Sync: not checked yet')) : 'Sync'} aria-label="Sync" class:on={sync.configured} class:busy={!!sync.busy} class:err={!!sync.lastError}>⟳</a>
  <!-- Not on the add page itself: pressed there it threw the half-filled form away for an empty one (round forty-nine, 3).
       It adds what the section is about, and says which (round fifty-eight; the grower review). -->
  {#if page.url.pathname !== adds.path}<a class="iconbtn" href={adds.href} title={adds.label} aria-label={adds.label}>+</a>{/if}
</header>
{#if menuOpen}
  <div class="scrim" onclick={closeMenu} aria-hidden="true"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav id="menu" aria-label="Everything" bind:this={menuEl} onkeydown={trapTab}>
    <div class="menuhead"><span class="kick">Cultifolio</span><button class="iconbtn" type="button" aria-label="Close menu" onclick={closeMenu}>×</button></div>
    {#each menu as m, i (i)}
      {#if m}<a href={m.href} class:on={m.href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/species') : page.url.pathname.startsWith(m.href)} rel={m.href.startsWith('http') ? 'external' : undefined}>{m.label}</a>{:else}<hr />{/if}
    {/each}
  </nav>
{/if}
{#if vaultNote}<p class="vaultnote">{vaultNote}</p>{/if}
<!-- The frost watch, reachable from every tab (round fifty-three, 3): the risk at the site, as the Today tab says it, on every page but that one. A refusal is said on the front page and the Today tab, not on every page. -->
<!-- This device's clock reads earlier than its own last change (round fifty-nine): said, not acted on. Two readings, by
     whether a sync answer has confirmed the clock: confirmed, the changes were made under a fast clock; not, the clock
     itself may be the one that is wrong. Either way an edit made now saves and shows; "Nothing is lost" was not true of
     every case and is not said (round sixty; the lead's wording, the outside review's A17). -->
{#if collection.clockBehindAt && privateRoute}{@const when = new Date(collection.clockBehindAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}<p class="clockbar" role="status" id="clockbar">{#if collection.clockTrusted}Some changes on this device are dated ahead of now, up to {when}: its clock was probably fast when they were made. They still count, and what you edit now saves and shows.{:else}This device's date reads earlier than its last change ({when}). What you edit now still saves and shows; set the date right when you can.{/if}</p>{/if}
{#if frost.line?.tone === 'bad' && !page.url.pathname.startsWith('/today') && page.url.pathname !== '/'}<a class="frostbar" href="/today#frost" id="frostbar">{frost.line.text} <span class="go">Today ›</span></a>{/if}

<!-- On the pages about your own plants, links are not preloaded on hover: a preload of a species page sends that species' name to the
     server before any click, which the bucket lookups exist to avoid; a tap or click is a visit the grower chose (round thirteen, 2). -->
<main class="wrap" id="main" tabindex="-1" bind:this={mainEl} data-sveltekit-preload-data={privateRoute ? 'off' : 'hover'}>
  <ToastBar />
  <InstallBar />
  <GrowLayer />
  {@render children()}
</main>

<CompareBar low={tabAway} />

<!-- Three lines, about the reader: the sources, every one, then what is kept, then the links (round fifty-eight; it was eight lines on a phone, about the server, and its list left four sources out). -->
<!-- On a page about your own plants the footer waits for the collection: drawn mid-screen under "Opening…" and then
     pushed off by the list, it was a layout shift of 0.2 to 0.29 on every load of /plants and /today (round sixty; the
     accessibility review, 2). -->
{#if !privateRoute || collection.ready}
<footer class="credits">
  <p>Sources: GBIF Backbone, WCVP (RBG Kew), CHELSA, NASA POWER, ETOPO, Natural Earth, iNaturalist, Wikimedia Commons, Wikidata, Wikipedia, OpenAlex; each figure and photograph names its own, with its licence.</p>
  <p>No account, no analytics. Your collection stays on this device{#if sync.configured}, and in a vault only your key opens{/if}.</p>
  <p><a href="/about/how">How it is made</a> · <a href="/about/how#privacy">Privacy</a> · <a href="/about/formats">Formats</a> · <a href="https://github.com/zomethingje-eng/cultifolio">Source</a></p>
</footer>
{/if}

<nav id="tabbar" aria-label="Tabs" class:away={tabAway} data-cover="bottom" data-away={tabAway ? 'true' : undefined} onfocusin={() => (tabAway = false)}>
  {#each tabs as pl (pl.href)}
    <a href={pl.href} class="t{pl.who[0]}" class:on={pl.on(page.url.pathname)} aria-current={pl.on(page.url.pathname) ? 'page' : undefined}><!-- aria-current: round fifty-eight; the accessibility review -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if pl.label === 'Species'}<path d="M12 3v18M5 8c4 0 7 2 7 6M19 8c-4 0-7 2-7 6M7 15c3 0 5 1.5 5 4M17 15c-3 0-5 1.5-5 4" />
        {:else if pl.label === 'Plants'}<path d="M6 21h12M9 21V10a3 3 0 0 1 6 0v11M12 10V4M9 6c0 0 3-2 3-2s3 2 3 2" />
        {:else if pl.label === 'Places'}<path d="M3 10h18M3 15h18M6 10v11M18 10v11M6 15v-5M18 15v-5" />
        {:else if pl.label === 'Propagation'}<path d="M4 19h16M6 19c0-6 3-9 6-9s6 3 6 9M12 10V4M9 7l3-3 3 3" />
        {:else if pl.label === 'Compare'}<path d="M8 4v16M16 4v16M4 8h8M12 16h8" />
        {:else if pl.label === 'About'}<circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" />
        {:else}<circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />{/if}
      </svg>
      <span>{pl.label === 'Plants' ? 'My plants' : pl.label}</span>
    </a>
  {/each}
</nav>

<style>
  .iconbtn.sync { color: var(--ink3); }
  .vaultnote { margin: 0; padding: 8px 16px; background: var(--bad); color: #fff; font-size: var(--fs-md); }
  .clockbar { margin: 0; padding: 7px 16px; background: var(--warm-soft); color: var(--warm-ink); font-size: var(--fs-md); line-height: 1.4; border-bottom: 1px solid var(--rule); }
  .frostbar { display: block; padding: 7px 16px; background: var(--bad-soft); color: var(--ink); font-size: var(--fs-md); line-height: 1.4; border-bottom: 1px solid var(--rule); text-decoration: none; }
  .frostbar:hover { text-decoration: underline; }
  .frostbar .go { white-space: nowrap; color: var(--bad); font-weight: 600; margin-left: 4px; }
  .iconbtn.sync.on { color: var(--accent); }
  .iconbtn.sync.busy { animation: spin 1.2s linear infinite; }
  .iconbtn.sync.err { color: var(--bad); }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Opaque, not a blur: a sticky bar that lets headings ghost through reads as two lines of text. */
  #topbar { position: sticky; top: 0; z-index: 60; background: var(--bg); border-bottom: 1px solid var(--rule); display: flex; align-items: center; gap: 8px; padding: 2px 16px; margin-inline: calc(-1 * max(16px, env(safe-area-inset-left))) calc(-1 * max(16px, env(safe-area-inset-right))); min-height: 44px; }
  .crumb { font-size: var(--fs-xs); line-height: max(40px, var(--tap)); letter-spacing: 0.11em; text-transform: uppercase; color: var(--ink3); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  /* A finger's hit area (40 px) around an 11 px word: the line box, not the glyph, is the target. */
  .crumb a { color: var(--ink3); display: inline-block; padding: 0 2px; }
  .crumb a:hover { color: var(--ink); text-decoration: none; }
  .crumb .sep { opacity: 0.45; margin: 0 5px; }
  /* The trail as a list that reads as the one line it was (round fifty-eight; the accessibility review). */
  .crumb ol { display: inline; margin: 0; padding: 0; list-style: none; }
  .crumb li { display: inline; }
  .crumb li a { text-decoration: none; } /* not the prose link's underline, which the theme gives every link in a list item (round fifty-eight; the accessibility review) */
  .crumb .last { color: var(--ink); }
  #topbar .topseg { margin: 0 6px; flex: none; }
  #topbar .topseg > a { padding: 5px 12px; font-size: var(--fs-md); }
  @media (max-width: 700px) { #topbar .topseg { display: none; } }
  .iconbtn { border: 1px solid transparent; background: none; color: var(--ink2); font: inherit; font-size: var(--fs-base); font-weight: 600; padding: 4px 8px; border-radius: var(--r); line-height: 1.2; min-width: max(40px, var(--tap)); min-height: max(40px, var(--tap)); display: inline-flex; align-items: center; justify-content: center; text-align: center; }
  .iconbtn:hover { background: var(--sunk); color: var(--ink); text-decoration: none; }
  .iconbtn.brand { color: var(--accent); cursor: pointer; }
  .iconbtn.brand[aria-expanded='true'] { background: var(--sunk); }
  .scrim { position: fixed; inset: 0; z-index: 55; background: rgba(0, 0, 0, 0.18); }
  #menu { position: fixed; z-index: 65; top: 48px; left: max(12px, env(safe-area-inset-left)); width: 240px; background: var(--card); border: 1px solid var(--rule); border-radius: var(--r-lg); box-shadow: var(--sh2); padding: 6px; display: flex; flex-direction: column; }
  #menu a { display: block; padding: 10px 12px; border-radius: var(--r); color: var(--ink); font-weight: 600; font-size: var(--fs-md); min-height: 40px; }
  #menu a:hover { background: var(--sunk); text-decoration: none; }
  #menu a.on { color: var(--accent); }
  #menu .menuhead { display: none; align-items: center; justify-content: space-between; padding: 0 4px 4px 12px; }
  #menu hr { border: 0; border-top: 1px solid var(--rule); margin: 6px 4px; }
  @media (max-width: 700px) { #menu { top: 0; left: 0; bottom: 0; width: min(78vw, 300px); border-radius: 0 14px 14px 0; padding-top: max(8px, env(safe-area-inset-top)); overflow-y: auto; } #menu .menuhead { display: flex; } }
  main { padding-block: 0 3rem; max-width: 980px; }
  footer.credits { border-top: 1px solid var(--rule); margin: 44px auto 0; padding: 18px 0 40px; max-width: 980px; font-size: var(--fs-sm); line-height: 1.75; color: var(--ink3); }
  @media (max-width: 700px) { footer.credits { padding-bottom: calc(56px + 2rem + env(safe-area-inset-bottom)); } }
  main:focus { outline: none; }
  /* Off the screen by its own height, whatever the text size: `top: -40px` left a strip of it showing at 200% text (round fifty-nine). */
  .skip { position: absolute; left: 16px; top: 0; z-index: 90; background: var(--ink); color: var(--bg); padding: 8px 14px; min-height: var(--tap); border-radius: var(--r); font-weight: 600; font-size: var(--fs-md); transform: translateY(calc(-100% - 4px)); }
  .skip:focus { transform: translateY(8px); outline: 2px solid var(--accent); }
  footer.credits p { margin: 0 0 4px; }
  footer.credits a { display: inline-block; padding: 12px 2px; margin: -12px 0; }
  #tabbar { display: none; }
  @media (max-width: 700px) {
    main { padding-bottom: calc(56px + 2rem + env(safe-area-inset-bottom)); }
    /* As many equal columns as tabs shown, each allowed to shrink below its word: at 150 to 200% text "Today" went off
       the screen past a fixed bar nobody can scroll (round sixty; the accessibility review, 5). A word too long for its
       column wraps under its icon rather than pushing the next tab out. */
    #tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); background: color-mix(in srgb, var(--card) 94%, transparent); backdrop-filter: blur(10px); border-top: 1px solid var(--rule); padding-bottom: env(safe-area-inset-bottom); }
    #tabbar a { color: var(--ink2); font-size: var(--fs-sm); font-weight: 600; letter-spacing: 0.02em; min-height: 56px; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 4px 2px; text-align: center; line-height: 1.15; }
    #tabbar a span { max-width: 100%; overflow-wrap: anywhere; hyphens: auto; }
    #tabbar svg { flex: none; }
    /* A grower's five, or a visitor's four (round sixty; the visitor review). */
    :global(html:not([data-grower])) #tabbar a.tg, :global(html[data-grower]) #tabbar a.tv { display: none; }
    #tabbar a:hover { text-decoration: none; }
    #tabbar a.on { color: var(--accent); }
    /* Out of the way while scrolling down, by its own height and the safe area under it (round fifty-eight; the grower review). */
    #tabbar { transition: transform 0.22s ease; }
    #tabbar.away { transform: translateY(100%); }
    /* Room at the end of the page for the compare pill above the tab bar (round fifty-eight; the grower review). */
    :global(body:has(.cmppill)) footer.credits { padding-bottom: calc(56px + 2rem + 56px + env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: reduce) { #tabbar { transition: none; } #tabbar.away { transform: none; } }
  /* Under 480 px tall the bottom bar would take a sixth of the screen: the places stay one tap away in the menu. */
  @media (max-height: 480px) { #tabbar { display: none !important; } footer.credits { padding-bottom: 0 !important; } }
</style>

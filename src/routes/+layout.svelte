<script lang="ts">
  import { backLayer } from '$lib/ui/back-layer.svelte';
  // The one face every page paints its text in, preloaded so the body does not reflow when it arrives: Source Sans 3's
  // roman, Latin subset (round eighty-seven, the owner's type). The italic, the serif's italic (the names) and the
  // monospace are asked for by the sheet when a page sets text in them; their faces are declared in theme.css.
  import sourceSansLatin from '../../static/fonts/source-sans-3/source-sans-3-latin-wght-normal.woff2?url';
  import '$lib/ui/theme.css';
  import { page, updated } from '$app/state';
  import { crumb } from '$lib/ui/crumb.svelte';
  import { onMount, tick } from 'svelte';
  import SiteSearch from '$lib/browse/SiteSearch.svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { today } from '$lib/ui/day.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { frost } from '$lib/ui/frost.svelte';
  import { onVaultNotice, vaultWritesInFlight, whenVaultIdle } from '$lib/db/vault';
  import { onTakeOver, onArrival } from '$lib/ui/take-over';
  import { afterNavigate } from '$app/navigation';
  import { browser, version } from '$app/environment';
  import CompareBar from '$lib/ui/CompareBar.svelte';
  import InstallBar from '$lib/ui/InstallBar.svelte';
  // Round sixty, agent F: the sample's banner, persist after the first plant, the backup nudge. By its own path, not the
  // grow barrel, which brought every grower feature and the backup module into every page (round sixty-one; the
  // accessibility review, 3).
  import GrowLayer from '$lib/ui/grow/GrowLayer.svelte';
  import ExampleChip from '$lib/ui/grow/ExampleChip.svelte'; // "Example" in the top bar while the page is in the example (round sixty-nine; triage-68 X8; R46-26)
  import { freshOnRestore, PAGE_IN_DEMO } from '$lib/db/demo';
  // The example collection as the answer to an empty grower page (round sixty-three, V2), decided on the page once it has
  // arrived, never on the tap: a tap that went straight in skipped the pages' own "Leave this page?" (the fix pass; R1, 1).
  import { addLeavesExample, example, notEnteredWords, openExample } from '$lib/ui/grow/example.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import ToastBar from '$lib/ui/ToastBar.svelte';
  import LockScreen from '$lib/ui/LockScreen.svelte'; // the app lock (round eighty-seven, t3; plan F12)
  import { lock, lockExempt } from '$lib/ui/lock.svelte';
  import { units } from '$lib/ui/units.svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { METRIC } from '$core/units';
  import { keepFocusClear } from '$lib/ui/focus';
  import { keepOnFirstPlant } from '$lib/ui/keep-ask';
  import { readSetting } from '$lib/ui/stored';
  import { syncWords } from '$lib/ui/sync-words';
  import { countView, registerNow } from '$lib/ui/worker-gate';
  import { frame } from '$lib/ui/frame.svelte';
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
    { href: '/', label: 'Reference' },
    { href: '/plants', label: 'My plants' },
    { href: '/places', label: 'My spaces' },
    { href: '/propagation', label: 'Propagation' },
    { href: '/today', label: 'Today' },
    null,
    { href: '/compare', label: 'Compare species' },
    { href: '/labels', label: 'Labels' },
    { href: '/settings', label: 'Settings' },
    { href: '/backup', label: 'Backup' },
    { href: '/sync', label: 'Sync' },
    null,
    { href: '/about', label: 'About' },
    { href: '/about/how', label: 'How it is made' },
    { href: '/about/formats', label: 'Formats' },
    { href: 'https://github.com/zomethingje-eng/cultifolio', label: 'Source' }
  ];
  /**
   * Anyone can look at the example from the menu, a grower with plants too: their own collection is left as it is, and
   * Leave returns to it (round sixty-three, V2). By the app's own move to Today first, so the page being left asks about
   * what is typed on it, and not while a restore or an import is in progress; a refusal is said (the fix pass; R1, 1, 2, 7).
   */
  let demoTab = $state(false);
  onMount(() => { demoTab = PAGE_IN_DEMO; }); // the page's collection, read as it loaded (round sixty-seven; triage-66 V3)
  async function menuExample() {
    menuOpen = false;
    await menuLayer.settle(); // the menu's history entry gone first, so the step back cannot land after the move into the example
    const r = await openExample('/today');
    if (r === 'busy' || r === 'refused') toast.show(notEnteredWords(r), 10000);
  }
  // A page the back-forward cache brings back into a tab whose mode changed loads afresh (the fix pass; R1, 3).
  onMount(() => freshOnRestore());
  onMount(() => lock.load());
  /** Behind the lock screen: every page but the about pages, which say what the lock is and how to come back without the passcode (round eighty-seven, t3). */
  const locked = $derived(lock.locked && !lockExempt(page.url.pathname));
  // The footer is made inert by its element, not by an attribute in its tag, which the about pages' tests read as written.
  $effect(() => { void collection.ready; void frame.holding; document.querySelector('footer.credits')?.toggleAttribute('inert', locked); });
  // The page under the lock still sets its own title, and a plant's page is titled by its number and species, which the
  // tab strip and the app switcher show over the lock (round eighty-seven, the stage 3 fixes; M5). While locked the title
  // is the lock's, set again whenever the page sets its own; the page's own comes back on unlocking.
  $effect(() => {
    if (!locked) return;
    const LOCKED = 'Locked · Cultifolio';
    let wanted = document.title === LOCKED ? null : document.title;
    const hold = () => { if (document.title !== LOCKED) { wanted = document.title; document.title = LOCKED; } };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => { watch.disconnect(); if (wanted && document.title === LOCKED) document.title = wanted; };
  });
  let mainEl = $state<HTMLElement | null>(null);
  /** The routes about the grower's own collection: what they link to says what is grown. */
  const privateRoute = $derived(/^\/(plants|propagation|places|labels|backup|sync|settings|today|frost)(\/|$)/.test(page.url.pathname));
  /** The pages that pick species to compare: the species pages (the Compare page shows its picks itself). */
  const comparePage = $derived(page.url.pathname.startsWith('/species/'));
  // Hover preloading off on these pages everywhere, not only inside <main>: the compare tray, the top bar, the frost and
  // clock lines and the footer sit outside it, and a hover on the tray's "Compare 2" sent both species to the server before
  // any click (round sixty-seven; triage-66 P3, S-F6, R45-7). The body's attribute is the one the router reads last.
  $effect.pre(() => {
    if (browser) document.body.setAttribute('data-sveltekit-preload-data', privateRoute ? 'off' : 'hover');
  });
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
    // Back and Forward move by the history's own steps: a Forward counted as a Back left the count at none, and the bar's
    // "‹" then went to the section's page, not the page before (round eighty; the phone review's 8).
    if (nav.from && nav.type !== 'popstate') hops++;
    else if (nav.type === 'popstate') hops = Math.max(0, hops + (nav.delta ?? -1));
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
    (openedBy ?? menuBtn)?.focus();
  };
  // Back closes the menu and stays on the page; a link in it replaces the menu's entry (round eighty-one; the phone review's 8).
  const menuLayer = backLayer('menu', () => menuOpen, () => { const inside = !!menuEl?.contains(document.activeElement); menuOpen = false; if (inside) (openedBy ?? menuBtn)?.focus(); });
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
  /**
   * The frost bar (round eighty-two; the independent review's 18): a night within 72 hours of the forecast, or one below
   * the cold floor of a space of the grower's that the site's forecast covers (no coordinates of its own, not indoors, a
   * floor that is not a heater's set-point), dated; red only at or below freezing.
   */
  const frostFloors = $derived(collection.ready ? collection.locations.map((l) => ({ l, c: collection.conditions(l.id) })).filter((x) => x.c.floorC != null && !x.c.floorHeld && x.c.indoor !== true && x.c.lat == null).map((x) => ({ name: x.l.name, floorC: x.c.floorC! })) : []);
  const frostBar = $derived(frost.bar(frostFloors));
  /** Whether anything was typed, ticked or chosen on this page: a takeover then waits for the next navigation (round sixty-seven; triage-66 P2). */
  let typedHere = false;
  if (browser) {
    const mark = () => { typedHere = true; };
    addEventListener('input', mark, { capture: true });
    addEventListener('change', mark, { capture: true });
  }
  let takingOver = false;
  let reloadOnNext = false;
  const skipTo = (w: ServiceWorker | null) => { if (w) { takingOver = true; w.postMessage('skip'); } };
  /** The build a worker serves, asked of the worker itself; null from one too old to say, or one that does not answer in a second. */
  function buildOf(w: ServiceWorker | null): Promise<string | null> {
    if (!w) return Promise.resolve(null);
    return new Promise((done) => {
      const ch = new MessageChannel();
      const t = setTimeout(() => done(null), 1000);
      ch.port1.onmessage = (e) => { clearTimeout(t); done(typeof e.data === 'string' ? e.data : null); };
      try { w.postMessage('version', [ch.port2]); } catch { clearTimeout(t); done(null); }
    });
  }
  $effect(() => {
    if (!updated.current || !browser || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      if (reg.waiting) return skipTo(reg.waiting);
      await reg.update().catch(() => { /* no update found is the usual answer; the version poll asks again */ });
      if (reg.waiting) skipTo(reg.waiting);
    });
  });
  // The new build takes over at a page boundary, never by reloading a page being worked on. Not in `beforeNavigate` any
  // more: cancelling the move there and assigning `location.href` began a full unload before the page's own leave guard
  // had decided, so a half-filled form asked twice (its "Leave this page?" and the browser's), and a write in flight met
  // an unload nobody waited for. The move now finishes as any other, guards and all, and the page it arrives on reloads
  // when nothing is typed there, after any write in flight (round sixty-nine; triage-68 P2, IND-11; the rule is `onArrival`'s).
  afterNavigate(async (nav) => {
    // A new page starts untyped (a jump within the page keeps what was typed on it); reset here, once the move has
    // happened, not before it, since a page's guard can keep the grower on the form.
    // (`url` read with care: the framework hands an `after` callback a `from` whose url is null after some moves, such
    // as a plant page's Apply, which threw here.)
    if (nav.to?.url && nav.from?.url && nav.to.url.pathname !== nav.from.url.pathname) typedHere = false;
    if (!reloadOnNext || nav.type === 'enter') return;
    const now = () => onArrival({ pending: reloadOnNext, typed: typedHere || typing(document.activeElement), writing: vaultWritesInFlight() });
    let what = now();
    if (what === 'wait') { await whenVaultIdle(5000); what = now(); }
    if (what === 'reload') location.reload();
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
  // What the "+" adds is what the section is about: a space on My spaces, a batch on Propagation, a plant everywhere else (round fifty-eight; the grower review).
  const adds = $derived(
    page.url.pathname.startsWith('/places') ? { href: '/places#add', path: '', label: 'Add a space' }
    : page.url.pathname.startsWith('/propagation') ? { href: '/propagation/new', path: '/propagation/new', label: 'Start a propagation batch' }
    : { href: '/plants/new', path: '/plants/new', label: 'Add a plant' }
  );
  // Sync wakes with the app when a vault key is on this device; it does nothing otherwise.
  // Focus moved by keyboard is scrolled clear of the sticky and fixed bars (WCAG 2.4.11; round fifty-nine).
  onMount(() => keepFocusClear());
  // Hydrated: the end-to-end tests wait for this before typing into a bound field, since a value typed into the
  // server's HTML is dropped when the field hydrates and a click before then has no handler (round fifty-nine; a slow Windows run).
  onMount(() => { document.documentElement.dataset.ready = '1'; });
  // The collection read: the end-to-end tests wait for this, not a fixed pause, before they count what a load did (the
  // "keep data" question's ask, round seventy; triage-69 P3, R47-20: under a loaded WebKit run no page finished reading
  // within the 1.2 s each was given, and nothing was asked).
  $effect(() => { if (collection.ready) document.documentElement.dataset.collection = 'open'; });
  // The "keep data" question asked from the first plant's commit as well as from a load (keep-ask.ts, `keepOnFirstPlant`),
  // while GrowLayer has not said an answer on this device; GrowLayer says it, as before.
  onMount(() => keepOnFirstPlant(collection, () => readSetting('cultifolio.persistAfterFirst', 'device') === '1'));
  // The server's placeholder for a page drawn only here ("Opening your plants…", app.html) goes once the app is drawn;
  // CSS already hides it then, and this is for a browser without :has() (round sixty; the accessibility review, 7).
  // The shell (app.html's #shell) is what a page drawn on the device (your collection's) shows before its scripts run,
  // and what stays if they do not; removed once the layout has drawn. Since round eighty-seven's review fix (M6) it is the
  // look's top bar: the word on the page's ground over a rule in the ink, 52 px tall (56 on a desktop), the theme's tokens
  // with their light values where the sheet has not come; and the head's theme colours are the look's ground.
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
  /**
   * The app shell offline, registered after load so it never competes with the page's own requests, and only on a device
   * that keeps something or comes back: already registered, a page of the collection, a collection held, or a second page
   * (round seventy-three; self-F 10: the install's precache was half of a first visit, spent on a reader of one species
   * page). The rule is `registerNow`'s; once registered it behaves as before.
   */
  let workerOn = false;
  /** Whether a worker served this page as it loaded: read once, before any registration, for the takeover's rule. */
  const servedAtLoad = browser && 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
  /** Pages this session has viewed: the first load and each move to another address. */
  let sessionViews = 0;
  let viewedPath: string | null = null;
  /** The worker registered when `registerNow` says so for this page and this device. */
  function considerWorker(path: string) {
    if (workerOn || !browser || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
    if (registerNow({ registered: false, views: sessionViews, path, records: collection.ready ? collection.recordCount : null, syncing: sync.configured })) registerWorker();
  }
  afterNavigate((nav) => {
    if (!browser) return;
    const path = nav.to?.url.pathname ?? location.pathname;
    if (path !== viewedPath) { viewedPath = path; sessionViews = countView(sessionViews); }
    considerWorker(path);
  });
  // A collection held (a plant added, a species followed, an import or a restore merged, the example) or sync set up, on
  // whatever page: registered then, so the grower's next visit can be offline.
  $effect(() => {
    if (!collection.ready) return;
    if (collection.recordCount > 0 || sync.configured) considerWorker(page.url.pathname);
  });
  /** Asks the active worker to claim this page while it has no controller, with waits between (round seventy-four). */
  const CLAIM_WAITS = [500, 1000, 1500, 3000, 4000];
  function askClaim(r: ServiceWorkerRegistration, n: number) {
    if (navigator.serviceWorker.controller) return;
    r.active?.postMessage('claim');
    if (n < CLAIM_WAITS.length) setTimeout(() => askClaim(r, n + 1), CLAIM_WAITS[n]);
  }
  function registerWorker() {
    if (workerOn || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
    workerOn = true;
    document.documentElement.dataset.worker = 'on';
    // A new build's worker waits until every tab of the old one has closed, which an installed app never does. So a
    // waiting worker is told to take over on every load (a returning visitor's first page after a deploy is the common
    // case, and the version poll never fires for it), and again when the poll sees a deploy mid-session. The worker keeps
    // the previous build's cache for one generation and reads it for a build file it does not have, so a tab still on
    // the old build finds its chunks (round sixty-seven; triage-66 P2).
    navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).then((reg) => {
      if (reg.waiting) skipTo(reg.waiting);
      // One conditional GET of the script: the browser's own check after a navigation is not guaranteed on every load. Only
      // with a worker in charge and none installing: on a first install it can only make a second copy of the same build,
      // which the next page takes over (round sixty-four; the Firefox run, where the second page reloaded itself).
      if (reg.active && !reg.installing) reg.update().catch(() => {});
      // A first visit's page that the first worker's claim missed (WebKit, when the page was loading as the worker
      // activated) asks to be claimed: offline use then starts on this page, not the next (round seventy-four). Asked
      // again while no worker controls the page, at 0.5, 1.5, 3, 6 and 10 s: one ask still missed it in 1 run of 6 in WebKit.
      void navigator.serviceWorker.ready.then((r) => { askClaim(r, 0); }, () => {});
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) skipTo(w); }); });
    }).catch((e) => console.warn('service worker not registered; offline use is off', e));
    // The reload under the new worker happens at once only in the first seconds of a page, with nothing typed and no
    // write in flight; otherwise it waits for the next navigation, so a half-filled form or an audit in progress is never thrown away.
    // A worker of the build this page already runs changes nothing on it, and is not reloaded for, and neither is a page
    // no worker served (a first visit came from the server and is this build already; the first worker's `clients.claim()`
    // changes its controller too). In the first all-engines run, first visits in Safari's engine and the second page of a
    // first visit in Firefox reloaded within their first seconds, losing a plant, a place or a note just typed (round
    // sixty-four).
    // Round sixty-seven (triage-66 P2; R45-5, S-E6): the early reload waits for nothing typed and no vault write in
    // flight, or it threw away a name typed in the first seconds after a deploy; a tab that did not send `skip` itself (a
    // second tab) now moves to the new build at its next navigation instead of running the old one for good; and a
    // worker that does not say its build is not taken for another build. The rule is `onTakeOver`'s.
    const servedByOld = servedAtLoad;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!servedByOld) return;
      void buildOf(navigator.serviceWorker.controller).then((v) => {
        const what = onTakeOver({ servedByOld, askedSkip: takingOver, build: v, version, sinceStart: performance.now(), typed: typedHere || typing(document.activeElement), writing: vaultWritesInFlight() });
        if (what === 'reload') location.reload();
        else if (what === 'next') reloadOnNext = true;
      });
    });
  }
  onMount(async () => {
    today.start();
    prefs.load(); // whether private pages may fetch the reference's photographs: off until switched on
    // A device that already has a worker keeps it, as before: registered (and its update checked) on every load.
    const known = 'serviceWorker' in navigator && !import.meta.env.DEV
      ? (navigator.serviceWorker.controller ? Promise.resolve(registerWorker()) : navigator.serviceWorker.getRegistration().then((r) => { if (r) registerWorker(); }, () => {}))
      : Promise.resolve();
    onVaultNotice((t) => (vaultNote = t));
    await collection.load();
    // The frost watch for every tab (round fifty-three, 3): read once, and again on every navigation and every return to
    // the tab when the site changed or the answer is older than half an hour, so a page left open overnight shows the
    // frost that appeared (round fifty-four, 4).
    void frost.check();
    frost.start();
    // The example decides only once sync's key is read too: a device with sync set up is a grower's (the fix pass; R1, 2).
    try { await sync.init(); } finally { example.settled = true; }
    if (sync.configured) sync.schedule(1500);
    // Said for the end-to-end tests, as `data-ready` is: the page has decided, and no worker was registered for it.
    await known;
    if (!workerOn) document.documentElement.dataset.worker = 'deferred';
  });
  /**
   * The places a reader goes, in the bar on a desktop and the tab bar on a phone (round eighty-seven; the owner's look of
   * 7 November, DESIGN-87): Reference, My plants, Today and About, the same for everyone, with or without a collection, in
   * or out of the example (round sixty-three, V1, kept). The phone's fourth is More, the menu, which holds everything else
   * (My spaces, Propagation, Compare, Labels, Settings, Backup, Sync, the about pages); a desktop has the menu at the
   * bar's end. Round sixty-three's five tabs gave My spaces and Propagation a tab each; they are one tap further now, in
   * the menu, and their own pages are as they were. "My plants" is lit on a space's and a batch's pages too: they are the
   * grower's collection, as /plants is.
   */
  const REFERENCE = (p: string) => p === '/' || /^\/(species|browse|region|genus|family|compare)(\/|$)/.test(p);
  const OWN = (p: string) => /^\/(plants|places|propagation|labels)(\/|$)/.test(p);
  const TODAY = (p: string) => p.startsWith('/today') || p.startsWith('/frost');
  const tabs: Array<{ href: string; label: string; on: (p: string) => boolean }> = [
    { href: '/', label: 'Reference', on: REFERENCE },
    { href: '/plants', label: 'My plants', on: OWN },
    { href: '/today', label: 'Today', on: TODAY }
  ];
  const navs: Array<{ href: string; label: string; on: (p: string) => boolean }> = [...tabs, { href: '/about', label: 'About', on: (p) => p.startsWith('/about') || p.startsWith('/changes') }];
  /**
   * The about pages' Data and Changes (the pages of round eighty-seven's other half): linked once their pages are in the
   * build, so a build without them never links to a page that is not there (the prerender stops at a link that is a 404).
   */
  const ROUTES = import.meta.glob(['/src/routes/about/data/+page.svelte', '/src/routes/changes/+page.svelte']);
  const hasRoute = { data: '/src/routes/about/data/+page.svelte' in ROUTES, changes: '/src/routes/changes/+page.svelte' in ROUTES };
  /*
   * The top bar's search box is the browse pages' component (`SiteSearch`, the browse half of round eighty-seven), with its
   * list of answers; with no script it is a plain form that opens the front page's search for what was typed.
   */
  /**
   * Where the bar has no room for the box (a phone, a tablet: 960 px or less), the search is a button, and on a page with
   * the box (every page but the front page) the button opens the box over the bar, its list under it; leaving the box,
   * or its Cancel, closes it (round eighty-seven, the look's button and the browse box together). The front page's
   * button leads to the page's own box, as before.
   */
  let searchOpen = $state(false);
  const barBox = () => document.querySelector<HTMLInputElement>('#topbar .site-search input');
  async function openBarSearch(): Promise<boolean> {
    if (ownSearch || !barBox()) return false;
    searchOpen = true;
    await tick();
    barBox()?.focus();
    return true;
  }
  afterNavigate(() => { searchOpen = false; });
  /** The menu's two buttons, the bar's on a desktop and the tab bar's More on a phone: focus goes back to the one pressed. */
  let moreBtn = $state<HTMLButtonElement | null>(null);
  let openedBy: HTMLButtonElement | null = null;
  const toggleMenu = (b: HTMLButtonElement | null) => { openedBy = b; menuOpen = !menuOpen; };
  /** The search the bar's box is: the page's own box on the front page, which holds the catalogue's (round eighty-seven). */
  const ownSearch = $derived(page.url.pathname === '/');
  /**
   * "/" puts the cursor in the search box, from anywhere on a page, except while typing in a field (round eighty-seven;
   * DESIGN-87): the front page's own box there, the bar's elsewhere. A key with a modifier is the browser's. Not while
   * the menu or a dialog holds the focus (the photo viewer, any `aria-modal` one): it would take the cursor out of what
   * keeps it, behind it (round eighty-seven, the review of stage 1, M3).
   */
  function slashKey(e: KeyboardEvent) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (menuOpen || document.querySelector('[aria-modal="true"], dialog[open]')) return;
    const t = e.target as Element | null;
    if (typing(t) || (t instanceof HTMLElement && !!t.closest('[contenteditable]'))) return;
    const box = [...document.querySelectorAll<HTMLInputElement>('main .toolrow .searchbar, #topbar .site-search input')].find((x) => x.offsetParent !== null);
    // The one handler of the key (the box itself has none): where the bar's box is behind its button, it opens there.
    if (!box) { if (!ownSearch && barBox()) { e.preventDefault(); void openBarSearch(); } return; }
    e.preventDefault();
    box.focus();
    box.select?.();
  }
  $effect(() => {
    if (!collection.ready) return;
    // The hint is about the grower's own collection: the sample's twelve plants set it, and the visitor's other tabs drew a grower's tabs (round sixty-one; the records review, 17).
    // The page's collection, not the tab's flag: a Leave called off cleared the flag under a page still showing the example (round sixty-seven; triage-66 V3).
    if (PAGE_IN_DEMO) return;
    // A plant, a batch, or a species followed: the front page's own reading of the hint, and more, so the two never disagree about a grower.
    const grower = collection.accessions.length > 0 || collection.sowings.length > 0 || collection.mySpecies.size > 0;
    try {
      if (grower) localStorage.setItem('cultifolio.hasMine', '1');
      else localStorage.removeItem('cultifolio.hasMine');
    } catch {
      /* the hint is a convenience: without it the front page opens on the catalogue until the collection does */
    }
  });
  const places = [
    { href: '/', label: 'Species', on: (p: string) => p === '/' || p.startsWith('/species') },
    { href: '/plants', label: 'Plants', on: (p: string) => p.startsWith('/plants') },
    { href: '/places', label: 'My spaces', on: (p: string) => p.startsWith('/places') },
    { href: '/propagation', label: 'Propagation', on: (p: string) => p.startsWith('/propagation') },
    { href: '/today', label: 'Today', on: (p: string) => p.startsWith('/today') || p.startsWith('/frost') }
  ];
  // The crumb: what a detail page set, else the section this path belongs to.
  const parts = $derived(crumb.parts.length ? crumb.parts : [{ label: places.find((p) => p.on(page.url.pathname))?.label === 'Plants' ? 'My plants' : (places.find((p) => p.on(page.url.pathname))?.label ?? 'Cultifolio') }]);
  const isDetail = $derived(crumb.parts.length > 1);
  const back = $derived(isDetail ? (crumb.parts[crumb.parts.length - 2]?.href ?? '/') : null);
</script>

<svelte:head>
  <!-- In the server's HTML only: a page drawn on the device (the collection's pages) added them after its styles had already
       asked for the fonts, and the browser warned that the preloaded files went unused (round eighty; the phone review's 9). -->
  {#if !browser}
    <link rel="preload" as="font" type="font/woff2" href={sourceSansLatin} crossorigin="anonymous" />
  {/if}
  <!-- No <title> here: every page sets its own, and this one won on the server, so every species page was served as
       "Cultifolio" to crawlers and link previews (round fifty-nine; the accessibility and words review). -->
</svelte:head>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); else slashKey(e); }} />

<!-- The first thing focusable in the document, ahead of the top bar's eight or so stops; it sat after the bar and the
     menu, where a keyboard reached it last (round fifty-eight; the accessibility review). -->
<a class="skip" href="#main">Skip to content</a>

{#if locked}<LockScreen />{/if}

<!-- The top bar is the page's banner; the crumb is a breadcrumb trail, an ordered list in its own nav (round fifty-eight; the accessibility review). -->
<!-- Round eighty-seven (the owner's look): the name of the site, the search, the four places and a rule of ink under them.
     The menu, Back, the crumb, the example's mark, sync and "+" keep their places and their names. -->
<header id="topbar" data-cover="top" inert={locked}>
  <a class="wordmark" class:withback={!!back} href="/">Cultifolio</a>
  {#if back}<a class="iconbtn" href={back} aria-label="Back" onclick={(e) => { if (hops > 0) { e.preventDefault(); history.back(); } }}>‹</a>{/if}
  <nav class="crumb" class:detail={parts.length > 1} aria-label="Breadcrumb">
    <ol>
      {#each parts as c, i}
        <li>{#if i}<span class="sep" aria-hidden="true">›</span>{/if}{#if c.href && i < parts.length - 1}<a href={c.href}>{c.label}</a>{:else}<span class:last={i === parts.length - 1 && parts.length > 1} aria-current={i === parts.length - 1 ? 'page' : undefined}>{c.label}</span>{/if}</li>
      {/each}
    </ol>
  </nav>
  <ExampleChip />
  <!-- The search, on every page but the front page, whose own box searches the same catalogue and more (the grower's own
       plants): the browse pages' box and its list of answers (round eighty-seven), a form that opens the front page's
       search with no script. Where the bar has no room (960 px or less) it is a button that opens the box over the bar. -->
  {#if !ownSearch}
    <!-- Its keys are the box's own; the wrapper hears only an Escape the box left alone, and closes the opened bar. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="site-search" class:open={searchOpen} onfocusout={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) searchOpen = false; }} onkeydown={(e) => { if (e.key === 'Escape' && searchOpen && !e.defaultPrevented) barBox()?.blur(); }}><SiteSearch /></div>
  {:else}
    <!-- On the front page the bar's search is the way to the page's own box, which searches the catalogue and the grower's
         plants: it takes the cursor there, so the search is on the first screen under the lead (round eighty-seven). -->
    <a class="site-search site-search-box tobox" href="#search" onclick={(e) => { const box = document.querySelector<HTMLInputElement>('main .toolrow .searchbar'); if (box) { e.preventDefault(); box.scrollIntoView({ block: 'center' }); box.focus({ preventScroll: true }); } }}><span class="ph">Search a plant, a genus, a region</span><kbd aria-hidden="true">/</kbd></a>
  {/if}
  <a class="iconbtn searchicon" href="/#search" aria-label="Search the reference" onclick={(e) => { const box = document.querySelector<HTMLInputElement>('main .toolrow .searchbar'); if (box) { e.preventDefault(); box.scrollIntoView({ block: 'center' }); box.focus(); } else if (!ownSearch && barBox()) { e.preventDefault(); void openBarSearch(); } }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path></svg></a>
  <!-- The places, from every page, in the bar that is always there; the phone has them in the tab bar instead. The
       current one says so to a screen reader, not only in colour (round fifty-eight; the accessibility review). -->
  <nav class="topseg plain" aria-label="Main">
    {#each navs as pl}<a href={pl.href} class:on={pl.on(page.url.pathname)} aria-current={pl.on(page.url.pathname) ? 'page' : undefined}>{pl.label}</a>{/each}
  </nav>
  <!-- A disclosure of links, not an ARIA menu: expanded and controls say all of it, and "has a popup" promised menu keys it never had (round fifty-eight; the accessibility review). -->
  <button class="menubtn" type="button" bind:this={menuBtn} aria-expanded={menuOpen} aria-controls="menu" onclick={() => toggleMenu(menuBtn)}>More<span class="sr"> menu</span></button>
  <a class="iconbtn sync" href="/sync" title={sync.configured ? (sync.busy ?? (sync.offline ? (sync.unreached === 'server' ? 'Sync: the server did not answer; changes are kept here' : 'Sync: offline; changes are kept here') : sync.lastError ? 'Sync: ' + (syncWords(sync.lastError)?.text ?? sync.lastError) : sync.runs ? 'Synced' : 'Sync: not checked yet')) : 'Sync'} aria-label="Sync" class:on={sync.configured} class:busy={!!sync.busy} class:err={!!sync.lastError}>⟳</a>
  <!-- Not on the add page itself: pressed there it threw the half-filled form away for an empty one (round forty-nine, 3).
       It adds what the section is about, and says which (round fifty-eight; the grower review). -->
  <!-- In the example it leads out of it first, to the same form in the grower's own collection: a first plant added there
       was the example's, and deleted with it (round sixty-seven; triage-66 V1). -->
  {#if page.url.pathname !== adds.path}<a class="iconbtn" href={adds.href} title={adds.label} aria-label={adds.label} onclick={(e) => addLeavesExample(e, adds.href)}>+</a>{/if}
</header>
{#if menuOpen}
  <div class="scrim" onclick={closeMenu} aria-hidden="true"></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <nav id="menu" aria-label="Everything" bind:this={menuEl} onkeydown={trapTab}>
    <div class="menuhead"><span class="kick">Cultifolio</span><button class="iconbtn" type="button" aria-label="Close menu" onclick={closeMenu}>×</button></div>
    {#each menu as m, i (i)}
      <!-- The current page said to a screen reader, not only in colour (round sixty-seven; triage-66 P6, R45-25). -->
      {#if m}{@const on = m.href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/species') : page.url.pathname.startsWith(m.href)}<a href={m.href} class:on aria-current={on ? 'page' : undefined} rel={m.href.startsWith('http') ? 'external' : undefined}>{m.label}</a>{:else}<hr />{/if}
      {#if i === 4 && !demoTab}<button class="menuexample" type="button" id="menu-example" onclick={menuExample}>See the example collection</button>{/if}
    {/each}
  </nav>
{/if}
{#if vaultNote}<p class="vaultnote">{vaultNote}</p>{/if}
<!-- Another tab's change that this tab could not read in: said, with the reload that reads it (round eighty-four; A16). -->
{#if collection.readBehind && !vaultNote}<p class="vaultnote" role="alert" id="read-behind">{collection.readBehind} <button class="reloadbtn" type="button" onclick={() => location.reload()}>Reload</button></p>{/if}
<!-- The frost watch, reachable from every tab (round fifty-three, 3): the risk at the site, as the Today tab says it, on every page but that one. A refusal is said on the front page and the Today tab, not on every page. -->
<!-- This device's clock reads earlier than its own last change (round fifty-nine): said, not acted on. Two readings, by
     whether a sync answer has confirmed the clock: confirmed, the changes were made under a fast clock; not, the clock
     itself may be the one that is wrong. Either way an edit made now saves and shows; "Nothing is lost" was not true of
     every case and is not said (round sixty; the lead's wording, the outside review's A17). -->
{#if collection.clockBehindAt && privateRoute}{@const when = new Date(collection.clockBehindAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}<p class="clockbar" role="status" id="clockbar">{#if collection.clockTrusted}Some changes on this device are dated ahead of now, up to {when}: its clock was probably fast when they were made. They count here. Once synced, any change dated more than two days after the sync bundle carrying it arrived is parked on every device: kept, not applied, and offered with Apply on the Sync page. What you edit now saves and shows.{:else}This device's date reads earlier than its last change ({when}). What you edit now still saves and shows; set the date right when you can.{/if}</p>{/if}
{#if frostBar && !page.url.pathname.startsWith('/today') && page.url.pathname !== '/'}<a class="frostbar" class:warn={frostBar.tone === 'warn'} href="/today#frost" id="frostbar">{frostBar.text} <span class="go">Today ›</span></a>{/if}

<!-- On the pages about your own plants, links are not preloaded on hover: a preload of a species page sends that species' name to the
     server before any click, which the bucket lookups exist to avoid; a tap or click is a visit the grower chose (round thirteen, 2). -->
<main class="wrap" id="main" tabindex="-1" inert={locked} bind:this={mainEl} data-sveltekit-preload-data={privateRoute ? 'off' : 'hover'}>
  <ToastBar />
  <InstallBar />
  <GrowLayer />
  {@render children()}
</main>

<!-- The compare tray and its pill on the species pages, where species are picked, only (round eighty-four; P4): on a
     plant's page, a space and Today it stood over the grower's own lines ("Since watered"), and the menu, the footer and
     the Compare page itself reach the picks from anywhere. -->
{#if comparePage}<CompareBar low={tabAway} preload={privateRoute ? 'off' : 'hover'} />{/if}

<!-- Three lines, about the reader: the sources, every one, then what is kept, then the links (round fifty-eight; it was eight lines on a phone, about the server, and its list left four sources out). -->
<!-- On a page about your own plants the footer waits for the collection: drawn mid-screen under "Opening…" and then
     pushed off by the list, it was a layout shift of 0.2 to 0.29 on every load of /plants and /today (round sixty; the
     accessibility review, 2). And for the page's own content, when the page holds it (`frame.hold`): with 400 plants
     the collection was open before the list was drawn, and the shift came back (round eighty-four; P2, A12, B4). -->
{#if (!privateRoute || collection.ready) && (!frame.holding || !!collection.failed)}
<footer class="credits">
  <!-- The owner's words (round eighty-seven, approved 8 November), then the links; the sources every page draws on, each
       figure and photograph naming its own (round fifty-eight). "No text about a species", as /about says it, where the
       approved line said "no text on a species page": the pages' templates were written with Claude (/about/how#written). -->
  <p class="made">Made by Jonathan, who grows cacti, succulents and rare bulbs and got tired of care advice that never said where it came from. Built with Claude; no text about a species is written by it.</p>
  <p class="plain links1"><a href="/about">About</a>{#if hasRoute.data}{' · '}<a href="/about/data">Data</a>{/if}{#if hasRoute.changes}{' · '}<a href="/changes">Changes</a>{/if} · <a href="https://github.com/zomethingje-eng/cultifolio">Source</a> · <a href="/about/how#privacy">Privacy</a></p>
  <!-- Compare and How it is made from every page, now that the tab bar is four (round sixty-three, V1; round eighty-seven). -->
  <p class="plain links2"><a href="/compare">Compare species</a> · <a href="/about/how">How it is made</a> · <a href="/about/formats">Formats</a></p>
  <p>Sources: GBIF Backbone, WCVP (RBG Kew), CHELSA, NASA POWER, ETOPO, Natural Earth, iNaturalist, Wikimedia Commons, Wikidata, Wikipedia, Kew's extinction risk predictions, CITES Appendices, ChromoDB, WFO Plant List, Biodiversity Heritage Library; each figure and photograph names its own, with its licence. No account, no analytics. Your collection stays on this device{#if sync.configured}, and in a vault only your key opens{/if}.</p>
</footer>
{/if}

<!-- When a label does not fit its column whole, the bar shows its icons, each tab named by its label: a label never breaks
     inside a word ("Spec/ies", "Prop/agati/on" at 320 px with 200% text). Measured on the bar's own resize and once the
     web font is in (round sixty-two; the outside review's A11). -->
<nav id="tabbar" aria-label="Tabs" inert={locked} class:away={tabAway} data-cover="bottom" data-away={tabAway ? 'true' : undefined} onfocusin={() => (tabAway = false)} {@attach (bar: HTMLElement) => {
  const tight = () => [...bar.querySelectorAll<HTMLElement>('a > span:not(.sr), button > span:not(.sr)')].some((s) => s.offsetParent !== null && s.scrollWidth > s.clientWidth + 1);
  const fit = () => {
    // An attribute, not a class: the bar's class is Svelte's to set, and it changes as the bar hides. Taken off only when
    // there, so a fit that changes nothing invalidates no style.
    if ('icons' in bar.dataset) delete bar.dataset.icons;
    if ('small' in bar.dataset) delete bar.dataset.small;
    // First a smaller step, closer set: "Propagation" was 72 px in a 68 px column at 360 px with normal text, and five
    // bare icons on the commonest phone width was the fallback taking over too soon (round sixty-two; the verification
    // review's grower 1). Icons only when even that step breaks a word.
    if (!tight()) return;
    bar.dataset.small = '1';
    if (tight()) bar.dataset.icons = '1';
  };
  // Not measured here, during hydration: reading a label's width then laid the whole page out once more before its first
  // frame (round eighty-five; the cold front page's blocking time, outside review A). The observer's first call, made
  // after the browser's own layout of the frame, measures it.
  const ro = new ResizeObserver(fit);
  ro.observe(bar);
  for (const a of bar.querySelectorAll('a, button')) ro.observe(a); // a label's own width changes as the web font comes in, not the bar's
  void document.fonts?.ready.then(fit);
  return () => ro.disconnect();
}}>
  {#each tabs as pl (pl.href)}
    <a href={pl.href} class:on={pl.on(page.url.pathname)} aria-current={pl.on(page.url.pathname) ? 'page' : undefined}><!-- aria-current: round fifty-eight; the accessibility review -->
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if pl.label === 'Reference'}<path d="M12 3v18M5 8c4 0 7 2 7 6M19 8c-4 0-7 2-7 6M7 15c3 0 5 1.5 5 4M17 15c-3 0-5 1.5-5 4" />
        {:else if pl.label === 'My plants'}<path d="M6 21h12M9 21V10a3 3 0 0 1 6 0v11M12 10V4M9 6c0 0 3-2 3-2s3 2 3 2" />
        {:else}<circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />{/if}
      </svg>
      <span>{pl.label}</span>
    </a>
  {/each}
  <!-- More: the menu, everything the tab bar does not hold (round eighty-seven). Named "More menu", so its visible word is in its name. -->
  <button class="moretab" class:on={menuOpen} type="button" bind:this={moreBtn} aria-expanded={menuOpen} aria-controls="menu" onclick={() => toggleMenu(moreBtn)}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    <span>More</span><span class="sr">{' menu'}</span>
  </button>
</nav>

<style>
  .iconbtn.sync { color: var(--ink3); }
  .vaultnote { margin: 0; padding: 8px 16px; background: var(--bad); color: #fff; font-size: var(--fs-md); }
  .reloadbtn { background: none; border: 1px solid currentColor; border-radius: var(--r); color: inherit; font: inherit; font-weight: 600; padding: 0 12px; min-height: var(--tap); margin-left: 6px; cursor: pointer; }
  .clockbar { margin: 0; padding: 7px 16px; background: var(--warm-soft); color: var(--warm-ink); font-size: var(--fs-md); line-height: 1.4; border-bottom: 1px solid var(--rule); }
  .frostbar { display: block; padding: 7px 16px; background: var(--bad-soft); color: var(--ink); font-size: var(--fs-md); line-height: 1.4; border-bottom: 1px solid var(--rule); text-decoration: none; }
  .frostbar:hover { text-decoration: underline; }
  .frostbar .go { white-space: nowrap; color: var(--bad); font-weight: 600; margin-left: 4px; }
  /* A cold night above freezing, or a space's floor reached above it: amber, not the red of a frost (round eighty-two). */
  .frostbar.warn { background: var(--warm-soft); }
  .frostbar.warn .go { color: var(--warm-ink); }
  .iconbtn.sync.on { color: var(--accent); }
  .iconbtn.sync.busy { animation: spin 1.2s linear infinite; }
  .iconbtn.sync.err { color: var(--bad); }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Opaque, not a blur: a sticky bar that lets headings ghost through reads as two lines of text. Round eighty-seven: a
     rule of ink under it, the name of the site at its start, the search, the places; 56 px on a desktop, 52 on a phone. */
  #topbar { position: sticky; top: 0; z-index: 60; background: var(--bg); border-bottom: 1px solid var(--ink); display: flex; align-items: center; gap: 8px; padding: 2px max(16px, env(safe-area-inset-right)) 2px max(16px, env(safe-area-inset-left)); margin-inline: calc(-1 * max(16px, env(safe-area-inset-left))) calc(-1 * max(16px, env(safe-area-inset-right))); min-height: 52px; }
  /* Its content lines up with the page's column: the column's edge is (the body's width less the column) / 2 in from the
     body's, and the bar reaches 16 px past the body on each side. */
  @media (min-width: 701px) { #topbar { min-height: 56px; gap: 12px; padding-inline: max(16px, env(safe-area-inset-left), calc((100% - var(--maxw)) / 2 + 16px)); } }
  .wordmark { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 1.0625rem; letter-spacing: 0.01em; color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; min-height: max(40px, var(--tap)); padding-right: 4px; }
  .wordmark:hover { text-decoration: none; color: var(--ink); }
  /* On a phone a detail page's bar is Back and the page's name: the name of the site is the tab bar's Reference there. */
  @media (max-width: 480px) { .wordmark.withback { display: none; } }
  /* Padded as the body is, by the safe area where there is one: in landscape on a notched iPhone the menu button sat under
     the notch and "Add a plant" under the rounded corner, the bar padded 16 px inside a 47 px margin (round eighty-one;
     the phone review's 7). */
  .crumb { font-size: var(--fs-sm); line-height: max(40px, var(--tap)); color: var(--mut); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 0; }
  /* A finger's hit area (40 px) around a short word: the line box, not the glyph, is the target. */
  .crumb a { color: var(--mut); display: inline-block; padding: 0 2px; }
  .crumb a:hover { color: var(--ink); text-decoration: underline; }
  .crumb .sep { margin: 0 5px; color: var(--mut); }
  /* The trail as a list that reads as the one line it was (round fifty-eight; the accessibility review). Each part before
     the last is whole, and the last (the page's own name) takes what is left and ends in an ellipsis when cut: the
     section's link is a box the ellipsis cannot enter, so a narrow bar cut "SPECIES" to "SPECIE" with no mark, and at
     320 px the name was all ellipsis (round eighty-five; review-w W14, review-p P7). */
  .crumb ol { display: flex; align-items: baseline; margin: 0; padding: 0; list-style: none; min-width: 0; }
  .crumb li { flex: none; white-space: nowrap; }
  .crumb li:last-child { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* On a phone (480 px or less) a page's own name is the trail: Back leads to the part before it. */
  @media (max-width: 480px) {
    .crumb { flex: 1 1 auto; }
    /* A section's own page on a phone: the name of the site and the tab bar's lit tab say where the reader is; the trail is
       read, not drawn, so the bar keeps its room at 200% text (round eighty-seven). */
    .crumb:not(.detail) ol { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .crumb.detail li:not(:last-child) { display: none; }
    .crumb.detail li:last-child .sep { display: none; }
  }
  /* A page's own name, not the section's, is the trail on a desktop too (the bar names the section): the trail is read
     whole by a screen reader and drawn in the room the search leaves. */
  @media (max-width: 700px) and (max-height: 480px) {
    .crumb ol { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  }
  .crumb li a { text-decoration: none; } /* not the prose link's underline, which the theme gives every link in a list item (round fifty-eight; the accessibility review) */
  .crumb .last { color: var(--ink2); }
  .crumb .last :global(i) { font-family: var(--serif); }
  /* The search: the browse pages' component when it is mounted (it takes `.site-search`), a plain form until then. */
  .site-search { flex: 1 1 320px; max-width: 480px; min-width: 0; margin: 0 0 0 auto; }
  .site-search.tobox { color: var(--mut); text-decoration: none; cursor: text; }
  .site-search.tobox .ph { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .site-search.tobox:hover { border-color: var(--ink); text-decoration: none; color: var(--mut); }
  .iconbtn.searchicon { display: none; }
  @media (max-width: 700px) { .site-search { display: none; } .iconbtn.searchicon { display: inline-flex; margin-left: auto; color: var(--ink); } }
  /* A tablet's bar (701 to 960 px) has no room for the box beside the places and a page's name: the search is its button
     there, and a detail page's bar is Back and the page's name, as a phone's is (round eighty-seven; W14, P7's crumb). */
  @media (min-width: 701px) and (max-width: 960px) { .site-search { display: none; } .iconbtn.searchicon { display: inline-flex; margin-left: auto; color: var(--ink); } .wordmark.withback { display: none; } .crumb { flex: 1 1 auto; } }
  /* The box opened by that button lies over the bar, the bar's own height, until it is left (round eighty-seven). */
  @media (max-width: 960px) { .site-search.open { display: flex; align-items: center; position: absolute; inset: 0; z-index: 2; max-width: none; margin: 0; padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left)); background: var(--bg); } }
  /* The places as words, plain, the current one in ink and underlined (round eighty-seven). */
  #topbar .topseg { display: flex; gap: 20px; flex: none; margin: 0 0 0 8px; font-size: var(--fs-md); }
  #topbar .topseg > a { color: var(--link); text-decoration: none; display: inline-flex; align-items: center; min-height: max(36px, var(--tap)); padding: 0; white-space: nowrap; }
  #topbar .topseg > a:hover { text-decoration: underline; text-underline-offset: 3px; color: var(--hov); }
  #topbar .topseg > a.on { color: var(--ink); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 6px; }
  #topbar:not(:has(.site-search)) .topseg { margin-left: auto; }
  /* Closer set where the bar is narrow (round eighty-four; P3). */
  @media (max-width: 960px) { #topbar .topseg { gap: 14px; } }
  @media (max-width: 700px) { #topbar .topseg { display: none; } }
  /* Short and narrow (a phone in landscape, a laptop at 200% zoom: 640 x 400) has no tab bar, which steps away under
     480 px tall: the places are in the top bar there (round eighty-four; A17). */
  @media (max-width: 700px) and (max-height: 480px) { #topbar .topseg { display: inline-flex; gap: 10px; margin-left: auto; } .iconbtn.searchicon { margin-left: 0; } }
  @media (max-width: 600px) and (max-height: 480px) { #topbar { gap: 4px; } #topbar .topseg { gap: 8px; } .wordmark { display: none; } }
  .menubtn { flex: none; background: none; border: 0; padding: 0 2px; font: inherit; font-size: var(--fs-md); color: var(--link); cursor: pointer; min-height: max(36px, var(--tap)); }
  .menubtn:hover { text-decoration: underline; text-underline-offset: 3px; color: var(--hov); }
  .menubtn[aria-expanded='true'] { color: var(--ink); text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 6px; }
  /* On a phone the tab bar's More is the menu; where the tab bar steps away (short windows), the bar's own. */
  @media (max-width: 700px) and (min-height: 481px) { .menubtn { display: none; } }
  .iconbtn { border: 1px solid transparent; background: none; color: var(--ink2); font: inherit; font-size: var(--fs-base); font-weight: 600; padding: 4px 8px; border-radius: var(--r); line-height: 1.2; min-width: max(40px, var(--tap)); min-height: max(40px, var(--tap)); display: inline-flex; align-items: center; justify-content: center; text-align: center; }
  .iconbtn:hover { background: var(--sunk); color: var(--ink); text-decoration: none; }
  .scrim { position: fixed; inset: 0; z-index: 55; background: rgba(0, 0, 0, 0.18); }
  /* The menu: a list of links under a rule, at the bar's right on a desktop; the phone's opens from the left edge. */
  #menu { position: fixed; z-index: 65; top: 57px; right: max(12px, env(safe-area-inset-right)); width: 240px; background: var(--bg); border: 1px solid var(--ink); border-radius: var(--r); padding: 6px 0; display: flex; flex-direction: column; }
  /* No taller than the window, and scrolled by a finger on it, not the page under it (round eighty-one; the phone review's 6). */
  #menu { max-height: calc(100vh - 57px - 8px - env(safe-area-inset-bottom)); max-height: calc(100dvh - 57px - 8px - env(safe-area-inset-bottom)); overflow-y: auto; overscroll-behavior: contain; }
  /* A thumb's height, 44 px, as the touch token: the items were 41 px (round sixty-seven; triage-66 P6, R45-25). */
  #menu a { display: flex; align-items: center; padding: 6px 16px; color: var(--link); font-weight: 400; font-size: var(--fs-md); min-height: 44px; }
  #menu a:hover { background: var(--sunk); text-decoration: underline; }
  /* A link's look for the one item that is a button (it switches the tab into the example before it loads). */
  #menu .menuexample { display: block; width: 100%; text-align: start; padding: 6px 16px; border: 0; background: none; color: var(--link); font: inherit; font-weight: 400; font-size: var(--fs-md); min-height: 44px; cursor: pointer; }
  #menu .menuexample:hover { background: var(--sunk); text-decoration: underline; }
  #menu a.on { color: var(--ink); font-weight: 600; }
  #menu .menuhead { display: none; align-items: center; justify-content: space-between; padding: 0 4px 4px 16px; }
  #menu hr { border: 0; border-top: 1px solid var(--rule); margin: 6px 0; }
  @media (max-width: 700px) { #menu { top: 0; left: 0; right: auto; bottom: 0; max-height: none; width: min(78vw, 300px); border-radius: 0; border-width: 0 1px 0 0; padding-top: max(8px, env(safe-area-inset-top)); overflow-y: auto; } #menu .menuhead { display: flex; } }
  main { padding-block: 0 3rem; max-width: var(--maxw); }
  footer.credits { border-top: 1px solid var(--rule); margin: 44px auto 0; padding: 18px 0 40px; max-width: var(--maxw); font-size: var(--fs-sm); line-height: 1.6; color: var(--mut); overflow-anchor: none; } /* never a scroll anchor: what goes in above it must not carry the view down with it (round eighty; the phone review's 1) */
  footer.credits .made { font-size: 0.8125rem; max-width: 70ch; }
  footer.credits p:last-child { margin-top: 10px; font-size: var(--fs-xs); }
  @media (max-width: 700px) { footer.credits { padding-bottom: calc(64px + 2rem + env(safe-area-inset-bottom)); } }
  main:focus { outline: none; }
  /* Off the screen by its own height, whatever the text size: `top: -40px` left a strip of it showing at 200% text (round fifty-nine). */
  .skip { position: absolute; left: 16px; top: 0; z-index: 90; background: var(--ink); color: var(--bg); padding: 8px 14px; min-height: var(--tap); border-radius: var(--r); font-weight: 600; font-size: var(--fs-md); transform: translateY(calc(-100% - 4px)); }
  .skip:focus { transform: translateY(8px); outline: 2px solid var(--accent); }
  footer.credits p { margin: 0 0 4px; }
  /* A finger's 44 px by padding that the margin takes back, so each link's hit area is its word and 10 px either side and
     the words sit evenly between their dots: a 40 px minimum width centred the short words in wide boxes, and "Data" and
     "Changes" stood further from their dots than the rest (the review of stage 2's pages, 8). The dots before Data and
     Changes are written `{' · '}`: at the head of an `{#if}` the space before a dot was trimmed, "About· Data". */
  footer.credits a { display: inline-block; padding: 12px 10px; margin: -12px -10px; color: var(--link); text-decoration: none; }
  footer.credits a:hover { text-decoration: underline; text-underline-offset: 3px; }
  #tabbar { display: none; }
  @media (max-width: 700px) {
    main { padding-bottom: calc(64px + 2rem + env(safe-area-inset-bottom)); }
    /* As many equal columns as tabs shown, each allowed to shrink below its word: at 150 to 200% text "Today" went off
       the screen past a fixed bar nobody can scroll (round sixty; the accessibility review, 5). A word too long for its
       column wraps under its icon rather than pushing the next tab out. Round eighty-seven: four, on the paper, under a
       rule of ink; the current one in ink and heavier. */
    #tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 70; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); background: var(--bg); border-top: 1px solid var(--ink); padding-bottom: env(safe-area-inset-bottom); }
    #tabbar a, #tabbar .moretab { color: var(--ink2); font: inherit; font-size: 0.8125rem; font-weight: 400; min-height: 56px; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 2px; text-align: center; line-height: 1.15; background: none; border: 0; cursor: pointer; }
    /* Words whole: a label wraps between its words ("My / plants") and never inside one (round sixty-two; A11). */
    #tabbar a span, #tabbar .moretab > span:not(.sr) { max-width: 100%; overflow-wrap: normal; word-break: normal; hyphens: manual; }
    #tabbar svg { flex: none; }
    /* The smaller step: one size down, no side padding; a label still wraps only between its words (round sixty-two). */
    #tabbar:global([data-small]) a, #tabbar:global([data-small]) .moretab { font-size: var(--fs-xs); letter-spacing: 0; padding-left: 0; padding-right: 0; }
    /* A label that would not fit whole: every tab is its icon, larger, and the label stays its accessible name, read but
       not drawn (round sixty-two; A11). */
    #tabbar:global([data-icons]) a span, #tabbar:global([data-icons]) .moretab > span:not(.sr) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    #tabbar:global([data-icons]) svg { width: 26px; height: 26px; }
    #tabbar a:hover { text-decoration: none; }
    #tabbar a.on, #tabbar .moretab.on { color: var(--ink); font-weight: 600; }
    /* Out of the way while scrolling down, by its own height and the safe area under it (round fifty-eight; the grower review). */
    #tabbar { transition: transform 0.22s ease; }
    #tabbar.away { transform: translateY(100%); }
    /* Room at the end of the page for the compare pill above the tab bar (round fifty-eight; the grower review). */
    :global(body:has(.cmppill)) footer.credits { padding-bottom: calc(64px + 2rem + 56px + env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: reduce) { #tabbar { transition: none; } #tabbar.away { transform: none; } }
  /* Under 480 px tall the bottom bar would take a sixth of the screen: the places stay one tap away in the menu. */
  @media (max-height: 480px) { #tabbar { display: none !important; } footer.credits { padding-bottom: 0 !important; } }
</style>

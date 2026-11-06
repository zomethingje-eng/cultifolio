/**
 * The species page's two maps drawn when they near the viewport (round eighty-six; outside review B's 4, review P's P9).
 *
 * The maps are drawn from static files (`$lib/map/still`): the two coastlines (land110.svg, 27 kB sent; land50.svg, 100 kB
 * sent and 260 kB read) and a small file a region. Named in `href`, every one of them was fetched as the page was read,
 * three screens above the maps, and on a throttled phone they shared the line with the lead photograph: B measured the
 * photograph, the page's largest paint, at 5.6 to 5.8 s, and 0.9 s sooner with the map files blocked. So the page writes
 * them in `data-href` (`defer`), and this turns each into `href` when its map is within a screen of the viewport, or for
 * every map before a print. The maps' room is kept whatever they hold (`.map`'s aspect ratio, theme.css), so nothing
 * moves when they draw, and the range is said in words beside them either way.
 *
 * Offline: the service worker holds the two coastlines from its install, and a page read online hands it the region files
 * its maps draw (`keepForOffline`) once the page has loaded, so a page opened with no signal still draws them.
 */
/** How near the viewport a map is drawn: a screen above or below it. */
export const NEAR_MARGIN = '100% 0px';

/** Each deferred file of the maps under `root` named in `href`, so it is fetched and drawn. */
export function drawAll(root: Element | Document): void {
  for (const u of root.querySelectorAll('use[data-href]')) {
    u.setAttribute('href', u.getAttribute('data-href')!);
    u.removeAttribute('data-href');
  }
}

/**
 * Watches the maps under `root`: each is drawn when it nears the viewport, all of them before a print. Returns the undo.
 * Without IntersectionObserver every map is drawn at once, as before.
 */
export function drawNear(root: Element, win: Window & typeof globalThis = window): () => void {
  const maps = [...root.querySelectorAll('svg')].filter((m) => m.querySelector('use[data-href]'));
  if (!maps.length) return () => {};
  const all = () => drawAll(root);
  win.addEventListener('beforeprint', all);
  if (typeof win.IntersectionObserver !== 'function') {
    all();
    return () => win.removeEventListener('beforeprint', all);
  }
  const io = new win.IntersectionObserver(
    (seen) => {
      for (const e of seen) {
        if (!e.isIntersecting) continue;
        drawAll(e.target);
        io.unobserve(e.target);
      }
    },
    { rootMargin: NEAR_MARGIN }
  );
  for (const m of maps) io.observe(m);
  return () => {
    io.disconnect();
    win.removeEventListener('beforeprint', all);
  };
}

/** The static files the maps under `root` draw from, drawn yet or not, without their fragments. */
export function filesIn(root: Element | Document): string[] {
  const out = new Set<string>();
  for (const u of root.querySelectorAll('use')) {
    const h = u.getAttribute('data-href') ?? u.getAttribute('href') ?? '';
    if (h.startsWith('/maps/')) out.add(h.split('#')[0]);
  }
  return [...out];
}

/**
 * Hands the service worker the files the maps under `root` draw from, once the page has loaded and the browser is idle,
 * for it to keep: before round eighty-six every map file was fetched as the page was read, and so kept, and a page read
 * online and not scrolled to its maps would otherwise open offline without them. Nothing is asked for without a worker.
 * Returns the undo.
 */
export function keepForOffline(root: Element | Document, win: Window & typeof globalThis = window): () => void {
  const sw = win.navigator?.serviceWorker;
  if (!sw?.controller) return () => {};
  let stopped = false;
  let idle: number | undefined;
  const send = () => {
    if (stopped) return;
    const files = filesIn(root);
    if (files.length) sw.controller?.postMessage({ type: 'keep-maps', files });
  };
  const later = () => {
    if (stopped) return;
    idle = typeof win.requestIdleCallback === 'function' ? win.requestIdleCallback(send, { timeout: 5000 }) : win.setTimeout(send, 2000);
  };
  if (win.document.readyState === 'complete') later();
  else win.addEventListener('load', later, { once: true });
  return () => {
    stopped = true;
    win.removeEventListener('load', later);
    if (idle !== undefined) (typeof win.cancelIdleCallback === 'function' ? win.cancelIdleCallback(idle) : win.clearTimeout(idle));
  };
}

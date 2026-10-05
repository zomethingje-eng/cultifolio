/**
 * Whether this is an iPhone or iPad browser tab rather than the Home Screen app (round sixty; the product review's 5,
 * the self-review's 18). By features first: `navigator.standalone` exists only in Apple's mobile WebKit, which is what
 * every browser on iOS is, and an iPad that says it is a Mac is told apart by its touch points. The user agent is read
 * only where the features cannot say (an older iPhone).
 */
type Nav = { standalone?: boolean; maxTouchPoints?: number; userAgent?: string; platform?: string };

export function isIos(nav: Nav = typeof navigator === 'undefined' ? {} : (navigator as unknown as Nav)): boolean {
  const ua = nav.userAgent ?? '';
  if (!('standalone' in nav)) return false; // not Apple's mobile WebKit (desktop Safari has no `standalone` either)
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1; // iPadOS asks for the desktop site
}

/** On iOS, not opened from the Home Screen: Safari's storage rules apply to what is kept here. */
export function iosInBrowser(nav?: Nav, standaloneQuery: boolean = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches): boolean {
  const n = nav ?? (typeof navigator === 'undefined' ? {} : (navigator as unknown as Nav));
  return isIos(n) && n.standalone !== true && !standaloneQuery;
}

/**
 * The `Secure` attribute for the two cookies the pages write (the units, and the hemisphere for the species and compare
 * pages): sent over HTTPS only, as the whole site is (round eighty-two; the independent review's 33). Left off on a page
 * served over plain HTTP, which is only a local server (the browser suite's, `vite dev`): Safari's engine does not keep
 * a `Secure` cookie written there, and the units would not stick.
 */
export const secureAttr = (protocol: string = typeof location !== 'undefined' ? location.protocol : 'https:'): string => (protocol === 'https:' ? '; secure' : '');

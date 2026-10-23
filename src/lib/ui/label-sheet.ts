/**
 * The label stock a page opens on before the grower has picked one: US Letter (Avery 5160) where Letter is the paper
 * in the tray, the United States and Canada; A4 (Avery L7160) everywhere else. Every locale opened on 5160, so a UK or EU
 * grower's first sheet printed on the wrong paper size (round sixty; the grower review, 9).
 */
export function defaultSheet(lang: string | null | undefined): '5160' | 'L7160' {
  const region = (lang ?? '').replace('_', '-').split('-')[1]?.toUpperCase();
  return region === 'US' || region === 'CA' ? '5160' : 'L7160';
}

/**
 * A label's care line shown as whole clauses (`careParts`): where the label cannot hold them all in its two lines, the
 * last ones are dropped whole, with the separator before them, rather than cut mid-figure ("open sky 30–…" printed on
 * Avery 5160: round eighty-one, review W6). Each clause is a `.cl` child, which may wrap; one that does not end inside
 * the box (it overflows below) is hidden, last first, and the first always stays. Fitted in
 * one animation frame for every label waiting, reading every box before hiding anything, so fifteen hundred labels lay
 * out a few times, not once each; and again before printing.
 */
const waiting = new Set<HTMLElement>();
let frame = 0;
function fitAll(): void {
  frame = 0;
  const nodes = [...waiting];
  waiting.clear();
  const parts = nodes.map((n) => [...n.querySelectorAll<HTMLElement>(':scope > .cl')]);
  for (const cl of parts) for (const c of cl) { c.hidden = false; c.querySelector<HTMLElement>('.sep')?.removeAttribute('hidden'); }
  let open = nodes.map((_, i) => i);
  // One clause off each overflowing label per pass, all read then all written: at most as many passes as clauses.
  while (open.length) {
    const over = open.filter((i) => { const n = nodes[i]; return n.isConnected && n.scrollHeight > n.clientHeight + 1; });
    const next: number[] = [];
    for (const i of over) {
      const shown = parts[i].filter((c) => !c.hidden);
      if (shown.length < 2) continue; // the first clause stays
      shown[shown.length - 1].hidden = true;
      shown[shown.length - 2].querySelector<HTMLElement>('.sep')?.setAttribute('hidden', '');
      next.push(i);
    }
    open = next;
  }
}
const live = new Set<HTMLElement>();
const schedule = (n: HTMLElement) => { waiting.add(n); if (!frame && typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(fitAll); };
// Before printing, every label at once and at once: a frame may not come between the print dialog and the print.
const beforePrint = () => { if (frame) cancelAnimationFrame(frame); for (const n of live) waiting.add(n); fitAll(); };
export function fitClauses(node: HTMLElement, _key?: unknown) {
  if (!live.size && typeof addEventListener === 'function') addEventListener('beforeprint', beforePrint);
  live.add(node);
  schedule(node);
  void document.fonts?.ready.then(() => schedule(node));
  return {
    update: () => schedule(node),
    destroy: () => { waiting.delete(node); live.delete(node); if (!live.size) removeEventListener('beforeprint', beforePrint); }
  };
}

/**
 * A browse view's pin, as its page holds it (round eighty-seven, C6): whether the view is pinned, what it gained and lost
 * since it was pinned or last seen, and the changes when they are open. One object for the view's page, so the button in
 * its row of actions (PinButton) and the changes under that row (PinSince) read one state.
 *
 * Arriving from a pin (the front page's list, the search box's row) opens the changes at once (C9: "arriving from a pin
 * turns on New since you pinned"): the pin's link opens its view with the view's query in the move's own history state
 * (`openPin`, SvelteKit's `goto` state), read once by the view it names. Never in the address and never in the browser's
 * storage, so a shared link opens nothing of it and no key is kept. Opening the changes is seeing them: the view's species
 * now are those its next "since" counts from (`markSeen`, written only when they differ).
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { collection } from '$lib/db/collection.svelte';
import { pins, pin, unpin, markSeen } from './recent';
import { keysOf } from './data';
import { sinceOf, type Since } from './since';
import { sinceWords, todayIso, TOO_WIDE, goneWords, type Pin } from './pins';

/** Opens a pin's view, saying in the move's state that it was opened from that pin. */
export function openPin(href: string, view: string): void {
  // App.PageState (src/app.d.ts) names no field: the state is this module's alone, typed where it is read.
  void goto(href, { state: { pinArrival: view } as App.PageState });
}
/** A link's click that opens a pin in place (a click with a key held, or not the main button, is the browser's own). */
export function pinClick(e: MouseEvent, href: string, view: string): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openPin(href, view);
}
/** Whether this page was opened from the pin of `view`. */
export const arrivedFrom = (view: string): boolean => (page.state as { pinArrival?: unknown } | undefined)?.pinArrival === view;

export interface PinView { view: string; href: string; label: string }

export class PinState {
  mounted = $state(false);
  busy = $state(false);
  said = $state<string | null>(null);
  since = $state<Since | null>(null);
  /** The changes opened, as they were when opened (looking at them moves the pin's day to today). */
  panel = $state<{ added: string[]; removed: string[]; from: string } | null>(null);
  private askedFor = '';
  private viewFor = '';
  /** The arrival from a pin is read once for a view. */
  private used = false;
  constructor(private get: () => PinView) {}

  get mine(): Pin | undefined {
    return this.mounted && collection.ready ? pins().find((p) => p.view === this.get().view) : undefined;
  }
  /** Called once the page's scripts run. */
  start(): void {
    this.mounted = true;
  }
  /**
   * Asks the pinned view's changes once per view, pin and day seen; opens them when the page was opened from the pin.
   * A move to another view (the same page's component, a new address) closes the changes of the one before.
   */
  follow(): void {
    const view = this.get().view;
    if (view !== this.viewFor) { this.viewFor = view; this.panel = null; this.since = null; this.used = false; }
    const p = this.mine;
    const key = p ? `${view}|${p.id}|${p.seen}|${p.keys?.length ?? -1}` : '';
    if (!p || this.askedFor === key) return;
    this.askedFor = key;
    const arrived = !this.used && arrivedFrom(view);
    if (arrived) this.used = true;
    void sinceOf(p).then((s) => {
      if (this.askedFor !== key) return;
      this.since = s;
      if (arrived) this.show(p, s);
    });
  }
  show(p: Pin, s: Since): void {
    if (s.kind === 'changes' && (s.added.length || s.removed.length)) this.panel = { added: s.added, removed: s.removed, from: p.seen };
    if (s.kind === 'changes' || s.kind === 'fresh' || s.kind === 'wide') void markSeen(p, s.now);
  }
  toggle(): void {
    if (this.panel) { this.panel = null; return; }
    const p = this.mine;
    if (p && this.since) this.show(p, this.since);
  }
  async pin(): Promise<void> {
    const v = this.get();
    this.busy = true; this.said = null;
    const now = await keysOf(v.view);
    if (!now) { this.said = 'The reference was not reached, so the view was not pinned. Try again.'; this.busy = false; return; }
    const r = await pin({ href: v.href, view: v.view, label: v.label, n: now.n, keys: now.keys });
    this.said = r.ok ? 'Pinned. It is on the front page and in the search box.' : r.why;
    this.busy = false;
  }
  async unpin(): Promise<void> {
    const p = this.mine;
    if (!p) return;
    this.busy = true; this.said = null;
    await unpin(p.id);
    this.said = 'Unpinned.';
    this.panel = null;
    this.busy = false;
  }
  /** The pin's line: "+3 · −1 since 12 Nov", or why there is none. */
  get words(): string {
    const p = this.mine, s = this.since;
    if (!p || !s) return '';
    if (s.kind === 'changes') return sinceWords({ added: s.added.length, removed: s.removed.length }, p.seen, todayIso());
    if (s.kind === 'wide') return TOO_WIDE;
    if (s.kind === 'gone') return goneWords(s.codes);
    if (s.kind === 'fresh') return 'followed for changes from today';
    return 'changes not reached';
  }
  get changed(): boolean {
    return this.since?.kind === 'changes' && (this.since.added.length > 0 || this.since.removed.length > 0);
  }
}

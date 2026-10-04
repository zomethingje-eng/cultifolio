import { tick } from 'svelte';

/**
 * Focus the element a control was replaced by (a "×" that becomes "Remove?", "Archive" that becomes "Mark growing"):
 * without this, replacing the focused button drops keyboard focus to the top of the page mid-action (round eighteen, 14).
 * Runs after the next render, and only if the replacement exists.
 */
export async function focusNext(selector: string): Promise<void> {
  await tick();
  (document.querySelector(selector) as HTMLElement | null)?.focus();
}

/** The scroll behaviour the reader asked for: smooth, unless reduced motion is preferred (round fifty-eight; the accessibility review). */
export function motion(): ScrollBehavior {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

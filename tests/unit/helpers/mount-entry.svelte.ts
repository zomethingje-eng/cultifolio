/**
 * The page's side of tests/unit/helpers/mount.ts: the component mounted with its props as `$state`, so a test that
 * writes to `window.__props` updates the component as a parent's binding would, and reads back what it bound.
 */
import { mount, flushSync, type Component } from 'svelte';

export function start(C: Component<Record<string, unknown>>, initial: Record<string, unknown>): void {
  const props = $state(initial);
  const w = window as unknown as Record<string, unknown>;
  w.__props = props;
  w.__flush = flushSync;
  w.__c = mount(C, { target: document.getElementById('target')!, props });
}

<script lang="ts">
  /**
   * A word of art with its one-line meaning (round 103; the launch review's round 2, b): the word is a button that opens a
   * short tip, read from `terms.ts`, whose words are the glossary's on /about/how (a test holds the two together), with a
   * link to the glossary's entry. A press, Enter or Space opens and closes it; Escape and a press elsewhere close it; a
   * pointer resting on the word shows it while it rests, and nothing is reached by hover alone (WCAG 1.4.13). The tip
   * describes the button while it is open (`aria-describedby`), and is said as it opens (a status region).
   */
  import type { Snippet } from 'svelte';
  import { TERMS, termHref, type TermKey } from './terms';
  let { k, children }: { k: TermKey; children?: Snippet } = $props();
  const t = $derived(TERMS[k]);
  const uid = $props.id();
  const tipId = `tip-${uid}`;
  let pinned = $state(false);
  let hovered = $state(false);
  const open = $derived(pinned || hovered);
  let root: HTMLElement | undefined = $state();

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      pinned = false;
      hovered = false;
      e.stopPropagation();
    }
  }
  $effect(() => {
    if (!pinned) return;
    const away = (e: PointerEvent) => { if (root && !root.contains(e.target as Node)) pinned = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { pinned = false; hovered = false; } };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
  });
</script>

<!-- The wrapper holds the tip too, so a pointer moving from the word onto the tip keeps it open (WCAG 1.4.13, hoverable).
     Its pointer handlers only preview what the button opens; every interaction is the button's, so it needs no role. -->
<!-- The tip's region is always there, empty until opened: its words are said as they arrive, and a closed tip adds nothing
     to the page's text (a search engine's, a screen reader's reading of the line, a copy of it). The three are written with
     no space between them, so the word sits in its sentence as if plain ("Köppen–Geiger, worked out", not "Köppen–Geiger ,"). -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="term" bind:this={root} onpointerenter={(e) => { if (e.pointerType === 'mouse') hovered = true; }} onpointerleave={(e) => { if (e.pointerType === 'mouse') hovered = false; }}><button type="button" class="tw" aria-expanded={open} aria-describedby={open ? tipId : undefined} onclick={() => { pinned = !pinned; if (!pinned) hovered = false; }} onkeydown={key}>{#if children}{@render children()}{:else}{t.label}{/if}</button><span class="tip" id={tipId} role="status" hidden={!open}>{#if open}{t.tip} <a href={termHref(k)}>More<span class="visually-hidden"> on {t.label}</span></a>{/if}</span></span>

<style>
  .term { position: relative; display: inline; }
  /* The word reads as itself, marked by a dotted underline: a button by its role, not by its look. */
  .tw { all: unset; cursor: help; text-decoration: underline dotted; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: currentColor; }
  .tw:focus-visible { outline: 2px solid var(--focus, var(--accent)); outline-offset: 2px; border-radius: 2px; }
  .tip { position: absolute; z-index: 30; left: 0; top: calc(100% + 6px); width: max-content; max-width: min(300px, 80vw); padding: 8px 10px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink2); box-shadow: 0 4px 14px rgb(0 0 0 / 0.14); font: 400 var(--fs-sm) / 1.45 var(--ui); letter-spacing: 0; text-transform: none; text-align: left; white-space: normal; }
  .tip[hidden] { display: none; }
  .tip a { font-weight: 600; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>

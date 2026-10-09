<script lang="ts">
  import { toast } from '$lib/ui/toast.svelte';
  import { afterNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  afterNavigate(() => toast.onNavigate());
  let undoBtn = $state<HTMLButtonElement | null>(null);
  /** The toast whose action the keyboard has already been taken to once: the next Tab from where it was raised goes on as usual. */
  let diverted: string | null = null;
  const back = () => {
    toast.wayBack()?.focus();
  };
  /** Whether the toast has somewhere to send focus back to: where it was raised, else where the keyboard came in from. */
  let hasWayBack = $state(false);
  // A toast never sits over a field being filled: the next field a grower moves to puts away a toast that offers nothing
  // (on a phone it sat over the log form's lower fields; round fifty-eight, the grower review).
  onMount(() => {
    const away = (e: FocusEvent) => { const t = e.target as HTMLElement | null; if (toast.text && !toast.action && t?.matches?.('input, textarea, select')) toast.hide(); };
    // The keyboard reaches the action next: Tab from the control that raised a toast with an action goes to that action,
    // once; Tab past the toast's last control, or Escape, goes back to where focus was (round sixty; the accessibility review, 1).
    const keys = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !toast.text || !toast.action || !undoBtn) return;
      const key = toast.text + '\0' + toast.action.label;
      if (diverted === key || !toast.origin || document.activeElement !== toast.origin) return;
      diverted = key;
      e.preventDefault();
      undoBtn.focus();
    };
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('focusin', away); document.removeEventListener('keydown', keys, true); };
  });
  /** The action, then focus back where it was if the action left it nowhere. */
  async function act() {
    const a = toast.action;
    const from = toast.origin;
    toast.hide();
    a?.run();
    await tick();
    if (from?.isConnected && (!document.activeElement || document.activeElement === document.body)) from.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); back(); toast.hide(); return; }
    const btns = (e.currentTarget as HTMLElement).querySelectorAll('button');
    // Tab past the last control goes back where focus came from, and only when that is still on the page; with nowhere to
    // go back to, the Tab goes on through the page as usual. Swallowing it with nowhere to go held the keyboard on Undo for
    // good (WCAG 2.1.2; round sixty-one; the accessibility review, 1).
    if (e.key === 'Tab' && !e.shiftKey && e.target === btns[btns.length - 1]) {
      const to = toast.wayBack();
      if (to) { e.preventDefault(); to.focus(); }
    }
  }
  /** The first focus into the toast: where it came from is the way back when the toast was raised with focus nowhere (round sixty-one; the accessibility review, 1). */
  function onIn(e: FocusEvent) {
    const box = e.currentTarget as HTMLElement;
    const from = e.relatedTarget as HTMLElement | null;
    if (from && box.contains(from)) return; // a move between the toast's own buttons: already held
    if (!toast.origin && from instanceof HTMLElement && from !== document.body && !from.closest('.toastregion')) toast.entry = from;
    hasWayBack = !!toast.wayBack();
    toast.hold('focus'); // once per visit, released on leaving: a hold per button moved through was never given back (round sixty-one); for as long as focus stays (round sixty-two)
  }
  $effect(() => { void toast.text; hasWayBack = false; });
</script>

<!-- The live region is in the page from the start and only its words change: a region created with its text is not
     announced by many screen readers (round sixty; the accessibility review, 1). It holds the sentence alone, so an
     announcement no longer ends in "Undo Back to where you were" (round sixty-one; the accessibility review, 11). The
     line itself stays in the page too, folded to nothing while it has nothing to say, so the sentence is written once. -->
<div class="toastregion">
  <!-- A toast with no action lets taps through: it sits over the lower part of the page on a phone, where the next button a grower reaches for is (round fifty-five, 5). -->
  <!-- While focus or the pointer is on it, its timer waits, up to HOLD_MAX_MS (round sixty; round sixty-one; the accessibility review, 1). -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="toast" class:quiet={!toast.text} class:through={!toast.action} onfocusin={onIn} onfocusout={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) toast.release('focus'); }} onpointerenter={() => toast.hold('pointer')} onpointerleave={() => toast.release('pointer')} onkeydown={onKey}><span role="status" aria-live="polite" aria-atomic="true">{toast.said}</span>{#if toast.text && toast.action}{' '}<button type="button" class="undo" bind:this={undoBtn} onclick={act}>{toast.action.label}</button>{#if toast.origin || hasWayBack}<button type="button" class="skipback" onclick={back}>Back to where you were</button>{/if}{/if}</div>
</div>

<style>
  .toastregion { margin: 0; padding: 0; }
  .toast.through { pointer-events: none; }
  .toast { position: fixed; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 80; background: var(--ink); color: var(--bg); font-family: var(--ui); font-size: var(--fs-md); font-weight: 600; padding: 9px 16px; border-radius: 18px; box-shadow: var(--sh2); animation: toastin 0.18s ease-out; max-width: min(560px, calc(100vw - 32px)); width: max-content; overflow-wrap: anywhere; line-height: 1.35; } /* wraps rather than cutting the sentence off (round fifty-eight) */
  .toast { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  /* Nothing to say: folded to nothing, its live region kept in the page for the next sentence (round sixty-one). */
  .toast.quiet { width: 0; height: 0; padding: 0; border: 0; box-shadow: none; animation: none; pointer-events: none; }
  .undo { margin-left: 10px; background: var(--bg); color: var(--ink); border: 0; border-radius: 999px; padding: 4px 11px; font: inherit; font-weight: 700; cursor: pointer; }
  /* The way back for a keyboard: out of sight until it has focus, as the skip link is (round sixty). */
  .skipback { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
  .skipback:focus { position: static; width: auto; height: auto; clip: auto; margin-left: 8px; text-decoration: underline; min-height: var(--tap); }
  /* On a phone the line sits just above the tab bar, where the thumb that pressed the button is, not over the heading (round forty-nine, 3). */
  /* On the add form, above its pinned bar by the bar's measured height, one row of buttons or two: at 60 px fixed it
     covered "Save and add another" once the buttons wrapped (round sixty; the grower review, 3). */
  @media (max-width: 640px) { .toast { top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); } :global(body.stickyacts) .toast { bottom: calc(56px + var(--acts-h, 70px) + 10px + env(safe-area-inset-bottom)); } }
  /* Above select mode's bar by its measured height, as above the add form's: at 320 to 375 px the Undo toast covered the
     Archive button focus had just moved to (round sixty-two; the accessibility review, 3). By the bar's measured place
     (`--sel-lift`, safe area included), since on a short list the bar is not at the foot (the verification review's grower 3). */
  @media (max-width: 640px) { :global(body.grow-selecting) .toast { bottom: var(--sel-lift, calc(var(--tab-h, 57px) + var(--sel-h, 120px) + 16px + env(safe-area-inset-bottom))); } }
  .undo { min-height: var(--tap); min-width: var(--tap); } /* the tap token: 44 px under a finger (round fifty-nine) */
  /* The focus ring in the toast's own colours: the accent was 2.04:1 on the inverted toast in dark (round sixty-one; the accessibility review, 12). */
  .toast button:focus-visible { outline: 2px solid var(--bg); outline-offset: 2px; }
  /* Forced colours draw the toast as text on Canvas over the page: an edge sets it apart, and Undo reads as a button (round sixty-one; the accessibility review, 6). */
  @media (forced-colors: active) { .toast:not(.quiet), .toast .undo { border: 1px solid CanvasText; } }
  /* Opaque from its first frame: the fade-in drew the toast see-through over the select bar for 0.18 s, its words over the
     bar's in forced colours (round sixty-two; the outside review's A40). */
  @media (forced-colors: active) { .toast { animation: none; opacity: 1; background: Canvas; } }
  @keyframes toastin { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>

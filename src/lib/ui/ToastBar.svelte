<script lang="ts">
  import { toast } from '$lib/ui/toast.svelte';
  import { afterNavigate } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  afterNavigate(() => toast.onNavigate());
  let undoBtn = $state<HTMLButtonElement | null>(null);
  /** The toast whose action the keyboard has already been taken to once: the next Tab from where it was raised goes on as usual. */
  let diverted: string | null = null;
  const back = () => {
    const o = toast.origin;
    if (o?.isConnected) o.focus();
  };
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
    if (e.key === 'Tab' && !e.shiftKey && e.target === btns[btns.length - 1]) { e.preventDefault(); back(); }
  }
</script>

<!-- The live region is in the page from the start and only its words change: a region created with its text is not
     announced by many screen readers (round sixty; the accessibility review, 1). -->
<div class="toastregion" role="status" aria-live="polite" aria-atomic="true">
  {#if toast.text}
    <!-- A toast with no action lets taps through: it sits over the lower part of the page on a phone, where the next button a grower reaches for is (round fifty-five, 5). -->
    <!-- While focus or the pointer is on it, its timer waits (round sixty; the accessibility review, 1). -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="toast" class:through={!toast.action} onfocusin={() => toast.hold()} onfocusout={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) toast.release(); }} onpointerenter={() => toast.hold()} onpointerleave={() => toast.release()} onkeydown={onKey}>{toast.text}{#if toast.action}{' '}<button type="button" class="undo" bind:this={undoBtn} onclick={act}>{toast.action.label}</button>{#if toast.origin}<button type="button" class="skipback" onclick={back}>Back to where you were</button>{/if}{/if}</div>
  {/if}
</div>

<style>
  .toastregion { margin: 0; padding: 0; }
  .toast.through { pointer-events: none; }
  .toast { position: fixed; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 80; background: var(--ink); color: var(--bg); font-family: var(--ui); font-size: var(--fs-md); font-weight: 600; padding: 9px 16px; border-radius: 18px; box-shadow: var(--sh2); animation: toastin 0.18s ease-out; max-width: min(560px, calc(100vw - 32px)); width: max-content; overflow-wrap: anywhere; line-height: 1.35; } /* wraps rather than cutting the sentence off (round fifty-eight) */
  .toast { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .undo { margin-left: 10px; background: var(--bg); color: var(--ink); border: 0; border-radius: 999px; padding: 4px 11px; font: inherit; font-weight: 700; cursor: pointer; }
  /* The way back for a keyboard: out of sight until it has focus, as the skip link is (round sixty). */
  .skipback { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; padding: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
  .skipback:focus { position: static; width: auto; height: auto; clip: auto; margin-left: 8px; text-decoration: underline; min-height: var(--tap); }
  /* On a phone the line sits just above the tab bar, where the thumb that pressed the button is, not over the heading (round forty-nine, 3). */
  /* On the add form, above its pinned bar by the bar's measured height, one row of buttons or two: at 60 px fixed it
     covered "Save and add another" once the buttons wrapped (round sixty; the grower review, 3). */
  @media (max-width: 640px) { .toast { top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); } :global(body.stickyacts) .toast { bottom: calc(56px + var(--acts-h, 70px) + 10px + env(safe-area-inset-bottom)); } }
  .undo { min-height: var(--tap); min-width: var(--tap); } /* the tap token: 44 px under a finger (round fifty-nine) */
  @keyframes toastin { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>

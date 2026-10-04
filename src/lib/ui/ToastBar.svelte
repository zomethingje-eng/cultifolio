<script lang="ts">
  import { toast } from '$lib/ui/toast.svelte';
  import { afterNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  afterNavigate(() => toast.onNavigate());
  // A toast never sits over a field being filled: the next field a grower moves to puts away a toast that offers nothing
  // (on a phone it sat over the log form's lower fields; round fifty-eight, the grower review).
  onMount(() => {
    const away = (e: FocusEvent) => { const t = e.target as HTMLElement | null; if (toast.text && !toast.action && t?.matches?.('input, textarea, select')) toast.hide(); };
    document.addEventListener('focusin', away);
    return () => document.removeEventListener('focusin', away);
  });
</script>

{#if toast.text}
  <!-- A toast with no action lets taps through: it sits over the lower part of the page on a phone, where the next button a grower reaches for is (round fifty-five, 5). -->
  <div class="toast" class:through={!toast.action} role="status" aria-live="polite">{toast.text}{#if toast.action}{' '}<button type="button" class="undo" onclick={() => { const a = toast.action; toast.hide(); a?.run(); }}>{toast.action.label}</button>{/if}</div>
{/if}

<style>
  .toast.through { pointer-events: none; }
  .toast { position: fixed; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 80; background: var(--ink); color: var(--bg); font-family: var(--ui); font-size: var(--fs-md); font-weight: 600; padding: 9px 16px; border-radius: 18px; box-shadow: var(--sh2); animation: toastin 0.18s ease-out; max-width: min(560px, calc(100vw - 32px)); width: max-content; overflow-wrap: anywhere; line-height: 1.35; } /* wraps rather than cutting the sentence off (round fifty-eight) */
  .toast { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .undo { margin-left: 10px; background: var(--bg); color: var(--ink); border: 0; border-radius: 999px; padding: 4px 11px; font: inherit; font-weight: 700; cursor: pointer; }
  /* On a phone the line sits just above the tab bar, where the thumb that pressed the button is, not over the heading (round forty-nine, 3). */
  @media (max-width: 640px) { .toast { top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); } :global(body.stickyacts) .toast { bottom: calc(126px + env(safe-area-inset-bottom)); } }
  .undo { min-height: var(--tap); min-width: var(--tap); } /* the tap token: 44 px under a finger (round fifty-nine) */
  @keyframes toastin { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

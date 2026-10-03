<script lang="ts">
  import { toast } from '$lib/ui/toast.svelte';
  import { afterNavigate } from '$app/navigation';
  afterNavigate(() => toast.onNavigate());
</script>

{#if toast.text}
  <!-- A toast with no action lets taps through: it sits over the lower part of the page on a phone, where the next button a grower reaches for is (round fifty-five, 5). -->
  <div class="toast" class:through={!toast.action} role="status" aria-live="polite">{toast.text}{#if toast.action}{' '}<button type="button" class="undo" onclick={() => { const a = toast.action; toast.hide(); a?.run(); }}>{toast.action.label}</button>{/if}</div>
{/if}

<style>
  .toast.through { pointer-events: none; }
  .toast { position: fixed; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 80; background: var(--ink); color: var(--bg); font-family: var(--ui); font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 999px; box-shadow: var(--sh2); animation: toastin 0.18s ease-out; max-width: calc(100vw - 32px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .undo { margin-left: 10px; background: var(--bg); color: var(--ink); border: 0; border-radius: 999px; padding: 4px 11px; font: inherit; font-weight: 700; cursor: pointer; }
  /* On a phone the line sits just above the tab bar, where the thumb that pressed the button is, not over the heading (round forty-nine, 3). */
  @media (max-width: 640px) { .toast { top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); } :global(body.stickyacts) .toast { bottom: calc(126px + env(safe-area-inset-bottom)); } }
  .undo { min-height: 32px; }
  @keyframes toastin { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

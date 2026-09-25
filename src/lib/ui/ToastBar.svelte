<script lang="ts">
  import { toast } from '$lib/ui/toast.svelte';
  import { afterNavigate } from '$app/navigation';
  afterNavigate(() => toast.onNavigate());
</script>

{#if toast.text}
  <div class="toast" role="status" aria-live="polite">{toast.text}</div>
{/if}

<style>
  .toast { position: fixed; left: 50%; top: calc(52px + env(safe-area-inset-top)); transform: translateX(-50%); z-index: 80; background: var(--ink); color: var(--bg); font-family: var(--ui); font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 999px; box-shadow: var(--sh2); animation: toastin 0.18s ease-out; max-width: calc(100vw - 32px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @keyframes toastin { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
</style>

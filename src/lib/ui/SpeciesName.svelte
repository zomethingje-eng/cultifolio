<script lang="ts">
  import { nameParts } from '$core/names';
  let { name, authorship }: { name: string; authorship?: string } = $props();
  const parts = $derived(nameParts(name));
</script>

<span class="sciname">{#each parts as p}{#if p.italic}<i>{p.text}</i>{:else}{p.text}{/if}{/each}{#if authorship}&nbsp;<span class="auth">{authorship}</span>{/if}</span>

<style>
  .auth { font-style: normal; font-size: 0.72em; color: var(--ink3); }
</style>

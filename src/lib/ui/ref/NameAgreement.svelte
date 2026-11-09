<script lang="ts">
  /**
   * The WFO Plant List's reading of the page's name, one line in Names and registers (round eighty-seven, stage 2; the
   * sources agent): "WFO Plant List (2026-06): accepted", "a synonym of …", "holds the name, not yet placed", "does not
   * hold this name", or "not asked", with WFO's row linked, CC0 and the day read. Words: `source-words.ts`. After the
   * linked words, how the row was found where not by the IPNI id, and WFO's IPNI id where it is not Kew's (round
   * eighty-seven's review of stage 2, B1).
   */
  import type { NameAgreement } from '$dossier/schema';
  import { nameAgreementWords, WFO_TAXON } from './source-words';
  let { agreement = null }: { agreement?: NameAgreement | null } = $props();
  const w = $derived(nameAgreementWords(agreement));
</script>

<p class="srcline" id="wfo-line"><b>{w.head}</b> {#if agreement?.wfo && agreement.status === 'ok'}<a href={WFO_TAXON(agreement.kind === 'synonym' && agreement.ofId ? agreement.ofId : agreement.wfo)} rel="noopener">{w.body}</a>{:else}{w.body}{/if}{#if w.note}; {w.note}{/if}.{#if w.credit}{' '}<span class="cr">{w.credit}</span>{/if}</p>

<style>
  .srcline { margin: 4px 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink2); }
  .srcline b { color: var(--ink); font-weight: 600; }
  .cr { color: var(--mut); }
</style>

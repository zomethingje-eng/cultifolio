<script lang="ts">
  /**
   * Kew's predicted extinction risk in one line (round eighty-seven, stage 2; the sources agent): the model's probability
   * that the species is threatened, its 95% interval and its confidence, said as a model's prediction and never as an
   * assessment, with the paper, Kew's data's date, its licence and the day read. No IUCN category (IUCN's terms do not
   * allow it here): where the file marks the species as assessed, the line sends the reader to IUCN's own page, by the
   * IUCN id the page holds from Wikidata (P627), or says to read it there. Words: `source-words.ts`.
   */
  import type { Risk } from '$dossier/schema';
  import { riskWords, iucnUrl, dayWords, RISK_DOI, RISK_DATA } from './source-words';
  let { risk = null, iucnId = null }: { risk?: Risk | null; iucnId?: string | null } = $props();
  const w = $derived(riskWords(risk));
</script>

<p class="srcline" id="risk-line"><b>{w.head}</b> {w.body}{#if risk?.status === 'ok' && risk.assessed}{' '}The IUCN Red List has assessed this species; its assessment comes before this prediction{#if iucnId}: <a href={iucnUrl(iucnId)} rel="noopener">its page at IUCN</a>{:else}: read it at IUCN{/if}.{/if}{#if w.credit && risk}{' '}<span class="cr"><a href={RISK_DOI} rel="noopener">Bachman et al. 2024</a>, New Phytologist; <a href={RISK_DATA} rel="noopener">Kew's data</a> of {dayWords(risk.asOf) || 'a date not known'}, CC BY 4.0; read {risk.read}.</span>{/if}</p>

<style>
  .srcline { margin: 4px 0; font-size: var(--fs-sm); line-height: 1.45; color: var(--ink2); font-variant-numeric: var(--figs); }
  .srcline b { color: var(--ink); font-weight: 600; }
  .cr { color: var(--mut); }
</style>

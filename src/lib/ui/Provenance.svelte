<script lang="ts">
  import type { Dossier } from '$dossier/schema';
  import { UPSTREAM_WORD as label, UPSTREAM_NAME, climateDetail } from '$lib/ui/ref/upstream';
  let { dossier }: { dossier: Dossier } = $props();
  const rows = $derived(Object.entries(dossier.upstream));
  // "refused" for a refusal, as the photographs' line and the footer say it, never "did not answer"; each row named in
  // plain words with its id beside it, and the climate's reason read as its source did (round sixty-two; the grower
  // review's 2, the words review's 12).
  const detail = (src: string, d: string | undefined) => (src === 'climate' ? climateDetail(d, dossier.upstream) : d);
  // Two answers where one is taken is a settled answer, not a failure: no warning tone (round sixty-nine; triage-68 M8).
  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'none' || s === 'skipped' || s === 'ambiguous' ? '' : 'warn');
</script>

<details class="prov">
  <summary><span class="k">Where this page came from</span> <span class="faint small">built {dossier.built.slice(0, 10)}</span></summary>
  <div class="rows">
    {#each rows as [src, u]}
      <div class="row"><span>{UPSTREAM_NAME[src] ?? src}{#if UPSTREAM_NAME[src]}{' '}<code class="faint">{src}</code>{/if}</span> <span class="pill {tone(u.status)}">{label[u.status] ?? u.status}</span>{#if u.asOf}<span class="faint small">as of {u.asOf}</span>{:else if u.at && u.status !== 'skipped' && !/carried from build of/.test(u.detail ?? '')}<span class="faint small">asked {u.at.slice(0, 10)}</span>{/if}<!-- a source read from a file (Kew's files, a GBIF download) is as of the file's day, not asked on the build's (round seventy-two, B1) --><!-- a source not asked has no day it was asked (round sixty-two; outside review A35) -->{#if u.detail}<span class="faint small">{detail(src, u.detail)}</span>{/if}</div>
    {/each}
  </div>
  <!-- Not "this build", which reads as the app's version: the build of this page (round fifty-eight; the accessibility review). -->
  <p class="faint small">Every source is recorded as having answered, reported nothing, refused, failed, not been asked, or answered twice where one answer is taken (“not taken: two items answered”), and, for a source asked when this page was built, when: the figures are as the source held them that day; a source read from a file (Kew's World Checklist, a GBIF download) says "as of" the file's day instead; a row carried from an earlier build of the page names that build instead. Only “nothing to report” is ever shown as an absence. {#if dossier.occurrences.datasets.length}Records came from {dossier.occurrences.datasets.length} datasets via GBIF.org; each carries its own licence.{/if}</p>
</details>

<style>
  .prov { margin-top: 2.5rem; padding: 0.8rem 1rem; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  summary { cursor: pointer; display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
  .rows { display: grid; gap: 0.3rem; margin-block: 0.8rem; }
  .row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; font-size: var(--fs-md); }
  .small { font-size: var(--fs-md); }
</style>

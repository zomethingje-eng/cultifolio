<script lang="ts">
  import type { Dossier } from '$dossier/schema';
  let { dossier }: { dossier: Dossier } = $props();
  const rows = $derived(Object.entries(dossier.upstream));
  const label: Record<string, string> = {
    ok: 'answered',
    none: 'nothing to report',
    refused: 'did not answer',
    error: 'failed',
    skipped: 'not asked'
  };
  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'none' ? '' : s === 'skipped' ? '' : 'warn');
</script>

<details class="prov">
  <summary><span class="k">Where this page came from</span> <span class="faint small">built {dossier.built.slice(0, 10)}</span></summary>
  <div class="rows">
    {#each rows as [src, u]}
      <div class="row"><code>{src}</code> <span class="pill {tone(u.status)}">{label[u.status] ?? u.status}</span>{#if u.at && !/carried from build of/.test(u.detail ?? '')}<span class="faint small">asked {u.at.slice(0, 10)}</span>{/if}{#if u.detail}<span class="faint small">{u.detail}</span>{/if}</div>
    {/each}
  </div>
  <!-- Not "this build", which reads as the app's version: the build of this page (round fifty-eight; the accessibility review). -->
  <p class="faint small">Every upstream is recorded as having answered, reported nothing, or refused, and, for a source asked when this page was built, when: the figures are as the source held them that day; a row carried from an earlier build of the page names that build instead. Only “nothing to report” is ever shown as an absence. {#if dossier.occurrences.datasets.length}Records came from {dossier.occurrences.datasets.length} datasets via GBIF.org; each carries its own licence.{/if}</p>
</details>

<style>
  .prov { margin-top: 2.5rem; padding: 0.8rem 1rem; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); }
  summary { cursor: pointer; display: flex; gap: 0.8rem; align-items: baseline; flex-wrap: wrap; }
  .rows { display: grid; gap: 0.3rem; margin-block: 0.8rem; }
  .row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; font-size: var(--fs-md); }
  .small { font-size: var(--fs-md); }
</style>

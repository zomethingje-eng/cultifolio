<script lang="ts">
  /**
   * The record, in a reader's three parts (round 117; SPECIES 22): the registers that accept the name, each with its
   * file's day and the name's id there; what was looked for and is not there, each source that answered with nothing
   * (rule 2: never a source that was not asked, refused or failed, which "Where this page came from" says as that); and
   * where each figure comes from, each source that answered, with the day it was read. Every word of a source's state is
   * `registerRow`'s and `UPSTREAM_NAME`'s, as "Where this page came from" says them; that fold stays beneath, whole.
   */
  import type { Dossier } from '$dossier/schema';
  import { UPSTREAM_NAME, registerRow } from './upstream';
  import { localDateOf } from '$core/dates';
  // Only what it reads: the name, the record of the sources, and what `registerRow` reads of the climate.
  let { d }: { d: Pick<Dossier, 'name' | 'upstream'> & Parameters<typeof registerRow>[2] } = $props();
  const kew = $derived((d.name as { kew?: { file?: string; entry?: string; accepted?: { name?: string } } }).kew);
  const wfo = $derived((d as { nameAgreement?: { status?: string; kind?: string; release?: string; wfo?: string } }).nameAgreement);
  const rows = $derived(Object.entries(d.upstream).map(([src, u]) => ({ src, name: UPSTREAM_NAME[src] ?? src, ...registerRow(src, u, d) })));
  const none = $derived(rows.filter((r) => r.status === 'none'));
  const answered = $derived(rows.filter((r) => r.status === 'ok'));
  // A day as written stays; an instant is said on the reader's calendar, never cut to its UTC day (r84u).
  const day = (r: { asOf?: string; at?: string }) => { const v = r.asOf ?? r.at ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : (localDateOf(v) ?? ''); };
</script>

<section class="recparts" aria-labelledby="rec-accepted">
  <h3 id="rec-accepted">The name is accepted by</h3>
  <ul>
    {#if kew?.accepted && d.name.status === 'accepted'}<li>Kew's World Checklist of Vascular Plants{kew.file ? `, the file of ${kew.file}` : ''}{kew.entry ? `: entry ${kew.entry}` : ''}</li>{/if}
    {#if wfo?.status === 'ok' && wfo.kind === 'accepted'}<li>World Flora Online{wfo.release ? `, release ${wfo.release}` : ''}{wfo.wfo ? `: ${wfo.wfo}` : ''}</li>{/if}
    {#if !(kew?.accepted && d.name.status === 'accepted') && !(wfo?.status === 'ok' && wfo.kind === 'accepted')}<li class="muted">Neither register's reading of this name is held as accepted: see Names &amp; registers.</li>{/if}
  </ul>
  {#if none.length}
    <h3>Looked for, and not there</h3>
    <ul>{#each none as r (r.src)}<li>{r.name}{day(r) ? `, asked ${day(r)}` : ''}</li>{/each}</ul>
  {/if}
  {#if answered.length}
    <h3>Where each figure comes from</h3>
    <ul>{#each answered as r (r.src)}<li>{r.name}{day(r) ? `, read ${day(r)}` : ''}</li>{/each}</ul>
  {/if}
</section>

<style>
  .recparts { margin: 18px 0 0; }
  h3 { margin: 12px 0 4px; font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mut); font-weight: 600; }
  ul { margin: 0; padding-left: 1.1rem; font-size: var(--fs-md); }
  li { margin: 2px 0; }
  .muted { color: var(--ink3); }
</style>

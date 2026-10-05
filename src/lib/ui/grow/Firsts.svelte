<script lang="ts">
  /**
   * One line for each first recorded today or yesterday (round sixty; the grower review's §3): a plant's first flowering,
   * a batch's first germination count, a plant's first photograph. A plain reading of the log (`firsts.ts`); nothing is
   * written.
   */
  import { collection } from '$lib/db/collection.svelte';
  import { accNo, sowNo } from '$lib/db/types';
  import { plantHref, batchHref } from '$lib/db/links';
  import { localDate } from '$core/dates';
  import { today as day } from '$lib/ui/day.svelte';
  import { firstsOf, type First } from './firsts';
  const yesterday = (d: string) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() - 1); return localDate(t); };
  const list = $derived.by(() => {
    if (!collection.ready) return [] as First[];
    const ids = [...collection.accessions.map((a) => a.id), ...collection.sowings.map((s) => s.id)];
    return firstsOf(ids, { events: (id) => collection.events(id), photos: (id) => collection.photos(id).map((p) => ({ id: p.id, made: collection.madeOn('photo', p.id) })) }, day.current, yesterday(day.current));
  });
  const when = (d: string) => (d === day.current ? 'today' : 'yesterday');
  function line(f: First): { href: string; text: string } | null {
    if (f.kind === 'germinate') {
      const s = collection.sowing(f.recId);
      if (!s) return null;
      return { href: batchHref(s), text: `First seedlings up in ${sowNo(s)} ${s.taxonName}${f.n ? `: ${f.n} counted` : ''}, ${when(f.d)}.` };
    }
    const a = collection.accession(f.recId);
    if (!a) return null;
    const name = `${accNo(a)} ${a.taxonName}${a.cultivar ? ` ‘${a.cultivar}’` : ''}`;
    return { href: plantHref(a), text: f.kind === 'flower' ? `First flowers on ${name}, ${when(f.d)}.` : `First photograph of ${name}, added ${when(f.d)}.` };
  }
  const lines = $derived(list.map(line).filter((x): x is { href: string; text: string } => !!x));
</script>

{#if lines.length}
  <ul class="firsts" aria-label="Firsts" id="firsts">
    {#each lines as l (l.text)}<li><a href={l.href}>{l.text}</a></li>{/each}
  </ul>
{/if}

<style>
  .firsts { list-style: none; margin: 0 0 12px; padding: 0; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); overflow: hidden; }
  .firsts li + li { border-top: 1px solid var(--rule); }
  .firsts a { display: flex; align-items: center; min-height: var(--tap); padding: 8px 14px; border-left: 3px solid var(--accent); color: var(--ink); font-size: var(--fs-md); text-decoration: none; }
  .firsts a:hover { background: var(--sunk); }
</style>

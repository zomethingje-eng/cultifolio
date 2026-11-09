<script lang="ts">
  import BrowseView from '$lib/browse/BrowseView.svelte';
  import Crumbs from '$lib/browse/Crumbs.svelte';
  import { photoAt } from '$dossier/photo-size';
  import { firstSentences } from '$core/text';
  import { summaryRevision, summaryWhat } from '$lib/ui/ref/credit-days';
  import { notAnswered } from '$lib/ui/ref/upstream';
  import { RANGE_SOURCE } from '$lib/browse/sources';
  import Lens from '$lib/browse/Lens.svelte';
  import { LensState } from '$lib/browse/lens.svelte';
  let { data } = $props();
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const f = $derived(data.figures);
  // The collection lens (C8): the grower's plants of this genus, matched in this browser alone.
  const lens = new LensState(() => ({ kind: 'genus', genus: data.genus }));
  const s = $derived(data.record?.status === 'ok' ? data.record.summary : null);
  const excerpt = $derived(s ? firstSentences(s.text, 4) : null);
  const rev = $derived(summaryRevision(s as never, null));
  const refused = $derived(data.record && ['refused', 'error', 'skipped'].includes(data.record.status as string) ? ((data.record.status as string) === 'error' || /^error\b/.test(data.record.detail ?? '') ? 'error' : (data.record.status as string) === 'skipped' ? 'skipped' : 'refused') : null);
  const title = $derived(`${data.genus}: ${fmt(f.total)} species · Cultifolio`);
  const desc = $derived(`The ${fmt(f.total)} species of ${data.genus}${data.family ? ` (${data.family.name})` : ''} in Cultifolio's plant reference, ${fmt(f.climate)} with a habitat climate: native ranges from Kew's World Checklist, each figure with its source.`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={desc} />
  {#if data.view.qs}<meta name="robots" content="noindex, follow" />{/if}
  <link rel="canonical" href="https://cultifolio.com/genus/{data.slug}" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={desc} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Cultifolio" />
  <meta property="og:url" content="https://cultifolio.com/genus/{data.slug}" />
  {#if data.view.share}<meta property="og:image" content={photoAt(data.view.share.src, 'medium')} /><meta property="og:image:alt" content={data.view.share.alt} />{/if}
</svelte:head>

<Crumbs parts={[{ label: 'Genera', href: '/genus' }, ...(data.family ? [{ label: data.family.name, href: `/family/${data.family.slug}` }] : []), { label: data.genus, italic: true }]} />
<header class="ehead">
  <h1 class="h1"><i>{data.genus}</i></h1>
  <p class="sub">{fmt(f.total)} species in the reference{#if data.family}{' · family '}<a href="/family/{data.family.slug}">{data.family.name}</a>{/if}{' · '}{fmt(f.climate)} with a habitat climate · {f.grown === null ? 'grown, per iNaturalist: not counted' : `${fmt(f.grown)} grown, per iNaturalist${f.grownNotCounted ? `, ${fmt(f.grownNotCounted)} not counted` : ''}`}</p>
  <div class="cols">
    {#if s}
      <section>
        <h2 class="sec">About the genus</h2>
        <blockquote><p>{excerpt?.text}{#if excerpt?.more}{' '}<a href={s.url} rel="noopener">More on Wikipedia</a>{/if}</p></blockquote>
        <p class="src">Quoted from <a href={s.url} rel="noopener">Wikipedia, "{s.title}"</a>{summaryWhat(s)}{#if rev.rev}, {#if rev.href}<a href={rev.href} rel="noopener">revision {rev.rev}</a>{:else}revision {rev.rev}{/if}{/if}{#if rev.day}, read {rev.day}{/if}, <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener license">{s.licence}</a>.</p>
      </section>
    {:else if refused}
      <section>
        <h2 class="sec">About the genus</h2>
        <p class="note"><b>{refused === 'skipped' ? 'Not asked.' : 'Not checked.'}</b> Wikipedia {notAnswered(refused)} for the genus when the reference was built. Not a statement that it has no article.</p>
      </section>
    {/if}
    {#if data.regions.length}
      <section>
        <h2 class="sec">Where <i>{data.genus}</i> is native</h2>
        <table class="rg">
          <tbody>{#each data.regions as r (r.code)}<tr><th scope="row"><a href={r.href}>{r.label}</a></th><td>{fmt(r.n)}</td></tr>{/each}</tbody>
        </table>
        <p class="src">Species native to each region. A species counts in every region it is native to. {RANGE_SOURCE}</p>
      </section>
    {/if}
  </div>
  <Lens state={lens} total={f.total} here="of {data.genus} here" />
</header>

<BrowseView view={data.view} heading={false} {lens} />

<style>
  .ehead { border-bottom: 1px solid var(--rule); padding-bottom: 12px; }
  .h1 { margin: 10px 0 0; font-size: 2.5rem; font-weight: 400; line-height: 1.1; }
  .h1 i, .sec i { font-family: var(--serif); }
  .sub { margin: 6px 0 0; color: var(--ink2); }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 340px); gap: 32px; margin-top: 14px; }
  .cols > section:only-child { grid-column: 1 / -1; max-width: 520px; }
  .sec { margin: 0 0 6px; font-size: var(--fs-head); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mut, var(--ink3)); }
  blockquote { margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--ink); }
  blockquote p { margin: 0; }
  .rg { width: 100%; border-collapse: collapse; font-size: var(--fs-ui); }
  .rg th { text-align: left; font-weight: 400; padding: 4px 0; border-top: 1px solid var(--rule2, var(--rule)); }
  .rg td { text-align: right; padding: 4px 0; border-top: 1px solid var(--rule2, var(--rule)); font-variant-numeric: tabular-nums lining-nums; color: var(--ink2); }
  .src, .note { margin: 6px 0 0; font-size: var(--fs-sm); color: var(--mut, var(--ink3)); }
  .note { font-size: var(--fs-ui); color: var(--ink2); }
  @media (max-width: 899px) { .cols { grid-template-columns: minmax(0, 1fr); } .h1 { font-size: 2rem; } .rg th a { display: inline-flex; min-height: 44px; align-items: center; } }
</style>

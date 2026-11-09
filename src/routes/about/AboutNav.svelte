<script lang="ts">
  /**
   * The about pages' own row of links (round eighty-seven; plan D5, D6): the owner's page, the method, the formats, the
   * data and the changes, one row on every one of them, the page being read marked. A plain row of links, as the look
   * asks of a list in a nav (`plain`: underlined on hover), not the segmented pill the two pages had.
   */
  let { at }: { at: 'about' | 'how' | 'formats' | 'data' | 'changes' } = $props();
  const LINKS = [
    { id: 'about', href: '/about', label: 'About' },
    { id: 'how', href: '/about/how', label: 'How it is made' },
    { id: 'formats', href: '/about/formats', label: 'Formats' },
    { id: 'data', href: '/about/data', label: 'The data' },
    { id: 'changes', href: '/changes', label: 'Changes' }
  ] as const;
</script>

<nav class="aboutnav" aria-label="About">
  <ul>
    {#each LINKS as l (l.id)}
      <li><a class="plain" class:on={l.id === at} href={l.href} aria-current={l.id === at ? 'page' : undefined}>{l.label}</a></li>
    {/each}
  </ul>
</nav>

<style>
  .aboutnav { margin: 0 0 18px; border-bottom: 1px solid var(--rule); }
  .aboutnav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0 20px; }
  /* 44 px under a finger, the words whole at 200% text: the row wraps, a link never breaks inside a word. */
  .aboutnav a { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--link, var(--accent)); text-decoration: none; white-space: nowrap; font-size: var(--fs-md); }
  .aboutnav a:hover { color: var(--hov, var(--ink)); text-decoration: underline; }
  .aboutnav a.on { color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--ink); }
  .aboutnav a.on:hover { text-decoration: none; }
</style>

<script lang="ts">
  /**
   * A column's or a choice's note behind a "?" (round eighty-seven, C9: the list's footnotes into its headers' tips): a
   * button that shows and hides the words beside it, Escape or a second press hiding them. A button, not a disclosure
   * element, so it is one control a keyboard and a screen reader reach (aria-expanded) and the words are in the page
   * for both while shown.
   */
  let { label, text }: { label: string; text: string } = $props();
  let open = $state(false);
  const uid = $props.id();
  const id = `tip-${uid}`;
</script>

<span class="tip"><button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onclick={(e) => { e.preventDefault(); e.stopPropagation(); open = !open; }} onkeydown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); open = false; } }}>?</button>{#if open}<span class="words" {id} role="note">{text}</span>{/if}</span>

<style>
  .tip { display: inline-block; position: relative; font-weight: 400; vertical-align: middle; }
  /* A "?" in the link's colour, set a space apart from the words before it: not a ringed circle flush against "not
     counted" (the review of stage 2's pages, 8). Under a finger it takes 44 px as an invisible margin, so the line keeps
     its height, as the species page's help links do. */
  .tip { margin-left: 0.3em; }
  button { position: relative; display: inline; padding: 0 2px; border: 0; background: none; font: inherit; font-size: var(--fs-sm); font-weight: 600; line-height: inherit; color: var(--link, var(--accent)); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; cursor: pointer; }
  button:hover { color: var(--hov, var(--accent)); text-decoration-style: solid; }
  .words { position: absolute; z-index: 6; top: 24px; right: 0; width: min(320px, 80vw); background: var(--bg); color: var(--ink2); border: 1px solid var(--rule); border-radius: 4px; padding: 8px 10px; font-size: var(--fs-head); text-transform: none; letter-spacing: 0; text-align: left; white-space: normal; }
  @media (pointer: coarse), (max-width: 899px) { button::after { content: ''; position: absolute; left: 50%; top: 50%; width: var(--tap, 44px); height: var(--tap, 44px); transform: translate(-50%, -50%); } }
</style>

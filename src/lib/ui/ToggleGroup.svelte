<script lang="ts" generics="T extends string">
  /**
   * One segmented control for a choice of state within a page: a group of buttons with a name, each saying whether it
   * is pressed. It was three patterns (a `.seg` of buttons with or without `aria-pressed`, chips with `aria-pressed`, a
   * `nav` of buttons marked `aria-current`), and a screen reader heard a different thing from each. A choice between
   * addresses is not this: it stays links, with `aria-current="page"` (round fifty-eight; the accessibility review).
   *
   * The look is the theme's: `.seg` and its buttons, or with `chips` a `.chiprow` of `.chipbtn`; the pressed one carries
   * `.on`. `label` names the group, or `labelledby` points at a visible name instead.
   */
  type Option = { value: T; label: string; n?: string | number; title?: string; id?: string };
  let {
    options,
    value = $bindable(),
    label,
    labelledby,
    onchange,
    chips = false,
    class: cls = '',
    style,
    disabled = false
  }: { options: Option[]; value: T; label?: string; labelledby?: string; onchange?: (v: T) => void; chips?: boolean; class?: string; style?: string; disabled?: boolean } = $props();
  function choose(v: T) {
    value = v;
    onchange?.(v);
  }
</script>

<div class="{chips ? 'chiprow' : 'seg'} {cls}" role="group" aria-label={labelledby ? undefined : label} aria-labelledby={labelledby} {style}>
  <!-- A count beside a label is its own word to a screen reader: the name was "No photo in 12 months7" and "Due3", the
       count run into the label, since the two are drawn apart by a margin and not a space (round sixty-three; U4). -->
  {#each options as o (o.value)}
    <!-- The name from the content, a hidden comma between the two: an aria-label "All, 4" on a chip that reads "All4" was a
         name that does not match its text (axe's label-content-name-mismatch; round sixty-seven; triage-66 P6, R45-25). -->
    <button type="button" class={chips ? 'chipbtn' : undefined} class:on={o.value === value} aria-pressed={o.value === value} id={o.id} title={o.title} {disabled} onclick={() => choose(o.value)}>{o.label}{#if o.n != null}<span class="sep0">{', '}</span><span class="n">{o.n}</span>{/if}</button>
  {/each}
</div>

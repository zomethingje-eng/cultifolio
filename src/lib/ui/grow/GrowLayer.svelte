<script lang="ts">
  /**
   * What round sixty adds across the private pages, placed once in the layout (round sixty; the product review's 3 and 5,
   * the self-review's 18): the sample collection's banner, the browser's promise to keep the data asked for once after the
   * first plant is saved, and a one-line nudge to take a backup once there are five plants and none has been taken. Each
   * acts only on a collection a page has already opened; none opens it on a public page.
   */
  import { page, navigating } from '$app/state';
  import { collection } from '$lib/db/collection.svelte';
  import { sync } from '$lib/sync/engine.svelte';
  import { getMeta } from '$lib/db/vault';
  import { inDemo } from '$lib/db/demo';
  import { readSetting, writeSetting } from '$lib/ui/stored';
  import { toast } from '$lib/ui/toast.svelte';
  import DemoBar from './DemoBar.svelte';

  const PERSIST = 'cultifolio.persistAfterFirst';
  const NUDGE_HIDDEN = 'cultifolio.backupNudgeHidden';
  const n = $derived(collection.ready ? collection.accessions.length : 0);
  // The promise asked for once more when there is something to keep, on any browser: a browser weighs it by what the
  // site holds, and a grower who has just saved a plant is the one it is for. The answer is said once, and becomes the
  // "persisted" the pages already read.
  let asked = false;
  /** The browser's answer, waiting to be said: it is said once the page has settled, and only then counted as said. */
  let answer = $state<boolean | null>(null);
  $effect(() => {
    if (!collection.ready || n < 1 || asked || inDemo()) return;
    asked = true;
    if (readSetting(PERSIST, 'device') === '1') return;
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!st?.persist) return;
    void st.persist().then((ok) => {
      collection.persisted = ok;
      answer = ok;
    }, () => {});
  });
  // Said once the navigation has settled, and marked as said only then: shown on the add page as the plant page was
  // loading, it was put away with that navigation and never said again (round sixty-one; the harness review, 18).
  $effect(() => {
    if (answer === null || navigating.to) return;
    const ok = answer;
    answer = null;
    toast.show(ok ? 'This browser has promised to keep your plants.' : 'This browser has not promised to keep your data: take a backup now and then.', 10000, ok ? null : { label: 'Back up', run: () => { location.href = '/backup'; } });
    writeSetting(PERSIST, 'device', '1'); // asked again next time if the browser refuses the write: harmless
  });
  /** The fifth plant with no backup taken and no sync: one line on My plants and Today, put away for this tab on request. */
  let lastBackup = $state<string | null | undefined>(undefined);
  let hidden = $state(false);
  $effect(() => {
    void page.url.pathname; // read again on each page: a backup taken a page ago puts the line away
    if (!collection.ready || n < 5 || inDemo()) return;
    try { hidden = sessionStorage.getItem(NUDGE_HIDDEN) === '1'; } catch { /* shown */ }
    void getMeta<string>('lastBackup').then((v) => (lastBackup = v ?? null), () => (lastBackup = null));
  });
  const where = $derived(/^\/(plants|today)(\/|$)/.test(page.url.pathname) && page.url.pathname !== '/plants/import');
  const nudge = $derived(where && n >= 5 && lastBackup === null && !sync.configured && !hidden && !inDemo());
  function hide() {
    hidden = true;
    try { sessionStorage.setItem(NUDGE_HIDDEN, '1'); } catch { /* fine */ }
  }
</script>

<DemoBar />
{#if nudge}
  <p class="backupnudge" id="backup-nudge">{n} plants and no backup yet: a backup is one file you keep somewhere else. <a href="/backup">Back up now</a> <button class="linkish" type="button" onclick={hide}>Not now</button></p>
{/if}

<style>
  .backupnudge { margin: 12px 0 0; padding: 8px 12px; border-left: 3px solid var(--warn, #b8692a); background: var(--card); border-radius: var(--r); font-size: var(--fs-md); }
  .linkish { background: none; border: 0; padding: 0 0 0 6px; color: var(--ink3); font: inherit; text-decoration: underline; cursor: pointer; min-height: var(--tap); }
  /* The link in the sentence keeps the sentence's line but takes a thumb's height (round sixty-one; the accessibility review, 18). */
  .backupnudge a { display: inline-block; padding: 12px 2px; margin: -12px 0; }
  @media print { .backupnudge { display: none !important; } } /* a printed page carries the page, not advice about backups (round sixty-one; the triage, decision 4) */
</style>

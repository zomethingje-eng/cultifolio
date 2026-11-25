<script lang="ts">
  /**
   * The ways in as large rows (round 119; MYPLANTS 27 a, screen 1): the empty My plants page's three, and the phone's "+"
   * menu's four. The first is the primary one. In the example each leads out of it first, as every add does (round
   * sixty-seven; triage-66 V1).
   */
  import { addLeavesExample } from './example.svelte';
  import type { Way } from './ways';
  let { ways, compact = false, onpick }: { ways: readonly Way[]; compact?: boolean; onpick?: () => void } = $props();
</script>

<ul class="ways" class:compact>
  {#each ways as w, i (w.href)}
    <li>
      <a class="way" class:pri={i === 0} href={w.href} onclick={(e) => { addLeavesExample(e, w.href); onpick?.(); }}>
        <span class="sign" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            {#if w.sign === 'plus'}<path d="M12 5v14M5 12h14" />
            {:else if w.sign === 'camera'}<path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
            {:else if w.sign === 'list'}<path d="M6 7h12M6 12h12M6 17h8" />
            {:else}<path d="M12 20v-7M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z" />{/if}
          </svg>
        </span>
        <span class="words"><span class="t">{w.title}</span>{#if !compact}<span class="s">{w.sub}</span>{/if}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>
    </li>
  {/each}
</ul>

<style>
  .ways { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .way { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card, var(--bg)); color: var(--ink); text-decoration: none; }
  .way:hover { background: var(--sunk); }
  .way:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .way.pri { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
  .way.pri:hover { filter: brightness(1.08); }
  .sign { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-sm, 8px); background: var(--sunk); color: var(--ink2); }
  .way.pri .sign { background: rgb(255 255 255 / 0.14); color: inherit; }
  .words { display: grid; gap: 2px; }
  .t { font-weight: 600; font-size: var(--fs-md); }
  .s { font-size: var(--fs-sm); color: var(--ink3); }
  .way.pri .s { color: inherit; opacity: 0.9; }
  .chev { font-size: 1.4em; color: var(--ink3); }
  .way.pri .chev { color: inherit; }
  .compact .way { min-height: 48px; padding: 4px 12px; }
  .compact .sign { width: 36px; height: 36px; }
</style>

<script lang="ts">
  /**
   * A record that is here and not whole: what it has no value for, where the value may still come from, and (for a plant
   * whose only missing field is its status, while nothing is set aside on Sync) the one default it is safe to write.
   * It used to be told it was removed, or that there was no such record (round thirty-seven, R1-4; round thirty-eight, R1-1, R1-3).
   */
  import { sync } from '$lib/sync/engine.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import StateNote from '$lib/ui/StateNote.svelte';
  import Parked from '$lib/ui/Parked.svelte';

  let { kind, label, waiting }: { kind: 'accession' | 'sowing' | 'location'; label: string; waiting: { id: string; missing: string[]; parked?: boolean } } = $props();
  const WORD: Record<string, string> = { taxonName: 'name', status: 'status', method: 'method', sown: 'date', count: 'count', name: 'name' };
  const what = $derived(kind === 'accession' ? 'plant' : kind === 'sowing' ? 'batch' : 'place');
  const missing = $derived(waiting.missing.map((f) => WORD[f] ?? f));
  const them = $derived(missing.length === 1 ? 'it' : 'them');
  /** Set aside on Sync: a batch from a newer build may hold the real value, and a default written now would be newer than it and win on every device (round thirty-eight, R1-1). */
  const setAside = $derived(sync.quarantined.some((q) => q.kind !== 'photo')); // a set-aside photograph holds no field; every entry carries its kind since round fifty-seven
  const offerStatus = $derived(kind === 'accession' && missing.length === 1 && waiting.missing[0] === 'status' && !setAside);
  async function markGrowing() {
    await collection.put('accession', waiting.id, { status: 'growing' });
    toast.show(`${label} marked as growing.`);
  }
</script>

{#if waiting.parked}
  <!-- Every field it lacks is parked (made while this device's clock was wrong): said as that, with Apply, not as a wait for a newer version of the app (round sixty-two; the clock review's 3). -->
  <StateNote word="Parked" id="waiting-notice">{label}'s record is on this device, and its {missing.join(' and its ')} {missing.length === 1 ? 'is' : 'are'} parked: {missing.length === 1 ? 'it was' : 'they were'} written while a device's clock was wrong. Apply below writes {them} again as edits made now, and the {what} is listed again. <a href="/about/how#glossary">Glossary</a>.</StateNote>
  <Parked {kind} id={waiting.id} />
{:else}
<!-- What "set aside" meant, and "this version of the app", not "this build" (round fifty-eight; the accessibility review). A "sync bundle", not a "batch", which on these pages is a sowing (round sixty; the words review, 16). -->
<StateNote word="Waiting" id="waiting-notice">{label}'s record is on this device but not whole: it has no {missing.join(' and no ')}. {#if setAside}A sync bundle from a newer version of the app, which could not be read here (see <a href="/sync">Sync</a>), may hold {them}; this version of the app will read it when it can.{:else}A change from a newer version of the app may still bring {them}, or the file it came from never had {them}.{/if} Until then the {what} is not listed. <a href="/about/how#glossary">Glossary</a>.</StateNote>
{#if offerStatus}
  <p><button class="btn pri" onclick={markGrowing}>Mark it as growing</button></p>
{/if}
{/if}

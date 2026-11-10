/**
 * The collection lens as a page holds it (round eighty-seven, C8; $lib/browse/lens): read once the collection has
 * opened, from the reference's entries of the grower's species (by hash group), and shared by the lens's own section
 * (Lens.svelte) and the results it marks (BrowseView): which of the page's species are the grower's, and whether the
 * results show all, the grower's or the others. All of it in this tab; none of it in the address or any request.
 */
import { collection } from '$lib/db/collection.svelte';
import { entriesOr, isUnreached } from '$lib/ui/index.svelte';
import { lensOf, slugsToAsk, type Lens, type LensOf, type LensEntry } from './lens';

export type LensShow = 'all' | 'mine' | 'not';

export class LensState {
  /** 'opening': the collection is not open yet; 'none': no plant growing; 'unreached': the reference's entries did not come; 'refused': the browser's storage refused. */
  status = $state<'opening' | 'none' | 'ready' | 'unreached' | 'refused'>('opening');
  lens = $state<Lens | null>(null);
  /** Lenses of other places (a region's neighbours), by key, worked out from the same entries. */
  others = $state<Record<string, Lens>>({});
  on = $state(true);
  show = $state<LensShow>('all');
  private entries: Map<string, LensEntry> | null = null;
  private started = false;
  constructor(private of: () => LensOf, private more: () => Array<{ key: string; of: LensOf }> = () => []) {}

  /** The page's species the grower grows, by address, while the lens is on. */
  get mine(): ReadonlySet<string> | null {
    return this.on && this.lens ? new Set(this.lens.species.map((s) => s.slug)) : null;
  }
  /** Reads the collection once it has opened, and again whenever its plants change. */
  async read(): Promise<void> {
    if (collection.failed) { this.status = 'refused'; return; }
    if (!collection.ready) { this.status = 'opening'; return; }
    const plants = collection.accessions;
    const slugs = slugsToAsk(plants);
    if (!plants.some((a) => a.status === 'growing')) { this.status = 'none'; this.lens = null; return; }
    const got = slugs.length ? await entriesOr(slugs) : new Map();
    if (isUnreached(got)) { this.status = 'unreached'; return; }
    this.entries = got as Map<string, LensEntry>;
    this.lens = lensOf(plants, this.entries, this.of());
    const o: Record<string, Lens> = {};
    for (const m of this.more()) o[m.key] = lensOf(plants, this.entries, m.of);
    this.others = o;
    this.status = 'ready';
    this.started = true;
  }
  get ready(): boolean { return this.started && this.status === 'ready'; }
}

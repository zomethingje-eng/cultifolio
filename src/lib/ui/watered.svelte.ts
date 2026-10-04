/**
 * The stops watered from the Today tab, for the app's life rather than the page's: a stop keeps its mark, its plants and
 * its own Undo when the grower goes to another tab and comes back (round fifty-five, 5; the first reviewer's finding 6).
 * Let go after ten minutes, so a stop watered an hour ago is not still shown as a stop.
 */
export type WateredPlant = { id: string; no: string; /** The plant's name, so the done row names what was watered (round fifty-eight). */ name?: string };
export type Watered = { ids: string[]; plants: WateredPlant[]; at: number; /** The stop's height when it was watered: kept as its least height, so the stop below does not move. */ height: number };
const HOLD_MS = 10 * 60_000;

class WateredHere {
  map = $state(new Map<string, Watered>());
  get(key: string): Watered | null {
    const w = this.map.get(key);
    return w && Date.now() - w.at < HOLD_MS ? w : null;
  }
  add(key: string, ids: string[], plants: WateredPlant[], height = 0): void {
    const had = this.get(key);
    const next = new Map(this.map);
    next.set(key, { ids: [...(had?.ids ?? []), ...ids], plants: [...(had?.plants ?? []), ...plants], at: Date.now(), height: Math.max(had?.height ?? 0, height) });
    this.map = next;
  }
  take(key: string): Watered | null {
    const w = this.map.get(key) ?? null;
    if (!w) return null;
    const next = new Map(this.map);
    next.delete(key);
    this.map = next;
    return w;
  }
  prune(): void {
    let changed = false;
    const next = new Map(this.map);
    for (const [k, w] of next) if (Date.now() - w.at >= HOLD_MS) { next.delete(k); changed = true; }
    if (changed) this.map = next;
  }
}
export const wateredHere = new WateredHere();

/**
 * Preferences kept on this device that are not the site or the temperature units (the length units are here: round
 * fifty-eight). The first: whether pages about your own plants
 * may show the reference's photograph of the species (fetched from iNaturalist or the GBIF cache, which then learn which
 * species this address grows). Off unless the grower turns it on: a private page makes no third-party request by
 * default (round twelve, A1). Public species pages are unaffected; they show the photograph the visitor came to see.
 */
import { browser } from '$app/environment';
import { units } from '$lib/ui/units.svelte';
import { readSetting, writeSetting } from '$lib/ui/stored';

const KEY = 'cultifolio.prefs';
interface Prefs {
  referencePhotos: boolean;
  /** The "Kept on this device" line on Today, hidden at the grower's request (round forty-nine, 3). */
  hideKeeping?: boolean;
  /** Lengths (measurements, pot sizes) in millimetres or inches; null follows the temperature units until the grower sets it (round fifty-eight; the grower review). */
  lengthUnits?: LengthUnits | null;
}
export type LengthUnits = 'mm' | 'in';
const DEFAULTS: Prefs = { referencePhotos: false };

class PrefStore {
  current = $state<Prefs>({ ...DEFAULTS });
  /** Whether this device has ever saved preferences: a restore applies a backup's only where it has not. */
  stored = $state(false);
  loaded = $state(false);
  load() {
    if (this.loaded || !browser) return;
    try {
      const s = readSetting(KEY, 'device');
      const v = s ? (JSON.parse(s) as Partial<Prefs>) : null;
      const lu = v?.lengthUnits;
      this.current = { ...DEFAULTS, referencePhotos: v?.referencePhotos === true, hideKeeping: v?.hideKeeping === true, lengthUnits: lu === 'mm' || lu === 'in' ? lu : null };
      this.stored = !!s;
    } catch {
      this.current = { ...DEFAULTS };
    }
    this.loaded = true;
    // Two tabs, one switch: turned off in Settings in one tab, the other stops fetching too, without a reload (round seventeen, 9).
    if (!this.listening) {
      this.listening = true;
      window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { this.loaded = false; this.load(); } });
    }
  }
  private listening = false;
  set(p: Partial<Prefs>) {
    this.current = { ...this.current, ...p };
    // In the sample collection, for its tab only (round sixty-one; the grower review, 14); a private window keeps it for the page.
    if (writeSetting(KEY, 'device', JSON.stringify(this.current))) this.stored = true;
  }
  get hideKeeping(): boolean {
    return this.loaded && !!this.current.hideKeeping;
  }
  set hideKeeping(v: boolean) {
    this.set({ hideKeeping: v });
  }
  /** Millimetres or inches as the grower chose them, else as the temperature units go: inches with °F (round fifty-eight; the grower review). */
  get lengthUnits(): LengthUnits {
    return this.current.lengthUnits ?? (units.current === 'us' ? 'in' : 'mm');
  }
  /** Whether the lengths follow the temperature units: the grower has not chosen. */
  get lengthUnitsFollow(): boolean {
    return this.current.lengthUnits == null;
  }
  /** True only once loaded and switched on: before the store loads, no request goes out. */
  get referencePhotos(): boolean {
    return this.loaded && this.current.referencePhotos;
  }
}

export const prefs = new PrefStore();

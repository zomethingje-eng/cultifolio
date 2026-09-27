/**
 * This device's settings, which are not records in the change log: the site (Settings), the units cookie, the label
 * sheet choices and the preferences. They travel in a backup as `device.json` and come back on a restore, but only where
 * this device has none of its own: a restore must not overwrite a site set here with the site of the device that
 * exported the file (round twenty-two, 5). Read and written through the same stores the pages use.
 */
import { browser } from '$app/environment';
import { site } from '$lib/ui/site.svelte';
import { units } from '$lib/ui/units.svelte';
import { prefs } from '$lib/ui/prefs.svelte';
import { parseUnits } from '$core/units';
import type { DeviceSettings } from './backup';

const LABELS = 'cultifolio.labels';

export function readDeviceSettings(): DeviceSettings {
  if (!browser) return {};
  site.load();
  const out: DeviceSettings = {};
  if (site.current) out.site = site.current;
  const u = document.cookie.match(/(?:^|;\s*)cultifolio\.units=([^;]+)/)?.[1];
  if (u) out.units = u;
  try {
    const l = localStorage.getItem(LABELS);
    if (l) out.labels = JSON.parse(l);
  } catch {
    /* none */
  }
  out.prefs = prefs.current;
  return out;
}

/** Applies what this device lacks; returns the names of what was applied, for the report. */
export function applyDeviceSettings(d: DeviceSettings | null): string[] {
  if (!browser || !d) return [];
  const applied: string[] = [];
  site.load();
  const s = d.site as { lat?: unknown; lon?: unknown } | undefined;
  if (!site.current && s && typeof s.lat === 'number' && typeof s.lon === 'number' && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180) {
    site.set(s as never);
    applied.push('site');
  }
  const u = parseUnits(typeof d.units === 'string' ? d.units : null);
  if (u && !document.cookie.includes('cultifolio.units=')) {
    units.set(u);
    applied.push('units');
  }
  try {
    if (d.labels && typeof d.labels === 'object' && !localStorage.getItem(LABELS)) {
      localStorage.setItem(LABELS, JSON.stringify(d.labels));
      applied.push('label settings');
    }
  } catch {
    /* none */
  }
  const p = d.prefs as { referencePhotos?: unknown } | undefined;
  if (p && typeof p.referencePhotos === 'boolean' && !prefs.stored) {
    prefs.set({ referencePhotos: p.referencePhotos });
    applied.push('preferences');
  }
  return applied;
}

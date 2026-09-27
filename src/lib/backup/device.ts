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
  prefs.load();
  const out: DeviceSettings = {};
  // The site as the three fields it is: coordinates (unrounded, as Settings holds them) and a name (round twenty-three, 9).
  if (site.current) out.site = { lat: site.current.lat, lon: site.current.lon, ...(site.current.name ? { name: site.current.name } : {}) };
  const u = document.cookie.match(/(?:^|;\s*)cultifolio\.units=([^;]+)/)?.[1];
  if (u) out.units = u;
  try {
    const l = localStorage.getItem(LABELS);
    const v = l ? (JSON.parse(l) as Record<string, unknown>) : null;
    const shaped = v ? labelsShape(v) : null;
    if (shaped) out.labels = shaped;
  } catch {
    /* none */
  }
  if (prefs.stored) out.prefs = { referencePhotos: prefs.current.referencePhotos }; // only a preference this device has actually set
  return out;
}

/** The label sheet choices, as the labels page keeps them: the sheet key and three switches, nothing else. */
function labelsShape(v: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (typeof v.sheetK === 'string') out.sheetK = v.sheetK;
  for (const k of ['withQr', 'withCare', 'withSource']) if (typeof v[k] === 'boolean') out[k] = v[k];
  return Object.keys(out).length ? out : null;
}
const siteShape = (s: unknown): { lat: number; lon: number; name?: string } | null => {
  const o = s as { lat?: unknown; lon?: unknown; name?: unknown } | undefined;
  return o && typeof o.lat === 'number' && typeof o.lon === 'number' && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180 ? { lat: o.lat, lon: o.lon, ...(typeof o.name === 'string' && o.name ? { name: o.name } : {}) } : null;
};

/** What a restore would apply, without applying it: the settings in the file that this device lacks (round twenty-three, 9). */
export function previewDeviceSettings(d: DeviceSettings | null): string[] {
  if (!browser || !d) return [];
  site.load();
  prefs.load();
  const out: string[] = [];
  if (!site.current && siteShape(d.site)) out.push('site');
  if (parseUnits(typeof d.units === 'string' ? d.units : null) && !document.cookie.includes('cultifolio.units=')) out.push('units');
  try {
    if (d.labels && typeof d.labels === 'object' && labelsShape(d.labels as Record<string, unknown>) && !localStorage.getItem(LABELS)) out.push('label settings');
  } catch {
    /* none */
  }
  const p = d.prefs as { referencePhotos?: unknown } | undefined;
  if (p && typeof p.referencePhotos === 'boolean' && !prefs.stored) out.push('preferences');
  return out;
}

/** Applies what this device lacks; returns the names of what was applied, for the report. */
export function applyDeviceSettings(d: DeviceSettings | null): string[] {
  if (!browser || !d) return [];
  const applied: string[] = [];
  site.load();
  prefs.load();
  const s = siteShape(d.site);
  if (!site.current && s) {
    site.set(s as never);
    applied.push('site');
  }
  const u = parseUnits(typeof d.units === 'string' ? d.units : null);
  if (u && !document.cookie.includes('cultifolio.units=')) {
    units.set(u);
    applied.push('units');
  }
  try {
    const l = d.labels && typeof d.labels === 'object' ? labelsShape(d.labels as Record<string, unknown>) : null;
    if (l && !localStorage.getItem(LABELS)) {
      localStorage.setItem(LABELS, JSON.stringify(l));
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

/**
 * One way to ask for the forecast from the browser, shared by the front page,
 * the frost page and a bench, with one answer kept in session storage for
 * thirty minutes per site and units. The edge caches an hour per cell, but a
 * grower who opens the app ten times in an hour would still make ten calls,
 * and /api/forecast is rate-limited per address; this keeps that to two. A
 * refusal is never kept: the next open asks again.
 */
import { browser } from '$app/environment';
import type { Units } from '$core/units';

export const FORECAST_TTL_MS = 30 * 60_000;
const KEY = 'cultifolio.forecast';

export type ForecastAnswer<T> = { ok: true; body: T } | { ok: false; status: number };

type Entry = { at: number; body: unknown };

function readCache(k: string): unknown | undefined {
  if (!browser) return undefined;
  try {
    const all = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
    const e = all[k];
    return e && Date.now() - e.at < FORECAST_TTL_MS ? e.body : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(k: string, body: unknown) {
  if (!browser) return;
  try {
    const all = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
    const now = Date.now();
    for (const [key, e] of Object.entries(all)) if (now - e.at >= FORECAST_TTL_MS) delete all[key];
    all[k] = { at: now, body };
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a browser without session storage asks each time, as before */
  }
}

/** The forecast for a point in the reader's units: from the session's cache when fresh, else from /api/forecast. */
export async function getForecast<T = unknown>(lat: number, lon: number, units: Units, altM?: number | null): Promise<ForecastAnswer<T>> {
  const k = `${lat},${lon},${altM ?? ''},${units}`;
  const hit = readCache(k);
  if (hit !== undefined) return { ok: true, body: hit as T };
  const r = await fetch(`/api/forecast?lat=${lat}&lon=${lon}${altM != null ? `&alt=${altM}` : ''}&units=${units}`);
  if (!r.ok) return { ok: false, status: r.status };
  const body = (await r.json()) as T;
  writeCache(k, body);
  return { ok: true, body };
}

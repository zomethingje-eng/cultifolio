/**
 * The frost watch, once per page life, for every tab (round fifty-three, 3): the front page's Today lines, the Today
 * tab and the bar under the top bar all read the same answer, so a site is asked about once (and the forecast client
 * keeps the answer half an hour in session storage besides). A refusal is said, never shown as clear nights.
 */
import { site } from './site.svelte';
import { units } from './units.svelte';
import { getForecast, forecastRefusal, FORECAST_TTL_MS } from '$lib/weather/client';

export type Risk = { level: string; text: string };

class FrostWatch {
  /** The risk at the site, once read; null before, or without a site. */
  risk = $state<Risk | null>(null);
  /** Why it could not be read, in words, when it could not. */
  unchecked = $state<string | null>(null);
  hasSite = $state(false);
  /** True once a site was asked about, whatever the answer. */
  checked = $state(false);
  private p: Promise<void> | null = null;
  /** The site and units the answer held is for, and when it was read: a site set since, or an answer older than the forecast's half hour, is read again (round fifty-four, 4; the second reviewer's finding 2). */
  private readFor = '';
  private readAt = 0;
  /** Read the forecast for the site: once, then again when the site changed, the answer is stale, or `again` asks. Cheap to call on every navigation and on every return to the tab. */
  check(again = false): Promise<void> {
    site.load();
    const key = site.current ? `${site.current.lat},${site.current.lon},${units.current}` : '';
    const stale = !this.p || key !== this.readFor || Date.now() - this.readAt >= FORECAST_TTL_MS;
    if (this.p && !again && !stale) return this.p;
    this.readFor = key;
    this.readAt = Date.now();
    this.p = (async () => {
      const s = site.current;
      this.hasSite = !!s;
      if (!s) { this.risk = null; this.unchecked = null; this.checked = false; return; }
      try {
        const r = await getForecast<{ risk: Risk }>(s.lat, s.lon, units.current);
        if (r.ok) { this.risk = r.body.risk; this.unchecked = null; }
        else { this.risk = null; this.unchecked = forecastRefusal(r.status, 'Frost'); }
      } catch {
        this.risk = null;
        this.unchecked = forecastRefusal(null, 'Frost');
      } finally {
        this.checked = true;
      }
    })();
    return this.p;
  }
  /** The line the front page and the bar show: a refusal, or a risk that is not "none"; null when the nights are clear or nothing was asked. */
  get line(): { tone: 'warn' | 'bad'; text: string } | null {
    if (this.unchecked) return { tone: 'warn', text: this.unchecked };
    if (this.risk && this.risk.level !== 'none') return { tone: 'bad', text: this.risk.text };
    return null;
  }
}
export const frost = new FrostWatch();

/**
 * The frost watch for every tab (round fifty-three, 3; read again on a timer, on navigation and on a return to the tab since round fifty-four): the front page's Today lines, the Today
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
  /** The site and units the answer held is for, and when it was read: a site set since, or an answer older than the forecast's half hour, is read again (round fifty-four, 4; the second reviewer's finding 2). Reactive, so the Today tab's full forecast follows a re-read (round fifty-five, 5). */
  private readFor = '';
  readAt = $state(0);
  /** Which read is the current one: an answer to an earlier read (a slow request for the site before it was changed) publishes nothing (round fifty-five, 5; the second reviewer's finding 7). */
  private gen = 0;
  /** Read the forecast for the site: once, then again when the site changed, the answer is stale, or `again` asks. Cheap to call on every navigation, on every return to the tab and from a timer. */
  check(again = false): Promise<void> {
    site.load();
    const key = site.current ? `${site.current.lat},${site.current.lon},${units.current}` : '';
    const stale = !this.p || key !== this.readFor || Date.now() - this.readAt >= FORECAST_TTL_MS;
    if (this.p && !again && !stale) return this.p;
    const changedSite = key !== this.readFor;
    this.readFor = key;
    this.readAt = Date.now();
    const gen = ++this.gen;
    // A site changed: the old site's reading is not this site's, and is not shown while the new one is read.
    if (changedSite) { this.risk = null; this.unchecked = null; }
    this.p = (async () => {
      const s = site.current;
      if (gen === this.gen) this.hasSite = !!s;
      if (!s) { if (gen === this.gen) { this.risk = null; this.unchecked = null; this.checked = false; } return; }
      let risk: Risk | null = null, unchecked: string | null = null;
      try {
        const r = await getForecast<{ risk: Risk }>(s.lat, s.lon, units.current);
        if (r.ok) risk = r.body.risk;
        else unchecked = forecastRefusal(r.status, 'Frost');
      } catch {
        unchecked = forecastRefusal(null, 'Frost');
      }
      if (gen !== this.gen) return;
      this.risk = risk;
      this.unchecked = unchecked;
      this.checked = true;
    })();
    return this.p;
  }
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Watch from a timer as well: a page left open and in view sees a frost that appeared since it was opened (round fifty-five, 5; the first reviewer's finding 4). The forecast client's own half hour makes most ticks free. */
  start(): void {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.check(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void this.check(); });
  }
  /** The line the front page and the bar show: a refusal, or a risk that is not "none"; null when the nights are clear or nothing was asked. */
  get line(): { tone: 'warn' | 'bad'; text: string } | null {
    if (this.unchecked) return { tone: 'warn', text: this.unchecked };
    if (this.risk && this.risk.level !== 'none') return { tone: 'bad', text: this.risk.text };
    return null;
  }
}
export const frost = new FrostWatch();

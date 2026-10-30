/**
 * The frost watch for every tab (round fifty-three, 3; read again on a timer, on navigation and on a return to the tab since round fifty-four): the front page's Today lines, the Today
 * tab and the bar under the top bar all read the same answer, so a site is asked about once (and the forecast client
 * keeps the answer half an hour in session storage besides). A refusal is said, never shown as clear nights.
 */
import { site } from './site.svelte';
import { units } from './units.svelte';
import { getForecast, forecastRefusal, FORECAST_TTL_MS, REFUSED_TTL_MS } from '$lib/weather/client';
import { temp } from '$core/units';
import { nowMs } from '$core/hlc';

export type Risk = { level: string; text: string };
/** The parts of the forecast the line reads: its nights, when it was had, and the site's offset. */
type Nights = { fetched?: string; offsetH?: number; firstFrost?: string; firstCold?: string; days?: Array<{ date: string; tmin: number; tminAt?: string }> };
/** A space's cold floor, for the bar (round eighty-two): a night forecast below it is said whenever it falls. */
export type Floor = { name: string; floorC: number };
/** What the front page's Today line and the bar under the top bar say. `near`: the night is within `NEAR_H` hours of now, or the line is an alert or a refusal. */
export type FrostLine = { tone: 'warn' | 'bad'; text: string; near: boolean };
/** How far ahead a forecast night is said under the top bar on every page (round eighty-two; the independent review's 18: a cold night nine days out was a red bar on every page). */
export const NEAR_H = 72;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Sunday 1 November", for a table date (YYYY-MM-DD): the night named by its date, not a weekday alone, which nine days out is two Sundays. */
export function nightWords(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
/**
 * Hours from now to a night's minimum (its start, for a six-hour minimum; the day's start at the site without one). From
 * now, by the corrected clock, not from the forecast's own time (round eighty-four; outside review A16): a forecast kept
 * for its half hour, or an answer served from the session's copy, put a night up to an hour and a half late on the bar.
 */
function hoursTo(f: Nights, day: { date: string; tminAt?: string }, now = nowMs()): number {
  const at = day.tminAt ? Date.parse(day.tminAt.split('/')[0]) : Date.parse(`${day.date}T00:00:00Z`) - (f.offsetH ?? 0) * 3600_000;
  return Number.isFinite(at) ? (at - now) / 3600_000 : Infinity;
}

class FrostWatch {
  /** The risk at the site, once read; null before, or without a site. */
  risk = $state<Risk | null>(null);
  /** The forecast's nights the risk was read from. */
  nights = $state<Nights | null>(null);
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
    if (changedSite) { this.risk = null; this.nights = null; this.unchecked = null; }
    this.p = (async () => {
      const s = site.current;
      if (gen === this.gen) this.hasSite = !!s;
      if (!s) { if (gen === this.gen) { this.risk = null; this.nights = null; this.unchecked = null; this.checked = false; } return; }
      let risk: Risk | null = null, nights: Nights | null = null, unchecked: string | null = null, at = 0, held = false, refused = false;
      try {
        const r = await getForecast<{ risk: Risk; alertsStatus?: string; forecast?: Nights }>(s.lat, s.lon, units.current);
        // The NWS refused, or did not answer (two statuses since round sixty-seven; triage-66 S8): read again after five minutes either way.
        if (r.ok) { risk = r.body.risk; nights = r.body.forecast ?? null; at = r.at; refused = r.body.alertsStatus === 'refused' || r.body.alertsStatus === 'unanswered'; }
        else { unchecked = forecastRefusal(r, 'Frost'); held = r.held === true; }
      } catch {
        unchecked = forecastRefusal(null, 'Frost');
      }
      if (gen !== this.gen) return;
      this.risk = risk;
      this.nights = nights;
      this.unchecked = unchecked;
      this.checked = true;
      // The answer's own age, not the moment it was asked: one from the session's half hour is read again when that half
      // hour ends, not half an hour after it was taken from the cache (round fifty-eight; the client review).
      if (at && at < this.readAt) this.readAt = at;
      // A call the site held back is asked again at the first look after a minute (a navigation, the timer, a return to
      // the tab), not half an hour on: the cap is a minute's (round sixty-one).
      if (held) this.readAt = Date.now() - FORECAST_TTL_MS + 60_000;
      // An answer whose alerts the NWS did not answer is read again after five minutes, as the client and the server keep
      // it (round sixty-two; the words review, 18).
      if (refused) this.readAt = Math.min(this.readAt, this.readAt - FORECAST_TTL_MS + REFUSED_TTL_MS);
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
  /**
   * The line the front page shows: a refusal, or a risk that is not "none"; null when the nights are clear or nothing was
   * asked. Since round eighty-two (the independent review's 18) a forecast night has its date in words, is red
   * only at or below freezing (a cold night above it is amber), and says whether it is within `NEAR_H` hours of now
   * (round eighty-four; it was of the forecast's own time), which is when the bar under the top bar carries it. An alert of the National Weather Service is red and near.
   */
  get line(): FrostLine | null {
    if (this.unchecked) return { tone: 'warn', text: this.unchecked, near: false }; // a refusal is said on the front page and Today, not on every page
    const r = this.risk;
    if (!r || r.level === 'none') return null;
    const f = this.nights;
    const date = r.level === 'frost' ? f?.firstFrost : r.level === 'cold' ? f?.firstCold : undefined;
    const day = date ? f?.days?.find((d) => d.date === date) : undefined;
    if (!f || !day) return { tone: 'bad', text: r.text, near: true }; // an alert, or an answer without its nights: as it was said
    // The table's date gains its weekday and month in words, so a night far off is not one weekday among two (the text
    // keeps its own words before it: "Frost forecast: -2.0 °C around 05:00 Monday, your time (Monday 2 November,
    // 2026-11-02 in the table, MET Norway).").
    const text = r.text.replace(`(${day.date}`, `(${nightWords(day.date)}, ${day.date}`);
    void this.readAt; // read again with each reading of the forecast, so "now" moves on with it
    return { tone: day.tmin <= 0 ? 'bad' : 'warn', text, near: hoursTo(f, day) <= NEAR_H };
  }
  /**
   * The bar under the top bar, on every page but the front page and Today: the line when its night is near, else the first
   * forecast night below the cold floor of one of the grower's spaces (one not held by a heater: outside reaching a heater's
   * set-point is the heater's work, as the space's page says), whenever it falls, with its date. Null otherwise: a night
   * nine days out is said on Today, not on every page.
   */
  bar(floors: Floor[]): FrostLine | null {
    const l = this.line;
    if (l?.near && !this.unchecked) return l;
    const f = this.nights;
    if (this.unchecked || !f?.days?.length || !floors.length) return null;
    for (const d of f.days) {
      const under = floors.filter((x) => d.tmin < x.floorC).sort((a, b) => b.floorC - a.floorC)[0];
      if (!under) continue;
      return { tone: d.tmin <= 0 ? 'bad' : 'warn', near: false, text: `Forecast below ${under.name}'s ${temp(under.floorC, units.current, 1)} floor: ${temp(d.tmin, units.current, 1)} outside (${nightWords(d.date)}, ${d.date} in the table, MET Norway).` };
    }
    return null;
  }
}
export const frost = new FrostWatch();

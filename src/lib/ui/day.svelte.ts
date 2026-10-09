import { localDate } from '$core/dates';
import { onClockOffsetChange } from '$core/hlc';

/**
 * The calendar day, kept current while a page stays open: a page opened at 22:30 and used at 08:00 without a reload
 * (an app on a phone's home screen) must not date the morning's work yesterday (round twenty-four, 2). Checked when the
 * tab is shown or focused and once a minute; a form that took its default date from here follows the change only while
 * the grower has not typed another date.
 *
 * The one corrected day for every reading of "today" (round sixty-two; outside review B4): read from the corrected clock,
 * and read again the moment the correction changes (a sync's reading, another tab's), not at the next minute's look.
 */
class Today {
  current = $state(localDate());
  private started = false;
  start(): void {
    if (this.started) return;
    this.started = true;
    const check = () => {
      const d = localDate();
      if (d !== this.current) this.current = d;
    };
    check();
    onClockOffsetChange(check);
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    setInterval(check, 60_000);
  }
}
export const today = new Today();

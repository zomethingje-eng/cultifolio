import { localDate } from '$core/dates';

/**
 * The calendar day, kept current while a page stays open: a page opened at 22:30 and used at 08:00 without a reload
 * (an app on a phone's home screen) must not date the morning's work yesterday (round twenty-four, 2). Checked when the
 * tab is shown or focused and once a minute; a form that took its default date from here follows the change only while
 * the grower has not typed another date.
 */
class Today {
  current = $state(localDate());
  private started = false;
  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    const check = () => {
      const d = localDate();
      if (d !== this.current) this.current = d;
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    setInterval(check, 60_000);
  }
}
export const today = new Today();

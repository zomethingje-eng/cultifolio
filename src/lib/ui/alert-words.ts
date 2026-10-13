/**
 * What a page says of the National Weather Service's alerts when they were not checked (round sixty-nine; triage-68 P1,
 * R46-6). Round sixty-seven split the old status in two: `refused` (the NWS refused this site's request, its 429 or 403)
 * and `unanswered` (unreachable, a timeout, a 5xx, a body that was not alerts). Today read both; the place page read only
 * `refused`, so an NWS that did not answer gave a US grower "All clear." and the pill "frost: clear". One reading, here,
 * for both pages, so they cannot drift apart again.
 */

/** Whether the alerts were not checked: a refusal and no answer alike are "not checked", never "none" (rule 2). */
export function alertsUnchecked(status: string | null | undefined): boolean {
  return status === 'refused' || status === 'unanswered';
}

/**
 * Why they were not checked, as a clause with no full stop, worded apart for each: a refusal is said as a refusal and no
 * answer as no answer (rule 2). Empty when they were checked, or were not asked of the NWS at all (outside the US).
 */
export function alertsWhy(status: string | null | undefined): string {
  if (status === 'refused') return "the National Weather Service refused this site's request";
  if (status === 'unanswered') return 'the National Weather Service did not answer';
  return '';
}

/**
 * Whether the alerts were read: the National Weather Service answered for the point, with alerts or with none. Only then
 * may a clear forecast be "All clear." (round seventy; triage-69 P4, R47-12): a place outside the NWS's area, or one it
 * was not asked for (`n/a`, or a forecast from before the status was kept), read "All clear." and "frost: clear" with no
 * alerts service asked, which is a statement that no alert is in force that nothing made.
 */
export function alertsRead(status: string | null | undefined): boolean {
  return status === 'ok' || status === 'none';
}

/** Said of a place whose alerts no service read (not refused, not unanswered: none was asked), as a whole sentence. */
export const NO_ALERTS_SERVICE = 'No weather alerts are read for this place: this site reads them only from the US National Weather Service, which does not cover it.';

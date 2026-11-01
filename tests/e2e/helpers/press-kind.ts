/**
 * What one press on a disclosure's summary was, from what the page saw of it (round eighty-five, Q; the owner's PC at
 * round eighty-four: r69p-disclosure P5 on the add form, phone-WebKit, "pointerup never delivered", passed on its rerun).
 * No Playwright import, so a unit test reads it (tests/unit/r85q-press-kind.test.ts).
 *
 * Two failures look alike from outside, a disclosure that a press did not open, and must not be told apart by a retry:
 *
 * - **The engine lost the release** (`lost-release`). The page saw the finger go down on the summary and never saw it
 *   come up anywhere in the document: no `pointerup` and no `pointercancel` reached the window, and the summary had not
 *   moved by the time the press was over (read then, as there is no release to read it at). Nothing the page does can keep a release from the window: a page that moves
 *   the summary away, covers it or takes the pointer still gets its `pointerup` somewhere, or a `pointercancel`. This is
 *   the engine's, and the WebKit that Playwright builds for Windows does it now and then. In that engine on that system
 *   alone the press is made once more, and the first is recorded (an annotation and a line in the log), never hidden.
 * - **A real missed tap** (`missed`). The release reached the page and no toggle followed (the click did not come, or
 *   came and did not open it), or the summary moved between the press and the release (the page moved under the
 *   finger, the cause round sixty-seven found), or the press never reached the summary. These are the app's, and fail
 *   the single-press checks in every engine, with no second press.
 *
 * A press that opened the disclosure with one click and one toggle, its summary still, is `one-tap`. One that did so but
 * whose release the engine did not deliver (the click came, the `pointerup` did not) is `one-tap` too, with
 * `releaseLost`: the press worked, and the record says what the engine skipped.
 */
export type PressSeen = {
  /** The summary's top when the finger went down on it, or null if no `pointerdown` reached it. */
  downTop: number | null;
  /** The summary's top at its `pointerup`, or null if none reached it. */
  upTop: number | null;
  /** `pointerup` events that reached the window after the press began, wherever they landed. */
  ups: number;
  /** `pointercancel` events that reached the window after the press began. */
  cancels: number;
  /** The summary's top once the press was over (read after it). */
  endTop: number | null;
  clicks: number;
  toggles: number;
  opened: boolean;
};

export type PressKind = { kind: 'one-tap'; releaseLost: boolean } | { kind: 'lost-release' } | { kind: 'missed'; why: string };

export function pressKind(p: PressSeen): PressKind {
  // Still under the finger: at the release, or, with no release on the summary to read it at, once the press was over.
  const still = p.downTop !== null && (p.upTop !== null ? p.upTop === p.downTop : p.endTop === p.downTop);
  const noRelease = p.downTop !== null && p.ups === 0 && p.cancels === 0;
  if (p.opened && p.clicks === 1 && p.toggles === 1 && still) return { kind: 'one-tap', releaseLost: noRelease };
  if (noRelease && still && p.clicks === 0 && p.toggles === 0 && !p.opened) return { kind: 'lost-release' };
  if (p.downTop === null) return { kind: 'missed', why: 'the press never reached the summary' };
  if (p.cancels > 0) return { kind: 'missed', why: 'the browser cancelled the press (the page scrolled or moved under it)' };
  if (!still) return { kind: 'missed', why: `the summary moved under the press (${p.downTop} at the press, ${p.upTop ?? 'no release on it'} at the release, ${p.endTop} after)` };
  if (p.clicks === 0) return { kind: 'missed', why: 'the release reached the page and no click followed' };
  if (p.toggles === 0) return { kind: 'missed', why: 'a click came and the disclosure did not toggle' };
  return { kind: 'missed', why: `${p.clicks} clicks and ${p.toggles} toggles for one press${p.opened ? '' : ', and it is shut'}` };
}

/**
 * Whether a lost release is pressed again here: in WebKit on Windows only, where the quirk is seen. Anywhere else a lost
 * release fails as any missed tap does, so a new engine's fault is read, not retried.
 */
export function retriesLostRelease(browserName: string | undefined, platform: string): boolean {
  return browserName === 'webkit' && platform === 'win32';
}

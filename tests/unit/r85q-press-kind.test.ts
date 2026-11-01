/**
 * Round eighty-five, Q: a release the engine lost told apart from a missed tap (tests/e2e/helpers/press-kind.ts). The
 * owner's PC at round eighty-four: r69p-disclosure P5 on the add form, phone-WebKit, "pointerup never delivered", which
 * the single-press check read as the summary having moved (its `upTop` was null) and failed; its rerun passed. On
 * r85base there was no such reading: every press with no release on the summary was "moved".
 */
import { describe, it, expect } from 'vitest';
import { pressKind, retriesLostRelease, type PressSeen } from '../e2e/helpers/press-kind';

const tap = (o: Partial<PressSeen> = {}): PressSeen => ({ downTop: 412, upTop: 412, ups: 1, cancels: 0, endTop: 412, clicks: 1, toggles: 1, opened: true, ...o });

describe('what one press was', () => {
  it('a press that opened it with one click and one toggle, the summary still, is one tap', () => {
    expect(pressKind(tap())).toEqual({ kind: 'one-tap', releaseLost: false });
  });
  it('the engine lost the release: down on the summary, nothing reached the window after, nothing followed, the summary still', () => {
    expect(pressKind(tap({ upTop: null, ups: 0, clicks: 0, toggles: 0, opened: false }))).toEqual({ kind: 'lost-release' });
  });
  it('the release lost but the click delivered (it opened): one tap, and the loss is recorded', () => {
    expect(pressKind(tap({ upTop: null, ups: 0 }))).toEqual({ kind: 'one-tap', releaseLost: true });
  });
  it('a real missed tap is never a lost release', () => {
    // The release reached the summary and no click followed.
    expect(pressKind(tap({ clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('no click followed') });
    // The release landed elsewhere (something covered the summary, or took the pointer): the page got it.
    expect(pressKind(tap({ upTop: null, ups: 1, clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed' });
    // The page moved under the finger: round sixty-seven's cause.
    expect(pressKind(tap({ upTop: 480, endTop: 480, clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('moved') });
    // No release reached the page, but the summary is elsewhere now: the page moved, so it is not the engine's alone.
    expect(pressKind(tap({ upTop: null, ups: 0, endTop: 530, clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('moved') });
    // The browser cancelled the press (a scroll began).
    expect(pressKind(tap({ upTop: null, ups: 0, cancels: 1, clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('cancelled') });
    // The press never reached the summary.
    expect(pressKind(tap({ downTop: null, upTop: null, ups: 0, clicks: 0, toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('never reached') });
    // A click that did not toggle, and a double toggle.
    expect(pressKind(tap({ toggles: 0, opened: false }))).toMatchObject({ kind: 'missed', why: expect.stringContaining('did not toggle') });
    expect(pressKind(tap({ clicks: 2, toggles: 2, opened: false }))).toMatchObject({ kind: 'missed' });
  });
  it('a lost release is pressed again in WebKit on Windows alone', () => {
    expect(retriesLostRelease('webkit', 'win32')).toBe(true);
    for (const [b, p] of [['webkit', 'linux'], ['webkit', 'darwin'], ['chromium', 'win32'], ['firefox', 'win32'], [undefined, 'win32']] as const) expect(retriesLostRelease(b, p)).toBe(false);
  });
});

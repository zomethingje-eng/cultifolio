// Shift the process clock to CLOCK_AT (a local ISO time, e.g. 2027-01-02T10:00:00) and let it run on in real time, so a
// test that reads Date.now() or `new Date()` runs as if on that day. Tests that install vitest's fake timers replace Date
// themselves and are unaffected. Used to prove the unit suite holds past 1 January 2027, when `npm run deploy` runs it
// (round sixty-one; docs/review-60/harness.md 1, after the reviewer's clockshift.mjs):
//   CLOCK_AT=2027-01-02T10:00:00 NODE_OPTIONS="--import ./tests/unit/helpers/clockshift.mjs" npx vitest run <files>
const at = process.env.CLOCK_AT;
if (at) {
  const Real = Date;
  const off = new Real(at).getTime() - Real.now();
  class Shifted extends Real {
    constructor(...a) {
      if (a.length === 0) super(Real.now() + off);
      else super(...a);
    }
    static now() {
      return Real.now() + off;
    }
  }
  globalThis.Date = Shifted;
}

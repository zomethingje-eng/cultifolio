// Round eighty-nine: a review stop that checks its own figures (the owner's decision of 11 November 2026: a stop at 1 am
// waited until the morning for figures that were as the plan said). A `review` line of a plan may be followed by
// `expect` lines, each a check of what the builder steps since the review before printed (scripts/corpus-step.mjs keeps
// each step's output, corpus-step.out-<n>.txt). When every check holds, the run says each figure and carries on; when any
// does not, or a figure is not found, it stops as a review always has, the failed checks first. A review with no `expect`
// line stops as before: only a review whose every condition is a figure gets them.
//
//   expect let R /: ([\d,]+) read \(/          R is the number the pattern's first group holds, in the last line it matches
//   expect R + B ~ 44000 ±5%                    a sum of figures within 5% of a value (also =, !=, <, <=, >, >=)
//   expect U <= 300
//   expect has /0 left to ask/                  some line matches
//   expect no /md5 NOT the one its publisher gives/   no line matches
//
// Plain Node, no dependencies.

/** The pattern between the first and the last slash of `s`, with an `i` after it if given. */
function pattern(s) {
  const a = s.indexOf('/'), b = s.lastIndexOf('/');
  if (a < 0 || b <= a) throw new Error(`expect: no /pattern/ in "${s}"`);
  const flags = s.slice(b + 1).trim();
  if (flags && flags !== 'i') throw new Error(`expect: "${flags}" after a pattern: only i is read`);
  return new RegExp(s.slice(a + 1, b), flags || undefined);
}

const OPS = ['<=', '>=', '!=', '=', '<', '>', '~'];

/** One `expect` line's words (after "expect"), read; throws on what it cannot read, so a plan's typo stops before anything runs. */
export function parseExpect(text) {
  const t = text.trim();
  let m;
  if ((m = /^let\s+([A-Za-z]\w*)\s+(\/.*)$/.exec(t))) return { kind: 'let', name: m[1], re: pattern(m[2]), text: t };
  if ((m = /^(has|no)\s+(\/.*)$/.exec(t))) return { kind: m[1], re: pattern(m[2]), text: t };
  const op = OPS.find((o) => t.includes(` ${o} `));
  if (!op) throw new Error(`expect: "${t}" is not a check this script reads (let, has, no, or a sum compared with = != < <= > >= ~)`);
  const [left, right] = [t.slice(0, t.indexOf(` ${op} `)), t.slice(t.indexOf(` ${op} `) + op.length + 2)];
  const terms = [];
  for (const [i, part] of left.trim().split(/\s+/).entries()) {
    if (i % 2 === 1) { if (part !== '+' && part !== '-') throw new Error(`expect: "${t}": "${part}" where + or - was expected`); continue; }
    if (!/^[A-Za-z]\w*$/.test(part)) throw new Error(`expect: "${t}": "${part}" is not a figure's name`);
    terms.push({ sign: i === 0 || left.trim().split(/\s+/)[i - 1] === '+' ? 1 : -1, name: part });
  }
  const r = /^([\d,]+(?:\.\d+)?)(?:\s*(?:±|\+-|\+\/-)\s*(\d+(?:\.\d+)?)%)?$/.exec(right.trim());
  if (!r) throw new Error(`expect: "${t}": "${right.trim()}" is not a number${op === '~' ? ' with ±N%' : ''}`);
  if (op === '~' && r[2] == null) throw new Error(`expect: "${t}": ~ needs ±N%`);
  if (op !== '~' && r[2] != null) throw new Error(`expect: "${t}": ±N% goes with ~ only`);
  return { kind: 'cmp', terms, op, value: Number(r[1].replace(/,/g, '')), pct: r[2] != null ? Number(r[2]) : undefined, text: t };
}

const fmt = (n) => n.toLocaleString('en-US');

/**
 * The checks run on the steps' output: `pass` when every one holds, and a line each, saying the figure found. A figure
 * whose pattern no line matches fails every check that uses it (not found is never zero).
 */
export function runChecks(expects, output) {
  const lines = output.split(/\r?\n/);
  const vars = new Map();
  const said = [];
  let pass = true;
  for (const e of expects) {
    if (e.kind === 'let') {
      const hit = [...lines].reverse().map((l) => e.re.exec(l)).find(Boolean);
      const n = hit && hit[1] != null ? Number(String(hit[1]).replace(/[,\s]/g, '')) : NaN;
      if (Number.isFinite(n)) { vars.set(e.name, n); said.push(`    ${e.name} = ${fmt(n)}`); }
      else { pass = false; said.push(`  ✗ ${e.name}: not found (${e.re})`); }
      continue;
    }
    if (e.kind === 'has' || e.kind === 'no') {
      const hit = lines.find((l) => e.re.test(l));
      const ok = e.kind === 'has' ? !!hit : !hit;
      if (!ok) pass = false;
      said.push(`  ${ok ? '✓' : '✗'} ${e.kind === 'has' ? `a line matches ${e.re}` : `no line matches ${e.re}`}${!ok && hit ? `: "${hit.trim().slice(0, 160)}"` : ''}`);
      continue;
    }
    const missing = e.terms.filter((x) => !vars.has(x.name)).map((x) => x.name);
    if (missing.length) { pass = false; said.push(`  ✗ ${e.text}: ${missing.join(', ')} not found`); continue; }
    const v = e.terms.reduce((s, x) => s + x.sign * vars.get(x.name), 0);
    const ok = e.op === '=' ? v === e.value : e.op === '!=' ? v !== e.value : e.op === '<' ? v < e.value : e.op === '<=' ? v <= e.value : e.op === '>' ? v > e.value : e.op === '>=' ? v >= e.value : Math.abs(v - e.value) <= (e.value * e.pct) / 100;
    if (!ok) pass = false;
    const sum = e.terms.length > 1 ? `${e.terms.map((x, i) => `${i ? (x.sign > 0 ? '+ ' : '- ') : ''}${x.name}`).join(' ')} = ${fmt(v)}` : `${e.terms[0].name} = ${fmt(v)}`;
    said.push(`  ${ok ? '✓' : '✗'} ${sum}, expected ${e.op === '~' ? `about ${fmt(e.value)} (±${e.pct}%)` : `${e.op} ${fmt(e.value)}`}`);
  }
  return { pass, lines: said };
}

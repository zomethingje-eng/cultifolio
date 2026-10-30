/**
 * The about pages read as a visitor reads them, for the seam tests (round seventy; triage-69 P2, S-F9).
 *
 * Round sixty-seven's and sixty-nine's seam tests pinned each sentence verbatim beside a regular expression over the code
 * that keeps it. Neither side was read for what it says: S-F9 found eight sentences the code does not keep, and none of
 * the tests failed, because a verbatim sentence and the shape of a line of code can both stay put while the rule
 * between them changes. The method that replaces them:
 *
 * 1. Find the sentence by its opening words (`said`), the one stable handle, and read the claim out of it: the figure,
 *    the example, the list (`claim`, `numberWord`). The rest of the sentence can be reworded freely.
 * 2. Drive the code with the case the sentence states: call the rule with the sentence's own example, or at the sentence's
 *    own figure and either side of it, and require what the sentence says happens.
 *
 * So the page changing its figure or example fails until the code agrees, and the code changing its rule fails until the
 * page says so. A test of this kind names the sentence's line in its failure (`said(...).line`).
 */
import { readFileSync } from 'node:fs';

export type AboutPage = 'how' | 'formats';
const FILES: Record<AboutPage, string> = { how: 'src/routes/about/how/+page.svelte', formats: 'src/routes/about/formats/+page.svelte' };

/** The page's markup without its script, style and comments, line breaks kept (so a sentence can be given its line). */
function markup(page: AboutPage, prose = false): string {
  const src = readFileSync(FILES[page], 'utf8');
  return (prose ? src.replace(/<pre[\s\S]*?<\/pre>/g, (m) => m.replace(/[^\n]/g, ' ')) : src)
    .replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<style[\s\S]*?<\/style>/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
const BLOCK = /^<\/?(?:h[1-6]|p|li|dt|dd|th|td|tr|summary|div|section|ul|ol|dl|table|thead|tbody|nav|details|article)\b/i;
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** The text a visitor reads, one space for any run of white space, and for each character the source line it came from. */
function read(page: AboutPage, prose = false): { text: string; lineAt: number[] } {
  const src = markup(page, prose);
  let text = '';
  const lineAt: number[] = [];
  let line = 1;
  let space = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '<') {
      const end = src.indexOf('>', i);
      for (const c of src.slice(i, end + 1)) if (c === '\n') line++;
      // In prose, a block's edge ends whatever runs to it: a heading, a cell or a list item is no part of the next sentence.
      if (prose && BLOCK.test(src.slice(i, end + 1)) && text && !text.endsWith('¶')) { text += '¶'; lineAt.push(line); space = false; }
      i = end;
      continue;
    }
    if (ch === '&') {
      const m = /^&(?:#\d+|[a-z]+);/.exec(src.slice(i, i + 8));
      if (m) {
        text += ENTITIES[m[0]] ?? (m[0].startsWith('&#') ? String.fromCharCode(Number(m[0].slice(2, -1))) : m[0]);
        lineAt.push(line);
        i += m[0].length - 1;
        space = false;
        continue;
      }
    }
    // A Svelte expression in the text (`{'{'}` and the like) is read as what it renders when it is a string literal.
    if (ch === '{') {
      const q = /^\{\s*(['"`])/.exec(src.slice(i, i + 4));
      const close = q ? new RegExp(`${q[1]}\\s*\\}`, 'g') : /\}/g;
      close.lastIndex = i + (q ? q[0].length : 1);
      const m = close.exec(src);
      const end = m ? m.index + m[0].length - 1 : src.length - 1;
      const inner = q ? src.slice(i + q[0].length, m ? m.index : end) : '';
      for (const c of inner) { text += c === '\n' ? ' ' : c; lineAt.push(line); if (c === '\n') line++; }
      i = end;
      space = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (ch === '\n') line++;
      if (!space && text.length) { text += ' '; lineAt.push(line); }
      space = true;
      continue;
    }
    text += ch;
    lineAt.push(line);
    space = false;
  }
  return { text, lineAt };
}
const cache = new Map<AboutPage, { text: string; lineAt: number[] }>();
function page(p: AboutPage) {
  let r = cache.get(p);
  if (!r) cache.set(p, (r = read(p)));
  return r;
}

/**
 * The page's prose, its sentences in order (round eighty-four; the reviews' S5 and A19): the visible text without the
 * blocks of code a reader scrolls (`<pre>`), split where `said` ends a sentence. Each with its source line.
 */
export function sentences(p: AboutPage): Said[] {
  const { text, lineAt } = read(p, true);
  const out: Said[] = [];
  const push = (a: number, b: number) => {
    const t = text.slice(a, b).replace(/¶/g, ' ').trim();
    if (t) out.push({ text: t, line: lineAt[a] ?? 0, where: `/about/${p} line ${lineAt[a] ?? 0}` });
  };
  const re = /[.?!]["”)]?(?= ?(?:[A-Z"“(/¶]|$))|[.?!]["”)]?$|¶/g;
  let from = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] !== '¶') {
      const before = text.slice(Math.max(from, m.index - 6), m.index + 1);
      if (/\b(?:e\.g|i\.e|St|cf|aff|var|subsp|nr|sp|spp|cv|fo|f|L|v)\.$/.test(before)) continue;
    }
    const end = m.index + m[0].length;
    push(from, end);
    from = end;
  }
  push(from, text.length);
  return out;
}

/** The whole visible text of a page. */
export function aboutText(p: AboutPage): string {
  return page(p).text;
}

/** A sentence, found by its opening words, which must open exactly one sentence of the page. */
export type Said = { text: string; line: number; where: string };
/**
 * The sentence that begins with `opening`, to its full stop (a full stop followed by a space and a capital, a quote or
 * the end; "e.g." and "St." do not end one). Throws, naming the page, when the opening is absent or opens two sentences.
 */
export function said(p: AboutPage, opening: string): Said {
  const { text, lineAt } = page(p);
  const a = text.indexOf(opening);
  if (a < 0) throw new Error(`/about/${p}: no sentence opens "${opening}"`);
  if (text.indexOf(opening, a + 1) >= 0) throw new Error(`/about/${p}: "${opening}" opens more than one sentence`);
  const re = /[.?!]["”)]?(?= (?:[A-Z"“(/]|$))|[.?!]["”)]?$/g;
  re.lastIndex = a + opening.length;
  let end = text.length;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(a, m.index - 6), m.index + 1);
    if (/\b(?:e\.g|i\.e|St|cf|aff|var|subsp|nr|sp|spp|cv|fo|f|L|v)\.$/.test(before)) continue;
    end = m.index + m[0].length;
    break;
  }
  const line = lineAt[a];
  return { text: text.slice(a, end), line, where: `/about/${p} line ${line}` };
}

/** The part of a sentence from `start` up to (not including) `end`, or to its end. */
export function part(s: Said, start: string, end?: string): string {
  const a = s.text.indexOf(start);
  if (a < 0) throw new Error(`${s.where}: no "${start}" in "${s.text}"`);
  if (end === undefined) return s.text.slice(a);
  const b = s.text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`${s.where}: no "${end}" after "${start}"`);
  return s.text.slice(a, b);
}

/** The first capture of `re` in the sentence; throws, naming the line, when the sentence does not say it. */
export function claim(s: Said, re: RegExp): string {
  const m = re.exec(s.text);
  if (!m) throw new Error(`${s.where}: the sentence no longer says ${re} ("${s.text.slice(0, 160)}…")`);
  return m[1] ?? m[0];
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100 };
/** A number as the pages write it: "four", "Two", "1,200", "a". */
export function numberWord(w: string): number {
  const k = w.trim().toLowerCase();
  if (k in WORDS) return WORDS[k];
  const n = Number(k.replace(/,/g, ''));
  if (Number.isFinite(n)) return n;
  throw new Error(`not a number the pages write: "${w}"`);
}

const UNIT_MS: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
/** A span as the pages write it ("a month", "four seconds", "half an hour", "a day") in milliseconds. */
export function spanWords(w: string): number {
  const k = w.trim().toLowerCase();
  const half = /^half an? (\w+)$/.exec(k);
  if (half) return UNIT_MS[half[1]] / 2;
  const m = /^(\S+) (\w+?)s?$/.exec(k);
  if (!m || !(m[2] in UNIT_MS)) throw new Error(`not a span the pages write: "${w}"`);
  return numberWord(m[1]) * UNIT_MS[m[2]];
}

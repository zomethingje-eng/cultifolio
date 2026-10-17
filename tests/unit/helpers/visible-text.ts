/**
 * The words a grower can read in the app's source, without its comments (round seventy-four, the rename of "Places" to
 * "My spaces"): the text of a Svelte file's markup, its attribute values and every string in its scripts and
 * expressions, and every string in a TypeScript module. Identifiers, property names and comments are left out, so a
 * variable called `places` or a comment saying "place" is not counted; a string is counted whether it is shown or not
 * (an address, a key), and the guard that reads this names those it allows.
 */
import { parse } from 'svelte/compiler';
import ts from 'typescript';

export interface Piece { text: string; line: number }

function lineAt(src: string, at: number): number {
  let n = 1;
  for (let i = 0; i < at && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/** Strings in a TypeScript (or JavaScript) source: literals and the fixed parts of template literals. */
export function tsStrings(src: string, offset = 0, whole = src): Piece[] {
  const out: Piece[] = [];
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push({ text: n.text, line: lineAt(whole, offset + n.getStart(sf)) });
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push({ text: n.text, line: lineAt(whole, offset + n.getStart(sf)) });
    // A module's import paths are not words.
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** The readable pieces of a Svelte component: markup text, attribute text, and the strings of its scripts and expressions. */
export function svelteStrings(src: string): Piece[] {
  const out: Piece[] = [];
  const ast = parse(src, { modern: true }) as unknown as Record<string, unknown>;
  const seen = new Set<unknown>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    const o = n as Record<string, unknown>;
    const at = typeof o.start === 'number' ? o.start : 0;
    if (o.type === 'Text' && typeof o.data === 'string') out.push({ text: o.data, line: lineAt(src, at) });
    else if (o.type === 'Literal' && typeof o.value === 'string') out.push({ text: o.value, line: lineAt(src, at) });
    else if (o.type === 'TemplateElement') {
      const v = o.value as { cooked?: string; raw: string };
      out.push({ text: v.cooked ?? v.raw, line: lineAt(src, at) });
    }
    // A style block's CSS and import paths are not words a grower reads.
    if (o.type === 'StyleSheet' || o.type === 'ImportDeclaration' || o.type === 'Comment') return;
    for (const k of Object.keys(o)) {
      if (k === 'leadingComments' || k === 'trailingComments' || k === 'metadata' || k === 'parent') continue;
      walk(o[k]);
    }
  };
  walk(ast);
  return out;
}

export function piecesOf(path: string, src: string): Piece[] {
  if (path.endsWith('.svelte')) return svelteStrings(src);
  if (path.endsWith('.ts') || path.endsWith('.js')) return tsStrings(src);
  return [];
}

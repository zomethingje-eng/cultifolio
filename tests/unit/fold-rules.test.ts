/**
 * The snapshot is keyed to FOLD_RULES, not to the build (round fifty-seven): a deploy that leaves the fold as it was
 * keeps every device's snapshot. That is safe only while the number moves whenever the fold does, so this test holds a
 * hash of the fold's source (apply, the hold and the park, and the collection's methods that build and restore the
 * snapshot) to the number it was recorded under.
 *
 * When this fails:
 *   - if the change alters what a fold of some log comes out as, or what a snapshot holds or how it is read, bump
 *     FOLD_RULES in src/lib/core/log.ts and record the new number and the new hash below;
 *   - if it does not (a comment, a rename, a dependency that changes the compiled text), record the new hash under the
 *     same number.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOLD_RULES, REQUIRED_FIELDS, KINDS } from '$core/log';
import { md5 } from '$dossier/md5';

/** A top-level function's or a class method's source, read from the file as written (not as compiled, so the hash does not move with the compiler), from its signature to the closing brace at its own indent. */
function block(file: string, signature: string): string {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const at = text.indexOf(signature);
  if (at < 0) throw new Error(`${signature} is not in ${file}`);
  const indent = text.slice(text.lastIndexOf('\n', at) + 1, at);
  const end = text.indexOf(`\n${indent}}\n`, at);
  if (end < 0) throw new Error(`no end for ${signature}`);
  return text.slice(at, end + indent.length + 2);
}

const RECORDED = { rules: 3, hash: '4622a6685922a1d89f2bc89412c5335f' };

describe('the fold rules number (round fifty-seven)', () => {
  it('moves whenever the fold\'s source does', () => {
    const log = 'src/lib/core/log.ts', col = 'src/lib/db/collection.svelte.ts';
    const src = [
      ...['export function apply(', 'export function isParked(', 'export function isHeld('].map((sig) => block(log, sig)),
      ...['private clearFold(', 'private applyHere(', 'private foldAll(', 'private foldSome(', 'private touched(', 'private noteParents(', 'private async foldFromVault(', 'private async fromFold(', 'private async saveFold(', 'private dueNow('].map((sig) => block(col, sig)),
      JSON.stringify(REQUIRED_FIELDS),
      JSON.stringify(KINDS)
    ].join('\n');
    const hash = md5(src.replace(/\s+/g, '')); // whitespace aside, so a checkout with other line endings hashes the same
    if (hash !== RECORDED.hash || FOLD_RULES !== RECORDED.rules) {
      expect.fail(FOLD_RULES === RECORDED.rules
        ? `The fold's source changed (hash ${hash}) and FOLD_RULES is still ${FOLD_RULES}. If the change alters a fold or a snapshot, bump FOLD_RULES and record { rules: ${FOLD_RULES + 1}, hash } here after the bump; if not, record hash '${hash}' under ${FOLD_RULES}.`
        : `FOLD_RULES is ${FOLD_RULES} and this test recorded ${RECORDED.rules}: record { rules: ${FOLD_RULES}, hash: '${hash}' }.`);
    }
  });
});

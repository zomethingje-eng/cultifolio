/**
 * The snapshot is keyed to FOLD_RULES, not to the build (round fifty-seven): a deploy that leaves the fold as it was
 * keeps every device's snapshot. That is safe only while the number moves whenever the fold does, so this test holds a
 * hash of the fold's source to the number it was recorded under: since round fifty-eight the whole of the log's and the
 * clock's modules (the key, the stamp order, the hold and park rules and their constants all shape a fold; round
 * fifty-seven hashed only `apply` and two rules, and a change to `key()` or `PARK_MS` passed unnoticed: the client
 * review's finding 7), the collection's methods that build, restore, hold, park and save the snapshot, and the vault's
 * that store the log and read and write the snapshot. A false alarm costs a recorded hash; a miss is a stale snapshot
 * read as current on every device.
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

const RECORDED = { rules: 3, hash: '6227043202392025063dc89e5fb06bd0' };

describe('the fold rules number (round fifty-seven)', () => {
  it('moves whenever the fold\'s source does', () => {
    const col = 'src/lib/db/collection.svelte.ts', vault = 'src/lib/db/vault.ts';
    const whole = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const src = [
      whole('src/lib/core/log.ts'),
      whole('src/lib/core/hlc.ts'),
      ...['private clearFold(', 'private applyHere(', 'private foldAll(', 'private foldSome(', 'private touched(', 'private noteParents(', 'private async foldFromVault(', 'private async fromFold(', 'private async saveFold(', 'private dueNow(', 'private hold(', 'private notePark(', 'async markParked(', 'private async saveParked(', 'private async rereadParked(', 'private async flushParked(', 'private async readParked('].map((sig) => block(col, sig)),
      ...['async function storeIn(', 'export async function readFold(', 'export async function writeFold(', 'export async function arrivalsAfter('].map((sig) => block(vault, sig)),
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

/**
 * Round sixty-two, decision 3: scripts/audit-common-names.ts takes `--sample N` anywhere in its arguments (the corpus
 * review, 10h): "--sample 40 index.json" read "40" as the index. FAILED on the base (no `auditArgs`; the source was "40").
 */
import { describe, it, expect } from 'vitest';
import * as audit from '../../scripts/audit-common-names';

const auditArgs = (a: string[]) => (audit as unknown as { auditArgs: (a: string[]) => { src?: string; sample: number; json: boolean } }).auditArgs(a);
describe('audit-common-names arguments', () => {
  it.each([
    [['--sample', '12', 'index.json'], { src: 'index.json', sample: 12, json: false }],
    [['index.json', '--sample', '12'], { src: 'index.json', sample: 12, json: false }],
    [['--json', '--sample', '5', 'https://cultifolio.com/api/index'], { src: 'https://cultifolio.com/api/index', sample: 5, json: true }],
    [['index.json'], { src: 'index.json', sample: 40, json: false }],
    [['--sample=7', 'index.json'], { src: 'index.json', sample: 7, json: false }]
  ])('%j', (args, want) => expect(auditArgs(args)).toEqual(want));
});

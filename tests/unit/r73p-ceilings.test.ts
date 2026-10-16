/**
 * Round seventy-three, agent P: the owner raises the site's ceilings on new vaults by the Worker's variables (1,000 a day,
 * 20,000 in all). /about/formats stated "(200)" and "(2,000)" as the ceilings and "among the 2,000": untrue once the
 * variables are set. Every sentence that states one now names the default and says the deployment may set others, and
 * the defaults it names are the code's. FAILED on r73base: the sentence named no variable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_NEW_VAULTS_ALL_PER_DAY, MAX_VAULTS, creationCeilings } from '../../src/lib/server/sync';

const text = (f: string) => readFileSync(f, 'utf8').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const n = (x: number) => x.toLocaleString('en-US');

describe('r73p: the vault ceilings are said as defaults', () => {
  const formats = text('src/routes/about/formats/+page.svelte');
  const sentences = formats.split(/(?<=\.)\s+/).filter((s) => /vault/i.test(s) && (new RegExp(`(?<![\\d,])${n(MAX_VAULTS)}\\b`).test(s) || new RegExp(`(?<![\\d,])${MAX_NEW_VAULTS_ALL_PER_DAY}\\b`).test(s)));
  it('the one sentence that states them names the defaults, the variables, and that this site\'s may be higher', () => {
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain(`(${MAX_NEW_VAULTS_ALL_PER_DAY} a day and ${n(MAX_VAULTS)} in all by default; a deployment may set others in the Worker's variables SYNC_VAULTS_PER_DAY and SYNC_VAULTS_MAX, so this site's may be higher)`);
    expect(formats).not.toMatch(/among the 2,000|new vaults \(200\)|in all \(2,000\)/);
  });
  it('the owner\'s values are read from the variables, and a value that is not a whole number leaves the default', () => {
    expect(creationCeilings({ SYNC_VAULTS_PER_DAY: '1000', SYNC_VAULTS_MAX: '20000' })).toEqual({ perDay: 1000, max: 20000 });
    expect(creationCeilings({ SYNC_VAULTS_PER_DAY: '1,000' })).toEqual({ perDay: undefined, max: undefined });
  });
  it('DEPLOY.md names the defaults as defaults and the launch\'s values', () => {
    const deploy = readFileSync('docs/DEPLOY.md', 'utf8');
    expect(deploy).toContain('200 a day and 2,000 in all by default');
    expect(deploy).toContain('The launch\'s are 1,000 a day and 20,000 in all');
    expect(deploy).not.toMatch(/under the 2,000 but not under the day's 200|Before the 2,000 fill/);
  });
});

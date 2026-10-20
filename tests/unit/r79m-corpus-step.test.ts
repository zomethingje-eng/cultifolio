/**
 * Round seventy-nine (M, the merge): the order of the deploy and the upload, enforced. Round seventy-eight's Worker cannot
 * read a page without a GBIF key (agent K's pages: its schema required `ids.gbif`, so it answered 503), and the upload's
 * last file, the manifest, is what switches the live site to a corpus. So this round's Worker says in `/api/corpus` that
 * it reads such a page (`keyless: true`), and the corpus step uploads a corpus holding one only when the live Worker says
 * so; otherwise it stops, uploads nothing, and names the deploy to run first. A corpus whose pages all have a key (round
 * seventy-eight's, or any test's) is uploaded as before, without asking. FAILED on r79base: `/api/corpus` had no
 * `keyless`, and the upload ran rclone for a corpus with a keyless page whatever the live Worker was.
 *
 * And the stop at iNaturalist's day allowance (the six days of the cultivated fill) says to run the command again after
 * midnight UTC, as the builder's own line does, not "in an hour or so", when it would stop again at once. FAILED on
 * r79base: the sentence said "in an hour or so".
 *
 * And a stop of the full build's plan names its own command (`--plan scripts/corpus-plan-full.txt`), and a `--go-on`
 * typed without the plan carries on with the plan left unfinished. FAILED on r79base: the stop said "node
 * scripts/corpus-step.mjs --go-on", and that command ran round seventy-eight's plan (its backup, then `--rekey`) instead.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, EXIT, classify, stopSentence } from '../../scripts/corpus-step.mjs';
import { GET as corpusGET } from '../../src/routes/api/corpus/+server';

type Call = { cmd: string; args: string[] };

function folder(index: unknown[]) {
  const root = mkdtempSync(join(tmpdir(), 'r79m-order-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'bbbb2222', built: 'x', species: index.length, buckets: 32, postings: 64, files: {} }));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify(index));
  writeFileSync(join(root, 'scripts/corpus-plan.txt'), 'upload\n');
  return root;
}
type Live = { id?: string; buckets?: number; manifest?: boolean; keyless?: boolean } | null;
function go(root: string, fetchLive: () => Promise<Live>) {
  const calls: Call[] = [];
  let out = '';
  let asked = 0;
  const exec = async (cmd: string, args: string[], onOutput: (s: string) => void) => { calls.push({ cmd, args }); onOutput(''); return 0; };
  const p = run({ root, argv: [], exec: exec as never, fetchCorpus: async () => 'bbbb2222', fetchLive: async () => { asked++; return fetchLive(); }, log: (s: string) => { out += s; }, waitMs: 0 });
  return p.then((code) => ({ code, calls, out, asked }));
}
const keyed = [{ key: 'k1', gbif: 1 }, { key: 'g2', gbif: 2 }];
const withKeyless = [...keyed, { key: 'k457911' }];
const rclone = (calls: Call[]) => calls.filter((c) => c.cmd === 'rclone' && c.args[0] === 'copy');
/** Round seventy-eight's `/api/corpus`, as live now. */
const r78 = async (): Promise<Live> => ({ id: 'c14b776c7296ad11', buckets: 32, manifest: true });

describe('the deploy before the upload of a corpus holding a page without a GBIF key', () => {
  it('this round\'s /api/corpus says it reads a page without a GBIF key', async () => {
    const r = await corpusGET({ platform: { env: {} }, fetch: async () => new Response('', { status: 404 }) } as never);
    expect(((await r.json()) as { keyless?: boolean }).keyless).toBe(true);
  });
  it('round seventy-eight\'s Worker live: the upload stops before rclone runs and names the deploy', async () => {
    const r = await go(folder(withKeyless), r78);
    expect(r.code).toBe(EXIT.blocked);
    expect(r.calls).toEqual([]);
    expect(r.out).toContain('the corpus on disk holds 1 page without a GBIF key');
    expect(r.out).toContain("Deploy this round's Worker first");
    expect(r.out).toContain('node scripts/corpus-ready.mjs && npm run deploy');
  });
  it('the live Worker not answering: the same stop, nothing uploaded', async () => {
    const r = await go(folder(withKeyless), async () => { throw new Error('offline'); });
    expect(r.code).toBe(EXIT.blocked);
    expect(r.calls).toEqual([]);
    expect(r.out).toContain('could not be asked whether it reads one');
  });
  it('once this round\'s Worker is live, the same command uploads', async () => {
    const root = folder(withKeyless);
    expect((await go(root, r78)).code).toBe(EXIT.blocked);
    const r = await go(root, async () => ({ id: 'c14b776c7296ad11', buckets: 32, manifest: true, keyless: true }));
    expect(r.code).toBe(EXIT.done);
    expect(r.out).toContain('the live Worker reads pages without a GBIF key (1 in this corpus): uploading.');
    expect(rclone(r.calls).length).toBe(2);
  });
  it('a corpus whose pages all have a GBIF key is uploaded as before, without asking the live Worker', async () => {
    const r = await go(folder(keyed), r78);
    expect(r.code).toBe(EXIT.done);
    expect(r.asked).toBe(0);
    expect(rclone(r.calls).length).toBe(2);
  });
});

describe('the stop at the day\'s allowance', () => {
  it('says tomorrow, after midnight UTC; a source that did not answer is still asked again in an hour', () => {
    const spent = "\n  iNaturalist refused (api.inaturalist.org: today's allowance of 9000 requests is spent (UTC 2026-10-21); asked again tomorrow). 812 filled; 40000 still to do. iNaturalist allows about 10,000 calls a day; run this again tomorrow (UTC), and it goes on from here.\n";
    const step = { line: 'dossier --fill inat --bulk bulk' };
    const r = classify({ code: 3, output: spent, dropsWritten: false });
    expect(r.status).toBe('unfinished');
    expect(stopSentence(step, r)).toMatch(/the day's allowance is spent .* Run the same command again tomorrow, after midnight UTC: node scripts\/corpus-step\.mjs$/);
    expect(stopSentence(step, r)).not.toContain('in an hour');
    const silent = classify({ code: 3, output: '  GBIF: 12 not answered; run --fill gbif again\n', dropsWritten: false });
    expect(stopSentence(step, silent)).toContain('Run the same command again in an hour or so');
  });
});

describe('the full build\'s plan carries across its stops', () => {
  it('a stop names the command with its plan, and --go-on without the plan carries on with it, not round seventy-eight\'s', async () => {
    const root = folder(keyed);
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), 'backup\ndossier --rekey\n');
    writeFileSync(join(root, 'scripts/corpus-plan-full.txt'), 'review Read the build\'s lines.\nupload\n');
    const calls: Call[] = [];
    let out = '';
    const exec = async (cmd: string, args: string[], onOutput: (s: string) => void) => { calls.push({ cmd, args }); onOutput(''); return 0; };
    const go = (argv: string[]) => run({ root, argv, exec: exec as never, fetchCorpus: async () => 'bbbb2222', fetchLive: async () => null, log: (s: string) => { out += s; }, waitMs: 0 });
    expect(await go(['--plan', 'scripts/corpus-plan-full.txt'])).toBe(EXIT.review);
    expect(out).toContain('carry on with: node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt --go-on');
    out = '';
    expect(await go(['--go-on'])).toBe(EXIT.done);
    expect(out).toContain('carrying on with scripts/corpus-plan-full.txt, the plan the last run left unfinished');
    expect(rclone(calls).length).toBe(2);
    expect(calls.some((c) => c.args.includes('--rekey'))).toBe(false);
    expect(existsSync(join(root, 'backups'))).toBe(false);
    // once it is finished, a plain run is the round's own plan again
    calls.length = 0;
    out = '';
    await go([]);
    expect(calls.some((c) => c.args.includes('--rekey'))).toBe(true);
  });
});

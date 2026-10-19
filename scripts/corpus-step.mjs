// The corpus step as one command (round seventy-two; the owner's process change 2, reviewer D's trial):
//
//   node scripts/corpus-step.mjs              run the round's plan (scripts/corpus-plan.txt), or carry on where it stopped
//   node scripts/corpus-step.mjs --go-on      carry on past the review stop it last made, once you have read what it asked
//   node scripts/corpus-step.mjs --status     say which steps are done and which is next, and change nothing
//   node scripts/corpus-step.mjs --prune      the bucket's prune (DEPLOY.md section 5): a dry run, a review stop, then
//                                             `--prune --go-on` deletes
//
// Run it with `node`, not `npm run`: npm runs through a batch file on Windows, and a Ctrl-C then asks "Terminate batch
// job (Y/N)?", which this script cannot answer for you (either answer is safe; the state is written before it asks).
//
// Each step of the plan is a line: `backup`, `dossier <the builder's arguments>`, `if-exists <file> dossier ...`,
// `review <what to read>`, `upload`, `live-check`. A step that finishes is recorded in corpus-step.json and not run again;
// one that stops is run again by the next run, and every builder step is itself resumable. Everything the steps print
// goes to the screen and to corpus-step.log, both in the project folder, so the log can be read back or pasted.
//
// It stops, with one sentence and the command to type next, when:
//   - a source did not answer (the builder says "run --fill X again"): run the same command later (exit 3);
//   - a build lost what the build before had (drops.txt), or the plan says `review`: read what it names, then
//     `--go-on` (exit 2);
//   - a dossier on disk cannot be read, or the index holds fewer species than before: never passed by `--go-on`; put it
//     right, and the next run runs that step again (exit 2);
//   - a step failed: paste the end of corpus-step.log back (exit 1);
//   - you pressed Ctrl-C: run the same command to carry on (exit 130).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT = { done: 0, failed: 1, review: 2, blocked: 2, unfinished: 3, interrupted: 130 };
/** The dossier version (src/lib/dossier/schema.ts): the corpus is `static/s/v<N>` and the bucket's `s/v<N>`, as the Worker reads it. */
export const VERSION = Number(/export const DOSSIER_V = (\d+) as const/.exec(readFileSync(new URL('../src/lib/dossier/schema.ts', import.meta.url), 'utf8'))?.[1] ?? NaN);
const CORPUS = `static/s/v${VERSION}`;
const BUCKET = `r2:cultifolio/s/v${VERSION}`;
/** The corpus of the version before, which this version's is written from once (`--rekey`, round seventy-eight) and never changed. */
const BEFORE = `static/s/v${VERSION - 1}`;
/** A dossier's file: its page's id (round seventy-eight), or, in a corpus of version 2, its GBIF key. */
export const DOSSIER_FILE = /^[kg][1-9][0-9]*\.json$/;
const V2_FILE = /^[1-9][0-9]*\.json$/;

/** The plan: one step a line, `#` starts a comment. Throws on a line it does not know, so a typo stops before anything runs. */
export function parsePlan(text) {
  const steps = [];
  for (const [i, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    let rest = line, when;
    const m = /^if-exists\s+(\S+)\s+(.*)$/.exec(line);
    if (m) { when = m[1]; rest = m[2]; }
    const [kind, ...args] = rest.split(/\s+/);
    if (!['backup', 'dossier', 'review', 'upload', 'live-check'].includes(kind)) throw new Error(`corpus plan line ${i + 1}: "${raw.trim()}" is not a step this script knows`);
    steps.push({ line, kind, args: kind === 'review' ? [rest.slice('review'.length).trim()] : args, ...(when ? { when } : {}) });
  }
  return steps;
}

/**
 * What a builder step's run says: `unfinished` when a source did not answer (the builder's own "run --fill X again", "N
 * not answered", "(run again)"), `review` when the build lost something (exit 1 with drops.txt written), when the index
 * shrank or a dossier on disk could not be read, `failed` on any other non-zero exit, else `done`.
 */
export const UNFINISHED = /\brun (?:--fill [a-z-]+|--names|this) again\b|\(run again\)|\b[1-9]\d* not answered\b|Run --names again/i;
/** @param {{ code: number, output: string, dropsWritten: boolean, speciesBefore?: number }} r */
export function classify({ code, output, dropsWritten, speciesBefore }) {
  const index = [...output.matchAll(/^ {2}index: (\d+) species$/gm)].pop();
  const unreadable = /^ {2}\d+ dossiers? on disk could not be read/m.test(output);
  if (unreadable) return { status: 'blocked', why: 'unreadable' };
  if (code !== 0 && dropsWritten) return { status: 'review', why: 'drops' };
  // A fill that stopped before every dossier was answered exits 3 (D7); its own sentence says which source.
  if (code === 3) return { status: 'unfinished', why: (collapse(output).split('\n').find((l) => UNFINISHED.test(l)) ?? 'a source did not answer').replace(/[;:]?\s*run (?:--fill [a-z-]+|this) again.*$|\s*\(run again\).*$/i, '').trim() };
  if (code !== 0) return { status: 'failed', why: `exit ${code}` };
  if (UNFINISHED.test(output)) return { status: 'unfinished', why: (collapse(output).split('\n').find((l) => UNFINISHED.test(l)) ?? '').replace(/[;:]?\s*run (?:--fill [a-z-]+|this) again.*$|\s*\(run again\).*$/i, '').trim() };
  if (index && speciesBefore && Number(index[1]) < speciesBefore) return { status: 'blocked', why: `index ${index[1]} < ${speciesBefore}` };
  return { status: 'done' };
}

/**
 * The pages a step took out of the reference on purpose (round seventy-three): `--prune-followed` says "N dossiers of pages
 * merged into another deleted", each listed in scripts/merged-pages.txt by the owner's decision. The index may hold that
 * many fewer species; any other shrink still blocks.
 */
export const MERGED_AWAY = /^ {2}(\d+) dossiers? of pages merged into another deleted\b/gm;
/** @param {string} output */
export const mergedAway = (output) => [...output.matchAll(MERGED_AWAY)].reduce((n, m) => n + Number(m[1]), 0);

/** The sentence a stop prints, and the command to type next. */
export function stopSentence(step, result, cmd = 'node scripts/corpus-step.mjs') {
  switch (result.status) {
    case 'unfinished': return `Stopped at "${step.line}": a source did not answer (${result.why}). Nothing is lost and what was read stands. Run the same command again in an hour or so: ${cmd}`;
    case 'blocked':
    case 'review':
      if (result.why === 'drops') return `Stopped at "${step.line}": some species lost what the build before had; drops.txt in the project folder lists them. Read every line. When each one is expected, carry on with: ${cmd} --go-on`;
      if (result.why === 'unreadable') return `Stopped at "${step.line}": a dossier on disk could not be read (the line above names it), so the index left it out. Do not upload. Paste the end of corpus-step.log back.`;
      if (/^index/.test(result.why)) return `Stopped at "${step.line}": the index now holds fewer species than before (${result.why.replace('index ', '').replace(' < ', ', was ')}). Do not upload. Paste the end of corpus-step.log back.`;
      return `Review: ${result.why}. When it is as expected, carry on with: ${cmd} --go-on`;
    case 'failed': return `Stopped at "${step.line}": it failed (${result.why}). Paste the last forty lines of corpus-step.log back. To try that step again: ${cmd}`;
    default: return '';
  }
}

/** The upload as DEPLOY.md section 5 has it, with a check between the two lines: the manifest goes up only when the bucket holds every other file as it is on disk. */
export function uploadCommands(corpus = CORPUS, bucket = BUCKET) {
  const ex = ['--exclude', 'report.txt', '--exclude', 'manifest.json', '--exclude', 'manifest.prev.json', '--exclude', '*.tmp'];
  return [
    ['rclone', ['copy', corpus, bucket, '--transfers', '32', '--checkers', '32', ...ex, '--s3-no-check-bucket', '--stats-one-line', '--stats', '30s']],
    ['rclone', ['check', corpus, bucket, '--one-way', '--checkers', '32', ...ex]],
    ['rclone', ['copy', `${corpus}/manifest.json`, bucket, '--s3-no-check-bucket']]
  ];
}

const sha1 = (s) => createHash('sha1').update(s).digest('hex');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return null; } };
/** Written whole or not at all: a Ctrl-C between the write and the rename leaves the last state, never half of one. */
function writeAtomic(p, text) { writeFileSync(`${p}.tmp`, text); renameSync(`${p}.tmp`, p); }

/**
 * The run. `exec(cmd, args, onOutput)` runs one command and resolves to its exit code (the real one spawns it, with no
 * shell, so a project folder with a space in its path needs no quoting); `fetchCorpus()` reads the live /api/corpus.
 * Both are given by a test.
 */
/**
 * @param {{ root?: string, argv?: string[], exec?: (cmd: string, args: string[], onOutput: (s: string) => void, opts: { cwd?: string, env?: Record<string, string | undefined> }) => Promise<number>, fetchCorpus?: () => Promise<string | null>, log?: (s: string) => void, now?: () => Date, waitMs?: number, heartbeatMs?: number }} [o]
 */
export async function run({ root = process.cwd(), argv = [], exec = spawnExec, fetchCorpus = liveCorpus, log = (s) => process.stdout.write(s), now = () => new Date(), waitMs = 15_000, heartbeatMs = 120_000 } = {}) {
  const at = (p) => join(root, p);
  const logFile = at('corpus-step.log');
  // The log keeps whole lines, each progress line rewritten with \r in its last form only.
  let pending = '';
  const say = (s) => {
    log(s);
    pending += s;
    const cut = pending.lastIndexOf('\n');
    if (cut < 0) return;
    appendFileSync(logFile, collapse(pending.slice(0, cut + 1)));
    pending = pending.slice(cut + 1);
  };
  const flush = () => { if (pending) appendFileSync(logFile, collapse(pending) + '\n'); pending = ''; };
  const stamp = () => now().toISOString().replace('T', ' ').slice(0, 19);
  if (argv.includes('--prune')) { try { return await prune({ root, argv, exec, say, fetchCorpus }); } finally { flush(); } }
  const planFile = at(argv.includes('--plan') ? argv[argv.indexOf('--plan') + 1] : 'scripts/corpus-plan.txt');
  if (!existsSync(planFile)) { say(`No plan at ${planFile}: nothing to run.\n`); return EXIT.failed; }
  const planText = readFileSync(planFile, 'utf8');
  const plan = parsePlan(planText);
  const stateFile = at('corpus-step.json');
  let state = readJson(stateFile);
  if (!state || state.plan !== sha1(planText)) {
    if (state) renameSync(stateFile, at(`corpus-step.${stamp().slice(0, 10)}.${Date.now()}.json`));
    state = { plan: sha1(planText), started: now().toISOString(), steps: plan.map((s) => ({ line: s.line, status: 'to do' })) };
  }
  const save = () => writeAtomic(stateFile, JSON.stringify(state, null, 1));
  if (argv.includes('--status')) {
    for (const [i, s] of state.steps.entries()) log(`${String(i + 1).padStart(2)}. ${s.status.padEnd(11)} ${s.line}${s.note ? `  (${s.note})` : ''}\n`);
    return EXIT.done;
  }
  const goOn = argv.includes('--go-on');
  const once = { synced: false };
  let interrupted = false;
  // The first Ctrl-C lets the step's own process end (it gets the Ctrl-C too) and records where the run stopped; a second
  // ends this one at once, with the state written first.
  const onInt = () => {
    if (interrupted) { for (const s of state.steps) if (s.status === 'running') s.status = 'interrupted'; save(); flush(); process.exit(EXIT.interrupted); }
    interrupted = true;
  };
  process.on('SIGINT', onInt);
  try {
    for (const [i, step] of plan.entries()) {
      const rec = state.steps[i];
      if (rec.status === 'done' || rec.status === 'skipped') continue;
      if (rec.status === 'review') {
        // A stop for review is passed only by --go-on, and only this one: a later stop stops again.
        if (!goOn) { say(`\n${rec.note}\n`); return EXIT.review; }
        rec.status = 'done'; rec.note = `read, and carried on ${stamp()}`; save();
        continue;
      }
      say(`\n=== ${stamp()}  step ${i + 1} of ${plan.length}: ${step.line}\n`);
      if (step.when && !existsSync(at(step.when))) { rec.status = 'skipped'; rec.note = `${step.when} is not there`; save(); say(`  ${step.when} is not there: nothing to do.\n`); continue; }
      rec.status = 'running'; rec.at = now().toISOString(); save();
      let result;
      if (step.kind === 'review') {
        result = { status: 'review', why: step.args[0] + facts(root, state.corpusBefore, state.backupDir) };
      } else if (step.kind === 'backup') {
        if (!existsSync(at(CORPUS)) && existsSync(at(BEFORE))) {
          // Round seventy-eight: this version's corpus is written from the version before's (`--rekey`), which is read and
          // never changed, so it is its own backup, and the bucket's copy of it stays where the Worker before reads it.
          const id = readJson(at(`${BEFORE}/manifest.json`))?.id ?? 'no-manifest';
          say(`  ${CORPUS} is not there yet: it is written from ${BEFORE} (corpus ${id}), which is left as it is and is the backup.\n`);
          state.speciesBefore = readJson(at(`${BEFORE}/index.json`))?.length ?? state.speciesBefore;
          state.corpusBefore = id;
          state.backupDir = BEFORE;
          result = { status: 'done' };
        } else {
        const id = readJson(at(`${CORPUS}/manifest.json`))?.id ?? 'no-manifest';
        const to = at(`backups/v${VERSION}-${id}`);
        if (existsSync(to)) say(`  backups/v${VERSION}-${id} is there already: the corpus as it was is kept.\n`);
        else { say(`  copying ${CORPUS} to backups/v${VERSION}-${id} (a minute or two)…\n`); cpSync(at(CORPUS), to, { recursive: true }); say(`  done: to go back, delete ${CORPUS} and copy backups/v${VERSION}-${id} in its place.\n`); }
        state.speciesBefore = readJson(at(`${CORPUS}/index.json`))?.length ?? state.speciesBefore;
        state.corpusBefore = id;
        state.backupDir = `backups/v${VERSION}-${id}`;
        result = { status: 'done' };
        }
      } else if (step.kind === 'dossier') {
        if (!(await syncOnce(root, exec, say, once))) { rec.status = 'failed'; save(); return EXIT.failed; }
        const t0 = Date.now();
        const dropsBefore = existsSync(at('drops.txt')) ? statSync(at('drops.txt')).mtimeMs : 0;
        let output = '';
        // A step that prints nothing for minutes (--fill kew-links reads 8,795 dossiers in about 40) is not stuck: a line every
        // two quiet minutes says it is still working, so a novice watching the screen is not left to guess (round 72's dry run).
        let quietSince = Date.now();
        const beat = setInterval(() => { if (Date.now() - quietSince >= heartbeatMs) { say(`  … still working: ${Math.round((Date.now() - t0) / 60000)} min on this step so far. Leave it running.\n`); quietSince = Date.now(); } }, Math.min(heartbeatMs, 30_000));
        const code = await exec(process.execPath, ['--max-old-space-size=8192', '--import', 'tsx', 'scripts/build-dossiers.ts', ...step.args], (s) => { output += s; quietSince = Date.now(); say(s); }, { cwd: root, env: { ...process.env, CORPUS_STEP: '1' } }).finally(() => clearInterval(beat));
        if (interrupted) break;
        const dropsWritten = existsSync(at('drops.txt')) && statSync(at('drops.txt')).mtimeMs > dropsBefore && statSync(at('drops.txt')).mtimeMs >= t0 - 1000;
        // Pages merged away leave the index on purpose: the species before are counted without them from here on (round 73).
        const gone = mergedAway(output);
        if (gone && state.speciesBefore) { state.speciesBefore -= gone; say(`  ${gone} page${gone === 1 ? '' : 's'} merged into another left the index on purpose: ${state.speciesBefore} species expected from here on.\n`); save(); }
        result = classify({ code, output, dropsWritten, speciesBefore: state.speciesBefore });
      } else if (step.kind === 'upload') {
        result = { status: 'done' };
        for (const [cmd, args] of uploadCommands()) {
          say(`  ${cmd} ${args.join(' ')}\n`);
          const code = await exec(cmd, args, say, { cwd: root, env: process.env });
          if (interrupted) break;
          if (code !== 0) { result = { status: 'failed', why: args[0] === 'check' ? 'the bucket does not hold every file as it is on disk; the manifest was not uploaded, so the site still serves the corpus before' : `rclone ${args[0]} exit ${code}` }; break; }
        }
        if (interrupted) break;
        if (result.status === 'done') await unlistedReport(root, exec, say);
      } else if (step.kind === 'live-check') {
        const code = await exec(process.execPath, ['scripts/live-check.mjs'], say, { cwd: root, env: process.env });
        if (interrupted) break;
        const want = readJson(at(`${CORPUS}/manifest.json`))?.id;
        let got;
        for (let k = 0; k < 12 && want; k++) { got = await fetchCorpus().catch(() => null); if (got === want) break; await new Promise((r) => setTimeout(r, waitMs)); }
        result = code !== 0 ? { status: 'failed', why: `live-check exit ${code}` } : want && got !== want ? { status: 'failed', why: `the site serves corpus ${got ?? '(no answer)'}, not ${want}, three minutes after the upload` } : { status: 'done' };
        if (result.status === 'done' && want) say(`  the site serves corpus ${want}, the one on disk.\n`);
      }
      if (result.status === 'done') { rec.status = 'done'; rec.note = undefined; save(); continue; }
      rec.status = result.status;
      rec.why = result.why;
      rec.note = step.kind === 'review' ? `Review before going on: ${result.why} When it is as expected, carry on with: node scripts/corpus-step.mjs --go-on` : stopSentence(step, result);
      save();
      say(`\n${rec.note}\n`);
      return EXIT[result.status];
    }
    if (interrupted) {
      const i = state.steps.findIndex((s) => s.status === 'running');
      if (i >= 0) { state.steps[i].status = 'interrupted'; save(); }
      say(`\nStopped by Ctrl-C${i >= 0 ? ` during "${state.steps[i].line}"` : ''}. Nothing is lost: run the same command to carry on: node scripts/corpus-step.mjs\n`);
      return EXIT.interrupted;
    }
    say(`\n=== ${stamp()}  every step is done. The record is corpus-step.json; the log is corpus-step.log.\n`);
    return EXIT.done;
  } finally {
    flush();
    process.off('SIGINT', onInt);
  }
}

/**
 * A dossier with its id fields set aside (round seventy-eight): the version, the id, the other pages a photograph or the
 * range names, and the stamp's fingerprint (the day is kept). Two dossiers equal under it show the same page.
 */
export function withoutIds(d) {
  const o = structuredClone(d);
  delete o.v; delete o.key;
  if (o.changed) delete o.changed.h;
  if (o.distribution?.via) delete o.distribution.via.page;
  for (const p of o.photos ?? []) delete p.shared;
  return o;
}
/** Whether two dossiers' texts are one page: byte for byte, or, across the change of ids, equal but for the id fields. */
const samePage = (a, b, acrossIds) => a.equals(b) || (acrossIds && JSON.stringify(withoutIds(JSON.parse(a.toString('utf8')))) === JSON.stringify(withoutIds(JSON.parse(b.toString('utf8')))));

/** What the review before the upload states: the corpus on disk against the backup, and drops.txt. */
export function facts(root, before, backupDir) {
  const m = readJson(join(root, CORPUS, 'manifest.json'));
  const idx = readJson(join(root, CORPUS, 'index.json'));
  const drops = existsSync(join(root, 'drops.txt')) ? readFileSync(join(root, 'drops.txt'), 'utf8').split(/\r?\n/).filter(Boolean).length : 0;
  // The dossiers this step changed: each one's bytes against the backup's (a few seconds for nine thousand). A backup of
  // version 2 (round seventy-eight's step, whose backup is static/s/v2) names its dossiers by GBIF key, so each is found by
  // the dossier's `ids.gbif` and compared without the id fields.
  const back = backupDir ? join(root, backupDir) : before ? join(root, 'backups', `v${VERSION}-${before}`) : null;
  let changed = null;
  let acrossIds = false;
  if (back && existsSync(back) && existsSync(join(root, CORPUS))) {
    changed = [];
    acrossIds = !readdirSync(back).some((x) => DOSSIER_FILE.test(x)) && readdirSync(back).some((x) => V2_FILE.test(x));
    for (const f of readdirSync(join(root, CORPUS)).filter((x) => DOSSIER_FILE.test(x))) {
      const now = readFileSync(join(root, CORPUS, f));
      const gbif = acrossIds ? readJson(join(root, CORPUS, f))?.ids?.gbif : null;
      const was = join(back, acrossIds ? `${gbif}.json` : f);
      if (!existsSync(was) || !samePage(readFileSync(was), now, acrossIds)) changed.push(f.slice(0, -5));
    }
  }
  const ch = changed ? `; ${changed.length} dossier${changed.length === 1 ? ' differs' : 's differ'} from the backup of corpus ${before}${acrossIds ? ' apart from their ids' : ''}${changed.length ? ` (${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', …' : ''})` : ''}` : '';
  return ` (corpus on disk ${m?.id ?? 'none'}, was ${before ?? 'not recorded'}; ${idx?.length ?? '?'} species${ch}; drops.txt ${drops ? `${drops} lines` : 'not there'}).`;
}

/**
 * `svelte-kit sync`, once a run, before the first step that runs the builder: the builder's imports (`$core`, `$dossier`)
 * resolve through .svelte-kit/tsconfig.json, which a fresh checkout or a cleaned folder lacks (round seventy-two; B11).
 */
async function syncOnce(root, exec, say, done) {
  if (done.synced) return true;
  let out = '';
  const code = await exec(process.execPath, ['node_modules/@sveltejs/kit/svelte-kit.js', 'sync'], (s) => { out += s; }, { cwd: root, env: process.env });
  if (code !== 0) { say(`${out}\nsvelte-kit sync failed (exit ${code}), so the builder cannot find its own modules. Run npm install, then this command again.\n`); return false; }
  done.synced = true;
  return true;
}

/**
 * The bucket's top-level dossiers that the index does not list (species since followed to another page, or pruned), as
 * a report only: written to bucket-unlisted.txt, nothing deleted (round seventy-two; REVIEW-TRIAGE-71 D9 with E4). A
 * listing that fails is said and changes nothing.
 */
export async function unlistedReport(root, exec, say) {
  let listing = '';
  const code = await exec('rclone', ['lsf', BUCKET, '--files-only'], (s) => { listing += s; }, { cwd: root, env: process.env });
  if (code !== 0) { say(`  the bucket's dossiers could not be listed (rclone exit ${code}): not checked against the index; nothing is changed.\n`); return null; }
  const listed = new Set((readJson(join(root, CORPUS, 'index.json')) ?? []).map((e) => `${e.key}.json`));
  const extra = listing.split(/\r?\n/).map((l) => l.trim()).filter((f) => DOSSIER_FILE.test(f) && !listed.has(f)).sort();
  writeFileSync(join(root, 'bucket-unlisted.txt'), extra.map((f) => f.slice(0, -5)).join('\n') + (extra.length ? '\n' : ''));
  say(extra.length
    ? `  ${extra.length} dossier${extra.length === 1 ? '' : 's'} in the bucket ${extra.length === 1 ? 'is' : 'are'} not in the index (keys in bucket-unlisted.txt: ${extra.slice(0, 8).map((f) => f.slice(0, -5)).join(', ')}${extra.length > 8 ? ', …' : ''}). ${extra.length === 1 ? 'It is' : 'They are'} left as ${extra.length === 1 ? 'it is' : 'they are'}: a report only, nothing deleted.\n`
    : '  every dossier in the bucket is in the index.\n');
  return extra;
}

/** The prune of the bucket's p/, DEPLOY.md section 5, with its dry run as a stop of its own. */
async function prune({ root, argv, exec, say, fetchCorpus }) {
  const at = (p) => join(root, p);
  if (!(await syncOnce(root, exec, say, {}))) return EXIT.failed;
  const live = at('live-manifest.json');
  if (existsSync(live)) unlinkSync(live); // never a live manifest from an earlier prune
  // The search's key files are named by the live manifest's search directories (round seventy-seven), which are fetched
  // beside it into live-search/ so the keep list can read them; a manifest built before them names none.
  const searchDirs = () => Object.entries(readJson(live)?.files ?? {}).filter(([n]) => /^search\/(?:top|blocks|\d+)\.json$/.test(n)).map(([, h]) => `${h}.json`);
  for (const [cmd, args] of [['rclone', ['copyto', `${BUCKET}/manifest.json`, 'live-manifest.json']], ['rclone', ['copy', `${BUCKET}/p`, 'live-search', '--files-from-raw', 'live-search.txt']], [process.execPath, ['--import', 'tsx', 'scripts/build-dossiers.ts', '--keep-list', 'live-manifest.json']]]) {
    if (args[0] === 'copy') {
      const dirs = searchDirs();
      if (!dirs.length) continue;
      rmSync(at('live-search'), { recursive: true, force: true });
      writeFileSync(at('live-search.txt'), dirs.join('\n') + '\n');
    }
    const code = await exec(cmd, args, say, { cwd: root, env: process.env });
    if (code !== 0 || (cmd === 'rclone' && args[0] === 'copyto' && !existsSync(live))) { say(`\nThe prune stopped: ${args[0] === 'copyto' ? 'the live manifest could not be read from the bucket' : args[0] === 'copy' ? "the live manifest's search directories could not be read from the bucket" : 'keep.txt could not be made'}. Nothing was deleted.\n`); return EXIT.failed; }
  }
  const keep = new Set(readFileSync(at('keep.txt'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.replace(/^\//, '')));
  let listing = '';
  const code = await exec('rclone', ['lsf', `${BUCKET}/p`], (s) => { listing += s; }, { cwd: root, env: process.env });
  const inBucket = new Set(listing.split(/\r?\n/).filter(Boolean));
  const missing = [...keep].filter((f) => !inBucket.has(f));
  const liveFiles = Object.values(readJson(live)?.files ?? {}).map((h) => `${h}.json`);
  const liveMissing = liveFiles.filter((f) => !inBucket.has(f));
  if (code !== 0) { say('\nThe prune stopped: the bucket could not be listed. Nothing was deleted.\n'); return EXIT.failed; }
  // The site must serve the bucket's manifest: an isolate that refused it keeps the corpus before, whose files this
  // prune would delete (a Worker older than the manifest, or a manifest it cannot read).
  const served = await fetchCorpus().catch(() => null);
  if (served !== readJson(live)?.id) { say(`\nThe prune stopped: the site serves corpus ${served ?? '(no answer)'}, and the bucket's manifest names ${readJson(live)?.id}. Until the site serves the bucket's manifest, nothing is deleted. Run npm run live-check, and paste what it says back.\n`); return EXIT.failed; }
  if (liveMissing.length) { say(`\nThe prune stopped: the live manifest names ${liveMissing.length} files the bucket does not hold (${liveMissing.slice(0, 3).join(', ')}…). The site is already missing them: upload the corpus again before any prune. Nothing was deleted.\n`); return EXIT.failed; }
  const goes = [...inBucket].filter((f) => !keep.has(f));
  const args = ['delete', `${BUCKET}/p`, '--exclude-from', 'keep.txt', '--min-age', '24h', '--use-server-modtime'];
  if (!argv.includes('--go-on')) {
    let dry = '';
    const dc = await exec('rclone', [...args, '--dry-run'], (s) => { dry += s; }, { cwd: root, env: process.env });
    if (dc !== 0) { say(`\nThe prune's dry run failed (rclone exit ${dc}):\n${dry.split('\n').slice(-5).join('\n')}\nNothing was deleted.\n`); return EXIT.failed; }
    const n = (dry.match(/Skipped delete as --dry-run is set/g) ?? []).length;
    say(`\nThe prune's dry run: the bucket's p/ holds ${inBucket.size} files; keep.txt keeps ${keep.size} (every file the live manifest ${readJson(live)?.id} and this folder's two manifests name${searchDirs().length ? ", with the search's key files their search directories name" : ''}${missing.length ? `, of which ${missing.length} are not in the bucket` : ''}); named by none: ${goes.length}, of which ${n} more than a day old would be deleted now. Every file the live manifest names is in the bucket.\nIf that is as expected, delete them with: node scripts/corpus-step.mjs --prune --go-on\n`);
    return EXIT.review;
  }
  const c = await exec('rclone', [...args, '--stats-one-line'], say, { cwd: root, env: process.env });
  say(c === 0 ? `\nThe prune is done: files no manifest names and more than a day old are deleted from the bucket.\n` : `\nThe prune failed (rclone exit ${c}); what it deleted was named by no manifest. Paste the end of corpus-step.log back.\n`);
  return c === 0 ? EXIT.done : EXIT.failed;
}

/** A child's output as the log keeps it: a progress line rewritten with \r keeps its last form only. */
export function collapse(s) {
  return s.split('\n').map((l) => l.split('\r').filter((x) => x.trim()).pop() ?? '').join('\n').replace(/\n{3,}/g, '\n\n');
}

function spawnExec(cmd, args, onOutput, opts) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { ...opts, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: false }); } catch (e) { onOutput(`  could not start ${cmd}: ${e.message}\n`); resolve(127); return; }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', onOutput); child.stderr.on('data', onOutput);
    child.on('error', (e) => { onOutput(e.code === 'ENOENT' ? `  ${cmd} is not installed, or not on the PATH (DEPLOY.md section 2 says how to install rclone).\n` : `  ${cmd}: ${e.message}\n`); resolve(127); });
    child.on('close', (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}

async function liveCorpus() {
  const r = await fetch(`${process.env.LIVE_CHECK_ORIGIN ?? 'https://cultifolio.com'}/api/corpus`, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'cultifolio-corpus-step' } });
  return (await r.json()).id;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run({ argv: process.argv.slice(2) }).then((code) => process.exit(code));
}

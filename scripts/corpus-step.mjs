// The corpus step as one command (round seventy-two; the owner's process change 2, reviewer D's trial):
//
//   node scripts/corpus-step.mjs              run the round's plan (scripts/corpus-plan.txt), or carry on where it stopped
//   node scripts/corpus-step.mjs --go-on      carry on past the review stop it last made, once you have read what it asked
//   node scripts/corpus-step.mjs --status     say which steps are done and which is next, and change nothing (round
//                                             eighty-one: nothing at all, the record and the log included)
//   node scripts/corpus-step.mjs --backup <label>
//                                             copy the corpus on disk to backups/v<N>-<its id>-<label> (round eighty-one;
//                                             the plan's record is not touched): DEPLOY's (d) keeps the filled corpus so
//   node scripts/corpus-step.mjs --compare <folder>
//                                             say what differs between the corpus on disk and that copy, as a review stop
//                                             says it, rows left "error" among it; changes nothing
//
// One run at a time (round eighty-one): every run but --status and --compare takes corpus-step.lock in the project folder
// (`run-lock.mjs`), and a second refuses, saying which run holds it; so does a builder step typed by hand meanwhile.
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
//   - the upload of a corpus holding a page without a GBIF key, while the live Worker does not say it reads one (round
//     seventy-nine): deploy this round's Worker first, then the same command uploads (exit 2);
//   - a step failed: paste the end of corpus-step.log back (exit 1);
//   - you pressed Ctrl-C: run the same command to carry on (exit 130).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { takeLock, LOCK } from './run-lock.mjs';

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

/**
 * The builder's heap, in MB (round eighty, X): the larger of 8,192 and 70% of the machine's memory, at most 32,768, so a
 * machine with more memory gives the build room; or CULTIFOLIO_HEAP_MB, when it is set to 1,024 or more. The full build
 * stopped with "JavaScript heap out of memory" at 8,192 on the owner's PC (round seventy-nine's code). Returns the size and
 * where it came from, for the step's first line.
 */
export function builderHeap(total = totalmem(), env = process.env) {
  const set = Number(env.CULTIFOLIO_HEAP_MB);
  if (env.CULTIFOLIO_HEAP_MB && Number.isFinite(set) && set >= 1024) return { mb: Math.round(set), why: 'CULTIFOLIO_HEAP_MB' };
  const ram = Math.floor(total / 1048576);
  const mb = Math.min(32768, Math.max(8192, Math.floor(ram * 0.7)));
  return { mb, why: `70% of this machine's ${ram} MB is ${Math.floor(ram * 0.7)}; at least 8192, at most 32768` };
}

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

/** Two spellings of one plan file: either slash, with or without a leading `./` (round eighty). */
export const samePlanFile = (a, b) => { const n = (p) => String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, ''); return n(a) === n(b); };
/** Where an unfinished run of a plan is kept while another plan runs (round eighty): `corpus-step.plan-<its name>.json`, gitignored. */
export const keptStateName = (planFile) => `corpus-step.plan-${String(planFile).replace(/\\/g, '/').split('/').pop().replace(/\.txt$/, '').replace(/[^A-Za-z0-9._-]/g, '_')}.json`;

/** Whether a run's state is of a plan with these steps, line for line, in this order (comments aside). */
export function sameSteps(state, plan) {
  return Array.isArray(state?.steps) && state.steps.length === plan.length && plan.every((s, i) => state.steps[i]?.line === s.line);
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
    // The day's allowance of a source (iNaturalist's 9,000; round seventy-eight's budget) is spent until midnight UTC, so
    // the same command an hour later would stop again at once (round seventy-nine: the six days of the cultivated fill).
    case 'unfinished': return /allowance of \d+ requests is spent|allows about [\d,]+ calls a day/.test(result.why)
      ? `Stopped at "${step.line}": the day's allowance is spent (${result.why}). Nothing is lost and what was read stands. Run the same command again tomorrow, after midnight UTC: ${cmd}`
      : `Stopped at "${step.line}": a source did not answer (${result.why}). Nothing is lost and what was read stands. Run the same command again in an hour or so: ${cmd}`;
    case 'blocked':
    case 'review':
      if (result.why === 'drops') return `Stopped at "${step.line}": some species lost what the build before had; drops.txt in the project folder lists them. Read every line. When each one is expected, carry on with: ${cmd} --go-on`;
      if (result.why === 'unreadable') return `Stopped at "${step.line}": a dossier on disk could not be read (the line above names it), so the index left it out. Do not upload. Paste the end of corpus-step.log back.`;
      if (result.why === 'deploy first') return `Stopped at "${step.line}": the corpus on disk holds ${result.keyless} page${result.keyless === 1 ? '' : 's'} without a GBIF key, and the live Worker ${result.live ? 'does not say it reads one (round seventy-eight\'s answers 503 for such a page)' : 'could not be asked whether it reads one'}. Nothing was uploaded. Deploy this round's Worker first, on the corpus live now (node scripts/predeploy.mjs --tier=app, then node scripts/corpus-ready.mjs && npm run deploy), then run: ${cmd}`;
      if (/^index/.test(result.why)) return `Stopped at "${step.line}": the index now holds fewer species than before (${result.why.replace('index ', '').replace(' < ', ', was ')}). Do not upload. Paste the end of corpus-step.log back.`;
      return `Review: ${result.why}. When it is as expected, carry on with: ${cmd} --go-on`;
    // The upload (round eighty-one, review B7): the dossiers are overwritten in place, and the site reads each species
    // page's own; the index, search and manifest stay the old corpus's until the manifest goes up, last. So a stopped
    // upload leaves the site half new until it is run again: said, and the same command at once.
    case 'failed': return step.kind === 'upload'
      ? `Stopped at "${step.line}": it failed (${result.why}). The site now serves the dossiers copied so far under the old corpus's index, search and manifest (each species page whole, but the catalogue and the search the old corpus's) until the upload finishes: run the same command again now, and it copies only what is not up yet, then the manifest: ${cmd}. If it fails again, paste the last forty lines of corpus-step.log back.`
      : `Stopped at "${step.line}": it failed (${result.why}). Paste the last forty lines of corpus-step.log back. To try that step again: ${cmd}`;
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
/**
 * The pages of the corpus on disk without a GBIF key (round seventy-nine, agent K's): a `k…` page whose index entry has
 * no `gbif`. A `g…` page is keyed by its GBIF key, so it always has one.
 */
export function keylessOnDisk(root) {
  const idx = readJson(join(root, CORPUS, 'index.json'));
  return Array.isArray(idx) ? idx.filter((e) => typeof e?.key === 'string' && e.key.startsWith('k') && e.gbif == null).length : 0;
}
/** Written whole or not at all: a Ctrl-C between the write and the rename leaves the last state, never half of one. */
function writeAtomic(p, text) { writeFileSync(`${p}.tmp`, text); renameSync(`${p}.tmp`, p); }

/**
 * The run. `exec(cmd, args, onOutput)` runs one command and resolves to its exit code (the real one spawns it, with no
 * shell, so a project folder with a space in its path needs no quoting); `fetchCorpus()` reads the live /api/corpus's id,
 * and `fetchLive()` the whole answer (round seventy-nine: whether the live Worker reads a page without a GBIF key). All
 * are given by a test.
 */
/**
 * @param {{ root?: string, argv?: string[], exec?: (cmd: string, args: string[], onOutput: (s: string) => void, opts: { cwd?: string, env?: Record<string, string | undefined> }) => Promise<number>, fetchCorpus?: () => Promise<string | null>, fetchLive?: () => Promise<{ keyless?: boolean } | null>, log?: (s: string) => void, now?: () => Date, waitMs?: number, heartbeatMs?: number, heap?: { mb: number, why: string } }} [o]
 */
export async function run({ root = process.cwd(), argv = [], exec = spawnExec, fetchCorpus = liveCorpus, fetchLive = liveAnswer, log = (s) => process.stdout.write(s), now = () => new Date(), waitMs = 15_000, heartbeatMs = 120_000, heap = builderHeap() } = {}) {
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
  // Round eighty-one (review B5): --status reads, and writes nothing: no record renamed or put aside, no line in the log.
  if (argv.includes('--status')) return status({ root, argv, log });
  // And --compare, which reads the corpus and a copy of it.
  if (argv.includes('--compare')) { log(`${compareSentence(root, argv[argv.indexOf('--compare') + 1])}\n`); return EXIT.done; }
  // One run at a time (round eighty-one, review B6): the lock, released however the run ends.
  const lock = takeLock(root, `node scripts/corpus-step.mjs ${argv.join(' ')}`.trim());
  if (!lock.ok) { say(`\n${lock.sentence}\n`); flush(); return EXIT.blocked; }
  if (lock.took) say(`  ${LOCK} was left by a run that has ended (process ${lock.took.pid ?? '?'}, "${lock.took.what ?? ''}"): taken for this run.\n`);
  process.on('exit', lock.release);
  try {
  if (argv.includes('--backup')) { try { return backupAs(root, argv[argv.indexOf('--backup') + 1], say); } finally { flush(); } }
  if (argv.includes('--prune')) { try { return await prune({ root, argv, exec, say, fetchCorpus }); } finally { flush(); } }
  const { DEFAULT_PLAN, planRel, cmd } = choosePlan(root, argv);
  if (!argv.includes('--plan') && planRel !== DEFAULT_PLAN) say(`  carrying on with ${planRel}, the plan the last run left unfinished (${cmd}).\n`);
  const planFile = at(planRel);
  if (!existsSync(planFile)) { say(`No plan at ${planFile}: nothing to run.\n`); return EXIT.failed; }
  const planText = readFileSync(planFile, 'utf8');
  const plan = parsePlan(planText);
  const stateFile = at('corpus-step.json');
  let state = readJson(stateFile);
  // One run per plan file (round eighty, agent O): a run of another plan (a repair plan on an evening between two days of
  // the full build's fill) put the full build's record aside under a dated name and started its own, and the full plan
  // run again after it then found a record of the other plan and started again from its first step: its backup, the
  // build with --renew, a review stop. Now an unfinished run of another plan is kept under its plan's name
  // (`keptStateName`), and taken up again where it stopped when that plan is next run. The plan's file is compared by
  // its path with either slash, so `--plan scripts\corpus-plan-full.txt` typed on Windows is the same plan.
  if (state && typeof state.planFile === 'string' && !samePlanFile(state.planFile, planRel)) {
    const keptAt = at(keptStateName(planRel));
    const kept = readJson(keptAt);
    if (unfinishedRun(state)) {
      writeAtomic(at(keptStateName(state.planFile)), JSON.stringify(state, null, 1));
      say(`  the unfinished run of ${state.planFile} is kept in ${keptStateName(state.planFile)}; it carries on where it stopped when that plan is run again (node scripts/corpus-step.mjs --plan ${state.planFile}).\n`);
    } else renameSync(stateFile, at(`corpus-step.${stamp().slice(0, 10)}.${Date.now()}.json`));
    if (kept && typeof kept.planFile === 'string' && samePlanFile(kept.planFile, planRel)) {
      writeAtomic(stateFile, JSON.stringify(kept, null, 1));
      unlinkSync(keptAt);
      state = kept;
      say(`  carrying on with the run of ${planRel} that was kept in ${keptStateName(planRel)}.\n`);
    } else state = null;
  }
  // A plan whose steps are the same, line for line, is the same plan (round eighty, agent V): a change to its comments
  // alone, which a round's code delivered during a plan's days of fills brings, keeps where the run is. Any change to a
  // step starts the plan again, as before.
  if (state && state.plan !== sha1(planText) && sameSteps(state, plan)) state.plan = sha1(planText);
  if (!state || state.plan !== sha1(planText)) {
    if (state) renameSync(stateFile, at(`corpus-step.${stamp().slice(0, 10)}.${Date.now()}.json`));
    state = { plan: sha1(planText), started: now().toISOString(), steps: plan.map((s) => ({ line: s.line, status: 'to do' })) };
  }
  state.planFile = planRel;
  const save = () => writeAtomic(stateFile, JSON.stringify(state, null, 1));
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
        say(`  the builder's heap: ${heap.mb} MB (${heap.why}; CULTIFOLIO_HEAP_MB sets another)\n`);
        const code = await exec(process.execPath, [`--max-old-space-size=${heap.mb}`, '--import', 'tsx', 'scripts/build-dossiers.ts', ...step.args], (s) => { output += s; quietSince = Date.now(); say(s); }, { cwd: root, env: { ...process.env, CORPUS_STEP: '1' } }).finally(() => clearInterval(beat));
        if (interrupted) break;
        const dropsWritten = existsSync(at('drops.txt')) && statSync(at('drops.txt')).mtimeMs > dropsBefore && statSync(at('drops.txt')).mtimeMs >= t0 - 1000;
        // Pages merged away leave the index on purpose: the species before are counted without them from here on (round 73).
        const gone = mergedAway(output);
        if (gone && state.speciesBefore) { state.speciesBefore -= gone; say(`  ${gone} page${gone === 1 ? '' : 's'} merged into another left the index on purpose: ${state.speciesBefore} species expected from here on.\n`); save(); }
        result = classify({ code, output, dropsWritten, speciesBefore: state.speciesBefore });
      } else if (step.kind === 'upload') {
        result = { status: 'done' };
        // Round seventy-nine: round seventy-eight's Worker cannot read a page without a GBIF key (its schema required one,
        // so it answered 503), and the manifest's upload is what switches the live site to this corpus. So a corpus holding
        // such a page goes up only once the live Worker says it reads one: this round's Worker is deployed first, on the
        // corpus live now, which it serves as round seventy-eight's did.
        const keyless = keylessOnDisk(root);
        if (keyless) {
          const live = await fetchLive().catch(() => null);
          if (live?.keyless !== true) result = { status: 'blocked', why: 'deploy first', keyless, live: !!live };
          else say(`  the live Worker reads pages without a GBIF key (${keyless} in this corpus): uploading.\n`);
        }
        if (result.status === 'done') say(`  the dossiers go up first and the manifest last: until the manifest is up, the site serves each new dossier as it arrives under the old corpus's index and search. Leave it to finish; if it stops, run the same command again at once.\n`);
        for (const [cmd, args] of result.status === 'done' ? uploadCommands() : []) {
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
      rec.note = step.kind === 'review' ? `Review before going on: ${result.why} When it is as expected, carry on with: ${cmd} --go-on` : stopSentence(step, result, cmd);
      save();
      say(`\n${rec.note}\n`);
      return EXIT[result.status];
    }
    if (interrupted) {
      const i = state.steps.findIndex((s) => s.status === 'running');
      if (i >= 0) { state.steps[i].status = 'interrupted'; save(); }
      say(`\nStopped by Ctrl-C${i >= 0 ? ` during "${state.steps[i].line}"` : ''}. Nothing is lost: run the same command to carry on: ${cmd}\n`);
      return EXIT.interrupted;
    }
    say(`\n=== ${stamp()}  every step is done. The record is corpus-step.json; the log is corpus-step.log.\n`);
    return EXIT.done;
  } finally {
    flush();
    process.off('SIGINT', onInt);
  }
  } finally {
    lock.release();
    process.off('exit', lock.release);
  }
}

/**
 * The plan a run carries on with (round seventy-nine, M), as `run` and `--status` both read it. Given no --plan, a run
 * carries on with the plan the last run left unfinished (corpus-step.json names it), and every stop names the command with
 * its --plan, so a "--go-on" typed after a stop of the full build's plan never starts round seventy-eight's plan (its
 * backup and --rekey) in its place. And a run kept aside while another plan ran (round eighty): with the last run's plan
 * finished, the kept run is the one carried on, never the default plan started over.
 */
export function choosePlan(root, argv) {
  const at = (p) => join(root, p);
  const DEFAULT_PLAN = 'scripts/corpus-plan.txt';
  const prior = readJson(at('corpus-step.json'));
  const keptRun = () => { try { return readdirSync(root).filter((f) => /^corpus-step\.plan-.+\.json$/.test(f)).map((f) => readJson(at(f))).find((st) => typeof st?.planFile === 'string' && unfinishedRun(st))?.planFile ?? null; } catch { return null; } };
  const planRel = argv.includes('--plan') ? argv[argv.indexOf('--plan') + 1] : typeof prior?.planFile === 'string' && prior.planFile !== DEFAULT_PLAN && unfinishedRun(prior) ? prior.planFile : (!unfinishedRun(prior) && keptRun()) || DEFAULT_PLAN;
  const cmd = `node scripts/corpus-step.mjs${planRel !== DEFAULT_PLAN ? ` --plan ${planRel}` : ''}`;
  return { DEFAULT_PLAN, prior, planRel, cmd };
}
/** Whether a run's record has a step not yet done (or skipped). */
const unfinishedRun = (st) => Array.isArray(st?.steps) && st.steps.some((x) => x.status !== 'done' && x.status !== 'skipped');

/**
 * `--status` (round eighty-one, review B5): what a run would carry on with, read and never written. Before, it ran after
 * the plan's record was put aside for a changed plan (renamed to corpus-step.<day>.<n>.json), so a --status typed to check
 * a delivery could itself start the plan again from step 1 at the next run. Now the record, the kept runs and the log are
 * read only; where a run would start the plan again or take up another plan's record, it says so.
 */
export function status({ root, argv, log }) {
  const at = (p) => join(root, p);
  const { DEFAULT_PLAN, planRel, cmd } = choosePlan(root, argv);
  const planFile = at(planRel);
  if (!existsSync(planFile)) { log(`No plan at ${planFile}: nothing to run.\n`); return EXIT.failed; }
  const planText = readFileSync(planFile, 'utf8');
  const plan = parsePlan(planText);
  let state = readJson(at('corpus-step.json'));
  const notes = [];
  if (!argv.includes('--plan') && planRel !== DEFAULT_PLAN) notes.push(`the plan the last run left unfinished is ${planRel} (${cmd})`);
  if (state && typeof state.planFile === 'string' && !samePlanFile(state.planFile, planRel)) {
    const kept = readJson(at(keptStateName(planRel)));
    notes.push(`corpus-step.json is the record of ${state.planFile}; a run of ${planRel} would ${unfinishedRun(state) ? `keep it in ${keptStateName(state.planFile)}` : 'put it aside'}${kept && samePlanFile(kept.planFile ?? '', planRel) ? ` and carry on with the run kept in ${keptStateName(planRel)}` : ' and start this plan at step 1'}`);
    state = kept && samePlanFile(kept.planFile ?? '', planRel) ? kept : null;
  }
  if (state && state.plan !== sha1(planText) && !sameSteps(state, plan)) {
    notes.push(`the steps of ${planRel} are not those of the run recorded (a step line changed, or one added or taken out): a run now would put the record aside and start the plan again at step 1. If that is not meant, put the plan file back as it was`);
    state = null;
  }
  const steps = state?.steps ?? plan.map((p) => ({ line: p.line, status: 'to do' }));
  for (const [i, s] of steps.entries()) log(`${String(i + 1).padStart(2)}. ${s.status.padEnd(11)} ${s.line}${s.note ? `  (${s.note})` : ''}\n`);
  for (const n of notes) log(`  Note: ${n}. --status changed nothing.\n`);
  return EXIT.done;
}

/**
 * `--backup <label>` (round eighty-one, review B4): the corpus on disk copied whole to backups/v<N>-<its id>-<label>, the
 * plan's record untouched. DEPLOY's (d) copies the filled corpus so before the repair, so the repair's changes can be read
 * (`--compare`) and undone without five days of fill again; step 1's backup is of the corpus before the full build.
 */
export function backupAs(root, label, say) {
  if (!label || label.startsWith('--') || !/^[A-Za-z0-9._-]+$/.test(label)) { say('  --backup needs a label of letters, digits, "-", "_" or ".": node scripts/corpus-step.mjs --backup filled\n'); return EXIT.failed; }
  const at = (p) => join(root, p);
  if (!existsSync(at(CORPUS))) { say(`  ${CORPUS} is not there: nothing to copy.\n`); return EXIT.failed; }
  const id = readJson(at(`${CORPUS}/manifest.json`))?.id ?? 'no-manifest';
  const rel = `backups/v${VERSION}-${id}-${label}`;
  if (existsSync(at(rel))) { say(`  ${rel} is there already: the copy made before is kept, and nothing is copied. To compare the corpus with it: node scripts/corpus-step.mjs --compare ${rel}\n`); return EXIT.done; }
  say(`  copying ${CORPUS} (corpus ${id}) to ${rel}…\n`);
  cpSync(at(CORPUS), at(`${rel}.tmp`), { recursive: true });
  renameSync(at(`${rel}.tmp`), at(rel));
  say(`  done: ${rel}. To see what changed since: node scripts/corpus-step.mjs --compare ${rel}. To go back: delete ${CORPUS} and copy ${rel} in its place. Delete the copy once the site serves the corpus after it.\n`);
  return EXIT.done;
}

/** `--compare <folder>` (round eighty-one, review B4): the corpus on disk against a copy, as a review stop says it. */
export function compareSentence(root, folder) {
  if (!folder || !existsSync(join(root, folder))) return `No copy at ${folder ?? '(none named)'}: node scripts/corpus-step.mjs --compare backups/v${VERSION}-<id>-<label>`;
  const id = readJson(join(root, folder, 'manifest.json'))?.id ?? folder;
  return `The corpus on disk against ${folder}${facts(root, id, folder)}`;
}

/**
 * A reference to another page as GBIF's key, whichever version wrote it (round seventy-nine): version 2's number (or the
 * digits of a build's `via.page`), version 3's `g<GBIF key>`, or a `k…` id through `gbifOf` (the corpus's own ids). An id
 * `gbifOf` does not know stays as it is, so it differs from any number and the page is said to differ.
 */
const asGbif = (x, gbifOf) => {
  if (typeof x === 'number' || typeof x !== 'string') return x;
  if (/^[1-9][0-9]*$/.test(x)) return Number(x);
  if (/^g[1-9][0-9]*$/.test(x)) return Number(x.slice(1));
  return gbifOf?.get(x) ?? x;
};
/** Numbers by value, anything else by its text: one order for a list whose order means nothing. */
const setOrder = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
/**
 * A dossier's lists whose order means nothing, each in one order (round seventy-nine): a photograph's `shared`, the other
 * pages that hold it. The index writes them sorted by id, and ids sort otherwise than GBIF's keys, so the same pages can
 * come in another order; the page shows nothing of the order.
 */
export function withSets(d) {
  const o = structuredClone(d);
  for (const p of o.photos ?? []) if (Array.isArray(p.shared)) p.shared = [...p.shared].sort(setOrder);
  return o;
}
/**
 * A dossier with its id fields set aside (round seventy-eight): the version, the id and the stamp's fingerprint (the day
 * is kept). Since round seventy-nine the other pages a photograph or the range names are kept, read as GBIF's keys
 * (`asGbif`), and `shared` as a set (`withSets`): two dossiers equal under it show the same page, and a photograph
 * shared with one page more or fewer differs.
 */
export function withoutIds(d, gbifOf) {
  const o = structuredClone(d);
  delete o.v; delete o.key;
  if (o.changed) delete o.changed.h;
  if (o.distribution?.via?.page != null) o.distribution.via.page = asGbif(o.distribution.via.page, gbifOf);
  for (const p of o.photos ?? []) if (Array.isArray(p.shared)) p.shared = p.shared.map((x) => asGbif(x, gbifOf));
  return withSets(o);
}
/**
 * Whether two dossiers' texts are one page: byte for byte, or equal with their unordered lists in one order (`withSets`),
 * or, across the change of ids, equal but for the id fields (`withoutIds`).
 */
const samePage = (a, b, acrossIds, gbifOf) => {
  if (a.equals(b)) return true;
  const [x, y] = [a, b].map((t) => JSON.parse(t.toString('utf8')));
  return acrossIds ? JSON.stringify(withoutIds(x, gbifOf)) === JSON.stringify(withoutIds(y, gbifOf)) : JSON.stringify(withSets(x)) === JSON.stringify(withSets(y));
};

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
  // Rows a source did not answer ("error"), by source, and the pages that hold one (round eighty-one, review B2): the review
  // before an upload counts them, so a fill that ended with pages left unanswered is seen there, not only in its own lines.
  const errors = errorRows(root);
  if (back && existsSync(back) && existsSync(join(root, CORPUS))) {
    changed = [];
    acrossIds = !readdirSync(back).some((x) => DOSSIER_FILE.test(x)) && readdirSync(back).some((x) => V2_FILE.test(x));
    const files = readdirSync(join(root, CORPUS)).filter((x) => DOSSIER_FILE.test(x));
    // Each page's id and its GBIF key, read once: a reference to a page by id is compared as version 2's GBIF key.
    const gbifOf = new Map();
    if (acrossIds) for (const f of files) { const g = readJson(join(root, CORPUS, f))?.ids?.gbif; if (typeof g === 'number') gbifOf.set(f.slice(0, -5), g); }
    for (const f of files) {
      const now = readFileSync(join(root, CORPUS, f));
      const was = join(back, acrossIds ? `${gbifOf.get(f.slice(0, -5))}.json` : f);
      if (!existsSync(was) || !samePage(readFileSync(was), now, acrossIds, gbifOf)) changed.push(f.slice(0, -5));
    }
  }
  const ch = changed ? `; ${changed.length} dossier${changed.length === 1 ? ' differs' : 's differ'} from the backup of corpus ${before}${acrossIds ? ' apart from their ids' : ''}${changed.length ? ` (${changed.slice(0, 12).join(', ')}${changed.length > 12 ? ', …' : ''})` : ''}` : '';
  const er = errors.pages ? `; ${errors.pages} page${errors.pages === 1 ? ' holds' : 's hold'} a row a source did not answer ("error": ${[...errors.by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}; ${errors.sample.join(', ')}${errors.pages > errors.sample.length ? ', …' : ''}), each said "did not answer" on its page until a fill or a build asks it again` : '';
  // The Kew entries two pages hold, as the last --index listed them (round eighty-two, F; review 1's 4): said only when the
  // file is there, so a corpus with one page a Kew entry reads as before.
  const sharedLines = existsSync(join(root, 'kew-shared.txt')) ? readFileSync(join(root, 'kew-shared.txt'), 'utf8').split(/\r?\n/).filter(Boolean) : [];
  const sh = sharedLines.length ? `; kew-shared.txt ${sharedLines.length} Kew entr${sharedLines.length === 1 ? 'y' : 'ies'} held by two pages or more (${sharedLines.slice(0, 4).map((l) => l.split('\t')[0]).join(', ')}${sharedLines.length > 4 ? ', …' : ''}): one Kew taxon on two pages, which the repair should leave none of` : '';
  return ` (corpus on disk ${m?.id ?? 'none'}, was ${before ?? 'not recorded'}; ${idx?.length ?? '?'} species${ch}${er}; drops.txt ${drops ? `${drops} lines` : 'not there'}${sh}).`;
}

/** Every dossier's rows whose status is "error", by source (round eighty-one, review B2), read whole from the corpus on disk. */
export function errorRows(root) {
  const dir = join(root, CORPUS);
  const by = new Map();
  const sample = [];
  let pages = 0;
  if (!existsSync(dir)) return { pages, by, sample };
  for (const f of readdirSync(dir).filter((x) => DOSSIER_FILE.test(x))) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (!/"status"\s*:\s*"error"/.test(text)) continue;
    let d;
    try { d = JSON.parse(text); } catch { continue; }
    const srcs = Object.entries(d?.upstream ?? {}).filter(([, u]) => u?.status === 'error').map(([k]) => k);
    if (!srcs.length) continue;
    pages++;
    if (sample.length < 8) sample.push(f.slice(0, -5));
    for (const k of srcs) by.set(k, (by.get(k) ?? 0) + 1);
  }
  return { pages, by, sample };
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
  // Each file with the time it was uploaded (round seventy-nine): `--use-server-modtime` makes it the upload's, not the
  // PC's, as `--min-age 24h --use-server-modtime` read it before. A line without a time is a file whose age is not known,
  // and is never deleted.
  const code = await exec('rclone', ['lsf', `${BUCKET}/p`, '--files-only', '--format', 'tp', '--separator', ';', '--time-format', 'RFC3339', '--use-server-modtime'], (s) => { listing += s; }, { cwd: root, env: process.env });
  const uploaded = new Map(listing.split(/\r?\n/).filter(Boolean).map((l) => { const i = l.indexOf(';'); return i < 0 ? [l, NaN] : [l.slice(i + 1), Date.parse(l.slice(0, i))]; }));
  const inBucket = new Set(uploaded.keys());
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
  // Round seventy-nine: rclone is given the files to delete (those named by none, uploaded more than a day ago), never
  // keep.txt as --exclude-from: each of its lines is a rule rclone tries on every file. At the full list's 48,368 species
  // (about 67,000 files a corpus, two in the bucket after a refresh) that is about half an hour to an hour a run, and the
  // prune runs it twice (60,000 files against 30,000 lines took 284 s in the review; the same list of names, 0.8 s).
  // rclone takes --files-from-raw with no other filter, so the day's age is read from the listing above.
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  writeFileSync(at('prune.txt'), goes.filter((f) => uploaded.get(f) <= dayAgo).sort().map((f) => `${f}\n`).join(''));
  const args = ['delete', `${BUCKET}/p`, '--files-from-raw', 'prune.txt'];
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

/** The live /api/corpus, whole (round seventy-nine). */
async function liveAnswer() {
  const r = await fetch(`${process.env.LIVE_CHECK_ORIGIN ?? 'https://cultifolio.com'}/api/corpus`, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'cultifolio-corpus-step' } });
  return r.ok ? await r.json() : null;
}
async function liveCorpus() {
  const r = await fetch(`${process.env.LIVE_CHECK_ORIGIN ?? 'https://cultifolio.com'}/api/corpus`, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'cultifolio-corpus-step' } });
  return (await r.json()).id;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run({ argv: process.argv.slice(2) }).then((code) => process.exit(code));
}

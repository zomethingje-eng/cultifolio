// What a predeploy run proved, and the sentence it ends with (round eighty-four; outside review B12). A run of one test
// ten times ended "every test passed first time; the deploy may go ahead", though a full strict run before it had failed:
// the closing sentence said the gate was passed whatever the run's scope. Now it says what was run, and only a run of
// the whole suite in every engine ends with the deploy going ahead.
//
//   all       the whole suite in every engine (Chromium and its phone, WebKit and its phone, Firefox)
//   chromium  the whole suite in Chromium and its phone only: what a round that changed only the corpus needs (--tier=corpus)
//   part      a spec, a name filter, a subset of projects, another config, a repeat or a shard: a diagnosis, not the gate

/** Options that take a value as the next word: the word after one is not a spec. */
const VALUED = /^(--project|-g|--grep|--grep-invert|--config|-c|--reporter|--workers|-j|--repeat-each|--shard|--max-failures|--retries|--timeout|--output|--trace|--global-timeout)$/;
/** Options that narrow or bend the run, so that it is not the gate. */
const NARROWING = /^(-g|--grep|--grep-invert|--config|-c|--repeat-each|--shard|--last-failed|--only-changed|--max-failures|-x|--retries|--forbid-only|--list|--pass-with-no-tests|--update-snapshots|-u)$/;

/**
 * The scope of a run: `extra` is what was handed to Playwright beyond the script's own options, `filtered` the projects a
 * `--project` names (none for every project), `engines` the engines beyond Chromium that the run's projects include.
 * @param {{ extra?: string[], filtered?: string[], engines?: string[] }} run
 * @returns {{ scope: 'all' | 'chromium' | 'part', what: string }}
 */
export function runScope({ extra = [], filtered = [], engines = [] }) {
  const narrowed = [];
  for (let i = 0; i < extra.length; i++) {
    const a = extra[i];
    const name = a.split('=')[0];
    if (name.startsWith('--project')) continue; // read as `filtered`
    if (NARROWING.test(name)) narrowed.push(name === '-g' || name.startsWith('--grep') ? 'a name filter' : name === '-c' || name === '--config' ? 'another config' : name);
    else if (!a.startsWith('-') && !(i > 0 && VALUED.test(extra[i - 1]))) narrowed.push(a);
  }
  const every = new Set(['chromium', 'phone', ...(engines.includes('webkit') ? ['webkit', 'phone-webkit'] : []), ...(engines.includes('firefox') ? ['firefox'] : [])]);
  const subset = filtered.length > 0 && [...every].some((p) => !filtered.includes(p));
  if (narrowed.length || subset) return { scope: 'part', what: [...narrowed, ...(subset ? [`the projects ${filtered.join(', ')}`] : [])].join(', ') };
  return { scope: engines.includes('webkit') && engines.includes('firefox') ? 'all' : 'chromium', what: '' };
}

/** The run's last line, by its status and its scope. @param {number} status @param {{ scope: string, what: string }} s */
export function closingLine(status, { scope, what }) {
  if (status !== 0) return scope === 'part' ? `predeploy: the tests selected failed (exit ${status}; ${what}); do not deploy` : `predeploy: the strict run failed (exit ${status}); do not deploy`;
  if (scope === 'all') return 'predeploy: every test passed first time in every engine; the deploy may go ahead';
  if (scope === 'chromium') return 'predeploy: every test passed first time in Chromium (desktop and phone). That is the gate for a round that changed only the corpus (--tier=corpus); a round that changed the app runs every engine first: node scripts/predeploy.mjs --tier=app';
  return `predeploy: the tests selected passed first time (${what}). This was not the run before a deploy, which runs the whole suite in every engine: node scripts/predeploy.mjs --tier=app`;
}

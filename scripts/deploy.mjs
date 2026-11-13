// Round eighty-nine: the deploy, without running again what the predeploy just passed (scripts/deploy-stamp.mjs).
//
//   node scripts/deploy.mjs      svelte-check and the unit tests unless a predeploy passed them on this very code, then
//                                the build, wrangler deploy and the live check, as `npm run deploy` runs them
//
// `npm run deploy` stays as it was, and runs everything. Each step stops the deploy at its first failure and says which.
import { spawnSync } from 'node:child_process';
import { treeMark, readStamp, deploySteps } from './deploy-stamp.mjs';

const root = process.cwd();
const plan = deploySteps(readStamp(root), treeMark(root));
console.log(`deploy: ${plan.why}`);
const steps = [
  ...(plan.check ? [['svelte-check', 'npm run check']] : []),
  ...(plan.unit ? [['the unit tests', 'npm run test']] : []),
  ['the build', 'npm run build'],
  ['wrangler deploy', 'npx wrangler deploy'],
  ['the live check', 'node scripts/live-check.mjs']
];
for (const [what, cmd] of steps) {
  console.log(`deploy: ${what} (${cmd})`);
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  if (r.error || (r.status ?? 1) !== 0) {
    console.log(`deploy: ${what} failed (exit ${r.status ?? 'none'})${what === 'the live check' ? '; the Worker is deployed' : '; nothing after it was run'}. Send back the lines above.`);
    process.exit(r.status || 1);
  }
}
console.log('deploy: done');

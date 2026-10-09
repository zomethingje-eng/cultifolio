/**
 * Self-review of round sixty-one, records area: /about/formats against `collection.restore`.
 *
 * Round sixty-one (decision 2, records review 12) changed what a restored plant yields to: no longer "a record created
 * after the removal" (two clocks) but a record whose first change reached this device after the removal did (the
 * vault's order store, `arrivalsOf`). REVIEW-ROUND-61 section 2.4 says so, and that a peer plant made before the removal
 * but arriving after it now makes the restored plant renumber. /about/formats still states the old rule.
 *
 * FAILS on f4ab4f8 (a reproduction). Run: npx vitest run tests/unit/records--r61-about-restore.test.ts
 */
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

it('/about/formats states the restore rule the code keeps (arrival on this device, not creation)', () => {
  const formats = readFileSync('src/routes/about/formats/+page.svelte', 'utf8');
  const code = readFileSync('src/lib/db/collection.svelte.ts', 'utf8');
  expect(code).toMatch(/arrivalsOf\(\[removedAt/); // the code: by arrival
  expect(formats).not.toMatch(/yields its number only to a record created after the removal/);
  expect(formats).toMatch(/reached this device/);
});

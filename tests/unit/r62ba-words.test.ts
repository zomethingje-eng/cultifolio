/**
 * Round sixty-two, second pass, agent A: the words the verification review found on Today and in the calendar file.
 *
 * - words 6: a call this site held back is "not asked" (rule 2); Today put it under the "not checked" pill. Agent S removed
 *   the forecast route's "held" state, so Today's branch is removed, not reworded.
 * - words 7: "No site set. use my location" began a sentence in lower case; in the sample the Settings link led to a shut page.
 * - grower (smaller): the calendar's "download again" event said every repeat stops, though a place with no dry months
 *   repeats without end in the same file; the front page's "Water this one" did not say which plant.
 *
 * Reproductions (fail on the base): every test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calendarOf, type RhythmSource } from '$lib/export/rhythms';

const code = (p: string) => readFileSync(p, 'utf8');
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');
const again = (ics: string) => {
  const ev = unfold(ics).split('BEGIN:VEVENT\r\n').find((e) => e.includes('UID:download-again.'));
  return ev ? /DESCRIPTION:(.*)\r\n/.exec(ev)![1].replace(/\\([,;\\])/g, '$1') : null;
};
const src = (rule: RhythmSource['rule']): RhythmSource => ({
  today: '2026-10-04',
  collection: 'k3x9',
  plants: [
    { id: 'a', no: '2026-0001', name: 'Copiapoa cinerea', placeId: 'gh', ownDays: null },
    { id: 'b', no: '2026-0002', name: 'Lithops lesliei', placeId: 'cf', ownDays: null }
  ],
  placeName: (id) => ({ gh: 'Greenhouse', cf: 'Cold frame' })[id] ?? id,
  rule,
  from: () => '2026-09-30'
});
const at = new Date(Date.UTC(2026, 9, 4, 12));

describe('the "download again" event says which repeats stop (the verification review\'s grower, smaller)', () => {
  it('with a place that repeats without end beside one that stops, it names the one that stops and says the others do not', () => {
    const d = again(calendarOf(src((id) => (id === 'gh' ? { every: 10, dry: [12, 1, 2] } : { every: 21, dry: [] })), at).text)!;
    expect(d).not.toMatch(/^The watering repeats in this file stop/);
    expect(d).toMatch(/^Some of the watering repeats in this file stop from today, \d{4}-\d{2}-\d{2}: Greenhouse\. The others repeat without end\./);
    expect(d).not.toContain('Cold frame');
  });
  it('with two places that stop on different days, the later is "stop later"', () => {
    // The two-year horizon ends in October: the cold frame, dry in September and October, stops at the end of August 2028.
    const d = again(calendarOf(src((id) => (id === 'gh' ? { every: 10, dry: [12, 1, 2] } : { every: 10, dry: [9, 10] })), at).text)!;
    expect(d).toMatch(/^Some of the watering repeats in this file stop from today, 2028-08-31: Cold frame\. The others stop later\./);
  });
  it('when every repeat stops on that day, it says so plainly (guard)', () => {
    const d = again(calendarOf(src(() => ({ every: 10, dry: [12, 1, 2] })), at).text)!;
    expect(d).toMatch(/^The watering repeats in this file stop from today, \d{4}-\d{2}-\d{2}\. Download the calendar again/);
  });
});

describe('Today\'s words (the verification review\'s words 6 and 7)', () => {
  const today = code('src/routes/today/+page.svelte');
  it('the held alerts branch is gone: the forecast route no longer answers "held" (agent S), so Today has no "not checked" for it', () => {
    expect(today).not.toContain("alertsStatus === 'held'");
    expect(today).not.toMatch(/<NotChecked what="Alerts" why="This site's calls/);
  });
  it('"Use my location" starts its sentence with a capital, and the Settings link is not offered in the sample', () => {
    expect(today).not.toMatch(/No site set\. <button[^>]*>\{locating \? 'Locating…' : 'use my location'\}/);
    // Round sixty-seven (triage-66 V8): the example has no site of its own and none is made up for it, so in the example
    // the line says so, with neither "Use my location" nor the Settings link; outside it, both, as before (and no block
    // before "or" to drop its space: triage-66 P5).
    expect(today).toMatch(/\{#if PAGE_IN_DEMO\}\s*<p class="small muted froststrip" id="frost-example">The example collection has no site of its own[^<]*<\/p>\s*\{:else\}\s*<p class="small muted froststrip">No site set\. <button[^>]*>\{locating \? 'Locating…' : 'Use my location'\}<\/button> or <a href="\/settings#site">/);
  });
  it('the front page\'s one plant to water is named by its number, not "this one"', () => {
    const line = code('src/lib/ui/Today.svelte');
    expect(line).not.toContain("'Water this one'");
    expect(line).toContain('`Water ${accNo(toWater[0])}`');
    expect(line).toContain('aria-label={toWater.length === 1 ? `Water ${accNo(toWater[0])} ${plantLabel(toWater[0])}` : undefined}');
  });
});

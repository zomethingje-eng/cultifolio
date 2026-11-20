/**
 * Round one hundred and one: the live check says whether GBIF still serves the backbone our pages are pinned to
 * (scripts/gbif-backbone-check.mjs). Three ways asked of one plant: the backbone's own answers are "still serves"; a match
 * to another key, a species record of another dataset, or no records under the backbone are a WARNING; a way that did
 * not answer is said as not answered, never as changed (rule 2); and the live check prints it as a note, never a failure.
 *
 * On 1322aa5: scripts/gbif-backbone-check.mjs did not exist and the live check asked nothing of GBIF's backbone; every
 * case FAILED.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { backboneVerdict, BACKBONE, PROBE, PROBE_URLS } from '../../scripts/gbif-backbone-check.mjs';

const today = {
  match: { status: 200, data: { usageKey: 2882316, matchType: 'EXACT', status: 'ACCEPTED' } },
  species: { status: 200, data: { key: 2882316, datasetKey: BACKBONE } },
  search: { status: 200, data: { count: 1592794 } }
};

describe('backboneVerdict', () => {
  it("reads GBIF's answers of 20 November 2026 as the backbone still served", () => {
    const v = backboneVerdict(today);
    expect(v.changed).toEqual([]);
    expect(v.sentence).toMatch(/^GBIF still serves the backbone/);
  });
  it('says a WARNING when the name match answers a COL XR key', () => {
    const v = backboneVerdict({ ...today, match: { status: 200, data: { usageKey: '3DSK5', matchType: 'EXACT' } } });
    expect(v.sentence).toMatch(/^WARNING: .*the name match: Fagus sylvatica matched 3DSK5/);
    expect(v.sentence).toMatch(/PLAN-100/);
  });
  it('says a WARNING when the key is no longer the backbone\'s, or gone', () => {
    expect(backboneVerdict({ ...today, species: { status: 200, data: { key: 2882316, datasetKey: '7ddf754f-d193-4cc9-b351-99906754a03b' } } }).changed).toHaveLength(1);
    expect(backboneVerdict({ ...today, species: { status: 404, data: {} } }).changed[0]).toMatch(/HTTP 404/);
  });
  it('says a WARNING when the backbone search holds no records', () => {
    expect(backboneVerdict({ ...today, search: { status: 200, data: { count: 0 } } }).changed[0]).toMatch(/has 0 records/);
  });
  it('says a way that did not answer as not answered, never as changed', () => {
    const one = backboneVerdict({ ...today, search: { status: 0 } });
    expect(one.changed).toEqual([]);
    expect(one.sentence).toMatch(/still serves .*not answered: the occurrence search/);
    const none = backboneVerdict({ match: { status: 503 }, species: { status: 0 }, search: { status: 429 } });
    expect(none.changed).toEqual([]);
    expect(none.sentence).toMatch(/^GBIF did not answer .*was not checked/);
  });
  it('asks the backbone by its checklistKey, of the probe plant', () => {
    expect(PROBE_URLS.search).toContain(`checklistKey=${BACKBONE}`);
    expect(PROBE_URLS.species).toContain(String(PROBE.key));
  });
});

describe('the live check', () => {
  it('prints the verdict as a note after its checks, and never fails on it', () => {
    const src = readFileSync('scripts/live-check.mjs', 'utf8');
    const at = src.indexOf("await import('./gbif-backbone-check.mjs')");
    expect(at).toBeGreaterThan(0);
    const block = src.slice(src.lastIndexOf('if (!skip.has(\'backbone\'))', at), src.indexOf('live check passed', at));
    expect(block).toMatch(/console\.log\(`  note  /);
    expect(block).not.toMatch(/fail\(/);
  });
});

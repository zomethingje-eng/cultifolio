/**
 * Round eighty-nine: a page with no GBIF key, whose build said why from GBIF's backbone (`occurrences.unread`), is not an
 * offline gap: `--list-offline` no longer lists it for an online build (round eighty-seven's stage 2 listed 599 such pages,
 * and the online build gave each the same "not asked"), and `--list-derived` counts it as holding no record through the
 * API, not as unknown. A page whose source was not asked because the build was offline is listed, and a page derived before
 * the count was kept is unknown, as before.
 */
import { describe, it, expect } from 'vitest';
import { offlinePages } from '../../src/lib/dossier/offline-list';
import { derivedTally } from '../../src/lib/dossier/derived-dataset';

const WHY = "GBIF's backbone does not hold the one name Kew's World Checklist gives this species, so there is no GBIF key to ask its records by, and no name is matched to GBIF";
const noKey = { key: 'k105174', name: { scientific: 'Jubaeopsis afra' }, ids: {}, upstream: { 'gbif.occurrences': { status: 'skipped', detail: WHY }, 'wcvp.distribution': { status: 'ok' } }, occurrences: { rangeRule: 'r87', unread: { why: WHY } } };
const offline = { key: 'g3702919', name: { scientific: 'Conophytum tomasii' }, ids: { gbif: 3702919 }, upstream: { 'gbif.occurrences': { status: 'ok' }, 'wcvp.distribution': { status: 'skipped', detail: "not asked: offline: Kew's file holds no row" } }, occurrences: { rangeRule: 'r87' } };
const noKeyKewOffline = { ...noKey, key: 'k1', name: { scientific: 'Aus bus' }, upstream: { ...noKey.upstream, 'wcvp.distribution': { status: 'skipped', detail: 'not asked: offline' } } };

describe('r89d: pages with no GBIF key to ask', () => {
  it('--list-offline lists the offline gaps only', () => {
    expect(offlinePages([noKey, offline, noKeyKewOffline] as never, 'r87').map((l) => l.split('\t')[0])).toEqual(['g3702919 Conophytum tomasii', 'k1 Aus bus']);
    // A page with no key whose build gave no reason is listed, as before (the reason is what makes it known).
    const silent = { ...noKey, occurrences: { rangeRule: 'r87' } };
    expect(offlinePages([silent] as never, 'r87')).toHaveLength(1);
  });
  it('--list-derived: none through the API, known; a page from before the count, unknown', () => {
    const t = derivedTally([noKey, { key: 'k2', name: { scientific: 'Old page' }, ids: { gbif: 5 }, occurrences: {} }, { key: 'k3', ids: { gbif: 6 }, occurrences: { api: [{ key: 'd1', n: 4 }] } }] as never);
    expect(t.unknown).toBe(1);
    expect(t.unknownPages).toEqual(['k2 Old page']);
    expect(t.withApi).toBe(1);
    expect(t.records).toBe(4);
  });
});

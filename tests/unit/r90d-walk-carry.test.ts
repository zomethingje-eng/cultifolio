/**
 * Round ninety (the owner's decision of 14 November 2026): a walk carries the build before's records, range, marker and
 * climate when GBIF's search fails part way, as an online build does, and `--list-offline` lists the page to be asked
 * again online.
 *
 * Since round eighty-nine the walk (an offline re-derivation) asks GBIF's search for the species the download left to it.
 * In stage 2's walk that search failed part way for Frangula alnus: the re-derivation carried only a source it had not
 * asked, so the page lost its records, range and climate ("not answered"), and `--list-offline` did not list it, since it
 * listed only sources not asked. It was found and built again online by hand.
 *
 * On fce7905: FAILED. carriesCore gave false for a re-derivation whose GBIF row was "error" or "refused", and offlineWhy
 * gave null for the page, carried or not.
 */
import { describe, it, expect } from 'vitest';
import { carriesCore } from '../../src/lib/dossier/carry-core';
import { offlineWhy } from '../../src/lib/dossier/offline-list';

const ok = { status: 'ok' };
const prev = { v: 3, ids: { gbif: 3039454 }, upstream: { 'gbif.occurrences': ok, 'wcvp.distribution': ok } };
const now = (status: string) => ({ v: 3, ids: { gbif: 3039454 }, upstream: { 'gbif.occurrences': { status, detail: 'api.gbif.org timeout' }, 'wcvp.distribution': ok } });
const page = (upstream: Record<string, { status: string; detail?: string }>) => ({ key: 'k2814031', name: { scientific: 'Frangula alnus' }, upstream, occurrences: { rangeRule: 'r87' } });

describe('r90d 1: the walk carries through a search that did not answer', () => {
  it('error and refused carry in a re-derivation, as in an online build (Frangula alnus)', () => {
    for (const st of ['error', 'refused']) {
      expect(carriesCore(prev, now(st), true), st).toBe(true); // base: false
      expect(carriesCore(prev, now(st), false), st).toBe(true);
    }
  });
  it('guard: never another key\'s records, never over a build before that had none to give, never across a dossier version', () => {
    expect(carriesCore(prev, { ...now('error'), ids: { gbif: 1 } }, true)).toBe(false);
    expect(carriesCore({ ...prev, upstream: { ...prev.upstream, 'gbif.occurrences': { status: 'error' } } }, now('error'), true)).toBe(false);
    expect(carriesCore({ ...prev, v: 2 }, now('error'), true)).toBe(false);
    expect(carriesCore(prev, { ...now('ok') }, true)).toBe(false); // answered: derived, not carried
  });
});

describe('r90d 2: --list-offline lists it, to be asked again online', () => {
  it('carried through an error: listed, saying the build kept and why', () => {
    const carried = 'carried from build of 2026-10-22 as one snapshot; that build: GBIF search; this build: gbif.occurrences error';
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'ok', detail: carried }, 'wcvp.distribution': { status: 'ok', detail: carried } }), 'r87')).toBe('the range, records and climate of the build of 2026-10-22 kept: this build: gbif.occurrences error'); // base: null
  });
  it('nothing to carry (no build before): listed as not answered', () => {
    expect(offlineWhy(page({ 'gbif.occurrences': { status: 'error', detail: 'api.gbif.org timeout' }, 'wcvp.distribution': ok }), 'r87')).toBe('gbif.occurrences not answered (api.gbif.org timeout); nothing carried'); // base: null
  });
});

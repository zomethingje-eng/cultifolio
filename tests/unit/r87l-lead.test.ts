/**
 * Round eighty-seven (the look; plan D1): the front page's lead, one figure from the reference and its trail, read from a
 * species' record by `leadOf`, never written: the coldest night is NASA POWER's lowest daily minimum as the record holds
 * it, with its years; the records and cells are the habitat climate's; the regions Kew's; the records' source and day the
 * record of sources' own row. A record without the figure, or without an open photograph, gives no lead, and the day's
 * species is the strip's first that holds one (`leadFrom`). Fails on the base: the module is new.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { leadOf, leadFrom, dayWords } from '../../src/lib/ui/ref/lead-figure';

const fixture = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));

describe('the lead figure (round eighty-seven, plan D1)', () => {
  it('reads the coldest night, its years and its trail from the record, as the record holds them', () => {
    const l = leadOf(fixture)!;
    expect(l).not.toBeNull();
    expect(l.slug).toBe('copiapoa-cinerea');
    expect(l.name).toBe('Copiapoa cinerea');
    expect(l.coldC).toBe(fixture.climate.extremes.minAbs);
    expect(l.years).toBe(fixture.climate.extremes.years);
    expect(l.records).toBe(fixture.climate.records);
    expect(l.cells).toBe(fixture.climate.cells);
    expect(l.regions).toEqual(['Chile North']);
    // The fixture's records came by the search API: said as that, with the day it was asked, never as a download.
    expect(l.from).toEqual({ download: false, href: null, day: '2026-09-20' });
    expect(l.photo?.lic).toBe('CC BY');
    expect(l.photo?.via).toBe('iNaturalist');
    expect(l.photo?.read).toBe('2026-09-20');
  });
  it('names a GBIF download with its address and the file\'s day where the record of sources has them', () => {
    const d = structuredClone(fixture);
    d.upstream['gbif.occurrences'] = { status: 'ok', at: '2026-10-25T10:00:00Z', asOf: '2026-10-21', detail: 'GBIF occurrence download https://doi.org/10.15468/dl.abc123.' };
    expect(leadOf(d)!.from).toEqual({ download: true, href: 'https://doi.org/10.15468/dl.abc123', day: '2026-10-21' });
  });
  it('gives no lead where the record has no coldest night to show, or none it may show, or no open photograph', () => {
    const none = (f: (d: typeof fixture) => void) => { const d = structuredClone(fixture); f(d); return leadOf(d); };
    expect(none((d) => { delete d.climate.extremes; })).toBeNull();
    expect(none((d) => { d.climate.extremesStatus = 'sea'; })).toBeNull();
    expect(none((d) => { d.climate = { status: 'pending' }; })).toBeNull();
    expect(none((d) => { d.photos = []; })).toBeNull();
    // A source that refused is never read as an answer (rule 2).
    expect(none((d) => { d.upstream['gbif.occurrences'] = { status: 'refused', at: '2026-09-20T00:00:00Z' }; })).toBeNull();
  });
  it('takes the first of the day\'s strip whose record holds the figure, at most three, and none when none does', async () => {
    const empty = { ...structuredClone(fixture), photos: [] };
    const asked: string[] = [];
    const read = async (slug: string) => { asked.push(slug); return slug === 'b' ? fixture : slug === 'x' ? null : empty; };
    expect((await leadFrom([{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }], read))?.slug).toBe('copiapoa-cinerea');
    expect(asked).toEqual(['a', 'b']);
    expect(await leadFrom([{ slug: 'a' }, { slug: 'x' }, { slug: 'a' }, { slug: 'b' }], read)).toBeNull();
    expect(await leadFrom([{ slug: 'a' }], async () => { throw new Error('unreadable'); })).toBeNull();
  });
  it('writes a day in words, and nothing for what is not a day', () => {
    expect(dayWords('2026-10-21')).toBe('21 October 2026');
    expect(dayWords('2026-11-02T08:00:00Z')).toBe('2 November 2026');
    expect(dayWords(null)).toBeNull();
    expect(dayWords('soon')).toBeNull();
  });
  it('the front page says each part of the trail and the rule that chose the species', () => {
    const p = readFileSync('src/routes/+page.svelte', 'utf8');
    for (const t of ['A figure from the reference, and where it came from', 'The coldest night on record where', '>Records</th>', '>From</th>', '>Temperatures</th>', '>Counted only</th>', 'a different species each day, from pages with a habitat climate and an open photograph']) expect(p).toContain(t);
  });
});

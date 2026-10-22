/**
 * Round seventy-two, reviewer F: /about/how says what the merged code does for F's items (triage F1, F2, F3, F6, F9, F14).
 * F3 and F14 are A's and D's sentences, checked against their code; they are true once A's Kew links and D's unlagged reads
 * are merged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');

describe('r72f /about/how', () => {
  it('F2: the stapeliads are not said to be Ceropegia by Kew', () => {
    expect(how).not.toContain('since WCVP counts Brachystelma and the stapeliads');
    // Round seventy-nine's list paragraph replaced the one that said so: the pages are now Kew's own species, so no page
    // carries a Ceropegia name Kew holds as a stapeliad's synonym, and the paragraph names no such pages (round eighty).
    expect(how).not.toMatch(/carry a Ceropegia name that Kew holds as a synonym/);
  });
  it('F1: a frozen wet winter is no growing season', () => {
    expect(how).toMatch(/has a month whose mean nightly low is below 0 °C is read as no growing season/);
  });
  it('F9: a generic noun is no headline, and ranks after whole words', () => {
    expect(how).toMatch(/which is not shown even then: a species no source gives a fuller name has no English name shown/);
    expect(how).toMatch(/a generic noun matched alone comes after every match of whole words/);
  });
  it('F6: an older-name title says its proof beside the quotation', () => {
    expect(how).toMatch(/names its proof: beside the quotation where the title is one of the species' older names/);
  });
  it('F3, F14: the links and the lag, as A and D left them', () => {
    expect(how).toMatch(/whether or not the Wikidata item gives a number/);
    expect(how).not.toMatch(/waits the lag out/);
  });
});

const formats = readFileSync('src/routes/about/formats/+page.svelte', 'utf8');
describe('r72f the about pass after the merge: every agent\'s sentences', () => {
  it('A: the cited name, the -4 numbers, the dropped common names, Kew\'s own names', () => {
    expect(how).toMatch(/the name is cited as Kew's World Checklist cites the entry whose number the page links/);
    expect(how).toMatch(/with or without an author before "ex" inside the brackets/);
    expect(how).toMatch(/A common name that is a scientific name the reference or Kew's World Checklist holds/);
    expect(how).toMatch(/Kew's own names for each page's plant/);
  });
  it('B: the file\'s day, the doubtful regions, one stray record, the spellings, the minimum cells, the download\'s day', () => {
    expect(how).toMatch(/the record of the page's sources says "as of" that day/);
    expect(how).toMatch(/as extinct, or as doubtfully present, are shown/);
    expect(how).toMatch(/where two or more do, that the range and the records disagree/);
    expect(how).toMatch(/an epithet of six letters or more that Kew spells otherwise by at most two letters/);
    expect(how).toMatch(/Three land cells holding in-range records placed to within 10 km are the minimum/);
    expect(how).toMatch(/as GBIF held them on the day it made the download/);
  });
  it('C: museum specimens, a bare genus, shared photographs, Kew\'s subspecies, e-mail credits, the stand-in', () => {
    expect(how).toMatch(/a specimen of a natural-history museum \(a plant on show in another museum is shown\)/);
    expect(how).toMatch(/is shown on neither/);
    expect(how).toMatch(/an e-mail address is never published as an author/);
    expect(how).toMatch(/grey stand-in for a photograph it has not yet processed is not a photograph/);
  });
  it('formats: name.cited, name.kew, distribution.via, distribution.doubtful, asOf, shared; E\'s dates, 404 and kept refusal', () => {
    for (const f of ['<code>name.cited</code>', '<code>name.kew</code>', '<code>distribution.via</code>', '<code>distribution.doubtful</code>', '<code>asOf</code>', '<code>shared</code>']) expect(formats).toContain(f);
    expect(formats).toMatch(/where absent, means not read, never none/);
    expect(formats).toMatch(/A date like 09\/03\/2024, 05\/01\/24 or 19-05-23 is read only by one choice/);
    expect(formats).toMatch(/a key the index does not list answers 404, whatever the bucket still holds/);
    expect(formats).toMatch(/leaves the day's wait standing and is kept beside it/);
  });
});

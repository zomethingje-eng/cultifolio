/**
 * Round seventy-two, reviewer F: the species page's notes read structured fields (triage F13, A2), with the old sentences
 * read only for a dossier built before them; the fixed clause no longer says Kew holds no entry when it holds one by
 * another author (F5); a summary kept because its title is an older name says so (F6).
 */
import { describe, it, expect } from 'vitest';
import { citedNote, rangeNote, olderNames, summaryOlderName } from '$lib/ui/ref/notes';
import { summaryTitleFits } from '$dossier/sources/wikipedia';

const IXORA_OLD = "GBIF's key 8793122 is Ixora coccinea Comm. ex Lam.; Kew accepts Ixora coccinea L., and the name is cited as Kew accepts it";

describe('r72f F13: the note under the name', () => {
  it('reads name.cited when the dossier has it', () => {
    const n = citedNote({ scientific: 'Ixora coccinea', authorship: 'L.', cited: { gbif: 'Comm. ex Lam.', kew: '753844-1' } }, {});
    expect(n).toBe("Cited as Kew's World Checklist cites it, Ixora coccinea L.: GBIF's backbone key for this page carries the name with another author, Comm. ex Lam.");
  });
  it("reads the backbone row's sentence only when name.cited is absent", () => {
    expect(citedNote({ scientific: 'Ixora coccinea', authorship: 'L.' }, { 'gbif.species': { detail: IXORA_OLD } })).toBe(`${IXORA_OLD}.`);
    expect(citedNote({ scientific: 'Copiapoa cinerea', authorship: '(Phil.) Britton & Rose' }, { 'gbif.species': { detail: 'asked 2026-10-09' } })).toBeNull();
  });
});

describe('r72f F13, F5, B3: the range note', () => {
  const dist = (source: string, via?: unknown) => ({ native: [{}], source, via: via as never });
  const name = { scientific: 'Ceropegia villetiae' };
  it('a range from another entry Kew holds the name under is said beside the range (was only in the folded record)', () => {
    const r = rangeNote(dist("WCVP (Govaerts, RBG Kew): Kew holds Ceropegia villetiae (C.A.Lückh.) Bruyns as a synonym of Stapelia villetiae C.A.Lückh.; the range is Stapelia villetiae's"), name);
    expect(r?.text).toMatch(/as a synonym of Stapelia villetiae/);
  });
  it('the old reached-by sentence keeps its line, and the clause no longer says Kew holds no entry at all (Hibiscus acetosella)', () => {
    const r = rangeNote(dist("WCVP (Govaerts, RBG Kew): Kew's entry Sabdariffa acetosella (Welw. ex Hiern) M.M.Hanes & R.L.Barrett, reached by Hibiscus eetveldeanus De Wild. & T.Durand"), { scientific: 'Hibiscus acetosella' });
    expect(r?.clause).toMatch(/^Kew holds no entry of this page's name by its author;/);
  });
  it('reads distribution.via when the dossier has it, before the sentence', () => {
    const r = rangeNote(dist('WCVP (Govaerts, RBG Kew), file of 2026-06-04', { kind: 'synonym-of', entry: 'Stapelia villetiae C.A.Lückh.', page: '123' }), name);
    expect(r).toEqual({ text: "Kew's entry Stapelia villetiae C.A.Lückh.", clause: "Kew holds Ceropegia villetiae as a synonym of Stapelia villetiae C.A.Lückh.; the range is that entry's", page: '123' });
    expect(rangeNote(dist("Kew holds X as a synonym of Y", { kind: 'own', entry: 'Ceropegia villetiae' }), name)).toBeNull();
  });
  it('no line for a plain range, or for no range', () => {
    expect(rangeNote(dist('WCVP (Govaerts, RBG Kew) via GBIF'), name)).toBeNull();
    expect(rangeNote({ native: [], source: "Kew's entry X, reached by Y" }, name)).toBeNull();
  });
});

describe('r72f A2: older names Kew accepts as species of their own', () => {
  it('are listed apart when the dossier has name.kew', () => {
    const r = olderNames(['Rubus nutkanus', 'Bossekia nutkana'], { scientific: 'Rubus parviflorus', kew: { entry: '1', synonyms: [], acceptedElsewhere: ['Rubus nutkanus Moc. ex Ser.'], file: '2026-06-04' } });
    expect(r).toEqual({ older: ['Bossekia nutkana'], kewAccepts: ['Rubus nutkanus'], kewRead: true });
  });
  it('absent name.kew is "not read": every name stays an older name, and nothing is said of Kew', () => {
    expect(olderNames(['Rubus nutkanus'], { scientific: 'Rubus parviflorus' })).toEqual({ older: ['Rubus nutkanus'], kewAccepts: [], kewRead: false });
  });
});

describe('r72f F6: a summary kept because its title is an older name says so', () => {
  it('Callianthe megapotamica quoted from "Abutilon megapotamicum"', () => {
    expect(summaryOlderName('Abutilon megapotamicum', { scientific: 'Callianthe megapotamica', synonyms: ['Abutilon megapotamicum (A.Spreng.) A.St.-Hil. & Naudin'] })).toMatch(/older names/);
  });
  it('agrees with the rule the summary fill keeps them by (summaryTitleFits), and is silent on the page\'s own title', () => {
    const cases: [string, string, string[]][] = [
      ['Abutilon megapotamicum', 'Callianthe megapotamica', ['Abutilon megapotamicum (A.Spreng.) A.St.-Hil. & Naudin']],
      ['Rebutia canigueralii', 'Weingartia pulchra', ['Rebutia canigueralii subsp. pulchra']],
      ['Marjoram', 'Origanum majorana', ['Majorana hortensis Moench']],
      ['Neltuma_glandulosa', 'Prosopis glandulosa', ['Neltuma glandulosa (Torr.) Britton & Rose']]
    ];
    for (const [title, sci, syn] of cases) expect(!!summaryOlderName(title, { scientific: sci, synonyms: syn })).toBe(summaryTitleFits(title, sci, syn));
    expect(summaryOlderName('Prosopis glandulosa', { scientific: 'Prosopis glandulosa', synonyms: [] })).toBeNull();
  });
});

describe('r72f F12: a missing species address names a genus only when it is shaped as a name', () => {
  it('"not-a-plant-zzz" names no genus "Not"; a binomial, a trinomial and a variety do', async () => {
    const { addressGenus } = await import('$lib/ui/ref/notes');
    const { nameFromSlug } = await import('$lib/server/synonyms');
    expect(addressGenus(nameFromSlug('not-a-plant-zzz'))).toBeNull();
    expect(addressGenus(nameFromSlug('not-a-plant'))).toBeNull();
    expect(addressGenus(nameFromSlug('hello'))).toBeNull();
    expect(addressGenus(nameFromSlug('nonsensia-fakeii'))).toBe('Nonsensia');
    expect(addressGenus(nameFromSlug('echinopsis-pachanoi-peruviana'))).toBe('Echinopsis');
    expect(addressGenus(nameFromSlug('haworthia-attenuata-var-radula'))).toBe('Haworthia');
    expect(addressGenus(nameFromSlug('x-gasteraloe-beguinii'))).toBe('Gasteraloe');
    expect(addressGenus(nameFromSlug('copiapoa-cinerea-var-columna-alba'))).toBe('Copiapoa');
  });
});

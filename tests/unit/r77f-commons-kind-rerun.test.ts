/**
 * Round seventy-seven (F), item 3: `--fill commons-kind` asked one file again on every run (round seventy-three's
 * review, section 5; review-73/L.md: "Boswellia's sheet, which is asked every run"). The file is "File:Boswellia
 * papyrifera.jpg", which the fill reads as a herbarium sheet by its description. Round seventy-two's rule asks again any
 * file left out only by its description, so a narrower rule reaches files read before it; a file the rule still reads as
 * a sheet stayed one, and was asked again on every run, one request. The fill now keeps the version of the rule that read
 * the file (`kindRule`), and asks again only under a newer one.
 *
 * Driven on recorded answers, never the network. The two dossiers' photographs are the corpus's own as stored (round
 * seventy-six's copy of the live corpus; on it the fill as it was asks exactly these two files, and no other, in one
 * request). Commons' categories are those the fill recorded with each file. Boswellia's description is not kept in the
 * corpus and Commons refused this workspace when asked for it, so a sentence the rule reads as a sheet stands in for it;
 * Heliamphora's is Commons' as review-73/L.md quotes it. FAILS on r77base: the second run makes one request.
 */
import { describe, it, expect } from 'vitest';
import * as fill from '$dossier/commons-fill';
import { heldNamesOf, sourceKind, SOURCE_KIND_RULE } from '$dossier/photo-kind';
import type { FetchResult } from '$dossier/fetch';

const HELD = heldNamesOf([
  { key: 5421356, name: 'Boswellia papyrifera', syn: ['Amyris papyrifera', 'Ploesslia floribunda', 'Boswellia chariensis', 'Boswellia occidentalis', 'Boswellia odorata'] },
  { key: 7263157, name: 'Heliamphora heterodoxa', syn: ['Heliamphora heterodoxa var. heterodoxa'] },
  { key: 7400459, name: 'Heliamphora purpurascens' }
]);
const boswellia = {
  key: 5421356, name: { scientific: 'Boswellia papyrifera', authorship: '(Caill.) Hochst.', synonyms: ['Amyris papyrifera Caill. ex Delile', 'Amyris papyrifera Delile ex Caill.', 'Boswellia chariensis Guillaumin', 'Boswellia occidentalis Engl.', 'Boswellia odorata Hutch.', 'Ploesslia floribunda Endl.'], vernacular: [], status: 'accepted' },
  climate: { status: 'none' }, literature: [], links: {}, upstream: {},
  photos: [{
    src: 'commons', id: 'File:Boswellia papyrifera.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Boswellia_papyrifera.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Boswellia_papyrifera.jpg', width: 886, height: 1026,
    licence: 'by-sa', attribution: 'Mauro Raffaelli, CC BY-SA 3.0, via Wikimedia Commons', page: 'https://commons.wikimedia.org/wiki/File:Boswellia_papyrifera.jpg',
    categories: ['Boswellia papyrifera', 'GFDL', 'Flora of Ethiopia', 'License migration redundant', 'Self-published work'],
    kind: 'a herbarium sheet (by its description)', sourceRead: true, judged: { not: 'a herbarium sheet (by its description)', rank: 0 }
  }]
};
const heliamphora = {
  key: 7400459, name: { scientific: 'Heliamphora purpurascens', authorship: 'Wistuba, A.Fleischm., Nerz & S.McPherson', synonyms: [], vernacular: [], status: 'accepted' },
  climate: { status: 'none' }, literature: [], links: {}, upstream: {},
  photos: [{
    src: 'commons', id: 'File:Heterodoxa pt12.JPG', url: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Heterodoxa_pt12.JPG', thumb: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Heterodoxa_pt12.JPG', width: 600, height: 959,
    licence: 'by-sa', attribution: 'Seb38, CC BY-SA 3.0, via Wikimedia Commons', page: 'https://commons.wikimedia.org/wiki/File:Heterodoxa_pt12.JPG',
    categories: ['Heliamphora purpurascens', 'GFDL', 'Taken with Pentax Optio E30', 'CC-BY-SA-3.0,2.5,2.0,1.0', 'License migration redundant', 'Self-published work', 'Flora of Bolívar (state)'],
    sourceRead: true, judged: { not: 'named as another species', rank: 2 }
  }]
};
const SHEET = 'Boswellia papyrifera, herbarium sheet'; // the stand-in description (see above)
const ANSWERS: Record<string, { cats: string[]; desc: string; artist: string }> = {
  'File:Boswellia papyrifera.jpg': { cats: boswellia.photos[0].categories, desc: SHEET, artist: 'Mauro Raffaelli' },
  'File:Heterodoxa pt12.JPG': { cats: heliamphora.photos[0].categories, desc: "Heliamphora heterodoxa 'Ptari Tepui' (now known as Heliamphora purpurascens)", artist: 'Seb38' }
};
const memory = (ds: unknown[]) => {
  const files = new Map(ds.map((d) => [`${(d as { key: number }).key}.json`, JSON.parse(JSON.stringify(d))]));
  const writes: string[] = [];
  return { files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f: string, d: unknown) => { writes.push(f); files.set(f, JSON.parse(JSON.stringify(d))); }, get: (f: string) => files.get(f), writes };
};
/** Commons, from the recorded answers; every title asked is noted. */
const commons = (asked: string[][]) => async <T,>(url: string): Promise<FetchResult<T>> => {
  const titles = decodeURIComponent(/titles=([^&]*)/.exec(url)![1]).split('|');
  asked.push(titles);
  const pages = Object.fromEntries(titles.map((t, i) => {
    const a = ANSWERS[t];
    return [String(i + 1), { title: t, imageinfo: [{ extmetadata: { Categories: { value: a.cats.join('|') }, ImageDescription: { value: a.desc }, Artist: { value: a.artist } } }] }];
  }));
  return { status: 'ok', data: { query: { pages } } as T };
};

describe('--fill commons-kind asks nothing on a second run (round seventy-three\'s one file a run)', () => {
  it('the stand-in description is read as the stored kind says, so the answer is the one the corpus holds', () => {
    expect(sourceKind('', SHEET)).toBe(boswellia.photos[0].kind);
  });
  it('the first run asks both files in one request; the second asks none and writes none (FAILS on r77base: one request, the sheet)', async () => {
    const store = memory([boswellia, heliamphora]);
    const asked: string[][] = [];
    const first = await fill.fillCommonsKindAll(store, commons(asked), HELD);
    expect(asked).toEqual([['File:Boswellia papyrifera.jpg', 'File:Heterodoxa pt12.JPG']]);
    expect(first).toMatchObject({ files: 2, before: 0, requests: 1, asked: 2, read: 2, unchecked: 0, shownAgain: 1 });
    expect(store.get('5421356.json').photos[0]).toMatchObject({ kind: 'a herbarium sheet (by its description)', kindRule: SOURCE_KIND_RULE });
    expect(store.get('7400459.json').photos[0].described).toBe(true);

    const again: string[][] = [];
    const second = await fill.fillCommonsKindAll(store, commons(again), HELD);
    expect(again).toEqual([]); // r77base: [['File:Boswellia papyrifera.jpg']]
    expect(second).toMatchObject({ files: 2, before: 2, requests: 0, asked: 0, dossiers: 0 });
    expect(store.writes).toEqual(['5421356.json', '7400459.json']);
  });
  it('guard: a sheet read under an older rule (no `kindRule`, or a lower one) is still asked again, once', async () => {
    const older = JSON.parse(JSON.stringify(boswellia));
    older.photos[0].kindRule = SOURCE_KIND_RULE - 1;
    const store = memory([older]);
    const asked: string[][] = [];
    await fill.fillCommonsKindAll(store, commons(asked), HELD);
    await fill.fillCommonsKindAll(store, commons(asked), HELD);
    expect(asked).toEqual([['File:Boswellia papyrifera.jpg']]);
  });
});

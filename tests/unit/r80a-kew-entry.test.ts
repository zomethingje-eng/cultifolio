/**
 * Round eighty, agent A (review-d 1): Crocus nudiflorus took Crocus mazziaricus's Kew entry. Kew holds "Crocus nudiflorus
 * Sm." twice: 327378, accepted (IPNI 436634-1), and 327379, illegitimate, filed under Crocus mazziaricus 327347 (IPNI
 * 436635-1). Wikidata's item carried 436635-1 as its IPNI, and `kewLinks` took the item's number first among Kew's numbers
 * for the name and author, so the page linked the illegitimate row, `kewEntry` read its accepted entry (327347), and both
 * Crocus pages claimed one entry and kept GBIF ids. Now a number Kew files under another species, where Kew accepts the
 * name by the same author, is never linked, and the entry is the accepted row. Of Kew's 160 such names, 21 are the list's
 * species; Crocus nudiflorus was the only one of them linking the wrong number live. FAILED on r80f: the link was
 * 436635-1, the entry 327347.
 */
import { describe, it, expect } from 'vitest';
import { KewRows, kewRowsFetcher } from '../../src/lib/dossier/kew-rows';
import * as gbif from '../../src/lib/dossier/sources/gbif';
import { KewNamesIndex, kewEntry } from '../../src/lib/dossier/kew-names';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

const rows = [
  { id: '327347', name: 'Crocus mazziaricus', authors: 'Herb.', status: 'Accepted', rank: 'Species', family: 'Iridaceae', acceptedId: '327347', parentId: '', powoId: '436574-1' },
  { id: '327378', name: 'Crocus nudiflorus', authors: 'Sm.', status: 'Accepted', rank: 'Species', family: 'Iridaceae', acceptedId: '327378', parentId: '', powoId: '436634-1' },
  { id: '327379', name: 'Crocus nudiflorus', authors: 'Sm.', status: 'Illegitimate', rank: 'Species', family: 'Iridaceae', acceptedId: '327347', parentId: '', powoId: '436635-1' }
];
const none: JsonFetcher = (async () => { throw new Error('asked a source'); }) as unknown as JsonFetcher;

describe("a name Kew holds twice by one author: the accepted entry is the page's", () => {
  it('kewLinks never takes the number Kew files under another species, whatever the item carries', async () => {
    const kew = new KewRows(['Crocus']);
    for (const r of rows) kew.add(r);
    const k = await gbif.kewIpni(kewRowsFetcher(none, kew), 'Crocus nudiflorus', 'Sm.', 'Iridaceae');
    expect(k.status).toBe('ok');
    if (k.status !== 'ok') return;
    expect(k.data.elsewhere).toEqual(['436635-1']);
    const l = gbif.kewLinks({ ipni: '436635-1', powo: 'urn:lsid:ipni.org:names:436634-1' }, k.data);
    expect(l).toEqual({ ipni: '436634-1', powo: 'urn:lsid:ipni.org:names:436634-1', changed: true });
    // An item carrying the accepted number keeps it.
    expect(gbif.kewLinks({ ipni: '436634-1', powo: 'urn:lsid:ipni.org:names:436634-1' }, k.data).changed).toBe(false);
  });
  it('kewEntry reads the accepted row where the linked number is the one filed elsewhere (a page linked before the fix)', () => {
    const idx = new KewNamesIndex();
    for (const r of rows) idx.add({ id: r.id, name: r.name, authors: r.authors, status: r.status, rank: r.rank, accepted: r.acceptedId, parent: '', powo: r.powoId });
    const page = { key: 2747305, name: { scientific: 'Crocus nudiflorus', authorship: 'Sm.' }, ids: { ipni: '436635-1', powo: 'urn:lsid:ipni.org:names:436635-1' } };
    expect(kewEntry(page, idx)).toBe('327378');
    expect(kewEntry({ key: 2747473, name: { scientific: 'Crocus mazziaricus', authorship: 'Herb.' }, ids: { powo: 'urn:lsid:ipni.org:names:436574-1' } }, idx)).toBe('327347');
  });
});

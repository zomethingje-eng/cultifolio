/**
 * Round 117 (SPECIES 22): the record in a reader's three parts. The registers that accept the name, with the file's day
 * and the id; "Looked for, and not there", only the sources that answered with nothing, never one not asked, refused or
 * failed (rule 2); and where each figure comes from, the sources that answered, with the day read.
 *
 * On 1764df3 there are no parts (only "Where this page came from"): every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import RecordParts from '../../src/lib/ui/ref/RecordParts.svelte';

const d = {
  name: { scientific: 'Welwitschia mirabilis', status: 'accepted', kew: { file: '2026-06-04', entry: '339841', accepted: { name: 'Welwitschia mirabilis' } } },
  nameAgreement: { status: 'ok', kind: 'accepted', release: '2026-06', wfo: 'wfo-0000801450' },
  upstream: {
    'gbif.species': { status: 'ok', at: '2026-11-18T10:00:00Z' },
    'wcvp.distribution': { status: 'ok', at: '2026-11-18T10:00:00Z' },
    chromodb: { status: 'none', at: '2026-11-13' },
    commons: { status: 'skipped', at: '2026-10-29T10:00:00Z' },
    openalex: { status: 'skipped', detail: 'the reference does not ask OpenAlex for papers' },
    inat: { status: 'refused', at: '2026-11-18T10:00:00Z' }
  },
  climate: { status: 'none' }
};
const text = (p: Record<string, unknown>) => render(RecordParts, { props: p as never }).body.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('r117a the record in three parts', () => {
  const t = text({ d });
  it('the registers that accept the name, each with its file and its id', () => {
    expect(t).toContain("Kew's World Checklist of Vascular Plants, the file of 2026-06-04: entry 339841");
    expect(t).toContain('World Flora Online, release 2026-06: wfo-0000801450');
  });
  it('looked for and not there: a source that answered with nothing, and no other', () => {
    const part = t.slice(t.indexOf('Looked for, and not there'), t.indexOf('Where each figure comes from'));
    expect(part).toContain('asked 2026-11-13');
    expect(part).not.toMatch(/Commons|OpenAlex|iNaturalist/);
  });
  it('where each figure comes from: the sources that answered', () => {
    const part = t.slice(t.indexOf('Where each figure comes from'));
    expect(part.match(/read \d{4}-\d{2}-\d{2}/g)?.length).toBe(2);
  });
  it('a name neither register holds as accepted is said so, never left blank', () => {
    expect(text({ d: { ...d, name: { scientific: 'X y', status: 'synonym' }, nameAgreement: undefined } })).toContain("Neither register's reading of this name is held as accepted");
  });
});

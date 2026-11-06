/**
 * Round eighty-six, A1–A2 (outside review B's 1 and 2): a photograph's credit and the day it was read are said whatever the
 * number of photographs, and only an answered source row lends a read day. Rendered, not the helper alone: the round
 * eighty-five helper test passed while the one-photograph page left the day out.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Photos from '$lib/ui/Photos.svelte';

const ph = (id: string, extra: Record<string, unknown> = {}) => ({
  src: 'commons',
  id,
  url: `https://upload.wikimedia.org/${id}.jpg`,
  thumb: `https://upload.wikimedia.org/${id}-thumb.jpg`,
  width: 1200,
  height: 900,
  page: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  attribution: 'A. Photographer, CC BY-SA 4.0',
  licence: 'by-sa',
  ...extra
});
const up = { commons: { status: 'ok', at: '2026-11-03T08:00:00Z' } };
const body = (photos: unknown[], upstream: Record<string, unknown> = up) =>
  render(Photos, { props: { photos, name: 'Pseudolithos migiurtinus', strip: true, lead: true, upstream } as never }).body.replace(/<!--[^]*?-->/g, '');

describe('A1. the credit line for none, one and many photographs', () => {
  it('one photograph: its credit and the day it was read, with no gallery', () => {
    const b = body([ph('only', { read: '2026-11-02' })]);
    expect(b).not.toContain('class="grid');
    expect(b).toMatch(/The photograph: [^<]*A\. Photographer/);
    expect(b).toContain('Credits as read from Wikimedia Commons on 2026-11-02.');
    expect(b).not.toContain('Photographs:');
  });
  it("one photograph with no day of its own: the answered row's day", () => {
    expect(body([ph('only')])).toContain('Credits as read from Wikimedia Commons on 2026-11-03.');
  });
  it('many photographs: the lead, the rest and the day', () => {
    const b = body([ph('a', { read: '2026-11-02' }), ph('b', { read: '2026-11-02', attribution: 'B. Other, CC BY 4.0', licence: 'by' })]);
    expect(b).toContain('class="grid');
    expect(b).toContain('The photograph at the top:');
    expect(b).toContain('Photographs:');
    expect(b).toContain('Credits as read from Wikimedia Commons on 2026-11-02.');
  });
  it('none: the empty note, no credit line', () => {
    const b = body([]);
    expect(b).not.toContain('Credits as read');
    expect(b).toContain('No openly licensed photograph yet');
  });
});

describe('A2. a failed refresh is not a read day, rendered', () => {
  it('a GBIF photograph kept after an error says its day was not recorded', () => {
    const b = body([ph('g', { src: 'gbif' })], { 'gbif.media': { status: 'error', at: '2026-11-05T00:00:00Z' } });
    expect(b).toContain('Credits as read from GBIF on a day not recorded.');
    expect(b).not.toContain('2026-11-05');
  });
});

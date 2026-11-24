/**
 * Round 112 (MYPLANTS 25): the species picker's groups and the emphasis of the part not typed, apart from the component.
 *
 * 1. `pickerGroups`: the species pages first, at most six, exact before similar; at most two other names (the genus with
 *    a cultivar, GBIF's name spelt as typed), never one a page holds; GBIF's other names behind the "more" row; a GBIF row
 *    whose key a page holds is not listed again; with the reference's genus offered for a cultivar, no similar spelling.
 * 2. `emphasised`: the part of the name not typed is set apart, word by word, past a hybrid sign and an accent; a common
 *    name or a misspelling sets nothing apart; the parts join back to the name, italics kept.
 *
 * On 1764df3 neither function exists: every test FAILED.
 */
import { describe, it, expect } from 'vitest';
import { pickerGroups, emphasised, type PickerRow } from '../../src/lib/ui/picker-rows';

const page = (key: number, name: string, similar = false): PickerRow => ({ key, name, local: true, similar });
const gbif = (key: number, name: string, rank = 'SPECIES'): PickerRow => ({ key, name, rank });

describe('r112a pickerGroups', () => {
  it('puts the pages first, at most six, exact before similar', () => {
    const local = [page(1, 'A b', true), ...Array.from({ length: 7 }, (_, i) => page(10 + i, `A x${i}`))];
    const g = pickerGroups({ local, remote: [], genus: [], typed: 'A', dropSimilar: false });
    expect(g.pages.map((p) => p.key)).toEqual([10, 11, 12, 13, 14, 15]);
  });
  it('offers GBIF\'s name spelt as typed and the genus as other names, the rest behind the "more" row', () => {
    const remote = [gbif(11695027, 'Welwitschiapites', 'GENUS'), gbif(2653230, 'Welwitschia', 'GENUS'), gbif(3118121, 'Welwitschiella', 'GENUS')];
    const g = pickerGroups({ local: [page(5275521, 'Welwitschia mirabilis')], remote, genus: [], typed: 'welwitschia', dropSimilar: false });
    expect(g.pages.map((p) => p.name)).toEqual(['Welwitschia mirabilis']);
    expect(g.others.map((p) => p.name)).toEqual(['Welwitschia']);
    expect(g.more.map((p) => p.name)).toEqual(['Welwitschiapites', 'Welwitschiella']);
  });
  it('never lists again a GBIF row whose key a page holds, nor a name a page heads among the other names', () => {
    const remote = [gbif(5362063, 'Crassula ovata'), gbif(999, 'Crassula ovata')];
    const g = pickerGroups({ local: [page(5362063, 'Crassula ovata')], remote, genus: [], typed: 'Crassula ovata', dropSimilar: false });
    expect(g.others).toEqual([]);
    expect(g.more.map((p) => p.key)).toEqual([999]);
  });
  it('holds at most two other names, the genus with its cultivar first', () => {
    const genus = [{ key: 7, name: 'Echeveria', rank: 'GENUS', asCultivar: 'Lola' }];
    const g = pickerGroups({ local: [page(1, 'Echeveria lilacina', true)], remote: [gbif(8, 'Echeveria lola'), gbif(9, 'Echeveria lola', 'VARIETY')], genus, typed: 'Echeveria lola', dropSimilar: true });
    expect(g.pages).toEqual([]); // the similar spelling left out for this shape (round sixty-two; A7)
    expect(g.others.map((p) => `${p.name}:${p.rank}`)).toEqual(['Echeveria:GENUS', 'Echeveria lola:SPECIES']);
    expect(g.more.map((p) => p.key)).toEqual([9]);
  });
});

describe('r112a emphasised', () => {
  const em = (name: string, typed: string) => emphasised(name, typed).filter((p) => p.em).map((p) => p.text.trim()).join('|');
  it('sets apart what the typed words leave of each name word', () => {
    expect(em('Lithops lesliei', 'lithops les')).toBe('liei');
    expect(em('Welwitschia mirabilis', 'welw')).toBe('itschia mirabilis');
    expect(em('Mammillaria', 'mammillaria')).toBe('');
  });
  it('passes over the hybrid sign and an accent', () => {
    expect(em('Aloe × nobilis', 'aloe nob')).toBe('ilis');
    expect(em('Écheveria elegans', 'echeveria')).toBe('elegans');
  });
  it('sets nothing apart for a common name or a misspelling', () => {
    expect(em('Crassula ovata', 'jade plant')).toBe('');
    expect(em('Echeveria elegans', 'echiveria')).toBe('');
  });
  it('joins back to the name, the Latin italic and a rank word roman', () => {
    const parts = emphasised('Ariocarpus retusus subsp. furfuraceus', 'ario');
    expect(parts.map((p) => p.text).join('')).toBe('Ariocarpus retusus subsp. furfuraceus');
    expect(parts.filter((p) => !p.italic).map((p) => p.text.trim()).filter(Boolean)).toEqual(['subsp.']);
  });
});

/**
 * Round eighty-two (S): the species picker writes a name below the species with its rank word (review 1's 17: it showed
 * and wrote "Lithops lesliei luteoviridis · variety"). GBIF's canonical name leaves the word out; the picker now shows
 * and files "Lithops lesliei var. luteoviridis", and the pick still files the variety's key.
 *
 * FAILS on r82base: `rankedName` does not exist.
 */
import { describe, it, expect } from 'vitest';
import { rankedName, pickedName, filesKey, sameName } from '$lib/ui/picked-name';
import { nameParts } from '$core/names';

describe('a name below the species with its rank word (review 1\'s 17)', () => {
  it('writes var., subsp., f. and the notho- ranks, and leaves every other name as given', () => {
    expect(rankedName('Lithops lesliei luteoviridis', 'VARIETY')).toBe('Lithops lesliei var. luteoviridis');
    expect(rankedName('Aloe ferox ferox', 'SUBSPECIES')).toBe('Aloe ferox subsp. ferox');
    expect(rankedName('Mammillaria spinosissima rubra', 'FORM')).toBe('Mammillaria spinosissima f. rubra');
    expect(rankedName('Mentha × piperita citrata', 'NOTHOVARIETY')).toBe('Mentha × piperita nothovar. citrata');
    for (const [n, r] of [['Copiapoa cinerea var. columna-alba', 'VARIETY'], ['Aloe ferox', 'SPECIES'], ['Aloe ferox', 'SUBSPECIES'], ['Aloe', 'GENUS'], ['Lithops lesliei luteoviridis', undefined], ['Haworthia Big Band', 'VARIETY']] as const) expect(rankedName(n, r)).toBe(n);
    // The rank word is set in roman, the epithets in italic.
    expect(nameParts('Mentha × piperita nothovar. citrata').filter((p) => !p.italic).map((p) => p.text.trim())).toEqual(['×', 'nothovar.']);
  });

  it('a pick writes the ranked name and files the variety\'s key', () => {
    const picked = { name: rankedName('Lithops lesliei luteoviridis', 'VARIETY'), rank: 'VARIETY' };
    for (const typed of ['Lithops lesliei lut', 'Lithops lesliei var. lut', 'lithops lesliei luteoviridis']) {
      expect(pickedName(typed, picked), typed).toBe('Lithops lesliei var. luteoviridis');
      expect(filesKey(typed, picked), typed).toBe(true);
    }
    // The name typed with its rank word is the backbone's row, ranked: what the field's check on leaving compares.
    expect(sameName('Lithops lesliei var. luteoviridis', rankedName('Lithops lesliei luteoviridis', 'VARIETY'))).toBe(true);
  });
});

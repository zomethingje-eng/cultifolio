// Self-review of round sixty-one, corpus area: `pickedName` keeps whatever followed the typed binomial, not only a rank
// with its epithet: a half-typed rank ("var", "f"), an author ("Phil.", "N.E.Br."), a field number. The species is
// offered for each of these (the search drops a trailing marker and a dotted author), so one click writes them into the
// plant's name. Before round sixty-one the pick wrote "Copiapoa cinerea".
// REPRODUCTION: the "repro" tests FAIL on f4ab4f8 (6 cases); the guard PASSES.
// Run: npx vitest run tests/unit/corpus--picked-name.test.ts
import { describe, it, expect } from 'vitest';
import { pickedName } from '$lib/ui/picked-name';

const sp = { name: 'Copiapoa cinerea', rank: 'SPECIES' };
describe('repro', () => {
  it.each(['Copiapoa cinerea var', 'Copiapoa cinerea var.', 'Copiapoa cinerea f', 'Copiapoa cinerea ssp'])('a rank with no epithet yet is not kept: %s', (t) => {
    expect(pickedName(t, sp)).toBe('Copiapoa cinerea'); // f4ab4f8: the typed text, dangling rank and all
  });
  it.each(['Copiapoa cinerea Phil.', 'Copiapoa cinerea (Phil.) Britton & Rose'])('an author citation is not written into the name: %s', (t) => {
    expect(pickedName(t, sp)).toBe('Copiapoa cinerea'); // f4ab4f8: "Copiapoa cinerea Phil.", "Copiapoa cinerea Britton & Rose"
  });
});
describe('guard', () => {
  it('a typed rank with its epithet is kept (round sixty-one, corpus 5)', () => {
    expect(pickedName('Copiapoa cinerea var. columna-alba', sp)).toBe('Copiapoa cinerea var. columna-alba');
  });
});

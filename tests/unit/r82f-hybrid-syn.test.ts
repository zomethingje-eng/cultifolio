/**
 * Round eighty-two, agent F: review 1's 27. The index's `syn` cut a hybrid formula to its first parent: k125188 Mentha
 * × piperita showed "older name: Mentha aquatica" (GBIF's synonym "Mentha aquatica × spicata"), k2948609 Fragaria ×
 * ananassa "Fragaria chiloensis" ("Fragaria chiloensis × virginiana"). A formula is two parents, not a name, and is left
 * out; so is the species' own name spelt with an "x" ("Mentha xpiperita", "Fragaria xananassa"). On the reviewers' 9,463
 * live dossiers, 12 pages lose a name so (two first parents, Nerium indicum from "Nerium indicum x Nerium oleander",
 * Aconitum napellus, and eight "x" spellings); written at --index. FAILED on r82base: the parents and spellings were there.
 */
import { describe, it, expect } from 'vitest';
import { olderNamesOf } from '$dossier/index-entry';

describe('a hybrid formula is not an older name', () => {
  it('Mentha × piperita: no "Mentha aquatica", no "Mentha xpiperita"; its real older names kept', () => {
    const r = olderNamesOf('Mentha piperita', ['Mentha aquatica var. piperita (L.) Alef.', 'Mentha aquatica x spicata', 'Mentha aquatica × spicata', 'Mentha lavanduliodora', 'Mentha officinalis L', 'Mentha xpiperita L.']);
    expect([...r.syn, ...r.older]).toEqual(['Mentha aquatica var. piperita', 'Mentha lavanduliodora', 'Mentha officinalis']);
  });
  it('Fragaria × ananassa: no "Fragaria chiloensis", no "Fragaria xananassa"', () => {
    const r = olderNamesOf('Fragaria ananassa', ['Fragaria carolinensis Duchesne', 'Fragaria chiloensis x virginiana', 'Fragaria chiloensis × virginiana', 'Fragaria chiloensis (L.) Mill. × F. virginiana Mill.', 'Fragaria xananassa (Weston) Duchesne']);
    expect(r.syn).toEqual(['Fragaria carolinensis']);
  });
  it('a formula by two full names is left out, and an epithet that begins with x is a name', () => {
    expect(olderNamesOf('Nerium oleander', ['Nerium indicum x Nerium oleander', 'Nerium xerophilum Foo']).syn).toEqual(['Nerium xerophilum']);
    expect(olderNamesOf('Talinella xerophila', ['Talinum xerophilum (Appleq.) Christenh. & Byng']).syn).toEqual(['Talinum xerophilum']);
    expect(olderNamesOf('Aloe spinosissima', ['Aloe ×spinosissima Jacobsen', 'Aloe arborescens × humilis']).syn).toEqual([]);
  });
});

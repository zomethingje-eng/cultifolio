/**
 * Round eighty-one, H (review-w 10 of round eighty; S's need): the "your species" tiles named a hybrid without its sign
 * ("Aloe nobilis · not in the reference" for a plant "Aloe × nobilis") and a plant filed under its genus as a species the
 * reference lacks ("Echeveria · not in the reference", though the reference holds 220 of its species).
 *
 * The taxon records keep their ids: a record's id is its species' slug, and every hybrid page's address is the slug of its
 * name without the sign (none of the live index's 48,361 slugs carries an "x" word), which is the slug the device gives,
 * so the records already meet their pages. What older builds wrote wrong is the record's `name`, "Aloe nobilis". The
 * migration is a reading rule, as the project's earlier ones are since round fifty-six (the one-shape pass): no reading of
 * the log writes to it. Proved here on a real backup of 300 plants made on the live site by the round-eighty app
 * (tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip, review W's import of 2026-10-23): restored into an empty vault
 * and loaded by this build, every change in the log is the file's, byte for byte, and nothing is renamed.
 *
 * On r81base: `speciesName` and `shownSpeciesName` do not exist; `mySpeciesOf` names the record "Aloe nobilis" and gives
 * the Echeveria plant no genus tile; a named nothospecies is not asked of the reference on its plant page.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { speciesName, speciesOf, speciesSlug, withoutSign, isNamedHybrid, isGenusOnly } from '$core/names';
import { mySpeciesOf, shownSpeciesName, notesTaxon } from '$lib/db/species-list';
import type { Accession, Taxon } from '$lib/db/types';

describe('a species name with its sign kept', () => {
  const cases: Array<[string, string]> = [
    ['Aloe × nobilis', 'Aloe × nobilis'], ['Aloe x nobilis', 'Aloe × nobilis'], ['Aloe ×nobilis', 'Aloe × nobilis'],
    ['× Gasteraloe beguinii', '× Gasteraloe beguinii'], ["× Gasteraloe beguinii 'Green Ice'", '× Gasteraloe beguinii'], ['x Gasteraloe beguinii', '× Gasteraloe beguinii'],
    ["× Graptoveria 'Fred Ives'", '× Graptoveria'], ['xGraptoveria', '× Graptoveria'], ["Echeveria 'Perle von Nurnberg'", 'Echeveria'],
    ['Ariocarpus retusus × trigonus', 'Ariocarpus'], ['Haworthia attenuata var. radula', 'Haworthia attenuata'], ['Copiapoa cf. cinerea', 'Copiapoa cinerea'],
    ['Mentha × piperita', 'Mentha × piperita'], ['Mentha piperita', 'Mentha piperita'], ['Xanthosoma sagittifolium', 'Xanthosoma sagittifolium']
  ];
  it.each(cases)('%s → %s, which without its sign is speciesOf’s name, so the slug is the one it always was', (typed, want) => {
    expect(speciesName(typed)).toBe(want);
    expect(withoutSign(speciesName(typed))).toBe(speciesOf(typed));
  });
  it('a named nothospecies is one; a cross written out, a cultivar of a genus and a species are not', () => {
    expect(isNamedHybrid('Aloe × nobilis')).toBe(true);
    expect(isNamedHybrid('× Gasteraloe beguinii')).toBe(true);
    expect(isNamedHybrid('Ariocarpus retusus × trigonus')).toBe(false);
    expect(isNamedHybrid("Echeveria 'Lola'")).toBe(false);
    expect(isNamedHybrid('Mentha piperita')).toBe(false);
    expect(isGenusOnly("Echeveria 'Perle von Nurnberg'")).toBe(true);
    expect(isGenusOnly('× Graptoveria')).toBe(true);
    expect(isGenusOnly('Aloe × nobilis')).toBe(false);
  });
  it('a plant’s notes are kept on the record of the same slug, named with the sign', () => {
    expect(notesTaxon('Aloe × nobilis')).toEqual({ slug: 'aloe-nobilis', name: 'Aloe × nobilis' });
  });
});

const acc = (id: string, taxonName: string, extra: Partial<Accession> = {}): Accession => ({ id, acc: id, taxonName, status: 'growing', ...extra }) as Accession;
const taxon = (id: string, name: string, extra: Partial<Taxon> = {}): Taxon => ({ id, name, ...extra }) as Taxon;

describe('the tiles’ names and kinds (the reading rule)', () => {
  it('a record an older build named without the sign shows the plants’ name with it; its id does not change', () => {
    const m = mySpeciesOf([acc('a', 'Aloe × nobilis')], [taxon('aloe-nobilis', 'Aloe nobilis')]);
    expect([...m.keys()]).toEqual(['aloe-nobilis']);
    expect(m.get('aloe-nobilis')!.name).toBe('Aloe × nobilis');
  });
  it('a record whose name is another (the grower’s own) keeps it; a record with the sign keeps it', () => {
    expect(shownSpeciesName('Aloe nobilis', 'Aloe × nobilis')).toBe('Aloe × nobilis');
    expect(shownSpeciesName('Aloe × nobilis', 'Aloe nobilis')).toBe('Aloe × nobilis');
    expect(shownSpeciesName('Haworthia cooperi', 'Haworthia cooperi')).toBe('Haworthia cooperi');
    expect(shownSpeciesName('Haworthia cooperi var. truncata', 'Haworthia cooperi')).toBe('Haworthia cooperi var. truncata');
    expect(shownSpeciesName(null, 'Aloe × nobilis')).toBe('Aloe × nobilis');
  });
  it('a nothogenus with an epithet, and one alone, keep the sign; a plant filed under its genus is the genus’s tile', () => {
    const m = mySpeciesOf([acc('a', '× Gasteraloe beguinii'), acc('b', "× Graptoveria 'Fred Ives'"), acc('c', 'Echeveria', { cultivar: 'Perle von Nurnberg', nameKind: 'hybrid' })], [taxon('gasteraloe-beguinii', 'Gasteraloe beguinii'), taxon('graptoveria', 'Graptoveria'), taxon('echeveria', 'Echeveria')]);
    expect(m.get('gasteraloe-beguinii')).toMatchObject({ name: '× Gasteraloe beguinii' });
    expect(m.get('gasteraloe-beguinii')!.genus).toBeUndefined();
    expect(m.get('graptoveria')).toMatchObject({ name: '× Graptoveria', genus: true });
    expect(m.get('echeveria')).toMatchObject({ name: 'Echeveria', genus: true, grown: 1 });
  });
  it('a reference hybrid followed from its page (the page’s name, with the sign since this round) keeps it', () => {
    const m = mySpeciesOf([], [taxon('mentha-piperita', 'Mentha × piperita', { followed: true, gbifKey: 8707933 })]);
    expect(m.get('mentha-piperita')).toMatchObject({ name: 'Mentha × piperita', followed: true, grown: 0 });
  });
});

/* ---- the real backup ---- */

const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const io = await import('$lib/backup/io');
  const backup = await import('$lib/backup/backup');
  return { store, vault, io, backup };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'cccccccccccc');
});
afterEach(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage; });

/** The round-eighty reading of the tiles, as it stood on r81base, for the comparison. */
function round80Reading(accs: readonly Accession[], taxa: readonly Taxon[]) {
  const out = new Map<string, { name: string; grown: number }>();
  for (const a of accs) {
    if (a.status !== 'growing') continue;
    const slug = speciesSlug(a.taxonName);
    const cur = out.get(slug);
    if (cur) cur.grown++; else out.set(slug, { name: speciesOf(a.taxonName), grown: 1 });
  }
  for (const t of taxa) { const cur = out.get(t.id); if (cur) cur.name = t.name || cur.name; else if (t.followed) out.set(t.id, { name: t.name, grown: 0 }); }
  return out;
}
const canon = (cs: ReadonlyArray<object>) => cs.map((c) => JSON.stringify(c, Object.keys(c).sort())).sort();

describe('a real backup of 300 plants made by the round-eighty app (review W, 2026-10-23)', () => {
  const bytes = new Uint8Array(readFileSync('tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip'));
  it('restored and loaded by this build: every change is the file’s, nothing is renamed, and the two tiles are right', async () => {
    const b = await boot();
    const file = await b.backup.readBackup(bytes);
    expect(file.changes.length).toBe(5486);
    expect(file.manifest.app).toMatch(/^cultifolio 3/);
    await b.store.collection.load();
    const opened = await b.io.openBackup(new File([bytes], 'cultifolio-2026-10-23.cultifolio.zip'));
    await b.io.restoreBackup(opened, 'merge');
    // A new page life: the collection folded afresh from what the vault holds.
    const c = await boot();
    await c.store.collection.load();
    const col = c.store.collection;
    const mine = col.mySpecies;
    const after = await c.vault.allChanges();
    // Nothing lost, nothing added, nothing changed: the log is the file's (rule 6), after the load and the tiles' reading.
    expect(after.length).toBe(file.changes.length);
    expect(canon(after)).toEqual(canon(file.changes));
    // Nothing renamed: every plant keeps the name, the number and the key the file gives it.
    const fileState = new Map<string, Record<string, unknown>>();
    for (const ch of file.changes) if (ch.kind === 'accession') fileState.set(ch.id, { ...(fileState.get(ch.id) ?? {}), [ch.field]: ch.value });
    expect(col.accessions.length).toBe(300);
    for (const a of col.accessions) {
      const f = fileState.get(a.id)!;
      expect([a.taxonName, a.acc, a.taxonKey ?? null, a.cultivar ?? null]).toEqual([f.taxonName, f.acc, f.taxonKey ?? null, f.cultivar ?? null]);
    }
    // The records keep their ids: the tiles are the round-eighty reading's 43, by the same slugs.
    const old = round80Reading(col.accessions, col.taxa);
    expect([...mine.keys()].sort()).toEqual([...old.keys()].sort());
    expect(mine.size).toBe(43);
    // Of the 43, the hybrid's name is the one that changes, and the genus's is the one tile that is a genus.
    const renamed = [...mine.values()].filter((s) => s.name !== old.get(s.slug)!.name).map((s) => [old.get(s.slug)!.name, s.name]);
    expect(renamed).toEqual([['Aloe nobilis', 'Aloe × nobilis']]);
    expect([...mine.values()].filter((s) => s.genus).map((s) => s.slug)).toEqual(['echeveria']);
    expect(mine.get('echeveria')).toMatchObject({ name: 'Echeveria', grown: 1, genus: true });
    // The record itself is as the old build wrote it: read, not rewritten.
    expect(col.taxon('aloe-nobilis')?.name).toBe('Aloe nobilis');
    expect((await c.vault.allChanges()).length).toBe(5486);
  }, 60_000);
});

/**
 * Round eighty-seven, the integration: a carried row in a reader's words, now that a row keeps both builds' words. The data
 * agent's rows read "carried from build of D; that build: X; this build: Y" (`carriedDetail`, src/lib/dossier/rederive.ts),
 * and `unchain` keeps both clauses. `carried` (src/lib/ui/ref/words.ts) read the whole of "X; this build: Y" as the asking
 * build's reason, so a page said "X; this build: skipped (kept from this page's build of D)": the builder's log, with the
 * second build's word inside the first build's reason. Now "X (kept from this page's build of D; not asked again)".
 *
 * On the merge of the five branches (984a2af): every case FAILED (the old words, and the snapshot's
 * row printed raw).
 */
import { describe, it, expect } from 'vitest';
import { carried, readerWords } from '$lib/ui/ref/words';
import { carriedDetail } from '$dossier/rederive';
import { unchain } from '$dossier/schema';

const REDIRECT = 'Wikipedia redirects Aloiampelos ciliaris to Aloe ciliaris, an older name of this species (Aloe ciliaris)';

describe("a carried row's two builds, said apart", () => {
  it("the asking build's words, then where they were kept from and what the later build did", () => {
    const d = carriedDetail({ status: 'ok', at: '2026-10-22T10:00:00Z', detail: REDIRECT }, '2026-11-01', 'skipped');
    expect(d).toBe(`carried from build of 2026-10-22; that build: ${REDIRECT}; this build: skipped`);
    expect(carried(unchain(d)!)).toBe(`${REDIRECT} (kept from this page's build of 2026-10-22; not asked again)`);
    expect(readerWords(unchain(d)!)).toBe(`${REDIRECT} (kept from this page's build of 2026-10-22; not asked again)`);
  });
  it('a refusal and a failure in the same words as a row with no asking words', () => {
    expect(carried(`carried from build of 2026-10-22; that build: ${REDIRECT}; this build: refused`)).toBe(`${REDIRECT} (kept from this page's build of 2026-10-22; asked again, and refused)`);
    expect(carried(`carried from build of 2026-10-22 (rederive); that build: ${REDIRECT}; this build: error`)).toBe(`${REDIRECT} (kept from this page's build of 2026-10-22; asked again, with no answer)`);
    expect(carried('carried from build of 2026-10-22; this build: skipped')).toBe("kept from this page's build of 2026-10-22; not asked again");
    expect(carried(`carried from build of 2026-10-22 (rederive); that build: ${REDIRECT}`)).toBe(`${REDIRECT} (kept from this page's build of 2026-10-22)`);
  });
  it("the range's snapshot, which names itself, read the same", () => {
    const d = 'carried from build of 2026-11-02 as one snapshot; that build: GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21; this build: gbif.occurrences ok, wcvp.distribution skipped';
    expect(carried(d)).toBe("GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21 (kept from this page's build of 2026-11-02; asked again: gbif.occurrences ok, wcvp.distribution skipped)");
  });
  it('no part of the builder\'s log reaches the reader', () => {
    for (const t of [
      `carried from build of 2026-10-22; that build: ${REDIRECT}; this build: skipped`,
      'carried from build of 2026-11-02 as one snapshot; that build: GBIF occurrence download, of 2026-10-21; this build: wcvp.distribution skipped'
    ]) expect(readerWords(t)).not.toMatch(/carried from build of|(that|this) build:/);
  });
});

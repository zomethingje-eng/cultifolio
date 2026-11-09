/**
 * Which kind of name a plant is filed under when its record carries another page's name (`olderOf`; round eighty-seven,
 * the deeper fix of round eighty-six's U3). The add form and an import record it (`olderKind`) when they file the plant,
 * from what they read then:
 *
 * - `gbif`: the name is GBIF's name for that page's own key, where Kew's name heads the page ("GBIF's name for Hoodia
 *   alstonii"): Ceropegia alstonii is Bruyns's 2017 name, newer than the heading, so never "an older name of".
 * - `older`: the name is one of the page's older names, as the reference holds them.
 *
 * A plant filed before the field, or by a version that did not know which, has none. A word this version does not know
 * (a newer version's third kind, a value damaged in a file) is read as none, never as either kind: the record keeps it,
 * since a pulled change's word is never refused (`FIELD_ENUMS`), and the words say only what is known. With no kind
 * known, a tile and the plant's page say "the reference files it under X", as the species page's line does.
 */
export type OlderKind = 'gbif' | 'older';
export const OLDER_KINDS: readonly OlderKind[] = ['gbif', 'older'];

/** The recorded kind, read: one of the two, or null for anything else (absent, null, another word, another type). */
export function olderKindOf(x: unknown): OlderKind | null {
  return x === 'gbif' || x === 'older' ? x : null;
}

/**
 * The kind a plant's record holds for its `olderOf`, read only where it was recorded for that name (round eighty-seven,
 * the review of stage 1, M1). The kind is filed with the page's name it describes (`olderKindOf`): the live code of
 * round eighty-six moves `olderOf` on a rename and knows nothing of the kind, so a kind standing alone could be another
 * page's. One recorded for another name, or with none named (a record of this round's first stage), is not known.
 */
export function recordedKind(a: { olderOf?: string | null; olderKind?: unknown; olderKindOf?: unknown }): OlderKind | null {
  return a.olderOf && typeof a.olderKindOf === 'string' && a.olderKindOf === a.olderOf ? olderKindOf(a.olderKind) : null;
}
/**
 * A plant's fields as filed, with the kind tied to the name it describes: `olderKindOf` set to the `olderOf` the kind is
 * filed with, and a kind with no `olderOf` left out. Every new plant goes through it (`addAccessions`), so the add form,
 * the import and anything later file the pair alike.
 */
export function withKindOf<T extends { olderOf?: string | null; olderKind?: string | null; olderKindOf?: string | null }>(r: T): T {
  if (r.olderKind == null) { if (r.olderKindOf == null) return r; const { olderKindOf: _o, ...rest } = r; return rest as T; }
  if (!r.olderOf) { const { olderKind: _k, olderKindOf: _o, ...rest } = r; return rest as T; }
  return { ...r, olderKindOf: r.olderOf };
}

/**
 * The kind to say: what the reference answers now where it was reached (`looked`: true for GBIF's name, false for an
 * older name, null when not reached or not yet asked), else what the record says was read when the plant was filed, else
 * none. The reference's answer comes first, since a rebuild may have moved the name; the record stands in when the
 * reference cannot be asked, offline or refused, so the words are not lost with the network.
 */
export function kindToSay(recorded: unknown, looked: boolean | null | undefined): OlderKind | null {
  if (looked === true) return 'gbif';
  if (looked === false) return 'older';
  return olderKindOf(recorded);
}

/**
 * A tile's words for a name filed under another page (the front page's "You grow" tiles; the plant's page says the same
 * with a capital): "GBIF's name for X", "an older name of X", or, with no kind known, "the reference files it under X".
 */
export function olderWords(page: string, kind: OlderKind | null): string {
  return kind === 'gbif' ? `GBIF's name for ${page}` : kind === 'older' ? `an older name of ${page}` : `the reference files it under ${page}`;
}

/** The lead words alone, before a page's name drawn as a link: "GBIF's name for", "An older name of", "The reference files it under". */
export function olderLead(kind: OlderKind | null, capital = true): string {
  const w = kind === 'gbif' ? "GBIF's name for" : kind === 'older' ? 'an older name of' : 'the reference files it under';
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

/**
 * The kind an import's check found (`$lib/import/check`): its row said "GBIF's name for" where the index's `gname` is the
 * name, else "An older name of"; the record keeps what the row said.
 */
export function kindOfCheck(check: { s: string; why?: string; gbif?: boolean } | null | undefined): OlderKind | null {
  if (!check || check.s !== 'near' || check.why !== 'older name') return null;
  return check.gbif === true ? 'gbif' : 'older';
}

/**
 * The kind the add form records, from the reference's copy of a page's figures filed under the name (`gbifNamedOr`, as
 * the plant's page reads it): `gbif` where the copy is the named page's, `older` where the group was read and holds no
 * copy, null where it was not reached, the answer is not yet in, or the copy is another page's (which the form did not
 * name, so neither word is known to be true).
 */
export function kindOfCopy(answer: { slug: string; name: string } | null | 'unreached' | undefined, page: { name: string; slug: string }): OlderKind | null {
  if (answer === undefined || answer === 'unreached') return null;
  if (answer === null) return 'older';
  return answer.slug === page.slug || answer.name === page.name ? 'gbif' : null;
}

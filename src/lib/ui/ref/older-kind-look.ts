/**
 * Which kind of name a picker's line named a page for, read while the line is shown (round eighty-seven, the deeper fix
 * of round eighty-six's U3): GBIF's name for that page's key, or one of its older names, by the reference's copy of the
 * page's figures filed under the name, as the plant's page reads it (`gbifNamedOr`). Asked once the line names a page,
 * so the press that files the plant waits for nothing: an answer not in by then, or a group not reached, records no
 * kind, and the plant's page asks for itself.
 *
 * The add form's own code until round eighty-seven's stage-3 integration, which moved it here so the photo walk
 * (plants/walk, C12) records `olderKind` as the add form does; `addAccessions` files `olderKindOf` beside it
 * (`withKindOf`) for both.
 */
import { gbifNamedOr, isUnreached } from '$lib/ui/index.svelte';
import { speciesSlug } from '$core/names';
import { kindOfCopy, type OlderKind } from './older-kind';

export interface OlderKindLooker {
  /** Ask, once for this name and page, which kind of name it is; a second call for the same pair asks nothing. */
  look(name: string, page: string): void;
  /** The kind read for this name and page, or null: not asked, still asking, not reached, or neither kind. */
  kindFor(name: string, page: string): OlderKind | null;
}

export function olderKindLooker(): OlderKindLooker {
  let last: { name: string; page: string; kind: OlderKind | null | 'asking' } | null = null;
  return {
    look(name, page) {
      if (last && last.name === name && last.page === page) return;
      const look: { name: string; page: string; kind: OlderKind | null | 'asking' } = { name, page, kind: 'asking' };
      last = look;
      void gbifNamedOr(name).then(
        (g) => { look.kind = kindOfCopy(isUnreached(g) ? 'unreached' : g, { name: page, slug: speciesSlug(page) }); },
        () => { look.kind = null; }
      );
    },
    kindFor(name, page) {
      return last && last.name === name && last.page === page && last.kind !== 'asking' ? last.kind : null;
    }
  };
}

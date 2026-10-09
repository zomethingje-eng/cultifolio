/**
 * A stranger's label as the plant page shows it (round sixty-two; the grower review's 11, A36). Format characters (a
 * zero-width space, a soft hyphen), line and paragraph separators are taken off the printed name, whatever the code that
 * carried them; and an "sp." name is no species, so a slug a code carries for one (a label printed before round sixty-two
 * gave its genus's) is not followed: "its species has no page in the reference" said of a genus was not true.
 */
import { parseName } from '$core/names';

export function shownLabel(l: { slug: string | null; name: string | null }): { slug: string | null; name: string | null } {
  const name = l.name ? l.name.replace(/[\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim() || null : null;
  const p = name ? parseName(name) : null;
  return { slug: p && (p.qualifier === 'sp.' || p.qualifier === 'spp.') && !p.epithet ? null : l.slug, name };
}

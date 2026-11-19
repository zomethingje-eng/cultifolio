/**
 * Round ninety-eight: the Commons row of a page whose build did not ask Commons. A build asks Commons only while the page
 * shows fewer than twelve photographs of its own sources (`COMMONS_BELOW`, round sixty-nine), and until this round a
 * build that did not ask wrote no Commons row at all: 1,425 pages on 19 November 2026, every one built online in November
 * with twelve or more photographs of its own (rules 2 and 6: the record said neither that Commons was not asked nor why).
 * The build now writes the row (`commonsNotAsked`); `--fill commons-record` writes it, offline, on a page built before,
 * dated to the build that did not ask. A page with no row and fewer than twelve of its own is left as it is and counted:
 * that build's reason is not known, so none is written (rule 3).
 */
import type { Upstream } from './schema';
import { ownShown, commonsNotAsked, COMMONS_BELOW, sharedOf } from './build';
import { kindNamesOf, type HeldNames } from './photo-kind';

type Page = Parameters<typeof kindNamesOf>[0] & { photos?: Parameters<typeof ownShown>[0]; upstream?: Record<string, Upstream>; built?: string };

/** The row to write: null where the page has a Commons row, or where it shows fewer than twelve of its own (`unknown`). */
export function commonsRecordOf(d: Page, held?: HeldNames | null): { row: Upstream } | { unknown: number } | null {
  if (d.upstream?.commons) return null;
  const n = ownShown(d.photos ?? [], kindNamesOf(d, held), sharedOf(d as Parameters<typeof sharedOf>[0]));
  // Dated to the build that did not ask; with no build's time known, its reason is not known either.
  if (n < COMMONS_BELOW || !d.built) return { unknown: n };
  return { row: { status: 'skipped', at: d.built, detail: commonsNotAsked(n) } };
}

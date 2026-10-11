/**
 * Licence classification for records and media pulled from upstream sources.
 *
 * The one rule that matters commercially: a paid product may only BUILD ON or
 * DISPLAY material that is CC0, public domain or CC-BY (and, if `allowShareAlike` is set,
 * CC-BY-SA). Everything else — CC-BY-NC in all its variants, all-rights-
 * reserved, and anything whose terms nobody stated — is "not open".
 *
 * Unknown is not open. A record whose terms nobody stated is not a record
 * whose terms permit everything.
 */

/**
 * `pd` is public domain that is not a CC0 waiver: expired copyright, a government's work, the Public Domain Mark. CC0 is
 * a waiver its author made; calling the 217 Commons files "Public domain" by that name stated a licence they were never
 * given (round sixty-nine; triage-68 K3).
 */
export type LicenceTag = 'cc0' | 'pd' | 'by' | 'by-sa' | 'nc' | 'nd' | 'other';

const NC = /by-nc|by_nc|bync|noncommercial|non-commercial/;
const ND = /by-nd|by_nd|bynd|nc-nd|no-?deriv/;
const CC0 = /publicdomain\/zero|cc0|cc-zero|\bzero\b|public domain dedication/;
const PD = /publicdomain|\bpdm\b|public domain|^pd(?:[\s-]|$)/;
const SA = /by-sa|by_sa|bysa|share[ -]?alike/;
// "Attribution" alone is not CC BY: Commons' {{Attribution}}, "Copyrighted, attribution-only" and "Data licence Germany
// – attribution" are other licences that say the word. Only Creative Commons' own name for it is read (round sixty-nine;
// triage-68 K3). GBIF downloads write CC_BY_4_0.
const BY = /\/by\/|\bcc-by\b|\bcc_by(?:\b|_)|\bccby\b|^by$|^cc by\b|creative ?commons attribution/;

/** Normalise any licence string GBIF, iNaturalist, Commons or a user might hand us. */
export function licenceTag(raw: unknown): LicenceTag | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (NC.test(s)) return 'nc';
  if (ND.test(s)) return 'nd';
  if (CC0.test(s)) return 'cc0';
  if (PD.test(s)) return 'pd';
  if (SA.test(s)) return 'by-sa';
  if (BY.test(s)) return 'by';
  return 'other';
}

export interface OpenPolicy {
  /** Accept CC-BY-SA. Cropped thumbnails are derivatives, so accepting SA means
   *  those thumbnails are themselves CC-BY-SA; the page labels them as such. */
  allowShareAlike: boolean;
}

export const DEFAULT_POLICY: OpenPolicy = { allowShareAlike: true };

export type OpenTag = 'cc0' | 'pd' | 'by' | 'by-sa';
export function isOpen(tag: LicenceTag | null | undefined, policy: OpenPolicy = DEFAULT_POLICY): tag is OpenTag {
  if (tag === 'cc0' || tag === 'pd' || tag === 'by') return true;
  if (tag === 'by-sa') return policy.allowShareAlike;
  return false;
}

/** Human label for display beside an image or a record. */
export function licenceLabel(tag: LicenceTag | null | undefined): string {
  switch (tag) {
    case 'cc0':
      return 'CC0';
    case 'pd':
      return 'Public domain';
    case 'by':
      return 'CC BY';
    case 'by-sa':
      return 'CC BY-SA';
    case 'nc':
      return 'CC BY-NC';
    case 'nd':
      return 'CC BY-ND';
    case 'other':
      return 'restricted';
    default:
      return 'licence not stated';
  }
}

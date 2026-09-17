/**
 * Licence classification for records and media pulled from upstream sources.
 *
 * The one rule that matters commercially: a paid product may only BUILD ON or
 * DISPLAY material that is CC0 or CC-BY (and, if `allowShareAlike` is set,
 * CC-BY-SA). Everything else — CC-BY-NC in all its variants, all-rights-
 * reserved, and anything whose terms nobody stated — is "not open".
 *
 * Unknown is not open. A record whose terms nobody stated is not a record
 * whose terms permit everything.
 */

export type LicenceTag = 'cc0' | 'by' | 'by-sa' | 'nc' | 'nd' | 'other';

const NC = /by-nc|by_nc|bync|noncommercial|non-commercial/;
const ND = /by-nd|by_nd|bynd|nc-nd|no-?deriv/;
const CC0 = /publicdomain|cc0|cc-zero|\bzero\b|pdm|public domain/;
const SA = /by-sa|by_sa|bysa|sharealike|share-alike/;
const BY = /\/by\/|\bcc-by\b|\bcc_by(?:\b|_)|\bccby\b|^by$|^cc by\b|attribution/; // GBIF downloads write CC_BY_4_0

/** Normalise any licence string GBIF, iNaturalist, Commons or a user might hand us. */
export function licenceTag(raw: unknown): LicenceTag | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (NC.test(s)) return 'nc';
  if (ND.test(s)) return 'nd';
  if (CC0.test(s)) return 'cc0';
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

export function isOpen(tag: LicenceTag | null | undefined, policy: OpenPolicy = DEFAULT_POLICY): boolean {
  if (tag === 'cc0' || tag === 'by') return true;
  if (tag === 'by-sa') return policy.allowShareAlike;
  return false;
}

/** Human label for display beside an image or a record. */
export function licenceLabel(tag: LicenceTag | null | undefined): string {
  switch (tag) {
    case 'cc0':
      return 'CC0';
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

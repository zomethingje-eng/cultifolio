/**
 * A label's code that helps whoever scans it (round sixty; the product review's 8). The address is still the plant's own
 * page by its identity, as every code printed before carries, so old labels keep working; the species and the name
 * printed on the label ride in the fragment (#s=copiapoa-cinerea&n=Copiapoa%20cinerea), which a browser never sends to a
 * server. On a device without that plant the page says the label is from someone's collection and links the species
 * page. Both are printed on the label anyway, so the fragment tells nobody anything the label does not.
 */
import { kindOf, type Accession } from '$lib/db/types';
import { speciesSlug } from '$core/names';

/** The name in the fragment is cut here: a longer code needs more modules, and a small label prints them too fine to scan. */
export const QR_NAME_MAX = 60;

export function plantQrUrl(origin: string, a: Pick<Accession, 'id' | 'taxonName' | 'cultivar' | 'nameKind'>): string {
  const base = `${origin}/plants/${a.id}`;
  // A cross is filed under its genus, which has no species page: its name only, then.
  const slug = kindOf(a) === 'hybrid' ? '' : speciesSlug(a.taxonName);
  const name = `${a.taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`.replace(/\s+/g, ' ').trim().slice(0, QR_NAME_MAX);
  const parts = [slug ? `s=${slug}` : '', name ? `n=${encodeURIComponent(name)}` : ''].filter(Boolean);
  return parts.length ? `${base}#${parts.join('&')}` : base;
}

/** What a scanned label's address carries: the species slug (only a slug's own characters) and the printed name, as plain text. */
export function labelFromHash(hash: string): { slug: string | null; name: string | null } {
  const h = hash.replace(/^#/, '');
  let slug: string | null = null;
  let name: string | null = null;
  for (const part of h.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === 's' && /^[a-z0-9-]{2,120}$/.test(v)) slug = v;
    else if (k === 'n') {
      let t: string;
      try { t = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { continue; }
      // Shown as text, never markup; control characters and a runaway length are taken off.
      t = t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, QR_NAME_MAX);
      if (t) name = t;
    }
  }
  return { slug, name };
}

/** The species slug alone, or null. */
export const speciesFromHash = (hash: string): string | null => labelFromHash(hash).slug;

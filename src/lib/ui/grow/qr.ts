/**
 * A label's code that helps whoever scans it (round sixty; the product review's 8). The address is still the plant's own
 * page by its identity, as every code printed before carries, so old labels keep working; the species and the name
 * printed on the label ride in the fragment (#s=copiapoa-cinerea&n=Copiapoa%20cinerea), which a browser never sends to a
 * server. On a device without that plant the page says the label is from someone's collection and links the species
 * page. Both are printed on the label anyway, so the fragment tells nobody anything the label does not.
 */
import { kindOf, accNo, type Accession } from '$lib/db/types';
import { parseName, speciesSlug, isNamedHybrid } from '$core/names';
import { crossName } from '$lib/ui/plant-label';
import { idTag } from '$core/tag';

/** The name in the fragment is cut here: a longer code needs more modules, and a small label prints them too fine to scan. */
export const QR_NAME_MAX = 60;

/**
 * Cut to at most `n` code points, by whole graphemes (round sixty-two; A36): never inside a code point (round sixty-one;
 * the records review, 3 and 15: half an emoji is refused by `encodeURIComponent`), and never inside a letter with its
 * marks or a joined emoji, which was cut mid-cluster.
 */
function cut(s: string, n: number): string {
  if (Array.from(s).length <= n) return s;
  let out = '', len = 0;
  const parts = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
  for (const g of parts) {
    const k = Array.from(g).length;
    if (len + k > n) break;
    out += g;
    len += k;
  }
  return out;
}
/**
 * What is taken off a name before it is put in a code or shown from one: C0 and C1 controls, and every format character
 * (\p{Cf}: the bidirectional marks, embeddings, overrides and isolates, zero-width spaces and joiners, the soft hyphen,
 * the byte order mark, tag characters), with which a forged code could show reversed, disguised or hidden text as the
 * label's name, and the line and paragraph separators (round sixty-one; the records review, 15; round sixty-two, A36).
 * A zero-width joiner inside an emoji is part of it, and kept. A format character is removed, not made a space: a soft
 * hyphen or a zero-width space pasted inside "Gymnocalycium" printed "Gymno calycium" (round sixty-two; triage-outside 6,
 * A36, the verification grower review's 8); a control or a line separator stands between words, so it is a space.
 */
const INVISIBLE = /(?!\u200d(?=\p{Extended_Pictographic}))\p{Cf}/gu;
const BREAKS = /[\u0000-\u001f\u007f-\u009f\p{Zl}\p{Zp}]/gu;
/** A lone surrogate (a backup's JSON can carry one) cannot be put in an address: it is replaced, so the code is never lost. */
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** A name made safe: no lone surrogate, nothing invisible, at most two marks on a letter (a run of more is a stack drawn over the label), spaces closed up, cut. */
const safeName = (s: string) => cut(s.replace(LONE, '\ufffd').normalize('NFC').replace(INVISIBLE, '').replace(BREAKS, ' ').replace(/(\p{M}{2})\p{M}+/gu, '$1').replace(/\s+/g, ' ').trim(), QR_NAME_MAX);

/**
 * The code carries the plant's number, the one printed beside it (round eighty-seven, t3; plan F10): `/plants/2026-0012`.
 * The plant page finds a plant by its number as by its identity, on the device and with no network (the collection is
 * there, and the page is in the service worker's shell), and the number is what the label says, so the code still means
 * something read by any scanner. A code printed before carries the identity, and the page finds the plant by it as
 * before. `bare` leaves the species and name off (a tape label's code, kept small enough to scan at 9 mm).
 *
 * A number can name two plants over a label's life (two devices gave it out offline and "Renumber now" moved one; a plant
 * restored to a number taken while it was away; a plant traded in with another collection's label), so every code, a
 * tape's too, carries the plant's identity tag (`idTag`) first in its fragment, `#i=k3x9q2`, and the page opens the plant
 * holding the number only when the tag is that plant's; otherwise it says so and offers the plant whose tag it is, when
 * this device holds it (round eighty-seven, the stage 3 fixes; review B1).
 */
export function plantQrUrl(origin: string, a: Pick<Accession, 'id' | 'acc' | 'taxonName' | 'cultivar' | 'nameKind'> & { parentage?: string | null }, bare = false): string {
  const base = `${origin}/plants/${encodeURIComponent(accNo(a))}`;
  const tag = `i=${idTag(a.id)}`;
  if (bare) return `${base}#${tag}`;
  // The name as it reads, without the invisible characters a paste brings: the slug of "Gymno\u00adcalycium" was
  // "gymno-calycium" (round sixty-two; the verification grower review, 8).
  const taxonName = a.taxonName.replace(INVISIBLE, '');
  // A cross is filed under its genus, which has no species page: its name only, then; and so is an "sp." plant, which
  // names no species (round sixty-two; the records review, 13).
  // A named nothospecies (Mentha × piperita) names its species as a species does: the reference may hold it (round eighty-one, H).
  const slug = (kindOf(a) === 'hybrid' && !isNamedHybrid(taxonName)) || !parseName(taxonName).epithet ? '' : speciesSlug(taxonName);
  // A cross is named by its parents when they are known, as its label and the plants list name it: the code carried
  // only "Astrophytum" for every Astrophytum cross (round sixty-two; triage-self N10, the self-review's grower 11).
  const sci = crossName({ ...a, taxonName }) ?? taxonName;
  const name = safeName(`${sci}${a.cultivar ? ` '${a.cultivar}'` : ''}`);
  const parts = [tag, slug ? `s=${slug}` : '', name ? `n=${encodeURIComponent(name)}` : ''].filter(Boolean);
  return `${base}#${parts.join('&')}`;
}

// The identity tag lives in $core/tag (the collection reads it, and the layout must not load this module; check-bundle).
export { ID_TAG_LEN, idTag, tagIs } from '$core/tag';

/** What a scanned label's address carries: the species slug (only a slug's own characters), the printed name as plain text, and the plant's identity tag (`idTag`; base-36, 4 to 12 characters). */
export function labelFromHash(hash: string): { slug: string | null; name: string | null; tag: string | null } {
  const h = hash.replace(/^#/, '');
  let slug: string | null = null;
  let name: string | null = null;
  let tag: string | null = null;
  for (const part of h.split('&')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === 's' && /^[a-z0-9-]{2,120}$/.test(v)) slug = v;
    else if (k === 'i' && /^[0-9a-z]{4,12}$/.test(v)) tag = v;
    else if (k === 'n') {
      let t: string;
      try { t = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { continue; }
      // Shown as text, never markup; control and direction characters and a runaway length are taken off.
      t = safeName(t);
      if (t) name = t;
    }
  }
  return { slug, name, tag };
}

/** The species slug alone, or null. */
export const speciesFromHash = (hash: string): string | null => labelFromHash(hash).slug;

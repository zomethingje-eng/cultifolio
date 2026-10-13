/**
 * A Wikimedia Commons file's licence and author, read strictly (round sixty-nine; triage-68 K2 and K3). Used where a
 * new answer is read (`sources/commons.ts`) and where a stored dossier or the index is read, so the corpus is corrected
 * by the deploy and `--index` with no request. Nothing here imports a source, so the Worker's read needs none.
 */
import type { OpenTag } from '$core/licence';

/**
 * Commons' short licence names this site reads, and nothing else: `CC0`, `CC BY n`, `CC BY-SA n` (with a version list or
 * a country, "CC BY-SA 3.0 de"), `Public domain` and `PD-…`. "Attribution" is Commons' {{Attribution}} licence, not
 * CC BY, and the generic reading took it for one (S-B7, IND-3); public domain is not a CC0 waiver (S-B5).
 */
export function commonsLicence(short: string | null | undefined): OpenTag | null {
  const s = (short ?? '').trim();
  if (/^CC0(?: 1\.0)?$/i.test(s)) return 'cc0';
  if (/^(?:Public domain|PD-\S.*)$/i.test(s)) return 'pd';
  const m = /^CC[ -]BY(-SA)?[ -]\d(?:\.\d)?(?:, ?\d(?:\.\d)?)*(?: [a-z]{2,3}(?:-[a-z]+)?)?$/i.exec(s);
  return m ? (m[1] ? 'by-sa' : 'by') : null;
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026' };
/** HTML entities as the characters they stand for: Commons' `Artist` is HTML, and a page escapes text, so "Forest &amp;amp; Kim Starr" was shown as written (S-B4). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? all;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

/**
 * Lines that are not an author: Commons' source field ("Own work"), a pointer ("See above"), "Unknown author" (twice
 * over, as two templates write it), a bare "(talk)" link, an address, an upload's history, and a derivative work's
 * maker alone, whose line leaves the original's author unsaid (Commiphora myrrha; R46-2). Under CC BY or CC BY-SA a
 * photograph with no author is not published (rule 4).
 */
const NOT_AUTHOR = /^(?:own work\b.*|see (?:above|below)|unknown\b.*|author unknown|anonymous|not stated|author not stated|n\/?a|none|\(talk\)|derivative work\b.*|transferred from\b.*|(?:https?:\/\/|www\.)\S*)?$/i;

/**
 * What a credit line carries around its author, cleaned from it keeping the person (round seventy; REVIEW-TRIAGE-69 C3,
 * S-C8): a wiki signature's talk link and time ("Guérin Nicolas (messages) 19:48, 25 September 2008 (UTC)"), "Uploaded
 * by …" ("Dwight Sipler [2]Uploaded by uleli"), a footnote mark ("Marco Schmidt [1]") and an e-mail address, which is
 * not published ("manfred.sause@volloeko.de" alone leaves no author).
 */
const TALK = /\s*\(\s*(?:talk|messages?|discussion|disc\.?|diskussion|discussione|discusión|discussão|overleg|dyskusja|обсуждение)(?:[\s·•|,][^)]*)?\)/gi;
const SIGNED = /\s*\d{1,2}:\d{2},?\s+\d{1,2}\.?\s+[\p{L}]+\.?\s+\d{4}(?:\s*\((?:UTC|CES?T|MES?Z)\))?/giu;
const UPLOADED = /\s*\(?\s*uploaded by\b.*$/i;
const FOOTNOTE = /\s*\[\d+\]/g;
const MAIL = /\s*[<(]?\s*(?:mailto:)?[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*[>)]?/g;
/** A template's words left unfilled: "(MiNombre" is Commons' {{Information}} example "MyName" in Spanish, and names no one (Agave cocui; S-C8). */
const UNFILLED = /^\(?\s*(?:my ?name|mi ?nombre|tu ?nombre|your ?(?:real |user ?)?name|user ?name|nom ?d?'?utilisateur|mon ?nom|dein ?name|ihr ?name|mein ?name|il ?(?:tuo|mio) ?nome|seu ?nome|meu ?nome|\{\{\{[^}]*\}\}\})\s*\)?$/i;

/**
 * The author a Commons `Artist` field names, or null: `<sup>` and `<small>` (where Commons puts a signature's talk link
 * and time, and "Uploaded by") dropped, the other tags stripped (a line break kept as one, any other tag read as a space, so a talk
 * link is not run into the name), entities decoded, the first line, whitespace made single. "No machine-readable author
 * provided. X assumed (based on copyright claims)." is Commons' way of naming X, "This photo has been taken by X and
 * released under…", "Taken by X." and "Photograph by: X" name X (S-B4, R46-2; R47-10), and "The original uploader was X at French Wikipedia." names
 * X (S-C8). The same rule reads a stored credit, which keeps the text with its tags already stripped.
 */
export function commonsAuthor(raw: string | null | undefined): string | null {
  const html = String(raw ?? '').replace(/<(sup|small)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const text = decodeEntities(html.replace(/<br\s*\/?>|<\/(?:p|div|li|tr)>/gi, '\n').replace(/<[^>]+>/g, ' '));
  let s = text.split(/\r?\n/).map((x) => x.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+([),.;])/g, '$1').trim()).find(Boolean) ?? '';
  const assumed = /^No machine-readable author provided\.\s*(.+?)\s+assumed\b/i.exec(s);
  if (assumed) s = assumed[1];
  else if (/^No machine-readable author/i.test(s)) return null;
  const taken = /^this (?:photo(?:graph)?|image|picture|file)(?: was| has been| is)? (?:taken|made|created) by (.+?)(?: and (?:released|licensed|published)\b.*|\.)?$/i.exec(s) ?? /^(?:(?:photo(?:graph)?|picture|image)(?: taken)?|taken) by:?\s+(.+?)\.?$/i.exec(s);
  if (taken) s = taken[1];
  const uploader = /^(?:the )?original uploader was (.+?) at (?:the )?\S*(?: \S+)? ?wiki(?:pedia|media|books|source)?\b.*$/i.exec(s);
  if (uploader) s = uploader[1];
  s = s.replace(UPLOADED, '').replace(SIGNED, '').replace(TALK, '').replace(FOOTNOTE, '').replace(MAIL, ' ').replace(/\s+/g, ' ').replace(/[\s,;]+$/, '').trim();
  s = s.replace(/\s*\(talk\)$/i, '').trim();
  if (UNFILLED.test(s)) return null;
  return NOT_AUTHOR.test(s) ? null : s;
}

const VIA = /,\s*via Wikimedia Commons$/;
/**
 * A stored Commons credit, `<author>, <short licence>, via Wikimedia Commons`, in its parts: the licence is the
 * rightmost part that reads strictly (a version list such as "CC BY-SA 2.5,2.0,1.0" holds commas). Null when the line
 * is in no such form.
 */
export function splitCommonsCredit(attribution: string): { author: string; short: string } | null {
  const m = VIA.exec(attribution);
  if (!m) return null;
  const head = attribution.slice(0, m.index);
  for (let i = head.lastIndexOf(','); i > 0; i = head.lastIndexOf(',', i - 1)) {
    const short = head.slice(i + 1).trim();
    if (commonsLicence(short)) return { author: head.slice(0, i), short };
  }
  return null;
}

/** The credit line the build writes for a Commons file. */
export const commonsCredit = (author: string | null, short: string): string => `${author ?? 'author not stated'}, ${short}, via Wikimedia Commons`;

type Stored = { licence?: string; attribution: string };
/**
 * A stored Commons photograph as the rules now read it, or null when it is not published: its licence re-read from the
 * short name its credit keeps (so a file tagged `cc0` whose credit says "Public domain" is `pd`, and one Commons
 * licenses "Attribution" is dropped), and its author cleaned as a new answer's is (a file with none under CC BY or
 * CC BY-SA is dropped). Applied in `safeUrls` and in the index (round sixty-nine; triage-68 K2, K3).
 */
export function readCommonsPhoto<P extends Stored>(p: P): P | null {
  const parts = splitCommonsCredit(p.attribution);
  if (!parts) return null;
  const tag = commonsLicence(parts.short)!;
  const raw = parts.author.trim();
  const author = raw === 'author not stated' ? null : commonsAuthor(raw);
  if (!author && tag !== 'cc0' && tag !== 'pd') return null;
  return { ...p, licence: tag as P['licence'], attribution: commonsCredit(author, parts.short) };
}

/**
 * Whether `--prune-uncredited` removes a stored photograph: under CC BY or CC BY-SA, with the build's fallback words for
 * an author ("unknown", "author not stated" and the like), or a Commons file whose author is not one by the rule above
 * ("Own work", "See above", "Unknown author", a bare "(talk)", an address, an e-mail address alone, an unfilled template
 * such as "(MiNombre"). One predicate for the prune and the read, so the corpus and the pages agree (round sixty-nine;
 * triage-68 K2; round seventy, REVIEW-TRIAGE-69 C3).
 */
export function uncreditedPhoto(p: { src?: string; licence: string; attribution: string }): boolean {
  if (p.licence === 'cc0' || p.licence === 'pd') return false;
  if (/^(unknown|Wikimedia Commons|iNaturalist user|no author stated|author not stated),/.test(p.attribution)) return true;
  if (p.src !== 'commons' && !VIA.test(p.attribution)) return false;
  const parts = splitCommonsCredit(p.attribution);
  if (!parts) return false; // a line in no form the build writes is left to the read, which drops it
  const tag = commonsLicence(parts.short);
  return tag !== 'cc0' && tag !== 'pd' && !commonsAuthor(parts.author.trim());
}

import type { JsonFetcher, SourceResult } from '../fetch';
import { titleProof, redirected, notChecked, notOurs, titled, proofByName, titleKey, type Who, type Facts, type Proof } from '../summary-proof';
import { upToSentence, sentenceCut } from '../../core/text';
/** The longest summary kept, in characters, cut at a sentence's end (`upToSentence`; the page quotes four sentences of it). */
export const SUMMARY_MAX = 1500;

/* ---------- Wikipedia (CC BY-SA): the lead paragraph, kept segregated ---------- */

export { redirected };

/**
 * The opening paragraph of English Wikipedia's articles, read by the MediaWiki action API (round eighty-six; outside review
 * B's 5 and the plan's B7): TextExtracts' plain-text lead (`prop=extracts&exintro&explaintext`), whose first paragraph is
 * quoted as the article writes it, and the article's current revision id read in the same request (`prop=revisions`,
 * `rvprop=ids`), so the revision the page links is the one the words were read at. Until round eighty-six the summary was
 * Wikipedia's REST summary (`rest_v1/page/summary`), which leaves out words in brackets: 33 of the 36 summaries round
 * eighty-five's revision fill found "changed" differed from the stored text only by brackets the REST text had left out.
 * Up to twenty titles a request (`LEAD_TITLES`, TextExtracts' limit for a lead), redirects followed as before, a
 * disambiguation page said as one.
 */
export const LEAD_TITLES = 20;
export const leadsUrl = (titles: readonly string[]) => `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts|revisions|pageprops&exintro=1&explaintext=1&exlimit=${LEAD_TITLES}&rvprop=ids&ppprop=disambiguation&redirects=1&titles=${titles.map((t) => encodeURIComponent(t)).join('|')}`;
/** What the action API answers for a request of leads (formatversion 2). */
export type LeadsAnswer = {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string; tofragment?: string }>;
    pages?: Array<{ title: string; missing?: boolean; invalid?: boolean; extract?: string; pageprops?: { disambiguation?: string }; revisions?: Array<{ revid?: number }>; lastrevid?: number }>;
  };
  continue?: unknown;
  error?: { code?: string; info?: string };
};
/** One title's lead as read: the article it reached, its opening paragraph as plain text, and the revision read with it. */
export type Lead = { status: 'ok'; title: string; text: string; revision?: number; disambiguation?: boolean } | { status: 'none' };

/**
 * The opening paragraph as TextExtracts gives it in plain text: the lead's first paragraph with text, word for word, its
 * brackets kept. TextExtracts takes a pronunciation out of the text and leaves its bracket behind ("Aloe vera () is …",
 * "The papaya (US: ) is …"): such a bracket, left with no words, is closed up, and a label left with nothing after it is
 * taken out of a bracket that keeps words ("The tomato (US: , UK: ; Solanum lycopersicum)" is "The tomato (Solanum
 * lycopersicum)"); nothing else is changed.
 */
export function openingParagraph(lead: string): string {
  const para = lead.split('\n').map((p) => p.trim()).find((p) => p.length > 0) ?? '';
  // A bracket left with nothing but labels and separators once its pronunciation was taken out ("(US: )", "(; Greek)").
  const emptied = (inner: string) => /^\s*listen\s*$/i.test(inner) || inner.replace(/\b(?:[A-Z][A-Za-z]{0,11}|listen|pronounced)\s*:/g, '').replace(/[\s,;:]/g, '') === '';
  // A label whose pronunciation was taken out, with only a separator or the bracket's end after it ("US: ,", "UK: ;").
  const bare = (inner: string) => inner.replace(/(?:^|(?<=[,;]))\s*\b(?:[A-Z][A-Za-z]{0,11}|listen|pronounced)\s*:\s*(?=[,;]|$)[,;]?/g, '');
  return para
    .replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (emptied(inner) ? '' : bare(inner) === inner ? m : `${m.slice(0, m.indexOf('('))}(${bare(inner).trim()})`))
    .replace(/\(\s*[;,]\s*/g, '(')
    .replace(/\s*[;,]\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A MediaWiki error in an HTTP 200 (a lag, a bad parameter). */
const mwError = (d: unknown) => {
  const e = (d as { error?: { code?: string; info?: string } } | null)?.error;
  return e ? `${e.code ?? 'error'}: ${e.info ?? ''}`.trim() : null;
};

/**
 * Each asked title's lead from one answer of `leadsUrl`, by the title as asked. A title the answer cut short (TextExtracts'
 * `continue`) or did not name is not in the map: it was not answered, and is asked again (rule 2).
 */
export function leadsOf(titles: readonly string[], data: LeadsAnswer): Map<string, Lead> {
  const out = new Map<string, Lead>();
  const q = data.query;
  if (!q || !Array.isArray(q.pages)) return out;
  const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
  const redir = new Map((q.redirects ?? []).map((n) => [n.from, n.to]));
  const pages = new Map(q.pages.map((p) => [p.title, p]));
  const cut = data.continue != null;
  for (const t of titles) {
    const n = norm.get(t) ?? t;
    const to = redir.get(n) ?? n;
    const p = pages.get(to);
    if (!p || p.invalid) continue;
    if (p.missing) { out.set(t, { status: 'none' }); continue; }
    if (p.extract == null && cut) continue;
    const revision = p.revisions?.[0]?.revid ?? p.lastrevid;
    out.set(t, { status: 'ok', title: p.title, text: openingParagraph(p.extract ?? ''), ...(Number.isSafeInteger(revision) && revision! > 0 ? { revision } : {}), ...(p.pageprops?.disambiguation != null ? { disambiguation: true } : {}) });
  }
  return out;
}

/**
 * The leads of up to `LEAD_TITLES` titles, one request (`--fill summary-leads` reads every stored summary so). A request
 * that does not answer is that answer for every title in it; a title the answer leaves out is not in the map.
 */
export async function readLeads(f: JsonFetcher, titles: readonly string[]): Promise<{ status: 'ok'; data: Map<string, Lead> } | Exclude<SourceResult<never>, { status: 'ok' | 'none' }>> {
  const r = await f<LeadsAnswer>(leadsUrl(titles));
  if (r.status === 'none') return { status: 'error', detail: 'en.wikipedia.org gave no answer' };
  if (r.status !== 'ok') return r;
  const err = mwError(r.data);
  if (err) return { status: 'error', detail: `wikipedia ${err}` };
  if (!Array.isArray(r.data.query?.pages)) return { status: 'error', detail: 'wikipedia: no pages in the answer' };
  return { status: 'ok', data: leadsOf(titles, r.data) };
}

/** A title's article address. */
export const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')')}`;

/**
 * The lead of the English Wikipedia article. `accept` names the titles asked for: the Wikidata item's own sitelink, the
 * species' name and its older names. Wikipedia follows a redirect without saying so, and with no sitelink the name was
 * asked: Weingartia pulchra's redirect gave Weingartia canigueralii's article, another species with its own page here,
 * and Kopsia fruticosa's gave the genus's (round sixty-nine; triage-68 M3, R46-12).
 *
 * A final title other than the one asked is this species' article only on a positive proof (`titleProof`, round seventy;
 * REVIEW-TRIAGE-69 A1): the name or an older name, as the title or as its Wikidata item's taxon; the English article of
 * this species' Wikidata item; a product of this species ("Apple"); or a genus in which Kew holds this species alone
 * ("Welwitschia"). The lead's text proves nothing (S-A1 to A3, IND-2). `pre` carries Wikidata facts the caller has
 * already asked for (the fill asks for the species' items fifty at a time). The record names the proof (S-A6): "Wikipedia
 * redirects X to Y, the English article of this species' Wikidata item (Q…)". With no proof the answer is "none: Wikipedia
 * redirects X to Y"; a source that did not answer while the proof was read leaves it not checked, said so (rule 2).
 * `--fill summaries` reads the same rule on the same answers (S-A5). Since round eighty-six the text is the article's
 * opening paragraph and the revision is read with it (`readLeads`), and the summary says so (`from: 'lead'`).
 */
export async function summary(f: JsonFetcher, title: string, accept?: readonly string[], who?: Who, pre?: Facts): Promise<SourceResult<{ text: string; url: string; title: string; proof?: Proof; cut?: true; revision?: number; from: 'lead' }>> {
  const asked = title.replace(/_/g, ' ');
  const rr = await readLeads(f, [asked]);
  if (rr.status !== 'ok') return rr;
  const lead = rr.data.get(asked);
  if (!lead) return { status: 'error', detail: `wikipedia: no answer for ${asked}` };
  if (lead.status === 'none' || !lead.text || lead.disambiguation) return { status: 'none' };
  const got = lead.title;
  let detail: string | undefined;
  let proof: Proof | undefined;
  // Under another title, or under the title asked when that is not this species' name or an older name, a proof is
  // needed: the item's sitelink or a title carried from the last build (round seventy A2, R47-4: "Drosera tomentosa" for
  // Drosera montana). Round seventy-one: a common name or a genus asked as the title is proved too (the item proof, for a
  // sitelink), so a title carried while Wikidata did not answer is never taken unread, and the record names the proof.
  const moved = titleKey(got) !== titleKey(asked);
  if (accept && (moved || (who && !proofByName(got, who)))) {
    if (who) {
      const v = await titleProof(f, got, who, pre);
      if (v.status === 'none') return { status: 'none', detail: moved ? redirected(asked, got) : notOurs(got) };
      if (v.status !== 'ok') return { status: v.status, detail: notChecked(asked, got, v) };
      detail = `${titled(asked, got)}, ${v.words}`;
      proof = v.proof;
    } else if (!accept.some((a) => titleKey(a) === titleKey(got))) return { status: 'none', detail: redirected(asked, got) };
  }
  // A lead that does not end a sentence is cut where Wikipedia's extract stopped, and marked so (`sentenceCut`; round eighty-four, A4).
  const kept = sentenceCut(upToSentence(lead.text, SUMMARY_MAX));
  return { status: 'ok', ...(detail ? { detail } : {}), data: { text: kept.text, ...(lead.text.trim().length > SUMMARY_MAX || kept.cut ? { cut: true as const } : {}), url: articleUrl(got), title: got, ...(proof ? { proof } : {}), ...(lead.revision ? { revision: lead.revision } : {}), from: 'lead' as const } };
}

/**
 * Whether a stored summary's title is one this species may quote: its name, or one of its older names (the binomial of
 * each of GBIF's synonyms as stored, author left off), or a title the caller has confirmed as the item's sitelink.
 * `--fill summaries` reads it offline (round sixty-nine; triage-68 M3).
 */
export function summaryTitleFits(title: string, name: string, synonyms: readonly string[], sitelink?: string): boolean {
  const t = titleKey(title);
  if (t === titleKey(name) || (sitelink && t === titleKey(sitelink))) return true;
  return synonyms.some((s) => {
    const w = s.replace(/×\s*/g, '').split(/\s+/);
    // A subspecies or variety is not a species' name: its first two words are another species' (Rebutia canigueralii subsp. pulchra).
    if (/^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/.test(w[2] ?? '')) return false;
    return titleKey(w.slice(0, 2).join(' ')) === t;
  });
}

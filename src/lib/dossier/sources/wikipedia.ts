import type { JsonFetcher, SourceResult } from '../fetch';
import { titleProof, redirected, notChecked, notOurs, titled, proofByName, titleKey, type Who, type Facts, type Proof } from '../summary-proof';
import { upToSentence, sentenceCut } from '../../core/text';
/** The longest summary kept, in characters, cut at a sentence's end (`upToSentence`; the page quotes four sentences of it). */
export const SUMMARY_MAX = 1500;

/* ---------- Wikipedia (CC BY-SA): the lead paragraph, kept segregated ---------- */

export { redirected };

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
 * `--fill summaries` reads the same rule on the same answers (S-A5).
 */
export async function summary(f: JsonFetcher, title: string, accept?: readonly string[], who?: Who, pre?: Facts): Promise<SourceResult<{ text: string; url: string; title: string; proof?: Proof; cut?: true }>> {
  const r = await f<{ extract?: string; content_urls?: { desktop?: { page?: string } }; title?: string; type?: string }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  if (r.status !== 'ok') return r;
  if (r.data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return { status: 'none' };
  if (typeof r.data.type === 'string' && /error/i.test(r.data.type)) return { status: 'error', detail: `wikipedia ${r.data.type}` };
  if (!r.data.extract || r.data.type === 'disambiguation') return { status: 'none' };
  const got = (r.data.title ?? title).replace(/_/g, ' ');
  let detail: string | undefined;
  let proof: Proof | undefined;
  // Under another title, or under the title asked when that is not this species' name or an older name, a proof is
  // needed: the item's sitelink or a title carried from the last build (round seventy A2, R47-4: "Drosera tomentosa" for
  // Drosera montana). Round seventy-one: a common name or a genus asked as the title is proved too (the item proof, for a
  // sitelink), so a title carried while Wikidata did not answer is never taken unread, and the record names the proof.
  const moved = titleKey(got) !== titleKey(title.replace(/_/g, ' '));
  if (accept && (moved || (who && !proofByName(got, who)))) {
    if (who) {
      const v = await titleProof(f, got, who, pre);
      if (v.status === 'none') return { status: 'none', detail: moved ? redirected(title, got) : notOurs(got) };
      if (v.status !== 'ok') return { status: v.status, detail: notChecked(title, got, v) };
      detail = `${titled(title, got)}, ${v.words}`;
      proof = v.proof;
    } else if (!accept.some((a) => titleKey(a) === titleKey(got))) return { status: 'none', detail: redirected(title, got) };
  }
  // A lead that does not end a sentence is cut where Wikipedia's extract stopped, and marked so (`sentenceCut`; round eighty-four, A4).
  const kept = sentenceCut(upToSentence(r.data.extract, SUMMARY_MAX));
  return { status: 'ok', ...(detail ? { detail } : {}), data: { text: kept.text, ...(r.data.extract.trim().length > SUMMARY_MAX || kept.cut ? { cut: true as const } : {}), url: r.data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, title: got, ...(proof ? { proof } : {}) } };
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

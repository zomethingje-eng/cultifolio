/**
 * `--fill summaries` (round sixty-nine; triage-68 M3), moved out of `corpus-fills.ts` before round seventy so that its
 * rule has one owner.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import type { DossierStore } from './corpus-run';
import { summary as wikiSummary, summaryTitleFits } from './sources/wikipedia';
import { mwWait } from './sources/wikimedia';
import { redirected, proofByName, speciesItems, titleKey, binomialNotOurs, notChecked, type Proof, type Who, type SpeciesItem, type Unanswered } from './summary-proof';

/**
 * The waits before what a source did not answer is asked again in a corpus run; a test makes them instant. Round
 * seventy-one: ten minutes, half an hour, then seventy minutes, so the last round falls past the hour in which the
 * fetch layer cools a host again on its first 429 after a cooldown (`fetch.ts`, `hostTouchy`); round seventy's two
 * rounds of ten minutes fell inside it.
 */
export const fillRounds = { waits: [600_000, 1_800_000, 4_200_000] as number[], sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

type SumDossier = Pick<Dossier, 'ids' | 'links' | 'upstream' | 'summary'> & { name: { scientific: string; synonyms: string[]; authorship?: string } };
export type SummaryCounts = {
  /** The title is the name or an older name, and no redirect is recorded: nothing to prove. */
  kept: number;
  /** Proved under another title (round seventy, S-A6), in all and by each proof. */
  confirmed: number;
  proofs: Partial<Record<Proof, number>>;
  /** Settled by an earlier run of this rule and not asked again (round seventy-one): a summary whose record names its proof, or a title set aside. */
  settled: number;
  dropped: number;
  unchecked: number;
  /** Each summary left not checked: "Name: the source that did not answer" (round seventy-one: the count alone named nothing). */
  uncheckedLines: string[];
  /** Of those, the summaries taken off the page: under another title, with no proof recorded and none read (round seventy-one). */
  withdrawn: number;
  /** Each summary dropped: "Name: Wikipedia redirects X to Y". */
  lines: string[];
  /** Each record whose proof changed: the old record said "whose lead is this species'" (round sixty-nine). */
  changed: number;
  changedLines: string[];
  restored: number;
  restoredLines: string[];
};

/** The species as the proofs read it: the stored name, its author and older names, and its Wikidata item and IPNI identifier. */
export function whoOf(d: SumDossier): Who {
  return { name: d.name.scientific, synonyms: d.name.synonyms ?? [], item: d.ids?.wikidata, ipni: d.ids?.ipni, authorship: d.name.authorship };
}

/** A recorded redirect: the title asked, the title given, and the proof the record names (round sixty-nine: "whose lead is this species'"). */
const REDIRECT = /^Wikipedia redirects (.+?) to (.+?)(?:, (.*))?$/;
/** The article as asked, with the proof the record names (round seventy-one: a sitelink or a common name is recorded with its proof too). */
const ARTICLE = /^Wikipedia's article (.+?), (.*)$/;
/** A redirect set aside ("Wikipedia redirects X to Y"), or left not checked ("…; whether it is this species' article was not checked: …"). */
const SET_ASIDE = /^Wikipedia redirects (.+?) to (.+?)(?:; whether it is this species' article was not checked: .*)?$/;
/** A sitelink or carried title set aside as another species' name, or left not checked (round seventy, A2). */
const NOT_OURS = /^Wikipedia's article (.+?)(?: is under a name that is neither|; whether it is this species' article was not checked: )/;
/** The words of the proofs as round seventy and after write them; "whose lead is this species'" (round sixty-nine) is none. */
const PROOF_WORDS = /this species' name|an older name of this species|the English article of this species' Wikidata item|a name GBIF holds as|a name of this species with the same type|is a product of this species' item|holds one accepted species in Kew's WCVP|whose one accepted species in Kew's WCVP is|this species' IPNI identifier/;

/**
 * The proof a stored record names, by the words this rule writes; null for none, for the lead, and for the species' own
 * item read as its own basionym ("the basionym of Q278283 and Q278283"), which round seventy-one no longer takes.
 */
export function recordedProof(rec: { status?: string; detail?: string } | undefined): string | null {
  if (rec?.status !== 'ok' || !rec.detail || /\bthe basionym of (Q\d+) and \1\b/.test(rec.detail)) return null;
  const words = REDIRECT.exec(rec.detail)?.[3] ?? ARTICLE.exec(rec.detail)?.[2];
  return words && PROOF_WORDS.test(words) ? words : null;
}

type Ask = { file: string; asked?: string; why?: Unanswered; got?: string };

/**
 * Stored summaries read again by the rule (REVIEW-TRIAGE-69 A1; `summary-proof.ts`). The lead proves nothing:
 *   - a title that is the name or an older name, with no redirect recorded, stands, and nothing is asked;
 *   - a title the name settles offline (another spelling of the name, an older name) stands, its record naming the proof;
 *   - a summary whose record names a proof in this rule's words, and a title set aside ("none"), are settled and not asked
 *     again (round seventy-one: round seventy asked some 440 again on every run), unless `again` is given, as it is when
 *     the rule changes;
 *   - otherwise, online: the species' Wikidata items are asked fifty a request, and a title that is its item's English
 *     sitelink stands, its record naming the proof. Every other one is asked of Wikipedia again exactly as the build asks
 *     it (`summary`: the item's sitelink, else the title the record says was asked, else the name), and the build's
 *     answer is stored: the summary as Wikipedia now gives it with the proof in its record, or "none: Wikipedia redirects
 *     X to Y", dropped (S-A5). A summary set aside ("none" with a redirect recorded, or not checked) is asked the same
 *     way, and taken back on a proof.
 * What Wikipedia, Wikidata, GBIF (for Kew's WCVP) or IPNI does not answer is asked again three times (`fillRounds`);
 * only then is it counted not checked, each species named with the source. A summary under another title whose record
 * names no proof, and whose proof was not read, is then taken off the page and recorded as not checked (round
 * seventy-one; REVIEW-TRIAGE-70: "the carried one goes with it"), and the next run asks it again. With no fetcher
 * (`--offline`) only the name is read: nothing else is asked, and nothing is taken off.
 */
export async function checkSummaries(store: DossierStore, f: JsonFetcher | null, now = () => new Date().toISOString(), opts: { again?: boolean } = {}): Promise<SummaryCounts> {
  const c: SummaryCounts = { kept: 0, confirmed: 0, proofs: {}, settled: 0, dropped: 0, unchecked: 0, uncheckedLines: [], withdrawn: 0, lines: [], changed: 0, changedLines: [], restored: 0, restoredLines: [] };
  const ask: Ask[] = [];
  for (const file of store.files()) {
    const d = store.read<SumDossier>(file);
    const rec = d.upstream?.wikipedia;
    if (!d.summary) {
      // Set aside by an earlier rule ("none"), or not checked when a source did not answer: asked again, taken on a proof.
      const open = rec?.status === 'none' || rec?.status === 'refused' || rec?.status === 'error';
      if (!open || !f) continue;
      const was = SET_ASIDE.exec(rec.detail ?? '');
      if (!was && !NOT_OURS.test(rec.detail ?? '')) continue;
      if (rec.status === 'none' && !opts.again) { c.settled++; continue; }
      ask.push({ file, asked: was?.[1] });
      continue;
    }
    const redirect = REDIRECT.exec(rec?.detail ?? '');
    if (!redirect && summaryTitleFits(d.summary.title, d.name.scientific, d.name.synonyms ?? [])) { c.kept++; continue; }
    const n = proofByName(d.summary.title, whoOf(d));
    if (n) { proved(file, d, n.proof, n.words); continue; }
    if (!opts.again && recordedProof(rec)) { c.settled++; continue; }
    if (!f) { c.unchecked++; c.uncheckedLines.push(`${d.name.scientific}: not asked (offline)`); continue; }
    ask.push({ file, asked: redirect?.[1] });
  }
  if (!f || !ask.length) return c;
  // What a source did not answer is asked again after a wait, three times, before it is counted not checked.
  let todo = ask;
  for (let round = 0; todo.length; round++) {
    const again = await pass(todo);
    if (!again.length) break;
    // Only a corpus run waits (`startCorpusRun` sets `mwWait.tries`).
    const waits = mwWait.tries > 1 ? fillRounds.waits : [];
    if (round >= waits.length) {
      for (const a of again) unchecked(a);
      break;
    }
    await fillRounds.sleep(waits[round]);
    todo = again;
  }
  return c;

  /** One pass over the summaries to ask: the species' items fifty a request, then each title as the build reads it. Returns those not answered. */
  async function pass(todo: Ask[]): Promise<Ask[]> {
    const again: Ask[] = [];
    const items = [...new Set(todo.map((a) => store.read<SumDossier>(a.file).ids?.wikidata).filter((q): q is string => !!q))];
    const sp = items.length ? await speciesItems(f!, items) : { status: 'ok' as const, data: new Map<string, SpeciesItem | null>() };
    for (const a of todo) {
      const d = store.read<SumDossier>(a.file);
      const who = whoOf(d);
      if (who.item && sp.unanswered?.has(who.item)) { again.push({ ...a, why: sp.failure ?? { status: 'error', detail: 'wikidata: no answer', source: 'Wikidata' } }); continue; }
      const species = who.item ? (sp.data.get(who.item) ?? null) : undefined;
      // A stored title that is the item's English sitelink, and no binomial of another name, stands without asking Wikipedia ("Saguaro").
      if (d.summary && species?.sitelink && titleKey(species.sitelink) === titleKey(d.summary.title) && !binomialNotOurs(d.summary.title, who)) { proved(a.file, d, 'item', `the English article of this species' Wikidata item (${who.item})`); continue; }
      const asked = species?.sitelink ?? a.asked ?? d.name.scientific;
      const r = await wikiSummary(f!, asked, [asked], who, species === undefined ? {} : { species });
      if (r.status === 'ok') take(a.file, d, r);
      else if (r.status === 'none' && d.summary) drop(a.file, d, r.detail ?? `Wikipedia has no article ${asked}`);
      else if (r.status !== 'none') {
        // A proof not read: the build's record says which source. Wikipedia itself not answering is said as Wikipedia's.
        const proofNotRead = !!r.detail && /whether it is this species' article was not checked/.test(r.detail);
        const why: Unanswered = { status: r.status === 'refused' || r.status === 'skipped' ? r.status : 'error', detail: r.detail ?? 'no answer', source: proofNotRead ? 'Wikidata' : 'Wikipedia' };
        again.push({ ...a, asked, why, got: proofNotRead ? r.detail : undefined });
      }
    }
    return again;
  }

  /** Not checked after every round: named, and a summary whose record names no proof taken off the page. */
  function unchecked(a: Ask) {
    const d = store.read<SumDossier>(a.file);
    const u: Unanswered = a.why ?? { status: 'error', detail: 'no answer', source: 'Wikidata' };
    c.unchecked++;
    const off = !!d.summary && !recordedProof(d.upstream?.wikipedia);
    c.uncheckedLines.push(`${d.name.scientific}: ${a.got ?? `${u.source} ${u.status === 'refused' ? 'refused' : 'did not answer'} (${u.detail})`}${off ? '; its summary is taken off until it is read' : ''}`);
    if (!off) return;
    c.withdrawn++;
    const title = d.summary!.title;
    d.summary = undefined;
    delete d.ids.wikipedia;
    delete d.links.wikipedia;
    d.upstream.wikipedia = { status: u.status === 'refused' ? 'refused' : 'error', at: now(), detail: a.got ?? notChecked(a.asked ?? title, title, u) };
    store.write(a.file, d);
  }
  /** A proof found for the stored summary: counted, and the record rewritten to name it when it names another, or none (S-A6). */
  function proved(file: string, d: SumDossier, p: Proof, words: string) {
    c.confirmed++;
    c.proofs[p] = (c.proofs[p] ?? 0) + 1;
    const rec = d.upstream?.wikipedia;
    const m = REDIRECT.exec(rec?.detail ?? '');
    const detail = m ? `${redirected(m[1], d.summary!.title)}, ${words}` : `Wikipedia's article ${d.summary!.title}, ${words}`;
    if (rec?.status === 'ok' && detail === rec.detail) return;
    c.changed++;
    const old = m?.[3] ?? ARTICLE.exec(rec?.detail ?? '')?.[2];
    c.changedLines.push(`${d.name.scientific}: ${old ? `"${old}", now ` : ''}"${words}"`);
    d.upstream.wikipedia = { status: 'ok', at: now(), detail };
    store.write(file, d);
  }
  /** The build's answer taken: a summary set aside comes back; a stored one is replaced by Wikipedia's answer now, when it differs. */
  function take(file: string, d: SumDossier, r: Extract<Awaited<ReturnType<typeof wikiSummary>>, { status: 'ok' }>) {
    const before = d.summary;
    const was = d.upstream.wikipedia;
    // With no redirect, the title asked (the item's sitelink, or the name) is the article.
    const p: Proof = r.data.proof ?? (titleKey(r.data.title) === titleKey(d.name.scientific) ? 'name' : 'item');
    if (before) {
      c.confirmed++;
      c.proofs[p] = (c.proofs[p] ?? 0) + 1;
      if (before.title === r.data.title && before.text === r.data.text && was?.detail === r.detail) return;
      if (before.title !== r.data.title || was?.detail !== r.detail) {
        c.changed++;
        const old = REDIRECT.exec(was?.detail ?? '')?.[3];
        c.changedLines.push(`${d.name.scientific}: ${before.title !== r.data.title ? `title ${before.title}, now ${r.data.title}; ` : ''}${old ? `"${old}", now ` : ''}"${r.detail ?? 'no redirect'}"`);
      }
    } else {
      c.restored++;
      c.restoredLines.push(`${d.name.scientific}: ${r.detail ?? r.data.title}`);
    }
    d.summary = { text: r.data.text, source: 'wikipedia', url: r.data.url, licence: 'CC BY-SA 4.0', title: r.data.title, ...(r.data.cut ? { cut: true as const } : {}) };
    d.ids.wikipedia = r.data.title;
    d.links.wikipedia = r.data.url;
    d.upstream.wikipedia = { status: 'ok', at: now(), ...(r.detail ? { detail: r.detail } : {}) };
    store.write(file, d);
  }
  function drop(file: string, d: SumDossier, why: string) {
    c.lines.push(`${d.name.scientific}: ${why}`);
    d.summary = undefined;
    delete d.ids.wikipedia;
    delete d.links.wikipedia;
    d.upstream.wikipedia = { status: 'none', at: now(), detail: why };
    store.write(file, d);
    c.dropped++;
  }
}

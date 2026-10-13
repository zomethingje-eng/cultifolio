/**
 * `--fill summaries` (round sixty-nine; triage-68 M3), moved out of `corpus-fills.ts` before round seventy so that its
 * rule has one owner.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import type { DossierStore } from './corpus-run';
import { summary as wikiSummary, summaryTitleFits } from './sources/wikipedia';
import { mwWait } from './sources/wikimedia';
import { redirected, proofByName, speciesItems, titleKey, binomialNotOurs, type Proof, type Who, type SpeciesItem } from './summary-proof';

/** The waits before a summary a source did not answer is asked again in a corpus run (ten minutes, the fetch layer's cooling, twice); a test makes them instant. */
export const fillRounds = { waits: [600_000, 600_000] as number[], sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

type SumDossier = Pick<Dossier, 'ids' | 'links' | 'upstream' | 'summary'> & { name: { scientific: string; synonyms: string[] } };
export type SummaryCounts = {
  /** The title is the name or an older name, and no redirect is recorded: nothing to prove. */
  kept: number;
  /** Proved under another title (round seventy, S-A6), in all and by each proof. */
  confirmed: number;
  proofs: Partial<Record<Proof, number>>;
  dropped: number;
  unchecked: number;
  /** Each summary dropped: "Name: Wikipedia redirects X to Y". */
  lines: string[];
  /** Each record whose proof changed: the old record said "whose lead is this species'" (round sixty-nine). */
  changed: number;
  changedLines: string[];
  restored: number;
  restoredLines: string[];
};

/** The species as the proofs read it: the stored name and older names, and the Wikidata item. */
export function whoOf(d: SumDossier): Who {
  return { name: d.name.scientific, synonyms: d.name.synonyms ?? [], item: d.ids?.wikidata };
}

/** A recorded redirect: the title asked, the title given, and the proof the record names (round sixty-nine: "whose lead is this species'"). */
const REDIRECT = /^Wikipedia redirects (.+?) to (.+?)(?:, (.*))?$/;
/** A redirect set aside ("Wikipedia redirects X to Y"), or left not checked ("…; whether it is this species' article was not checked: …"). */
const SET_ASIDE = /^Wikipedia redirects (.+?) to (.+?)(?:; whether it is this species' article was not checked: .*)?$/;
/** A sitelink or carried title set aside as another species' name, or left not checked (round seventy, A2). */
const NOT_OURS = /^Wikipedia's article (.+?)(?: is under a name that is neither|; whether it is this species' article was not checked: )/;

/**
 * Stored summaries read again by the rule of round seventy (REVIEW-TRIAGE-69 A1; `summary-proof.ts`). Round sixty-nine's
 * fill dropped 108 summaries by title alone, then took 88 back because their lead named the species. The lead proves
 * nothing now, so every summary under another title is read again, and every one set aside is asked again:
 *   - a title that is the name or an older name, with no redirect recorded, stands, and nothing is asked;
 *   - a title the name settles offline (another spelling of the name, an older name) stands, its record naming the proof;
 *   - otherwise, online: the species' Wikidata items are asked fifty a request, and a title that is its item's English
 *     sitelink stands. Every other one is asked of Wikipedia again exactly as the build asks it (`summary`: the item's
 *     sitelink, else the title the record says was asked, else the name), and the build's answer is stored: the
 *     summary as Wikipedia now gives it with the proof in its record, or "none: Wikipedia redirects X to Y", dropped.
 *     So the build and the fill decide alike on the same answers (S-A5). A summary set aside ("none" with a redirect
 *     recorded, or not checked) is asked the same way, and taken back on a proof.
 * A request Wikipedia, Wikidata or GBIF (for Kew's WCVP) does not answer, after `mwGet`'s waits on maxlag and the
 * fetch layer's on 429, is asked again after ten minutes, twice (`fillRounds`); only then is the summary left as it
 * is, counted as not checked. A batch of species' items that fails leaves only its own fifty unanswered. With no
 * fetcher (`--offline`) only the name is read: a title it does not settle is not checked, and nothing set aside is
 * asked again.
 */
export async function checkSummaries(store: DossierStore, f: JsonFetcher | null, now = () => new Date().toISOString()): Promise<SummaryCounts> {
  const c: SummaryCounts = { kept: 0, confirmed: 0, proofs: {}, dropped: 0, unchecked: 0, lines: [], changed: 0, changedLines: [], restored: 0, restoredLines: [] };
  const ask: Array<{ file: string; asked?: string }> = [];
  for (const file of store.files()) {
    const d = store.read<SumDossier>(file);
    const rec = d.upstream?.wikipedia;
    if (!d.summary) {
      // Set aside by an earlier rule ("none"), or not checked when a source did not answer: asked again, taken on a proof.
      const open = rec?.status === 'none' || rec?.status === 'refused' || rec?.status === 'error';
      const was = open ? SET_ASIDE.exec(rec.detail ?? '') : null;
      if (was && f) ask.push({ file, asked: was[1] });
      else if (open && f && NOT_OURS.test(rec.detail ?? '')) ask.push({ file });
      continue;
    }
    const redirect = REDIRECT.exec(rec?.detail ?? '');
    if (!redirect && summaryTitleFits(d.summary.title, d.name.scientific, d.name.synonyms ?? [])) { c.kept++; continue; }
    const n = proofByName(d.summary.title, whoOf(d));
    if (n) { proved(file, d, n.proof, n.words); continue; }
    if (!f) { c.unchecked++; continue; }
    ask.push({ file, asked: redirect?.[1] });
  }
  if (!f || !ask.length) return c;
  // What a source did not answer is asked again after a wait, twice, before it is counted not checked (round seventy-b):
  // the fetch layer cools a host that refuses for ten minutes, and Wikidata's lag can outlast `mwGet`'s five asks.
  let todo = ask;
  for (let round = 0; todo.length; round++) {
    const again = await pass(todo);
    if (!again.length) break;
    // Only a corpus run waits (`startCorpusRun` sets `mwWait.tries`), as only it waits on maxlag.
    const waits = mwWait.tries > 1 ? fillRounds.waits : [];
    if (round >= waits.length) { c.unchecked += again.length; break; }
    await fillRounds.sleep(waits[round]);
    todo = again;
  }
  return c;

  /** One pass over the summaries to ask: the species' items fifty a request, then each title as the build reads it. Returns those not answered. */
  async function pass(todo: typeof ask): Promise<typeof ask> {
    const again: typeof ask = [];
    const items = [...new Set(todo.map((a) => store.read<SumDossier>(a.file).ids?.wikidata).filter((q): q is string => !!q))];
    const sp = items.length ? await speciesItems(f!, items) : { status: 'ok' as const, data: new Map<string, SpeciesItem | null>() };
    for (const a of todo) {
      const d = store.read<SumDossier>(a.file);
      const who = whoOf(d);
      if (who.item && sp.unanswered?.has(who.item)) { again.push(a); continue; }
      const species = who.item ? (sp.data.get(who.item) ?? null) : undefined;
      // A stored title that is the item's English sitelink, and no binomial of another name, stands without asking Wikipedia ("Saguaro").
      if (d.summary && species?.sitelink && titleKey(species.sitelink) === titleKey(d.summary.title) && !binomialNotOurs(d.summary.title, who)) { proved(a.file, d, 'item', `the English article of this species' Wikidata item (${who.item})`); continue; }
      const asked = species?.sitelink ?? a.asked ?? d.name.scientific;
      const r = await wikiSummary(f!, asked, [asked], who, species === undefined ? {} : { species });
      if (r.status === 'ok') take(a.file, d, r);
      else if (r.status === 'none' && d.summary) drop(a.file, d, r.detail ?? `Wikipedia has no article ${asked}`);
      else if (r.status !== 'none') again.push(a);
    }
    return again;
  }

  /** A proof found for the stored summary: counted; a recorded redirect is rewritten to name it, and reported, when it named another (S-A6). */
  function proved(file: string, d: SumDossier, p: Proof, words: string) {
    c.confirmed++;
    c.proofs[p] = (c.proofs[p] ?? 0) + 1;
    const rec = d.upstream?.wikipedia;
    const m = REDIRECT.exec(rec?.detail ?? '');
    if (!m || !rec) return;
    const detail = `${redirected(m[1], d.summary!.title)}, ${words}`;
    if (detail === rec.detail) return;
    c.changed++;
    c.changedLines.push(`${d.name.scientific}: ${m[3] ? `"${m[3]}", now ` : ''}"${words}"`);
    d.upstream.wikipedia = { ...rec, detail };
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
    d.summary = { text: r.data.text, source: 'wikipedia', url: r.data.url, licence: 'CC BY-SA 4.0', title: r.data.title };
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

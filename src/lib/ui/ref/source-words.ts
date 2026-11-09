/**
 * The words of round eighty-seven's four sourced lines on a species page (stage 2; the sources agent): Kew's predicted
 * extinction risk (`RiskLine.svelte`), CITES Appendix status (`CitesLine.svelte`), chromosome counts (`ChromosomeLine.svelte`)
 * and the WFO Plant List's reading of the name (`NameAgreement.svelte`). Pure, so the words are tested apart from the
 * markup. Every line names its source, the source's date and licence, and the day the figure was read (rules 1 and 4);
 * a field not asked says "not asked" (rule 2). Plain words: no legal advice, no reading of what a figure means beyond
 * what the source says.
 */
import type { Risk, Cites, Chromosomes, NameAgreement } from '$dossier/schema';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-03-05" as "5 March 2026"; anything else as given. */
export function dayWords(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso ?? '';
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** IUCN's page for a taxon by its IUCN id, as Wikidata's formatter for P627 writes it (read 9 November 2026). */
export const iucnUrl = (id: string) => `https://www.iucnredlist.org/details/${encodeURIComponent(id)}/0`;
/** Species+'s page for a taxon by its Species+ id, as Wikidata's formatter for P2040 writes it (read 9 November 2026). */
export const speciesPlusUrl = (id: string) => `https://speciesplus.net/#/taxon_concepts/${encodeURIComponent(id)}`;
export const WFO_TAXON = (id: string) => `https://www.worldfloraonline.org/taxon/${encodeURIComponent(id)}`;
export const RISK_DOI = 'https://doi.org/10.1111/nph.19592';
export const RISK_DATA = 'https://doi.org/10.5281/zenodo.10605228';
export const CITES_APPENDICES = 'https://cites.org/eng/app/appendices.php';

/** "not asked", and why, for a field absent or skipped. */
export function notAskedWords(f: { status: string; detail?: string } | null | undefined): string | null {
  if (!f) return 'not asked (this page was built before the source was read)';
  if (f.status === 'skipped') return f.detail?.startsWith('not asked') ? f.detail : `not asked${f.detail ? `: ${f.detail}` : ''}`;
  return null;
}

export function riskWords(r: Risk | null | undefined): { head: string; body: string; credit: string | null } {
  const na = notAskedWords(r);
  const credit = r && r.status !== 'skipped' ? `Bachman et al. 2024, New Phytologist; Kew's data of ${dayWords(r.asOf) || 'a date not known'}, CC BY 4.0; read ${r.read}.` : null;
  if (na) return { head: 'Predicted extinction risk', body: `${na}.`, credit: null };
  if (r!.status === 'none') return { head: 'Predicted extinction risk', body: `no prediction for this name: ${r!.detail ?? 'the file holds no row for it'}.`, credit };
  if (r!.status === 'undecided') return { head: 'Predicted extinction risk', body: `not decided: ${r!.detail ?? ''}.`, credit };
  const x = r!;
  const conf = x.confident ? 'the model is confident of this class' : "low confidence: the interval crosses the model's threshold";
  return { head: 'Predicted extinction risk', body: `${pct(x.p!)} probability of being threatened (95% interval ${pct(x.lo!)} to ${pct(x.hi!)}); predicted ${x.predicted}, ${conf}. A model's prediction, not an assessment.`, credit };
}

const levelWords: Record<NonNullable<Cites['level']>, string> = { family: 'a family listing', genus: 'a genus listing', species: 'a species listing', infraspecific: 'a listing below the species' };

export function citesWords(c: Cites | null | undefined): { head: string; body: string; credit: string | null } {
  const na = notAskedWords(c);
  const head = 'CITES';
  if (na) return { head, body: `${na}.`, credit: null };
  const x = c!;
  const credit = `CITES Appendices I, II and III, valid from ${dayWords(x.validFrom)}; read ${x.read}.`;
  if (x.status === 'none') return { head, body: `Not in the CITES Appendices (the edition in force from ${dayWords(x.validFrom)}): ${x.detail ?? 'no listing of its name, its genus or its family'}.`, credit };
  if (x.status === 'undecided') return { head, body: `Not decided from this page's names: ${x.detail ?? ''}.`, credit };
  const by = x.party ? ` by ${x.party}` : '';
  // The day is the Appendices edition's, not the day the plant was listed (round eighty-seven, the integration).
  const parts = [`Listed in Appendix ${x.appendix} of CITES${by} (the Appendices in force from ${dayWords(x.validFrom)}).`];
  parts.push(`As ${x.listed}, ${levelWords[x.level!]}${x.annotation ? `, annotation ${x.annotation}` : ''}${x.scope ? ` ${x.scope}` : ''}.`);
  if (x.via) parts.push(`The listing is under ${x.via}, a name Kew holds as a synonym of this one.`);
  if (x.detail) parts.push(`${x.detail[0].toUpperCase()}${x.detail.slice(1)}.`);
  if (x.infra?.length) parts.push(`Listed apart: ${x.infra.map((i) => `${i.listed}, Appendix ${i.appendix}`).join('; ')}.`);
  return { head, body: parts.join(' '), credit };
}

/** The counts grouped by number as published: "2n = 22" with each reference that gives it. */
export function countGroups(c: Chromosomes | null | undefined): Array<{ label: string; refs: Array<{ ref: string; url?: string; as?: string; cite?: string }> }> {
  const out = new Map<string, Array<{ ref: string; url?: string; as?: string; cite?: string }>>();
  for (const x of c?.counts ?? []) {
    for (const label of [x.twoN ? `2n = ${x.twoN}` : null, x.n ? `n = ${x.n}` : null]) {
      if (!label) continue;
      const a = out.get(label) ?? [];
      if (!a.some((r) => r.ref === x.ref)) a.push({ ref: x.ref, ...(x.url ? { url: x.url } : {}), ...(x.as ? { as: x.as } : {}), ...(x.cite ? { cite: x.cite } : {}) });
      out.set(label, a);
    }
  }
  // Somatic counts first, as the line's head says.
  return [...out].sort(([a], [b]) => Number(b.startsWith('2n')) - Number(a.startsWith('2n'))).map(([label, refs]) => ({ label, refs }));
}

export function chromosomeWords(c: Chromosomes | null | undefined): { head: string; body: string | null; credit: string | null } {
  const na = notAskedWords(c);
  const head = 'Chromosomes';
  if (na) return { head, body: `${na}.`, credit: null };
  const x = c!;
  const credit = `ChromoDB, IAPT/IOPB chromosome data (Simon, Bosch & Blanché), version ${x.version ?? '?'} of ${dayWords(x.asOf) || 'a date not known'}, CC BY 4.0; read ${x.read}.`;
  if (x.status === 'none') return { head, body: `no count in ChromoDB's IAPT/IOPB set${x.detail ? ` (${x.detail})` : ''}.`, credit };
  if (x.status === 'undecided') return { head, body: `not decided: ${x.detail ?? ''}.`, credit };
  const tail = [x.more ? `${x.more} more count${x.more === 1 ? '' : 's'} in the set` : '', x.left ? `${x.left} left out (retracted, or inferred from genome size)` : ''].filter(Boolean).join('; ');
  return { head, body: tail ? `${tail}.` : null, credit };
}

/**
 * `note` (round eighty-seven's review of stage 2, B1): how WFO's row was found where not by the page's IPNI id, and
 * WFO's IPNI id where it is not Kew's, said after the linked words ("accepted; matched by the exact name and authors:
 * WFO files it under IPNI id 77200679-1, Kew under IPNI id 261506-1").
 */
export function nameAgreementWords(w: NameAgreement | null | undefined): { head: string; body: string; note: string | null; credit: string | null } {
  const na = notAskedWords(w);
  const head = `WFO Plant List${w?.release ? ` (${w.release})` : ''}`;
  if (na) return { head, body: na, note: null, credit: null };
  const x = w!;
  const credit = `World Flora Online, CC0; read ${x.read}.`;
  const spelt = x.spelt ? ` (WFO spells it ${x.spelt})` : '';
  const note = x.status === 'ok' && x.detail ? x.detail : null;
  if (x.status === 'none') return { head, body: `does not hold this name${spelt}`, note: null, credit };
  if (x.status === 'undecided') return { head, body: `not decided: ${x.detail ?? ''}`, note: null, credit };
  if (x.kind === 'accepted') return { head, body: `accepted${spelt}`, note, credit };
  if (x.kind === 'unchecked') return { head, body: `holds the name, not yet placed${spelt}`, note, credit };
  return { head, body: `a synonym of ${x.of}${spelt}`, note, credit };
}

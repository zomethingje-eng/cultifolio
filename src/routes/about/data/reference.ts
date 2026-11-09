/**
 * What /about/data and the not-found page read of the reference the site serves (round eighty-seven; plan D6, D7), as
 * pure functions, so the rules are tested apart from the pages.
 *
 * - `pickOf`: the species of the day, by a stated rule: the first species the front page's strip shows today (its pool
 *   is the build's `featured.json`, one species of each of the popular genera with eight photographs or more and a
 *   habitat climate; the strip shows twelve a day, in turn, from `(day × 12) mod n`). The not-found page shows it, and
 *   /about/data reads the GBIF download its records came from.
 * - `downloadsOf`: the GBIF occurrence downloads a page's record of sources cites, each with its DOI and the day GBIF
 *   made it, read from the words the build writes there ("GBIF occurrence download https://doi.org/10.15468/dl.…, of
 *   2026-10-21"; `$dossier/build`, `$dossier/build-kew`). Nothing is guessed: a row that names no DOI gives none.
 * - `citation`: how to cite the reference, from the manifest the Worker serves: its id and the day it was built.
 * - `GBIF_DERIVED_DOI`: the DOI of a GBIF derived dataset for the records read through GBIF's API, when one is
 *   registered. Null until then, and the page's section on it is not drawn: nothing on the page says such a dataset
 *   exists before it does.
 */

/**
 * The DOI of the GBIF derived dataset that cites the records the build read through GBIF's search API rather than a
 * download (https://www.gbif.org/derived-dataset), as `10.15468/…`, once it is registered. Null: none is registered, and
 * /about/data says nothing of one. Set it here, and the section is drawn with the DOI linked.
 */
export const GBIF_DERIVED_DOI: string | null = null;

/** A DOI as the pages take one: `10.<registrant>/<suffix>`, with or without the resolver's address before it. */
export const doiOf = (x: string | null | undefined): string | null => {
  const m = /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s"<>]+)$/i.exec((x ?? '').trim());
  return m ? m[1] : null;
};

/** The day number the strip turns on: whole days since 1970 in UTC, as the front page counts them. */
export const dayNumber = (now = Date.now()) => Math.floor(now / 86_400_000);

/** The day number as a calendar day, YYYY-MM-DD, in UTC on purpose: the strip turns at midnight UTC, for every reader. */
export function dayOf(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The first species the front page shows on `day`, or null with no pool. */
export function pickOf<T>(pool: readonly T[], day: number): T | null {
  if (!pool.length) return null;
  const i = (((day * 12) % pool.length) + pool.length) % pool.length;
  return pool[i] ?? null;
}

export interface Download { doi: string; day: string | null }

/** GBIF's download DOIs are `10.15468/dl.` and six letters or digits; the row writes the day after ", of ". */
const CITED = /GBIF occurrence download https?:\/\/doi\.org\/(10\.15468\/dl\.[a-z0-9]+)(?:, of (\d{4}-\d{2}-\d{2}))?/gi;

/** The downloads a row's words cite, in the order cited, each once. */
export function downloadsOf(detail: string | null | undefined): Download[] {
  const out: Download[] = [];
  for (const m of (detail ?? '').matchAll(CITED)) {
    const doi = m[1].toLowerCase();
    if (!out.some((d) => d.doi === doi)) out.push({ doi, day: m[2] ?? null });
  }
  return out;
}

export interface Cite { id: string; built: string | null }

/**
 * The reference as served, for a citation: the manifest's id and the day it was built (YYYY-MM-DD of its `built`), or
 * the corpus id alone where the Worker serves no manifest (the fixture, a corpus built before the manifest), the day then
 * not known. Null when nothing names the corpus.
 */
export function citeOf(c: { corpus?: string | null; manifest?: { id?: unknown; built?: unknown } | null } | null | undefined): Cite | null {
  if (!c) return null;
  const id = typeof c.manifest?.id === 'string' && c.manifest.id ? c.manifest.id : typeof c.corpus === 'string' && c.corpus ? c.corpus : null;
  if (!id) return null;
  const b = typeof c.manifest?.built === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(c.manifest.built)?.[0] ?? null : null;
  return { id, built: b };
}

/** The citation's words: "Cultifolio species reference, corpus 41e65994323067ef, built 2026-11-08. https://cultifolio.com" */
export function citation(c: Cite, site = 'https://cultifolio.com'): string {
  return `Cultifolio species reference, corpus ${c.id}${c.built ? `, built ${c.built}` : ''}. ${site}`;
}

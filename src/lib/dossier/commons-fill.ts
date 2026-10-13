/**
 * Photographs for a dossier that has none or few, from Wikimedia Commons' category for the species (round sixty-eight, fourth
 * part). The builder has asked Commons since round sixteen, but Commons began answering every file's address with a
 * tracking query, the builder's test of the file's extension failed on every one, and no Commons photograph reached the
 * corpus: of 3,160 species with none, a sample of 100 found 15 with openly licensed photographs in their category. One
 * request a species, under its accepted name, the way the build asks when Wikidata names no other category.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier, Photo } from './schema';
import type { DossierStore } from './corpus-run';
import { commonsPhotos, commonsCategories, strikesOut } from './sources/commons';
import { mwGet, mwError } from './sources/wikimedia';
import { commonsKind, type HeldNames, type KindNames } from './photo-kind';

export type CommonsFill = { added: number } | { none: true } | { failed: string };

/** What a dossier records when Commons has no openly licensed photograph for it: a later fill passes it by, so a stopped fill resumes. */
export const COMMONS_NONE = 'no openly licensed photograph in the Commons category of this name';

/** Whether this fill has already asked for this dossier: told there is none, or given photographs (its record names the category asked). */
export const askedCommons = (d: Pick<Dossier, 'upstream'>) => {
  const c = d.upstream?.commons;
  return c?.detail === COMMONS_NONE || (c?.status === 'ok' && !!c.detail?.startsWith('Category:'));
};

/**
 * The species the fill asks for: those with fewer than six photographs, the threshold at which the build already asks
 * GBIF's open-licence records (round sixty-eight, fourth part). A species with a full gallery, mostly research-grade
 * wild photographs, is not given Commons' category as well, which mixes in herbarium sheets, drawings and the odd
 * misfiled picture; it gets Commons at its next build, as every species does.
 */
export const COMMONS_FILL_BELOW = 6;
export const wantsCommons = (d: Pick<Dossier, 'photos' | 'upstream'>) => (d.photos?.length ?? 0) < COMMONS_FILL_BELOW && !askedCommons(d);

export async function fillCommons(d: Pick<Dossier, 'key' | 'photos' | 'upstream'> & { name: { scientific: string; synonyms?: string[] } }, f: JsonFetcher, now = () => new Date().toISOString(), held?: HeldNames | null): Promise<CommonsFill> {
  // The species' older names go with it, so a file named under one is the species and one named as another is not (round sixty-nine; triage-68 K1);
  // and the reference's names when the caller has them, so an uploader's slip is the species' (round seventy; REVIEW-TRIAGE-69 C1).
  const r = await commonsPhotos(f, d.name.scientific, 12, { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], key: d.key, held });
  if (r.status === 'ok') {
    const have = new Set((d.photos ?? []).map((p) => p.id));
    const fresh = r.data.filter((p) => !have.has(p.id));
    d.photos = [...(d.photos ?? []), ...fresh];
    d.upstream.commons = { status: 'ok', at: now(), detail: `Category:${d.name.scientific}` };
    return { added: fresh.length };
  }
  if (r.status === 'none') {
    d.upstream.commons = { status: 'none', at: now(), detail: COMMONS_NONE };
    return { none: true };
  }
  // A refusal or a failure changes nothing on the page: the dossier keeps what it said, and a later fill asks again.
  return { failed: r.status === 'skipped' ? 'not asked' : r.detail };
}

/**
 * `--fill commons-kind` (round seventy; REVIEW-TRIAGE-69 C2, S-C2): Commons' categories for every stored Commons
 * photograph, asked fifty files a request, and kept with the photograph (`categories`, and `struck` when Commons'
 * description strikes out a name), so the read applies the category rules to a stored file as to a new answer. Round
 * sixty-nine read categories only on new answers, and a postage stamp (Colchicum macedonicum), a Curtis plate (Cyphostemma
 * adenopodum) and two files Commons calls unidentified led their pages. A photograph already holding its categories is
 * passed by, so a fill stopped part way resumes; a refusal stops the fill and leaves every photograph not yet answered as
 * it was, counted as not checked; a file Commons no longer has is left as it is and listed. Nothing is dropped from the
 * dossier: the read leaves out what the rules leave out, and the fill lists each photograph it now leaves out.
 */
export const KIND_BATCH = 50;
/** Commons' own limit on an address is about 8,000 characters: a request holds fifty titles or fewer, so a long title does not overrun it. */
const KIND_URL_MAX = 6000;
const KIND_URL = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Categories|ImageDescription&maxlag=5&titles=';

export type KindCounts = {
  /** Stored Commons photographs read. */
  files: number;
  /** Of them, holding their categories from a build or an earlier fill: passed by. */
  before: number;
  /** Requests made, and files asked (one file on several pages is asked once). */
  requests: number;
  asked: number;
  /** Files Commons answered, and of those, files it no longer has. */
  read: number;
  missing: number;
  /** Files not answered (a refusal, or an error): asked again by the next fill. */
  unchecked: number;
  /** Why the fill stopped, when Commons refused it. */
  refused?: string;
  /** Dossiers written, and photographs the rules now leave out with their categories kept. */
  dossiers: number;
  hidden: number;
  /** One line a photograph now left out, or no longer on Commons: key, name, reason, file. */
  lines: string[];
};

type KindAnswer = { categories: string[]; struck: boolean } | 'missing';
type Stored = Pick<Dossier, 'key'> & { name: { scientific: string; synonyms?: string[] }; photos?: Photo[] };
const needsKind = (p: Photo) => p.src === 'commons' && !Array.isArray(p.categories);

export async function fillCommonsKindAll(store: DossierStore, f: JsonFetcher, held?: HeldNames | null, progress?: (c: KindCounts) => void): Promise<KindCounts> {
  const c: KindCounts = { files: 0, before: 0, requests: 0, asked: 0, read: 0, missing: 0, unchecked: 0, dossiers: 0, hidden: 0, lines: [] };
  const wanted = new Map<string, string[]>();
  for (const file of store.files()) {
    const d = store.read<Stored>(file);
    for (const p of d.photos ?? []) {
      if (p.src !== 'commons') continue;
      c.files++;
      if (!needsKind(p)) { c.before++; continue; }
      (wanted.get(p.id) ?? wanted.set(p.id, []).get(p.id)!).push(file);
    }
  }
  const titles = [...wanted.keys()];
  const answers = new Map<string, KindAnswer>();
  for (let i = 0; i < titles.length && !c.refused; ) {
    const batch: string[] = [];
    while (i < titles.length && batch.length < KIND_BATCH && (KIND_URL + encodeURIComponent([...batch, titles[i]].join('|'))).length <= KIND_URL_MAX) batch.push(titles[i++]);
    if (!batch.length) batch.push(titles[i++]); // a title longer than the limit on its own is asked alone
    c.requests++;
    c.asked += batch.length;
    const r = await mwGet<KindReply>(f, KIND_URL + encodeURIComponent(batch.join('|')));
    const err = r.status === 'ok' ? mwError(r.data) : null;
    if (r.status !== 'ok' || err) {
      c.unchecked += batch.length;
      if (r.status === 'refused') c.refused = r.detail;
      continue;
    }
    for (const [title, a] of readKindReply(r.data, batch)) {
      answers.set(title, a);
      c.read++;
      if (a === 'missing') c.missing++;
    }
    c.unchecked += batch.filter((t) => !answers.has(t)).length;
    progress?.(c);
  }
  if (c.refused) c.unchecked += titles.length - c.asked;
  const files = new Set(titles.filter((t) => answers.has(t)).flatMap((t) => wanted.get(t)!));
  for (const file of files) {
    const d = store.read<Stored>(file);
    const names: KindNames = { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], key: d.key, held };
    let changed = false;
    for (const p of d.photos ?? []) {
      if (!needsKind(p)) continue;
      const a = answers.get(p.id);
      if (!a) continue;
      if (a === 'missing') { c.lines.push(`${d.key}\t${d.name.scientific}\tno longer on Commons (left as it is)\t${p.id}`); continue; }
      const was = commonsKind(p.id, names, { struck: p.struck });
      p.categories = a.categories;
      if (a.struck) p.struck = true;
      else delete p.struck;
      changed = true;
      const why = commonsKind(p.id, names, { categories: p.categories, struck: p.struck });
      if (why && !was) { c.hidden++; c.lines.push(`${d.key}\t${d.name.scientific}\t${why}\t${p.id}`); }
    }
    if (changed) { store.write(file, d); c.dossiers++; }
  }
  return c;
}

type KindReply = { query?: { normalized?: Array<{ from: string; to: string }>; pages?: Record<string, { title: string; missing?: string | boolean; invalid?: string | boolean; imageinfo?: Array<{ extmetadata?: Record<string, { value: string }> }> }> } };
/** Commons' answer for one request, by the title as asked: the categories and the strike of each file it has, and "missing" for one it no longer has. A file it did not answer for is absent. */
export function readKindReply(data: KindReply, asked: readonly string[]): Map<string, KindAnswer> {
  const to = new Map((data.query?.normalized ?? []).map((n) => [n.from, n.to]));
  const pages = new Map(Object.values(data.query?.pages ?? {}).map((p) => [p.title, p]));
  const out = new Map<string, KindAnswer>();
  for (const t of asked) {
    const p = pages.get(to.get(t) ?? t);
    if (!p || p.invalid != null) continue;
    if (p.missing != null && !p.imageinfo) { out.set(t, 'missing'); continue; }
    const meta = p.imageinfo?.[0]?.extmetadata;
    if (!meta) continue;
    out.set(t, { categories: commonsCategories(meta.Categories?.value), struck: strikesOut(meta.ImageDescription?.value) });
  }
  return out;
}

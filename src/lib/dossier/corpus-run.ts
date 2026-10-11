/**
 * The corpus script's wiring, out of the script so it is tested (round sixty-nine; triage-68 M11, S-F5, R46-31): four
 * reverts in scripts/build-dossiers.ts left the suite green, because the tests drove the helpers and no test drove the
 * lines that put them to work. The script calls these, a seam test reads that it does, and the tests drive them with a
 * fixture fetcher and dossiers held in memory.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import { mwWait, MAXLAG_TRIES, lagSpell } from './sources/wikimedia';
import { fillOpenGbif, askedOpen } from './open-gbif-fill';
import { fillCommons, askedCommons, wantsCommons } from './commons-fill';
import type { BuildOptions } from './build';

/**
 * The start of a corpus run: Wikidata's maxlag is waited out, as MediaWiki asks of a batch client (round sixty-eight),
 * and a lag spell is watched for (round sixty-nine; triage-68 M10). The script calls `after` with each species' Wikidata row.
 */
export function startCorpusRun() {
  mwWait.tries = MAXLAG_TRIES;
  return lagSpell(MAXLAG_TRIES);
}

type Prev = Pick<Dossier, 'ids' | 'upstream' | 'built'>;

/**
 * The day of the build that read a dossier's identifiers from Wikidata: the build that asked it, read from its Wikidata
 * row ("carried from build of …" when a re-derivation carried it), or, when that build kept older identifiers, the day it
 * names. Undefined when no day can be read (round sixty-eight's "the previous build's identifiers are kept" named none),
 * and then nothing is carried (round sixty-nine; triage-68 M5, M8).
 */
export function idsReadOn(prev: Prev): string | undefined {
  const u = prev.upstream?.wikidata;
  if (!u) return undefined;
  const day = (re: RegExp) => re.exec(u.detail ?? '')?.[1];
  if (u.status === 'error' || u.status === 'refused') return day(/identifiers of the build of (\d{4}-\d{2}-\d{2}) are kept/);
  if (u.status === 'skipped') return undefined;
  return day(/carried from build of (\d{4}-\d{2}-\d{2})/) ?? u.at?.slice(0, 10) ?? prev.built?.slice(0, 10);
}

/** What a species' build is given from the previous build of its key: its identifiers and the day they were read. */
export function prevIdsFor(prev: Prev | null | undefined): Pick<BuildOptions, 'prevIds' | 'prevIdsOn'> {
  if (!prev?.ids) return {};
  return { prevIds: prev.ids, prevIdsOn: idsReadOn(prev) };
}

/** Whether the index holds a name as another of its species than `key` (triage-68 M6): from the index's names and keys. */
export function heldElsewhereIn(index: ReadonlyMap<string, number>, key: number | undefined): (name: string) => boolean {
  return (name) => {
    const k = index.get(name.toLowerCase());
    return k != null && k !== key;
  };
}

/** The dossiers on disk as a fill reads and writes them; the script's is the files, a test's a map. */
export interface DossierStore {
  files(): string[];
  read<T = Dossier>(file: string): T;
  write(file: string, d: unknown): void;
}

export type FillCounts = { asked: number; filled: number; photos: number; none: number; failed: number; before: number };

/**
 * `--fill gbif-open` over every dossier (round sixty-eight): those with no photograph are asked once; one an earlier fill
 * asked and found none for is passed by, so a fill stopped part way resumes where it was.
 */
export async function fillOpenGbifAll(store: DossierStore, f: JsonFetcher, progress?: (c: FillCounts) => void): Promise<FillCounts> {
  const c: FillCounts = { asked: 0, filled: 0, photos: 0, none: 0, failed: 0, before: 0 };
  for (const file of store.files()) {
    const d = store.read<Pick<Dossier, 'key' | 'photos' | 'upstream'>>(file);
    if (d.photos?.length) continue;
    if (askedOpen(d)) { c.before++; continue; }
    c.asked++;
    const r = await fillOpenGbif(d, f);
    if ('failed' in r) { c.failed++; continue; }
    if ('none' in r) c.none++;
    else if (r.added) { c.filled++; c.photos += r.added; }
    store.write(file, d);
    progress?.(c);
  }
  return c;
}

/**
 * `--fill commons` over every dossier (round sixty-eight, fourth part): those with fewer than six photographs not asked
 * before; one an earlier fill asked is passed by.
 */
export async function fillCommonsAll(store: DossierStore, f: JsonFetcher, progress?: (c: FillCounts) => void): Promise<FillCounts> {
  const c: FillCounts = { asked: 0, filled: 0, photos: 0, none: 0, failed: 0, before: 0 };
  for (const file of store.files()) {
    const d = store.read<Pick<Dossier, 'key' | 'photos' | 'upstream'> & { name: { scientific: string } }>(file);
    if (!wantsCommons(d)) { if (askedCommons(d) && !d.photos?.length) c.before++; continue; }
    c.asked++;
    const r = await fillCommons(d, f);
    if ('failed' in r) { c.failed++; continue; }
    if ('none' in r) c.none++;
    else if (r.added) { c.filled++; c.photos += r.added; }
    store.write(file, d);
    progress?.(c);
  }
  return c;
}

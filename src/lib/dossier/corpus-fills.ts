/**
 * Round sixty-nine's corpus passes (REVIEW-TRIAGE-68 section 7), each over the dossiers on disk through a `DossierStore`,
 * each said in what it changed, and each tested with dossiers held in memory:
 *   - `--fill gbif-licence` (M1): GBIF photographs that took their record's licence;
 *   - `--fill inat-ids` (M5): iNaturalist ids that iNaturalist has made inactive;
 *   - `--fill summaries` (M3): Wikipedia summaries a redirect brought from another title;
 *   - `--list-rebuild` (M2, M4): the species to rebuild with `--keys`.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import type { DossierStore } from './corpus-run';
import * as gbif from './sources/gbif';
import { licenceTag, isOpen } from '$core/licence';
import { checkIds } from './sources/inat';
import { mwGet, mwError, summaryTitleFits, redirected } from './sources/wikimedia';

type Up = Record<string, { status: string; at?: string; detail?: string }>;
const day = (now: string) => now.slice(0, 10);

/* ---------------------------------------------------------------- --fill gbif-licence */

/** iNaturalist's hosts: its media always carry their own licence, so its photographs are never asked about. */
const INAT_HOST = /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org)\//;
/** The words the fill leaves on the GBIF media row of a dossier it has read, so a stopped fill resumes. */
export const LICENCE_CHECKED = 'each photograph\'s own licence checked';
export const licenceChecked = (d: { upstream?: Up }) => (d.upstream?.['gbif.media']?.detail ?? '').includes(LICENCE_CHECKED);

/** The GBIF photographs a dossier holds that may have taken their record's licence: GBIF's, not on iNaturalist's hosts. */
export const licenceCandidates = (d: Pick<Dossier, 'photos'>) => (d.photos ?? []).filter((p) => p.src === 'gbif' && !INAT_HOST.test(p.url));

export type LicenceFill = { kept: number; dropped: number } | { failed: string };

/**
 * One dossier's GBIF photographs, each read again from its own occurrence record (`occurrence/<key>`, the part of its id
 * before the colon, one request a record): a photograph whose media item states no licence of its own, or one that is not
 * open, is dropped, and so is one whose record or item GBIF no longer serves, since its own licence can no longer be shown
 * (rule 4). Round sixty-eight's builder took the record's licence where the item stated none (S-B6). A refusal leaves the
 * dossier as it was, to be asked again.
 */
export async function fillGbifLicence(d: Pick<Dossier, 'photos' | 'upstream'>, f: JsonFetcher, now = () => new Date().toISOString()): Promise<LicenceFill> {
  const asked = licenceCandidates(d);
  const records = new Map<string, Awaited<ReturnType<typeof gbif.occurrence>>>();
  for (const k of new Set(asked.map((p) => p.id.split(':')[0]))) {
    const r = await gbif.occurrence(f, Number(k));
    if (r.status !== 'ok' && r.status !== 'none') return { failed: r.detail };
    records.set(k, r);
  }
  const drop = new Set(asked.filter((p) => {
    const r = records.get(p.id.split(':')[0]);
    const item = r?.status === 'ok' ? (r.data.media ?? []).find((m) => m.identifier === p.url) : undefined;
    return !item || !isOpen(licenceTag(item.license));
  }));
  d.photos = (d.photos ?? []).filter((p) => !drop.has(p));
  const row = d.upstream['gbif.media'];
  const note = `${LICENCE_CHECKED} ${day(now())}${drop.size ? `: ${drop.size} without one dropped` : ''}`;
  d.upstream['gbif.media'] = row ? { ...row, detail: [row.detail, note].filter(Boolean).join('; ') } : { status: 'ok', at: now(), detail: note };
  return { kept: asked.length - drop.size, dropped: drop.size };
}

export type LicenceCounts = { dossiers: number; kept: number; dropped: number; emptied: number; before: number; failed?: string };

/** `--fill gbif-licence` over every dossier: stops at the first refusal, and a later run passes by the dossiers already read. */
export async function fillGbifLicenceAll(store: DossierStore, f: JsonFetcher, progress?: (c: LicenceCounts) => void): Promise<LicenceCounts> {
  const c: LicenceCounts = { dossiers: 0, kept: 0, dropped: 0, emptied: 0, before: 0 };
  for (const file of store.files()) {
    const d = store.read<Pick<Dossier, 'photos' | 'upstream'>>(file);
    if (!licenceCandidates(d).length) continue;
    if (licenceChecked(d)) { c.before++; continue; }
    const r = await fillGbifLicence(d, f);
    if ('failed' in r) return { ...c, failed: r.failed };
    c.dossiers++; c.kept += r.kept; c.dropped += r.dropped;
    if (!d.photos.length) c.emptied++;
    store.write(file, d);
    progress?.(c);
  }
  return c;
}

/* ---------------------------------------------------------------- --fill inat-ids */

export type InatIdCounts = { checked: number; followed: number; dropped: number; failed?: string };
type IdDossier = Pick<Dossier, 'ids' | 'links' | 'upstream'>;

/**
 * Every dossier's iNaturalist id checked with iNaturalist, thirty a request (round sixty-nine; triage-68 M5, R46-13). An
 * inactive id is followed to the one current taxon it names; one with no single successor is dropped, to be asked by
 * name. Either way the photograph sets are opened again, so `--fill inat` takes the photographs of the current taxon.
 */
export async function fillInatIds(store: DossierStore, f: JsonFetcher, now = () => new Date().toISOString()): Promise<InatIdCounts> {
  const c: InatIdCounts = { checked: 0, followed: 0, dropped: 0 };
  const held = store.files().flatMap((file) => { const d = store.read<IdDossier>(file); return d.ids?.inat ? [{ file, id: d.ids.inat }] : []; });
  for (let i = 0; i < held.length; i += 300) {
    const part = held.slice(i, i + 300);
    const r = await checkIds(f, part.map((h) => h.id));
    if (r.status !== 'ok') return { ...c, failed: 'detail' in r ? r.detail : r.status };
    for (const { file, id } of part) {
      c.checked++;
      const got = r.data.get(id);
      if (!got || got.active) continue;
      const d = store.read<IdDossier>(file);
      const was = `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''} is inactive`;
      const reopen = { status: 'skipped' as const, at: now(), detail: `the iNaturalist taxon changed (${day(now())}); ask again (--fill inat)` };
      if (got.current) {
        d.ids.inat = got.current;
        d.links.inat = `https://www.inaturalist.org/taxa/${got.current}`;
        d.upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${was}; followed to its current taxon ${got.current}` };
        c.followed++;
      } else {
        delete d.ids.inat;
        delete d.links.inat;
        d.upstream['inat.taxon'] = { status: 'skipped', at: now(), detail: `${was}, with no single current taxon; to be asked by name (--fill inat)` };
        c.dropped++;
      }
      d.upstream['inat.photos.wild'] = { ...reopen };
      d.upstream['inat.photos.cultivated'] = { ...reopen };
      store.write(file, d);
    }
  }
  return c;
}

/* ---------------------------------------------------------------- --fill summaries */

type SumDossier = Pick<Dossier, 'ids' | 'links' | 'upstream' | 'summary'> & { name: { scientific: string; synonyms: string[] } };
export type SummaryCounts = { kept: number; dropped: number; confirmed: number; unchecked: number; lines: string[] };

/**
 * Stored summaries whose title is not this species' article (round sixty-nine; triage-68 M3, R46-12): Weingartia pulchra
 * quoted Weingartia canigueralii's article, and Kopsia fruticosa the genus's. Read offline: a title that is the name or an
 * older name stands. The dossier does not keep the item's sitelink, so a title that is neither ("Saguaro") is checked
 * against the item's own English sitelink, fifty items a Wikidata request, and dropped only when it is not that; with no
 * item it is dropped. A request Wikidata does not answer, or a run with no fetcher (`--offline`), leaves those summaries
 * as they are, counted as not checked.
 */
export async function checkSummaries(store: DossierStore, f: JsonFetcher | null, now = () => new Date().toISOString()): Promise<SummaryCounts> {
  const c: SummaryCounts = { kept: 0, dropped: 0, confirmed: 0, unchecked: 0, lines: [] };
  const toConfirm: Array<{ file: string; q: string }> = [];
  for (const file of store.files()) {
    const d = store.read<SumDossier>(file);
    if (!d.summary) continue;
    if (summaryTitleFits(d.summary.title, d.name.scientific, d.name.synonyms ?? [])) { c.kept++; continue; }
    // With an item, the title may be its sitelink: asked of Wikidata, or, with no fetcher (--offline), left and counted unchecked.
    if (d.ids?.wikidata) { if (f) toConfirm.push({ file, q: d.ids.wikidata }); else c.unchecked++; }
    else drop(file, d, d.name.scientific);
  }
  for (let i = 0; i < toConfirm.length; i += 50) {
    const part = toConfirm.slice(i, i + 50);
    const r = await mwGet<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(f!, `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${[...new Set(part.map((p) => p.q))].join('|')}&props=sitelinks&sitefilter=enwiki&maxlag=5`);
    if (r.status !== 'ok' || mwError(r.data)) { c.unchecked += part.length; continue; }
    for (const { file, q } of part) {
      const d = store.read<SumDossier>(file);
      const link = r.data.entities?.[q]?.sitelinks?.enwiki?.title;
      if (link && summaryTitleFits(d.summary!.title, d.name.scientific, d.name.synonyms ?? [], link)) { c.confirmed++; continue; }
      drop(file, d, link ?? d.name.scientific);
    }
  }
  return c;
  function drop(file: string, d: SumDossier, asked: string) {
    const why = redirected(asked, d.summary!.title);
    c.lines.push(`${d.name.scientific}: ${why}`);
    d.summary = undefined;
    delete d.ids.wikipedia;
    delete d.links.wikipedia;
    d.upstream.wikipedia = { status: 'none', at: now(), detail: why };
    store.write(file, d);
    c.dropped++;
  }
}

/* ---------------------------------------------------------------- --list-rebuild */

/**
 * The species to rebuild online with `--keys` (REVIEW-TRIAGE-68 section 7, step 5), one "<key> <name>" a line with the
 * reason after a tab: each range taken under an older name (M2: the rule is now narrower), and each species whose stored
 * synonyms number exactly 50, GBIF's old single page (M4: the list was cut there).
 */
export function rebuildList(store: DossierStore): string[] {
  const out: string[] = [];
  for (const file of store.files()) {
    let d: Pick<Dossier, 'key' | 'distribution'> & { name: { scientific: string; synonyms?: string[] } };
    try { d = store.read(file); } catch { continue; }
    const why: string[] = [];
    if (/under the name |, reached by /.test(d.distribution?.source ?? '')) why.push('range taken under an older name');
    if ((d.name.synonyms?.length ?? 0) === 50) why.push('50 synonyms stored, the old single page');
    if (why.length) out.push(`${d.key} ${d.name.scientific}\t${why.join('; ')}`);
  }
  return out;
}

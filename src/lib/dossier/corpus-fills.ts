/**
 * Round sixty-nine's corpus passes (REVIEW-TRIAGE-68 section 7) and round seventy's (REVIEW-TRIAGE-69 section 6), each
 * over the dossiers on disk through a `DossierStore`, each said in what it changed, and each tested with dossiers held in
 * memory:
 *   - `--fill gbif-licence` (M1): GBIF photographs that took their record's licence;
 *   - `--fill inat-ids` (M5; round seventy, B1): iNaturalist ids that iNaturalist has made inactive, and the follows of
 *     earlier runs, read again by the build's rule;
 *   - `--fill wikidata` (round seventy, B2): the Wikidata items taken without the species' own GBIF key, proved again;
 *   - `--fill summaries` (M3): Wikipedia summaries a redirect brought from another title;
 *   - `--list-rebuild` (M2, M4; round seventy, B4 with `--bulk`): the species to rebuild with `--keys`.
 */
import type { JsonFetcher, SourceResult } from './fetch';
import type { Dossier } from './schema';
import type { DossierStore } from './corpus-run';
import type { WcvpIndex } from './bulk';
import { crossIds, mwGet, mwError, patiently, isLagged, NO_ITEM } from './sources/wikimedia';
import * as gbif from './sources/gbif';
import { licenceTag, isOpen } from '$core/licence';
import { checkIds, taxonFor, judgeIdTaxon, type InatTaxon } from './sources/inat';
import { ownNames, isOwnName } from './own-names';
import { referenceOf } from './reference';
import { heldElsewhereIn } from './corpus-run';
import { keptIds, ipniPowoDisagree } from './drops';
import { plainlyAnother } from './authors';

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

/* ---------------------------------------------------------------- --fill gbif-basis */

/** The words the fill leaves on the GBIF media row of a dossier it has read, so a stopped fill resumes. */
export const BASIS_CHECKED = "each photograph's record read for its basis";
export const basisChecked = (d: { upstream?: Up }) => (d.upstream?.['gbif.media']?.detail ?? '').includes(BASIS_CHECKED);
export type BasisCounts = { dossiers: number; kept: number; dropped: number; emptied: number; before: number; lines: string[]; failed?: string };

/**
 * `--fill gbif-basis` (round seventy-one; self-review 70 C4): each stored GBIF photograph not on iNaturalist's hosts read
 * again from its occurrence record (one request a record), and dropped unless the record is a human observation, as the
 * build now asks GBIF and as the download path always read (`bulk.ts`). The API path had asked for machine observations
 * too: Meise's herbarium scans led 18 of 100 GBIF-led tiles, an NMNH line drawing led Adenia lobata's, and two pollen
 * micrographs were Talinella grevei's only photographs. A record GBIF no longer serves is left as it is (`--fill
 * gbif-licence` reads that). A refusal stops the fill; a later run passes by the dossiers already read.
 */
export async function fillGbifBasisAll(store: DossierStore, f: JsonFetcher, now = () => new Date().toISOString(), progress?: (c: BasisCounts) => void): Promise<BasisCounts> {
  const c: BasisCounts = { dossiers: 0, kept: 0, dropped: 0, emptied: 0, before: 0, lines: [] };
  for (const file of store.files()) {
    const d = store.read<Pick<Dossier, 'key' | 'photos' | 'upstream'> & { name?: { scientific?: string } }>(file);
    const asked = licenceCandidates(d);
    if (!asked.length) continue;
    if (basisChecked(d)) { c.before++; continue; }
    const basis = new Map<string, string | undefined>();
    for (const k of new Set(asked.map((p) => p.id.split(':')[0]))) {
      const r = await gbif.occurrence(f, Number(k));
      if (r.status !== 'ok' && r.status !== 'none') return { ...c, failed: r.detail };
      basis.set(k, r.status === 'ok' ? (r.data.basisOfRecord ?? 'not stated') : undefined);
    }
    const drop = asked.filter((p) => { const b = basis.get(p.id.split(':')[0]); return b !== undefined && b !== 'HUMAN_OBSERVATION'; });
    d.photos = (d.photos ?? []).filter((p) => !drop.includes(p));
    const kinds = [...new Set(drop.map((p) => basis.get(p.id.split(':')[0])))].join(', ');
    const row = d.upstream['gbif.media'];
    const note = `${BASIS_CHECKED} ${day(now())}${drop.length ? `: ${drop.length} from records not human observations (${kinds}) dropped` : ''}`;
    d.upstream['gbif.media'] = row ? { ...row, detail: [row.detail, note].filter(Boolean).join('; ') } : { status: 'ok', at: now(), detail: note };
    store.write(file, d);
    c.dossiers++; c.kept += asked.length - drop.length; c.dropped += drop.length;
    if (drop.length) c.lines.push(`${d.name?.scientific ?? file} [${d.key}]: ${drop.length} dropped (${kinds})`);
    if (!d.photos.length) c.emptied++;
    progress?.(c);
  }
  return c;
}

/* ---------------------------------------------------------------- --fill kew-links */

export type KewLinkCounts = { read: number; changed: number; before: number; lines: string[]; failed?: string };
type LinkDossier = Pick<Dossier, 'key' | 'ids' | 'links' | 'upstream'> & { name: { scientific: string; authorship?: string; family?: string } };

/**
 * `--fill kew-links` (round seventy-one; self-review 70 S-B5, triage-70): every stored IPNI and POWO link read against
 * Kew's number for the name and author (GBIF's copy of WCVP, one request a dossier, `gbif.kewLinks`), as a build now
 * links them. Of the 594 dossiers whose two numbers disagreed, 568 linked an IPNI duplicate; five linked another
 * author's invalid or illegitimate name (Colchicum neapolitanum, Lachenalia pusilla, Ceropegia spiralis, Talinum lineare,
 * Mammillaria schiedeana) and Mammillaria magnifica's POWO was Sencke's. Each change is listed. A refusal stops the fill
 * and what it read is kept in `progress`, so a later run takes up the rest.
 */
export async function fillKewLinks(store: DossierStore, f: JsonFetcher, now = () => new Date().toISOString(), progress?: { read?: string[]; save(read: string[]): void; clear(): void }): Promise<KewLinkCounts> {
  const c: KewLinkCounts = { read: 0, changed: 0, before: 0, lines: [] };
  const done = new Set(progress?.read ?? []);
  for (const file of store.files()) {
    let d: LinkDossier;
    try { d = store.read<LinkDossier>(file); } catch { continue; }
    if (!d.ids?.ipni && !d.ids?.powo) continue;
    if (done.has(String(d.key))) { c.before++; continue; }
    const k = await gbif.kewIpni(f, d.name.scientific, d.name.authorship ?? undefined, d.name.family ?? undefined);
    if (k.status !== 'ok') { progress?.save([...done]); return { ...c, failed: k.status === 'none' ? 'none' : k.detail }; }
    c.read++;
    done.add(String(d.key));
    const l = gbif.kewLinks({ ipni: d.ids.ipni ?? undefined, powo: d.ids.powo ?? undefined }, k.data);
    if (!l.changed) continue;
    const was = `IPNI ${d.ids.ipni ?? 'none'}, POWO ${d.ids.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? 'none'}`;
    d.ids.ipni = l.ipni; d.ids.powo = l.powo;
    if (l.ipni) d.links.ipni = `https://www.ipni.org/n/${l.ipni}`; else delete d.links.ipni;
    if (l.powo) d.links.powo = `https://powo.science.kew.org/taxon/${l.powo}`; else delete d.links.powo;
    const row = d.upstream.wikidata;
    const note = `IPNI and POWO linked by Kew's number${k.data.label ? ` for ${k.data.label}` : ''}${l.ipni ? '' : ', none'} (the item's: ${was}; ${day(now())})`;
    d.upstream.wikidata = row ? { ...row, detail: [row.detail, note].filter(Boolean).join('; ') } : { status: 'ok', at: now(), detail: note };
    store.write(file, d);
    c.changed++;
    c.lines.push(`${d.name.scientific} [${d.key}]: ${was} → IPNI ${l.ipni ?? 'none'}, POWO ${l.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? 'none'}`);
  }
  progress?.clear();
  return c;
}

/* ---------------------------------------------------------------- --fill inat-ids */

export type InatIdCounts = {
  checked: number;
  followed: number;
  dropped: number;
  /** Inactive ids whose current taxon the rule refused, and earlier follows read again and refused (round seventy). */
  refused: number;
  /** Ids an earlier run followed with no check of the taxon, read again and kept. */
  kept: number;
  /** One line a dossier changed, for the run's report. */
  lines: string[];
  failed?: string;
};
type IdDossier = Pick<Dossier, 'key' | 'ids' | 'links' | 'upstream' | 'photos'> & { name: { scientific: string; family?: string; synonyms?: string[]; authorship?: string } };

/** The words of a follow made before round seventy, which read nothing of the taxon it went to: read again. */
const EARLIER_FOLLOW = /followed to its current taxon (\d+)$/;
/**
 * The words of a taxon refused by an earlier rule of round seventy: the first rule's "is not one of this species' names"
 * (the owner's first run), and the second's "is not this species: <why>" (the owner's second run: Echinocereus
 * chisoensis's 438545, Echinocereus chisosensis, and Othonna cakilefolia's 591068, Othonna cakilifolia, refused for a
 * letter). The last such refusal in the record is judged again.
 */
const EARLIER_REFUSAL = /(\d+) \([^)]*\)(?:, kept from an earlier build,)? is (?:not one of this species' names|not this species: [^]*?): not taken/g;
const lastRefusal = (detail: string) => [...detail.matchAll(EARLIER_REFUSAL)].pop();

/**
 * Every dossier's iNaturalist id checked with iNaturalist, thirty a request (round sixty-nine; triage-68 M5, R46-13).
 *
 * Round seventy (triage-69 B1, S-B1, S-B7): an inactive id is followed to the one current taxon it names only by the
 * build's rule (`judgeIdTaxon`: one of the species' own names, or a name GBIF or Kew holds as this species, or this
 * species' epithet in a genus outside the reference; never another species of the reference), and every id an earlier
 * run followed without that rule is read again by it (Pinguicula chilensis to Pinguicula antarctica, refused; Tricyrtis
 * formosana's variety, given up for the species' own taxon). A taxon an earlier rule of round seventy refused is judged
 * again, and its id given back when now taken (the owner's runs: 35 of 42, then two spelt a letter otherwise). A taxon
 * refused loses the id, its link and the iNaturalist photographs it gave, and the name is searched here, never taking the
 * refused taxon: `--fill inat` would find it again by iNaturalist's synonymy. With no taxon found, the photograph rows
 * say so and are settled, so `--fill inat` does not ask by name again. An inactive id with no single successor is
 * dropped, to be asked by name by `--fill inat`. A followed taxon that is taken opens the photograph sets for `--fill
 * inat`. Each change is a line of the report.
 *
 * A refusal of iNaturalist or GBIF stops the fill; what was written stands, and a dossier is written only once all its
 * asks have answered, so the next run takes up where this one stopped.
 */
export async function fillInatIds(store: DossierStore, f: JsonFetcher, now = () => new Date().toISOString()): Promise<InatIdCounts> {
  const c: InatIdCounts = { checked: 0, followed: 0, dropped: 0, refused: 0, kept: 0, lines: [] };
  const byName = new Map<string, number>();
  const entries: Array<{ key: number; name: string; family?: string }> = [];
  const held: Array<{ file: string; id: number; earlier: boolean; restore?: boolean }> = [];
  for (const file of store.files()) {
    const d = store.read<IdDossier>(file);
    if (d.name?.scientific) { byName.set(d.name.scientific.toLowerCase(), d.key); entries.push({ key: d.key, name: d.name.scientific, family: d.name.family }); }
    // A taxon an earlier rule of round seventy refused is judged again, and its id given back when the rule now takes it
    // (the owner's runs: Sprekelia formosissima's Zephyranthes formosissima and 34 more; Echinocereus chisosensis).
    const refusedBefore = !d.ids?.inat ? lastRefusal(d.upstream?.['inat.taxon']?.detail ?? '') : undefined;
    if (refusedBefore) { held.push({ file, id: Number(refusedBefore[1]), earlier: false, restore: true }); continue; }
    if (!d.ids?.inat) continue;
    const m = EARLIER_FOLLOW.exec(d.upstream?.['inat.taxon']?.detail ?? '');
    held.push({ file, id: d.ids.inat, earlier: !!m && Number(m[1]) === d.ids.inat });
  }
  const reference = referenceOf(entries);
  const stop = (r: { status: string; detail?: string } | { failed: string }) => ({ ...c, failed: 'failed' in r ? r.failed : (r.detail ?? r.status) });
  for (let i = 0; i < held.length; i += 300) {
    const part = held.slice(i, i + 300);
    const r = await checkIds(f, part.map((h) => h.id));
    if (r.status !== 'ok') return stop(r);
    // The current taxa the inactive ids name, read in one pass too: their names decide.
    const next = [...new Set(part.flatMap((h) => { const g = r.data.get(h.id); return g && !g.active && g.current ? [g.current] : []; }))];
    const cur = next.length ? await checkIds(f, next) : ({ status: 'ok', data: new Map() } as const);
    if (cur.status !== 'ok') return stop(cur);
    for (const { file, id, earlier, restore } of part) {
      c.checked++;
      const got = r.data.get(id);
      if (!got || (restore && !got.active)) continue;
      const d = store.read<IdDossier>(file);
      const name = d.name.scientific;
      const heldElsewhere = heldElsewhereIn(byName, d.key);
      // An active id of another name, from Wikidata or carried, is read by B5's rule; one of the species' own names by
      // what the dossier holds (`ownNames` over its stored synonyms) asks nothing (round seventy, second pass).
      const carried = got.active && !earlier && !restore;
      // A carried id checked and kept is recorded, where the record does not already say an answer (round seventy-one, F's
      // need; S-F5): 25 of 32 live pages said "iNaturalist taxon: not asked" of an id this fill had checked. A row the
      // build wrote ('ok') is left as it is, so a rerun rewrites nothing.
      const checkedKept = (what: string) => {
        if (d.upstream['inat.taxon']?.status === 'ok') return;
        d.upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''}, kept from an earlier build, checked ${day(now())}: ${what}` };
        store.write(file, d);
      };
      if (carried && (!got.name || ownNames({ scientific: name, synonyms: d.name.synonyms ?? [], heldElsewhere }).own.has(got.name.toLowerCase()))) { checkedKept(got.name ? "active and this species' own" : 'active'); continue; }
      const reopen = { status: 'skipped' as const, at: now(), detail: `the iNaturalist taxon changed (${day(now())}); ask again (--fill inat)` };
      if (!got.active && !got.current) {
        delete d.ids.inat;
        delete d.links.inat;
        d.upstream['inat.taxon'] = { status: 'skipped', at: now(), detail: `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''} is inactive, with no single current taxon; to be asked by name (--fill inat)` };
        d.upstream['inat.photos.wild'] = { ...reopen };
        d.upstream['inat.photos.cultivated'] = { ...reopen };
        store.write(file, d);
        c.dropped++;
        c.lines.push(`${name} [${d.key}]: ${id} inactive with no single current taxon; dropped, to be asked by name`);
        continue;
      }
      // The taxon to judge: the current taxon an inactive id names, or the active one (followed earlier, or carried).
      const to = got.active ? id : got.current!;
      const target = got.active ? got : cur.data.get(to);
      const st = await sameTypeOfRows(f, d.key);
      if ('failed' in st) return stop(st);
      const sameType = st.rows.map((x) => x.name);
      const owned = ownNames({ scientific: name, sameType, synonyms: st.all, heldElsewhere });
      const named = `${to}${target?.name ? ` (${target.name})` : ''}`;
      const before = d.upstream['inat.taxon']?.detail ?? '';
      // Judged as the build judges it (`judgeIdTaxon`; round seventy, the owner's run): one of the species' own names in
      // any spelling, or a name GBIF holds as this species, or this species' epithet moved to a genus outside this
      // reference, is taken; GBIF's other species of this reference is not.
      const own = target?.name && target.active !== false && isOwnName(owned, target.name);
      if (carried && own) { checkedKept("active and this species' own"); continue; }
      const g = own ? ({ status: 'ok', data: { take: true, why: `${target!.name} is one of this species' names`, to, name: target!.name } } as const) : await judgeIdTaxon(f, to, target, { key: d.key, scientific: name, authorship: d.name.authorship ?? st.authorship, family: d.name.family, own: owned, heldElsewhere, reference });
      if (g.status !== 'ok') return stop(g);
      const why = g.data.why;
      const head = carried ? `iNaturalist's taxon ${named}, kept from an earlier build, is not this species: ${why}` : `${earlier ? `${before}; read again ${day(now())}: ${named}` : `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''} is inactive; its current taxon ${named}`} is not this species: ${why}`;
      if (g.data.take) {
        const moved = g.data.to !== to || !!restore;
        if (carried && !moved) { checkedKept(`active, and taken: ${why}`); continue; }
        if (earlier && !moved) {
          d.upstream['inat.taxon'] = { ...d.upstream['inat.taxon'], detail: `${before}${target?.name ? ` (${target.name})` : ''}; read again ${day(now())}: ${why}` };
          c.kept++;
        } else {
          d.ids.inat = g.data.to;
          d.links.inat = `https://www.inaturalist.org/taxa/${g.data.to}`;
          d.upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${carried || earlier || restore ? `${before ? `${before}; ` : ''}read again ${day(now())}: ${named}` : `iNaturalist's taxon ${id}${got.name ? ` (${got.name})` : ''} is inactive; followed to its current taxon ${named}`}: ${why}${restore ? '; taken back' : ''}` };
          if (moved && !restore) d.photos = (d.photos ?? []).filter((p) => p.src !== 'inat');
          d.upstream['inat.photos.wild'] = { ...reopen };
          d.upstream['inat.photos.cultivated'] = { ...reopen };
          c.followed++;
          c.lines.push(`${name} [${d.key}]: ${restore ? `${named}, refused by an earlier rule,` : carried ? `${named}, carried,` : earlier ? `an earlier follow to ${named}` : `${id} inactive; ${named}`} taken${restore ? ' back' : moved ? ` as ${g.data.to} (${g.data.name})` : ''}: ${why}`);
        }
        store.write(file, d);
        continue;
      }
      if (restore) continue; // refused again: left as the first run left it
      // Refused: the id, its link and the photographs it gave go, and the name is asked as the build asks it, never
      // taking the refused taxon (`taxonFor`).
      const t = await taxonFor(f, { scientific: name, key: d.key, family: d.name.family, own: owned, sameType, heldElsewhere, reference, refused: new Set([to]) });
      if (t.status === 'refused' || t.status === 'error' || t.status === 'skipped') return stop(t);
      const gone = (d.photos ?? []).filter((p) => p.src === 'inat').length;
      d.photos = (d.photos ?? []).filter((p) => p.src !== 'inat');
      delete d.ids.inat;
      delete d.links.inat;
      const refusedWords = `${head}: not taken${gone ? `, and its ${gone} photograph${gone === 1 ? '' : 's'} removed` : ''} (${day(now())})`;
      if (t.status === 'ok') {
        d.ids.inat = t.data.id;
        d.links.inat = `https://www.inaturalist.org/taxa/${t.data.id}`;
        d.upstream['inat.taxon'] = { status: 'ok', at: now(), detail: `${refusedWords}; asked by name: ${t.detail ?? `${t.data.name}, ${t.data.id}`}` };
        d.upstream['inat.photos.wild'] = { ...reopen };
        d.upstream['inat.photos.cultivated'] = { ...reopen };
      } else {
        d.upstream['inat.taxon'] = { status: t.status, at: now(), detail: `${refusedWords}; asked by name: ${'detail' in t && t.detail ? t.detail : 'no iNaturalist taxon of this name'}` };
        const none = { status: 'none' as const, at: now(), detail: `no iNaturalist taxon is taken for this species (${day(now())}); see its taxon row` };
        d.upstream['inat.photos.wild'] = { ...none };
        d.upstream['inat.photos.cultivated'] = { ...none };
      }
      store.write(file, d);
      c.refused++;
      c.lines.push(`${name} [${d.key}]: ${carried ? `${named}, carried,` : earlier ? `an earlier follow to ${named}` : `${id} inactive; ${named}`} refused, ${why}${gone ? `; ${gone} iNaturalist photographs removed` : ''}; by name: ${t.status === 'ok' ? `${t.data.name}, ${t.data.id}` : t.status}`);
    }
  }
  return c;
}

/**
 * The iNaturalist taxon row `--fill inat` writes after its name search (round seventy; triage-69 S-B7): what `--fill
 * inat-ids` said of an id it dropped stays in front of the search's answer. Nepenthes putaiguneung's row was left "none"
 * with no detail, and the history of its inactive id lost.
 */
export function inatTaxonRow(was: { status: string; detail?: string } | undefined, t: SourceResult<InatTaxon>, at: string): { status: string; at: string; detail?: string } {
  const dropped = was?.status === 'skipped' && /is inactive/.test(was.detail ?? '') ? was.detail!.replace(/; to be asked by name \(--fill inat\)$/, '') : undefined;
  const said = 'detail' in t && t.detail ? t.detail : undefined;
  const answer = said ?? (t.status === 'ok' ? `${t.data.name}, ${t.data.id}` : t.status === 'none' ? 'no iNaturalist taxon of this name' : t.status);
  const detail = dropped ? `${dropped}; asked by name: ${answer}` : said;
  return { status: t.status, at, ...(detail ? { detail } : {}) };
}

/* ---------------------------------------------------------------- --fill wikidata */

export type WikidataCounts = {
  /** Items read from Wikidata, fifty a request, to see whether they carry the species' own GBIF key. */
  read: number;
  /** Of those, items that carry it: found by the key, and left as they are. */
  byKey: number;
  /** Items proved again by the round-seventy rule, the record now saying how. */
  stands: number;
  /** Species whose item the rule now refuses, replaces or finds: left as they are, and listed for a rebuild. */
  changed: number;
  /** Dossiers re-proved by an earlier run, passed by. */
  before: number;
  lines: string[];
  /** "<key> <name>\t<why>" a line, for `--keys`. */
  rebuild: string[];
  /** Every dossier whose IPNI identifier is not the number in its POWO one (`ipniPowoDisagree`; triage-69 B6, R47-5). */
  disagree: string[];
  failed?: string;
};
/** The words the fill leaves on the Wikidata row of an item it proved again, so a stopped fill resumes. */
export const REPROVED = 're-proved by --fill wikidata';
type WdDossier = Pick<Dossier, 'key' | 'ids' | 'links' | 'upstream'> & { name: { scientific: string; authorship?: string; family?: string } };
/** A Wikidata row that recorded an item refused by an earlier label rule: the item is asked for again. */
const REFUSED_BY_LABEL = /not taken: (the item labelled|two items answered to the label)/;

/**
 * Step 4 of triage-69 section 6 (round seventy; B2, S-B2, S-B3): the Wikidata items a build took without the species'
 * own GBIF key, read again by the round-seventy rule (`crossIds`: IPNI first, a contradicting GBIF record refuses, a key
 * GBIF no longer serves is no key). Which species it touches:
 *   - every dossier whose item does not carry its own GBIF key (P846), read from Wikidata fifty items a request: those
 *     found by label, by another GBIF key, or carried from a build under round sixty-eight's rules, which took the
 *     first exact label (about 620 of 8,947 species, S-B's count);
 *   - every dossier whose Wikidata row records an item refused by the label rule (Catalpa speciosa, Mammillaria
 *     grusonii, Myrica cerifera, Drosera magnifica).
 * An item the rule proves again stands: its record says how it was proved, and its POWO, IPNI and WFO identifiers are
 * read from it again. An item the rule now refuses, replaces with another or finds where there was none is not patched
 * here, because the item also gives the species' iNaturalist id, Commons category and Wikipedia title, which a build
 * derives with it: the dossier is left as it is, the change is a line of the report, and the species goes to the list
 * for `--keys`. A refusal or failure of Wikidata or GBIF stops the fill; what was written stands, and a rerun passes by
 * the dossiers already re-proved.
 */
export async function fillWikidata(store: DossierStore, f: JsonFetcher, now = () => new Date().toISOString(), progress?: WikidataProgress): Promise<WikidataCounts> {
  const c: WikidataCounts = { read: 0, byKey: 0, stands: 0, changed: 0, before: 0, lines: [], rebuild: [], disagree: [] };
  const done = new Set(progress?.read ?? []);
  const held = new Map(Object.entries(progress?.changed ?? {}));
  const save = () => progress?.save({ read: [...done], changed: Object.fromEntries(held) });
  const withItem: Array<{ file: string; q: string; key: number }> = [];
  const reprove: string[] = [];
  for (const file of store.files()) {
    let d: WdDossier;
    try { d = store.read<WdDossier>(file); } catch { continue; }
    const row = d.upstream?.wikidata;
    const disagree = ipniPowoDisagree(d.ids);
    if (disagree) c.disagree.push(`${d.name.scientific} [${d.key}]: ${disagree}`);
    if ((row?.detail ?? '').includes(REPROVED)) { c.before++; continue; }
    // A run stopped by Wikidata's lag resumes (round seventy, the owner's run): what it read stands, and what it found
    // changed is said again without asking.
    const mark = `${d.key}:${d.ids?.wikidata ?? ''}`;
    const was = held.get(mark);
    if (was) { c.changed++; c.lines.push(was.line); c.rebuild.push(was.rebuild); continue; }
    if (done.has(mark)) { c.byKey++; continue; }
    if (d.ids?.wikidata && row?.status === 'ok') withItem.push({ file, q: d.ids.wikidata, key: d.key });
    else if (!d.ids?.wikidata && REFUSED_BY_LABEL.test(row?.detail ?? '')) reprove.push(file);
  }
  for (let i = 0; i < withItem.length; i += 50) {
    const part = withItem.slice(i, i + 50);
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${[...new Set(part.map((p) => p.q))].join('|')}&props=claims&maxlag=5`;
    const r = await patiently(() => mwGet<{ entities?: Record<string, { claims?: Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>> }>; error?: unknown }>(f, url), (x) => x.status === 'ok' && isLagged(mwError(x.data)));
    if (r.status !== 'ok') return stopped({ ...c, failed: 'detail' in r ? r.detail : r.status });
    const err = mwError(r.data);
    if (err) return stopped({ ...c, failed: `wikidata ${err}` });
    for (const p of part) {
      c.read++;
      const keys = (r.data.entities?.[p.q]?.claims?.P846 ?? []).map((x) => Number(x.mainsnak?.datavalue?.value));
      if (keys.includes(p.key)) { c.byKey++; done.add(`${p.key}:${p.q}`); }
      else reprove.push(p.file);
    }
  }
  for (const file of reprove) {
    const d = store.read<WdDossier>(file);
    const st = await sameTypeOfRows(f, d.key);
    if ('failed' in st) return stopped({ ...c, failed: st.failed });
    const x = await patiently(() => crossIds(f, d.name.scientific, d.key, st.rows, { authorship: d.name.authorship, family: d.name.family }), (y) => y.status === 'error' && y.by !== 'gbif' && isLagged(y.detail));
    if (x.status === 'refused' || x.status === 'error' || x.status === 'skipped') return stopped({ ...c, failed: `${x.by === 'gbif' ? 'GBIF, checking an item' : 'Wikidata'}: ${x.detail}` });
    const was = d.ids.wikidata;
    const got = x.status === 'ok' ? x.data.wikidata : undefined;
    if (x.status === 'ok' && x.data.wikidata === was) {
      d.ids.powo = x.data.powo; d.ids.ipni = x.data.ipni; d.ids.wfo = x.data.wfo;
      for (const [k, v, url] of [['powo', x.data.powo, 'https://powo.science.kew.org/taxon/'], ['ipni', x.data.ipni, 'https://www.ipni.org/n/'], ['wfo', x.data.wfo, 'https://www.worldfloraonline.org/taxon/']] as const) {
        if (v) d.links[k] = `${url}${v}`;
        else delete d.links[k];
      }
      d.upstream.wikidata = { status: 'ok', at: now(), detail: `${x.detail ?? 'found by its GBIF key'}; ${REPROVED} ${day(now())}` };
      store.write(file, d);
      c.stands++;
      continue;
    }
    if (!got && !was) continue; // still no item: nothing changed
    c.changed++;
    const now_ = got ? `${got} (${x.detail ?? 'found by its GBIF key'})` : `no item (${x.status}: ${'detail' in x && x.detail ? x.detail : NO_ITEM})`;
    const line = `${d.name.scientific} [${d.key}]: ${was ?? 'no item'} → ${now_}`;
    const rebuild = `${d.key} ${d.name.scientific}\tWikidata item ${was ?? 'none'} → ${got ?? 'none'}`;
    c.lines.push(line);
    c.rebuild.push(rebuild);
    held.set(`${d.key}:${was ?? ''}`, { line, rebuild });
  }
  progress?.clear();
  return c;

  /** A fill that stops keeps what it read, so the next run resumes there. */
  function stopped(x: WikidataCounts): WikidataCounts {
    save();
    return x;
  }
}

/** What a stopped `--fill wikidata` had read: items that carry their own key ("key:Q"), and the changes it had found. */
export interface WikidataProgress {
  read?: string[];
  changed?: Record<string, { line: string; rebuild: string }>;
  save(p: { read: string[]; changed: Record<string, { line: string; rebuild: string }> }): void;
  clear(): void;
}


/**
 * What the script says when the names file it is given is not there (round seventy, the owner's run): rebuild-wd.txt is
 * written only by a `--fill wikidata` that ran to the end, and its absence said nothing but the usage line.
 */
export function keysMissing(file: string): string {
  const by = /rebuild-wd\.txt$/.test(file) ? ', which --fill wikidata writes when it runs to the end with species to rebuild: run it (again) first' : /rebuild-keys\.txt$/.test(file) ? ', which --list-rebuild writes: run it first' : '';
  return `${file} is not there${by}. Nothing was built.`;
}

/** The same-type older names of a species from GBIF, as the build passes them to `crossIds`, and all its synonyms (`ownNames`). */
async function sameTypeOfRows(f: JsonFetcher, key: number): Promise<{ rows: Array<{ key: number; name: string }>; all: gbif.SynonymRow[]; authorship?: string } | { failed: string }> {
  const sp = await gbif.species(f, key);
  if (sp.status !== 'ok' && sp.status !== 'none') return { failed: `GBIF: ${sp.detail}` };
  const syn = await gbif.synonyms(f, key);
  if (syn.status !== 'ok' && syn.status !== 'none') return { failed: `GBIF: ${syn.detail}` };
  // The backbone's author too, for the slip rule (`slipStanding`: GBIF's same name by the same author spelt otherwise is this species'; round seventy-one merge).
  const authorship = sp.status === 'ok' ? (sp.data.authorship ?? undefined) : undefined;
  if (syn.status !== 'ok' || syn.truncated) return { rows: [], all: [], authorship };
  const all = syn.rows ?? [];
  return { rows: gbif.sameTypeNames({ key, basionymKey: sp.status === 'ok' ? sp.data.basionymKey : undefined }, all).map((r) => ({ key: r.key, name: r.name })), all, authorship };
}

/* ---------------------------------------------------------------- --list-rebuild --bulk: Kew's rows by author */

/**
 * The species whose Kew entry the round-seventy rule reads differently (triage-69 B4, S-B4, S-B5, step 4), from Kew's own
 * files: a row of the species' words by another author was taken (Ceropegia macrocarpa (Sprenger) Bruyns took "Ceropegia
 * macrocarpa J.N.Haage & E.Schmidt", and its lack of a range), or Kew holds the species under another spelling of its
 * epithet (Cyphostemma congoensis as C. congoense). A range feeds the records tested against it and the habitat
 * climate, which only a build reads again with the climate grid, so these species are rebuilt, never patched.
 */
export function kewRebuildList(store: DossierStore, wcvp: Pick<WcvpIndex, 'accepted' | 'legacyAccepted'> & Partial<Pick<WcvpIndex, 'distributions' | 'ownRows'>>): string[] {
  const out: string[] = [];
  const id = (e: ReturnType<WcvpIndex['accepted']>) => (e === 'ambiguous' ? 'ambiguous' : e ? `${e.name} ${e.authors ?? ''}`.trim() : 'none');
  for (const file of store.files()) {
    let d: RangeDossier;
    try { d = store.read(file); } catch { continue; }
    if (!d.name?.authorship) continue;
    const before = id(wcvp.legacyAccepted(d.name.scientific, d.name.authorship));
    const after = id(wcvp.accepted(d.name.scientific, d.name.authorship, d.name.family));
    if (before !== after) { out.push(`${d.key} ${d.name.scientific}\tKew's entry for ${d.name.scientific} ${d.name.authorship} was ${before}, is now ${after}`); continue; }
    // A species on a homonym key (round seventy-one; S-B2): an orphan key (no synonym stored) whose author is plainly not
    // Kew's one accepted entry for the words; a rebuild asks GBIF whether it holds the words by Kew's author elsewhere,
    // and if so cites Kew's author and reads GBIF's names by it (`kewName`). Some listed are Kew citing an author
    // otherwise ("St.Hil.", "A.St.-Hil."), which the rebuild leaves as they are.
    const own = wcvp.ownRows?.(d.name.scientific, d.name.authorship, d.name.family).rows ?? [];
    if (!d.name.synonyms?.length && own.length === 1 && own[0].status === 'Accepted' && plainlyAnother(d.name.authorship, own[0].authors)) { out.push(`${d.key} ${d.name.scientific}\ton a homonym key: the backbone's ${d.name.authorship} is not Kew's ${own[0].authors}`); continue; }
    // The page as stored against the rule as it reads Kew's files now (round seventy-one; S-B8: Ixora coccinea was read
    // the same way by both rules, wrongly, and its page was never listed). Only a range Kew's files answer is compared.
    if (!d.distribution) continue;
    const got = wcvp.distributions?.(d.name.scientific, d.name.authorship, d.name.family);
    if (!got || got === 'ambiguous') continue;
    const now = nativeCodes(got.rows), stored = storedCodes(d);
    if (now !== stored) out.push(`${d.key} ${d.name.scientific}\tthe stored native range is not Kew's for ${after} (${stored || 'none'} stored, ${now || 'none'} now)`);
  }
  return out;
}

type RangeDossier = Pick<Dossier, 'key'> & { name: { scientific: string; authorship?: string; family?: string; synonyms?: string[] }; distribution?: { native?: Array<{ code?: string }>; source?: string }; upstream?: Up };
/** The native regions of Kew's rows, as codes in order: what a build would store. */
const nativeCodes = (rows: ReadonlyArray<{ locationId?: string; establishmentMeans?: string }>) => [...new Set(rows.filter((r) => r.establishmentMeans === 'NATIVE').map((r) => /([A-Z]{3})$/.exec(r.locationId ?? '')?.[1] ?? '?'))].sort().join(',');
/** The native regions a dossier stores, as codes in order. */
const storedCodes = (d: RangeDossier) => [...new Set((d.distribution?.native ?? []).map((x) => x.code ?? '?'))].sort().join(',');

export type RangeSourceCounts = { said: number; before: number; differs: string[] };

/**
 * `--fill range-source --bulk <dir>` (round seventy-one; self-review 70 S-B4, triage-70): a range Kew gives through the
 * species' own row filed under an entry of another name now says so ("Kew holds Ceropegia mixta (Masson) Bruyns as a
 * synonym of Orbea variegata (L.) Haw.; the range is Orbea variegata's"), where the stored range is the one Kew's files
 * give, so no rebuild is needed: about 480 pages, five of them showing another reference species' range. A stored range
 * that is not Kew's now is left and listed (`--list-rebuild` lists it too). Offline: Kew's files only.
 */
export function fillRangeSource(store: DossierStore, wcvp: Pick<WcvpIndex, 'distributions'>): RangeSourceCounts {
  const c: RangeSourceCounts = { said: 0, before: 0, differs: [] };
  for (const file of store.files()) {
    let d: RangeDossier;
    try { d = store.read(file); } catch { continue; }
    if (!d.name?.authorship || !d.distribution) continue;
    const got = wcvp.distributions(d.name.scientific, d.name.authorship, d.name.family);
    if (!got || got === 'ambiguous' || !got.synonymOf) continue;
    const source = `WCVP (Govaerts, RBG Kew): ${gbif.synonymOfWords(got.synonymOf)}`;
    if (d.distribution.source === source) { c.before++; continue; }
    if (nativeCodes(got.rows) !== storedCodes(d)) { c.differs.push(`${d.key} ${d.name.scientific}\tits stored native range is not that of Kew's ${got.synonymOf.entry}: rebuild`); continue; }
    d.distribution.source = source;
    const row = d.upstream?.['wcvp.distribution'];
    if (row) d.upstream!['wcvp.distribution'] = { ...row, detail: `${gbif.synonymOfWords(got.synonymOf)}${got.rows.length ? '' : ', with no native range'}` };
    store.write(file, d);
    c.said++;
  }
  return c;
}

/* ---------------------------------------------------------------- --fill summaries: `./summary-fill.ts` (round seventy, moved) */
export * from './summary-fill';

/* ---------------------------------------------------------------- --list-rebuild */

/**
 * The species to rebuild online with `--keys` (REVIEW-TRIAGE-68 section 7, step 5), one "<key> <name>" a line with the
 * reason after a tab: each range taken under an older name (M2: the rule is now narrower), each species whose stored
 * synonyms number exactly 50, GBIF's old single page (M4: the list was cut there), and (round seventy, S-B7) each whose
 * kept identifiers name no build. With Kew's files, `kewRebuildList` adds those whose Kew entry the author rule reads
 * differently.
 */
export function rebuildList(store: DossierStore): string[] {
  const out: string[] = [];
  for (const file of store.files()) {
    let d: Pick<Dossier, 'key' | 'distribution'> & { name: { scientific: string; synonyms?: string[] }; upstream?: Record<string, { status?: string; detail?: string }> };
    try { d = store.read(file); } catch { continue; }
    const why: string[] = [];
    if (/under the name |, reached by /.test(d.distribution?.source ?? '')) why.push('range taken under an older name');
    if ((d.name.synonyms?.length ?? 0) === 50) why.push('50 synonyms stored, the old single page');
    // Identifiers kept through a Wikidata that did not answer, in round sixty-eight's words, which name no build: the
    // next build cannot tell their age, so it carries nothing (round seventy; triage-69 S-B7, Mammillaria gigantea).
    if (keptIds(d.upstream?.wikidata) && !/identifiers of the build of \d{4}-\d{2}-\d{2} are kept/.test(d.upstream?.wikidata?.detail ?? '')) why.push('identifiers kept from a build the record does not name');
    if (why.length) out.push(`${d.key} ${d.name.scientific}\t${why.join('; ')}`);
  }
  return out;
}

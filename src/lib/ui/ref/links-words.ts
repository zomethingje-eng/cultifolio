/**
 * The words and figures of the links agent's three species-page sections (round eighty-seven, stage 2): flowering by month
 * (`Flowering.svelte`), the other registers and the first publication (`Elsewhere.svelte`), a hybrid's parents
 * (`Parents.svelte`). Pure, so each rule is tested without a page.
 */
import type { Dossier, Flowering, Elsewhere, Parents, Cites } from '$dossier/schema';
import { notAskedWords } from './source-words';
import { FEW_RECORDS, FEW_CELLS } from '$core/few-records';
import { MON3 } from '$core/months';
import { yearRain } from '$climate/year-rain';
import { floweringSearchUrl } from '$dossier/flowering-terms';
import { elsewhereLinks, type ElsewhereLink } from '$dossier/elsewhere-links';
import { bhlAsk } from '$dossier/bhl';
import type { PageId } from '$core/page-id';

/* ---------- Flowering ---------- */

export type FloweringView =
  | { state: 'not-asked'; why: string }
  | { state: 'not-checked'; why: string; read: string }
  | {
      state: 'read';
      /** January first: the month's three letters, its count, and its share of the busiest month (0 to 1). */
      months: Array<{ m: string; n: number; share: number }>;
      total: number;
      read: string;
      /** Under `FEW_RECORDS` observations: marked "from few records", shown as read (`$core/few-records`). */
      few: boolean;
      /** Where the habitat climate is read south of the equator: the strip keeps the calendar months, and says so. */
      south: boolean;
      href: string;
    };

/** Whether the habitat climate is read south of the equator: its records' side, else its typical cell's. */
export function habitatSouth(c: Dossier['climate'] | null | undefined): boolean {
  if (!c || c.status !== 'ok') return false;
  return c.hemispheres ? c.hemispheres.used === 'south' : c.at.lat < 0;
}

/**
 * The strip: "not asked" until the fill reads the page (and why: no taxon, or not yet asked), "not checked" when it was
 * asked and iNaturalist did not answer, else the twelve counts. The months are the calendar's, as observed: never moved
 * to the reader's hemisphere, since an observation is dated where the plant was seen (the climate chart keeps the
 * habitat's months for the same reason).
 */
export function floweringView(d: { ids: { inat?: number }; flowering?: Flowering; climate?: Dossier['climate'] }): FloweringView {
  const f = d.flowering;
  if (typeof d.ids.inat !== 'number') return { state: 'not-asked', why: 'this page has no iNaturalist taxon to ask' };
  if (!f || f.taxon !== d.ids.inat) return { state: 'not-asked', why: 'iNaturalist has not been asked for this page yet' };
  if (!f.months) return { state: 'not-checked', why: f.unanswered ?? 'iNaturalist did not answer', read: f.read };
  const max = Math.max(...f.months);
  const total = f.months.reduce((a, n) => a + n, 0);
  return {
    state: 'read',
    months: f.months.map((n, i) => ({ m: MON3[i], n, share: max ? n / max : 0 })),
    total,
    read: f.read,
    few: total < FEW_RECORDS,
    south: habitatSouth(d.climate),
    href: floweringSearchUrl(f.taxon)
  };
}

/** The strip's caption, its source and day. */
export const floweringCaption = (read: string) => `Flowering observations of wild plants, iNaturalist, read ${read}`;

/** Whose months the strip shows. */
export const floweringMonthsWords = (south: boolean) =>
  `Calendar months, as each plant was observed; not moved to your hemisphere${south ? '. The habitat lies south of the equator, where these months fall in the other season' : ''}.`;

/** The few-records mark, as the climate's says it: the count and the line. */
export const floweringFew = (total: number) => `From few records: ${total} observation${total === 1 ? '' : 's'}; a page says so under ${FEW_RECORDS}, and shows the counts as read.`;

/* ---------- Elsewhere and the first publication ---------- */

export type ElsewhereView = {
  links: ElsewhereLink[];
  /** What the line says of Wikidata: read (the item and day), not checked, or not asked (and why). */
  wikidata: { state: 'read'; item: string; read: string } | { state: 'not-checked'; item: string; read: string; why: string } | { state: 'not-asked'; why: string };
  published: null | { text: string; file?: string; bhl?: string };
};

/** Kew's citation as Kew writes it: the place, its volume and page as given, and the year. */
export const citationText = (p: NonNullable<Elsewhere['published']>) => `${p.place.trim()}${p.volPage ? (/^[\s:,]/.test(p.volPage) ? p.volPage : ` ${p.volPage}`) : ''}${p.year ? ` ${p.year.trim()}` : ''}`.replace(/\s+/g, ' ').trim();

/** Species+'s link in Elsewhere, Wikidata's P2040: the CITES species database. */
const SPECIES_PLUS = 'P2040';

export function elsewhereView(d: { ids: { wikidata?: string }; links: Record<string, string>; elsewhere?: Elsewhere; cites?: Cites | null }): ElsewhereView {
  const w = d.elsewhere?.wikidata;
  const item = d.ids.wikidata;
  const wikidata: ElsewhereView['wikidata'] = !item
    ? { state: 'not-asked', why: 'this page has no Wikidata item' }
    : !w || w.item !== item
      ? { state: 'not-asked', why: `Wikidata's item ${item} has not been read for them yet` }
      : w.unanswered
        ? { state: 'not-checked', item, read: w.read, why: w.unanswered }
        : { state: 'read', item, read: w.read };
  // Species+ "(CITES)" is left out while the CITES line says "not asked" (the review of stage 2's pages, 7): beside a table
  // never read, a link named for CITES read as a listing. The same signal as the CITES line's own (`notAskedWords`: no
  // CITES field, or one the build skipped); IUCN's link stays, as the risk line does not name it.
  const citesUnchecked = notAskedWords(d.cites) !== null;
  const links = wikidata.state === 'read' ? elsewhereLinks(w, d.links).filter((l) => !(citesUnchecked && l.p === SPECIES_PLUS)) : [];
  const p = d.elsewhere?.published;
  // BHL's page only where BHL answered one page for exactly this citation (`bhl.ts`); a citation changed since is not linked.
  const bhl = p?.bhl?.page != null && !('not' in bhlAsk(p)) ? `https://www.biodiversitylibrary.org/page/${p.bhl.page}` : undefined;
  return { links, wikidata, published: p ? { text: citationText(p), ...(p.file ? { file: p.file } : {}), ...(bhl ? { bhl } : {}) } : null };
}

/* ---------- A hybrid's parents ---------- */

/** One parent's habitat figures, each with its source, read from the parent's own dossier at render. */
export type ParentFigures = {
  /** The coldest month's mean nightly low and the warmest month's mean daily high, °C (CHELSA's normals). */
  coldLow: number | null;
  warmHigh: number | null;
  /** The year's rain, mm, and whether it is the median of the cells' totals or the monthly medians added. */
  rainMm: number | null;
  rainCells: boolean;
  /** The lowest night in the daily series, °C, over `years` (NASA POWER), where the page shows one. */
  recordLow: number | null;
  years: number | null;
  /** The sources as the parent's page names them, and the day its climate was derived. */
  normals: string | null;
  extremes: string | null;
  day: string | null;
  /** Read from few records (`$core/few-records`): marked as the parent's own page marks it. */
  few: boolean;
  /** Why there are no figures: the parent's page has no habitat climate (its words). */
  none?: string;
};
export type ParentPage = { key: PageId; slug: string; name: string; figures: ParentFigures };

const DAY = /\d{4}-\d{2}-\d{2}/;

/** A source's short name and years: "CHELSA V2.1 1981–2010", "NASA POWER (MERRA-2) daily 1981–2024". */
const shortSource = (s: string | undefined) => (s ? s.split(/ climatology|, cell /)[0].trim() : null);

/** What the Parents section reads of a parent's dossier (the server reads the dossier; this keeps only these figures). */
export function parentPage(d: Pick<Dossier, 'key' | 'slug' | 'name' | 'climate' | 'upstream'>): ParentPage {
  const c = d.climate;
  const base = { key: d.key, slug: d.slug, name: d.name.scientific };
  if (c.status !== 'ok') return { ...base, figures: { coldLow: null, warmHigh: null, rainMm: null, rainCells: false, recordLow: null, years: null, normals: null, extremes: null, day: null, few: false, none: c.status === 'pending' ? 'its habitat climate is not read yet' : 'its page has no habitat climate' } };
  const yr = yearRain(c.months, c.annualRain);
  return {
    ...base,
    figures: {
      coldLow: Math.min(...c.months.map((m) => m.tmin)),
      warmHigh: Math.max(...c.months.map((m) => m.tmax)),
      rainMm: yr.mm,
      rainCells: yr.cells,
      recordLow: c.extremes ? c.extremes.minAbs : null,
      years: c.extremes ? c.extremes.years : null,
      normals: shortSource(c.src.normals),
      extremes: c.extremes ? shortSource(c.src.extremes) : null,
      day: DAY.exec(d.upstream?.climate?.at ?? '')?.[0] ?? null,
      few: c.records < FEW_RECORDS || c.cells < FEW_CELLS
    }
  };
}

/** The pages the section needs read: each parent linked to a page here, once, in Kew's order. */
export const parentKeys = (p: Parents | null | undefined): PageId[] => [...new Set((p?.of ?? []).flatMap((x) => (x.page ? [x.page] : [])))];

/** One parent's line: its name, its page (where read), and why it has none. */
export type ParentRow = { name: string; page: ParentPage | null; why: string | null };

export function parentRows(p: Parents, pages: Readonly<Record<string, ParentPage | null | undefined>>): ParentRow[] {
  return p.of.map((x) => {
    const page = x.page ? pages[x.page] ?? null : null;
    const why = x.page ? (page ? null : 'not checked: its page could not be read just now') : x.why ?? (x.entry ? `Kew's entry ${x.entry} has no page in this reference` : 'not matched');
    return { name: x.name, page, why };
  });
}

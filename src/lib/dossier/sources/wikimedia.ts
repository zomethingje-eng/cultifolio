import type { JsonFetcher, FetchResult } from '../fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { Photo } from '../schema';

/* ---------- Wikidata (CC0): cross-identifiers ---------- */

export interface CrossIds {
  wikidata: string;
  powo?: string;
  ipni?: string;
  inat?: number;
  gbif?: number;
  wfo?: string;
  commonsCategory?: string;
  enTitle?: string;
}

const P = { gbif: 'P846', powo: 'P5037', ipni: 'P961', inat: 'P3151', wfo: 'P7715', commonsCat: 'P373' };

/** MediaWiki answers HTTP 200 with an error body (maxlag, bad params); treat that as the source not answering, never as "none". */
function mwError(data: unknown): string | null {
  const e = (data as { error?: { code?: string; info?: string } })?.error;
  return e ? `${e.code ?? 'error'}: ${e.info ?? ''}`.trim() : null;
}

/**
 * The Wikidata item for a GBIF taxon key, found by the key itself (P846), so
 * the identity can never be another species' from a name search. A name is
 * only used when the key finds nothing, and then only on an exact label match.
 */
export async function crossIds(f: JsonFetcher, scientificName: string, gbifKey?: number): Promise<FetchResult<CrossIds>> {
  let id: string | undefined;
  if (gbifKey) {
    const q = await f<{ query?: { search?: Array<{ title: string }> }; error?: unknown }>(
      `https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(`haswbstatement:P846=${gbifKey}`)}&maxlag=5`
    );
    if (q.status !== 'ok') return q;
    const err = mwError(q.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const hits = q.data.query?.search ?? [];
    if (hits.length === 1) id = hits[0].title;
  }
  if (!id) {
    const s = await f<{ search?: Array<{ id: string; label: string; description?: string }>; error?: unknown }>(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(scientificName)}&maxlag=5`
    );
    if (s.status !== 'ok') return s;
    const err = mwError(s.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const hit = (s.data.search ?? []).find((x) => x.label.toLowerCase() === scientificName.toLowerCase());
    if (!hit) return { status: 'none' };
    id = hit.id;
  }
  const e = await f<{ entities: Record<string, { claims: Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>>; sitelinks?: Record<string, { title: string }> }>; error?: unknown }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${id}&props=claims|sitelinks&sitefilter=enwiki&maxlag=5`
  );
  if (e.status !== 'ok') return e;
  const err = mwError(e.data);
  if (err) return { status: 'error', detail: `wikidata ${err}` };
  const ent = e.data.entities?.[id];
  if (!ent) return { status: 'none' };
  const str = (p: string) => {
    const v = ent.claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
    return typeof v === 'string' ? v : undefined;
  };
  const inatS = str(P.inat);
  const gbifS = str(P.gbif);
  // Found by name: the item must carry this GBIF key, or it is not this species.
  if (gbifKey && gbifS && Number(gbifS) !== gbifKey) return { status: 'none' };
  return {
    status: 'ok',
    data: {
      wikidata: id,
      powo: str(P.powo),
      ipni: str(P.ipni),
      wfo: str(P.wfo),
      inat: inatS ? Number(inatS) : undefined,
      gbif: gbifS ? Number(gbifS) : undefined,
      commonsCategory: str(P.commonsCat),
      enTitle: ent.sitelinks?.enwiki?.title
    }
  };
}

/* ---------- Wikipedia (CC BY-SA): the lead paragraph, kept segregated ---------- */

export async function summary(f: JsonFetcher, title: string): Promise<FetchResult<{ text: string; url: string; title: string }>> {
  const r = await f<{ extract?: string; content_urls?: { desktop?: { page?: string } }; title?: string; type?: string }>(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  );
  if (r.status !== 'ok') return r;
  if (r.data.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return { status: 'none' };
  if (typeof r.data.type === 'string' && /error/i.test(r.data.type)) return { status: 'error', detail: `wikipedia ${r.data.type}` };
  if (!r.data.extract || r.data.type === 'disambiguation') return { status: 'none' };
  return { status: 'ok', data: { text: r.data.extract.slice(0, 1500), url: r.data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, title: r.data.title ?? title } };
}

/* ---------- Wikimedia Commons: per-file licence via extmetadata ---------- */

interface ImageInfo {
  url: string;
  thumburl?: string;
  width?: number;
  height?: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value: string }>;
}

export async function commonsPhotos(f: JsonFetcher, category: string, max = 12): Promise<FetchResult<Photo[]>> {
  const r = await f<{ query?: { pages?: Record<string, { title: string; imageinfo?: ImageInfo[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + category)}&gcmtype=file&gcmlimit=${max * 2}` +
      `&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800&iiextmetadatafilter=LicenseShortName|Artist|Credit|LicenseUrl|Attribution&maxlag=5`
  );
  if (r.status !== 'ok') return r;
  const err = mwError(r.data);
  if (err) return { status: 'error', detail: `commons ${err}` };
  const pages = Object.values(r.data.query?.pages ?? {});
  const out: Photo[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/\.(jpe?g|png|webp)$/i.test(ii.url)) continue;
    const meta = ii.extmetadata ?? {};
    const lic = meta.LicenseShortName?.value ?? '';
    const tag = licenceTag(lic.replace(/^Public domain$/i, 'cc0').replace(/^PD.*$/i, 'cc0'));
    if (!isOpen(tag) || (tag !== 'cc0' && tag !== 'by' && tag !== 'by-sa')) continue;
    const artist = (meta.Artist?.value ?? meta.Credit?.value ?? '').replace(/<[^>]+>/g, '').trim();
    out.push({
      src: 'commons',
      id: p.title,
      url: ii.url,
      thumb: ii.thumburl ?? ii.url,
      width: ii.width ?? undefined,
      height: ii.height ?? undefined,
      licence: tag,
      attribution: `${artist || 'Wikimedia Commons'}, ${lic}, via Wikimedia Commons`,
      page: ii.descriptionurl ?? undefined
    });
    if (out.length >= max) break;
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

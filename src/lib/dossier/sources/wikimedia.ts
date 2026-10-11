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

const P = { gbif: 'P846', powo: 'P5037', ipni: 'P961', inat: 'P3151', wfo: 'P7715', commonsCat: 'P373', basionym: 'P566' };

/** MediaWiki answers HTTP 200 with an error body (maxlag, bad params); treat that as the source not answering, never as "none". */
function mwError(data: unknown): string | null {
  const e = (data as { error?: { code?: string; info?: string } })?.error;
  return e ? `${e.code ?? 'error'}: ${e.info ?? ''}`.trim() : null;
}

/**
 * How long to wait before asking again, in seconds; a test makes it instant. MediaWiki answers a busy moment with HTTP 200
 * and `maxlag`, "Waiting for wdqs1011: 9.2 seconds lagged.", asking a client to come back when the replicas have caught
 * up. Taken as the source not answering, it failed Wikidata for 141 of the 156 species of round sixty-seven's online
 * rebuild, and with it the iNaturalist taxon it names, so the rebuild found no photographs for 113 (round sixty-eight).
 */
export const mwWait = {
  sleep: (s: number) => new Promise<void>((r) => setTimeout(r, s * 1000)),
  /** Asks of one call. One in the Worker, whose tail builds answer a visitor and cannot sit through a lag; the corpus
   *  script sets `MAXLAG_TRIES`. */
  tries: 1
};
/** The corpus script's asks of one call: the first and four more, each after the lag it names and a second, 5 to 30 s. */
export const MAXLAG_TRIES = 5;
async function mwGet<T>(f: JsonFetcher, url: string): Promise<FetchResult<T>> {
  for (let i = 0; ; i++) {
    const r = await f<T>(url);
    if (r.status !== 'ok') return r;
    const e = (r.data as { error?: { code?: string; info?: string } })?.error;
    if (e?.code !== 'maxlag' || i >= mwWait.tries - 1) return r;
    const lag = Number(/([\d.]+) seconds? lagged/.exec(e.info ?? '')?.[1] ?? 5);
    await mwWait.sleep(Math.min(30, Math.max(5, Math.ceil(lag) + 1)));
  }
}

/**
 * The Wikidata item for a GBIF taxon key, found by the key itself (P846), so
 * the identity can never be another species' from a name search. A name is
 * only used when the key finds nothing, and then only on an exact label match.
 */
export async function crossIds(f: JsonFetcher, scientificName: string, gbifKey?: number, olderKeys: readonly number[] = []): Promise<FetchResult<CrossIds>> {
  let id: string | undefined;
  let via: string | undefined;
  if (gbifKey) {
    const q = await mwGet<{ query?: { search?: Array<{ title: string }> }; error?: unknown }>(f, 
      `https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(`haswbstatement:P846=${gbifKey}`)}&maxlag=5`
    );
    if (q.status !== 'ok') return q;
    const err = mwError(q.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const hits = q.data.query?.search ?? [];
    if (hits.length === 1) id = hits[0].title;
  }
  if (!id) {
    const s = await mwGet<{ search?: Array<{ id: string; label: string; description?: string }>; error?: unknown }>(f, 
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=5&search=${encodeURIComponent(scientificName)}&maxlag=5`
    );
    if (s.status !== 'ok') return s;
    const err = mwError(s.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const hit = (s.data.search ?? []).find((x) => x.label.toLowerCase() === scientificName.toLowerCase());
    if (hit) id = hit.id;
  }
  // Wikidata files the species under an older name with the same type (Q310510, Ferocactus glaucescens, for Bisnaga
  // glaucescens): found by the GBIF record of that name, in one search, and taken only when one item answers (round
  // sixty-eight, third part). Two items that are not one the other's basionym is no answer.
  const older = olderKeys.slice(0, 10);
  if (!id && older.length) {
    const q = await mwGet<{ query?: { search?: Array<{ title: string }> }; error?: unknown }>(f,
      `https://www.wikidata.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=${encodeURIComponent(`haswbstatement:${older.map((k) => `P846=${k}`).join('|')}`)}&maxlag=5`
    );
    if (q.status !== 'ok') return q;
    const err = mwError(q.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const hits = q.data.query?.search ?? [];
    let ids = hits.map((h) => h.title);
    if (ids.length > 1) {
      // Wikidata often keeps the basionym as an item of its own (Q14943671, Echinocactus glaucescens), which the item for
      // the current placement names as its basionym (P566). An item another answer names so is that answer's older name,
      // not a second species: it is set aside, and what is left must still be one item.
      const b = await mwGet<{ entities?: Record<string, { claims?: Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>> }>; error?: unknown }>(f,
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${ids.join('|')}&props=claims&maxlag=5`
      );
      if (b.status !== 'ok') return b;
      const berr = mwError(b.data);
      if (berr) return { status: 'error', detail: `wikidata ${berr}` };
      const named = new Set(ids.flatMap((q) => (b.data.entities?.[q]?.claims?.[P.basionym] ?? []).map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)));
      ids = ids.filter((q) => !named.has(q));
    }
    if (ids.length === 1) { id = ids[0]; via = 'found by the GBIF record of an older name with the same type'; }
  }
  if (!id) return { status: 'none' };
  const e = await mwGet<{ entities: Record<string, { claims: Record<string, Array<{ mainsnak: { datavalue?: { value: unknown } } }>>; sitelinks?: Record<string, { title: string }> }>; error?: unknown }>(f, 
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
  // Found by name: the item must carry this GBIF key, or it is not this species; found by an older name, that name's key.
  if (gbifKey && gbifS && Number(gbifS) !== gbifKey && !(via && older.includes(Number(gbifS)))) return { status: 'none' };
  return {
    status: 'ok',
    ...(via ? { detail: via } : {}),
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
  const r = await mwGet<{ query?: { pages?: Record<string, { title: string; imageinfo?: ImageInfo[] }> } }>(f, 
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
    if (!artist && tag !== 'cc0') continue; // CC BY and CC BY-SA require the author's name; a file without one is not published (round sixteen, 3)
    out.push({
      src: 'commons',
      id: p.title,
      url: ii.url,
      thumb: ii.thumburl ?? ii.url,
      width: ii.width ?? undefined,
      height: ii.height ?? undefined,
      licence: tag,
      attribution: `${artist || 'author not stated'}, ${lic}, via Wikimedia Commons`,
      page: ii.descriptionurl ?? undefined
    });
    if (out.length >= max) break;
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

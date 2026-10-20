/**
 * The build's batched sources (round seventy-eight, agent B; docs/SCALE-STUDY.md 3.3): Wikidata and Wikipedia asked for
 * many species a request, ahead of the species that need them, and each answer held under the exact address the builder
 * asks for one species. The builder's code is unchanged: `crossIds`, the summary and its proof ask what they asked
 * before, and the held answer is what that request would have answered. A request the batch did not cover goes through
 * to the source, one species at a time, as before.
 *
 *   - **Wikidata, the item by GBIF key.** The builder's first question is a search, `haswbstatement:P846=<key>`, two hits at
 *     most, and it takes the item only when exactly one answers. Here one SPARQL query asks it for `SPARQL_KEYS` keys,
 *     with statements of every rank (the search counts a deprecated statement as well: Q651038 for key 1761), and the
 *     search's answer is held as the items found, two at most, as the search gives them.
 *   - **Wikidata, the item.** `wbgetentities` for one item, claims and the English sitelink, is the same entity JSON read
 *     fifty items a request (`ENTITY_IDS`), as `--fill wikidata` already reads it.
 *   - **Wikipedia, the summary.** The REST summary of one title is answered from the Action API's TextExtracts, twenty
 *     titles a request (`EXTRACT_TITLES`, TextExtracts' own limit for a lead), redirects followed as the REST API follows
 *     them, a disambiguation page said as one. The extract is the lead's first paragraph (`restExtract`), the shape the
 *     REST API gives; where the two differ, the batch's is the text, and the comparison of round seventy-eight says how
 *     (docs/review-78/fix-b.md). The licence and the attribution are the article's, as before: CC BY-SA 4.0 and its
 *     address, which the page links (rule 4).
 *
 * Rule 2: a batch that does not answer is held as that failure for every species in it, so each says "not checked"
 * (refused or failed), never "none", and the builder keeps what the previous build had, as for any source that did not
 * answer. A page Wikipedia does not hold is "none" only because the batch answered so (`missing`), as a 404 is.
 * Rule 3: nothing is matched here; each held answer is the source's own answer to the builder's own question.
 * Rule 6: the answers are held in memory for the chunk of species being built, and dropped after it.
 *
 * A species the list gives by name alone has its GBIF name match asked by the batches (the builder's own first request,
 * held for it, so asked once either way), so that its item too is asked in the batch.
 */
import type { JsonFetcher, FetchOptions, FetchResult } from './fetch';

/** Species a chunk asks the batches for, just before they are built: about 25 MB of held answers at most. */
export const BATCH_CHUNK = 500;
/** Keys a SPARQL query asks for: its address stays near 3 kB, inside every server's limit for a GET. */
export const SPARQL_KEYS = 200;
/**
 * Species a query by Kew's identifiers asks for (round seventy-nine): each is two quoted identifiers, so fifty keep the
 * address near 5 kB; two hundred (about 20 kB) were answered 503 by Wikidata's front end, measured 2026-10-20.
 */
export const KEW_SPARQL_SPECIES = 50;
/** Items a `wbgetentities` request reads: the API's limit for an anonymous client. */
export const ENTITY_IDS = 50;
/** Titles a TextExtracts request reads: the API's limit for a lead (`exintro`). */
export const EXTRACT_TITLES = 20;

const WDQS = 'https://query.wikidata.org/sparql';
const WD_API = 'https://www.wikidata.org/w/api.php';
const WP_API = 'https://en.wikipedia.org/w/api.php';

/** The builder's question for the item by GBIF key (`crossIds`): the exact address. */
export const p846SearchUrl = (gbifKey: number) => `${WD_API}?action=query&format=json&list=search&srlimit=2&srsearch=${encodeURIComponent(`haswbstatement:P846=${gbifKey}`)}`;
/** The builder's read of one item (`entityOf`, and `speciesItems` for one item): the exact address. */
export const entityUrl = (id: string) => `${WD_API}?action=wbgetentities&format=json&ids=${id}&props=claims|sitelinks&sitefilter=enwiki`;
/** The builder's question for a title's summary (`summary`): the exact address. */
export const summaryUrl = (title: string) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** The builder's GBIF name match for a species listed by name (`gbif.matchName`): the exact address. */
export const matchUrl = (name: string) => `https://api.gbif.org/v1/species/match?strict=false&name=${encodeURIComponent(name)}`;
/** The SPARQL query for the items carrying each GBIF key, any rank. */
export const p846Query = (keys: readonly number[]) => `SELECT ?k ?item WHERE { VALUES ?k { ${keys.map((k) => `"${k}"`).join(' ')} } ?item p:P846 ?st . ?st ps:P846 ?k . }`;
export const sparqlUrl = (keys: readonly number[]) => `${WDQS}?format=json&query=${encodeURIComponent(p846Query(keys))}`;

/**
 * Kew's identifiers of a species without a GBIF key (round seventy-nine; `build-kew.ts`): its IPNI identifier (Kew's
 * `ipni_id`, which Wikidata's P961 carries bare) and its POWO identifier (Kew's `powo_id`, which P5037 carries as
 * `urn:lsid:ipni.org:names:<id>`). Either may be absent.
 */
export type KewIds = { ipni?: string; powo?: string };
const powoUrn = (id: string) => `urn:lsid:ipni.org:names:${id}`;
/** Kew's identifiers are digits, a hyphen and a digit; anything else is not asked. */
const kewId = (s?: string) => !!s && /^[0-9]+-[0-9]+$/.test(s);
/**
 * The items carrying each species' IPNI identifier (P961) or POWO identifier (P5037), statements of any rank, by the
 * species' pair. A side Kew does not give is "-", which no statement carries: an unbound value (UNDEF) would match every
 * statement of the property.
 */
export const kewItemsQuery = (ids: readonly KewIds[]) => `SELECT ?v ?u ?item WHERE { VALUES (?v ?u) { ${ids.map((k) => `("${kewId(k.ipni) ? k.ipni : '-'}" "${kewId(k.powo) ? powoUrn(k.powo!) : '-'}")`).join(' ')} } { ?item p:P961 ?st . ?st ps:P961 ?v . } UNION { ?item p:P5037 ?st . ?st ps:P5037 ?u . } }`;
/** The builder's question for one species' item by Kew's identifiers: the exact address, which a batch answers for many. */
export const kewItemUrl = (k: KewIds) => `${WDQS}?format=json&query=${encodeURIComponent(kewItemsQuery([k]))}`;
/** Whether a pair has an identifier a query can carry. */
export const kewAskable = (k: KewIds) => kewId(k.ipni) || kewId(k.powo);
type KewItemAnswer = { results?: { bindings?: Array<{ v?: { value?: string }; u?: { value?: string }; item?: { value?: string } }> } };
/** The items one species' answer names, once each, in the order given. */
export const kewItemsOf = (k: KewIds, r: KewItemAnswer): string[] => {
  const out: string[] = [];
  for (const b of r.results?.bindings ?? []) {
    const q = /\/(Q\d+)$/.exec(b.item?.value ?? '')?.[1];
    const mine = (b.v?.value != null && b.v.value === k.ipni) || (b.u?.value != null && !!k.powo && b.u.value === powoUrn(k.powo));
    if (q && mine && !out.includes(q)) out.push(q);
  }
  return out;
};
export const entitiesUrl = (ids: readonly string[]) => `${WD_API}?action=wbgetentities&format=json&ids=${ids.join('|')}&props=claims|sitelinks&sitefilter=enwiki`;
export const extractsUrl = (titles: readonly string[]) => `${WP_API}?action=query&format=json&formatversion=2&prop=extracts|pageprops&ppprop=disambiguation&exintro=1&explaintext=1&exlimit=${EXTRACT_TITLES}&redirects=1&titles=${titles.map((t) => encodeURIComponent(t)).join('|')}`;

type SparqlAnswer = { results?: { bindings?: Array<{ k?: { value?: string }; item?: { value?: string } }> } };
type Entity = { id?: string; missing?: string; claims?: unknown; sitelinks?: Record<string, { title: string }> };
type EntitiesAnswer = { entities?: Record<string, Entity>; error?: { code?: string; info?: string } };
type ExtractsAnswer = {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string; tofragment?: string }>;
    pages?: Array<{ title: string; missing?: boolean; invalid?: boolean; extract?: string; pageprops?: { disambiguation?: string } }>;
  };
  continue?: unknown;
  error?: { code?: string; info?: string };
};

/** A MediaWiki error in an HTTP 200 (a lag, a bad parameter), as the builder's `mwError` reads it. */
const mwError = (d: unknown) => {
  const e = (d as { error?: { code?: string; info?: string } } | null)?.error;
  return e ? `${e.code ?? 'error'}: ${e.info ?? ''}`.trim() : null;
};

/** A batch that did not answer, as each species' own request would have said it (rule 2: not checked, never none). */
function failed(r: FetchResult<unknown>, what: string): FetchResult<never> {
  if (r.status === 'refused') return { status: 'refused', detail: `${r.detail} (batched: ${what})` };
  if (r.status === 'skipped') return { status: 'skipped', detail: r.detail };
  const why = r.status === 'ok' ? mwError(r.data) ?? 'no answer' : r.status === 'none' ? 'no answer' : r.detail;
  return { status: 'error', detail: `${why} (batched: ${what})` };
}

/**
 * The summary's extract from TextExtracts' plain-text lead: its first paragraph with text, as the REST summary takes it,
 * with the brackets TextExtracts leaves where it took out a pronunciation closed up ("Aloe vera () is …", "The papaya
 * (US: ) is …"). Unlike the REST summary, a bracket with words in it is kept: "Heptapleurum actinophyllum (formerly
 * Schefflera actinophylla) is a tree", "Tarragon (Artemisia dracunculus), also known as estragon", as the article
 * writes them. Round seventy-eight's live comparison of 50 species found the two texts the same but for those brackets
 * (6 of 50) and a trailing line break (1); the article's own words are what the page quotes (`/about/how`).
 */
export function restExtract(lead: string): string {
  const para = lead.split('\n').map((p) => p.trim()).find((p) => p.length > 0) ?? '';
  // A bracket left with nothing but labels and separators once its pronunciation was taken out ("(US: )", "(; Greek)").
  const emptied = (inner: string) => /^\s*listen\s*$/i.test(inner) || inner.replace(/\b(?:[A-Z][A-Za-z]{0,11}|listen|pronounced)\s*:/g, '').replace(/[\s,;:]/g, '') === '';
  return para
    .replace(/\s*\(([^()]*)\)/g, (m, inner: string) => (emptied(inner) ? '' : m))
    .replace(/\(\s*[;,]\s*/g, '(')
    .replace(/\s*[;,]\s*\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** A title's article address as the REST API writes it in `content_urls`. */
export const articleUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%28/g, '(').replace(/%29/g, ')')}`;

/** What one species of a chunk is: its GBIF key when the list gives one, and its name (the title asked when no item gives another). */
export interface BatchJob {
  key?: number;
  name: string;
  /**
   * A species without a GBIF key (round seventy-nine): Kew's identifiers, by which its item is asked (`kewItemUrl`). Its
   * name is never sent to GBIF's name match: the list gives it no GBIF key, and none is guessed (rule 3).
   */
  kew?: KewIds;
}

export interface BatchStats {
  sparql: number;
  /** Queries for the items of species without a GBIF key, by Kew's identifiers (round seventy-nine). */
  kewSparql?: number;
  entities: number;
  extracts: number;
  /** Per-species answers held from the batches, and served to the builder. */
  held: number;
  served: number;
}

/**
 * The held answers and the fetcher that serves them. `prefetch` asks the batches for a chunk of species and holds their
 * answers, dropping the last chunk's; the fetcher answers a held address and passes every other through to `net`.
 */
export function batchSources(net: JsonFetcher, opts: { wikidata?: boolean; wikipedia?: boolean } = {}) {
  const held = new Map<string, FetchResult<unknown>>();
  const stats: BatchStats = { sparql: 0, entities: 0, extracts: 0, held: 0, served: 0 };
  const hold = (url: string, r: FetchResult<unknown>) => {
    held.set(url, r);
    stats.held++;
  };

  /** The items carrying each key, any rank: the search's answer, two at most, held by key. */
  async function items(keys: readonly number[]): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>();
    for (let i = 0; i < keys.length; i += SPARQL_KEYS) {
      const part = keys.slice(i, i + SPARQL_KEYS);
      stats.sparql++;
      const r = await net<SparqlAnswer>(sparqlUrl(part), { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
      if (r.status !== 'ok' || !Array.isArray(r.data?.results?.bindings)) {
        const no = failed(r.status === 'ok' ? { status: 'error', detail: 'no results in the answer' } : r, `Wikidata's query service, ${part.length} GBIF keys`);
        for (const k of part) hold(p846SearchUrl(k), no);
        continue;
      }
      const by = new Map<number, string[]>(part.map((k) => [k, []]));
      for (const b of r.data.results!.bindings!) {
        const k = Number(b.k?.value);
        const q = /\/(Q\d+)$/.exec(b.item?.value ?? '')?.[1];
        const list = by.get(k);
        if (list && q && !list.includes(q)) list.push(q);
      }
      for (const [k, qs] of by) {
        out.set(k, qs);
        // The search's answer: its hits, two at most (`srlimit=2`); the builder takes the item only when one answers.
        hold(p846SearchUrl(k), { status: 'ok', data: { batchcomplete: '', query: { search: qs.slice(0, 2).map((title) => ({ ns: 0, title })) } } });
      }
    }
    return out;
  }

  /**
   * The items of species without a GBIF key, by Kew's identifiers (round seventy-nine), `KEW_SPARQL_SPECIES` a query:
   * each species' answer held under its own question's address (`kewItemUrl`), its bindings only, as that question
   * would have been answered. A query that did not answer is held as that failure for each of its species (rule 2).
   */
  async function kewItems(asks: readonly KewIds[]): Promise<Map<KewIds, string[]>> {
    const out = new Map<KewIds, string[]>();
    for (let i = 0; i < asks.length; i += KEW_SPARQL_SPECIES) {
      const part = asks.slice(i, i + KEW_SPARQL_SPECIES);
      stats.kewSparql = (stats.kewSparql ?? 0) + 1;
      const r = await net<KewItemAnswer>(`${WDQS}?format=json&query=${encodeURIComponent(kewItemsQuery(part))}`, { timeoutMs: 60_000, headers: { accept: 'application/sparql-results+json' } });
      if (r.status !== 'ok' || !Array.isArray(r.data?.results?.bindings)) {
        const no = failed(r.status === 'ok' ? { status: 'error', detail: 'no results in the answer' } : r, `Wikidata's query service, ${part.length} species by Kew's identifiers`);
        for (const k of part) hold(kewItemUrl(k), no);
        continue;
      }
      for (const k of part) {
        const qs = kewItemsOf(k, r.data);
        out.set(k, qs);
        const mine = r.data.results!.bindings!.filter((b) => qs.includes(/\/(Q\d+)$/.exec(b.item?.value ?? '')?.[1] ?? '') && ((b.v?.value != null && b.v.value === k.ipni) || (b.u?.value != null && !!k.powo && b.u.value === powoUrn(k.powo))));
        hold(kewItemUrl(k), { status: 'ok', data: { head: { vars: ['v', 'u', 'item'] }, results: { bindings: mine } } });
      }
    }
    return out;
  }

  /** Each item's entity, fifty a request, held under the one-item address; the English sitelink returned by id. */
  async function entities(ids: readonly string[]): Promise<Map<string, string | undefined>> {
    const sitelinks = new Map<string, string | undefined>();
    const all = [...new Set(ids)];
    for (let i = 0; i < all.length; i += ENTITY_IDS) {
      const part = all.slice(i, i + ENTITY_IDS);
      stats.entities++;
      const r = await net<EntitiesAnswer>(entitiesUrl(part));
      const err = r.status === 'ok' ? mwError(r.data) : null;
      if (r.status !== 'ok' || err || !r.data.entities) {
        const no = failed(r.status === 'ok' ? { status: 'error', detail: err ?? 'no entities in the answer' } : r, `Wikidata, ${part.length} items`);
        for (const q of part) hold(entityUrl(q), no);
        continue;
      }
      for (const q of part) {
        const e = r.data.entities[q];
        // An item the batch does not return is not held: its own request is asked.
        if (!e) continue;
        hold(entityUrl(q), { status: 'ok', data: { entities: { [q]: e }, success: 1 } });
        sitelinks.set(q, 'missing' in e ? undefined : e.sitelinks?.enwiki?.title);
      }
    }
    return sitelinks;
  }

  /** Each title's summary as the REST API answers it, twenty titles a request. */
  async function summaries(titles: readonly string[]): Promise<void> {
    const all = [...new Set(titles.filter((t) => t.trim()))];
    for (let i = 0; i < all.length; i += EXTRACT_TITLES) {
      const part = all.slice(i, i + EXTRACT_TITLES);
      stats.extracts++;
      const r = await net<ExtractsAnswer>(extractsUrl(part));
      const err = r.status === 'ok' ? mwError(r.data) : null;
      if (r.status !== 'ok' || err || !Array.isArray(r.data.query?.pages)) {
        const no = failed(r.status === 'ok' ? { status: 'error', detail: err ?? 'no pages in the answer' } : r, `Wikipedia, ${part.length} titles`);
        for (const t of part) hold(summaryUrl(t), no);
        continue;
      }
      const q = r.data.query!;
      const norm = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
      const redir = new Map((q.redirects ?? []).map((n) => [n.from, n.to]));
      const pages = new Map(q.pages!.map((p) => [p.title, p]));
      // An answer cut short by TextExtracts (`continue`) holds only the pages that came with their extract.
      const cut = r.data.continue != null;
      for (const t of part) {
        const n = norm.get(t) ?? t;
        const to = redir.get(n) ?? n;
        const p = pages.get(to);
        if (!p || p.invalid) continue;
        if (p.missing) {
          hold(summaryUrl(t), { status: 'none' });
          continue;
        }
        if (p.extract == null && cut) continue;
        const disambiguation = p.pageprops?.disambiguation != null;
        hold(summaryUrl(t), {
          status: 'ok',
          data: { type: disambiguation ? 'disambiguation' : 'standard', title: p.title, extract: restExtract(p.extract ?? ''), content_urls: { desktop: { page: articleUrl(p.title) } } }
        });
      }
    }
  }

  return {
    stats,
    /**
     * The batches for a chunk of species: the items by GBIF key, their entities, then the summaries of the titles the
     * builder will ask (the item's English sitelink where one item answers, else the name). Drops the last chunk's answers.
     */
    async prefetch(jobs: readonly BatchJob[]): Promise<void> {
      held.clear();
      const titles = new Map<BatchJob, string>(jobs.map((j) => [j, j.name]));
      // A species listed by name alone: its GBIF key is the builder's first question, GBIF's name match, asked here
      // instead and its answer held for the builder, so it is asked once either way; a synonym's key is the one the
      // match accepts, as the builder follows it. A match that did not answer is not held: the builder asks it again.
      const keyOf = new Map<BatchJob, number>();
      for (const j of jobs) {
        if (j.key) { keyOf.set(j, j.key); continue; }
        if (opts.wikidata === false || j.kew) continue;
        const url = matchUrl(j.name);
        const r = await net<{ usageKey?: number; acceptedUsageKey?: number; matchType?: string; canonicalName?: string; synonym?: boolean; status?: string }>(url);
        if (r.status === 'ok' || r.status === 'none') hold(url, r);
        if (r.status !== 'ok' || !r.data.usageKey || r.data.matchType === 'NONE' || r.data.matchType === 'HIGHERRANK') continue;
        const synonym = r.data.synonym || /SYNONYM/.test(r.data.status ?? '');
        keyOf.set(j, synonym && r.data.acceptedUsageKey ? r.data.acceptedUsageKey : r.data.usageKey);
        if (r.data.canonicalName && !synonym) titles.set(j, r.data.canonicalName);
      }
      if (opts.wikidata !== false) {
        const keys = [...new Set(keyOf.values())];
        const byKey = keys.length ? await items(keys) : new Map<number, string[]>();
        const one = [...byKey.values()].filter((qs) => qs.length === 1).map((qs) => qs[0]);
        const links = one.length ? await entities(one) : new Map<string, string | undefined>();
        for (const j of jobs) {
          const k = keyOf.get(j);
          const qs = k ? byKey.get(k) : undefined;
          const t = qs?.length === 1 ? links.get(qs[0]) : undefined;
          if (t) titles.set(j, t);
        }
        // The species without a GBIF key, by Kew's identifiers (round seventy-nine): the same entities and titles after.
        const kewJobs = jobs.filter((j) => !j.key && j.kew && kewAskable(j.kew));
        if (kewJobs.length) {
          const byKew = await kewItems(kewJobs.map((j) => j.kew!));
          const oneK = [...byKew.values()].filter((qs) => qs.length === 1).map((qs) => qs[0]);
          const linksK = oneK.length ? await entities(oneK) : new Map<string, string | undefined>();
          for (const j of kewJobs) {
            const qs = byKew.get(j.kew!);
            const t = qs?.length === 1 ? linksK.get(qs[0]) : undefined;
            if (t) titles.set(j, t);
          }
        }
      }
      if (opts.wikipedia !== false) await summaries([...titles.values()]);
    },
    fetcher: (async <T = unknown>(url: string, o?: FetchOptions): Promise<FetchResult<T>> => {
      const h = held.get(url);
      if (h) {
        stats.served++;
        return h as FetchResult<T>;
      }
      return net<T>(url, o);
    }) as JsonFetcher,
    /** For tests: the held answer of an address. */
    heldAt: (url: string) => held.get(url)
  };
}

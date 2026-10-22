/**
 * Round eighty, agent I: the batched cultivated sets against each page's own search. For pages a proof fill filled through
 * `inat-batch.ts`, each taxon's own v1 search (`cultivatedUrl`, per_page 12) is asked again and read by `inat.photos`, and
 * its photographs compared with the page's. Usage (from a proof folder): npx tsx scripts/dev/scale/r80i-batch-proof.ts
 * <dossier dir> <n pages> <out.json>. One request every 2 s (fetch.ts's pace).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeFetcher } from '../../../src/lib/dossier/fetch';
import * as inat from '../../../src/lib/dossier/sources/inat';

const [dir, nArg, out] = process.argv.slice(2);
const f = makeFetcher();
type P = { key: string; ids: { inat?: number }; photos: Array<{ src: string; captive?: boolean; id: string }>; upstream: Record<string, { status: string; detail?: string }> };
const pages = readdirSync(dir).filter((x) => /^[kg]\d+\.json$/.test(x)).map((x) => JSON.parse(readFileSync(`${dir}/${x}`, 'utf8')) as P)
  .filter((d) => d.ids.inat && /filled/.test(d.upstream['inat.photos.cultivated']?.detail ?? ''));
const ok = pages.filter((d) => d.upstream['inat.photos.cultivated'].status === 'ok'), none = pages.filter((d) => d.upstream['inat.photos.cultivated'].status === 'none');
const n = Number(nArg);
const pick = [...ok.slice(0, Math.ceil(n * 0.7)), ...none.slice(0, Math.floor(n * 0.3))];
const rows: Array<{ key: string; taxon: number; page: string[]; own: string[]; same: boolean; overlap: number }> = [];
for (const d of pick) {
  const r = await inat.photos(f, d.ids.inat!, false, 12, { key: d.key as never });
  if (r.status !== 'ok' && r.status !== 'none') { console.log(`${d.key}: ${r.status}`); continue; }
  const own = r.status === 'ok' ? r.data.map((p) => p.id).sort() : [];
  const page = d.photos.filter((p) => p.src === 'inat' && p.captive).map((p) => p.id).sort();
  const overlap = own.filter((x) => page.includes(x)).length;
  rows.push({ key: d.key, taxon: d.ids.inat!, page, own, same: JSON.stringify(own) === JSON.stringify(page), overlap });
}
const same = rows.filter((r) => r.same).length;
writeFileSync(out, JSON.stringify({ asked: rows.length, same, rows }, null, 1));
console.log(`${rows.length} pages: ${same} the same photographs as their own search; the rest share ${rows.filter((r) => !r.same).map((r) => `${r.overlap} of ${Math.max(r.own.length, r.page.length)}`).join(', ') || 'nothing to compare'}`);

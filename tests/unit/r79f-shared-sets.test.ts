/**
 * Round seventy-nine (F): a photograph's `shared` list, the other pages that hold it, is a set. On the owner's run of
 * round seventy-eight's corpus step, the review said Melia azedarach and Eucalyptus robusta differed from the backup
 * "apart from their ids". Their dossiers hold ten photographs that a third page, Brachychiton discolor, holds too, each
 * marked `shared` with the other two pages. The rekey kept each list in GBIF's order, mapped to ids; the index then sorts
 * the lists by id (`byId`), and where ids sort otherwise than the GBIF keys, it rewrote the two dossiers with the same
 * pages in another order. That order was part of the substance fingerprint, so the index stamped both changed today, and
 * the review, which keeps the day, saw a day that was not the backup's.
 *
 * Now: the fingerprint reads `shared` as a set, so the order moves no page's day; the rekey writes the lists in the
 * index's order and the index does not rewrite a list of the same pages; and the review compares `shared` as a set of
 * GBIF keys instead of leaving it out, so a photograph shared with a page more or fewer is a difference it states.
 *
 * On the base: the builder case FAILED (the two dossiers rewritten, "2 dossiers marked anew", stamped 2026-10-20, and the
 * review said "2 dossiers differ"); the fingerprint and mark cases FAILED (another hash; `markShared` true); the review's
 * set case FAILED (the base left `shared` out, so a page more was "0 dossiers differ").
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { substanceHash, restamp } from '$dossier/changed';
import { markShared } from '$dossier/photo-kind';
import { facts, withoutIds } from '../../scripts/corpus-step.mjs';
import type { PageId } from '$core/page-id';

const ROOT = resolve('.');
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const template = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k2735933.json', 'utf8'));

const photo = (n: number, shared?: number[]) => ({ ...template.photos[0], id: String(n), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${n}/large.jpg`, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${n}/medium.jpg`, page: `https://www.inaturalist.org/observations/${n}`, ...(shared ? { shared } : {}) });
/** The three pages as round seventy-seven's corpus held them (version 2): one photograph of their own, one all three hold. */
const PAGES: Array<[number, string, string]> = [
  [3176743, 'Eucalyptus robusta', '73814'],
  [5914287, 'Melia azedarach', '2505106'],
  // On the owner's run the three pages' ids sorted otherwise than their GBIF keys (the copy of the corpus here gives
  // Brachychiton discolor k2681196, which sorts as its key does, so the dry run here met no reorder). Its entry is made the
  // smallest so the ids sort as they did there: Melia's [3176743, 7426033] becomes, by id, [k1, k73814].
  [7426033, 'Brachychiton discolor', '1']
];
function v2(key: number, scientific: string, entry: string) {
  const d = JSON.parse(JSON.stringify(template));
  d.v = 2; d.key = key; d.slug = scientific.toLowerCase().replace(/ /g, '-');
  d.ids = { ...d.ids, gbif: key };
  d.name = { ...d.name, scientific, genus: scientific.split(' ')[0], kew: { entry, synonyms: [], acceptedElsewhere: [], file: '2026-06-04' } };
  d.photos = [photo(key), photo(77, PAGES.map(([k]) => k).filter((k) => k !== key))];
  d.changed = { on: '2026-10-16', h: substanceHash(d, sha1) };
  return d;
}

describe('the corpus step across the change of ids, on the two pages of the owner\'s run', () => {
  it('rewrites neither, keeps each page\'s day, and the review says 0 dossiers differ', () => {
    const dir = mkdtempSync(join(tmpdir(), 'r79f-shared-'));
    const v2dir = join(dir, 'static/s/v2'), v3 = join(dir, 'static/s/v3');
    mkdirSync(v2dir, { recursive: true });
    for (const [k, n, e] of PAGES) writeFileSync(join(v2dir, `${k}.json`), JSON.stringify(v2(k, n, e)));
    const r = builder(dir, '--rekey');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("page ids: 3 by Kew's plant_name_id, 0 by GBIF's key");
    expect(r.stdout).toContain("3 photographs on 3 pages are held by another species' page too");
    expect(r.stdout).not.toContain('marked anew');
    const read = (f: string) => JSON.parse(readFileSync(join(v3, f), 'utf8'));
    expect(read('k2505106.json').photos[1].shared).toEqual(['k1', 'k73814']);
    expect(read('k73814.json').photos[1].shared).toEqual(['k1', 'k2505106']);
    for (const f of ['k73814.json', 'k2505106.json', 'k1.json']) expect(read(f).changed.on).toBe('2026-10-16');
    expect(facts(dir, 'before0000000000', 'static/s/v2')).toContain('3 species; 0 dossiers differ from the backup of corpus before0000000000 apart from their ids;');
    // guard: a second --index writes nothing
    const md5 = () => readdirSync(v3).filter((f) => f.endsWith('.json')).sort().map((f) => readFileSync(join(v3, f), 'utf8'));
    const first = md5();
    const again = builder(dir, '--index');
    expect(again.status, again.stderr).toBe(0);
    expect(md5()).toEqual(first);
  }, 120_000);
});

describe('the order of a `shared` list is no change of the page', () => {
  const d = (shared: PageId[]) => ({ ...JSON.parse(JSON.stringify(template)), key: 'k2505106', photos: [photo(77, shared as unknown as number[])] });
  it('the fingerprint reads it as a set, so the index does not restamp a page whose list came in another order', () => {
    const a = d(['k1', 'k73814']), b = d(['k73814', 'k1']);
    expect(substanceHash(b)).toBe(substanceHash(a));
    expect(restamp({ ...b, changed: { on: '2026-10-16', h: substanceHash(a) } }, '2026-10-20')).toBeNull();
    // guard: a page more is a change, and moves the day
    expect(substanceHash(d(['k1', 'k73814', 'k9']))).not.toBe(substanceHash(a));
    expect(restamp({ ...d(['k1', 'k73814', 'k9']), changed: { on: '2026-10-16', h: substanceHash(a) } }, '2026-10-20')).toMatchObject({ on: '2026-10-20' });
  });
  it('guard: a list in the index\'s order hashes as it always did, so no stored fingerprint moves', () => {
    // The fingerprints r79base gives a list sorted by id, version 2's list sorted by GBIF key, and the fixture's page.
    expect(substanceHash(d(['k1', 'k73814']))).toBe('5e3c871f38b42818');
    expect(substanceHash({ ...d([]), photos: [photo(77, [3176743, 7426033])] })).toBe('de0ec6ff06cc1a1c');
    expect(substanceHash({ ...d([]), photos: [photo(77, [7426033, 3176743])] })).toBe('de0ec6ff06cc1a1c');
    expect(substanceHash(template)).toBe('a798b53af78786e8');
  });
  it('the index\'s mark of the same pages in another order is no rewrite; a page more or fewer is', () => {
    const ph = [photo(77, ['k73814', 'k1'] as unknown as number[])] as unknown as Parameters<typeof markShared>[0];
    const marks = new Map([[`inat:77`, ['k1', 'k73814'] as PageId[]]]);
    expect(markShared(ph, marks)).toBe(false);
    expect(markShared(ph, new Map([[`inat:77`, ['k1', 'k73814', 'k9'] as PageId[]]]))).toBe(true);
    expect(ph[0].shared).toEqual(['k1', 'k73814', 'k9']);
  });
});

describe('the review compares `shared` as a set of GBIF keys', () => {
  function corpus(v3shared: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'r79f-review-'));
    mkdirSync(join(dir, 'static/s/v2'), { recursive: true });
    mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
    const back = { v: 2, key: 5914287, ids: { gbif: 5914287 }, name: { scientific: 'Melia azedarach' }, photos: [{ id: '77', shared: [3176743, 7426033] }], changed: { on: '2026-10-16', h: 'aa' } };
    const page = (key: string, gbif: number, name: string) => ({ v: 3, key, ids: { gbif }, name: { scientific: name }, photos: [], changed: { on: '2026-10-16', h: 'cc' } });
    writeFileSync(join(dir, 'static/s/v2/5914287.json'), JSON.stringify(back));
    writeFileSync(join(dir, 'static/s/v2/3176743.json'), JSON.stringify({ ...page('', 3176743, 'Eucalyptus robusta'), v: 2, key: 3176743 }));
    writeFileSync(join(dir, 'static/s/v2/7426033.json'), JSON.stringify({ ...page('', 7426033, 'Brachychiton discolor'), v: 2, key: 7426033 }));
    writeFileSync(join(dir, 'static/s/v3/k2505106.json'), JSON.stringify({ ...back, v: 3, key: 'k2505106', photos: [{ id: '77', shared: v3shared }], changed: { on: '2026-10-16', h: 'bb' } }));
    writeFileSync(join(dir, 'static/s/v3/k73814.json'), JSON.stringify(page('k73814', 3176743, 'Eucalyptus robusta')));
    writeFileSync(join(dir, 'static/s/v3/k1.json'), JSON.stringify(page('k1', 7426033, 'Brachychiton discolor')));
    writeFileSync(join(dir, 'static/s/v3/manifest.json'), JSON.stringify({ id: 'v3corpus' }));
    writeFileSync(join(dir, 'static/s/v3/index.json'), '[{},{},{}]');
    return facts(dir, 'before0000000000', 'static/s/v2');
  }
  it('the same pages in another order are the same page', () => {
    expect(corpus(['k1', 'k73814'])).toContain('0 dossiers differ from the backup of corpus before0000000000 apart from their ids');
  });
  it('a photograph shared with a page more, or with another page, differs, and is named', () => {
    expect(corpus(['k1', 'k73814', 'g42'])).toContain('1 dossier differs from the backup of corpus before0000000000 apart from their ids (k2505106)');
    expect(corpus(['k1'])).toContain('1 dossier differs from the backup of corpus before0000000000 apart from their ids (k2505106)');
  });
  it('version 3 within itself: the same pages in another order are no difference either', () => {
    expect(JSON.stringify(withoutIds({ photos: [{ shared: ['k73814', 'k1'] }] }, new Map([['k1', 7426033], ['k73814', 3176743]])))).toBe(JSON.stringify(withoutIds({ photos: [{ shared: [7426033, 3176743] }] })));
  });
});

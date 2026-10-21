/**
 * A dev tool (round eighty, agent X): applies round eighty's rules of `scripts/select-species-lib.ts` to a species list
 * already written, in place, as `scripts/select-species.ts` applies them when it writes one, without asking any source
 * again. Each line it changes is said, and the list's header says what was done.
 *
 *   npx tsx scripts/dev/r80x-list-rules.ts --held <reference dir>                       a species without a GBIF key that a
 *        reference page holds through its range is left out (`heldThroughRange`); the reference is the corpus the list
 *        was made from (its header names it: static/s/v2, corpus a98be27f26a097fe)
 *   npx tsx scripts/dev/r80x-list-rules.ts --authors <wcvp_names.csv> <simple.txt.gz>    a key Kew's file reads, by GBIF's
 *        author, as another species' name is not taken (`gbifKeyFor` with Kew's file), for every line whose key the list
 *        chose by the name (not a reference page's own key)
 *
 * [--list scripts/species-list.txt]
 */
import { readFileSync, readdirSync, existsSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { parseSpeciesList, heldThroughRange, gbifKeyFor, kewLoader, backboneLine, words, REASON_REFERENCE, type BackboneName, type ReferencePage } from '../select-species-lib';

const args = process.argv.slice(2);
const arg = (n: string, i = 1) => { const k = args.indexOf(n); return k >= 0 ? args[k + i] : undefined; };
const listFile = arg('--list') ?? 'scripts/species-list.txt';

(async () => {
  const text = readFileSync(listFile, 'utf8');
  const lines = text.split(/\r?\n/);
  const head = lines.filter((l) => l.startsWith('#'));
  let body = lines.filter((l) => l && !l.startsWith('#'));
  const parsed = parseSpeciesList(text);
  if (parsed.length !== body.length) throw new Error(`${listFile}: ${body.length} lines, ${parsed.length} read`);
  const notes: string[] = [];
  const refDir = arg('--held');
  if (refDir) {
    const pages: Array<Pick<ReferencePage, 'key' | 'kewEntry' | 'via'>> = [];
    for (const f of readdirSync(refDir)) {
      if (!/^[gk]?[1-9][0-9]*\.json$/.test(f)) continue;
      const d = JSON.parse(readFileSync(`${refDir}/${f}`, 'utf8')) as { ids?: { gbif?: number }; key?: number | string; name: { kew?: { entry?: string } }; distribution?: { via?: { entry?: string; kind?: string } } };
      pages.push({ key: d.ids?.gbif ?? (typeof d.key === 'number' ? d.key : null), kewEntry: d.name.kew?.entry || null, via: d.distribution?.via ?? null });
    }
    const held = heldThroughRange(parsed, pages);
    body = body.filter((_, i) => !(parsed[i].kewId && held.has(parsed[i].kewId!)));
    for (const [id, h] of held) console.log(`  left out: ${id} ${h.entry}, held by page g${h.key}`);
    notes.push(`Left out (round eighty, scripts/dev/r80x-list-rules.ts --held, the rule of select-species-lib's heldThroughRange): ${held.size} species without a GBIF key that a page of the reference holds through its range (the page matches no species Kew accepts by its own name, and its range is read through that species' Kew entry): ${[...held].map(([id, h]) => `${id} ${h.entry}, by page g${h.key}`).join('; ')}. ${body.length} species.`);
  }
  const wcvp = arg('--authors'), backbone = arg('--authors', 2);
  if (wcvp && backbone) {
    const k = kewLoader();
    for await (const l of createInterface({ input: createReadStream(wcvp), crlfDelay: Infinity })) k.add(l);
    const byWords = new Map<string, BackboneName[]>();
    for await (const l of createInterface({ input: createReadStream(backbone).pipe(createGunzip()), crlfDelay: Infinity })) {
      const b = backboneLine(l);
      if (b) { const w = words(b.name); byWords.set(w, [...(byWords.get(w) ?? []), b]); }
    }
    const now = parseSpeciesList([head[0], ...body].join('\n'));
    const changed: string[] = [];
    let same = 0, differs = 0;
    body = body.map((line, i) => {
      const e = now[i];
      if (!e.kewId || e.gbifKey == null || e.reason.split('; ').includes(REASON_REFERENCE)) return line;
      const row = k.kew.rows.get(e.kewId);
      if (!row) return line;
      // The list's own choice is the rule without Kew's reading: a line it gives otherwise is said and left alone.
      if (gbifKeyFor(row, byWords) !== String(e.gbifKey)) { differs++; return line; }
      const key = gbifKeyFor(row, byWords, k.kew);
      if (key === String(e.gbifKey)) { same++; return line; }
      const was = (byWords.get(words(e.name)) ?? []).find((b) => b.key === String(e.gbifKey));
      changed.push(`${e.kewId} ${e.name} ${e.author}: ${e.gbifKey} (GBIF's ${e.name} ${was?.author ?? '?'}, which Kew's file holds as another species' name) → ${key ?? '-'}`);
      return line.replace(/\t[^\t]*$/, `\t${key ?? '-'}`);
    });
    for (const c of changed) console.log(`  ${c}`);
    console.log(`  ${same} keys the same; ${changed.length} changed; ${differs} lines the rule gives otherwise today, left as they are`);
    notes.push(`GBIF's keys (round eighty, scripts/dev/r80x-list-rules.ts --authors, gbifKeyFor with Kew's file): a key Kew's file reads, by GBIF's author, as another species' name is not taken; of the lines whose key the list chose by the name, ${changed.length} changed: ${changed.join('; ')}.`);
  }
  // The header's "Selected:" line, counted again from the lines as select-species.ts counts it.
  const rows = parseSpeciesList([head[0], ...body].join('\n'));
  const why = (e: (typeof rows)[number]) => e.reason.split('; ');
  const C = (x: string[]) => x.some((p) => p.startsWith('inat ')), G = (x: string[]) => x.includes('collector genus'), R = (x: string[]) => x.includes(REASON_REFERENCE);
  const count = (f: (x: string[]) => boolean) => rows.filter((e) => f(why(e))).length;
  const n = (v: number) => v.toLocaleString('en-GB');
  const withKey = rows.filter((e) => e.gbifKey != null).length;
  const noKew = rows.filter((e) => R(why(e)) && !C(why(e)) && !G(why(e)) && !e.kewId).length;
  const selected = `Selected: ${n(rows.length)} species: ${n(count(C))} by their records, ${n(count(G))} by their collector genus, ${n(count(R))} already in the reference; ${n(count((x) => C(x) && !G(x) && !R(x)))} by their records alone, ${n(count((x) => G(x) && !C(x) && !R(x)))} by their collector genus alone, ${n(count((x) => R(x) && !C(x) && !G(x)))} only because they are already in the reference (${noKew} of them with no Kew id); ${n(withKey)} with a GBIF key, ${n(rows.length - withKey)} without.`;
  const at = head.findIndex((l) => l.startsWith('# Selected: '));
  if (at < 0) throw new Error(`${listFile}: no "Selected:" line in its header`);
  head.splice(at + 1, 0, ...notes.map((x) => `# ${x}`));
  head[at] = `# ${selected}`;
  writeFileSync(listFile, [...head, ...body].join('\n') + '\n');
  console.log(`${listFile}: ${body.length} species written`);
})();

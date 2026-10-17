/**
 * A front page shaped like the live corpus's, for first-screen measurements (round sixty-two; outside review A10, B1):
 * the fixture holds four species, one strip tile and three letters, so a test on it measured a first screen no reader
 * sees. These are the shapes `+page.server.ts` returns on the live site: twelve strip tiles with the names, English
 * names and photograph hosts the largest genera bring, a full letter index, and rows with long genus names and all
 * four counts. Photographs answer as 240 px squares (the `small` size the strip asks for).
 */
import type { Page, Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import * as devalue from 'devalue';

const FEATURED: Array<[string, string, string]> = [
  ['Gymnocalycium mihanovichii', 'Plaid cactus', 'Cactaceae'],
  ['Mammillaria elongata', 'Ladyfinger cactus', 'Cactaceae'],
  ['Echeveria elegans', 'Mexican snowball', 'Crassulaceae'],
  ['Haworthiopsis attenuata', 'Zebra plant', 'Asphodelaceae'],
  ['Crassula ovata', 'Jade plant', 'Crassulaceae'],
  ['Euphorbia obesa', 'Baseball plant', 'Euphorbiaceae'],
  ['Lithops lesliei', 'Living stones', 'Aizoaceae'],
  ['Conophytum minutum', 'Button plant', 'Aizoaceae'],
  ['Kalanchoe tomentosa', 'Panda plant', 'Crassulaceae'],
  ['Astrophytum asterias', 'Sand dollar cactus', 'Cactaceae'],
  ['Stapelia gigantea', 'Zulu giant', 'Apocynaceae'],
  ['Pelargonium crithmifolium', 'Fennel-leaved pelargonium', 'Geraniaceae']
];
const GENERA: Array<[string, string]> = [
  ['Abromeitiella', 'Bromeliaceae'], ['Acanthocalycium', 'Cactaceae'], ['Acanthorhipsalis', 'Cactaceae'], ['Adenia', 'Passifloraceae'], ['Adromischus', 'Crassulaceae'],
  ['Aeonium', 'Crassulaceae'], ['Agave', 'Asparagaceae'], ['Albuca', 'Asparagaceae'], ['Aloe', 'Asphodelaceae'], ['Aloidendron', 'Asphodelaceae']
];
export const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWXYZ'.split('');

/** A 240 × 240 PNG, made here so no file is needed. */
function png240(): Buffer {
  const W = 240, crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) raw.set([60 + (x % 80), 110, 70], y * (W * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Photographs from the outside hosts answer at once, as 240 px squares, so the strip lays out at its real size. */
export async function servePhotos(page: Page) {
  const img = png240();
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', body: img }));
}

/** The front page's data, reshaped to the live corpus's, on every client-side load of `/` (`__data.json`). */
export async function liveShapedHome(page: Page) {
  await page.route(/\/__data\.json/, async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    const j = JSON.parse(body.split('\n')[0]) as { type: string; nodes: Array<{ type: string; data?: unknown[] }> };
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown>;
      if (!('featured' in d) || !('rows' in d)) continue;
      d.total = 8947;
      d.withClimate = 7123;
      d.featured = FEATURED.map(([name, common, family], i) => ({ slug: name.toLowerCase().replace(' ', '-'), name, common, family, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${1000 + i}/medium.jpg` }));
      d.rows = GENERA.map(([g, fam], i) => ({ id: g.toLowerCase(), label: g, sub: fam, count: 3 + i * 7, withClimate: 2 + i * 5, notChecked: i % 3, pending: i % 2, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${2000 + i}/medium.jpg`, alt: g, letter: 'A' }));
      d.rowCount = 1321;
      d.letters = LETTERS;
      d.letterAt = Object.fromEntries(LETTERS.map((l, i) => [l, i * 50]));
      n.data = JSON.parse(devalue.stringify(d));
    }
    await route.fulfill({ response: res, body: JSON.stringify(j) });
  });
}

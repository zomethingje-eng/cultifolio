/**
 * "Spent this year" from the price a plant was entered with (round sixty; the product review's 4.7 table, the self-review's
 * experience item 10). The price field is free text, so only a plain number is counted ("12", "8.50", "£6", "6 EUR");
 * a price that is not one ("a swap", "3 for 10", "1,200") is not guessed at, and the page says how many were left out.
 *
 * Totalled per currency as written, never across them: one "12" beside two hundred "£" prices, or one € plant among them,
 * gave no total at all (round sixty-one; the grower review, 12). Prices with no currency named are a total of their own,
 * said as such; no currency is guessed for them, and no rate is applied between currencies.
 */
export interface SpendPart { cur: string | null; total: number; counted: number }
export interface Spend { parts: SpendPart[]; counted: number; skipped: number }

const SYM = '[$€£¥₹]|[A-Z]{3}|kr|zł';
const PLAIN = new RegExp(`^\\s*(${SYM})?\\s*(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*(${SYM})?\\s*$`, 'u');

/** A price as a number and its currency, or null when it is not a plain number. */
export function readPrice(text: string): { v: number; cur: string | null } | null {
  const m = PLAIN.exec(text);
  if (!m || (m[1] && m[3])) return null;
  return { v: Number(m[2].replace(',', '.')), cur: m[1] ?? m[3] ?? null };
}

export function spendOf(prices: Array<string | null | undefined>): Spend {
  let counted = 0, skipped = 0;
  const by = new Map<string | null, { total: number; counted: number }>();
  for (const p of prices) {
    if (p == null || !p.trim()) continue;
    const r = readPrice(p);
    if (!r) { skipped++; continue; }
    const b = by.get(r.cur) ?? { total: 0, counted: 0 };
    b.total += r.v;
    b.counted++;
    by.set(r.cur, b);
    counted++;
  }
  // The currency with the most plants first, the prices with none named last; ties by the currency's own text, so the
  // order never depends on the order the plants were entered in.
  const parts = [...by].map(([cur, b]) => ({ cur, total: Math.round(b.total * 100) / 100, counted: b.counted }))
    .sort((a, b) => (a.cur === null ? 1 : 0) - (b.cur === null ? 1 : 0) || b.counted - a.counted || (a.cur ?? '').localeCompare(b.cur ?? ''));
  return { parts, counted, skipped };
}

const money = (v: number) => v.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
const plants = (n: number) => `${n} plant${n === 1 ? '' : 's'}`;

/** One currency's amount: "£36.50", "12 EUR", "15" for prices with none named. */
const amount = (p: SpendPart) => (p.cur && /^[$€£¥₹]$/.test(p.cur) ? `${p.cur}${money(p.total)}` : p.cur ? `${money(p.total)} ${p.cur}` : money(p.total));

/**
 * The amounts in words: "£36.50 on 3 plants"; per currency when there are several, "£2,310 on 180 plants, €45 on 3 plants
 * and 40 on 12 plants with no currency given"; "nothing counted" when no price was a plain number.
 */
export function amountWords(s: Spend): string {
  if (!s.counted) return 'nothing counted';
  const one = s.parts.length === 1;
  const said = s.parts.map((p) => `${amount(p)} on ${plants(p.counted)}${p.cur === null && !one ? ' with no currency given' : ''}`);
  return said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0];
}

/**
 * The summary's lines, or null when no plant has a price at all (nothing to sum, so nothing said). `left` says how many
 * prices, over all time, were not read as numbers.
 */
export function spendWords(year: Spend, all: Spend, y: string): { year: string; all: string; left: string } | null {
  if (!all.counted && !all.skipped) return null;
  const left = all.skipped ? `${all.skipped} price${all.skipped === 1 ? '' : 's'} could not be read as a number, so ${all.skipped === 1 ? 'it is' : 'they are'} not counted.` : '';
  return { year: `${amountWords(year)} (${y})`, all: amountWords(all), left };
}

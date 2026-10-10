/**
 * "Spent this year" from the price a plant was entered with (round sixty; the product review's 4.7 table, the self-review's
 * experience item 10). The price field is free text, so only a plain number is counted ("12", "8.50", "£6", "6 EUR");
 * a price that is not one ("a swap", "3 for 10", "£12 each") is not guessed at, and the page says how many were left out.
 *
 * Totalled per currency as written, never across them: one "12" beside two hundred "£" prices, or one € plant among them,
 * gave no total at all (round sixty-one; the grower review, 12). Prices with no currency named are a total of their own,
 * said as such; no currency is guessed for them, and no rate is applied between currencies.
 */
export interface SpendPart { cur: string | null; total: number; counted: number }
/** `free`: plants whose price says "free" or "gift": nothing spent, said apart from the prices not read (round sixty-two; A39). */
export interface Spend { parts: SpendPart[]; counted: number; skipped: number; free: number }

/**
 * Each currency written one way, so it is totalled once (round sixty-two; the grower review, 8, A39): "$12", "12 USD",
 * "US$12" and "12 usd" are one total, as are £ and GBP, € and EUR, ¥ and JPY. Saying two names of one currency are one
 * is not a conversion; no rate is applied between currencies. "R$", "A$", "NZ$" and "C$" are the real, the Australian,
 * New Zealand and Canadian dollars, each its own; "Rs" is a rupee, its own too.
 */
const ONE_WAY: Record<string, string> = { 'USD': '$', 'US$': '$', 'GBP': '£', 'EUR': '€', 'JPY': '¥', 'INR': '₹', 'BRL': 'R$', 'AUD': 'A$', 'NZD': 'NZ$', 'CAD': 'C$', 'RS': 'Rs' };
/** A code in capitals, or one of the common ones in lower case ("12 usd"); "12 per" is no currency. */
const LOWER = 'usd|gbp|eur|jpy|chf|aud|nzd|cad|brl|inr|zar|sek|nok|dkk|pln|czk|huf|mxn|cny|hkd|sgd';
const SYM = `US\\$|R\\$|A\\$|NZ\\$|C\\$|[$€£¥₹]|[A-Z]{3}|${LOWER}|Rs\\.?|kr|zł`;
/**
 * A plain amount: digits with a thousands separator only where exactly three digits follow it ("1,250", "12.000", and
 * a space as French, Swiss and Nordic prices write it, "1 200", a no-break or thin space too: round sixty-seven,
 * triage-66 R14, the outside review's 25), then a decimal part of one or two digits written with the other mark
 * ("1.234,56", "1 234,56").
 */
const AMOUNT = '\\d{1,3}(?:(?<sep>[,. \\u00a0\\u202f\\u2009])\\d{3})(?:\\k<sep>\\d{3})*(?:(?!\\k<sep>)[.,]\\d{1,2})?|\\d{1,6}(?:[.,]\\d{1,2})?';
const PLAIN = new RegExp(`^\\s*(${SYM})?\\s*(${AMOUNT})\\s*(${SYM})?\\s*$`, 'u');
/** "free", "a gift", "gifted": nothing was spent. */
const FREE = /^\s*(?:free|(?:a\s+)?gift(?:ed)?)\s*$/i;

/** A price as a number and its currency, or null when it is not a plain number. A free plant is 0 with no currency. */
export function readPrice(text: string): { v: number; cur: string | null } | null {
  if (FREE.test(text)) return { v: 0, cur: null };
  const m = PLAIN.exec(text);
  if (!m || (m[1] && m[4])) return null; // m[3] is the thousands separator
  const raw = m[2];
  const dec = /[.,](\d{1,2})$/.exec(raw);
  // The mark before the last one or two digits is the decimal point, unless it is the thousands separator already used.
  const sep = m.groups?.sep;
  const decimal = dec && !(sep && raw[raw.length - dec[1].length - 1] === sep) ? dec[1] : null;
  const whole = (decimal !== null ? raw.slice(0, raw.length - decimal.length - 1) : raw).replace(/[.,\s]/g, '');
  const code = (m[1] ?? m[4] ?? null)?.replace(/\.$/, '') ?? null;
  const cur = code === null ? null : (ONE_WAY[code.toUpperCase()] ?? (/^[a-z]{3}$/.test(code) ? code.toUpperCase() : code));
  return { v: Number(`${whole}${decimal !== null ? `.${decimal}` : ''}`), cur };
}

export function spendOf(prices: Array<string | null | undefined>): Spend {
  let counted = 0, skipped = 0, free = 0;
  const by = new Map<string | null, { total: number; counted: number }>();
  for (const p of prices) {
    if (p == null || !p.trim()) continue;
    if (FREE.test(p)) { free++; continue; }
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
  return { parts, counted, skipped, free };
}

const money = (v: number) => v.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
const plants = (n: number) => `${n} plant${n === 1 ? '' : 's'}`;

/** One currency's amount: "£36.50", "12 EUR", "15" for prices with none named. */
const amount = (p: SpendPart) => (p.cur && /^(?:[$€£¥₹]|R\$|A\$|NZ\$|C\$)$/.test(p.cur) ? `${p.cur}${money(p.total)}` : p.cur ? `${money(p.total)} ${p.cur}` : money(p.total));

/**
 * The amounts in words: "£36.50 on 3 plants"; per currency when there are several, "£2,310 on 180 plants, €45 on 3 plants
 * and 40 on 12 plants with no currency given"; "nothing counted" when no price was a plain number.
 */
export function amountWords(s: Spend): string {
  const free = s.free ? `${plants(s.free)} free or a gift` : '';
  if (!s.counted) return free ? `nothing spent: ${free}` : 'nothing counted';
  const one = s.parts.length === 1;
  const said = s.parts.map((p) => `${amount(p)} on ${plants(p.counted)}${p.cur === null && !one ? ' with no currency given' : ''}`);
  if (free) said.push(free);
  return said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}` : said[0];
}

/**
 * The summary's lines, or null when no plant has a price at all (nothing to sum, so nothing said). `left` says how many
 * prices, over all time, were not read as numbers.
 */
export function spendWords(year: Spend, all: Spend, y: string): { year: string; all: string; left: string } | null {
  if (!all.counted && !all.skipped && !all.free) return null;
  const left = all.skipped ? `${all.skipped} price${all.skipped === 1 ? '' : 's'} could not be read as a number, so ${all.skipped === 1 ? 'it is' : 'they are'} not counted.` : '';
  return { year: `${amountWords(year)} (${y})`, all: amountWords(all), left };
}

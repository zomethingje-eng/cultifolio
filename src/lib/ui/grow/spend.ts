/**
 * "Spent this year" from the price a plant was entered with (round sixty; the product review's 4.7 table, the self-review's
 * experience item 10). The price field is free text, so only a plain number is counted ("12", "8.50", "£6", "6 EUR");
 * a price that is not one ("a swap", "3 for 10", "1,200") is not guessed at, and the page says how many were left out.
 * A currency is shown only when every counted price names the same one, or none does.
 */
export interface Spend { total: number; counted: number; skipped: number; currency: string | null; mixed: boolean }

const SYM = '[$€£¥₹]|[A-Z]{3}|kr|zł';
const PLAIN = new RegExp(`^\\s*(${SYM})?\\s*(\\d{1,6}(?:[.,]\\d{1,2})?)\\s*(${SYM})?\\s*$`, 'u');

/** A price as a number and its currency, or null when it is not a plain number. */
export function readPrice(text: string): { v: number; cur: string | null } | null {
  const m = PLAIN.exec(text);
  if (!m || (m[1] && m[3])) return null;
  return { v: Number(m[2].replace(',', '.')), cur: m[1] ?? m[3] ?? null };
}

export function spendOf(prices: Array<string | null | undefined>): Spend {
  let total = 0, counted = 0, skipped = 0;
  const curs = new Set<string | null>();
  for (const p of prices) {
    if (p == null || !p.trim()) continue;
    const r = readPrice(p);
    if (!r) { skipped++; continue; }
    total += r.v;
    counted++;
    curs.add(r.cur);
  }
  const named = [...curs].filter((c): c is string => !!c);
  const mixed = named.length > 1 || (named.length === 1 && curs.has(null));
  return { total: Math.round(total * 100) / 100, counted, skipped, currency: !mixed && named.length === 1 ? named[0] : null, mixed };
}

const money = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** One amount in words: "£36.50 on 3 plants", "no total: the prices are in more than one currency", "nothing counted". */
export function amountWords(s: Spend): string {
  if (s.mixed) return 'no total: the prices are in more than one currency';
  if (!s.counted) return 'nothing counted';
  const cur = s.currency;
  const amount = cur && /^[$€£¥₹]$/.test(cur) ? `${cur}${money(s.total)}` : cur ? `${money(s.total)} ${cur}` : money(s.total);
  return `${amount} on ${s.counted} plant${s.counted === 1 ? '' : 's'}`;
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

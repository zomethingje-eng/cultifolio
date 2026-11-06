/**
 * The typical cell's place in words (round eighty-six; the plan's A13, review W's W14): the state or province Natural
 * Earth draws at the cell, and its country.
 *
 * The country's name was the one `Intl.DisplayNames` gives for Natural Earth's ISO code, CLDR's short display form: "Sud-Kivu,
 * Congo - Kinshasa" on Sabdariffa acetosella's page, beside its range's "Zaïre". It is now the country's name as a
 * reader writes it ("Democratic Republic of the Congo"), "&" and "St." written out.
 *
 * And a province whose country is disputed is named alone. Natural Earth's provinces give Crimea and Sevastopol to Russia
 * (its de facto view); TDWG's region there, Krym, names no country, and the reference's range is TDWG's. A page states
 * neither side's claim, so it says "Crimea", as the range says "Krym".
 *
 * `placeWords` is the build's (`withPlace`); `shownPlace` reads a place a build of round eighty-five stored ("Sud-Kivu,
 * Congo - Kinshasa", "Crimea, Russia") the same way, so a page says it so before its next build.
 */

/** Natural Earth's provinces (name and ISO code, as its file writes them) whose country a page does not state. */
const NO_COUNTRY: ReadonlySet<string> = new Set(['Crimea|RU', 'Sevastopol|RU']);

/** CLDR's short display forms, as a reader writes the country: the name `Intl.DisplayNames` gives, and the one said. */
const READER: Record<string, string> = {
  'Congo - Kinshasa': 'Democratic Republic of the Congo',
  'Congo - Brazzaville': 'Republic of the Congo',
  'Myanmar (Burma)': 'Myanmar',
  'Hong Kong SAR China': 'Hong Kong',
  'Macao SAR China': 'Macao',
  'U.S. Outlying Islands': 'United States Minor Outlying Islands',
  'U.S. Virgin Islands': 'United States Virgin Islands'
};

const displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

/** A country's name as the pages say it, from CLDR's display name. */
export function readerCountry(display: string): string {
  return (READER[display] ?? display).replace(/ & /g, ' and ').replace(/\bSt\. /g, 'Saint ');
}

/** A country's name for an ISO 3166 code, or undefined for none (Natural Earth writes "-9" where it gives no country). */
export function countryOf(iso: string | undefined): string | undefined {
  if (!iso || !/^[A-Z]{2}$/.test(iso)) return undefined;
  try {
    const d = displayNames?.of(iso);
    return d && d !== iso ? readerCountry(d) : iso;
  } catch {
    return iso;
  }
}

/** The place of a province Natural Earth names, with its ISO code: "Sud-Kivu, Democratic Republic of the Congo"; "Crimea". */
export function placeWords(name: string, iso: string | undefined): string {
  if (NO_COUNTRY.has(`${name}|${iso ?? ''}`)) return name;
  const country = countryOf(iso);
  return country && country !== name ? `${name}, ${country}` : name;
}

/** A place a build stored, said as `placeWords` says it: CLDR's display form of the country read, a disputed province alone. */
export function shownPlace(stored: string): string {
  const at = stored.lastIndexOf(', ');
  if (at < 0) return stored;
  const name = stored.slice(0, at), country = stored.slice(at + 2);
  if (country === 'Russia' && NO_COUNTRY.has(`${name}|RU`)) return name;
  return `${name}, ${readerCountry(country)}`;
}

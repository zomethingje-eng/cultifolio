/**
 * A plant Kew's World Checklist lists only as a cultigen (round eighty-six; review D's D1). Kew's `geographic_area` for
 * such an entry reads "as a cultigen from Peru" (Solanum lycopersicum), "as a cultigen from Greece" (Crocus sativus),
 * "Cultigen from Iran" (Allium porrum) or "as a cultigen derived from artificial hybrids." (Citrus × limon): 57 of the
 * reference's pages in Kew's file of 2026-06-04. Kew's distribution rows give such a plant its region of origin as not
 * introduced, so the range read it as native and the climate as a habitat's: the tomato's "habitat climate" was five
 * garden and field records on Lima's desert coast, saffron's a field in Greece. A cultigen has no wild habitat: the page
 * says "as a cultigen" wherever it names the region, and reads no habitat climate. The test is on Kew's own field.
 */

/** Kew's area text of a cultigen: it begins "as a cultigen" or "Cultigen". */
export const CULTIGEN = /^\s*(?:as\s+an?\s+)?cultigen\b/i;

/** Kew's area text when it says the plant is a cultigen, trimmed; else undefined. */
export const cultigenOf = (area: string | null | undefined): string | undefined => (area && CULTIGEN.test(area) ? area.trim().replace(/\s+/g, ' ') : undefined);

/** What Kew says after "cultigen" ("from Peru", "derived from artificial hybrids"), without a closing full stop. */
export const cultigenRest = (text: string): string => text.replace(CULTIGEN, '').trim().replace(/\.$/, '');

/** The climate's reason on such a page: Kew's words, quoted, and why no habitat climate is read. */
export const cultigenClimateWhy = (text: string): string => `Kew's World Checklist lists this plant only as a cultigen ("${text.replace(/\.$/, '')}"), with no wild habitat, so no habitat climate is read from where it is grown`;

/** The words after a region list, so "Native to" is never said of a cultigen alone: "Peru (as a cultigen)". */
export const AS_CULTIGEN = ' (as a cultigen)';

/**
 * Where each figure of a browse page comes from, and its day (round eighty-seven; rule 1). One place, so the pages, the
 * CSV's file of sources and the about page say the same; tests/unit/r87c-browse.test.ts holds the days to the records
 * they are read from (/about/how for Kew's file, scripts/species-list.txt's header for iNaturalist's counts).
 */

/** The "Extracted" day of Kew's files (README_WCVP.xlsx), which every native range of this reference is read from. */
export const KEW_DAY = '2026-06-04';
/** The day iNaturalist's counts of observations marked captive or cultivated were read (scripts/species-list.txt). */
export const GROWN_DAY = '2026-10-17';

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export const RANGE_SOURCE = `Native ranges: Kew's World Checklist of Vascular Plants (Govaerts et al., CC BY 4.0), file of ${long(KEW_DAY)}.`;
export const GROWN_SOURCE = `Grown: iNaturalist's observations marked captive or cultivated, counted ${long(GROWN_DAY)} (the species list's count).`;
export const GROWN_WORDS = "iNaturalist's observations of the species marked captive or cultivated";
export const CLIMATE_SOURCE = "Habitat climate known: the species page has a habitat climate, read from CHELSA's monthly climate and NASA POWER's daily extremes at its well-placed wild records inside Kew's native range; each page says its own sources and days.";
/** The reference's build day (a UTC day, as the sitemap's `lastmodOf` gives it), said with the figures it holds; none for a corpus with no manifest (the test corpus). */
/**
 * The record low's source (round eighty-seven, stage 2: the index's `low`, the derived agent's field): the lowest night in
 * NASA POWER's daily series at the species' typical habitat spot, as its page's extremes give it. Said only where the
 * index holds the column; an index of before says "not in this index".
 */
export const LOW_SOURCE = "Record low: the lowest night in NASA POWER's daily series at the habitat's typical spot, as the species page gives it, held in °C to a tenth and shown in your units; each page says its own years and day read.";
export const builtWords = (day: string | null | undefined): string | null => (day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `as the reference built on ${long(day)} holds them` : null);

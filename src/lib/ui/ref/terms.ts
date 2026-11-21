/**
 * The page's words of art, each with the one line a tip shows (round 103; the launch review's round 2, b). The tip is the
 * start of the word's entry in the glossary on /about/how, word for word (tests/unit/r103b-terms.test.ts holds the two
 * together), and links to it. Where a scale or a source defines its own word, the tip quotes it, linked and read on the day
 * given; the rest are this site's definitions, written for it, and none says anything of a species.
 *
 * Read 21 November 2026: USDA's map page, the RHS's hardiness ratings, iNaturalist's help on quality grades, Beck et al.
 * 2018. CITES's site refused an automated reader that day, so the CITES tip says what the page reads and links to the
 * Convention, and quotes nothing of it.
 */
export type TermKey = 'coldFloor' | 'dli' | 'cell' | 'range' | 'typicalSpot' | 'usda' | 'rhs' | 'koppen' | 'walterLieth' | 'researchGrade' | 'cites';

export interface Term {
  /** The word as the glossary heads its entry (the `<dt>`). */
  label: string;
  /** The tip: the glossary entry's first words, exactly. */
  tip: string;
  /** Where the words are quoted from, when they are. */
  quoted?: { from: string; url: string; read: string };
}

export const TERMS: Record<TermKey, Term> = {
  coldFloor: { label: 'Cold floor', tip: 'The 1st-percentile night at a typical spot in the range, from NASA POWER, so one night in a hundred is colder.' },
  dli: { label: 'DLI', tip: 'Daily light integral: the light a day delivers, in moles of photosynthetically active photons per square metre. The habitat\'s is the open sky\'s, converted at 2.07 mol of PAR per MJ, and says nothing of the shade a plant grows in.' },
  cell: { label: 'Cell', tip: 'One square of the climate grid, 0.05° on a side: about 5.6 km north to south, and less east to west away from the equator.' },
  range: { label: 'Across the range', tip: 'Across every cell of the climate grid that holds the species\' wild records inside its range. A figure across the range is the median of those cells, with the 10th to 90th percentile span.' },
  typicalSpot: { label: 'A typical spot in the range', tip: 'The one cell whose coldest month\'s mean nightly low is nearest the median across the range. The daily extremes, which need one weather series, are read there.' },
  usda: {
    label: 'USDA zone',
    tip: 'In USDA\'s words: "The map is based on the average annual extreme minimum winter temperature, displayed as 10-degree F zones and 5-degree F half zones." The habitat\'s zone is worked out the same way from the yearly lowest nights at a typical spot.',
    quoted: { from: 'USDA Plant Hardiness Zone Map', url: 'https://planthardiness.ars.usda.gov/', read: '21 November 2026' }
  },
  rhs: {
    label: 'RHS band',
    tip: 'In the RHS\'s words: "Hardiness ratings are determined by the lowest temperature a plant is likely to withstand." Its nine bands, H1a to H7, are ranges of the absolute minimum winter temperature; the page names the band the habitat\'s record low falls in.',
    quoted: { from: 'RHS hardiness ratings', url: 'https://www.rhs.org.uk/plants/trials-awards/award-of-garden-merit/rhs-hardiness-rating', read: '21 November 2026' }
  },
  koppen: {
    label: 'Köppen–Geiger class',
    tip: 'In Beck and others\' words (2018): "The Köppen-Geiger system classifies climate into five main classes and 30 sub-types. The classification is based on threshold values and seasonality of monthly air temperature and precipitation."',
    quoted: { from: 'Beck et al. 2018, Scientific Data 5, 180214', url: 'https://www.nature.com/articles/sdata2018214', read: '21 November 2026' }
  },
  walterLieth: { label: 'Walter–Lieth diagram', tip: 'A chart of the habitat\'s median year: mean temperature and rain on one scale, 10 °C to 20 mm, rain over 100 mm at a tenth. A month whose rain curve falls under its temperature curve is arid.' },
  researchGrade: {
    label: 'Research grade',
    tip: 'In iNaturalist\'s words: "Observations become Research Grade when the community agrees on species-level ID or lower." Such an observation has a date, a location and a photograph or sound, and is not of a captive or cultivated organism.',
    quoted: { from: 'iNaturalist Help, the Data Quality Assessment', url: 'https://help.inaturalist.org/en/support/solutions/articles/151000169936', read: '21 November 2026' }
  },
  cites: { label: 'CITES Appendices', tip: 'The lists of the Convention on International Trade in Endangered Species of Wild Fauna and Flora, Appendices I, II and III. The page says a listing as CITES publishes it, never what it requires: that is the Convention\'s text, linked from its entry.' }
};

/** The glossary's anchor for a word: `#term-` and its label in lower case, joined by hyphens. */
export const termAnchor = (k: TermKey) => `term-${TERMS[k].label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
export const termHref = (k: TermKey) => `/about/how#${termAnchor(k)}`;

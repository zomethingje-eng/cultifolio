/**
 * What changed for a reader, round by round, written from the round records in docs/REVIEW-ROUND-*.md (round
 * eighty-seven; plan D6's changelog). The records are the log (rule 6): each says what was found, by whom, and what was
 * done, in the detail a reviewer needs. These are a few plain lines of each, for someone who uses the site, and each
 * entry links its full record on GitHub, so a line here is never the only word on a change.
 *
 * A round's date is the day its record was finished: the last commit to docs/REVIEW-ROUND-<n>.md, which for round
 * eighty-six is the day it went live (8 November). Round eighty-three kept no record of its own (its work is in the git
 * log and in round eighty-four's record), so it has no entry here: a line without a record behind it would have nothing
 * to link.
 *
 * Round eighty-seven goes live in three stages (its record, section 5), so its lines carry the stage that makes each true
 * and only the live stages' lines are listed (`R87_LIVE_STAGE`, `liveLines`): /changes and the front page's "Changed
 * lately" read `ROUNDS` and know nothing of stages, so a line of a stage not yet live is left out of `ROUNDS` itself.
 *
 * Newest first. A test (tests/unit/r87p-changes.test.ts) holds every entry to its record: the file exists, the date is
 * the record's, and no line uses a word the site's style rules out; tests/unit/r87rec-changes.test.ts holds round
 * eighty-seven's stages.
 */

export interface Round {
  /** The round's number, as its record is named. */
  n: number;
  /** YYYY-MM-DD: the day the round's record was finished. */
  date: string;
  /** What changed for a reader, a few plain lines. */
  lines: readonly string[];
  /**
   * The round in one plain sentence, for someone who has never seen the site (round 102; the launch review): what a reader
   * now sees differently. The front page's "Changed lately" shows the newest three; /changes keeps every line.
   */
  reader: string;
}

/** The public repository, as the footer and the about pages link it. */
export const REPO = 'https://github.com/zomethingje-eng/cultifolio';

/** A round's full record on GitHub. */
export const recordHref = (n: number) => `${REPO}/blob/main/docs/REVIEW-ROUND-${n}.md`;
/** A round's place on /changes. */
export const roundHref = (n: number) => `/changes#round-${n}`;

/** A line of a round that goes live in stages (round eighty-seven): the text, and the stage that makes it true. */
export interface StagedLine {
  /**
   * 1: the look, the about pages and the browse pages (stage 1's code and index). 2: the species pages' new figures
   * (stage 2's code, then the walk's corpus, uploaded by scripts/corpus-plan-r87s2.txt). 3: the tracker (stage 3's code).
   */
  stage: 1 | 2 | 3;
  text: string;
}

/**
 * The last of round eighty-seven's stages that is live, and so listed. Stage 1 is: its code and its index are what the
 * owner deploys first. Raised by hand in the code of the deploy that makes it true, never before: to 3 in stage 3's
 * code, which by the owner's steps deploys after stage 2's corpus has been uploaded and checked live (stage 2's own code
 * deploys before its walk, when its sections still say "Not worked out for this page yet", so it keeps 1). A stage
 * listed late says too little for a while; one listed early would say what a reader cannot see.
 */
// Raised to 3 on 14 November 2026 (round ninety): stage 3's code is live, and stage 2's corpus was uploaded and checked
// live on 13 November (scripts/corpus-plan-r87s2.txt, every step done); the flowering line says "page by page", since
// the daily fill reads about 4,000 pages a day and its pages go up once it has finished.
export const R87_LIVE_STAGE: 1 | 2 | 3 = 3;

/**
 * Round eighty-seven's lines, every stage's, in the order /changes lists them: the stages in turn, so that "Changed
 * lately" (the first lines of the newest round) reads stage 1's first. At most eight, so that with every stage live the
 * round keeps the list's limit (r87p changes 2).
 */
export const R87_LINES: readonly StagedLine[] = [
  {
    stage: 1,
    text: 'A new look: thin rules and tables, not cards, with Source Sans 3 for text and Source Serif 4 italic for scientific names alone.'
  },
  {
    stage: 1,
    text: 'Browse the reference by native region, family or genus, alone or combined, as a list or a CSV file; the search box suggests them beside species.'
  },
  {
    stage: 1,
    text: 'The about pages say who made the site and how AI was used, and which licence each part of the data carries.'
  },
  {
    stage: 2,
    text: 'Species pages add the habitat\'s USDA zone and RHS band, a Köppen–Geiger climate class and targets to aim for at home, each worked from the page\'s figures, and, page by page, flowering months in the wild from iNaturalist.'
  },
  {
    stage: 2,
    text: 'Species pages also give, each with its source and the day read: Kew\'s predicted extinction risk, ChromoDB\'s chromosome counts, WFO\'s reading of the name, links to other registers, where the name was published and a hybrid\'s parents.'
  },
  {
    stage: 3,
    text: 'My plants keeps more of a plant\'s record: items of one accession (2026-0012/A), plants no longer held with the reason, ITF2 provenance, field numbers with a BCSS link you press, crosses, grafts and the plant an offset came from.'
  },
  {
    stage: 3,
    text: 'A plant\'s growing season, once you confirm or set it, has Today list the plant as resting in its rest months, with no Water button; Today also says what flowered this week in past years.'
  },
  {
    stage: 3,
    text: 'A plant can keep its papers, such as a permit; labels print on 12, 18 or 24 mm tape with the plant\'s number in the code; and an app lock, a screen and not encryption, covers a shared device.'
  }
];

/** The text of the lines whose stage is live, `live` the last live stage, in their order. */
export function liveLines(lines: readonly StagedLine[], live: number): string[] {
  return lines.filter((l) => l.stage <= live).map((l) => l.text);
}

export const ROUNDS: readonly Round[] = [
  {
    n: 126,
    date: '2026-11-26',
    reader: 'A species page can set your own site\'s climate beside its habitat\'s, month by month.',
    lines: [
      'Compare with Outdoors draws your site\'s days, nights, rain and day length dashed over the habitat\'s, from the same climate data.',
      'Its card names your figure and the habitat\'s in each line, and only the one-degree square around your site is asked of the site.'
    ]
  },
  {
    n: 125,
    date: '2026-11-26',
    reader: 'A plant\'s page leads with Water and Record…, and Record… is a grid of what you can record.',
    lines: [
      'Record… opens on its kinds as one-tap tiles; Move and Archive are in the plant\'s menu.',
      'Since watered says how often you water it on average, and the log shows its latest three lines first.'
    ]
  },
  {
    n: 124,
    date: '2026-11-26',
    reader: 'A plant\'s page says whether its name is as received, checked by you, or verified by someone.',
    lines: [
      'Set a plant\'s name as checked by you, with the day and what against, or verified by someone, with their name.',
      'The plants sheet has a column for what you checked it against, and the import reads it back.'
    ]
  },
  {
    n: 123,
    date: '2026-11-25',
    reader: 'A space\'s page is two buttons and its three conditions, and a space has a label of its own.',
    lines: [
      'A space shows the temperature, the days between waterings and the dry months as figures, with Watered and Add a plant here; the rest is in its menu.',
      'A label for a space opens its page from one scan, and the audit says when it was last done.'
    ]
  },
  {
    n: 122,
    date: '2026-11-25',
    reader: 'Your spaces keep the order you walk them in, and moving plants is one tap.',
    lines: [
      'A handle on each space sets your walking order, and Today follows it.',
      'Ticked plants move with one tap on a list of your spaces, and one Undo.'
    ]
  },
  {
    n: 121,
    date: '2026-11-25',
    reader: 'My plants, Spaces and Batches are one home, and your plants can be seen as photographs, rows or a table.',
    lines: [
      'One switch heads My plants, Spaces and Batches; each space with plants is one tap, and "To look at" is what Due was.',
      'Photographs, rows or a table, kept on this device; the table groups by space with a Watered for each, and gives the rows as CSV.'
    ]
  },
  {
    n: 120,
    date: '2026-11-25',
    reader: 'Today lists your spaces, and one Done records a whole bench: what you watered, and what you looked at and left dry.',
    lines: [
      'Each space is one row with what it has to look at; open one, tick what you water, and Done records the rest as looked at and left dry.',
      'A plant left dry is off Today for half its rhythm, at least three days, and a row says how often you have watered it.'
    ]
  },
  {
    n: 119,
    date: '2026-11-25',
    reader: 'An empty My plants offers three ways in, and a new plant is placed in its space with one tap.',
    lines: [
      'Add a plant, Photo walk and Import a list on an empty My plants, with nothing to set up first; on a phone the + opens them, and Sow seed.',
      'A new plant\'s card names your spaces as chips, so one tap puts it there beside its habitat; "Added as" has an Undo, and three small steps follow it.'
    ]
  },
  {
    n: 118,
    date: '2026-11-25',
    reader: 'A species page draws the habitat\'s year as one panel: temperature, rain and light on one month axis, with a table of the figures.',
    lines: [
      'The year panel: three charts and thin rows for day length, humidity, VPD and wind, this month marked, in your months or the habitat\'s.',
      'Table gives the same figures with their spans, and a CSV; under the panel the year is said in two halves.'
    ]
  },
  {
    n: 117,
    date: '2026-11-25',
    reader: 'The lower part of a species page says where its figures come from, and how to cite it.',
    lines: [
      'The record names the registers that accept the name, what was looked for and is not there, and where each figure comes from; "Cite this page" gives what a citation needs.',
      'Photographs stand in rows by how their source marks them, the ground under the range is named, and a species of similar climate you grow says so.'
    ]
  },
  {
    n: 116,
    date: '2026-11-24',
    reader: 'On an iPhone, the site now says how to keep your plants before Safari can clear them.',
    lines: [
      'After the first plant on an iPhone or iPad, a sheet offers sync, the Home Screen or a backup, sync first: the Home Screen app keeps a collection of its own, and a scanned label opens Safari.',
      'The card and the bar that asked iPhones to add the Home Screen first are gone.'
    ]
  },
  {
    n: 115,
    date: '2026-11-24',
    reader: 'A species page leads with what the plant is and its classes, and its photographs by how they were taken.',
    lines: [
      'Under the name: the Köppen class, USDA zone, RHS band, CITES Appendix and records as chips, and the first two sentences of what it is.',
      'A switch shows all the photographs, those observed growing wild, or those in cultivation, as their sources mark them.'
    ]
  },
  {
    n: 114,
    date: '2026-11-24',
    reader: 'The top of a species page answers six questions of the habitat: Cold, Heat, Rain, Light, Air and Ground.',
    lines: [
      'Six answers in the same order on every page, each a figure with its source: the cold floor, the warmest month\'s days, the year\'s rain, the light, the air\'s humidity and dryness, and the ground\'s height.',
      'On a wider screen each has the lines that qualify it and a small chart of its year.'
    ]
  },
  {
    n: 113,
    date: '2026-11-24',
    reader: 'A species page draws how cold its habitat gets: the coldest night of every year since 1981.',
    lines: [
      'The hardiness section is now "How cold it gets": a bar for each year\'s lowest night, their mean with the USDA zone it gives, and the cold floor.',
      'Beside it, four figures: the USDA zone, the RHS band, the frost nights, and the hottest day in 100.'
    ]
  },
  {
    n: 112,
    date: '2026-11-24',
    reader: 'The species suggestions on "Add a plant" are readable again, and stay where they are as they arrive.',
    lines: [
      'The list of suggestions has its own background again; its rows printed over the fields beneath it.',
      'Species pages come first, then at most two names with no species page, then GBIF\'s other names behind one row; each group keeps its place while the two searches answer.',
      'The part of a name not yet typed is set in bold, and every row is a finger\'s height.'
    ]
  },
  {
    n: 111,
    date: '2026-11-24',
    reader: 'The reference\'s photographs from iNaturalist and GBIF are served from the site\'s own copies, so those hosts no longer see who looks.',
    lines: [
      'Every photograph a page shows comes from img.cultifolio.com, copies made at the sizes the pages show, each under its own licence and credited as before.',
      'Photographs from iNaturalist and GBIF no longer tell those hosts your address; Wikimedia Commons\' follow once their copy, made at Commons\' polite pace, is complete.',
      'Each day\'s new pages have their photographs copied before they go up.'
    ]
  },
  {
    n: 108,
    date: '2026-11-22',
    reader: 'Plants whose locations are blurred to guard them now have a habitat climate, without a cold floor.',
    lines: [
      'Where no record is placed to within 10 km, records placed only to within 30 km give the months, rain and light.',
      'Each such record is read as the land around it, in southern Africa and South-East Asia, where a test held.',
      'No cold floor is derived from them: it is read at one point, and the test showed blurred records move it.'
    ]
  },
  {
    n: 107,
    date: '2026-11-22',
    reader: 'A plant just added is set beside its habitat at once, and the frost watch takes a town.',
    lines: [
      'A plant just added opens on one comparison: its space\'s floor or light beside its habitat\'s, each with its source.',
      'The frost watch says why before it asks where you are, and takes a town typed instead (OpenStreetMap).',
      'Today with no plants is one button to add one; the backup line asks once, at the tenth plant.'
    ]
  },
  {
    n: 106,
    date: '2026-11-21',
    reader: 'A species page answers in a grower\'s order: what it is, how to keep it at home, then its climate.',
    lines: [
      'A species page opens on what the plant is, then "At home, aim for" with the cultivation cards under it, then the hardiness of its habitat.',
      'The habitat\'s climate is one chart, with "Show in my months" for a reader in the other hemisphere; the climate class and the figures by month are folded under it.',
      'Under 12 flowering records, a sentence names the months; related species with a photograph come first.'
    ]
  },
  {
    n: 105,
    date: '2026-11-21',
    reader: 'The top bar names Sync and Add, and a browse list opens on the species with a habitat climate.',
    lines: [
      'The top bar\'s label beside the name of the site is gone; a page deeper in shows its trail, and its Back link.',
      'On a desktop Sync and Add say their names, Sync shows once there is something to sync, and a wide screen has Labels and Settings in the bar.',
      'A browse list opens on the species with a habitat climate, most grown first; most grown alone is still an order.'
    ]
  },
  {
    n: 104,
    date: '2026-11-21',
    reader: 'The front page\'s search box is the one at the top of every page, with your own plants first.',
    lines: [
      'The front page\'s large box is the search at the top of every page: your own plants first, matched on this device, then genera, families and regions, then species.',
      'A species row in the search says the record low, the rain a year and the season, or, with no habitat climate, where it is native and its photographs.',
      'A search for a cultivar or a trade name whose first word is a genus here names the genus and its count, where it said nothing matched.'
    ]
  },
  {
    n: 103,
    date: '2026-11-21',
    reader: 'A species page shows its habitat in four figures at the top on every screen, and explains its terms.',
    lines: [
      'The habitat in short, four figures each with its source, now sits at the top of a species page on a desktop too; a page with no habitat climate says so there, and why.',
      'A dotted word on a species page, such as cold floor, DLI or USDA zone, opens a one-line meaning from the glossary, with a link to it.',
      'Every species page has a title that says what it holds, within what a search result shows.'
    ]
  },
  {
    n: 102,
    date: '2026-11-20',
    reader: 'The front page says what Cultifolio is first, with one large search box.',
    lines: [
      'The front page now opens on what the site is, with one large search box, a figure of the day with where it came from, and the ways to browse.',
      'The catalogue\'s A to Z has left the front page; every address of it still opens it, and Browse lists every region, family and genus.'
    ]
  },
  {
    n: 100,
    date: '2026-11-20',
    reader: 'Opening a backup file no longer shifts under your finger while your collection opens.',
    lines: [
      'On the backup page, the file\'s preview waits for your collection to open, so nothing moves under your finger as you press it.',
      'No species page changed: a trial of the Catalogue of Life, the taxonomy GBIF is moving to, was run and recorded, and the pages keep GBIF\'s backbone.'
    ]
  },
  {
    n: 99,
    date: '2026-11-20',
    reader: 'Your collection can be locked with its passcode and kept encrypted on your device.',
    lines: [
      'Your collection can be encrypted on your device under the app lock\'s passcode: its records, photographs, papers and sync key are then kept in the browser only as ciphertext.',
      'With it on, nothing of the collection is read until the passcode opens it, and a sync key this device synced with opens it if the passcode is forgotten.'
    ]
  },
  {
    n: 98,
    date: '2026-11-19',
    reader: 'Species pages draw a Walter–Lieth climate diagram: rain and warmth on one chart, dry months marked.',
    lines: [
      'A species page now draws the Walter–Lieth diagram of its habitat\'s median year under its climate class: temperature and rain on one scale, arid months dotted, humid ones shaded.',
      'Where a plant\'s Wikidata item names no Commons category and its name\'s holds no files, the category the item links is read, only where Kew\'s file holds that name for this plant alone.'
    ]
  },
  {
    n: 95,
    date: '2026-11-19',
    reader: 'A page now says which of GBIF\'s names it leaves out, and how many records they held.',
    lines: [
      'A page that leaves out records GBIF files under one of its keys, as names Kew holds for another plant, now says which keys and how many: Weingartia canigueralii names 13 keys and the 12 records they took out.',
      'Where a page was merged into another, the page kept now reads what GBIF files under the merged name that Kew holds as its plant, older names among them; every page was built again with the newest rules.'
    ]
  },
  {
    n: 93,
    date: '2026-11-16',
    reader: 'Some species GBIF files under another name now read their own wild records.',
    lines: [
      'A species Kew accepts that GBIF holds as a synonym of another page\'s species now reads its own records, where Kew\'s file holds the name as this plant, of the same type: Oxalis smalliana reads GBIF\'s Oxalis smalliana R.Knuth.',
      'GBIF\'s name for a plant spelt with its epithet in another gender, by the same author, is read as Kew\'s: Rhus copallinum reads GBIF\'s Rhus copallina L. and its records.'
    ]
  },
  {
    n: 92,
    date: '2026-11-15',
    reader: 'Flowering months in the wild are counted for every species at once, from one GBIF download.',
    lines: [
      'Flowering months in the wild are counted for every species page at once, from one GBIF download of iNaturalist\'s research-grade observations, where before iNaturalist was asked a page at a time; each page cites the download by its DOI.',
      'A page with none says it found none under its own GBIF keys: GBIF files some names under another plant, a genus or a family, and those observations are counted there, not here.'
    ]
  },
  {
    n: 91,
    date: '2026-11-14',
    reader: 'A new icon: a plant growing from an open book.',
    lines: [
      'A new icon, a plant growing from an open book, and the site\'s mark beside its name.',
      'Selected text, the front page\'s figure of the day and the link preview take the icon\'s sunflower; the site\'s own colours are as they were.'
    ]
  },
  {
    n: 87,
    date: '2026-11-09',
    reader: 'A new look, browsing by region, family and genus, and new figures on species pages: hardiness, climate class and extinction risk among them.',
    lines: liveLines(R87_LINES, R87_LIVE_STAGE)
  },
  {
    n: 86,
    date: '2026-11-08',
    reader: 'The quoted Wikipedia text is the article\'s opening paragraph, and each photograph\'s credit gives the day it was read.',
    lines: [
      'A plant filed under GBIF\'s name for a page now says "GBIF\'s name for" that page, on the search, the add form, an import and the plant\'s page, never "an older name of".',
      'An old address no longer leads through GBIF to a plant Kew does not give the name to; the not-found page says what Kew holds.',
      'A record that states no country is no longer counted in a native region by the margin or the coast reach.',
      'A cultivated crop Kew lists only as a cultigen, such as the tomato, has no wild habitat climate, and its region is named "(as a cultigen)".',
      'The quoted Wikipedia summary is now the article\'s opening paragraph, read at a named revision; a summary read before says it is the summary service\'s text.',
      'A single photograph\'s credit gives the day it was read; a source that failed lends no day.',
      'Maps below the first screen are drawn as you near them, and offline after an update.'
    ]
  },
  {
    n: 85,
    date: '2026-11-05',
    reader: 'A wild record on another region\'s land no longer counts for a plant\'s native region.',
    lines: [
      'Records on another region\'s land no longer count for a native region: the border rule takes a record inside a region\'s shape as that region\'s.',
      'A plant filed under GBIF\'s name for a page, or kept as typed after the add form named its page, finds that page.',
      'The records a page reads are sampled across its whole range, one grid cell at a time, not the download\'s first rows.',
      'Each photograph\'s credit carries the day it was read from its source.',
      'Echinopsis pachanoi, San Pedro, has a page of its own.',
      'A thin climate names the state or province its typical spot lies in, beside the figures read there.',
      'Each section of the about pages opens with a short summary; the rules are folded under it.'
    ]
  },
  {
    n: 84,
    date: '2026-10-30',
    reader: 'Kew\'s accepted name heads every page, and records are tested against the native regions\' real shapes.',
    lines: [
      'Kew\'s accepted name heads every page that has a Kew entry; GBIF\'s name is kept among its names.',
      '366 of the 369 native regions are tested by their shapes, not by boxes.',
      'Every record, restricted ones included, is tested against the shapes; every page was derived again by this rule.',
      'The reason for extremes set aside is named: the weather cell\'s height, or its nights against the habitat\'s months.',
      'The about pages were rewritten for growers: a summary per section, the rules in short lists, a glossary.',
      'My plants no longer shifts as a large collection opens.'
    ]
  },
  {
    n: 82,
    date: '2026-10-24',
    reader: 'Searching an English name finds its plant first, and a thin climate is marked as from few records.',
    lines: [
      'A species whose English name is the query comes first ("peppermint" is Mentha × piperita); a genus typed alone lists first the species with the most English names ("echeveria" is Echeveria elegans).',
      'A name spelt the same by another author is no longer shown as an older name.',
      '"Not checked" is said once on a page, under the name.',
      'The close-up map names its regions and has a scale bar.',
      'A thin habitat climate is marked "from few records", never hidden.',
      'Replacing a collection from a backup in two tabs at once can no longer lose photographs.'
    ]
  },
  {
    n: 81,
    date: '2026-10-23',
    reader: 'A search kept in the address works again, and every touch target is at least 44 pixels on a phone.',
    lines: [
      'A search kept in the address, reloaded or shared, works again, and Back returns to it.',
      'The 485 hybrid pages carry their ×, with Kew\'s links.',
      'Care groups are given only where Kew\'s own description of the species agrees; four unsourced indoor temperatures were removed.',
      'A one-word group name such as "Cycad" is searched but not shown as a species\' name.',
      'A species page opened by a link is kept for reading offline.',
      'Touch targets are at least 44 pixels on a phone.'
    ]
  },
  {
    n: 80,
    date: '2026-10-22',
    reader: 'A search says its true count, and a page without a GBIF key says why its records were not asked.',
    lines: [
      '"Popular genera" was counted again over the full list: 118 genera, dated 22 October 2026.',
      'A search says its true count ("30 of 259 matches"), and "Show more" lists the rest.',
      '243 of the 369 native regions are tested by shapes made from Natural Earth\'s provinces, where every region was a box.',
      'A tomato\'s cold floor of 18.9 °C is set aside: extremes are not used when the weather cell stands far above or below the spot.',
      'Pages without a GBIF key say why their records were not asked.',
      'Back on a phone returns to the catalogue row you left.'
    ]
  }
];

export interface ChangeLine {
  round: number;
  date: string;
  text: string;
  /** The round on /changes. */
  href: string;
  /** The round's full record on GitHub. */
  record: string;
}

/**
 * The newest lines of the list, for the front page's "Changed lately": the first `count` lines of the newest rounds, in
 * order, each with its round, its date and where to read more. A count below one is none.
 */
export function changedLately(count = 3, rounds: readonly Round[] = ROUNDS): ChangeLine[] {
  const out: ChangeLine[] = [];
  for (const r of rounds) {
    for (const text of r.lines) {
      if (out.length >= count) return out;
      out.push({ round: r.n, date: r.date, text, href: roundHref(r.n), record: recordHref(r.n) });
    }
  }
  return out;
}

/** The newest rounds' reader lines, for the front page's "Changed lately" (round 102): one a round, newest first. */
export function latestReaders(count = 3, rounds: readonly Round[] = ROUNDS): ChangeLine[] {
  return rounds.slice(0, Math.max(0, count)).map((r) => ({ round: r.n, date: r.date, text: r.reader, href: roundHref(r.n), record: recordHref(r.n) }));
}

/** A date as the pages write one: 8 November 2026. Read as a calendar day, never through a time zone. */
export function dayText(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : ymd;
}

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
export const R87_LIVE_STAGE: 1 | 2 | 3 = 1;

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
    n: 87,
    date: '2026-11-09',
    lines: liveLines(R87_LINES, R87_LIVE_STAGE)
  },
  {
    n: 86,
    date: '2026-11-08',
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

/** A date as the pages write one: 8 November 2026. Read as a calendar day, never through a time zone. */
export function dayText(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : ymd;
}

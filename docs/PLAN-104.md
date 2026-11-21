# Round 104: one search, the header's, everywhere (plan)

Round 9 of the second hand-off (finding and exploring species), planned against the code on 21 November 2026, after
round 103 (bc0883b).

## What the code holds

- Two searches. The header's box is `src/lib/browse/SiteSearch.svelte`: a combobox in the ARIA 1.2 pattern, with Browse
  rows from /api/suggest (`suggest.ts`: genus with a place, genus, family, country, region) and six Species rows from
  /api/search. The front page's large box (round 102) is `#search` in `src/routes/+page.svelte`, the catalogue's search
  with results in place (`searchMode`); the header box steps aside while it is on the page.
- A species row's words are why it matched, the English name and the family. A search hit is an `IndexEntry`
  (`src/lib/dossier/index-entry.ts`). That entry holds `low` (the record low), `climate`, `origin` and `photos`. It holds
  no rain a year and no season.

## Where the hand-off does not hold against the code

- **Round 9 is not app-only.** Its species rows say the rain a year and the season in words, and the index entry holds
  neither. Decision: add two fields to the index entry, written by `--index` from each dossier with no corpus build:
  - `rain`: the sum of the monthly medians, in mm, rounded as the glance card rounds it.
  - `yr`: the season key `growingYear` reads (`summer`, `winter`, `frozen`, `spread`, `flat`, `even` or `fog`).
  Round 10 reads the same fields for its filters, so this is the first half of its index change and is not done twice.
- Until the new index is live, a row shows what the entry holds (the record low) and says nothing of the rest. That is
  how every other absent field behaves (rule 2: a field missing from an older index is not said as none).

## The build

1. **SiteSearch takes a `size="large"` form** for the front page. Same engine, same rows, same keys. The front page's
   `#search` is replaced by it on the bare `/` only. Every catalogue address (?by=, ?q=, …) keeps the catalogue box and
   its results in place. "Every species matching …" stays the last row and opens /?q=, the catalogue's list.
2. **Three groups, in order: Your plants, Browse, Species.**
   - **Your plants** is matched in the browser from the open collection, never sent. It reuses the front page's own
     match of plant number, name and field number. Each row gives the species, the count of plants, their accession
     numbers and their space. The group shows only when the device has plants and one matches. A plant number typed
     still sends nothing (`plantNumberShaped`, unchanged).
3. **A species row says figures:**
   - With a climate: "record low 4.4 °C · 941 mm a year · wet winters", in the reader's units. The season words are
     `seasonWords`, the species page's own.
   - With none: its first native region and its count of photographs. It does not say "no habitat climate".
   - Where a genus row's whole genus has none: "38 species, 0 with a habitat climate", said once on that row (suggest.ts
     gets the genus's count with a climate from the browse table).
4. **Enter opens the first row, whatever its kind.** A full species name typed still wins, as now. The panel's foot
   shows the keys on desktop only.
5. **/about/how and /privacy:** one search; Your plants is matched on the device; the figures on a row are the index's.
6. **The index:** `rain` and `yr` written by `scripts/build-dossiers.ts --index` and read by the Worker. The index stamp
   moves. The data step is `dossier --index`, then upload and live-check. It is a plan for the owner's PC, minutes not
   hours, and the app deploy goes first.

## The genus that is held (the third hand-off's round 15a, built in this round)

Checked again on 21 November 2026 against the live site and the code, and it still holds. /api/search answers `[]` for
"monstera albo" and "lithops pink". `relaxedQuery` (src/lib/core/search.ts) keeps a lower-case second word as an
epithet, so for two words its retry is the query itself.

7. **The search page.** When a query of two words or more finds nothing after every retry, and its first word is a
   genus the reference holds, the page says so in /about/how#list's words, with the genus's own count. It links to the
   genus's page, or to the species where the genus has one species. "Which ones" and "add it as a plant" stay. It says
   nothing of what the other words are, and lists no species as if they were hits.
8. **The panel.** For the same query, the genus's row comes first. For a query where nothing matches, one line: "No name
   matches “qzxwvk”".
9. **The head above results** (15c): shown where the page was opened with `q` in its address, and left out where the
   search was typed on a page already open, if that is cheap to tell apart; otherwise left as it is.
10. **Your plants rows show no photograph** without the grower's `referencePhotos` setting (the third hand-off's privacy
    rule for round 9).

## Tests

- **r104a (unit):** the row's words, with and without a climate and in both units; the genus row's "0 with a habitat
  climate"; `rain` and `yr` from a dossier.
- **r104b (browser):**
  - On the bare `/`, the large box is the combobox and shows Browse before Species for "lithops".
  - Enter opens the first row.
  - Your plants appears for a device with a matching plant, and its name is never in a request.
  - With scripts off, the form opens /?q=.
- **Tests that type into the bare `/`'s box** (r102a, r61w, r62bw, r81s, r87l, smoke 1 to 4) are read one by one:
  - those that test the catalogue's results move to a catalogue address;
  - those that test the front page read the new box.

## Report if

- The Your plants match needs the collection opened on the front page before a visitor types. A visitor with plants
  already opens it, so measure that the first screen does not wait on it.

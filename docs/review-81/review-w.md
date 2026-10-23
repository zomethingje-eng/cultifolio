# Review before round 81: reviewer W (desktop grower)

Live site https://cultifolio.com, Worker `00830b85`, corpus `a27e34d376199544`, 2026-10-23 11:58 to 12:50 UTC. Playwright 1.63 with Chromium 141 (`/opt/pw-browsers/chromium`), headless, mouse and keyboard, at 1280×800 for the journeys, with checks at 1024×768, 1920×1080, 640×400 (the layout of 1280 at 200% zoom), dark mode and 390×664. Scratch, scripts and every screenshot are in `/tmp/claude-0/rev81r/W-s/`. The harness is `h.mjs` and `run.mjs`, and each step has its own script (`j1.mjs` to `j12.mjs`, `r80a-d.mjs`, `kb*.mjs`, `big*.mjs` and so on).

## Verdict

**Works, with faults.** A grower can do every central thing on a desktop:

- browse 48,361 species and search them by scientific name, common name, misspelling, older name or region;
- read species pages of every kind;
- add plants from a species page, from the picker, as typed and by importing 300 at once;
- give them spaces, water them, record entries, propagate and print labels at true size;
- back up, wipe, restore and refuse a damaged file;
- change units, set a site and see the frost watch;
- try the example collection and leave it with nothing left behind.

Nothing broke the console apart from one fault, there were no failed requests to the site, no page was wider than the window, and focus was visible throughout. With 300 plants, the collection pages open in 0.5 to 1.9 s.

Four faults matter:

- **Search stops working after a reload.** Reloading the front page during a search, or opening a shared or bookmarked search link (`/?q=…`), throws an error and says "Nothing in the reference matches 'echeveria'". The search then sends nothing for anything typed until `/` is loaded fresh.
- **Compare loses a species.** The compare page's own picker drops the species already in the tray.
- **Hybrid names lose their ×.** 485 reference pages (Kew's nothospecies and nothogenera) show their names without the ×, for example "Mentha piperita L." and "Aloe schimperi Tod.".
- **Older names on imported plants.** An import calls an older name "ambiguous", files those plants as "Name not in the reference" unless each line is fixed by hand, and the plant page then says so. Yet the reference holds Aloe aristata, and `/species/aloe-aristata` redirects to it.

Of round 80's fixes in my area, ten hold. Two are not live yet, as the brief expects: Xanthoceras and the Nairobi marker wait for section (d)'s repair. One shows only its first half until step 12's index: the plant page's "one of those keys" sentence.

## What I covered

- **The journeys.** All twelve journeys as agreed in `journeys.md`, at 1280×800. Journeys 2, 3 and 5, and the search-link fault, were repeated at 390×664, and the layout was checked at 1024, 1920, 640 (200%) and in dark mode.
- **Searches.** 31 queries a grower would type:
  - scientific names: echeveria, lithops, Phalaenopsis, Mammillaria;
  - common names: snake plant, christmas cactus, jade plant, string of pearls, snowdrop, venus flytrap, tomato, zz plant;
  - misspellings: echevria, haworthiaa;
  - older names: Sansevieria trifasciata, Senecio rowleyanus, Lobivia;
  - regions: cape provinces, madagascar;
  - a family: Crassulaceae;
  - hybrids: Aloe × nobilis, x Graptoveria, Mentha × piperita, Aloe × schimperi.
- **Species pages.** 17 pages:
  - keyed, with and without climate: Echeveria elegans and agavoides, Lithops lesliei ("no habitat climate"), Phalaenopsis amabilis, Galanthus nivalis, Dracaena trifasciata, Haworthia akaonii;
  - keyless "not checked": Acharagma galeanense, and Echinopsis crassicaulis, which reads Kew's keys;
  - a merged page reached by its old name: Rebutia fidana → Weingartia fidaiana;
  - a `g` page: Crocus nudiflorus;
  - hybrids: Mentha piperita, Aloe schimperi;
  - Xanthoceras sorbifolium;
  - old-name addresses: sansevieria-trifasciata, senecio-rowleyanus, aloe-aristata;
  - a 404.
- **Collections.** Two device collections:
  - 5 plants, made by hand: from a species page, from the picker, as typed, and with GBIF's key for a keyless name;
  - 300 plants, imported from a pasted list of 43 names (cacti, mesembs, aloes, bulbs, orchids, carnivorous plants, aroids), with a 3000×2000 photograph through the file input.
- **Requests.**
  - About 1,386 to cultifolio.com, counted on the network with cache hits left out. That includes about 120 lost to two runs whose request interception turned the browser cache off.
  - 7 to third parties (one species page with its photographs allowed). Every other third-party image was blocked before it was sent, so none of them reached iNaturalist, Commons or GBIF.
  - Sync was never touched.

## Issues

### W1. Major: a reloaded or shared search says nothing matches, and the search then stops working

- **What I did.**
  - I opened `https://cultifolio.com/?q=echeveria` in a fresh browser (`qlink.mjs`, with the service worker blocked and then allowed: same result).
  - I typed "lithops" on the front page, saw "30 of 43 matches", then reloaded (`qreload.mjs`).
  - On the reloaded page I cleared the box and typed "aloe", then went to Today and came Back (`qreload2.mjs`).
- **What I saw.**
  - Every time, the page throws `TypeError: Cannot read properties of undefined (reading '$set')` (in SvelteKit's `replaceState`, `chunks/BX2deH-7.js` called from `nodes/13`).
  - The address loses `?q=`, and the box keeps the word.
  - The page says **"Nothing in the reference matches 'echeveria'. It holds a fixed list of 48,361 species…, you can still add it as a plant"** (`W-s/qlink-persist=0.png`, `W-s/qreload.png`).
  - After that, typing sends **no** `/api/search` request at all. "aloe" shows "Nothing in the reference matches 'a'", and the error repeats. A client-side round trip (Today, then Back) does not revive it.
  - Only a fresh load of `/` does. It also happens at 390×664 and with a collection on the device.
  - A non-canonical front-page address such as `/?by` throws the same error.
- **Why it matters.**
  - Reloading during a search is common.
  - So is a shared search link, and the app writes the query into the address precisely so that Back and shared links bring it back (the code's own comment).
  - Safari reopens tabs by reloading them, and an installed app restores its last address.
  - The page then states something false and checkable as an absence (rule 2's spirit): "Nothing in the reference matches 'echeveria'" when there are 259.
- **Where it comes from** (my reading of the code; the error is proved).
  - `src/routes/+page.svelte:34-39`: an `$effect` calls `replaceState(u, page.state)` whenever the address differs from what it computes.
  - At first render `keepLocal` is true because `collection.ready` is false (`:426`), so the effect deletes `q` and calls `replaceState` before SvelteKit's router is up. That is the TypeError.
  - The search effect (`:464`) returned early with `found = []` for the same reason. The throw leaves the page's effects in a state where they never run again.
  - No browser test opens `/?q=` (`grep` of `tests/`: none).
- **What should happen.** Opening `/?q=echeveria` should show the 259 matches. Writing the address should wait for the router (`afterNavigate`, or a check that the router is up), and should not drop `q` while the collection is still loading.

### W2. Major: in Compare, the page's own picker drops the species already in the tray

- **What I did.**
  - On `/species/echeveria-elegans` I pressed Compare. The tray said "Compare 1, pick one more".
  - I followed the tray's link to `/compare`, which says "In the tray: Echeveria elegans. One more to compare."
  - In its "Add a species" field I typed "Echeveria agavoides" and picked it (`j5.mjs`).
- **What I saw.** The page went to `/compare?s=echeveria-agavoides`, with one column. Echeveria elegans was gone (`W-s/j5-compare2.png`, the same at 390×664). Starting from `/compare?s=echeveria-elegans` instead, the picker gives `?s=echeveria-elegans,echeveria-agavoides` (`W-s/cmp-ok.png`). So the fault is the tray's route, which is the one the species page offers.
- **Where it comes from.** `src/routes/compare/+page.svelte:147`: `withSlug` builds the address from `cols`, the address's columns, and ignores `compare.picks`, the tray. With one pick in the tray, `cols` is empty.
- **What should happen.** The tray's species should come first (`compare.picks` when `cols` is empty).

### W3. Major: hybrids lose their × on 485 reference pages, in their names, headings, titles and search

- **What I did.** I searched "Mentha × piperita" and "Aloe × schimperi" (`/api/search`), opened `/species/mentha-piperita` and `/species/aloe-schimperi`, and read `/api/dossier/k125188` (`W-s/api/k125188.json`).
- **What I saw.**
  - **Mentha piperita.**
    - The heading is "Mentha piperita L." and the title "Mentha piperita (Peppermint)…" (`W-s/sp-mentha-piperita.png`).
    - The dossier's `name.scientific` is "Mentha piperita".
    - Kew's row (`wcvp_names.csv`, id 125188, the page's own `k125188`) is `Mentha | × | piperita`, with the hybrid formula "M. aquatica × M. spicata".
  - **Aloe × schimperi** shows as "Aloe schimperi Tod." with the common name "Spotted aloe hybrid".
  - **Search.** "Mentha × piperita" finds "Mentha piperita".
  - **How many.** `scripts/species-list.txt` holds 473 nothospecies ("Genus × epithet") and 12 nothogenera ("× Brassarda juncea" and others), and the reference names them all without the sign.
- **Why it matters.** A grower reads a hybrid as a wild species. Such pages show a "habitat climate" for a cross, and a grower who looks up "Mentha × piperita" finds a different-looking name. This is the reference's own pages. It is not the queued "your species" tile fault (W10 of round 80, the device's slugs).
- **Where it comes from** (my reading). The name is GBIF's canonical name (`name.scientific`), which leaves out the ×, while Kew's `species_hybrid` and `genus_hybrid` columns carry it.

### W4. Major: an import files older names as "Name not in the reference", although the reference holds them

- **What I did.**
  - I pasted 300 plants into `/plants/import` (`import300.txt`, 43 names including "Aloe aristata" and "Echinocactus grusonii"), pressed Check names, then "Add 300 plants" (`big1.mjs`, `big2.mjs`).
  - I opened one of the plants (`big4.mjs`).
- **What I saw.**
  - The review said "Matched in the reference: 273 · ambiguous, another name suggested: 24 · …". Each such line reads "ambiguous: not under this name; an older name for Aristaloe aristata? Use it" (or Kroenleinia grusonii), with one "Use it" button per line and no way to accept a suggestion for every line of that name.
  - Those 24 plants were added as typed. Plant 2026-0276 says **"Aloe aristata · Name not in the reference"**, with no link to a species page (`W-s/big-aloe-aristata.png`).
  - The "You grow" tile says "Aloe aristata · not in the reference" (`W-s/big-.png`).
  - But `/species/aloe-aristata` answers 302 to `/species/aristaloe-aristata?was=Aloe%20aristata`, so the reference itself treats the name as unambiguous.
- **Why it matters.**
  - Older names are what succulent growers' labels carry (Aloe aristata, Echinocactus grusonii, Haworthia attenuata).
  - The word "ambiguous" is wrong for a name Kew places under one accepted name (rule 3 has it as unambiguous).
  - The plant page's "not in the reference" is false.
  - With 300 plants, fixing them means one click per line.
- **What should happen.** Say "older name for …", offer "use it for all N lines of this name", and file the plant under the accepted page. Failing that, have the plant page say "an older name of Aristaloe aristata", as the species address already does.

### W5. Minor: a search hit found by an older name does not say so

- **What I saw.**
  - Typing "Sansevieria trifasciata" lists one hit, "Dracaena trifasciata · Snake plant · Asparagaceae", with nothing saying why (`W-s/j3-sans.png`). Opening it from the list gives no synonym line.
  - "Lobivia" lists "30 of 40 matches" under Acanthocalycium, Aylostera, Chamaecereus and Echinopsis, and none of them says it was matched as Lobivia.
  - The direct address `/species/sansevieria-trifasciata` does say "Sansevieria trifasciata is a synonym…" (via `?was=`).
- **Where it comes from.** The hits carry `syn` (`/api/search`), but the front page never shows it.
- **What should happen.** Add "older name: Sansevieria trifasciata" on the hit, and pass `?was=` on the link.

### W6. Minor: the label's care line is cut off in the middle of a figure

- **What I saw.** On Avery 5160 (each label 252×96 CSS px, true size 2⅝ × 1 in, checked in the print media and the Letter PDF), the line reads "summer rain Jun–Oct · floor 31.5 °F (1 in 100, NASA POWER) · open sky 30–…" (`W-s/j9-pdf-zoom-1.png`, `W-s/j9-labels.pdf`).
- **Why it matters.** A figure with its end cut off is not a figure. Either drop the last clause whole, or shorten the sources ("NASA POWER" to a mark).

### W7. Minor: accessibility and keyboard polish

- **Plant log.** Every "×" is named "Remove this entry", with no date or kind, so a screen reader hears five identical buttons (`src/routes/plants/[acc]/+page.svelte:816`).
- **Search results.** Each result link's name starts with the placeholder's letter and ends with "›": "L Lithops aucampiae Aucamps Living Stone · Aizoaceae · no habitat climate ›".
- **Propagation form.** The species combobox's accessible name is the whole hint, about 300 characters ("Species GBIF 8315197 A species, a cultivar (Monstera deliciosa 'Thai Constellation'), or a hybrid: …"). It belongs in `aria-describedby`.
- **Add form.** `/plants/new` does not put focus in the species field: it takes 13 Tabs from the top. The front page's own search does take focus on desktop.

These are all from the accessibility tree and Tab walks (`a11y.mjs`, `kb.mjs`, `kb3.mjs`).

### W8. Minor: a blank pre-treatment is shown as "none", beside "not stated" for the other blanks

- **What I saw.** A batch started with all optional fields blank says "Medium not stated · Container not stated · Pre-treatment none" (`/propagation/S2026-001`, from the `j8.mjs` output). "none" says the seed was untreated, which the grower never said.

### W9. Minor: a photograph that fails leaves a placeholder over half the frame and an empty band under it

- **What I saw.** In light and dark mode, the species page's main photograph, when it fails, shows "photograph did not load" in the top 200 px of its frame and a blank band of about 100 px below (`W-s/j2-elegans.png`, `W-s/vis-dark-species-crocus-nudiflorus.png`).
- **Note.** Here the failure came from my blocking of third-party images. Real visitors see the same when Commons refuses, as it did to this machine in round 80.

## Confirmed working

**Round 80's fixes in my area:**

- **W1 (Most grown).** The chip counts 8,278 species. Phalaenopsis and Picea now appear under P (`W-s/mostgrown-P.png`), and `/about/how` gives "22 October 2026… over 6,539 genera… 6,449 of them were counted".
- **W2 (search count).** The line reads "30 of 259 matches", and "Show 60 more" gives 90 of 259. A genus typed alone links "its row of the catalogue" (`/?by=genus&open=echeveria#g-echeveria`). This holds only on a fresh page (see W1).
- **W4 (keyless plant notice).**
  - The plant page now says "its page reads GBIF's records under the keys of the names Kew's World Checklist holds as this plant".
  - The picker marks GBIF's row: "GBIF's name service, key 5623025; the species page of this name holds no GBIF key".
  - The "one of those keys" branch cannot show yet. The live sheets carry no `keys` (0 of 542 sheets in buckets a4, 67 and 6b), so the plant with key 5623025 is told it is "no species page's own" while the page reads that key. It will hold when step 12's index writes round 80's sheets.
- **W6 (region search).** "cape provinces" says "a region of origin; in the Origin grouping it is part of Southern Africa", with a link. "madagascar" gives 1,187 matches and the region line.
- **W7 (search speed).** The list settles 0.58 to 1.59 s after the last key (20 queries). Curl's time to first byte for `/api/search` is 0.43 to 1.29 s.
- **W8 (letter index).** One line at 1024 px (`W-s/vis-w1024-by-genus.png`).
- **W9 (notices over the heading).** Notices now sit at the foot of the page (`W-s/j6-plant.png`).
- **W11 (picker).**
  - "Aloe × nobilis" now offers only Aloe nobilis and its variety.
  - An unknown name says "press 'Add as typed'", and the button says the same.
  - Haworthia fakeii was kept as typed (2026-0004).
- **W12 (two rain totals).** The season strip no longer gives a second year total (Crocus nudiflorus).
- **W13 (layout).** Echinopsis crassicaulis's facts card is whole, and the evidence reads "rests on the one georeferenced record".
- **W14 (missing address).** A missing species address answers 404 in 1.6 s (was 4.4 s). Old names redirect in 0.42 to 0.70 s.
- **P1 (Back to the catalogue).** After opening Haworthia akaonii from the Haworthia row and pressing Back, the tile is at the same place on screen: 232 px from the top, before and after.

**Not live yet, as the brief expects:**

- **W3.** Xanthoceras sorbifolium still says Poaceae.
- **W5.** Dracaena trifasciata's marker is still −1.253, 36.81 (Nairobi), with a "southern hemisphere" chart.

Both wait for section (d)'s repair and upload.

**The journeys and the rest:**

- **First visit.** First page from cold (fresh browser, 1280): time to first byte 388 ms, DOMContentLoaded 650, load 1,036, LCP 940 ms, CLS 0. 370 KB transferred, 748 KB decoded, 127 resources.
- **Species page from cold.** First byte 415 ms, load 693, LCP 676 ms, 198 KB. Warm: LCP 228 to 296 ms, 0 KB transferred. Other species pages: first byte 495 to 914 ms, load 724 to 1,836 ms.
- **Keyless page.** It says "Not checked" in every section with its reason and "This is not a statement that no climate exists", and nowhere says "none" for the reference.
- **Collection flows.** All worked:
  - add from a species page (Add to the plant page in 2.4 s), with the source kept;
  - a new space "Windowsill", Move, Water all, Undo ("Undone: the 1 watering line removed"), and Water again;
  - a leaf-cutting batch of 6 with one struck counted, linked both ways;
  - Fed, Flowered, Measured and Repotted, and the Died form;
  - a 3000×2000 photograph, resized to 1600×1067 and made the cover.
- **Labels.** 3 labels at true size (Avery 5160 cells 252×96 px in print media; Letter PDF, one page).
- **Backup and restore.**
  - Backup is one 3,314-byte zip.
  - After clearing the site's data: "Nothing here yet".
  - The damaged file (cut to half) gives "That file is not a readable zip: it may be damaged or not a Cultifolio backup. Nothing on this device was changed."
  - The good file previews "3 plants · 7 timeline entries · 1 space · 1 propagation batch". The merge brings back every plant, the space, the log and the batch, and a second restore says "Nothing changes".
- **Settings.**
  - Units switch the species and settings figures (−0.3 °C / 31.5 °F).
  - With the reference photograph on, the plants list asks 3 third-party images and a plant page 1. Off, the plants list, plant, Today and batch pages ask 0.
- **Frost watch.** With a site set (51.5, −0.12): "No frost in the next 228 hours of forecast; coldest 43.7 °F… (MET Norway)", through the site's own `/api/forecast`.
- **Example collection.** It opens in 3.3 s and shows 12 plants and Today. Leaving it returns to `/` and leaves the device's database with 0 changes and 0 order rows.
- **300 plants.**
  - Import checked 300 lines in 9.1 s with 15 API requests.
  - Pages: `/plants` 1.19 s, `/today` 0.78 s, `/places` 0.52 s, `/labels` 0.83 s, `/` 1.88 s.
  - Backup 0.8 s; own search 0.48 s.
- **Keyboard and screen reader.**
  - Every Tab stop I met (66 across four pages) had an outline or box shadow when focused; on the species page I checked by eye that the ring shows.
  - The add form's species field is a proper combobox: `aria-expanded`, `aria-controls`, `aria-activedescendant` follow ArrowDown, and Enter picks.
  - The plant menu is a `menu` with `menuitem`s.
  - The species page has banner, breadcrumb and main navigation, main, a "Sections" navigation, a "region" and contentinfo, with one h1 and h2/h3 in order. Every image has alt text, and the maps are named `img`s.
  - The search count is a `status` live region ("30 of 43 matches").
  - `lang="en-GB"`.
- **Layout.** No page scrolls sideways at 640 (200%), 1024, 1280 or 1920, light or dark. The wide tables scroll inside their own boxes.
- **Reduced motion.** From the code, not run: `theme.css:228` turns animations and transitions off, and the layout reads the preference.
- **Network.** Pages asked only cultifolio.com, plus images from inaturalist-open-data.s3.amazonaws.com, upload.wikimedia.org and api.gbif.org (the occurrence image cache). There were no fonts, analytics or other hosts. The forecast goes through the site.
- **Console.** No errors other than W1's, with the service worker allowed or blocked. (The warning "service worker not registered" appears only because the harness blocks the worker.)
- **About pages.** `/about/how` (93,247 characters) and `/about/formats` (98,949) open in under 0.7 s. The "Most grown" paragraph matches the chip.

## Mobile against PC (the twelve journeys)

The phone column is my own short repeat at 390×664 where marked "W"; the rest is P's to fill from P's report.

| # | Journey | Desktop (1280) | Phone | What differs | Right? |
|---|---|---|---|---|---|
| 1 | First visit, by genus, H, Haworthia, Back | Works: 48,361 / 37,788; letters on one line; Back returns the tile to the same place on screen | P | — | — |
| 2 | Search "echeveria", Show more, open, Back | Works: 30 of 259, 90 after "Show 60 more", Back keeps the query. A reload of the result fails (W1) | W: the same search faults; with plants on the device the box searches "Your species" first and offers "Search the whole catalogue" (as on desktop) | none found | — |
| 3 | "snake plant", "Sansevieria trifasciata" | Works: Dracaena trifasciata first both times; the old name is not explained (W5) | W: as desktop (own-plants view first) | none | — |
| 4 | Keyless page (acharagma-galeanense) | Works: "Not checked" with reason in every section; never "none" | P | — | — |
| 5 | Compare from a species page, add through the picker | **Fails**: the tray's species is dropped (W2) | W: **fails** the same way | none | the fault is in both |
| 6 | Add a first plant from a species page | Works: 2026-0001, source "Seed swap" | P | — | — |
| 7 | Space "Windowsill", Water all, Undo, water | Works | P | — | — |
| 8 | Leaf cuttings 6, one struck | Works; plant ↔ batch linked | P | — | — |
| 9 | Labels for three, print preview | Works, true size; care line cut mid-figure (W6) | P | — | — |
| 10 | Back up, clear, restore; damaged file | Works; damaged file refused, nothing changed | P | — | — |
| 11 | Units; reference photographs on/off | Works; 0 third-party requests when off | P | — | — |
| 12 | Example collection, leave | Works; nothing left in the device's database | P | — | — |
| — | Open `/?q=echeveria` (outside the twelve) | **Fails** (W1) | W: **fails** the same way | none | the fault is in both |

## Not checked, with why

- **The service worker's install, offline use and update.** The worker was blocked in most runs to keep within the request budget (an install costs about 146 requests). That is C's and P's.
- **Sync.** Not exercised, as the brief requires.
- **Firefox and WebKit.** Not available here.
- **Photographs page by page.** Only Echeveria elegans was loaded with images (7 iNaturalist images, all 200). Related tiles there, and Haworthia bayeri's tile, say "Photo: CC0" with no name, and the dossier's attribution is "no rights reserved" with no observer (round 80's D8). Whether the fill rewrites these pages before the upload is for D and B.
- **A real print dialog.** Not run: printing used Chromium's print media and PDF only.
- **The bottom bar and touch targets at phone size.** P's.
- **The dark-mode empty band above the map caption** (round 80's W13 third part). Not looked at.

## Needs from the PC

None.

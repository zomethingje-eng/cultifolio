# Round 59 review: product (positioning, adoption, launch)

> **Withdrawn after verification (REVIEW-SELF-59):** the logging finding below read the sandbox's stale copy of `wrangler.jsonc`. The deployer's file on the PC, which is the one deployed, has `"observability": { "enabled": false }`. `/about/how`'s "the server does not log paths" holds for the deployed Worker.


Reviewer area: product. Read README.md, the launch draft, docs/UX-REVIEW.md, DEVLOG rounds 53 to 59, /about/how, the front page and the species page as served by the shared build at http://127.0.0.1:4180 (four-species fixture corpus). The live site is not reachable from this machine, so anything about the real 8,947-species corpus (common names, the catalogue's first rows, real page length) is read from the code and the docs, not seen. Market facts come from web searches made on 2026-10-04 and are cited inline; Reddit itself could not be fetched from here, so subreddit sizes are left unverified on purpose.

Scratch and screenshots: /tmp/review59/product/ (s1.mjs, s2.mjs, stranger-qr.png, visitor-today.png, sp404.png, page text dumps).

---

## Part A. Findings

### 1. P0. "The server does not log paths" is not true of the configuration being deployed (confirmed by reading; dashboard not reachable)

- `wrangler.jsonc:9` sets `"observability": { "enabled": true }`. Cloudflare's Workers Logs documentation says each invocation then writes an invocation log "that contains details such as the Request, Response, and related metadata"; for a fetch that means the method and URL. Logs are kept 3 days on the free plan and 7 on paid, and can be queried in the dashboard. Invocation logs are on by default and are turned off with `invocation_logs = false` ([Workers Logs docs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
- The URLs that would be kept are exactly the private ones /about/how lists. `/api/forecast?lat=..&lon=..&alt=..` carries the grower's rounded site coordinates (`src/lib/weather/client.ts:68`). `/api/search?q=` and `/api/names?q=` carry what was typed (`src/lib/ui/index.svelte.ts:118`, `SpeciesPicker.svelte:50`). The hash-bucket requests show which species buckets a grower holds. `/plants/2026-0001` is fetched on the first visit after install. Each of these would sit in a searchable log next to its timestamp and the request metadata.
- What the site says: `/about/how` (src/routes/about/how/+page.svelte:90) says "The server does not log paths". Line 86 says "The server keeps short-lived rate counters by address, dropped within two days, and nothing about your plants." Settings (src/routes/settings/+page.svelte:229) says "Nothing on this site is stored about you beyond short-lived rate counters".
- the launch draft's checklist also says to keep `npx wrangler tail` open for the first hour. That streams every request URL to the author's terminal for as long as it runs.
- Why this is the top finding: a first-time reader who opens `wrangler.jsonc` (13 lines) will find it within minutes, and the whole pitch rests on the privacy claims being exactly true.
- Smallest fix: `"observability": { "enabled": true, "logs": { "invocation_logs": false } }`. Metrics (request counts, errors, CPU) stay available in the dashboard. Run `wrangler tail --status error` instead of a full tail. Add one sentence to /about/how saying what Cloudflare, as the host, sees at its edge (aggregate request metrics, the operator's console.warn lines, which name no person). Then check in the dashboard that no invocation log is being kept.

### 2. P0. The launch draft is not ready to post (confirmed by reading the launch draft)

- **Length.** The post body is 603 words (counted between the `---` rules), against the draft's own rule of "under 300 words". The whole second paragraph is the /about/how privacy list repeated word for word. That list is the most argumentative text in the project, so posting it in full gives commenters a dozen clauses to pick at.
- **Unanswered pricing.** The bracket "[Sync is open today and costs nothing ... Say here what you intend, in one sentence ...]" is still a placeholder. "Will sync stay free?" is a certain question. The answer the project has settled on (hosted sync as the paid part, self-hosting possible under AGPL) has to be in the post.
- **First sentence vs current use.** The post opens "I grow cacti and succulents and got tired of ...". The review brief says "Nobody uses it yet, the author included". A collection tracker launched by an author whose own collection is not in it will be found out the first time someone asks "how many plants do you track in it?"
- **AI authorship is not disclosed.** DEVLOG round 58 says "Three agents built most of the grower flows and a fourth the accessibility pass". The docs folder holds 66 review files, mostly by language models. Readers will see both. The launch forum's rule is "something you've made"; a 2026 thread argued that agent-built projects fail it, and the poster's defence (the design and decisions were his) was accepted. Saying it in the post makes it a strength: the code was written with AI, the species pages may not be, and that difference is the product. Leaving it unsaid turns it into an exposé.
- **No links to a strong example.** A curious reader should land on one species page that shows the climograph, a winter-rainfall season and photographs, and on a sample collection (see 3). The post links only the bare domain and /about/how.
- A rewrite is in Part E.

### 3. P1. A visitor cannot see half the product without typing in their own plants (confirmed: no sample or demo path in src/)

- `grep -i "sample collection|demo"` over src/routes and src/lib/ui finds nothing.
- A first-time visitor to /today sees "No site set" and "No growing plants yet" (visitor-today.png).
- An first-time reader will not enter twenty plants to find out what Today, places, propagation batches, labels and frost watch do. The tracker is the part that makes the site worth returning to, and on launch day it will be invisible.
- Smallest fix that keeps rule 5: "Look around with a sample collection". It opens a separate IndexedDB vault under another name (never the grower's log), seeded from a fixed file of about 25 plants of species in the corpus, with places, a batch, waterings and one frost night. It shows a persistent banner ("Sample collection: nothing here is yours. Leave"), and leaving deletes that vault. Sync and backup are disabled while it is open. The fixed file is the same kind of thing as `fixtures/`.

### 4. P1. No import: the serious collector, who is the beachhead, has to retype everything (confirmed by reading)

- Backup writes `plants.csv`, `batches.csv` and `events.csv` (src/routes/backup/+page.svelte:134), but nothing reads a CSV.
- The add form takes one species at a time, with "How many" for copies of the same species (plants/new/+page.svelte:234).
- DEVLOG round 57 removed the only importer, the one for v2.
- The people most likely to adopt (collectors with 100 to 1,000 accessions) keep them today in spreadsheets, Access databases, Cactus Album ([andrewnicolle.com](https://andrewnicolle.com/all_apps/cactus-album)) or the Windows "Cactus & Succulent Collector Database" (AUD 39.95, Excel import and export, [databasebase.com.au](https://www.databasebase.com.au/cactus-and-succulent-collector-database-2/)). Retyping 300 plants is where they stop.
- Fix: a CSV and paste import on the device.
  - Map columns onto name, number, field number, source, acquired date, place and notes, and preview the result.
  - Write one `acquire` change set per row, so an import is just more changes and nothing new for the fold.
  - Keep imported numbers where present (the form already has "Use my own number").
  - Nothing goes to the server except the bucket requests that already exist.

### 5. P1. iPhone growers can lose a collection they never installed, and installing does not bring it along (suspected; iOS not available here)

- WebKit's tracking prevention "deletes all ... script-writable storage after 7 days of no user interaction with the website", IndexedDB included. Home-screen web apps are exempt and "maintain isolated storage separate from Safari" ([webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/)).
- The install bar appears only on the second day the app is opened (src/lib/ui/InstallBar.svelte:30). By then the plants are in Safari's storage. Its iOS text is only "In Safari: tap Share, then Add to Home Screen" (line 65), and the installed app will open empty.
- The only other warning is a muted one-liner on /plants: "Kept in this browser only: back up or install the app." (plants/+page.svelte:179).
- A beginner who adds plants in Safari and leaves them alone through a dormant month is the expected case for this audience.
- Fix:
  - On iOS in a browser tab, put the install step before the first plant: in the welcome card and on the add form, "On iPhone, add Cultifolio to your home screen first: plants added in Safari stay in Safari."
  - When the installed app starts empty and the browser tab has plants, the tab should offer "Move my plants into the app" (a backup file restored in the app is the honest way to do it).
  - Make the 7-day risk a full notice, not muted text, once a Safari-tab collection is five days old with no backup.

### 6. P1. Species pages are built to lose the search result to Wikipedia (confirmed by reading the served HTML)

- `<title>Copiapoa cinerea · Cultifolio</title>`. The meta description is the Wikipedia lead clipped to 155 characters (species/[slug]/+page.svelte:41, 256), so Google is offered the same snippet it already has from Wikipedia, which will always outrank it.
- The figures no other site has (rain, cold nights, light, rain season) are in neither the title nor the description. Common names are shown under the name (line 297) but are not in the title.
- The search index keeps only the first English vernacular name (`scripts/build-dossiers.ts:127`: `vernacular.find((v) => v.lang === 'eng')`). A visitor typing "string of pearls" finds the species only if GBIF happened to list that name first. On the fixture, `/api/search?q=tree%20tumbo` returns `[]`.
- Who ranks today for "Copiapoa cinerea care":
  - World of Succulents, a CactiGuide thread, Wikipedia, vendors;
  - programmatic care pages from greg.app, plantiary.com, getgrowli.app and botanicohub.com.
- For "...habitat climate rainfall minimum temperature" there is no data-driven page at all, only Greg's "Hardiness Zones" page and the BCSS genus notes (searches on 2026-10-04).
- That second query is the one Cultifolio should own.
- The one plant launch with traction (GetAnyPlant, 427 points, 132 comments) drew complaints about common-name search ("if I type in 'ficus ginseng' I don't see a result") and requests for hardiness zones and native-range filters.
- Fix (rule 1 allows a figure with its source, so this stays within the rules):
  - Title: `Copiapoa cinerea (common name if any): habitat rain, cold nights and light | Cultifolio`.
  - Description built by rule from the figures: "In the wild in northern Chile: 72 mm of rain a year, 1 night in 100 below 6.5 °C, light 30 to 65 DLI. Every figure sourced (CHELSA, NASA POWER, GBIF)."
  - Fall back to the Wikipedia lead only when there is no climate.
  - Index every English vernacular name, not only the first.

### 7. P2. The species page speaks methodology, not grower (confirmed, counted on the served page text)

- In the 1,976 words of copiapoa-cinerea's text, "CHELSA" appears 21 times, "rule" 13, "median year across the grid cells" 8 and "NASA POWER" 7. "water" appears twice, both times to say the page says nothing about water. "dormant" and "dormancy" appear zero times.
- What growers ask is: how cold can it take, when does it grow and when does it rest, how much light. The page answers all three, but under invented labels: "Cold floor", "archetype table", "In short · by rule, from the cards · not written by a person", "Rain rule: no rainy season to read".
- The plant page's tile reads "No rainy season to read. 2.8 in a year; the temperature rule's cooler six months May–Oct (S), shifted to the north (no site set): Nov–Apr (CHELSA)." (/tmp/review/grow/f4-plantpage.png).
- Fix, with the same figures and new labels:
  - "Coldest nights in the wild" for Cold floor.
  - "Rain falls in the cool months (winter-rainfall habitat)" as the lead where sheet.ts already reads `grow: 'winter'` (sheet.ts:296 already says "read as a winter growing season").
  - "Light in the wild: 30 to 65 DLI (useful for setting grow lights)".
- Longer term: a habitat zone number read by a stated rule from the mean of each year's coldest night, labelled "habitat zone, not a hardiness rating". "Hardiness zone" is the term growers type into search. The dossier does not keep the yearly minima today (`climate.extremes` holds years, minAbs, minP01, maxP99, frostDaysPerYear), so this is a build change.

### 8. P2. A plant label's QR code is a dead end for anyone else (confirmed: stranger-qr.png)

- Labels encode `${location.origin}/plants/${a.id}` (labels/+page.svelte:151). On any device but the grower's, that page says "No plant with this number on this device." and nothing more.
- Labels are the only part of the app that leaves the house: offsets and seedlings change hands at club sales, swaps and shows.
- Fix: put the species in the fragment, which never reaches the server: `/plants/2026-0001#copiapoa-cinerea`. On a miss, say "This label is from someone else's collection: Copiapoa cinerea. Its species page · Add it to my plants". The species is already printed on the label, so the fragment reveals nothing the label does not.

### 9. P2. Nothing brings a grower back (confirmed by reading)

- No Notification or PushManager use anywhere in src/.
- Watering is due at a fixed 21 days unless a place sets a rhythm (collection.svelte.ts:12, 1079).
- The frost warning, the most valuable alert a grower can get, reaches them only if they open the app that evening.
- See 4.1 for options that keep the rules.

### 10. P2. Visitors see five tabs, four of them for things they don't have yet (confirmed by screenshot; suspected regression)

- /tmp/review59/visitor/home-m-fold.png (fresh context): Species, My plants, Places, Propagation, Today.
- UX-REVIEW.md "What not to change" lists "the tab bar's two-place visitor state". The layout (src/routes/+layout.svelte:42, 188) no longer has one.
- Places and Propagation mean nothing to a stranger.
- Fix: for a visitor with no records, show Species and My plants only, as the review intended.

### 11. P2. Shared links to the front page show no plant (confirmed: static/og.png)

- og.png is 1200×630 of text: "Cultifolio / A reference for growers of cacti, succulents and bulbs, every figure with its source...".
- On Reddit, Facebook and Discord, where growers actually share links, a text card loses to every photo card around it.
- Fix: build og.png from the Share card renderer (src/lib/share/card) for one fixed species with a photograph and climate, chosen by a stated rule, so it is not editorial.

### 12. P3. The service worker asks for /.assetsignore on every first visit and gets a 404 (confirmed)

- `static/.assetsignore` (contents `s/`) is in `$service-worker`'s `files`, which `PRECACHE` spreads (src/service-worker.ts:39).
- `curl /.assetsignore` returns 404. The install logs "service worker: 1 of N files not cached at install" (line 48).
- An first-time reader with devtools open sees a red 404 on the first load.
- Fix: `files.filter((f) => !f.split('/').pop()!.startsWith('.'))`.

### 13. P3. Twelve of the first visit's 19 Worker requests are app shells the visitor may never open (measured, s2.mjs)

- On a first visit (front page, one search, one species page), 19 requests reached the Worker: `/`, `/service-worker.js`, eleven SHELLS (`/plants`, `/plants/new`, ... `/offline`), `/api/corpus`, one search, and the species page.
- These shells are `ssr = false` (plants/+layout.ts:2), so they are the same empty document every time and could be prerendered as static assets, which Workers serves without invoking the Worker.
- This is not a cost problem (see 5.4) but halves the Worker load during a spike.

---

## Part B. The market (1)

**Who grows these plants, from largest group to smallest, and what each wants**

| Segment | Size signal | What they want | Fit today |
|---|---|---|---|
| Beginners with a windowsill of succulents | the mass market that Planta, Greg and PictureThis monetise at $30 to $45 a year | "what is this", "why is it dying", "when do I water" | weak: no ID, no diagnosis, the reference is dense |
| Houseplant generalists (Monstera, Hoya) | same apps | reminders, care sheets | weak: the corpus includes the 2,500 most cultivated iNat species, but the pitch says cacti, succulents and bulbs |
| Serious collectors (100 to 1,000+ accessions, field numbers, seed raising, lights or greenhouse) | CSSA about 2,000 members and 80+ affiliated clubs ([Wikipedia](https://en.wikipedia.org/wiki/Cactus_and_Succulent_Society_of_America)); BCSS about 3,000 members and 80+ branches ([Wikipedia](https://en.wikipedia.org/wiki/British_Cactus_%26_Succulent_Society)); plus the forum and Instagram crowd | habitat conditions, accession records, labels, sowing records, privacy about what they own | strong: this is the beachhead |
| Seed raisers | the CSSA Seed Depot, Koehres, Mesa Garden customers | batch records, germination counts, potting up into numbered plants | strong: propagation batches already do this |
| Clubs and societies | about 160 local groups across CSSA and BCSS alone | show labels, plant-sale labels, cultivation talks | medium: labels yes, but nothing yet that a club uses as a group |

**Where they gather.** r/succulents, r/cactus and r/houseplants on Reddit (sizes not verified from here; check before quoting a number). CactiGuide's forum, which runs an online talks series ([cactiguide](https://www.cactiguide.com/forum/viewtopic.php?t=45446&start=15)). Facebook groups by genus. Instagram and, for the Japanese, Korean and Thai collector markets, their own platforms. Club meetings and shows.

**What they use now**

| Tool | What it does well | Price |
|---|---|---|
| Planta | reminders, light meter, polish | Premium $35.99/yr ([getgrowli, verified Jul 2026](https://www.getgrowli.app/blog/plant-app-prices-2026)) |
| Greg | generous free tier, watering by pot and window | up to $39.99/yr (same source) |
| PictureThis | photo ID, diagnosis | Pro $39.99/yr, trial only (same source) |
| PlantIn / Blossom / Plantum | ID plus care | $29.99 to $79.99/yr (same source) |
| PlantNet, iNaturalist | free ID, the occurrence data Cultifolio is built on | free |
| Llifle, World of Succulents, cactus-art.biz | written species accounts, photos | free, ad-supported |
| POWO (Kew), GBIF | authoritative names and ranges | free |
| BCSS field number DB (Ralph Martin); rarecactus.com (58,000+ field numbers) | field-number lookup ([fieldnos.bcss.org.uk](https://fieldnos.bcss.org.uk/), [rarecactus](https://rarecactus.com/field-numbers/)) | free |
| Spreadsheets, Access, Cactus Album, the Windows collector DB | accession records the grower controls | free to AUD 39.95 |
| Cactilog | "complete platform for cactus and succulent enthusiasts" (could not fetch the site from here) | unknown |

Nobody else offers habitat climate read across every wild record, with sources, on a page per species. The consumer apps write their care advice (more and more of it generated). The free references are prose. The collection tools are private but have no reference behind them.

---

## Part C. Positioning (2)

**The one-sentence promise, by audience:**

- **Serious growers:** "See the weather where your plant grows wild: its rain, its coldest nights and its light, worked out from every wild record, never copied from a care sheet. And keep your collection under its own numbers, on your own device."
- **Beginners:** not the launch audience. Don't water the pitch down for them. They arrive through search later (see 6) and leave through "Add one to my plants".
- **One line:** "A plant reference with no written text: every number derived from open data by a stated rule, and a local-first, end-to-end encrypted collection tracker."

**Is "every figure sourced, no accounts, local-first" a selling point to growers?**

- **Sourced, and not written by AI: yes**, and more so every month. The search results for any rare species are now full of generated care pages (greg.app/plant-care, plantiary, getgrowli, botanicohub). Collectors already distrust copied advice; CactiGuide threads take apart care claims line by line. For growers, say it as "not written by AI, not copied: every number links to where it came from".
- **No accounts: yes**, for everyone, because it removes friction. Say "no sign-up".
- **Local-first and end-to-end encryption:** to growers this is a technicality. The grower version is "nobody can see what you grow or where". That matters to collectors of rare and poached plants (Copiapoa and Ariocarpus collectors know the poaching stories). Use it with growers in one line, not as the headline.
- **Open source and documented formats:** for growers this is "your records outlive the app: one zip with CSVs".

**What the front page should lead with:**

- A visitor with no plants:
  - first a one-line promise in grower words;
  - then a photographed strip of species (round 58 added this);
  - then one climograph of a well-known species, drawn the way the Share card draws it, labelled "This is what every species page shows";
  - then the search.
- "Free and open source" and "no account" go in a single mono line under the promise.
- The 50-word sentence that opens the page today ("A reference for people who grow cacti, succulents and bulbs: 8,947 species with their native range and, where the sources answered, habitat climate and cold nights, worked out from public data, every figure with its source. Keep your own plants here too...") is accurate but reads as a disclaimer.
- A returning grower: Today first, as now.

---

## Part D. The adoption funnel (3): the biggest leak at each step

| Step | What happens now | Biggest leak | Fix (finding) |
|---|---|---|---|
| Discovery | Sitemap lists every species and genus; JSON-LD Taxon; canonical URLs; server-rendered pages that read without JS | Title and description hand Google the Wikipedia snippet; unique figures are invisible to search; common names barely indexed | 6, 7, 11 |
| First visit | Front page sentence, catalogue, long species page full of methodology | Nothing shows the tracker; the species page's labels are the project's vocabulary, not the grower's | 3, 7, 10 |
| First plant | Good add form (cultivar and hybrid hints, field number, "How many") | No import: a collector with 300 plants retypes them | 4 |
| Habit | Today groups what needs doing by place, frost watch inside the app | No reminder or alert ever reaches the grower outside the app | 9, 4.1 |
| Sharing | Share card for a species' climate | Plant pages, collections and QR labels cannot be shared; front-page link preview is text | 8, 11, 4.4 |
| Retention and trust | Backup zip with CSVs, documented formats, AGPL, E2E sync | Safari evicting a non-installed collection, and installing on iPhone starting empty; sync price unstated | 5, 2 |

---

## Part E. Feature gaps vs the rules (4)

### 4.1 Notifications without accounts

**Option A: opt-in web push for frost only.** The device subscribes, and the server stores only the push endpoint, the rounded cell (it already receives this) and the threshold. A scheduled Worker reads the cached forecast per cell and pushes. The payload is encrypted to the device under the Web Push standard, so Apple, Google and Mozilla's push services see only that a message was sent.

- Cost against the rules: the server now *keeps* a record that ties an endpoint to a location. That is a new line for /about/how and needs a "Stop" that deletes it.
- It does not need an account.
- iOS supports it only for an installed app, which pushes toward install (good for finding 5).
- Recommendation: do it after launch. It is the only alert worth the new server state, and frost costs plants.

**Option B, no server state: an .ics download of the watering rhythm per place,** for the phone calendar. Cheap, private, and it brings the grower back. Do it in 30 days.

**Periodic Background Sync:** Chromium-only and needs install. Not worth it.

### 4.2 Mobile install

There is a manifest and an install bar, and that's enough. Fix the iOS order (finding 5).

### 4.3 Import

CSV, paste, and the Windows DB's Excel export. It is a must and breaks no rule (finding 4).

### 4.4 Sharing and showcase without accounts

- **"Share my list"** builds a URL whose fragment holds the species list (have and want), compressed. The fragment never reaches the server, and the receiving page renders it from the corpus. This suits swaps and seed-exchange threads on CactiGuide and Reddit.
- **"Export a public page"**: a static HTML file of chosen plants and photographs that the grower hosts themselves.
- Neither keeps anything on the server.

### 4.5 Plant ID from a photo

- Calling Pl@ntNet or iNat's vision API sends the grower's photo to a third party (against rule 4 as worded). Running a model on the device adds megabytes and gives a guess.
- It is also the beginner market's main feature, where Cultifolio cannot win against free PlantNet.
- Recommendation: do not build it. Link out: "Not sure what it is? iNaturalist or Pl@ntNet", opened by the grower, sending nothing from this site.

### 4.6 Community

- Accounts, comments and feeds would dilute the project and break rule 4. Don't.
- The community already exists (clubs, CactiGuide, Reddit). Make Cultifolio the thing people link to there: species pages, the Share card, have and want lists, labels.

### 4.7 Smaller collector features that fit the rules

- Field number lookup links out to the BCSS database.
- POWO, Llifle and CactiGuide search links in "Names & registers" (the 404 page already names POWO).
- Show and plant-sale label stock.

### 4.8 What would dilute the project

- Generated care text of any kind.
- Pest diagnosis.
- Generic houseplant reminders as the headline.
- A social feed.
- Analytics "just for the launch".

---

## Part F. launch (5)

### 5.1 Title

The draft's first choice, "Cultifolio – a plant species reference where every figure shows its derivation", is accurate but abstract: "derivation" asks the reader to do work. The titles that do well name a concrete thing. Better, best first:

1. `Cultifolio – the climate where 8,900 cacti and succulents grow wild, from open data`
2. `A cactus and succulent reference with no written text, every number traced to its source`
3. `Cultifolio – habitat climate for cacti and succulents, plus a local-first collection tracker`

The count goes stale, but a launch-day title only needs to be true on the day.

### 5.2 First comment (about 230 words; the author should rewrite it in his own voice and post it himself)

> I collect cacti, mesembs and South African bulbs, and the question I keep asking about a species is "what is it like where this grows?". The answers online are care sheets, copied from each other and lately generated.
>
> Cultifolio answers it from data. For each of 8,947 species it takes the native range from Kew, every wild GBIF record inside it, and reads the CHELSA climate at those records: rain and temperature by month, coldest nights over 40 years (NASA POWER), and light as DLI, which is handy for setting grow lights. Two fixed rules turn that into a season (for example, "rain falls in the cool months"). Nothing on a species page is written by a person or a language model, and a figure that can't be derived says so. Example: [Copiapoa cinerea], 72 mm of rain a year but 78% humidity, which is a fog-coast cactus.
>
> The other half is a collection tracker: accession numbers, sowings that mint numbered plants, places, QR labels, frost watch. It lives in your browser. Sync is optional and end-to-end encrypted. No accounts, no analytics. [Try it with a sample collection].
>
> I built it with Claude Code. The code was written with AI; the data on the species pages, by design, was not. Sync is free now; later hosted sync will be paid (about $X a year), and the server is AGPL, so you can run your own.
>
> I'd most like to hear where a derived figure is wrong.

### 5.3 What readers will attack, and the answer

| Attack | Answer |
|---|---|
| "AI-built, 59 rounds of LLM review, is this slop?" | Said in the first comment. The code was AI-assisted; species content is deterministic, derived by scripts in `scripts/` (MIT), re-derivable in an hour, and every rule is printed. Consider moving the 66 review files to `docs/reviews/` so the repo's top level doesn't read as a log of reviews. |
| "Habitat climate isn't cultivation" (fog cacti, Aloe polyphylla, plants that take far colder in pots) | Agree: the page says what the figures are and what they are not. That's why it shows humidity and the cold floor as a habitat figure, not a hardiness rating. Have one fog-zone example ready. |
| "Why not POWO, iNaturalist or Llifle?" | Cultifolio is built *from* them and links to them; none of them reads climate across every wild record of a species. |
| "8,947 species, but there's a maple" | The list is 172 collector genera plus the 2,500 most-cultivated species on iNat, by rule (/about/how "Which species are here"). Consider opening the catalogue on the collector genera. |
| "Local storage loses my data" | Backup zip with CSVs, encrypted sync, install. Fix finding 5 first. |
| "What will sync cost?" | One sentence, in the post (finding 2). |
| "Your privacy page is wrong" | Fix finding 1 before posting, or this row becomes the thread. |
| "Licences: CC BY-NC GBIF records used for the climate?" | /about/how says restricted records only feed derived numbers and the map shows only open ones; have the GBIF terms link ready. |
| "Megabytes on the front page" | Already prepared in the launch draft, with `scripts/dev/first-load.mjs`. |
| "Common name search doesn't work" | Fix finding 6's indexing first. It was the top complaint on the last plant launch. |

### 5.4 Load and cost for 10,000 visitors in a day

- **Measured here:** a first visit (front page, one search, one species page) makes 19 requests that invoke the Worker. 12 of them are the service worker's shells (finding 13). Static assets under the `assets` binding are not Worker invocations.
- **Requests:** a heavy first-time visitor reads 3 to 10 pages, so call it 20 to 40 Worker requests per visitor: 200,000 to 400,000 requests a day. The Workers Paid plan includes 10 million requests and 30 million CPU-ms a month, then $0.30 per million requests and $0.02 per million CPU-ms ([budgetforge summary of Cloudflare pricing](https://www.budgetforge.dev/tools/cloudflare-workers-pricing-2026)).
- **CPU:** even at 50 ms per server render, 400,000 requests is 20 million CPU-ms, inside the monthly allowance.
- **R2:** class B reads are $0.36 per million after 10 million free a month; egress is free ([egresscost](https://egresscost.com/cloudflare/)). At most a few hundred thousand reads come to cents.
- **KV:** the rate limiter writes at most once per 5 s per address and bucket (sync.ts:820, 851). Even 100,000 writes a day sits inside the 1 million monthly writes included; beyond that, $5 per million.
- **Upstream:** forecast and name lookups are edge-cached per 0.01° cell and per query (api/forecast/+server.ts:39-49, api/names/+server.ts:40-43), so a spike does not hammer MET Norway or GBIF. Photographs load from iNaturalist's open-data bucket, Commons and GBIF, at their cost, not this site's.
- **Bottom line:** a front-page day costs the $5 base plus well under a dollar. Even 100,000 visitors stays around $10. Cost is not the risk. The risks are the per-isolate load of the 11 MB index on cold starts during a spike, and the privacy claim (finding 1).

### 5.5 Monitoring without analytics

- Workers metrics in the dashboard (requests, error rate, CPU time, all aggregates) with invocation logs off.
- R2 operation metrics.
- Cloudflare billing and usage notifications.
- `wrangler tail --status error` during the launch.
- The project's own live check, run from a cron every 15 minutes on launch day.
- No client script is needed.

### 5.6 Launch checklist (in addition to the launch draft's)

- Finding 1 fixed and checked in the dashboard.
- A 10-minute load test against a staging deployment of the real corpus: about 50 requests a second over species pages, front page, search and rows; not forecast or names, which would hit upstreams. Watch CPU per request, isolate memory and errors. Delete the staging Worker after.
- The sample collection works on a phone.
- Three deep links checked in a private window: one cactus with the fog example, one winter-rainfall bulb or mesemb, and one refused species.
- og.png shows a plant.
- Answers in 5.3 drafted in the author's words.
- Post 08:00 to 10:00 US Eastern on a weekday (as drafted).

---

## Part G. 30/60/90 days (6)

### Before launch day: the five things

1. Make the logging claim true: invocation logs off, /about/how and Settings say what the host sees, tail on errors only (finding 1).
2. Ship the sample collection (finding 3).
3. Use it for real: the author's own collection (he has more than 100 species) entered for two weeks. Then rewrite the post at under 300 words, with the sync price, AI disclosure and deep links (finding 2).
4. Species page title and description from the figures; all English common names in the index; og.png with a plant (findings 6, 11).
5. iOS install before the first plant, plus the dot-file precache fix (findings 5, 12).

### 30 days

- CSV and paste import (finding 4).
- Grower-vocabulary labels on the glance and season cards (finding 7).
- QR label fragment (finding 8).
- Two tabs for visitors (finding 10).
- Prerender the shells (finding 13).
- Post as a grower, not as a launch:
  - one CactiGuide thread showing a genus's habitat climates side by side (compare page);
  - one r/cactus or r/succulents post of a Share card;
  - an offer of an online talk to a CSSA affiliate and a BCSS branch on "reading habitat climate".
- Watch only aggregate metrics and what people say in those threads.

### 60 days

- .ics export of watering rhythm.
- "Share my list" (have and want) via the URL fragment.
- Field number lookup and POWO, Llifle and CactiGuide links.
- Show and plant-sale label stock.
- Decide on frost web push (4.1 A) and, if yes, document the stored endpoint and cell on /about/how before shipping.

### 90 days

- Hosted sync priced and launched, at a figure clearly under the $30 to $45 a year consumer apps charge.
- Corpus growth (the name tier already planned).
- A habitat zone number by a stated rule (needs yearly minima kept in the build).
- Translations of the interface (not of species content) for German and Japanese collectors, if the threads show demand.
- Frost push if decided.

---

## Part H. Checked and sound

- Species pages are server-rendered, read without JavaScript, carry canonical URLs and schema.org Taxon JSON-LD. The sitemap lists every species and genus (sitemap-1.xml on the fixture: 4 species, 3 genera, 2 about pages); robots.txt allows everything but /api/.
- Forecast and name proxies are cached at the edge per cell or query and send a User-Agent, so a launch spike will not hammer MET Norway or GBIF.
- The add form accepts species, cultivars and hybrids with clear examples, and has field number, source, provenance and "How many".
- Backup carries the whole log plus plants.csv, batches.csv and events.csv, which is a real longevity story.
- `navigator.storage.persist()` is requested at load (collection.svelte.ts:214), and an unpersisted, unsynced collection says so on /plants.
- The install bar handles Chromium's prompt and iOS's two taps, and never shows inside the installed app.
- The Share card renders the climate from the page's own figures and uses the native share sheet with a file where it can.
- The rate limiter is cheap on KV by design (flushes every 5 s per key) and fails open; the spend controls fail closed.
- The 404 for an unknown species offers GBIF and POWO links and "You can still add it as a plant".
- sheet.ts already words winter and summer rainfall as "read as a winter growing season", so finding 7's grower-vocabulary leads need relabelling, not new derivation.

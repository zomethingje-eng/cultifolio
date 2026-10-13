# Self-review of round sixty-nine

Six reviewers read the deployed code (`526ecaf`) and the live site (corpus `540c129738556840`) on 12 October 2026, each in its own copy, each with one area. Their reports are `review-69/self-A.md` to `self-F.md`; this document merges them, ranks the findings and says what round seventy should do. Every finding below was reproduced by its reviewer unless it says "suspected"; the five most serious were checked again on the live site while this was written.

| Reviewer | Area | Findings |
|---|---|---|
| A | Wikipedia summaries and the redirect rule | 8 |
| B | Wikidata, iNaturalist and Kew matching | 7 |
| C | Every photograph: kind, credit, size, lead | 14 |
| D | The example collection and the grower's records | 7 |
| E | The server, the sync engine and the harness | 7 |
| F | The account against the code; names, search, the about pages | 10 |

**Limits.** All six shared one address. Wikipedia, Wikidata and Commons answered 429 for much of the afternoon, so several corpus-wide scans stopped part way (each report's "Not done" says which). WebKit and Firefox were not run.

**What the review says about the round.** The fixes the triage planned mostly hold: F's table of triage decisions finds K1 to K5, M1 to M10, N1, N2, W2 to W6, P1, P2, X1, X2, R3 and sections 11 and 12 present as described. The weak parts are the rules that read names in free text (a Commons title, a Wikipedia lead, a Wikidata label, an older name's epithet), and above all the three written during the corpus step. Each was fitted to the cases in front of it and tested only on them; every reviewer who mutated one found most mutations survive. Several of those rules already put another plant's photograph or identifier on a live page.

## 1. Wrong on a species page now

These are live today.

1. **Another species' photographs through a followed iNaturalist id (B1).** `checkedInatId` (build.ts:453) and `fillInatIds` (corpus-fills.ts:103) follow an inactive id to its successor without M6's checks. Pinguicula chilensis follows to taxon 816267, *Pinguicula antarctica*, which the reference holds as its own species: its 34 photographs are P. antarctica's, and its iNaturalist link goes there (checked live). Mammillaria karwinskiana links to M. geminata; Tricyrtis formosana takes a variety's taxon. B's sample suggests ten to fifteen pages among the 120 followed ids. Fix: read the successor's name and apply `taxonByOlderNames`'s rule and `heldElsewhere`.
2. **Commons files that are not this plant (C1 to C4, C7).**
   - Othonna daucifolia's only photographs, its lead and tile included, are *Euryops abrotanifolius*, another genus with the older epithet (checked live). `namesAnother` reads only the species' own genera.
   - A North Macedonian postage stamp is Colchicum macedonicum's only photograph (checked live); a Curtis lithograph leads Cyphostemma adenopodum; files Commons files as "Unidentified" lead Colchicum raddeanum and Adenia subsessilifolia. Stored dossiers keep no categories, so the category rule never runs on them.
   - Smithsonian (`-NMNH-`) and Auckland Museum (`(AM AK…)`) herbarium sheets pass the title rules (Cyphostemma camerounense, Zanha golungensis, Ceropegia radicans).
   - "Parodia Liberec 1", a group of six Parodia species, is shown on three Parodia pages; insect nymphs on Centaurea americana and a file whose description strikes the name are on Plectocephalus americanus; "Nepenthes rhombicaulis hybrid.jpg" is shown though the about page says hybrids are not.
   - Five files of *Nepenthes lamii*, titled without spaces ("Nepentheslamii…"), are Nepenthes monticola's only photographs.
3. **Another plant's IPNI identifier through the label proof (B2).** Section 14 proves a Wikidata item by a GBIF record of the same canonical name, whoever the author. Where Wikidata has merged two homonyms, the wrong half reaches the page: Agave variegata Jacobi links IPNI 62332-1 (Steudel's, GBIF's *A. americana*), Peperomia monticola Miq. links Hooker's (GBIF's *P. vulcanica*), Othonna rosea Harv. links Klatt's. Of the 394 species that will take the label path at the next rebuild, 86 would be proved by a record GBIF files under another plant. Fix: require no accepted key or our own; better, prove the item by its IPNI id against Kew's row for this name.
4. **Older-name addresses sent to the wrong plant, with an untrue sentence (F1).** A name two species hold redirects to the one that happens to show it, and the page says "the GBIF backbone accepts this species as" that one. In 11 of 215 the target is the wrong plant and the site's own search puts the right one first: `/species/echeveria-farinosa` goes to Dudleya pulverulenta (checked live), `cissus-quinquefolia` to Parthenocissus inserta, `aloe-obliqua` to Gasteria pulchra.
5. **Ranges (B4, B5).** Ceropegia macrocarpa (Sprenger) Bruyns lost its range because Kew holds a *different* author's name "with no native range"; the round recorded that as Kew's answer. Cyphostemma congoensis has a Kew entry, under the neuter "congoense". Fix: apply the author rule to the species' own name, and try gender variants of the epithet.
6. **Credits (C8, rule 4).** Live credits include a signature with its time ("Guérin Nicolas (messages) 19:48, 25 September 2008 (UTC)"), "Dwight Sipler [2]Uploaded by uleli", an e-mail address, "The original uploader was … at French Wikipedia", and Agave cocui's "(MiNombre", an unfilled template: a CC BY photograph with no author in substance.
7. **Summaries lost wrongly (A4).** Fenestraria rhopalophylla, Bowiea volubilis and Harpephyllum caffrum have no summary although each genus article is the species' own (GBIF holds one accepted species in each; Harpephyllum's lead names it under the new epithet "afrum"). Section 13 called them genera of many species; the code comment cites Harpephyllum as a case it keeps.

## 2. What a first visitor would meet

8. **Search (F2).** A species that shows a *variety* of the typed name ranks above the species that holds the name exactly: "Cornus mascula" gives Cornus officinalis before Cornus mas (checked live), while `/species/cornus-mascula` goes to Cornus mas. 162 names; F's tested fix corrects 136.
9. **Hyphenated older names never redirect (F3).** `/species/arbutus-uva-ursi` is a 404, though the index holds the name for one species; 230 such names.
10. **Family prefixes (F6).** "Crassula elegans" also returns Echeveria and Sedum species, because Crassula begins Crassulaceae; seventeen genera do this.
11. **Index counts (C9, F4).** The index counts an iNaturalist photograph and its GBIF copy twice; the page shows it once. 18 of 45 sampled species disagree (Albuca paradoxa 8 against 16). The count chooses the front page's featured species and breaks search ties, and `/about/formats` says it is the page's count.
12. **Smaller:** the 404 says "neither" for three holders (F7); four headline regressions besides False acacia ("Showy tar weed", "Softseed wild petunia", "Sweet scented geranium", "Hubei Anemone") (F8); a 256-pixel file leads Nepenthes spectabilis beside 4,000-pixel ones (C12); the photo strip and related tiles load 500-pixel tiles into 72-pixel boxes (C14).

## 3. The grower's data

13. **The example deleted from under a reloading tab (D1).** An example tab holds the "open" lock only once DemoBar mounts. While it reloads (one to four seconds on a slow phone), another tab reads the example as a leftover: it offers "You left an example collection…", and "Delete it" deletes the visitor's records; with nothing of the visitor's in it, it deletes silently and the reloading tab seeds again. Reproduced in Playwright. Fix: take the shared lock in app.html's first script.
14. **The slow clock across fields (D2).** Step 2 places an edit past held stamps of the *same field* only. A removal made while a correction waits is undone when a held peer edit folds; an edit is hidden by a held removal.
15. **A freshly loaded tab puts another tab's confirmed correction out of force (D4)** after a two-hour sleep, which step 3 forbids.
16. **Import (D3).** A sheet re-saved by LibreOffice with its default short date (05/01/24), or with a currency format on the price, imports every line twice.
17. **Replace (D5)** from an older file silently wipes the device's unreadable changes; R3 refuses the reverse case for exactly that reason.
18. **The seed without Web Locks (D6)** can land over a plant the visitor added in another tab: two plants share 2026-0001 and Leave deletes the visitor's without asking.
19. **Keep it as my own (D7a)** drops the containing place of a new place.

## 4. Sync and the server

20. **A configured sync page that never runs (E1).** A tab open before another tab set up sync, which then follows the top bar's Sync link, configures its engine and schedules nothing: "checking now" with no request. Section 12's symptom by another path. Fix, tested: `this.schedule(1500)` at the end of `readInit`'s configured branch, which also makes section 12's race moot.
21. **Sync's words and the day's allowance (E2).** A 429 reads "The server is busy" (a refusal said as something else), a bare 5xx reads "refused" (rule 2, both ways). The day's upload allowance (wait until midnight) is capped at 600 s, so the device re-sends a whole photograph every ten minutes until midnight.
22. **W4 on DELETE (E3).** A DELETE without the proof on a removed photograph takes the name's hold, and the grower's own revival is told "busy".
23. **The listing budget (E7, low)** allows about twice the stated pages across the turn of a clock hour.

## 5. Rules that will go wrong at the next rebuild

No live case was found for these, but each is reproduced on real data.

24. **Summaries (A1 to A3, A5 to A7; F5).** `sameEpithet` reads 178 pairs of distinct species of one genus as one epithet (Acer saccharinum and saccharum, Conophytum minimum and minutum, which section 15 cites as two species). A genus page that is its type species' article is quoted for a sibling (Strombocactus). The genus test misses "one of the largest genera" (Mammillaria, Drosera, Peperomia) and group pages (Rose, Cherry, Mahogany). The build reads the whole lead and the fill the stored 1,500 characters, so a summary can flip on alternate fills; a summary kept by its lead in the fill writes no record; two-word common names ("Venus flytrap") are read as binomials and dropped. A's trial fix keeps the 88 and closes most of these (`/tmp/claude-0/rev69/A/scripts/tmpA/proposed-fix.diff`); A proposes Wikidata's P1582 for common-name pages (suspected).
25. **Commons (C5, C6, C10).** `misspelt` reads ten real pairs as one (Drosera macrophylla and microphylla, Stephania suberosa and tuberosa); 788 infraspecific older names make another accepted species "own" (on Babiana purpurea, "Babiana stricta" files); the category rule's "specimens" would hide living plants filed under "Specimens in [a garden]".
26. **Wikidata (B3, B6).** The label proof refuses right items whose GBIF key is now 404 or spelt differently (Catalpa speciosa, Mammillaria grusonii; about 15), with a false reason; a GBIF refusal during the proof is recorded as "Wikidata refused".

## 6. The about pages and the tests

27. **About pages (F9, A, C).** Untrue or incomplete: the summary sentence (finding 24's cases, and "another species of the genus is never quoted"); the Commons misspelling clause (the seven-letter floor, "ae" for "e", hyphens); the label sentence (the plant kingdom, three keys, five hits); "one whose page holds no such version is not shown" (no code does it; 47 tiles are originals); "photos counts the photographs the page shows"; the search's "shows the name among its six"; hybrids; the unstated "media from GBIF" category. The seam tests pin sentences verbatim and the code's shape, and catch none of these.
28. **Harness (E4 to E6, D7c).** Two server specs still take their vault's place from 127.0.0.1's network and fail on the eleventh run in a day; the limit test fails its own retry; nothing guards section 11's fix; `r69x-example`'s "no address contains 42" fails on any port starting 42 and at random on 4173.
29. **Mutation.** A: 12 of 16 rule mutations survived; B 13 of 40; C 15 of 51 that matter; D 10 of 58. The survivors are listed in each report.

## Recommendation for round seventy

Fix section 1 first: it is wrong on the live site today, and most of it is small (B1's follow check, C's genus-agnostic title rule, the stored-category re-read with the NMNH and Auckland patterns, "hybrid" in the title rules, B2's accepted-key condition, F1's redirect rule, B4's author rule, C8's credit cleaning, A4's monotypic-genus check). Then D1 and E1, which lose or stall the grower's data, and F2, F3 and the index count. Section 5's rules should be rewritten as rules about names rather than fitted to cases, with the misreadings found here as their tests, and the about pages rewritten from the code once they settle. The outside reviews running now will add to this; a triage of all of them, as in rounds sixty-seven and sixty-nine, is the next step.

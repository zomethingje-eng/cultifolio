# Triage of the self-review of round seventy

Six internal reviewers read the deployed round seventy (`76dcd55`) and the live corpus (`0c2959d95b5883d2`) on 15 October 2026, each in one area; their reports are `review-70/self-A.md` to `self-F.md`. No outside review was run this time. The owner's instruction is to fix everything worth fixing, together with the issues left open by the round's corpus step.

**What the review says.** The round's rules mostly hold where they were tested, and search, the index's counts and credits, the sync server's round-seventy changes and the address helpers were found sound. The faults are where the round's last two passes (70b, 70c) were written from the owner's runs: rules that read the real files differently from their test fixtures (Kew files a synonym under its genus's family, so the 70c family rule never fires), guards that ask only this reference whether a name is another species (the slip rules, the summary's binomial guard), and records that say less than the page shows (a range taken from another Kew entry, a summary kept with no proof read). Round seventy's own seam tests drove few of these rules.

## Decisions

- **Ixora coccinea and Kew's families (S-B1, S-F1).** The family rule reads the family of the entry a row is filed under. `--list-rebuild` also compares the stored native regions with the rule's (S-B8), so a stale page is listed whatever rule made it.
- **Species on a homonym key (S-B2).** The reference keeps its keys this round. Where a key's author is plainly not Kew's accepted entry for the words (Rubus parviflorus Kük., Ranunculus ficaria Walter, Myrica cerifera Bigelow and the others in S-B2), the page shows Kew's author and reads synonyms and common names from GBIF's usage by Kew's author, saying so. A remap of the reference to other keys is a decision for the owner later, recorded in the round's notes. The two pages for one plant (Coryphantha macromeris and Pelecyphora macromeris, S-A1) are recorded with it.
- **A range from another Kew entry (S-B3, S-B4).** An own row filed under an infraspecific entry gives way to the species entry Kew accepts (Fragaria virginiana). A range taken from a synonym's accepted entry says so on the page: "Kew holds X as a synonym of Y; the range is Y's" (about 480 pages; five show another reference species' range). This is written by a fill, not a rebuild, where the range itself does not change.
- **IPNI and POWO links (S-B5, S-B6).** The page links Kew's number for the name and author, for IPNI and POWO, and never an item's number that Kew holds for another author. An item whose POWO number is Kew's for this name and author is proved: the eight refusals on another author's name are reversed (Raphionacme linearis, Convolvulus cneorum, Gunnera manicata, Salvia azurea, Agave ghiesbreghtii, Tulipa clusiana, Peperomia monticola, Othonna rosea). Albuca longifolia stays refused.
- **Slips and sisters (S-B7, S-C9, S-F13).** A name Kew or GBIF accepts as a species is never a slip of another, and a genus transfer is taken only when Kew does not accept both names. One rule, in `photo-kind.ts`, used by iNaturalist and Commons alike.
- **Summaries (S-A1 to A11, S-F2).** Under a title other than the name, a summary is published only when this run read its proof or its record names one; a summary whose proof was not read is "not checked", and the carried one goes with it. The basionym proof needs another item; a binomial is another species only when GBIF says so and Kew holds a row of it; the product and genus proofs need the species, not the genus. The fill drops `maxlag` from read-only Wikidata calls, prints each not-checked species with its source, and does not ask again what it has settled. Rosa luciae is recovered by an IPNI-based proof if A finds one that is a rule, not a case.
- **Photographs (S-C1 to C13).** Maps by any language's word for range ("Areale"); herbarium sheets by category and by GBIF's basisOfRecord (the GBIF query takes only HUMAN_OBSERVATION media, and the `specimen` flag is set); a year in a title hides a file only with other print evidence; a Commons copy of an iNaturalist photograph the page holds is shown once; derivative-work credits; the group rule's two faults.
- **Records (S-D1 to D7).** The import regressions (S-D1, D2, D5) and year-first short dates (S-D4) are fixed; a restored change this version cannot read is queued for sync when a later version reads it (S-D3); S-D6 is a limitation, stated on `/about/formats`.
- **Server (S-E1 to E9).** The Alaskan islands are asked of the NWS; the listing is settled under `waitUntil`; the vault's writes an hour are counted over any sixty minutes, as listings are; the sync page's words and `/about` sentences are made true; the keep-data answer is said.
- **Pages (S-F3 to F12).** An older name that is another species' accepted name is shown with its author and never as this species' name; a range that disagrees with every record shows the records and says so; the false "iNaturalist not asked" banner goes; tiles carry their licence; the group chip is labelled; a silent redirect says why; the seam method drives the rules of 70b and 70c.
- **Mutation survivors.** Each agent adds tests for the survivors in its reviewer's report.

## The agents and their files

| Agent | Area | Files |
|---|---|---|
| **A** | Summaries and spelling | `sources/wikipedia.ts`, `summary-proof.ts`, `summary-fill.ts`, `epithet.ts` |
| **B** | Identifiers, ranges, the builder | `sources/wikimedia.ts`, `sources/inat.ts`, `sources/gbif.ts`, `own-names.ts`, `reference.ts`, `authors.ts`, `bulk.ts`, `build.ts`, `corpus-fills.ts`, `corpus-run.ts`, `drops.ts`, `rederive.ts`, `open-gbif-fill.ts`, `scripts/build-dossiers.ts`, `scripts/bulk-fetch.ts` |
| **C** | Photographs | `photo-kind.ts`, `photo-credit.ts`, `photo-size.ts`, `dedupe.ts`, `schema.ts`, `commons-fill.ts`, `sources/commons.ts`, `core/licence.ts`, `scripts/audit-commons-photos.ts` |
| **D** | Records, import, backups, the example | `core/hlc.ts`, `core/log.ts`, `db/*`, `backup/*`, `import/*`, `ui/grow/*`, `src/app.html`, `routes/backup/*`, `routes/plants/import/*` |
| **E** | Server, sync, weather, harness | `server/*` except `dossiers.ts` and `synonyms.ts`, `routes/api/**`, `hooks.server.ts`, `sync/*`, `routes/sync/*`, `weather/*`, `ui/keep-ask.ts`, `ui/alert-words.ts`, `ui/sync-words.ts`, `playwright.config.ts`, `scripts/predeploy.mjs`, `tests/e2e/helpers/*` |
| **F** | Pages, search, the account | `routes/about/**`, `tests/about-pages.ts` and the about seam tests, `core/search.ts`, `core/postings.ts`, `dossier/index-entry.ts`, `server/dossiers.ts`, `server/synonyms.ts`, `routes/species/**`, `ui/ref/*`, `routes/+page.*`, `routes/+layout.svelte` |

F applies every agent's about-page sentences in a second pass, against the merged code.

## The corpus step after the deploy

Each agent says what its changes need: the summaries fill again; `--fill wikidata` for the reversed refusals; a fill for the range sources; rebuilds of Ixora coccinea, Fragaria virginiana and the species on a homonym key; a fill for GBIF media's basis of record. The merge orders them.

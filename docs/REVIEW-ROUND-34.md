# Round thirty-four: a second walk through the deployed site, after the corpus

The site as deployed at `799b615` with the corpus of 30 September (thumbnails by occurrence, herbarium sheets out, the poleward hemisphere rule), walked in a browser again with a collection on the device this time. Five findings, all fixed.

1. **A genus page's own address showed a grower their own species.** `/?by=genus&open=copiapoa` is the canonical address of the genus page, the sitemap's 1,321 group entries and any shared link; with plants on the device the page opened on "Your species" under a title that said Copiapoa. A link that names a grouping, a group or a letter opens the catalogue now, and "Your species" is one click away. e2e, which fails against the previous page.
2. **The hemisphere notice said the figures were one side's alone.** Since round thirty-three the cells within 10° of the equator stay in whichever side is used, and the notice still said "the northern side's alone (296 cells)". It says which cells were left out (those more than 10° on the other side) and which make the year (that side's, and those within 10° of the equator).
3. **A variety's old name redirected and then said nothing.** `/species/haworthia-attenuata-var-radula` reached Haworthiopsis attenuata with `?was=Haworthia attenuata radula`, the backbone's canonical form without "var.", which round thirty-three's guard did not find among the species' own names, so the line saying why the reader was moved did not show. An exact match keeps the name as the reader wrote it, and the guard compares names without rank markers.
4. **"iNaturalist were not asked."** The 1,407 species whose photographs went with the herbarium rule now show the not-checked notice, and it read "Photographs: iNaturalist were not asked when this page was built", while the card beneath said "did not answer" for the same fact. The verb agrees, the card says the same thing as the notice, and when GBIF's coordinated observation records were read and hold none, the notice says so.
5. **The climate paragraph's "records in all".** Round thirty-three made the count the records in the cells the envelope reads, and the sentence still called it the total. It says "in those cells".

Also: the plants page says when records wait for changes this build cannot read (round thirty-three's rule put the count on the sync page only, and a grower whose plant went quiet would look here first).

Checked and fine: the tiles and the species photographs after the corpus (12/12 on the live check), Melocactus intortus's sea-cell line, the `?was=` guard against a name the species does not list, the hybrid slug, the sitemap (10,271 addresses), the plants, sync and labels pages with a collection, no console errors on any of them.

## After the changes

`npx svelte-check --threshold warning` clean; `npx vitest run` 38 files, 384 tests; `npx playwright test tests/e2e/smoke.spec.ts --workers=1` 74 tests; the local live check's seven upstream-free checks pass. For the deployer: `npm run deploy`; no corpus step.

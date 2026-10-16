# Round seventy-three: the merge

Branches merged in the order K, L, H, P, then L's refinement.

## Decisions taken at the merge

- **Other GBIF keys: homotypic only.** K's first rule read 1,378 keys on 749 pages, 865 of them heterotypic synonyms. Lonicera pileata, for example, would have read Lonicera ligustrina's 43,703 records.
  - The owner decided to read other keys for the homonym-key cases, the split same-name keys and the two homotypic merges. Each of these shares the plant's type.
  - So the rule now reads only:
    - the page's own name (any usage of it);
    - an orthographic variant;
    - a synonym Kew marks homotypic;
    - an autonym of one of these.
  - The result is 332 keys on 305 pages.
  - Heterotypic keys (1,066) and other types (1,225) are listed in `extra-keys-refused.txt` as the owner's decision.
- **Heliamphora purpurascens.** L's sister-epithet rule would have hidden the page's only photograph, "Heterodoxa pt12", whose Commons description says "now known as Heliamphora purpurascens". A description that names the species now beats a sister epithet in the title.

## Conflicts and needs applied

- **`tests/e2e/smoke.spec.ts`.** P edited the file and H split it into four. P's four hunks went into `smoke-1`, `smoke-3` and `smoke-4`, and the old file was removed.
- **The about pages.**
  - P wrote K's sentences.
  - The merge wrote L's five sentences into /about/how.
  - Two seam tests in `r71f-about-71` pinned wording that the merge reworded. The sentences now keep the seams: "asked of GBIF instead, human observations only, as the download is read;" and the map clause's four words.
- **H's guard against reading a toast after a navigation without the clock held** leaves out `r73p-toast.spec.ts`. That spec's subject is the toast's timing on a slow device, which P's fix makes reliable.
- **`docs/DEPLOY.md`.**
  - H's section on a cold start's CPU, written for cmd (`findstr`), not PowerShell.
  - The round-73 steps name the iNaturalist and Commons-kind steps.
- **`scripts/corpus-plan.txt`.** `--fill inat --bulk bulk` and `--fill commons-kind` come after `--prune-followed`, as L's corpus step needs.

## After the owner's runs

- **The unit tests on the PC.** `r63h-qa-removed` walked the corpus step's `backups/` (342 MB) and `cache/` (419 MB) and ran past its time. They are not code, and the walk now leaves them out.
- **The shell-cache test in Chromium on the PC** (`smoke-1` "the app shell is installed…") failed both times. It opened `/`, then `/about/formats`, and waited for the worker. On the PC the second page loaded before the first had counted itself (the layout counts a view at hydration), so the count stayed at one and nothing registered.
  - The test now waits for the first page's decision (`data-worker`) and then for the second's (`data-worker="on"`). `smoke-4`'s reload test does the same.
  - With the first page's chunks held 2.5 s, the old test fails as on the PC and the new one passes.
  - In the app, a visitor who leaves a page before it has loaded simply does not count it, which is harmless.

## Runs

- **Unit:** 3,915 passed and 8 skipped. `tsc` and `svelte-check` were clean.
- **Strict Chromium and the Chromium phone at four workers:** 485 passed and 5 skipped, none flaky, in 13.1 minutes. Smoke now runs as four files in parallel.

## Dry run of the corpus step on the live corpus (`d60525499b8c8c20`)

The plan ran here without `--grid` (no climate grid in the workspace) and without the upload. The re-derivation was held to eight of the 305 pages, because each page's own records come from GBIF's API here rather than `occurrence.zip`.

| Step | What it did |
|---|---|
| `--list-extra-keys` | 305 pages |
| `--keys … --rederive` (8 pages) | Pelecyphora macromeris 39/50 → 216/602 records; Myrica cerifera 55/14 → 155/653; Ixora coccinea 74/327 → 198/174; Stapelia grandiflora 2/48 → 88/59; Rubus parviflorus 547/985 |
| `--prune-followed` | Deleted 3084426 and 7906297; the index holds 8,945 species. The step let this shrink pass and no other. |
| `--fill inat --bulk bulk` | 63 pages asked; 5 took in another species' taxon and were asked again |
| `--fill commons-kind` | Heliamphora purpurascens's file shown again |
| `--index` | "2 old addresses of pages merged into another answered by the kept page: coryphantha-macromeris, rebutia-fidana" |

A second run of `commons-kind` writes nothing but asks one file again each run. That is one request; it is listed for round 74.

On the owner's PC, the re-derivation reads each page's own records from `occurrence.zip` and the climate from the grid. It covers all 305 pages, with about 1,000 API requests for the other keys.

Not carried: the merged-away pages' own iNaturalist photographs. A re-derivation reads GBIF photographs only from the download's media. Pelecyphora macromeris keeps its 21 photographs and Weingartia fidaiana its 20.

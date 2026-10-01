# Review round forty-one: the flow recommendations taken from round forty, built

Round forty's two reviews ended in recommendations on flow rather than defects, and round forty took the data-structure ones. This round takes the flow ones named at the end of that document, plus two of my own, each checked against the pages on a phone viewport before and after. "R" numbers are the first reviewer's recommendation numbers from round thirty-four; "own" is mine. Nothing here changes the wire, the vault, or the corpus.

## Getting a key, and keeping it

1. **The key is saved by typing it back, not by ticking a box** (R9). A ticked "I have saved it" box was ticked by everyone; a sync key that is lost is a vault that is lost, since the server holds only ciphertext. The create button is disabled until the last five characters of the key are typed back, case ignored; a wrong group keeps it disabled. Beside it: "Copy key", "Print this card" (a print stylesheet keeps the key and its sentence and drops the chrome), and "Take a backup first", which goes to /backup. The e2e tests fill the type-back where they ticked the box, and one holds the disabled, wrong and lowercase cases.
2. **A visitor who said "Not now" keeps one line in** (R9, flow). Dismissing the welcome hid every way to add a plant on the front page except the tab bar. A quiet line, "Keep a record of your plants on this device; nothing leaves it", stands in its place for a device with no plants.

## Finding your own plant

3. **The search is above Today on "Your species"** (R11). A grower with forty plants opening the app on a phone had Today's list between the top and the box to type a number into; the box is first now, Today is hidden while a query is typed, and on a desktop (701 px and up) the box takes focus on load. On a phone it does not, so the keyboard does not cover the page.

## The states the app shows

4. **Two words, then "Why?"** (R14). "Incomplete" on the plants list and "Waiting" on a record were paragraphs. A `StateNote` component shows the word as a pill ("3 waiting", "Waiting") with a `<details>` whose summary is "Why?", and the explanation inside is the one that was there, with a link to the glossary. Both pages use it.
5. **A glossary** (R14). /about/how has "Words the app uses": accession, batch, place, vault, key, sync batch, set aside, waiting, refused, not reached, each in a sentence, before "The source". The state notes link into it.

## The species that are not here

6. **A 404 says what the reference takes** (R15). `/species/nonsensia-fakeii` said the name was not on the list, which was true and no help. The 404 now carries the genus: "The reference has 2 Copiapoa species, and takes the genus whole as WCVP lists it, so this name is one Kew does not accept under Copiapoa", or for a genus held in part, "the genus is not taken whole, only the species of it most often recorded as cultivated", or for a genus with nothing, "it is built from a fixed list of names, and none of this genus is on it". Each links "Which species are here", GBIF and POWO searches for the name, and `/plants/new?species=` so the plant can still be recorded. The genus count comes from the index; whether a genus is taken whole comes from `scripts/specialist-genera.txt`, read at build. The word "yet" is gone from every 404 and from the tile placeholder: the reference prepares nothing on demand, and "yet" promised that it might (round thirty-eight's question, answered on /about/how, is now answered on the page too).

## The collection

7. **Records of the oldest shape are given their number as a change** (R4). A plant from before the ledger whose number is its id, or a batch without `no`, was read correctly by `accNo`/`sowNo` and never written, so every reader had to carry the fallback for good. On load, after the revival repair, each such record is written one change (`acc` or `no` set to the id), once, which syncs like any change. Test in `vault-store.test.ts` and the round-sixteen test counts it.
8. **Batches get labels** (R10). The labels page lists active batches under their own pick list with the sowing line (date, count, method) and prints them with a QR to `/propagation/<id>`; the batch page has a "Label" button, and `/labels?batch=<id>` arrives with that batch picked. e2e.
9. **"Set your site" is a setup step** (own). A plant with no place, no photograph and no site set offers the step beside the other three, since every seasonal sentence on its page is otherwise shifted to the north and says so; it goes when a site is set or the plant's place has coordinates. e2e.

## The reference

10. **The read-time mends are no-ops on a fresh build** (R5). The sea rule (no cold floor from a coastal grid cell) was applied when a dossier was parsed, so a freshly built file and its parsed form differed. The rule runs at build too, and a test builds a dossier, parses it, and finds it equal to the file.

## Not taken, with reasons

**The plants list's chips and sort hidden under eight plants** (own, named in round forty): "All" is the only way to see archived plants, and the e2e tests use the controls with one to three plants, which is also how a new grower meets them. Left as they are. **The thumb bar, the store-backed undo, the wire-format changes**: as round forty said.

## Counts

406 unit tests on 41 files (two new), 81 e2e (three new), local live check 8 of 8.

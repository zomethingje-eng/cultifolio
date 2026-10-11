/**
 * Every `<details>` in the app's source, where a person meets it, and how the single-tap check reaches it (round
 * sixty-nine; triage-68 P5, R46-31: r67h-disclosure tested 3 of the source's 26). A unit test
 * (tests/unit/r69p-disclosure-list.test.ts) reads the source and fails when a `<details>` is added, moved or dropped
 * without this list following; tests/e2e/r69p-disclosure.spec.ts presses each one once. No Playwright import here, so the
 * unit test can read it.
 *
 * `file` and `cls` name the element in the source (its static class attribute); `at` is the page and state the spec
 * sets up (a key of its setups); `sel` is the selector there. `unreached` says why one is not pressed, for the one whose
 * state the app cannot be brought to from a test without a server whose clock is wrong.
 */
export type Disclosure = { file: string; cls: string; at: string; sel: string; unreached?: string };

export const DISCLOSURES: Disclosure[] = [
  { file: 'src/routes/about/how/+page.svelte', cls: 'full', at: 'how', sel: 'details.full' },
  { file: 'src/routes/species/[slug]/+page.svelte', cls: 'cult acc', at: 'species', sel: 'details.cult.acc >> nth=0' },
  { file: 'src/routes/species/[slug]/+page.svelte', cls: 'why howmade', at: 'species', sel: 'details.why.howmade' },
  { file: 'src/routes/species/[slug]/+page.svelte', cls: 'figures', at: 'species', sel: 'details.figures' },
  { file: 'src/routes/species/[slug]/+page.svelte', cls: 'why', at: 'species', sel: 'details.why:not(.howmade) >> nth=0' },
  { file: 'src/routes/species/[slug]/+page.svelte', cls: 'why', at: 'species', sel: 'details.why:not(.howmade) >> nth=1' },
  { file: 'src/lib/ui/Provenance.svelte', cls: 'prov', at: 'species', sel: 'details.prov' },
  { file: 'src/routes/plants/new/+page.svelte', cls: 'namehelp', at: 'add', sel: 'details.namehelp' },
  { file: 'src/routes/plants/new/+page.svelte', cls: 'moredetails', at: 'add', sel: 'details.moredetails' },
  { file: 'src/routes/plants/new/+page.svelte', cls: 'own', at: 'add', sel: 'details.own' },
  { file: 'src/routes/plants/import/+page.svelte', cls: 'full', at: 'import', sel: '#imp-csv-paste-box' },
  { file: 'src/routes/plants/[acc]/+page.svelte', cls: 'hab', at: 'plant', sel: '#habitat' },
  { file: 'src/routes/plants/[acc]/+page.svelte', cls: 'why', at: 'plant-habitat', sel: '#habitat details.why' },
  { file: 'src/lib/ui/RefPhotoOffer.svelte', cls: 'rpo link', at: 'plant', sel: 'details.rpo.link >> nth=0' },
  { file: 'src/lib/ui/ReplacedNotes.svelte', cls: 'replaced', at: 'plant', sel: 'details.replaced' },
  { file: 'src/lib/ui/grow/PlantsFoot.svelte', cls: 'spend small', at: 'plants', sel: '#spend' },
  { file: 'src/lib/ui/StateNote.svelte', cls: 'why', at: 'parked', sel: '#waiting-notice details.why' },
  { file: 'src/routes/today/+page.svelte', cls: 'why howdecides', at: 'today', sel: '#how-today' },
  { file: 'src/routes/today/+page.svelte', cls: 'nights', at: 'today', sel: '#frost details.nights' },
  { file: 'src/lib/ui/grow/CalendarExport.svelte', cls: 'cal', at: 'today', sel: '#calendar' },
  { file: 'src/lib/ui/NotChecked.svelte', cls: 'nc', at: 'today', sel: '#frost details.nc' }, // inside the nights, after they are opened above
  { file: 'src/routes/backup/+page.svelte', cls: 'infile', at: 'backup', sel: 'details.infile' },
  { file: 'src/routes/sync/+page.svelte', cls: 'tech', at: 'sync', sel: 'details.tech:has(#fold)' },
  { file: 'src/routes/sync/+page.svelte', cls: 'tech', at: 'sync', sel: '#sync-error-detail' },
  {
    file: 'src/routes/sync/+page.svelte', cls: 'tech inline', at: 'sync', sel: '#clock-ahead details',
    unreached: "Shown only when the sync server dates a batch ahead of its own clock, which a test of this app's own server cannot make it do; its summary is the same markup and style as the two sync disclosures pressed above"
  }
];

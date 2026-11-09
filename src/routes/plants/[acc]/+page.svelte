<script lang="ts">
  import { backLayer } from '$lib/ui/back-layer.svelte';
  import { climateReason } from '$dossier/range-via';
  import { noGbif, recordsUnchecked, keylessPlantNotice, NO_GBIF_SENTENCE } from '$core/no-gbif';
  import { units } from '$lib/ui/units.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import { site } from '$lib/ui/site.svelte';
  import { detailSentence } from '$lib/ui/ref/head';
  import { localDate, daysBetween } from '$core/dates';
  import { temp, tempN, rain, deltaT, numberOrNull, fixed, mmToIn, inToMm } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto, beforeNavigate } from '$app/navigation';
  import { onMount, untrack } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import Opening from '$lib/db/Opening.svelte';
  import { CLOSED_WORDS } from '$lib/db/demo';
  import WaitingRecord from '$lib/ui/WaitingRecord.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import { settlePlaces } from '$lib/ui/places-pending';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import type { Provenance, PlantEvent } from '$lib/db/types';
  import { slugify, speciesOf, speciesSlug, parseName, isNamedHybrid, speciesNotStated, withoutSign } from '$core/names';
  import { sameName } from '$lib/ui/picked-name';
  import { readSearch } from '$lib/import/check';
  import SpeciesPicker from '$lib/ui/SpeciesPicker.svelte';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { entriesFor, sheetForNameOr, gbifNamedOr, isUnreached, searchCatalogue, type Unreached } from '$lib/ui/index.svelte';
  import { kindToSay, olderLead, recordedKind } from '$lib/ui/ref/older-kind';
  import { unreachedClause } from '$lib/ui/reach-words';
  import ReplacedNotes from '$lib/ui/ReplacedNotes.svelte';
  import type { Sheet } from '$lib/ui/index.svelte';
  import { cultivationSheet, runs, forReader, tiedMonths, monthNames, extremesWhyShort } from '$core/sheet';
  import { lapseCause } from '$core/lapse';
  import { EVENT_LABEL, MEASURES, PROP_METHODS, kindOf, type EventType, type Photo } from '$lib/db/types';
  import { parents } from '$core/names';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import PhotoAdd from '$lib/ui/PhotoAdd.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  import { photoLabel } from '$lib/ui/photo-label';
  import { focusNext, motion } from '$lib/ui/focus';
  import RefPhotoOffer from '$lib/ui/RefPhotoOffer.svelte';
  import Parked from '$lib/ui/Parked.svelte';
  import { restoredWords } from '$lib/ui/held-words';
  import { notesTaxon, comparedSpecies } from '$lib/db/species-list';
  import NotChecked from '$lib/ui/NotChecked.svelte';
  import { plantHref, batchHref } from '$lib/db/links';
  import PlantName from '$lib/ui/PlantName.svelte';
  import { plantLabel } from '$lib/ui/plant-label';
  import { readerLat } from '$lib/ui/site.svelte';
  import type { Accession } from '$lib/db/types';
  import PhotoTimeline from '$lib/ui/grow/PhotoTimeline.svelte'; // round sixty, agent F: the photo strip; by its own path, not the barrel (round sixty-one; a11y 3)
  import ForeignLabel from '$lib/ui/grow/ForeignLabel.svelte'; // a stranger's label
  // Round eighty-seven (t1): items, deaccession, ITF2 provenance, field numbers and identification ($core/identity).
  import { identityOf, bcssHref, idqlOf, exChainText, readExChain, readPartialDate, withEarlierName, itf2Problem, DEACC_REASONS, DEACC_LABEL, PROV_TYPES, PROV_TYPE_LABEL, PROP_HISTORIES, PROP_HISTORY_LABEL, ID_LEVELS, ID_LEVEL_LABEL, QUALIFIER_MEANS, NOTE_MAX, type DeaccReason, type ProvType, type PropHistory } from '$core/identity';
  // Round eighty-seven, F4: the plant's parents and offspring, the plant chosen as a cross's pollen parent or a graft's parts.
  import Lineage from '$lib/ui/grow/Lineage.svelte';
  import PlantRef from '$lib/ui/grow/PlantRef.svelte';
  import PlantChoice from '$lib/ui/grow/PlantChoice.svelte';
  import { MOTHER_HOW, MOTHER_HOW_LABEL } from '$lib/db/types';
  import { linkId } from '$lib/db/lineage';
  // Round eighty-seven (t3): the label's code, a plant's growing season and its papers.
  import { labelFromHash, plantQrUrl, tagIs } from '$lib/ui/grow/qr';
  import GrowingSeason from '$lib/ui/grow/GrowingSeason.svelte';
  import Attachments from '$lib/ui/grow/Attachments.svelte';
  onMount(() => { site.load(); collection.load(); });
  /** The URL carries the number people know (or an identity, from a printed code); everything below works on the record's identity. */
  const u = $derived(units.current);
  const param = $derived(page.params.acc!);
  /**
   * Every live plant the address names: one by its identity or its number, or several when two devices gave out the
   * same number offline. Several are listed to choose from, by identity, rather than one picked by load order, where a
   * Water would have gone to whichever loaded first (round sixty; the self-review's 2, the outside reviews' A13 and B1).
   */
  const choices = $derived(collection.ready ? (collection.withNumber('accession', param) as Accession[]) : []);
  /**
   * A scanned label's identity tag (`#i=…`, qr.ts): every code printed since round eighty-seven's stage 3 fixes carries it,
   * a tape's too. The number names the plant holding it now, and a number can change hands (a renumbering, a restore, a
   * plant traded in with another collection's label), so the page opens a plant from a code only when the tag is that
   * plant's (review B1).
   */
  const scanTag = $derived(labelFromHash(page.url.hash).tag);
  const tagged = $derived(scanTag && collection.ready ? collection.byTag(scanTag) : { live: [] as Accession[], removed: [] as Accession[] });
  /** Plants a renumbering moved off this number, for an address with no tag (a code of round eighty-seven before the tag, a typed number). */
  const movedAway = $derived(collection.ready && !scanTag && !choices.some((c) => c.id === param) ? collection.renumberedAway(param) : []);
  const a = $derived.by((): Accession | undefined => {
    if (scanTag) return choices.find((c) => tagIs(scanTag, c.id));
    if (choices.length !== 1 || movedAway.length) return undefined;
    return choices[0];
  });
  /**
   * The address names a plant other than the one holding its number, or none this device holds: said, every candidate
   * offered by its identity, none opened by itself (round eighty-seven, the stage 3 fixes; review B1). `moved`: the
   * label's plant holds another number now (or, with no tag, a renumbering moved a plant off this number); `foreign`: no
   * plant here has the label's tag, so it names a plant this collection does not hold under that identity.
   */
  const labelCase = $derived.by((): { kind: 'moved' | 'foreign'; printedFor: Accession[]; holders: Accession[] } | null => {
    if (!collection.ready || a) return null;
    if (scanTag) {
      const printedFor = tagged.live.filter((x) => !choices.some((c) => c.id === x.id));
      if (printedFor.length) return { kind: 'moved', printedFor, holders: choices };
      if (tagged.removed.length) return null; // the removed plant's own sentence, with Restore
      return { kind: 'foreign', printedFor: [], holders: choices };
    }
    return movedAway.length && choices.length <= 1 ? { kind: 'moved', printedFor: movedAway, holders: choices } : null;
  });
  const id = $derived(a?.id ?? param);
  const events = $derived(collection.events(id));
  /* ---- photos ---- */
  const photos = $derived(collection.photos(id));
  const cover = $derived(collection.cover(id));
  let lightbox = $state<number | null>(null);
  let adding = $state(false);
  let thumbFailed = $state(false);
  let confirmRemove = $state(false);
  /** The log entry whose × was pressed once; a second press removes it. */
  let confirmEvent = $state<string | null>(null);
  const openPhoto = (ph: Photo) => (lightbox = Math.max(0, photos.findIndex((x) => x.id === ph.id)));
  // The number repair's note on a plant whose latest stamp is marked is dated by the day the repair was written, when the
  // note carries that time (round sixty-three; outside review B9): read from the log when the lines change, by line.
  let lineDates = $state<Map<string, string>>(new Map());
  let linesAsked = 0;
  $effect(() => {
    void events;
    const seq = ++linesAsked;
    collection.recordedLineDates(id).then((m) => { if (seq === linesAsked) lineDates = m; }, () => {});
  });
  /** Events and photos on one timeline, newest first. */
  const timeline = $derived(
    [...events.map((e) => ({ k: 'e' as const, d: lineDates.get(e.id) ?? e.d, id: e.id, e })), ...photos.map((ph) => ({ k: 'p' as const, d: ph.d, id: ph.id, ph }))].sort((a, b) => b.d.localeCompare(a.d) || b.id.localeCompare(a.id))
  );
  // The log shows its latest five lines, the rest one tap away: on a phone the photographs and the habitat follow it (round fifty-eight; the grower review).
  const LOG_FIRST = 5;
  let allLog = $state(false);
  const shownTimeline = $derived(allLog || timeline.length <= LOG_FIRST ? timeline : timeline.slice(0, LOG_FIRST));
  /* ---- lengths ---- */
  // Lengths follow the grower's length units, not the temperature setting; stored in millimetres always, inches shown to one decimal (round fifty-eight; the grower review).
  const lu = $derived(prefs.lengthUnits);
  const lenN = (mm: number) => (lu === 'in' ? fixed(mmToIn(mm), 1) : fixed(mm, mm === Math.round(mm) ? 0 : 1));
  const len = (mm: number) => `${lenN(mm)} ${lu}`;
  const toMm = (typed: number) => (lu === 'in' ? Math.round(inToMm(typed) * 10) / 10 : typed);
  /** A repot's pot size rides in `measures` as `pot`, in millimetres; it is not a size of the plant, so it is not in the measure form (round fifty-eight). */
  const POT = { k: 'pot', label: 'Pot', unit: 'mm' };
  const measureOf = (k: string) => MEASURES.find((x) => x.k === k) ?? (k === POT.k ? POT : undefined);
  /** The record "My notes on …" are kept on: the species', or an "sp." plant's own full name (round sixty-two; A21). */
  const notesOn = $derived(a ? notesTaxon(a.taxonName) : null);
  const taxonSlug = $derived(notesOn?.slug ?? '');
  const taxon = $derived(a ? collection.taxon(taxonSlug) : undefined);
  /** An "sp." plant's notes written before they were kept by its full name, on the bare genus every such plant shared: still shown, and offered to the editor (round sixty-two; A21). */
  const sharedNotes = $derived(notesOn?.shared && !taxon?.myNotes ? (collection.taxon(notesOn.shared)?.myNotes ?? null) : null);
  /** The species a "cf." or "aff." plant is compared with: its link and its habitat comparison say so (round sixty-two; A21). */
  const compared = $derived(a ? comparedSpecies(a.taxonName) : null);
  const sowing = $derived(a?.sowingId ? collection.sowing(a.sowingId) : undefined);
  /** The plant's identity and provenance fields, each read and checked ($core/identity; round eighty-seven, t1). */
  const ident = $derived(a ? identityOf(a as unknown as Record<string, unknown>) : null);
  /** Its earlier names, with those its rename lines record and its history does not (a rename on round eighty-six; review M2). */
  const earlier = $derived(a ? collection.earlierNames(a.id).list : []);
  /** The plant that holds the accession's bare number, and the accession's live plants (F1). */
  const holder = $derived(a ? collection.accessionHolder(a.id) : undefined);
  const accPlants = $derived(a ? collection.accessionPlants(a.id) : []);
  /** The name's qualifier ("cf.", "aff.", "nr.", "sp."), said with what it means and ITF2's code for it (F6). */
  const qualifier = $derived(a ? parseName(a.taxonName).qualifier ?? null : null);
  /** The cross its batch was sown from, said beside the name and never in its place (round eighty-seven, F4): seed parent first. */
  const crossParents = $derived.by(() => { const ps = a ? collection.parentsOf(a) : []; const seed = ps.find((p) => p.role === 'seed'), pollen = ps.find((p) => p.role === 'pollen'); return seed && pollen ? { seed: seed.id, pollen: pollen.id } : null; });
  let dossier = $state<Sheet | null>(null);
  /** The species page's slug: the sheet's own (a homonym's is suffixed) when the sheet is here, else the name's (round eighteen, 6). */
  // A sheet filed under another name for a plant of its key carries its page's own address (`page`; round eighty-five).
  const speciesHref = $derived(dossier?.page ?? dossier?.slug ?? (a ? speciesSlug(a.taxonName) : ''));
  /** What the reference said about this plant's species: still being asked, could not be reached (a different fact from absent), not there, or read. */
  let ref = $state<'loading' | 'unreachable' | 'none' | 'ok'>('loading');
  /** Why the reference gave no answer, so a refusal or a limit is said as one, never as silence (round sixty-seven; triage-66 S8, R45-11). */
  let refWhy = $state<Unreached | null>(null);
  /** The reason as a sentence's start, or null for no answer at all, which keeps its own words. */
  const refused = $derived(refWhy && refWhy.kind !== 'unreachable' ? (() => { const c = unreachedClause(refWhy, 'the species reference'); return c.charAt(0).toUpperCase() + c.slice(1); })() : null);
  const kind = $derived(a ? kindOf(a) : 'species');
  /** A named nothospecies is asked of the reference as a species is: the reference holds some (Mentha × piperita), and its page is the plant's species page (round eighty-one, H). A cross written out, or a cultivar of a genus, is not. */
  /** A cultivar filed under its genus, its species not stated ("Echeveria 'Lola'"): it has no species page (round eighty-four; review-w W5). */
  const notStated = $derived(!!a && kind === 'cultivar' && speciesNotStated({ ...parseName(a.taxonName), kind: 'cultivar' }));
  const asSpecies = $derived((kind !== 'hybrid' && !notStated) || (!!a && isNamedHybrid(a.taxonName)));
  /**
   * A record an earlier version filed as a hybrid from a cultivar under a genus alone, with no parentage: the log is read as
   * written (the grower may have chosen "hybrid" on this form, which the record cannot tell apart), and the page offers to
   * file it as a cultivar, species not stated, in one tap that the log records (round eighty-four; review-w W5, outside
   * review A9).
   */
  const hybridOfCultivar = $derived(!!a && kind === 'hybrid' && !!a.cultivar && !a.parentage && !parseName(a.taxonName).epithet && !a.taxonName.trim().startsWith('×'));
  let refiling = $state(false);
  async function fileAsCultivar() {
    if (!a || refiling) return;
    refiling = true;
    try {
      const fields = { nameKind: 'cultivar', parentage: null };
      await collection.putWith('accession', a.id, fields, [{ acc: a.id, d: localDate(), t: 'note', note: 'Now recorded as a cultivar, species not stated', auto: true }], collection.sharedWith(a.id, fields)); // every plant of the accession (round eighty-seven, t1)
      toast.show('Now a cultivar, species not stated; the log says so.');
    } catch { /* refused: the notice above says why */ } finally { refiling = false; }
  }
  /**
   * A name with no species page may be an older name of one (round eighty-four; review-w W6: "Aloe aristata", whose address
   * goes to Aristaloe aristata, said only "No species page under this name"). Looked up when the grower asks: the plant's
   * own page asks the reference by hash group, never by name, so the name goes to the catalogue's search only on that
   * press, as the search box sends it. `older` is the page found, with a way to file the plant under it.
   */
  let olderLook = $state<{ for: string; state: 'asking' | 'none' | 'unreached' } | { for: string; state: 'older'; name: string; slug: string | null; key: number | null; via?: string; /** the name is GBIF's name for the page's key (round eighty-six; review-w W1) */ gbif?: boolean; /** which it is was not reached (the final review's U3) */ filed?: boolean } | null>(null);
  async function lookOlder() {
    if (!a) return;
    const name = speciesOf(a.taxonName);
    olderLook = { for: a.taxonName, state: 'asking' };
    const got = await searchCatalogue(name, 6);
    if (olderLook?.for !== a?.taxonName) return;
    if (got === null || !Array.isArray(got)) { olderLook = { for: a.taxonName, state: 'unreached' }; return; }
    const r = readSearch(name, true, got);
    // GBIF's name for the page's key, said as that (round eighty-six; review-w W1): by the row (`gname`), or by the copy
    // of the page's sheet the build files under the name.
    // A copy group not reached leaves it unknown whether the name is GBIF's or an older one: said as "The reference files
    // it under", never as an older name it may not be (round eighty-six, the final review's U3).
    const g0 = r.s === 'near' && r.why === 'older name' && !r.gbif ? await gbifNamedOr(name) : null;
    if (olderLook?.for !== a?.taxonName) return;
    const filed = isUnreached(g0);
    const g = isUnreached(g0) ? null : g0;
    const gbif = r.s === 'near' && r.why === 'older name' && (!!r.gbif || (!!g && g.slug === r.slug));
    // A name below the one typed held as an older name is said as that (round eighty-five; review-w W2): "Trichocereus
    // pachanoi" was told it is no older name, though Echinopsis macrogona holds its form f. peruvianus.
    olderLook = r.s === 'near' && (r.why === 'older name' || r.why === 'infra') ? { for: a.taxonName, state: 'older', name: r.suggestion, slug: r.slug ?? null, key: r.key, ...(r.why === 'infra' && r.via ? { via: r.via } : {}), ...(gbif ? { gbif: true } : filed && r.why === 'older name' ? { filed: true } : {}) } : { for: a.taxonName, state: 'none' };
  }
  $effect(() => { void a?.taxonName; untrack(() => { if (olderLook && olderLook.for !== a?.taxonName) olderLook = null; }); });
  /** Files the plant under the page its name is an older name of, as Edit would, the old name kept as received and in the log. */
  async function fileUnderOlder() {
    const target = foundBy ? { name: foundBy.name, key: foundBy.key } : olderLook?.state === 'older' ? { name: olderLook.name, key: olderLook.key } : null;
    if (!a || !target || refiling) return;
    const to = target.name, key = target.key;
    const sub = a.taxonName.slice(speciesOf(a.taxonName).length).trim(); // a rank and epithet after the species stay with it
    const taxonName = sub ? `${to} ${sub}` : to;
    const oldFull = `${a.taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`;
    const newFull = `${taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`;
    refiling = true;
    try {
      const why = foundBy?.how === 'gbif' || (!foundBy && olderLook?.state === 'older' && olderLook.gbif) ? "the reference's name; the old one is GBIF's name for its key" : foundBy?.how === 'merged' ? "the reference's name; the old one's page was merged into it" : foundBy?.how === 'filed' || (!foundBy && olderLook?.state === 'older' && olderLook.filed) ? "the reference's name; the reference files the old one under it" : "the reference's name; the old one is an older name of it";
      // The name it had goes into its identification history, and the rename to every plant of the accession (round eighty-seven, t1).
      const fields = { taxonName, taxonKey: sub ? null : key, nameAsReceived: a.nameAsReceived ?? oldFull, idHistory: withEarlierName(collection.earlierNames(a.id).list, a, localDate()), ...(a.olderOf ? { olderOf: null } : {}), ...(a.olderKind != null ? { olderKind: null } : {}), ...(a.olderKindOf != null ? { olderKindOf: null } : {}) };
      await collection.putWith('accession', a.id, fields, [{ acc: a.id, d: localDate(), t: 'note', note: `Renamed from ${oldFull} to ${newFull} (${why})`, auto: true }], collection.sharedWith(a.id, fields));
      olderLook = null;
      toast.show(`Now filed under ${taxonName}; the old name is kept as received.`);
    } catch { /* refused: the notice above says why */ } finally { refiling = false; }
  }
  /**
   * The species page found for a plant whose name has none of its own (round eighty-five; review-c C4, review-s S2,
   * review-w W9, outside review A16a): `gbif`, the name is GBIF's name for the plant's own key, which the reference heads
   * with Kew's name (the build files the page's figures under that name too, for a plant of that key only); `merged`, the
   * name's page was merged into this one; `older`, the add form or the import found the name to be an older name of this
   * page, and the plant's record carries it (`olderOf`). Read by hash group, as any plant's species is: the server never
   * learns which. Null for a plant whose name is its page's.
   */
  type FoundBy = { how: 'gbif' | 'merged' | 'older' | 'filed'; name: string; key: number | null };
  let foundBy = $state<FoundBy | null>(null);
  /** A hybrid's parents, each with a species page when the corpus has one. */
  let parentLinks = $state<Array<{ name: string; slug: string | null }>>([]);
  $effect(() => {
    if (a) setCrumb([{ label: 'My plants', href: '/plants' }, { label: `${accNo(a)} · ${a.taxonName}${a.cultivar ? ` ‘${a.cultivar}’` : ''}` }]);
    return () => setCrumb([]);
  });
  /** The species behind the plant: its sheet, found by hash bucket (the server never learns the species), fetched again only when the name, the key or the parentage changes, never because the record was re-set; a late answer for a name no longer on the record is dropped. */
  let asked = 0;
  let askedFor = '';
  $effect(() => {
    if (!a) return;
    const name = a.taxonName, key = a.taxonKey ?? null, parentage = a.parentage ?? null;
    const want = `${name}\0${key}\0${parentage}`;
    if (want === askedFor) return; // the record was re-set (a watering, the key repaired) but the species is the same: nothing to ask again
    askedFor = want;
    const seq = ++asked;
    dossier = null; ref = 'loading'; foundBy = null;
    const olderOf = a.olderOf ?? null;
    const recorded = recordedKind(a); // only where recorded for this `olderOf` (round eighty-seven, M1)
    (async () => {
      // A wrong key would have put another species' habitat under this plant, so the sheet is found by the name. The key
      // the reference gives is kept here, not written: a page that opens does not write to the log (round fifty-eight;
      // rule 5), and a key that differs is said below with a button to take it.
      let got = await sheetForNameOr(name, key);
      if (seq !== asked) return;
      let by: FoundBy | null = null;
      // A sheet filed under another name than the page's: GBIF's name for the plant's key, or a merged page's old name.
      if (got && got !== 'none' && !isUnreached(got) && !sameName(speciesOf(withoutSign(name)), speciesOf(withoutSign(got.name.scientific)))) by = { how: got.via === 'gbif' ? 'gbif' : 'merged', name: got.name.scientific, key: typeof got.gbif === 'number' ? got.gbif : null };
      // The page the add form or the import named for this name, carried in the record: asked by its own hash group.
      if (got === 'none' && olderOf && !sameName(olderOf, name)) {
        const o = await sheetForNameOr(olderOf, null);
        if (seq !== asked) return;
        if (o && o !== 'none' && !isUnreached(o)) {
          got = o;
          // GBIF's name for that page's own key is said as that, by the copy the build files under the name (round
          // eighty-six; review-w W1: the same name typed said "GBIF's name", imported said "An older name of").
          // A copy group not reached leaves the kind unknown: said as "Filed under", never as an older name it may not be
          // (round eighty-six, the final review: U3 on the plant's own page).
          // Where the group is not reached, the kind the form or the import recorded when it filed the plant stands in
          // (round eighty-seven, the deeper fix of U3: `olderKind`, read by `kindToSay`); with neither, "Filed under".
          const g = await gbifNamedOr(name);
          if (seq !== asked) return;
          by = { how: kindToSay(recorded, isUnreached(g) ? null : !!(g && g.slug === o.slug)) ?? 'filed', name: o.name.scientific, key: typeof o.gbif === 'number' ? o.gbif : null };
        }
      }
      foundBy = by;
      refWhy = isUnreached(got) ? got : null;
      const d = isUnreached(got) ? null : got;
      // The reference's GBIF key, which a plant's key is (round seventy-eight: the sheet's `key` is the page's id).
      refKey = d && d !== 'none' && typeof d.gbif === 'number' ? d.gbif : null;
      dossier = d === 'none' ? null : d;
      ref = d === 'none' ? 'none' : d ? 'ok' : 'unreachable';
    })();
    const ps = parents(parentage);
    // The parents the record states are shown at once, unlinked, and linked when the index answers: an empty list while it
    // was asked said "parentage not stated" of a hybrid whose parentage is stated (round sixty-two, second pass; the
    // self-review's N5, the grower review's 11).
    parentLinks = ps.map((pn) => ({ name: pn, slug: null }));
    entriesFor(ps.map((n) => slugify(n))).then((m) => { if (seq === asked) parentLinks = ps.map((pn) => ({ name: pn, slug: m?.has(slugify(pn)) ? slugify(pn) : null })); });
  });
  /** A photograph of the species for the plant without one of its own: the index's thumb when the index was read, else the dossier's own first wild photograph. */
  const speciesThumb = $derived(prefs.referencePhotos ? dossier?.thumb : undefined); // a third-party request only when the grower switched it on (round twelve, A1)
  // Habitat versus here: the species' habitat figures, median with the 10th–90th span across the envelope cells, beside the bench's.
  const habitat = $derived.by(() => {
    if (!dossier || dossier.climate.status !== 'ok') return null;
    const c = dossier.climate;
    const m = c.months;
    const dli = (y: { dli?: number }[]) => y.map((x) => x.dli).filter((x): x is number => x != null);
    const dlis = dli(m), dli10 = dli(c.p10), dli90 = dli(c.p90);
    const ex = c.extremes ?? null;
    const exStatus = c.extremesStatus ?? null;
    const coldI = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const sheet = cultivationSheet({ scientific: dossier.name.scientific, family: dossier.name.family, months: m, p10: c.p10, p90: c.p90, extremes: ex, extremesStatus: exStatus, extremesLapse: c.extremesLapse ?? null, lat: dossier.habitatLat ?? c.at.lat, units: u });
    return {
      dli: dlis.length ? { lo: Math.min(...dlis), hi: Math.max(...dlis), lo10: dli10.length ? Math.min(...dli10) : null, hi90: dli90.length ? Math.max(...dli90) : null } : null,
      night: { v: m[coldI].tmin, mo: coldI + 1, at: monthNames(tiedMonths(m.map((x) => x.tmin), false, (v) => temp(v, u, 1))), lo: c.p10[coldI].tmin, hi: c.p90[coldI].tmin }, // a tie names every month (round sixty-one; visitor 5)
      ex,
      exStatus,
      setAside: c.extremesLapse ? lapseCause({ months: m, extremes: c.extremesLapse }) : null,
      year: sheet.year,
      cells: c.cells
    };
  });
  const cond = $derived(a?.locationId ? collection.conditions(a.locationId) : null);
  const hereDli = $derived(cond?.ppfd != null ? (cond.ppfd * (cond.lightHours ?? 12) * 3600) / 1e6 : null);
  const r0 = (x: number) => x.toFixed(0);
  // Side by side, no verdict: a regional radiation figure and a climate percentile are facts about the
  // places the species is recorded, not measured tolerances of this plant. The comparison is shown; the judgement is the grower's.
  // The glossary's plain words in what the grower reads: "across the range", "a typical spot in the range", and what
  // "set aside" meant (round fifty-eight; the accessibility review).
  const lightCompare = $derived.by(() => {
    if (!habitat?.dli) return null;
    const d = habitat.dli;
    const sky = `open sky over the habitat ${r0(d.lo)}–${r0(d.hi)} mol/m²/day across the year (median year${d.lo10 != null && d.hi90 != null ? `; across the range, ${habitat.cells} grid cells, ${r0(d.lo10)} to ${r0(d.hi90)}` : ''}; CHELSA)`;
    if (hereDli == null) return { here: null, text: `${sky}; no light figure for this space` };
    // Hours not set are taken as 12 and said so: "from this place's settings" claimed a figure the grower never gave (round fifty-nine).
    return { here: hereDli, text: `${r0(hereDli)} mol/m²/day here, from this space's light${cond?.lightHours == null ? ' and 12 hours assumed (no hours set)' : ` over ${cond.lightHours} hours`}; ${sky}` };
  });
  const coldCompare = $derived.by(() => {
    if (!habitat) return null;
    const n = habitat.night;
    const night = `coldest month's mean nightly low at the habitat ${temp(n.v, u, 1)} in ${n.at} (median year; across the range, ${habitat.cells} grid cells, ${tempN(n.lo, u)} to ${tempN(n.hi, u)}; CHELSA)`;
    // With no extremes, say why, as the species page and compare do: a refusal or a skip is not an absence (round eighteen, 8).
    const p01 = habitat.ex ? `; 1st-percentile night over ${habitat.ex.years} years at a typical spot in the range ${temp(habitat.ex.minP01, u, 1)} (NASA POWER)` : habitat.exStatus === 'refused' ? '; the daily extremes were not checked (NASA POWER did not answer when the species page was built)' : habitat.exStatus === 'skipped' ? '; the daily extremes were not asked for when the species page was built' : habitat.exStatus === 'sea' ? '; the daily extremes were read at a weather cell that is mostly sea and are not used, so no floor is read (the species page says what that cell gave)' : habitat.exStatus === 'lapse' ? `; ${extremesWhyShort('lapse', habitat.setAside, u)}, so no floor is read` : ''; // the cause that applied (round eighty-four; D1)
    if (cond?.floorC == null) return { here: null, text: `${night}${p01}; no floor set for this space` };
    return { here: cond.floorC, text: `this space is ${cond.floorHeld ? 'held at' : 'set to bottom out at'} ${temp(cond.floorC, u, 1)}; ${night}${p01}` };
  });
  // The habitat rain season as a figure: the rain rule's reading in habitat months and shifted to this place's hemisphere. No verdict.
  const season = $derived.by(() => {
    if (!habitat?.year) return null;
    const y = habitat.year;
    // This place's coordinates, else the site set in Settings, else the north with a note: the same order as the species page.
    const hereLat = cond?.lat ?? readerLat(collection.locations); // the place, the site, else the first place with coordinates, as the species page, the labels and Today do (round fifteen, 4; round sixty)
    const southHere = (hereLat ?? 40) < 0;
    const here = runs(forReader(y, hereLat ?? 40), 'short');
    const home = `${runs(y.growMonths, 'short')} (${y.south ? 'S' : 'N'})`;
    const shift = `shifted to ${cond?.lat != null ? 'this space' : hereLat != null ? 'your site' : 'the north'}${hereLat == null ? ' (no site set)' : ''}: ${here}`;
    // The median year's total, named as that: the species page's glance card shows the median of the cells' own yearly
    // totals, a different figure (round sixty-three; the fix pass, R2 1).
    if (y.none) return { label: 'No season to read', note: `${rain(y.annualMm, u)} of rain in the median year and a flat temperature curve (${deltaT(y.rangeT, u)} of range): no rainy season and no cooler half (CHELSA).` };
    const same = !y.shiftable ? 'not shifted: no thermal season to reverse' : southHere === y.south ? 'the same here' : shift;
    if (y.fog) return { label: 'No rainy season to read', note: `${rain(y.annualMm, u)} of rain in the median year; the temperature rule's cooler six months ${home}, ${same} (CHELSA).` };
    if (y.spread) return { label: 'Rain spread, no season', note: `70% of the rain takes ${y.growMonths.length} months, ${home} (CHELSA).` };
    if (y.flat) return { label: `Rain ${home}, flat temperature`, note: `a sharp rainy season, but the temperature curve moves ${deltaT(y.rangeT, u)}, so no growing season is inferred; ${same} (CHELSA).` };
    if (y.grow === 'even') return { label: `Rain ${home}, neither winter nor summer`, note: `the wet season sits at the year's mean temperature; ${same} (rain rule, CHELSA).` };
    return { label: `${y.grow === 'winter' ? 'Winter' : 'Summer'} rain ${home}`, note: `${same} (rain rule, CHELSA).` };
  });
  /** Why no growing season is suggested, for the plant's growing-season line (round eighty-seven, t3): the reading's own reason, or why there is no reading. */
  const seasonWhy = $derived(habitat?.year ? (habitat.year.frozen ? 'its habitat\'s wet season has nights below freezing, so its species page reads no growing season' : habitat.year.none ? 'its species page reads no season for its habitat' : habitat.year.flat ? 'its habitat\'s temperature curve is flat, so its species page reads no growing season' : habitat.year.grow === 'even' ? 'its habitat\'s rainy season is neither the cooler nor the warmer half of the year' : null) : kind === 'hybrid' ? 'a hybrid has no one habitat to read it from' : dossier && dossier.climate.status !== 'ok' ? 'its species page has no habitat climate to read it from' : ref === 'unreachable' ? 'the species reference was not reached, so no suggestion was read' : ref === 'none' ? 'no species page to read it from' : null);
  /* ---- move ---- */
  let moving = $state(false);
  let moveTo = $state<string | null>(null);
  /** A Move under way: a second press waits for nothing and writes nothing (round sixty-seven; triage-66 R11: two presses wrote two moves and two lines). */
  let moveBusy = $state(false);
  async function doMove() {
    if (moveBusy) return;
    moveBusy = true;
    try {
      // This panel's own picker only: the Edit form's unsaved new place is not made by a Move (round sixty-seven; triage-66 R12).
      // A new place still being written, or named and not added: moved to it, not left where it was. One that could not be
      // made says why in the picker, and nothing is moved.
      try { await settlePlaces('mv-loc'); } catch { return; }
      if (!a || (moveTo ?? null) === (a.locationId ?? null)) { moving = false; return; }
      const to = moveTo ?? null;
      const { undo } = await collection.movePlantsUndoable([id], to); // the place and the line in one commit (round forty-nine, 1), with the way back (round fifty-one, 4)
      moving = false;
      toast.show(to ? `Moved to ${collection.locationName(to)}` : 'Space cleared', 8000, { label: 'Undo', run: () => { void undo().then(() => toast.show('Undone: back where it was.'), () => toast.show('The Undo was not saved; the plant is where it was moved.')); } });
    } catch {
      /* the write was refused: the page says so from lastWriteError, and the panel stays open to try again */
    } finally {
      moveBusy = false;
    }
  }
  const daysAgo = (d: string | null | undefined) => (d ? daysBetween(d) : null);
  const lastOf = (t: string) => events.find((e) => e.t === t)?.d ?? null;
  const sinceWater = $derived(daysAgo(collection.lastWatered(id))); // the collection's figure: a future-dated line is not a watering (round twenty-five, 1)
  const careDays = $derived(a ? collection.careDays(a) : 0); // and when nothing is logged, the days since the record was made: the same figure the list and Today count (round twenty-six, 6)
  const seen = $derived(daysAgo(collection.lastSeen(id)));
  const lastMeasure = $derived(events.find((e) => e.t === 'measure' && e.measures));
  const firstMeasure = $derived([...events].reverse().find((e) => e.t === 'measure' && e.measures));
  const sizeKey = $derived(lastMeasure ? (['diam', 'h', 'caudex', 'spread', 'heads', 'leaves'].find((k) => lastMeasure.measures?.[k] != null) ?? null) : null);
  const growth = $derived(sizeKey && lastMeasure && firstMeasure && firstMeasure !== lastMeasure && firstMeasure.measures?.[sizeKey] != null ? lastMeasure.measures![sizeKey] - firstMeasure.measures![sizeKey] : null);
  let moreActs = $state(false);
  // The id card's one primary action is the species page; editing, the label and propagation are behind "More", which
  // closes on a choice, Escape, or a tap outside (improvements, 7).
  let cardMenu = $state(false);
  let cardMenuBtn = $state<HTMLButtonElement | null>(null);
  const autofocusFirst = (el: HTMLElement) => {
    el.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  };
  /** A menu's keys: arrows move, Home and End jump, Tab leaves and closes (round twenty, 11). */
  function menuKeys(e: KeyboardEvent) {
    const items = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Tab') closeCardMenu();
  }
  function closeCardMenu(refocus = false) {
    cardMenu = false;
    if (refocus) cardMenuBtn?.focus();
  }
  /** Whether the first screen has a picture: the grower's own, or the reference's where it is shown. Without one there is no hero; a tile beside the name stands in (improvements, 4). */
  const hasHero = $derived(!!cover || (!!speciesThumb && !thumbFailed));
  /**
   * The reference's photograph's room, held while the sheet is asked (round seventy-nine, after round seventy-eight's
   * offer line): with the reference's photographs switched on, the species' photograph arrived as a hero above the card
   * and moved the card and the verb bar down by its height. Held where a hero is the likely answer: the grower shows the
   * reference's photographs, the plant has no photograph of its own, and it is not a hybrid (which has no sheet of its
   * own); 6,318 of the reference's 8,947 species (71 %) have a photograph. Where none comes (a species without one, a
   * name the reference does not hold or could not be asked for, a picture that does not load), the held box goes and the
   * card takes the small tile: the card and the bar move up by the hero's height, the rarer move.
   */
  const heroHeld = $derived(!hasHero && !cover && prefs.referencePhotos && ref === 'loading' && asSpecies);
  /** The first screen is laid out for a hero: one shown, or one's room held. */
  const heroRoom = $derived(hasHero || heroHeld);
  const offerWhat = $derived(compared ? 'the reference’s photograph of the species it is compared with' : 'the reference’s photograph of this species');
  // One date style on the page, the log's: the card said "4 Oct 2026" over a log of "2026-10-15" (round sixty; the grower review, 16).
  const fmtDate = (d: string | null | undefined) => d ?? '';
  // What a new plant's page is missing: a place, a photograph, a first measurement. Each line goes when it is done; the card goes when one line is left.
  const setup = $derived.by(() => {
    if (!a || a.status !== 'growing') return [];
    const rows: { k: string; n: string; t: string; w: string; go: () => void }[] = [];
    if (!collection.placeOf(a.locationId)) rows.push({ k: 'place', n: '1', t: 'Give it a space', w: 'the greenhouse, bench, shelf or windowsill it lives on; conditions and the frost watch follow', go: () => { moveTo = null; moving = true; } });
    if (!photos.length) rows.push({ k: 'photo', n: '2', t: 'Add a photograph', w: 'the page and the labels use it', go: () => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); } });
    if (!lastMeasure) rows.push({ k: 'measure', n: '3', t: 'Measure it', w: 'growth is read from the first measurement on', go: () => { moreActs = true; quick('measure'); } });
    // The site is not a step on a plant: it is set once, in Settings, and the habitat block says so in one line while it is not (round fifty-eight; the grower review).
    return rows.length >= 2 ? rows : [];
  });
  const provLabel = (p: string | null | undefined) => (p === 'wild' ? 'wild-collected' : p === 'f1' ? 'F1, raised from wild-collected seed' : p === 'fn' ? 'cultivated seed (Fn)' : p === 'veg' ? 'vegetative' : 'provenance not stated');
  let logOpen = $state(false);
  /** The toast after a log line: "Watering recorded", not "Watered recorded" (round twenty-two, 21). */
  const recordedText = (label: string) => ({ Watered: 'Watering recorded', Fed: 'Feeding recorded', Treated: 'Treatment recorded', Repotted: 'Repotting recorded', Measured: 'Measurement recorded', Flowered: 'Flowering recorded', Note: 'Note recorded', Died: 'Death recorded', Pruned: 'Pruning recorded', Moved: 'Move recorded', 'Set fruit': 'Fruit set recorded', 'Set seed': 'Seed set recorded' } as Record<string, string>)[label] ?? `${label} recorded`;
  /** Water is one tap: a watering today, with an Undo for a few seconds; a watering with a date or a note goes through Log (round forty-nine, 3). */
  let wateringNow = $state(false);
  async function waterNow() {
    if (wateringNow) return;
    // A watering already recorded today is not recorded again: two taps are one watering, as the grower means them (round fifty-two, 3).
    const already = events.find((e) => e.t === 'water' && e.d === localDate());
    if (already) { toast.show('Already recorded as watered today.'); return; }
    wateringNow = true;
    try {
      const ev = await collection.addEvent({ acc: id, d: localDate(), t: 'water' });
      toast.show('Watering recorded', 8000, { label: 'Undo', run: () => { void collection.removeEvents([ev.id]).then(() => toast.show('Undone: the watering line removed.')); } });
    } finally {
      wateringNow = false;
    }
  }
  /** Archive asks once: it is one tap on the bar, and it takes the plant off every list (round forty-nine, 3). */
  let confirmArchive = $state(false);
  function quick(t: EventType) {
    // A draft kept by Back reopens as it was left, its kind and date too, from "Record…" (round eighty-four; review-p P6);
    // a verb's own button opens its own kind, with the words typed.
    const k = kept;
    kept = null;
    et = k && t === 'note' ? k.et : t;
    ed = k && t === 'note' ? k.ed : localDate(); // today as of opening the form, not as of loading the page (round twenty-four, 2)
    logOpen = true;
    // The first thing to fill: a measurement's first figure, a treatment's product, else the note.
    setTimeout(() => (document.querySelector<HTMLElement>(t === 'measure' ? '.measures input' : t === 'treat' || t === 'feed' ? '#ev-used' : t === 'repot' ? '#ev-pot' : '#ev-note') ?? document.getElementById('ev-note'))?.focus(), 0);
  }
  /** After a record or a cancel, focus returns to the verb bar and the log line is announced, so a keyboard user is not dropped on the page body. */
  /** The Undo a recorded death offers (round sixty). */
  let deathUndo: { label: string; run: () => void } | null = null;
  /**
   * How the Record form closed (round eighty-four; review-p P6): `cancel`, its Cancel button, drops what was typed; `back`,
   * the browser's Back or Escape (on Android the gesture that puts a keyboard or a sheet away), keeps it for the next
   * "Record…" and says so, with a way back into it. A line recorded has cleared it already.
   */
  function closeLog(recorded?: string, how: 'cancel' | 'back' = 'cancel') {
    logOpen = false;
    if (recorded) toast.show(recorded, 2400, deathUndo);
    else if (how === 'cancel') clearDraft();
    else if (draftTyped()) {
      kept = { et, ed };
      toast.show('Record closed. What you typed is kept: “Record…” opens it again.', 8000, { label: 'Open it', run: () => quick('note') });
    }
    deathUndo = null;
    setTimeout(() => document.querySelector<HTMLElement>('.quickbar button')?.focus(), 0);
  }
  // Back closes the Record form and stays on the plant (round eighty-one; the phone review's 8), keeping what was typed (round eighty-four; P6).
  backLayer('record', () => logOpen, () => closeLog(undefined, 'back'));
  /** The kind and date of a draft Back kept, for the next "Record…". */
  let kept: { et: EventType; ed: string } | null = null;
  const draftTyped = () => !!(enote.trim() || eused.trim() || ecause.trim() || emedium.trim() || numberOrNull(epot) != null || Object.values(measures).some((v) => numberOrNull(v) != null) || epollen || escion || estock);
  function clearDraft() {
    enote = ''; eused = ''; ecause = ''; measures = {}; epot = ''; emedium = ''; evmsg = '';
    epollen = null; escion = null; estock = null;
    kept = null;
  }
  // A draft is this plant's: the page is kept when another plant's page opens, and must not carry it there.
  $effect(() => { void id; untrack(clearDraft); });
  const propagations = $derived(collection.propagationsOf(id));

  let et = $state<EventType>('water');
  let ed = $state(localDate());
  let enote = $state('');
  let eused = $state('');
  let ecause = $state('');
  let measures = $state<Record<string, string | number | null>>({});
  // A repot's pot size and medium, both optional, beside its free-text note (round fifty-eight; the grower review).
  let epot = $state<string | number | null>('');
  let emedium = $state('');
  /** A pollinate line's pollen parent, which makes it a cross; a graft line's scion and stock plants (round eighty-seven, F4). Each one of the grower's plants, or none. */
  let epollen = $state<string | null>(null);
  let escion = $state<string | null>(null);
  let estock = $state<string | null>(null);
  let editingNotes = $state(false);
  let notesDraft = $state('');
  let notesBase = ''; // the text the editor opened on: a text that changed underneath it (another tab, a pull) is logged before it is written over (round twenty-four, 1)
  let notesBaseStamp: string | null = null; // and its stamp, which the saved edit carries as `notesBase` so other devices know what it was made from (round twenty-five, 2)
  let myNotesDraft = $state('');
  let editingMy = $state(false);

  /* ---- edit the record ---- */
  let editing = $state(false);
  /** The species' key while editing: kept when the name is untouched, cleared by typing, set again by picking a suggestion. */
  let edKey = $state<number | null>(null);
  /**
   * A name typed in the edit is checked under the Save press, as the add form's is (round eighty-six, the final review's
   * U4; plants/new's C2): a Save before the name check had concluded filed the picker's key as it stood, none.
   * `edArmed`: the picker's line has said what the next Save keeps, so it keeps it.
   */
  let edChecking = $state(false);
  let edArmed = $state(false);
  let edPicker = $state<{ check: () => Promise<boolean>; olderFirst: () => Promise<boolean>; olderAnswer: () => string | null } | null>(null);
  let f = $state({ taxonName: '', cultivar: '', nameKind: 'species' as string, parentage: '', nameAsReceived: '', fieldNumber: '', provenance: 'unknown' as string, acquired: '', sourceFrom: '', sourceForm: '', price: '', waterDays: '', locationId: null as string | null, clone: '', exChain: '', collector: '', collected: '', provType: '', propHistory: '', idLevel: '', idBy: '', idOn: '', motherAcc: null as string | null, motherHow: 'offset' as string });
  function startEdit() {
    if (!a) return;
    edDateMsg = ''; // a refusal belongs to the edit that was refused, not to the next one opened (round twenty-seven, R2-2)
    edKey = a.taxonKey ?? null;
    edArmed = false;
    f = { taxonName: a.taxonName, cultivar: a.cultivar ?? '', nameKind: a.nameKind && !['species', 'cultivar', 'hybrid'].includes(a.nameKind) ? a.nameKind : kindOf(a), parentage: a.parentage ?? '', nameAsReceived: a.nameAsReceived ?? '', fieldNumber: a.fieldNumber ?? '', provenance: a.provenance ?? 'unknown', acquired: a.acquired ?? '', sourceFrom: a.sourceFrom ?? '', sourceForm: a.sourceForm ?? '', price: a.price ?? '', waterDays: a.waterDays != null ? String(a.waterDays) : '', locationId: a.locationId ?? null, clone: a.clone ?? '', exChain: exChainText(ident?.exChain ?? []), collector: a.collector ?? '', collected: a.collected ?? '', provType: typeof a.provType === 'string' ? a.provType : '', propHistory: typeof a.propHistory === 'string' ? a.propHistory : '', idLevel: typeof a.idLevel === 'string' ? a.idLevel : '', idBy: a.idBy ?? '', idOn: a.idOn ?? '', motherAcc: linkId(a.motherAcc, a.id), motherHow: a.motherHow ?? 'offset' };
    fOpen = { ...f };
    edIdentMsg = '';
    edWaterMsg = '';
    editing = true;
    void focusNext('#ed-name'); // the first field, so a keyboard user who chose Edit from the menu lands in the form (round twenty, 11)
  }
  /** The form as it opened: only the fields the grower changed in it are written, so a form open while another tab or a sync changed the record does not write the old values back over the new (round fifty-two, 4). */
  let fOpen = {} as typeof f;
  /** The stored acquisition date when it is not a whole day (a year, a year and month): the form keeps it unless a day is picked. */
  const partialAcquired = $derived(a?.acquired && !/^\d{4}-\d{2}-\d{2}$/.test(a.acquired) && f.acquired === (a.acquired ?? '') ? a.acquired : null);
  let edDateMsg = $state('');
  let edWaterMsg = $state('');
  /** Why the identity and provenance fields cannot be saved as typed (round eighty-seven, t1), said under them. */
  let edIdentMsg = $state('');
  /** The rhythm this plant follows when it sets none: its place's, inherited down the tree, else 21 days (round fifty-eight; the grower review). */
  const inheritedRhythm = $derived(a ? collection.rhythm({ ...a, waterDays: null }) : 21);
  // The record's form asks only when a field differs from how it opened, as the notes and the species page's editor do: an
  // Edit opened and left untouched asked "What you typed here will be lost" with nothing typed, and a reload or an address
  // typed asked the browser's "Leave site?" (round sixty-four; the Firefox run, whose goto from an untouched form was refused).
  const edChanged = () => (Object.keys(f) as Array<keyof typeof f>).some((k) => f[k] !== fOpen[k]);
  const formDirty = () => (editing && edChanged()) || (editingNotes && notesDraft.trim() !== (notesBase ?? '').trim()) || (editingMy && myNotesDraft.trim() !== myNotesOpen.trim());
  // A half-done form is not lost to a tab-bar tap or a reload without asking (round fifty-two, 4; the Add form has had this since round forty-nine).
  beforeNavigate((nav) => {
    if (!formDirty() || nav.type === 'leave' || nav.willUnload) return;
    if (!confirm('Leave this page? What you typed here will be lost.')) nav.cancel();
  });
  function guardUnload(e: BeforeUnloadEvent) {
    if (formDirty()) e.preventDefault();
  }
  /** A Save under way: a second press writes nothing (round sixty-seven; triage-66 R11). */
  let saveBusy = $state(false);
  async function saveEdit() {
    if (saveBusy) return;
    saveBusy = true;
    try { await saveEditNow(); } catch { /* refused: the page says so from lastWriteError, and the form stays open */ } finally { saveBusy = false; }
  }
  async function saveEditNow() {
    if (!a) return;
    // A date after today is a typo, and the number a plant carries is minted for its acquisition year (round twenty-six, 3).
    // Only a date this edit typed is judged: a plant whose stored date is already in the future (an older file) can still have its price or place edited, and the date corrected when the grower gets to it (round twenty-eight, 0).
    edDateMsg = f.acquired && f.acquired !== (a.acquired ?? '') && f.acquired > localDate() ? `${f.acquired} is in the future.` : f.acquired && f.acquired !== (a.acquired ?? '') && f.acquired < '1900-01-01' ? `${f.acquired} is before 1900.` : '';
    if (edDateMsg) { document.getElementById('ed-date')?.focus(); return; }
    // The plant's own watering rhythm: blank follows its place; a figure is whole days, 1 to 365, as the place form takes it (round fifty-eight; the grower review).
    const wd = f.waterDays.trim() === '' ? null : Number(f.waterDays);
    edWaterMsg = wd != null && (Number.isNaN(wd) || wd < 1 || wd > 365) ? `${f.waterDays.trim()} is not a number of days from 1 to 365; leave it blank to follow its space.` : '';
    if (edWaterMsg) { document.getElementById('ed-waterdays')?.focus(); return; }
    // The collection and identification days, each a day, a month or a year, not after today; ITF2's codes as ITF2 allows
    // them together and with the provenance word (round eighty-seven, t1; $core/identity's itf2Problem).
    const collectedT = f.collected.trim(), idOnT = f.idOn.trim();
    const collectedOut = collectedT ? readPartialDate(collectedT) : null, idOnOut = idOnT ? readPartialDate(idOnT) : null;
    const dayWord = (t: string, d: string | null, what: string) => (!t ? '' : !d ? `${what} "${t}" is not a day, a month or a year (2019-03-07, 2019-03 or 2019).` : d > localDate().slice(0, d.length) ? `${what} ${d} is in the future.` : '');
    const ptOut = (PROV_TYPES as readonly string[]).includes(f.provType) ? (f.provType as ProvType) : null, phOut = (PROP_HISTORIES as readonly string[]).includes(f.propHistory) ? (f.propHistory as PropHistory) : null;
    const itfTouched = f.provType !== fOpen.provType || f.propHistory !== fOpen.propHistory || f.provenance !== fOpen.provenance;
    edIdentMsg = (collectedT !== fOpen.collected ? dayWord(collectedT, collectedOut, 'Collected') : '') || (idOnT !== fOpen.idOn ? dayWord(idOnT, idOnOut, 'Identified on') : '') || (itfTouched ? (itf2Problem(f.provenance, ptOut, phOut) ?? '').replace(/^./, (c) => c.toUpperCase()) : '');
    if (edIdentMsg && !/\.$/.test(edIdentMsg)) edIdentMsg += '.';
    if (edIdentMsg) { document.getElementById('ed-prov')?.focus(); return; }
    // A name this edit typed, as the add form checks it (plants/new's `save`), before anything is made or written: a name
    // nothing resolved is kept on the Save after the picker's line has said so, and an older name of a page is asked
    // about once. A name left as it opened is not asked again, nor a cross, nor a name with "cf." or "aff.".
    const nameTyped = !!f.taxonName.trim() && f.taxonName !== fOpen.taxonName;
    const pTyped = parseName(f.taxonName.trim());
    if (nameTyped && f.nameKind !== 'hybrid' && pTyped.kind !== 'hybrid' && !pTyped.qualifier) {
      edChecking = true;
      try {
        if (!edArmed && (edPicker ? !(await edPicker.check()) : !edKey)) { edArmed = true; return; }
        if (!edArmed && (await edPicker?.olderFirst())) { edArmed = true; return; }
      } finally {
        edChecking = false;
      }
    }
    // The page the picker's line named, when the name is filed as typed after it (`olderOf`, as the add form carries it).
    const olderNamed = nameTyped ? (edPicker?.olderAnswer() ?? null) : null;
    // This form's own picker only (round sixty-seven; triage-66 R12); a place that could not be made says why there, and nothing is saved.
    try { await settlePlaces('ed-loc'); } catch { return; }
    if (!a) return;
    const moved = (f.locationId ?? null) !== (a.locationId ?? null);
    // The name as the add form files it: a hybrid is filed under its genus (or nothogenus) with the cross as parentage and
    // no species key, since it has no habitat of its own; an edit into a hybrid must not keep the species' name, key and
    // climate (round twenty-three, 1).
    const typed = f.taxonName.trim() || a.taxonName;
    const p = parseName(typed);
    const hybrid = f.nameKind === 'hybrid' || p.kind === 'hybrid';
    // A nothospecies ("× Graptoveria titubans", filed as "Graptoveria titubans" with the hybrid kind) keeps its epithet: only a cross written out, or a bare genus, files as the genus (round twenty-five, 3).
    const taxonName = hybrid ? (p.kind === 'hybrid' ? p.scientific : p.epithet ? p.scientific : p.genus || typed) : typed;
    // A hybrid's key goes only when its name changes: an edit to a nothospecies' price keeps the key the list gave it (round twenty-four, 5).
    const taxonKey = hybrid && taxonName !== a.taxonName ? null : f.taxonName.trim() ? edKey : (a.taxonKey ?? null);
    const nameKind = hybrid ? 'hybrid' : f.nameKind;
    const parentage = hybrid ? f.parentage.trim() || p.parentage || null : null; // a nothospecies' parentage is what the grower states, never its own name (round twenty-six, 1)
    const wasKind = kindOf(a); // read before the write: `a` is the live record and says the new kind once it is saved
    const renamed = taxonName !== a.taxonName || (f.cultivar.trim() || null) !== (a.cultivar ?? null) || nameKind !== wasKind;
    // A change of identity is provenance: the old name goes in the log, and into "name as received" if that was empty (round twenty-three, 3).
    const oldFull = `${a.taxonName}${a.cultivar ? ` '${a.cultivar}'` : ''}`;
    const newFull = `${taxonName}${f.cultivar.trim() ? ` '${f.cultivar.trim()}'` : ''}`;
    // A field the record never had, left on the form's default, is not written: a price edit wrote `nameKind: species`
    // and `provenance: unknown` on a plant that had neither, two claims the grower never made (round thirty-five, R1-5).
    const nameKindOut = a.nameKind == null && !hybrid && f.nameKind === kindOf(a) ? null : nameKind;
    const provenanceOut = a.provenance == null && f.provenance === 'unknown' ? null : f.provenance;
    const kindWord = nameKind === 'hybrid' ? 'a hybrid' : nameKind === 'cultivar' ? 'a cultivar' : 'a species';
    // The edit, its rename note, its move line and the acquired line it restates are one commit (round fifty-one, 3).
    const lines: Array<Omit<PlantEvent, 'id'>> = [];
    if (renamed) lines.push({ acc: id, d: localDate(), t: 'note', note: oldFull !== newFull ? `Renamed from ${oldFull} to ${newFull}${nameKind !== wasKind ? ` (now ${kindWord})` : ''}` : `Now recorded as ${kindWord}`, auto: true });
    if (moved && f.locationId) lines.push({ acc: id, d: localDate(), t: 'move', note: `to ${collection.locationName(f.locationId)}` });
    // The log's "Acquired" line is the same fact as the card's date and source: it follows an edit rather than keeping the old one.
    const acq = events.find((e) => e.t === 'acquire');
    const newDate = f.acquired || null, newNote = f.sourceFrom.trim() ? `from ${f.sourceFrom.trim()}` : null;
    const also = acq && newDate && (acq.d !== newDate || (acq.note ?? null) !== newNote) ? [{ kind: 'event' as const, id: acq.id, fields: { d: newDate, note: newNote } }] : [];
    // A page the add form found for the old name is not the new name's (round eighty-five; `olderOf`).
    const all: Record<string, unknown> = { taxonName, taxonKey, ...(taxonName !== a.taxonName && olderNamed ? { olderOf: olderNamed } : taxonName !== a.taxonName && a.olderOf ? { olderOf: null } : {}), ...(taxonName !== a.taxonName && a.olderKind != null ? { olderKind: null } : {}), ...(taxonName !== a.taxonName && a.olderKindOf != null ? { olderKindOf: null } : {}), cultivar: f.cultivar.trim() || null, nameKind: nameKindOut, parentage, nameAsReceived: f.nameAsReceived.trim() || (oldFull !== newFull && !a.nameAsReceived ? oldFull : null), fieldNumber: f.fieldNumber.trim() || null, provenance: provenanceOut, acquired: f.acquired || null, sourceFrom: f.sourceFrom.trim() || null, sourceForm: f.sourceForm.trim() || null, price: f.price.trim() || null, waterDays: wd == null ? null : Math.round(wd), locationId: f.locationId ?? null,
      // Round eighty-seven (t1): identity and provenance. A code this version does not know, left as it opened, is not written.
      clone: f.clone.trim().slice(0, 80) || null, exChain: readExChain(f.exChain).length ? readExChain(f.exChain) : null, collector: f.collector.trim() || null, collected: collectedOut, provType: f.provType || null, propHistory: f.propHistory || null, idLevel: f.idLevel || null, idBy: f.idBy.trim() || null, idOn: idOnOut,
      // A change of name keeps the name it had, the day it stopped and how it had been identified (F6).
      ...(oldFull !== newFull ? { idHistory: withEarlierName(collection.earlierNames(a.id).list, a, localDate()) } : {}),
      // Round eighty-seven (t2): the plant it was taken from and how.
      motherAcc: f.motherAcc ?? null, motherHow: f.motherAcc ? f.motherHow : null };
    // Only what this form changed (round fifty-two, 4): the name and what the name decides, the place, and each other field on its own.
    const touched = new Set((Object.keys(f) as Array<keyof typeof f>).filter((k) => f[k] !== fOpen[k]));
    const write = new Set<string>();
    if (touched.has('taxonName') || touched.has('nameKind') || touched.has('parentage') || touched.has('cultivar') || touched.has('nameAsReceived')) for (const k of ['taxonName', 'taxonKey', 'nameKind', 'parentage', 'nameAsReceived', 'cultivar', 'olderOf', 'olderKind', 'olderKindOf']) write.add(k);
    if (touched.has('locationId')) write.add('locationId');
    for (const k of ['fieldNumber', 'provenance', 'acquired', 'sourceFrom', 'sourceForm', 'price', 'waterDays', 'clone', 'exChain', 'collector', 'collected', 'provType', 'propHistory', 'idLevel', 'idBy', 'idOn']) if (touched.has(k as keyof typeof f)) write.add(k);
    if ('idHistory' in all && write.has('taxonName')) write.add('idHistory');
    // The plant it was taken from and how, written together: cleared together too (round eighty-seven, F4).
    if (touched.has('motherAcc') || touched.has('motherHow')) { write.add('motherAcc'); write.add('motherHow'); }
    const fields = Object.fromEntries(Object.entries(all).filter(([k]) => write.has(k)));
    // The name and provenance are the accession's: written to each of its plants in the same commit (round eighty-seven, t1).
    await collection.putWith('accession', id, fields, lines, [...also, ...collection.sharedWith(id, fields)]);
    editing = false;
  }

  let evmsg = $state('');
  async function addEvent(e: SubmitEvent) {
    e.preventDefault();
    // A date after today is a typo (2027 for 2026), and it would stand as the last watering for a year (round twenty-five, 1); refused with a sentence, as the batch page does.
    evmsg = !ed ? 'Give the entry a date.' : ed > localDate() ? `${ed} is in the future.` : '';
    if (evmsg) { document.getElementById('ev-date')?.focus(); throw new Error(evmsg); }
    const potN = et === 'repot' ? numberOrNull(epot) : null;
    if (potN != null && potN <= 0) { evmsg = `A pot of ${potN} ${lu} is no pot; leave the size blank if it was not measured.`; document.getElementById('ev-pot')?.focus(); throw new Error(evmsg); }
    const m: Record<string, number> = {};
    // A length is typed in the grower's length units and stored in millimetres (round forty, R2-2; round fifty-eight); heads and leaves are counts.
    for (const [k, v] of Object.entries(measures)) { const n = numberOrNull(v); if (n != null) m[k] = MEASURES.find((x) => x.k === k)?.unit === 'mm' ? toMm(n) : n; } // a cleared box is no measurement, not 0
    if (potN != null) m[POT.k] = toMm(potN); // the pot, in millimetres, beside the plant's own measures (round fifty-eight; the grower review)
    // The medium is words, so it goes in the note, ahead of whatever else was written (round fifty-eight; the grower review).
    const note = [et === 'repot' && emedium.trim() ? `Medium: ${emedium.trim()}` : '', enote.trim()].filter(Boolean).join('; ');
    // A pollinate line with a pollen parent is a cross, this plant the seed parent; a graft line names the plants its scion
    // and stock came from. Only on their own kinds of line, and only when chosen: no other line carries the fields (round eighty-seven, F4).
    const links = et === 'pollinate' && epollen ? { pollen: epollen } : et === 'graft' && (escion || estock) ? { ...(escion ? { scion: escion } : {}), ...(estock ? { stock: estock } : {}) } : {};
    const ev = { acc: id, d: ed, t: et, note: note || null, used: et === 'treat' || et === 'feed' ? eused.trim() || null : null, cause: et === 'death' ? ecause.trim() || null : null, measures: Object.keys(m).length ? m : null, followUp: et === 'treat' ? 10 : null, ...links };
    // A death is its line and the plant's status in one commit: closed between the two, the page left a dead plant marked growing (round forty-nine, 1).
    if (et === 'death') {
      // The death and the status in one commit, and one tap back: the toast's Undo removes the line and gives the plant
      // the status it had (round sixty; the grower review, 12: three steps to discover before).
      const was = a?.status ?? 'growing';
      // A death is the plant's deaccession too, with the death's day (round eighty-seven, t1).
      const line = await collection.addEventWith(ev, 'accession', id, { status: 'dead', deacc: 'died', deaccOn: ed });
      // One commit, as Archive's Undo is: the status back and the line removed together, and only while the plant is still
      // dead (round sixty-seven; triage-66 R7, the self-review's C6). A failure is said.
      deathUndo = { label: 'Undo', run: () => {
        if (collection.accession(id)?.status !== 'dead') { toast.show('Not undone: the plant has been changed since.'); return; }
        void collection.putWith('accession', id, { status: was, deacc: null, deaccOn: null }, [], [{ kind: 'event', id: line.id, fields: { _deleted: true } }])
          .then(() => toast.show(`Undone: ${was === 'archived' ? 'archived' : 'growing'} again, the death line removed.`), () => toast.show('The Undo was not saved: the plant is still marked dead.'));
      } };
    } else await collection.addEvent(ev);
    enote = '';
    eused = '';
    ecause = '';
    measures = {};
    epot = '';
    emedium = '';
    epollen = null; escion = null; estock = null;
  }
  /** A log line removed is one tap from coming back: the record never left the log (round fifty-eight; the grower review). */
  // A Pollinated line a batch names as its cross is the batch's seedlings' parents and batches.csv's cross: its × asks
  // first, naming the batches (`crossNamedBy`), and the toast says what went with it (round eighty-seven, the stage 3
  // fixes; review M4). The batch's page says the line was removed, with its way back.
  const crossNamedBy = (eid: string) => collection.batchesOfCross(eid).map((s) => sowNo(s));
  async function removeEntry(eid: string) {
    confirmEvent = null;
    const named = crossNamedBy(eid);
    await collection.remove('event', eid);
    toast.show(named.length ? `Cross removed: ${named.join(', ')} no longer ${named.length === 1 ? 'names' : 'name'} its parents.` : 'Entry removed.', 8000, { label: 'Undo', run: () => { void collection.restore('event', eid).then(() => toast.show('Entry restored.')); } });
  }
  async function setStatus(s: 'growing' | 'archived' | 'dead') {
    // A status change is a line in the log too, so the timeline says when the plant was archived or grown again; a death is recorded through "Died…", with its date and cause (round twenty-two, 16). Status and line are one commit (round forty-nine, 1).
    // Marked growing again, a plant is held again: a deaccession it had is cleared with it (round eighty-seven, t1).
    await collection.addEventWith({ acc: id, d: localDate(), t: 'note', note: s === 'archived' ? 'Archived' : s === 'growing' ? 'Marked growing again' : 'Marked dead' }, 'accession', id, { status: s, ...(s === 'growing' && a?.deacc != null ? { deacc: null, deaccOn: null, deaccNote: null } : {}) });
    toast.show(s === 'archived' ? 'Archived, and logged' : s === 'growing' ? 'Marked growing, and logged' : 'Marked dead, and logged');
    void focusNext('#status-toggle'); // the button that replaced the one just pressed
  }
  async function saveNotes() {
    const next = notesDraft.trim() || null;
    // The edit carries the stamp of the text it was opened on: a text that arrived under the open editor (another tab, a
    // pull) is then read from the log as replaced unseen, on every device, and nothing more is written (round fifty-eight).
    await collection.put('accession', id, { notes: next, notesBase: notesBaseStamp });
    editingNotes = false;
  }
  /** The species notes as the editor opened, for the unsaved-changes guard. */
  let myNotesOpen = '';
  let myNotesBaseStamp: string | null = null;
  async function saveMyNotes() {
    if (!a) return;
    const on = notesTaxon(a.taxonName);
    const next = myNotesDraft.trim() || null;
    // The edit carries the stamp of the text it was opened on, so a text that changed meanwhile (another device, another
    // tab) is read from the log as replaced unseen, on every device, and nothing more is written; the species' key is
    // left to the species page, which has the reference's (round fifty-nine; the round forty-one review, 7).
    await collection.put('taxon', on.slug, { name: on.name, myNotes: next, myNotesBase: myNotesBaseStamp });
    editingMy = false;
  }
  async function remove() {
    // The record's id read now: the page's `id` falls back to the address once the plant is removed, and an Undo pressed
    // later restored a record named by the number, which is no record (round sixty-three, found at the merge).
    const no = accNo(a!), id = a!.id;
    await collection.remove('accession', id);
    goto('/plants');
    // The removal is one tap; the way back is one too (round twenty-six, 5). The record never left the log.
    // Back by its identity, whatever number it holds after the restore: by number, a plant brought back beside another under the same number opened the other (round sixty).
    toast.show(`${no} removed.`, 8000, { label: 'Undo', run: () => { void collection.restore('accession', id).then((moved) => { const back = collection.accession(id); void goto(back ? plantHref(back) : `/plants/${encodeURIComponent(id)}`); if (moved) toast.show(restoredWords(moved, 'plant')); }); } });
  }
  /* ---- no longer held, and items (round eighty-seven, t1) ---- */
  let deaccOpen = $state(false);
  let dReason = $state<DeaccReason>('given');
  let dOn = $state(localDate());
  let dNote = $state('');
  let dMsg = $state('');
  let dBusy = $state(false);
  function openDeacc() { dReason = 'given'; dOn = localDate(); dNote = ''; dMsg = ''; deaccOpen = true; confirmRemove = false; void focusNext('#deacc-reason'); }
  /** The record stays, listed under "No longer held", with one tap back (the toast's Undo, and Restore on its page). */
  async function saveDeacc() {
    if (!a || dBusy) return;
    dMsg = !dOn ? 'Give the day it stopped being held.' : dOn > localDate() ? `${dOn} is in the future.` : '';
    if (dMsg) { document.getElementById('deacc-on')?.focus(); return; }
    dBusy = true;
    const was = a.status, no = accNo(a);
    try {
      const line = await collection.deaccession(id, { reason: dReason, on: dOn, note: dNote });
      deaccOpen = false;
      toast.show(`${no} is no longer held (${DEACC_LABEL[dReason].toLowerCase()}); its record is kept.`, 8000, { label: 'Undo', run: () => { void collection.putWith('accession', id, { deacc: null, deaccOn: null, deaccNote: null, status: was }, [], [{ kind: 'event', id: line.id, fields: { _deleted: true } }]).then(() => toast.show('Undone: held again.'), () => toast.show('The Undo was not saved: it is still recorded as no longer held.')); } });
    } catch { /* refused: the page says so from lastWriteError */ } finally { dBusy = false; }
  }
  let restoring = $state(false);
  async function restoreHeld() {
    if (!a || restoring) return;
    restoring = true;
    try { await collection.reaccession(id); toast.show(`${accNo(a)} is held again, and the log says so.`); } catch { /* refused: said from lastWriteError */ } finally { restoring = false; }
  }
  let splitOpen = $state(false);
  let sHow = $state('offset');
  let sOn = $state(localDate());
  let sLoc = $state<string | null>(null);
  let sMsg = $state('');
  let sBusy = $state(false);
  function openSplit() { sHow = 'offset'; sOn = localDate(); sLoc = a?.locationId ?? null; sMsg = ''; splitOpen = true; void focusNext('#split-how'); }
  async function saveSplit() {
    if (!a || sBusy) return;
    sMsg = !sOn ? 'Give the day it was split off.' : sOn > localDate() ? `${sOn} is in the future.` : '';
    if (sMsg) { document.getElementById('split-on')?.focus(); return; }
    sBusy = true;
    try {
      try { await settlePlaces('split-loc'); } catch { return; }
      const item = await collection.splitItem(id, { how: sHow, d: sOn, locationId: sLoc });
      splitOpen = false;
      toast.show(`${accNo(item)} split off: a plant of its own, under this accession.`, 8000, { label: 'Open it', run: () => { const it = collection.accession(item.id); void goto(it ? plantHref(it) : `/plants/${encodeURIComponent(item.id)}`); } });
    } catch (e) { sMsg = collection.lastWriteError ? '' : e instanceof Error ? e.message : ''; } finally { sBusy = false; }
  }
  const waiting = $derived(a ? undefined : collection.waiting('accession', param));
  /** A removed plant the address names, by its identity first (a label's code carries it) and then by its number (round sixty-one; the records review's 2). */
  // A label's tag names the removed plant itself, whatever holds its number now (review B1).
  const removed = $derived(a || !collection.ready ? undefined : scanTag ? tagged.removed[0] : collection.removedAccession(param));
  /** A scanned label of a plant this device has never held: its code carries an identity the log does not have, and a fragment with the species and the printed name (round sixty-one; the grower review's 13). */
  /** The name a scanned label carries in its address, when it is not this plant's own (round eighty-seven, t3): the code carries the number, which another collection may give too. */
  // A code with the plant's tag is that plant's whatever its name says (it may have been renamed since it was printed): the
  // name is compared only for a code without one.
  const labelOther = $derived.by(() => {
    if (!a || scanTag || !/(^|[#&])n=/.test(page.url.hash.replace(/^#/, ''))) return null;
    const theirs = labelFromHash(page.url.hash).name;
    const ours = labelFromHash(new URL(plantQrUrl('https://x.invalid', a)).hash).name;
    return theirs && theirs !== ours ? theirs : null;
  });
  const strangerLabel = $derived(!a && !removed && collection.ready && !collection.exists('accession', param) && /(^|[#&])(s|n)=/.test(page.url.hash.replace(/^#/, '')));
  async function restoreRemoved() {
    const r = removed ?? collection.removedAccession(param);
    if (!r) return;
    const moved = await collection.restore('accession', r.id);
    if (moved) {
      const back = collection.accession(r.id);
      await goto(back ? plantHref(back) : `/plants/${encodeURIComponent(r.id)}`);
      toast.show(restoredWords(moved, 'plant'));
    } else toast.show(`${accNo(r)} restored.`);
  }
  /** The key the reference files this plant's species under, when it answered. */
  let refKey = $state<number | null>(null);
  /** The plant records another key for a name at species rank: the grower may take the reference's. */
  // Not for a page found by another name than the plant's (`foundBy`): the plant's key is that name's, as filed.
  const keyDiffers = $derived(!!a && !foundBy && refKey != null && a.taxonKey != null && a.taxonKey !== refKey && speciesOf(a.taxonName) === a.taxonName);
  async function useReferenceKey() {
    if (!a || refKey == null) return;
    await collection.putWith('accession', a.id, { taxonKey: refKey }, [], collection.sharedWith(a.id, { taxonKey: refKey })); // every plant of the accession (round eighty-seven, t1)
    toast.show(`This plant now records GBIF key ${refKey}.`);
  }
  /** Two records under one number, not yet repaired: a reading of the log does not write to it, so the grower asks (round fifty-six, 3). */
  const sharedWith = $derived(a && collection.ready ? collection.sharesNumber('accession', a.id) : []);
  let renumbering = $state(false);
  /** Which of the records under the number the repair renumbers: said before the button, and the button does that and nothing else (round fifty-eight). */
  const plan = $derived(a && sharedWith.length ? collection.numberPlan('accession', a.id) : null);
  const othersIds = $derived((plan ? [plan.keeper, ...plan.renumbered].filter((x) => x !== a?.id) : []).map((x) => { const o = collection.accession(x); return { id: x, name: o ? plantLabel(o) : 'another plant' }; }));
  async function renumberShared() {
    if (!a || renumbering) return;
    const id = a.id, before = accNo(a);
    renumbering = true;
    try {
      const ok = await collection.repairNumbers({ kind: 'accession', no: before });
      if (!ok || collection.sharesNumber('accession', id).length) {
        toast.show(`The number is still shared: ${collection.lastWriteError ?? 'the repair was not saved'}. Nothing else changed.`);
        return;
      }
      const now = collection.accession(id);
      if (now && accNo(now) !== before) toast.show(`This plant is now ${accNo(now)}; a note on it says why.`);
      else toast.show(`${before} stays with this plant, recorded first; the other was given the next free number.`);
      // By its identity either way: the number now has a plant renumbered off it, and an address by the number lists both (B1).
      if (param !== id) await goto(`/plants/${encodeURIComponent(id)}`, { replaceState: true });
    } finally {
      renumbering = false;
    }
  }

</script>

<svelte:head><title>{a ? `${accNo(a)} ${a.taxonName}` : strangerLabel || labelCase?.kind === 'foreign' ? 'A plant label' : removed ? accNo(removed) : param} · Cultifolio</title></svelte:head>
<svelte:window onbeforeunload={guardUnload} onkeydown={(e) => { if (e.key === 'Escape' && cardMenu) closeCardMenu(true); }} onclick={(e) => { if (cardMenu && !(e.target as Element).closest('.cardmenu')) closeCardMenu(); }} />

{#if collection.lastWriteError}
  <div class="notice err" role="alert" id="write-error">This change was not saved: {collection.lastWriteError}.{#if collection.lastWriteError !== CLOSED_WORDS}{' '}Free space or <a href="/backup">back up now</a>.{/if}</div><!-- the example closed in another tab is not a full phone (round sixty-nine; triage-68 X9; S-C5) -->
{/if}
{#if a && keyDiffers}
  <div class="notice" id="key-differs">The reference files {a.taxonName} under GBIF key {refKey}; this plant records key {a.taxonKey}, which the reference does not hold under that name. The species shown here is the reference's. <button class="btn" onclick={useReferenceKey}>Use the reference's key</button></div>
{/if}
{#if a && dossier && noGbif(dossier) && a.taxonKey != null}
  <!-- The species page has no GBIF key (round seventy-nine), so this plant's key is compared with none: the species is the
       one of its name, and the line says so rather than leave the key unexplained. -->
  <!-- A page that reads GBIF's records under Kew's keys says so, and whether this plant's key is one (round eighty, A). -->
  <div class="notice" id="key-no-page">{keylessPlantNotice(dossier, a.taxonName, a.taxonKey)}</div>
{/if}
{#if a && sharedWith.length}
  <!-- The other plant is a link by its identity: by number it opened whichever loaded first (round sixty). -->
  {#snippet others()}{#each othersIds as o, i (o.id)}{i ? (i === othersIds.length - 1 ? ' and ' : ', ') : ''}<a href="/plants/{encodeURIComponent(o.id)}">{o.name}</a>{/each}{/snippet}
  <div class="notice" id="shared-number">{#if plan?.keeper === a.id}{#if othersIds.length === 1}Another plant, {@render others()}, has{:else}{othersIds.length} other plants ({@render others()}) have{/if} the number {accNo(a)} too: two devices gave it out while offline, or a file was merged in. This plant was recorded first and keeps it; renumbering gives {othersIds.length === 1 ? 'the other' : 'the others'} the next free number, with a note saying so.{:else}This plant shares the number {accNo(a)} with {@render others()}, recorded before it: two devices gave it out while offline, or a file was merged in. Renumbering gives this plant the next free number, with a note saying so.{/if} <button class="btn" onclick={renumberShared} disabled={renumbering}>Renumber now</button></div>
{/if}
{#if !collection.ready}
  <!-- The page's shape before the vault opens: the card without a picture, which is what most plants' pages are; one with a photograph grows a hero above it when the record arrives. -->
  <!-- In the loaded page's own order: the id card (the tile, the number as its title and the actions row), then the verb bar. -->
  <div class="skel" aria-busy="true">
    <div class="idcard flat"><div class="skeltile skelbox"></div><div class="who"><h1 class="sci"><span class="accno big lead">{param}</span><span class="skelname" aria-hidden="true">Species name</span></h1><Opening cls="vern muted" /></div><div class="acts"><span class="btn skelbtn">&nbsp;</span><span class="btn skelbtn">&nbsp;</span></div></div>
    <div class="skelverbs"></div>
  </div>
{:else if labelCase}
  <!-- A label whose plant does not hold its number now, or one from another collection: said, each plant offered by its
       identity, none opened by itself (round eighty-seven, the stage 3 fixes; review B1). -->
  {#snippet row(c: Accession, why: string)}<li><a class="azrow accrow" href="/plants/{encodeURIComponent(c.id)}"><span class="txt"><span class="nm"><span class="accno lead">{accNo(c)}</span>{' '}<PlantName plant={c} /></span><span class="fam">{why}</span></span></a></li>{/snippet}
  <h1 class="q" style="margin-top: 24px">{param}</h1>
  {#if labelCase.kind === 'moved'}
    <p id="renumbered-to">{#if scanTag}This label was printed for {labelCase.printedFor.length === 1 ? 'a plant' : 'plants'} numbered {param} then, and {labelCase.printedFor.length === 1 ? 'it is' : 'they are'} numbered otherwise now{labelCase.holders.length ? `; ${param} is another plant's now` : ''}. Open the one you mean, and print the plant a new label from its page.{:else}{param} was renumbered: a plant numbered {param} before is numbered otherwise now{labelCase.holders.length ? `, and ${param} is another plant's` : ''}. Open the one you mean.{/if}</p>
    <ul class="chooser" id="label-choices">
      {#each labelCase.printedFor as c (c.id)}{@render row(c, scanTag ? `the plant this label was printed for, numbered ${param} then` : `numbered ${param} before`)}{/each}
      {#each labelCase.holders as c (c.id)}{@render row(c, `numbered ${param} now`)}{/each}
    </ul>
  {:else}
    <p id="label-foreign">This label's code names a plant this collection does not hold under that identity{labelCase.holders.length ? `; your ${param} is another plant` : ''}. It may be a label from someone else's collection.</p>
    {#if labelCase.holders.length}<ul class="chooser" id="label-choices">{#each labelCase.holders as c (c.id)}{@render row(c, `your ${param}, not the plant on this label`)}{/each}</ul>{/if}
    <ForeignLabel />
  {/if}
{:else if choices.length > 1}
  <!-- Two or more plants under the number the address names: each, by its identity, to choose from (round sixty). -->
  <h1 class="q" style="margin-top: 24px">{param}</h1>
  <p class="muted" id="number-chooser-why">{choices.length} plants have the number {param}: two devices gave it out while offline, or a file was merged in. Open the one you mean; its page offers to renumber it.</p>
  <ul class="chooser" id="number-chooser">
    {#each choices as c (c.id)}
      <li><a class="azrow accrow" href="/plants/{encodeURIComponent(c.id)}"><span class="txt"><span class="nm"><span class="accno lead">{accNo(c)}</span>{' '}<PlantName plant={c} /></span><span class="fam">{c.locationId && collection.placeOf(c.locationId) ? collection.locationName(c.locationId) : 'no space'} · added {c.acquired ?? collection.madeOn('accession', c.id) ?? 'on a day not recorded'}{c.status !== 'growing' ? ` · ${c.status}` : ''}</span></span></a></li>
    {/each}
  </ul>
{:else if !a}
  <!-- A stranger's label is headed as what it is, not by the internal id its code carries (round sixty-one; the grower review's 13). -->
  <h1 class="q" style="margin-top: 24px">{strangerLabel ? 'A plant label' : removed ? accNo(removed) : param}</h1>
  {#if removed}
    <p class="muted" id="removed-plant">{removed.id === param || scanTag ? `${accNo(removed)} ${removed.taxonName}${removed.cultivar ? ` '${removed.cultivar}'` : ''} was removed.` : `${param} was given to a plant since removed.`} The number stays reserved and its record is still in the change log, so it can be brought back as it was, log and photographs included.</p>
    <p><button class="btn pri" onclick={restoreRemoved}>Restore this plant</button></p>
    {#if scanTag && choices.length}<p id="label-removed-holder">This label was printed for the plant removed; {param} is another plant's now: {#each choices as c, i (c.id)}{i ? ', ' : ''}<a href="/plants/{encodeURIComponent(c.id)}">{accNo(c)} {plantLabel(c)}</a>{/each}.</p>{/if}
  {:else if waiting}
    <WaitingRecord kind="accession" label={param} {waiting} />
  {:else if strangerLabel}
    <ForeignLabel />
  {:else}
    <p class="muted">{collection.isNumberTaken(param) ? `${param} was given to a plant since removed; the number stays reserved.` : 'No plant with this number on this device.'}</p>
  {/if}
{:else}
  {#if ident?.deacc}
    <!-- A plant no longer held keeps its page, its log and its photographs, and says so first (round eighty-seven, t1; F1). -->
    <div class="notice" id="no-longer-held">No longer held{ident.deaccOn ? ` since ${ident.deaccOn}` : ''}: {DEACC_LABEL[ident.deacc].toLowerCase()}.{#if ident.deaccNote}{' '}{ident.deaccNote}{/if} Its record, log and photographs are kept. <button class="btn" type="button" id="restore-held" onclick={restoreHeld} aria-disabled={restoring}>Restore to the collection</button> <a href="/plants/gone">Every plant no longer held</a></div>
  {/if}
  {#if labelOther}
    <!-- A code carries the number since round eighty-seven, and two growers may both have a 2026-0012: a label whose printed
         name is not this plant's says so, and offers its species, as a stranger's label does (round eighty-seven, t3). -->
    <div class="notice" id="label-other" role="status"><p>This label names <i>{labelOther}</i>, and your {accNo(a)} is <i>{plantLabel(a)}</i>: it may be a label from someone else's collection.</p><ForeignLabel /></div>
  {/if}
  {#if cover}
    <div class="hero own">
      <!-- The button is named by what the photograph shows, and its image is then not read twice (round fifty-eight; the accessibility review). -->
      <button class="heroimg" type="button" onclick={() => openPhoto(cover)} aria-label="Open photograph: {photoLabel(cover)}">{#key cover.id}<PhotoImg id={cover.id} size="full" alt="" />{/key}</button>
      <span class="cred">{cover.caption ? cover.caption + ' · ' : ''}{cover.d}{photos.length > 1 ? ` · ${plural(photos.length, 'photo')}` : ''}</span>
    </div>
  {:else if speciesThumb && !thumbFailed}
    <div class="hero">
      <img src={speciesThumb} alt={a.taxonName} class="spthumb" onerror={() => (thumbFailed = true)} /><button class="cred" type="button" onclick={() => { adding = true; setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); }}>species photograph{dossier?.credit ? ` (${dossier.credit})` : ''} · add your own</button>
    </div>
  {:else if heroHeld}
    <!-- The hero's room while the sheet is asked, unseen and out of the accessibility tree (round seventy-nine; `heroHeld`). -->
    <div class="hero hold" aria-hidden="true"></div>
  {/if}
  <PhotoTimeline acc={id} />
  <div class="idcard" class:flat={!heroRoom}>
    {#if !heroRoom}
      <!-- No photograph: a small tile where one would go, beside the name, not a screen-high empty box. The reference's is one line beneath, with what showing it discloses on tap. -->
      <PhotoAdd acc={id} id="hero-photo" tile />
    {/if}
    <div class="who">
      <h1 class="sci"><span class="accno big lead">{accNo(a)}</span>{' '}<SpeciesName name={a.taxonName} />{#if a.cultivar}{' '}<span style="font-style: normal">‘{a.cultivar}’</span>{/if}</h1>
      <p class="vern">
        {#if kind === 'hybrid'}<span class="kind">hybrid</span> · {:else if kind === 'cultivar'}<span class="kind">cultivar</span>{#if notStated}<span id="species-not-stated">, species not stated</span>{/if} · {/if}
        {#if a.nameAsReceived}received as <i>{a.nameAsReceived}</i> · {/if}
        <!-- An item says whose number it carries, and a clone its name (round eighty-seven, t1). -->
        {#if ident?.item && holder && holder.id !== a.id}<span id="item-of">item {ident.item} of <a class="mono" href={collection.accession(holder.id) ? plantHref(holder) : `/plants/${encodeURIComponent(holder.id)}`}>{accNo(holder)}</a></span> · {/if}
        {#if ident?.clone}<span id="clone-name">clone {ident.clone}</span> · {/if}
        {#if a.fieldNumber}<span class="fnchip">{a.fieldNumber}</span> · {/if}
        {#if a.provenance === 'unknown' && !a.sourceFrom && !a.fieldNumber}Added {fmtDate(a.acquired)}{:else}{provLabel(a.provenance)}{#if a.acquired}{' · '}{a.sourceForm ?? 'acquired'}{a.sourceFrom ? ` from ${a.sourceFrom}` : ''}{' '}{fmtDate(a.acquired)}{/if}{/if}
        {#if a.sowingId}{' · '}raised from <a class="mono" href={sowing ? batchHref(sowing) : `/propagation/${a.sowingId}`}>{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing && sowing.parentAcc}{@const pa = collection.accession(sowing.parentAcc)} (from <a class="mono" href={pa ? plantHref(pa) : `/plants/${sowing.parentAcc}`}>{pa ? accNo(pa) : sowing.parentAcc}</a>){/if}{/if}
        {#if crossParents}{' · '}<span id="cross-of">cross <PlantRef id={crossParents.seed} short /> × <PlantRef id={crossParents.pollen} short /></span>{/if}
        {#if a.locationId && collection.placeOf(a.locationId)}{' · '}at <a class="place" href="/places/{collection.placeOf(a.locationId)}">{collection.locationName(a.locationId)}</a>{:else if a.locationId}{' · '}<span class="place">its space was removed; no space now</span>{/if}
        <!-- An answer is said as an answer, a silence as a silence (rule 2; round sixty-two, the grower review's 9): "none" is the reference holding no such name; "not checked" is the reference not reached. -->
        <!-- A page found for the plant by its key or by the form's answer, said as how (round eighty-five; review-c C4, review-s S2, outside review A16a). -->
        {#if asSpecies && ref === 'ok' && foundBy}{' · '}<span id="found-by">{foundBy.how === 'merged' ? 'Its page was merged into' : olderLead(foundBy.how === 'filed' ? null : foundBy.how)} <a href="/species/{speciesHref}"><SpeciesName name={foundBy.name} /></a></span> <button class="linkish tap" type="button" id="file-under-older" onclick={fileUnderOlder} aria-disabled={refiling}>File it under <SpeciesName name={foundBy.name} /></button>
        {:else if asSpecies && ref === 'none' && olderLook?.state === 'older'}{' · '}<span id="older-name-of">{#if olderLook.via}A name below it, <SpeciesName name={olderLook.via} />, is an older name of{:else if olderLook.gbif}GBIF's name for{:else if olderLook.filed}The reference files it under{:else}An older name of{/if} {#if olderLook.slug}<a href="/species/{olderLook.slug}"><SpeciesName name={olderLook.name} /></a>{:else}<SpeciesName name={olderLook.name} />{/if}</span> <button class="linkish tap" type="button" id="file-under-older" onclick={fileUnderOlder} aria-disabled={refiling}>File it under <SpeciesName name={olderLook.name} /></button>
        {:else if asSpecies && ref === 'none'}{' · '}<span id="name-not-in-reference">No species page under this name</span>{#if parseName(a.taxonName).epithet && !parseName(a.taxonName).qualifier}{#if olderLook?.state === 'asking'}{' '}<span class="muted" role="status">looking among older names…</span>{:else if olderLook?.state === 'none'}<span id="older-name-none" role="status">, nor is it an older name of one</span>{:else if olderLook?.state === 'unreached'}<span id="older-name-unreached" role="status">; the reference's search did not answer, so older names were not checked. <button class="linkish tap" type="button" onclick={lookOlder}>Try again</button></span>{:else}{' '}<button class="linkish tap" type="button" id="look-older" onclick={lookOlder} title="Sends this name to the reference's search, as the search box does">Is it an older name?</button>{/if}{/if}{:else if !a.taxonKey && asSpecies && ref === 'unreachable'}{' · '}<NotChecked inline what="Name" why={`${refused ?? 'The species reference could not be reached from here just now'}, so whether it holds this name is not known. It is asked again when this page opens.`} />{/if}
      </p>
      {#if kind === 'hybrid'}
        <p class="vern parentage">{#if parentLinks.length}{#each parentLinks as pl, i}{#if i}{' × '}{/if}{#if pl.slug}<a href="/species/{pl.slug}"><SpeciesName name={pl.name} /></a>{:else}<SpeciesName name={pl.name} />{/if}{/each}{:else}A hybrid; parentage not stated. <button class="linkish" type="button" onclick={startEdit}>Add it</button> if you know it.{#if hybridOfCultivar}{' '}Not a cross? <button class="linkish" type="button" id="file-as-cultivar" onclick={fileAsCultivar} aria-disabled={refiling}>File it as a cultivar, species not stated</button>.{/if}{/if}</p>
      {/if}
      {#if !hasHero && speciesThumb && thumbFailed}<p class="vern muted">The reference's photograph did not load.</p>{/if}
      <!-- While the sheet is asked the offer's line is held, so its arrival does not move the verb bar below (round seventy-eight). A species without a photograph gives the room back: the rarer move. -->
      {#if !hasHero && dossier?.thumb && !prefs.referencePhotos}<RefPhotoOffer link what={offerWhat} />{:else if !hasHero && ref === 'loading' && asSpecies && !prefs.referencePhotos}<RefPhotoOffer hold what={offerWhat} />{/if}
      {#if a.status !== 'growing' || collection.isDue(a)}
        <div class="pills">
          {#if a.status !== 'growing'}<span class="pill {a.status === 'dead' ? 'b' : ''}">{a.status}</span>{/if}
          {#if collection.isDue(a)}<span class="pill w">{sinceWater == null ? `no watering recorded in ${careDays} d` : `not watered for ${sinceWater} d`}</span>{/if}
        </div>
      {/if}
    </div>
    <div class="acts">
      {#if asSpecies && ref === 'ok'}<a class="btn" href="/species/{speciesHref}" id="species-link">{#if compared}Compare: <SpeciesName name={compared} />{:else}Species page{/if}</a>{:else if asSpecies && ref === 'loading'}<span class="btn skelbtn" aria-hidden="true">Species page</span>{/if}
      <div class="cardmenu">
        <button class="btn dots" type="button" bind:this={cardMenuBtn} aria-haspopup="menu" aria-expanded={cardMenu} aria-controls="card-menu" aria-label="More for this plant: edit, label, propagate" title="Edit, label, propagate" onclick={() => (cardMenu = !cardMenu)}>···</button>
        {#if cardMenu}
          <div class="menu" id="card-menu" role="menu" tabindex="-1" aria-label="More for this plant" use:autofocusFirst onkeydown={menuKeys} onfocusout={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && e.relatedTarget !== cardMenuBtn) closeCardMenu(); }}>
            <button role="menuitem" type="button" onclick={() => { closeCardMenu(); startEdit(); }}>Edit</button>
            <a role="menuitem" href="/labels?acc={a.id}" onclick={() => closeCardMenu()}>Label</a>
            {#if a.status === 'growing'}<button role="menuitem" type="button" onclick={() => { closeCardMenu(); quick('death'); }}>Died…</button>{/if}
            {#if a.status === 'growing'}<a role="menuitem" href="/propagation/new?parent={a.id}" onclick={() => closeCardMenu()}>Propagate</a>{/if}
            {#if a.status === 'growing'}<button role="menuitem" type="button" onclick={() => { closeCardMenu(); openSplit(); }}>Split off an item…</button>{/if}
            {#if a.status === 'growing'}<a role="menuitem" href="/plants/new?mother={a.id}" onclick={() => closeCardMenu()}>Add an offset or cutting</a>{/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if editing}
    <form class="cult editform" onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
      <label class="wide"><span>Species</span><SpeciesPicker reserve addLabel="Save" bind:value={f.taxonName} bind:taxonKey={edKey} bind:armed={edArmed} pressing={edChecking} bind:this={edPicker} id="ed-name" /></label>
      <label><span>Cultivar</span><input id="ed-cv" type="text" bind:value={f.cultivar} /></label>
      <!-- "this version of the app", not "this build", here and under Provenance (round fifty-eight; the accessibility review). -->
      <label><span>What it is</span><select id="ed-kind" bind:value={f.nameKind}>{#if !['species', 'cultivar', 'hybrid'].includes(f.nameKind)}<option value={f.nameKind}>{f.nameKind} (a kind this version of the app does not know)</option>{/if}<option value="species">A species</option><option value="cultivar">A cultivar (of the species, or of the genus when no species is named)</option><option value="hybrid">A hybrid (filed under the genus)</option></select></label>
      {#if f.nameKind === 'hybrid'}<label><span>Parentage</span><input id="ed-parentage" type="text" bind:value={f.parentage} placeholder="Seed parent × pollen parent" /></label>{/if}
      <label><span>Name as received</span><input id="ed-recv" type="text" bind:value={f.nameAsReceived} /></label>
      <label><span>Field number</span><input id="ed-fn" type="text" bind:value={f.fieldNumber} /></label>
      <label><span>Provenance</span><select id="ed-prov" aria-describedby={edIdentMsg ? 'ed-ident-bad' : undefined} bind:value={f.provenance}>{#if !['unknown', 'wild', 'f1', 'fn', 'veg'].includes(f.provenance)}<option value={f.provenance}>{f.provenance} (a word this version of the app does not know)</option>{/if}<option value="unknown">Not stated</option><option value="wild">Wild-collected</option><option value="f1">F1: raised from wild-collected seed</option><option value="fn">Cultivated seed (Fn)</option><option value="veg">Vegetative</option></select></label>
      <!-- ITF2's codes, the collection and the identification (round eighty-seven, t1; $core/identity). A code this version does not know is kept as it is. -->
      <label><span>Provenance type (ITF2)</span><select id="ed-prot" bind:value={f.provType}>{#if f.provType && !(PROV_TYPES as readonly string[]).includes(f.provType)}<option value={f.provType}>{f.provType} (a code this version of the app does not know)</option>{/if}<option value="">{ident?.provTypeRead && ident.provType && !a.provType ? `Not stated (read as ${ident.provType} from the provenance)` : 'Not stated'}</option>{#each PROV_TYPES as c}<option value={c}>{PROV_TYPE_LABEL[c]}</option>{/each}</select></label>
      <label><span>Propagation history (ITF2)</span><select id="ed-prohis" bind:value={f.propHistory}>{#if f.propHistory && !(PROP_HISTORIES as readonly string[]).includes(f.propHistory)}<option value={f.propHistory}>{f.propHistory} (a code this version of the app does not know)</option>{/if}<option value="">{ident?.propHistoryRead && ident.propHistory && !a.propHistory ? `Not stated (read as ${ident.propHistory} from the provenance)` : 'Not stated'}</option>{#each PROP_HISTORIES as c}<option value={c}>{PROP_HISTORY_LABEL[c]}</option>{/each}</select></label>
      <label><span>Collector</span><input id="ed-collector" type="text" maxlength="200" bind:value={f.collector} placeholder="e.g. Brack, S." /></label>
      <label><span>Collected</span><input id="ed-collected" type="text" maxlength="10" bind:value={f.collected} placeholder="2019-03-07, 2019-03 or 2019" /></label>
      <label><span>Ex (earlier holders)</span><input id="ed-ex" type="text" maxlength="400" bind:value={f.exChain} placeholder="ex Devon, ex Mesa Garden" /></label>
      <label><span>Clone</span><input id="ed-clone" type="text" maxlength="80" bind:value={f.clone} placeholder="e.g. clone A" /></label>
      <label><span>Identification (ITF2 level)</span><select id="ed-vlev" bind:value={f.idLevel}>{#if f.idLevel && !(ID_LEVELS as readonly string[]).includes(f.idLevel)}<option value={f.idLevel}>{f.idLevel} (a code this version of the app does not know)</option>{/if}<option value="">Not stated</option>{#each ID_LEVELS as c}<option value={c}>{ID_LEVEL_LABEL[c]}</option>{/each}</select></label>
      <label><span>Identified by</span><input id="ed-idby" type="text" maxlength="200" bind:value={f.idBy} /></label>
      <label><span>Identified on</span><input id="ed-idon" type="text" maxlength="10" bind:value={f.idOn} placeholder="2019-03-07, 2019-03 or 2019" /></label>
      {#if accPlants.length > 1}<p class="small muted wide" id="ed-shared">The name and provenance are the accession's: saved here, they are saved on its {accPlants.length} plants.</p>{/if}
      {#if edIdentMsg}<p class="bad small wide" role="alert" id="ed-ident-bad">{edIdentMsg}</p>{/if}
      <!-- A partial date ("2017-08", "2019") is kept as it is, and a date field cannot show it: said under the field, so a grower who thinks it is missing does not guess a day (round sixty-two; the records review's 11). -->
      <label><span>Acquired</span><input id="ed-date" type="date" bind:value={f.acquired} oninput={() => (edDateMsg = '')} aria-invalid={!!edDateMsg} aria-describedby={[edDateMsg ? 'ed-date-bad' : '', partialAcquired ? 'ed-date-partial' : ''].filter(Boolean).join(' ') || undefined} />{#if partialAcquired}<span class="small muted" id="ed-date-partial">As imported: {partialAcquired}. Pick a day only if you know it.</span>{/if}{#if edDateMsg}<span class="bad small" id="ed-date-bad">{edDateMsg}</span>{/if}</label>
      <label><span>From</span><input id="ed-from" type="text" bind:value={f.sourceFrom} /></label>
      <label><span>Form</span><input id="ed-form" type="text" bind:value={f.sourceForm} placeholder="plant, seedling, seed, cutting" /></label>
      <label><span>Price</span><input id="ed-price" type="text" bind:value={f.price} /></label>
      <!-- The plant's own watering rhythm, over its place's: blank follows the place, and the placeholder says what that is (round fifty-eight; the grower review). -->
      <label><span>Water about every</span><span class="unitfield"><input id="ed-waterdays" type="text" inputmode="numeric" bind:value={f.waterDays} placeholder="{inheritedRhythm} ({cond?.waterDays ? 'its space' : 'the default'})" oninput={() => (edWaterMsg = '')} aria-invalid={!!edWaterMsg} aria-describedby={edWaterMsg ? 'ed-water-bad' : undefined} /> days</span>{#if edWaterMsg}<span class="bad small" id="ed-water-bad">{edWaterMsg}</span>{/if}</label>
      <!-- An offset, a cutting, a division, a leaf or a bulbil of one of the grower's plants: the link its page and the other's show (round eighty-seven, F4). -->
      <div class="wide motherrow"><PlantChoice bind:value={f.motherAcc} id="ed-mother" label="Taken from" none="Not from one of my plants" exclude={a.id} /><label><span>As</span><select id="ed-mother-how" bind:value={f.motherHow} disabled={!f.motherAcc}>{#if !(MOTHER_HOW as readonly string[]).includes(f.motherHow)}<option value={f.motherHow}>{f.motherHow} (a word this version of the app does not know)</option>{/if}{#each MOTHER_HOW as k}<option value={k}>{MOTHER_HOW_LABEL[k]}</option>{/each}</select></label></div>
      <div class="wide"><span class="lbl">Space</span><LocationPicker bind:value={f.locationId} id="ed-loc" label="Space" /></div>
      <div class="actions wide"><button class="btn" type="button" onclick={() => { editing = false; edDateMsg = ''; edWaterMsg = ''; edIdentMsg = ''; }}>Cancel</button><button class="btn pri" type="submit" aria-disabled={saveBusy}>{edChecking ? 'Checking the name…' : 'Save'}</button></div>
    </form>
  {/if}

  <!-- The four verbs a grower uses most, then the rest on request: a new plant's page is not the tracker's whole vocabulary. A plant that is dead or archived is not watered first: Log leads and Water waits behind More (round twenty-three, 19). -->
  <div class="quickbar">
    <!-- aria-disabled, not disabled, while it saves: a disabled button drops keyboard focus to the page (round sixty; the accessibility review, 1). -->
    {#if a.status === 'growing'}<button class="btn pri" id="water-now" onclick={waterNow} aria-disabled={wateringNow}>Water</button>{/if}
    {#if heroRoom}<button class="btn" onclick={() => { adding = !adding; if (adding) setTimeout(() => document.getElementById('photos')?.scrollIntoView({ behavior: motion(), block: 'center' }), 0); }}>Photo</button>{/if}
    <!-- "Record…", not "Log": it records any event, and "Log" read as "show the log" (round sixty; the grower review, 16). -->
    <button class="btn" class:pri={a.status !== 'growing'} onclick={() => quick('note')}>Record…</button>
    {#if a.status !== 'dead'}<button class="btn" onclick={() => { moveTo = a.locationId ?? null; moving = !moving; }}>Move</button>{/if}<!-- a dead plant is not moved, nor watered (round fifty-eight; the grower review) -->
    {#if moreActs}
      {#if a.status === 'archived'}<button class="btn" onclick={() => quick('water')}>Water</button>{/if}
      <button class="btn" id="verb-feed" onclick={() => quick('feed')}>Feed</button>
      <button class="btn" onclick={() => quick('repot')}>Repot</button>
      <button class="btn" onclick={() => quick('measure')}>Measure</button>
      <button class="btn" onclick={() => quick('treat')}>Treat</button>
      <button class="btn" onclick={() => quick('flower')}>Flower</button>
      <!-- Fruit and seed set, dated as flowering is (round eighty-seven, F8). -->
      <button class="btn" onclick={() => quick('fruit')}>Fruit</button>
      <button class="btn" onclick={() => quick('seed')}>Seed</button>
      {#if a.status === 'growing'}{#if confirmArchive}<span class="confirmrow"><button class="btn" id="status-toggle" onclick={() => { confirmArchive = false; setStatus('archived'); }}>Yes, archive</button><button class="btn" type="button" onclick={() => (confirmArchive = false)}>Keep</button></span>{:else}<button class="btn" id="status-toggle" onclick={() => { confirmArchive = true; void focusNext('#status-toggle'); }} title="Takes the plant off the growing list; it can be marked growing again">Archive</button>{/if}{:else}<button class="btn" id="status-toggle" onclick={() => setStatus('growing')}>Mark growing</button>{/if}
    {:else}
      <button class="btn more" type="button" aria-expanded="false" aria-label="More" onclick={() => { moreActs = true; void focusNext('#verb-feed'); }}>More ▾</button>
    {/if}
  </div>

  {#if moving && a.status !== 'dead'}
    <div class="cult evform">
      <div class="sum">Move to <span class="hint">records a move on the timeline</span></div>
      <div class="fields"><LocationPicker bind:value={moveTo} id="mv-loc" label="Move to" /><div class="actions"><button class="btn" type="button" onclick={() => (moving = false)}>Cancel</button><button class="btn pri" type="button" onclick={doMove} aria-disabled={moveBusy}>Move</button></div></div>
    </div>
  {/if}

  {#if splitOpen}
    <!-- An item of this accession: an offset, a division or a bulb split, a plant of its own (round eighty-seven, t1; F1). -->
    <div class="cult evform" id="split-form">
      <div class="sum">Split off an item <span class="hint">a plant of its own under {holder ? accNo(holder) : accNo(a)}, with its name and provenance</span></div>
      <div class="fields">
        <div class="row">
          <label class="fl"><span class="eyebrow">What it is</span><select id="split-how" bind:value={sHow}><option value="offset">An offset</option><option value="division">A division</option><option value="bulb split">A bulb split</option><option value="another piece">Another piece of this plant</option></select></label>
          <label class="fl"><span class="eyebrow">Date</span><input id="split-on" type="date" bind:value={sOn} oninput={() => (sMsg = '')} aria-invalid={!!sMsg} aria-describedby={sMsg ? 'split-bad' : undefined} /></label>
        </div>
        <div><span class="eyebrow">Its space</span><LocationPicker bind:value={sLoc} id="split-loc" label="Its space" /></div>
        {#if sMsg}<p class="refuse" role="alert" id="split-bad">{sMsg}</p>{/if}
        <p class="small muted">It takes the next free letter: {holder ? accNo(holder) : accNo(a)}/A, then /B. Its space, log and photographs are its own.</p>
        <div class="actions"><button class="btn" type="button" onclick={() => (splitOpen = false)}>Cancel</button><button class="btn pri" type="button" id="split-save" onclick={saveSplit} aria-disabled={sBusy}>Split off</button></div>
      </div>
    </div>
  {/if}

  {#if logOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="cult evform" onsubmit={async (e) => { e.preventDefault(); const label = EVENT_LABEL[et]; try { await addEvent(e); } catch { return; } closeLog(recordedText(label)); }} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeLog(undefined, 'back'); } }}>
      <div class="sum">Record: {EVENT_LABEL[et]} <span class="hint">goes on the timeline below</span></div>
      <div class="fields">
        <!-- Each field with a visible name: the placeholders were the only ones, and went as soon as a word was typed (round fifty-eight; the accessibility review). -->
        <div class="row">
          <label class="fl"><span class="eyebrow">What to record</span><select id="ev-type" bind:value={et}>
            {#each Object.entries(EVENT_LABEL).filter(([k]) => !['audit', 'germinate', 'potup', 'loss', 'propagate', 'acquire'].includes(k)) as [k, label]}<option value={k}>{label}</option>{/each}
          </select></label>
          <label class="fl"><span class="eyebrow">Date</span><input id="ev-date" type="date" bind:value={ed} oninput={() => (evmsg = '')} aria-invalid={!!evmsg} aria-describedby={evmsg ? 'ev-bad' : undefined} /></label>
        </div>
        {#if evmsg}<p class="refuse" role="alert" id="ev-bad">{evmsg}</p>{/if}
        {#if et === 'treat' || et === 'feed'}<label class="fl"><span class="eyebrow">{et === 'treat' ? 'Product and rate' : 'Feed and rate'}</span><input id="ev-used" type="text" bind:value={eused} placeholder={et === 'treat' ? 'e.g. Safari 20SG drench' : 'e.g. Grow More 17-8-22 ¼ tsp/gal'} /></label>{/if}
        {#if et === 'death'}<label class="fl"><span class="eyebrow">Cause, if known</span><input id="ev-cause" type="text" bind:value={ecause} /></label>{/if}
        <!-- A cross: this plant is the seed parent, the pollen parent one of the grower's plants; a graft: the plants its parts came from (round eighty-seven, F4). -->
        {#if et === 'pollinate'}<PlantChoice bind:value={epollen} id="ev-pollen" label="Pollen from (makes it a cross, this plant the seed parent)" none="Not one of my plants, or not said" exclude={id} />{/if}
        {#if et === 'graft'}<div class="row"><PlantChoice bind:value={escion} id="ev-scion" label="Scion from" none="This plant, or not one of mine" exclude={id} /><PlantChoice bind:value={estock} id="ev-stock" label="Stock" none="Not one of my plants" exclude={id} /></div>{/if}
        {#if et === 'measure'}
          <div class="measures">
            {#each MEASURES.filter((x) => x.k !== POT.k) as m}
              <label><span class="lab">{m.label}{m.unit ? ` (${lu})` : ''}</span><input type="number" step="any" inputmode="decimal" bind:value={measures[m.k]} /></label>
            {/each}
          </div>
        {/if}
        {#if et === 'repot'}
          <!-- Both optional: the pot in the grower's length units, stored in millimetres; the medium into the note (round fifty-eight; the grower review). -->
          <div class="row repot">
            <label><span class="lab">Pot size ({lu})</span><input id="ev-pot" type="number" step="any" min="0" inputmode="decimal" bind:value={epot} placeholder={lu === 'in' ? 'e.g. 3.5' : 'e.g. 90'} oninput={() => (evmsg = '')} /></label>
            <label><span class="lab">Medium</span><input id="ev-medium" type="text" bind:value={emedium} placeholder="e.g. pumice and loam, 2:1" /></label>
          </div>
        {/if}
        <label class="fl"><span class="eyebrow">Note (optional)</span><input id="ev-note" type="text" bind:value={enote} /></label>
        <div class="actions"><button class="btn" type="button" onclick={() => closeLog()}>Cancel</button><button class="btn pri" type="submit">Record</button></div>
      </div>
    </form>
  {/if}

  <Parked kind="accession" id={id} />
  {#if setup.length}
    <div class="cult setup">
      <div class="sum">Set it up <span class="hint">what makes this page useful</span></div>
      <div class="setupbody">
        <!-- The first unfinished step is the one to take; the rest are listed, not pressed (round twenty, design) -->
        {#each setup as st, i (st.k)}<button class="setuprow" class:next={i === 0} class:later={i > 0} type="button" onclick={st.go}><span class="n">{i + 1}</span><span class="t">{st.t}</span><span class="w">{st.w}</span></button>{/each}
      </div>
    </div>
  {/if}

  <!-- The plant's own figures under the actions; then the log, the photographs, and the habitat comparison folded at the foot: on a phone the climate cards stood between the verbs and the log (round fifty-eight; the grower review). -->
  {#if (a.status === 'growing' || (a.status !== 'dead' && collection.lastWatered(id))) || events.some((e) => e.t === 'audit') || lastMeasure}
  <div class="cards">
    {#if a.status === 'growing' || (a.status !== 'dead' && collection.lastWatered(id))}<div class="card"><div class="lab">Since watered</div><div class="val">{sinceWater === 0 ? 'today' : (sinceWater ?? '–')}{#if sinceWater}<span class="u"> d</span>{/if}</div><div class="sub">{sinceWater == null && collection.wateringAhead(id) ? `watering dated ${collection.wateringAhead(id)}, ahead of today` : sinceWater == null ? `no watering recorded${careDays === 0 ? ' yet; added today' : ` in the ${careDays} ${careDays === 1 ? 'day' : 'days'} since it was added`}` : `last ${collection.lastWatered(id)}`}</div></div>{/if}
    {#if events.some((e) => e.t === 'audit')}<div class="card"><div class="lab">Last seen</div><div class="val">{seen == null ? '–' : seen}<span class="u">{seen == null ? '' : ' d'}</span></div><div class="sub">{#if collection.missedAt(id)}not seen at the audit of <span class="date">{collection.missedAt(id)}</span>; {/if}last logged <span class="date">{collection.lastSeen(id)}</span></div></div>{/if}
    {#if lastMeasure}<div class="card"><div class="lab">{sizeKey ? (MEASURES.find((m) => m.k === sizeKey)?.label ?? 'Size') : 'Size'}</div><div class="val">{sizeKey && lastMeasure ? (MEASURES.find((m) => m.k === sizeKey)?.unit ? lenN(lastMeasure.measures![sizeKey]) : lastMeasure.measures![sizeKey]) : '–'}<span class="u">{sizeKey && MEASURES.find((m) => m.k === sizeKey)?.unit ? ' ' + lu : ''}</span></div>{#if growth != null}<div class="gauge"><i style="width: {Math.min(100, Math.max(8, (growth / Math.max(1, lastMeasure!.measures![sizeKey!])) * 100))}%"></i></div>{/if}<div class="sub">{growth != null ? `${growth >= 0 ? '+' : ''}${MEASURES.find((m) => m.k === sizeKey)?.unit ? len(growth) : growth} since ${firstMeasure!.d}` : `measured ${lastMeasure.d}`}</div></div>{/if}
  </div>
  {/if}

  <div class="secrule"><h2>Log</h2><div class="line"></div><span class="n">{plural(timeline.length, 'entry', 'entries')}</span></div>
  {#if !events.length}
    <p class="empty">Nothing recorded yet; each verb above adds a line here.</p>
  {:else}
    <div class="tl">
      {#each shownTimeline as row (row.k + row.id)}
        {#if row.k === 'e'}
          {@const e = row.e}
          {@const which = `${e.t === 'audit' && e.note === 'not seen' ? 'Not seen at audit' : (EVENT_LABEL[e.t] ?? e.t)}, ${lineDates.get(e.id) ?? e.d}`}
          <div class="tlrow" class:auto={!!e.auto} title={e.auto ? 'Written by the app or by a space-wide action, not an observation of this plant' : undefined}>
            <span class="d">{lineDates.get(e.id) ?? e.d}</span>
            <span class="t">{e.t === 'audit' && e.note === 'not seen' ? 'Not seen at audit' : (EVENT_LABEL[e.t] ?? e.t)}{#if e.t === 'pollinate' && linkId(e.pollen, e.acc)}<span class="x2">{' · × '}<PlantRef id={linkId(e.pollen, e.acc)!} short /> (pollen parent)</span>{/if}{#if e.t === 'graft' && linkId(e.scion, e.acc)}<span class="x2">{' · scion from '}<PlantRef id={linkId(e.scion, e.acc)!} short /></span>{/if}{#if e.t === 'graft' && linkId(e.stock, e.acc)}<span class="x2">{' · on stock '}<PlantRef id={linkId(e.stock, e.acc)!} short /></span>{/if}{#if e.used}<span class="x2">{' · '}{e.used}</span>{/if}{#if e.cause}<span class="x2">{' · '}{e.cause}</span>{/if}{#if e.measures}<span class="x2">{' · '}{Object.entries(e.measures).map(([k, v]) => { const m = measureOf(k); return `${m?.label ?? k} ${m?.unit ? len(v) : v}`; }).join(', ')}</span>{/if}{#if e.note && !(e.t === 'audit' && e.note === 'not seen')}<span class="x2">{' · '}{e.note}</span>{/if}</span>
            <!-- each × named by its line, not five "Remove this entry" in a row (round eighty-one; the desktop review's 7) -->{#if confirmEvent === e.id}<button class="rm confirm" type="button" aria-label="Remove? {which}: press again to remove it" aria-describedby={e.t === 'pollinate' && crossNamedBy(e.id).length ? 'cross-named' : undefined} onclick={() => removeEntry(e.id)}>Remove?</button>{:else}<button class="rm" type="button" title="Remove this entry" aria-label="Remove this entry: {which}" onclick={() => { confirmEvent = e.id; void focusNext('.rm.confirm'); }}>×</button>{/if}
          </div>
          {#if confirmEvent === e.id && e.t === 'pollinate' && crossNamedBy(e.id).length}{@const named = crossNamedBy(e.id)}<p class="crossnamed small" id="cross-named" role="status">{named.length === 1 ? 'Batch' : 'Batches'} {named.join(', ')} {named.length === 1 ? 'names' : 'name'} this cross as {named.length === 1 ? 'its' : 'their'} seed's parents. Removing the line takes both parents off {named.length === 1 ? 'its' : 'their'} seedlings and the cross out of batches.csv. Press Remove? again to remove it.</p>{/if}
        {:else}
          {@const ph = row.ph}
          <button class="tlrow tlphoto" type="button" onclick={() => openPhoto(ph)}>
            <span class="d">{ph.d}</span>
            <span class="t"><span class="thumb"><PhotoImg id={ph.id} alt="" loading="lazy" /></span>Photographed{#if ph.caption}<span class="x2">{' · '}{ph.caption}</span>{/if}</span>
            <span class="x">{ph.dFrom === 'exif' ? 'camera date' : ''}</span>
          </button>
        {/if}
      {/each}
      {#if shownTimeline.length < timeline.length}
        <div class="tlrow tlmore"><span class="d"></span><span class="t"><button type="button" class="linkish" onclick={() => (allLog = true)}>All {timeline.length} entries</button> <span class="x2">· the latest {shownTimeline.length} are above</span></span></div>
      {/if}
    </div>
  {/if}

  <!-- The grower's own notes come before the photographs when there are any: they are read more than anything below (round sixty; the grower review, §4). -->
  {#snippet plantNotes()}
  <div class="secrule"><h2>Notes on this plant</h2><div class="line"></div></div>
  <div class="cult">
    {#if editingNotes}
      <div class="fields"><textarea id="acc-notes" rows="4" bind:value={notesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingNotes = false)}>Cancel</button><button class="btn pri" onclick={saveNotes}>Save</button></div></div>
    {:else if a.notes}
      <div class="body">{a.notes}</div><div class="foot"><button class="linkish" onclick={() => { notesDraft = a.notes ?? ''; notesBase = notesDraft; notesBaseStamp = collection.notesStamp('accession', id); editingNotes = true; }}>Edit</button></div>
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { notesDraft = ''; notesBase = ''; notesBaseStamp = collection.notesStamp('accession', id); editingNotes = true; }}>Add a note</button></div>
    {/if}
    <ReplacedNotes kind="accession" id={a.id} />
  </div>
  {/snippet}
  {#if a.notes}{@render plantNotes()}{/if}
  <div class="secrule" id="photos"><h2>Photographs</h2><div class="line"></div><span class="n">{photos.length ? `${photos.length}` : ''}</span></div>
  {#if adding || !photos.length}
    <div class="cult addrow"><PhotoAdd acc={id} id="acc-photo" onstart={() => (adding = true)} onadded={() => (adding = true)} /></div>
  {/if}
  {#if photos.length}
    <!-- Each thumbnail is named by the plant, the day and the caption, the cover said too; the image inside is then decorative (round fifty-eight; the accessibility review). -->
    <div class="phgrid">
      {#each photos as ph, i (ph.id)}
        <button class="ph" type="button" class:cov={cover?.id === ph.id} onclick={() => (lightbox = i)} title={ph.caption ?? ph.d} aria-label="{ph.d}{cover?.id === ph.id ? ' cover' : ''}: {photoLabel(ph)}">
          <PhotoImg id={ph.id} alt="" loading="lazy" />
          <span class="pd">{ph.d}</span>
          {#if cover?.id === ph.id}<span class="tag">cover</span>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Its growing season and its papers, each its own component (round eighty-seven, t3; plans F7 and F9). -->
  <GrowingSeason plant={a} year={habitat?.year ?? null} readerLat={cond?.lat ?? readerLat(collection.locations)} why={seasonWhy} />
  <Attachments acc={a.id} />

  <details class="hab" id="habitat">
    <summary class="secrule"><h2>{#if compared}Compare: <SpeciesName name={compared} />, habitat vs this space{:else}Habitat vs this space{/if}</h2><div class="line"></div><span class="n">{a.locationId && collection.placeOf(a.locationId) ? collection.locationName(a.locationId) : ''}</span></summary>
    <div class="cards">
      <div class="card"><div class="lab">Habitat rain season</div><div class="val" style="font-family: var(--ui); font-size: var(--fs-lg); font-weight: 700">{#if !season && dossier && recordsUnchecked(dossier)}<NotChecked what="Climate" why={NO_GBIF_SENTENCE} />{:else if !season && dossier?.climate.status === 'refused'}<NotChecked what="Climate" why={detailSentence(dossier.climate.detail, 'A source did not answer when the species page was built').replace('when this page was built', 'when the species page was built')} />{:else}{season ? season.label : dossier?.climate.status === 'pending' ? 'Climate pending' : dossier ? 'No habitat climate' : ref === 'unreachable' ? (refused ? 'Reference refused' : 'Reference not reached') : ref === 'none' ? (kind === 'hybrid' ? 'A hybrid' : notStated ? 'No species named' : 'No species page') : '…'}{/if}</div><div class="sub">{#if season}{season.note} <a href="/species/{speciesHref}#s-cultivation">The sheet</a>.{:else if dossier && recordsUnchecked(dossier)}No season is read: the species page has no habitat climate, for that reason.{:else if dossier?.climate.status === 'refused'}No season is read from an answer that was not given.{:else if dossier?.climate.status === 'pending'}The habitat climate for this species has not been derived yet.{:else if dossier}Nothing to read a season from{dossier.climate.status === 'none' && dossier.climate.detail ? `: ${climateReason(dossier.climate.detail)}` : ''}.{:else if ref === 'unreachable'}{refused ?? 'The species reference could not be reached from here'}; nothing is known either way.{:else if ref === 'none'}{kind === 'hybrid' ? (parentLinks.some((p) => p.slug) ? 'No habitat of its own; its parents have species pages.' : 'No habitat of its own.') : notStated ? 'A cultivar filed under its genus; name its species to compare its habitat.' : 'Not in the reference.'}{:else}reading the species page{/if}</div></div>
    </div>
    {#if !habitat && dossier && recordsUnchecked(dossier) && a.locationId}
      <!-- A species page without a GBIF key (round seventy-nine): nothing to compare this space with, and why. -->
      <p class="small muted" id="habitat-not-checked">Habitat against this space: not asked. {NO_GBIF_SENTENCE} The habitat figures are read only from them.</p>
    {/if}
    {#if habitat && a.locationId}
    <div class="factgrid hvh">
      {#if lightCompare}<div><b>Light</b>{lightCompare.text}.{#if lightCompare.here == null}{#if a.locationId}{' '}<a class="tap" href="/places/{a.locationId}?edit=1">Set its light</a>.{:else}{' '}<button type="button" class="linkish tap" onclick={() => (moving = true)}>Give it a space</button> first.{/if}{/if}</div>{/if}
      {#if coldCompare}<div><b>Cold</b>{coldCompare.text}.{#if coldCompare.here == null}{#if a.locationId}{' '}<a class="tap" href="/places/{a.locationId}?edit=1">Set its floor</a>.{:else}{' '}<button type="button" class="linkish tap" onclick={() => (moving = true)}>Give it a space</button> first.{/if}{/if}</div>{/if}
    </div>
    <!-- "across the range" and "a typical spot in the range", the glossary's words (round fifty-eight; the accessibility review). -->
    <details class="why">
      <summary>What this compares</summary>
      <div class="whybody">A comparison, not a verdict: the habitat figures are what the sky and the weather do where the species is recorded (CHELSA across the range, NASA POWER at a typical spot in the range), not measured tolerances of this plant. This space's figures are its own settings, inherited from the spaces above it where set. <a class="tap" href="/species/{speciesHref}#s-cultivation">The full cultivation sheet</a>.</div>
    </details>
    {/if}
    {#if !site.current && cond?.lat == null}<p class="small muted siteline">No site is set: set it once in <a href="/settings#site">Settings</a> and the seasons here are read from where you grow.</p>{/if}
  </details>

  {#if !a.notes}{@render plantNotes()}{/if}
  <div class="cult">
    <!-- A cf. or aff. plant's notes are the compared species' (shown on every plant of it and on its page), and say so: they read as this plant's species' own (round sixty-two, second pass; the grower review). -->
    <div class="sum" id="species-notes-head">My notes on <SpeciesName name={notesOn?.name ?? a.taxonName} />{#if compared}, the species it is compared with{/if} <span class="hint">{notesOn?.shared ? 'kept under this name, shared by every plant you have under it' : compared ? 'shared by every plant of that species you own; shown on its species page' : 'shared by every plant of this species you own; shown on the species page'}</span></div>
    {#if editingMy}
      <div class="fields"><textarea id="taxon-notes" rows="4" bind:value={myNotesDraft}></textarea><div class="actions"><button class="btn" onclick={() => (editingMy = false)}>Cancel</button><button class="btn pri" onclick={saveMyNotes}>Save</button></div></div>
    {:else if taxon?.myNotes}
      <div class="body">{taxon.myNotes}</div><div class="foot"><button class="linkish" onclick={() => { myNotesDraft = taxon?.myNotes ?? ''; myNotesOpen = myNotesDraft; myNotesBaseStamp = collection.notesStamp('taxon', taxonSlug); editingMy = true; }}>Edit</button></div>
      <ReplacedNotes kind="taxon" id={taxonSlug} />
    {:else if sharedNotes}
      <!-- Written before an "sp." plant's notes were kept by its own name, when every plant of the genus without a species shared them (round sixty-two; A21): shown, and the editor opens on them so they can be kept here. -->
      <div class="body" id="shared-genus-notes">{sharedNotes}</div><div class="foot small muted">Written on the genus, before these notes were kept by this name, so every <i>{parseName(a.taxonName).genus}</i> plant without a species shows them. <button class="linkish" onclick={() => { myNotesDraft = sharedNotes ?? ''; myNotesOpen = ''; myNotesBaseStamp = collection.notesStamp('taxon', taxonSlug); editingMy = true; }}>Keep them for this name</button></div>
    {:else}
      <div class="none">Nothing yet. <button class="linkish" onclick={() => { myNotesDraft = ''; myNotesOpen = ''; myNotesBaseStamp = collection.notesStamp('taxon', taxonSlug); editingMy = true; }}>Write cultivation notes</button></div>
    {/if}
  </div>

  {#if propagations.length}
    <div class="secrule"><h2>Propagated from this plant</h2><div class="line"></div><span class="n">{propagations.length}</span></div>
    <div class="tl">
      {#each propagations as p}
        {@const st = collection.sowingStats(p.id)}
        <a class="tlrow" href={batchHref(p)}><span class="d">{p.sown}</span><span class="t"><span class="mono">{sowNo(p)}</span> · {p.count} {(PROP_METHODS.find((m) => m.k === p.method) ?? PROP_METHODS[0]).unit}</span><span class="x">{st.germinated} struck · {st.potted} potted · {p.status}</span></a>
      {/each}
    </div>
  {/if}

  <Lineage plant={a} />

  <div class="secrule"><h2>Provenance</h2><div class="line"></div></div>
  {#if !a.sourceFrom && !a.sourceForm && !a.fieldNumber && (a.provenance ?? 'unknown') === 'unknown' && !a.sowingId && !a.nameAsReceived && kind !== 'hybrid' && !a.price && !a.sourceRef && !ident?.provType && !ident?.propHistory && !ident?.collector && !ident?.collected && !ident?.exChain.length && !ident?.clone && !ident?.idLevel && !ident?.idBy && !earlier.length && !qualifier && accPlants.length < 2}
    <p class="empty">Nothing stated yet. <button class="linkish" type="button" onclick={startEdit}>Add where it came from</button></p>
  {:else}
  <div class="factgrid">
    <div><b>Source</b>{#if a.sourceFrom}<a href="/plants?q={encodeURIComponent(a.sourceFrom)}" title="Every plant from this source">{a.sourceFrom}</a>{/if}{#if a.sourceForm}{a.sourceFrom ? ' · ' : ''}as {a.sourceForm === 'plant' ? 'a plant' : a.sourceForm === 'seed' ? 'seed' : a.sourceForm === 'seedling' ? 'a seedling' : a.sourceForm === 'cutting' ? 'a cutting' : a.sourceForm}{/if}{#if a.acquired}{a.sourceFrom || a.sourceForm ? ', ' : ''}{a.acquired}{/if}{#if !a.sourceFrom && !a.sourceForm && !a.acquired}not stated{/if}{#if a.price}{' · '}{a.price}{/if}</div>
    {#if a.sourceRef}<div><b>Lot or reference</b>{a.sourceRef}</div>{/if}
    <!-- A field left blank is not stated, never "none", as the batch page says (round eighty-four; review-w W9). -->
    <!-- The field number as typed, read as the collector's code and number where it reads as one, with a lookup the grower
         presses: the page never asks BCSS anything (round eighty-seven, t1; F3). -->
    <div id="field-number"><b>Field number</b>{#if a.fieldNumber}{a.fieldNumber}{#if ident?.field}<span class="muted">{' · '}collector's code {ident.field.code}, number {ident.field.no}</span>{/if}{#if bcssHref(a.fieldNumber)}{' · '}<a id="bcss-lookup" href={bcssHref(a.fieldNumber)} target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="Opens the British Cactus and Succulent Society's database with this field number">Look up at BCSS Field Number Database</a>{/if}{:else}not stated{/if}</div>
    {#if ident?.collector || ident?.collected}<div id="collection"><b>Collected</b>{ident.collector ? `by ${ident.collector}` : 'collector not stated'}{ident.collected ? `, ${ident.collected}` : ''}</div>{/if}
    <div><b>Provenance</b>{provLabel(a.provenance)}</div>
    {#if ident?.provType || ident?.propHistory}<div id="itf2-provenance"><b>ITF2</b>{#if ident.provType}{PROV_TYPE_LABEL[ident.provType]}{ident.provTypeRead ? ' (read from the provenance)' : ''}{/if}{#if ident.provType && ident.propHistory}{'; '}{/if}{#if ident.propHistory}{PROP_HISTORY_LABEL[ident.propHistory]}{ident.propHistoryRead ? ' (read from the provenance)' : ''}{/if}</div>{/if}
    {#if ident?.exChain.length}<div id="ex-chain"><b>Earlier holders</b>{exChainText(ident.exChain)}</div>{/if}
    {#if ident?.clone}<div><b>Clone</b>{ident.clone}</div>{/if}
    {#if qualifier || ident?.idLevel || ident?.idBy || ident?.idOn}<div id="identification"><b>Identification</b>{#if qualifier}<span id="id-qualifier">{qualifier}: {QUALIFIER_MEANS[qualifier] ?? qualifier}{idqlOf(a.taxonName) ? ` (ITF2 ${idqlOf(a.taxonName)?.idql})` : ''}</span>{#if ident?.idLevel || ident?.idBy || ident?.idOn}{'; '}{/if}{/if}{#if ident?.idLevel}level {ID_LEVEL_LABEL[ident.idLevel]}{/if}{#if ident?.idBy}{ident.idLevel ? ', ' : ''}by {ident.idBy}{/if}{#if ident?.idOn}{ident.idLevel || ident.idBy ? ', ' : ''}{ident.idOn}{/if}</div>{/if}
    {#if earlier.length}<div id="earlier-names"><b>Earlier names</b>{#each [...earlier].reverse() as e, i}{i ? '; ' : ''}{e.name}, until {e.until}{e.idBy ? ` (identified by ${e.idBy}${e.idOn ? `, ${e.idOn}` : ''})` : ''}{/each}</div>{/if}
    {#if accPlants.length > 1 || (ident?.item && holder)}<div id="accession-plants"><b>Plants of {holder ? accNo(holder) : accNo(a)}</b>{#each accPlants as p, i (p.id)}{i ? ', ' : ''}{#if p.id === a.id}<span class="mono">{accNo(p)}</span> (this one){:else}<a class="mono" href={plantHref(p)}>{accNo(p)}</a>{p.status !== 'growing' ? ` (${p.deacc ? 'no longer held' : p.status})` : ''}{/if}{/each}{#if holder && !accPlants.some((p) => p.id === holder.id)}{accPlants.length ? '; ' : ''}<a class="mono" href="/plants/{encodeURIComponent(holder.id)}">{accNo(holder)}</a> was removed{/if}</div>{/if}
    {#if a.sowingId}<div><b>Raised from</b><a href={sowing ? batchHref(sowing) : `/propagation/${a.sowingId}`}>{sowing ? sowNo(sowing) : a.sowingId}</a>{#if sowing} · {sowing.count} started, {collection.sowingStats(sowing.id).germinated} up, {collection.sowingStats(sowing.id).potted} potted{/if}</div>{/if}
    {#if a.nameAsReceived}<div><b>Name as received</b>{a.nameAsReceived}</div>{/if}
    {#if kind === 'hybrid'}<div><b>Parentage</b>{a.parentage ?? 'not stated'}</div>{/if}
  </div>
  {/if}

  {#if deaccOpen}
    <!-- No longer held, with a reason, a day and a note: the honest form of a removal, which keeps the plant's page (round eighty-seven, t1; F1). -->
    <form class="cult evform" id="deacc-form" onsubmit={(e) => { e.preventDefault(); void saveDeacc(); }}>
      <div class="sum">No longer held <span class="hint">the record, log and photographs are kept</span></div>
      <div class="fields">
        <div class="row">
          <label class="fl"><span class="eyebrow">Why</span><select id="deacc-reason" bind:value={dReason}>{#each DEACC_REASONS as r}<option value={r}>{DEACC_LABEL[r]}</option>{/each}</select></label>
          <label class="fl"><span class="eyebrow">Since</span><input id="deacc-on" type="date" bind:value={dOn} oninput={() => (dMsg = '')} aria-invalid={!!dMsg} aria-describedby={dMsg ? 'deacc-bad' : undefined} /></label>
        </div>
        <label class="fl"><span class="eyebrow">Note (optional)</span><input id="deacc-note" type="text" maxlength={NOTE_MAX} bind:value={dNote} placeholder={dReason === 'given' ? 'e.g. to the society plant sale' : dReason === 'reaccessioned' ? 'e.g. now 2026-0031' : ''} /></label>
        {#if dMsg}<p class="refuse" role="alert" id="deacc-bad">{dMsg}</p>{/if}
        <div class="actions"><button class="btn" type="button" onclick={() => (deaccOpen = false)}>Cancel</button><button class="btn pri" type="submit" id="deacc-save" aria-disabled={dBusy}>Record it</button></div>
      </div>
    </form>
  {/if}
  <div class="dangerrow">
    {#if !ident?.deacc}<span class="deaccrow"><span class="small muted">Died, given away, lost? Record it as no longer held: the page stays, listed under <a href="/plants/gone">No longer held</a>.</span> <button class="btn" type="button" id="deacc-open" onclick={openDeacc}>No longer held…</button></span>{/if}
    <span class="small muted">Remove is for a record made by mistake. You can bring it back later from its page; its number stays its own, and its record stays in the change log.</span>
    {#if confirmRemove}<span><button class="btn danger" onclick={remove}>Yes, remove {accNo(a)}</button> <button class="btn" onclick={() => (confirmRemove = false)}>Keep</button></span>{:else}<button class="btn danger" onclick={() => { confirmRemove = true; void focusNext('.dangerrow .btn.danger'); }}>Remove this plant</button>{/if}
  </div>
  {#if lightbox != null && photos.length}
    <Lightbox {photos} bind:index={lightbox} acc={id} onclose={() => (lightbox = null)} />
  {/if}
{/if}

<style>
  /* A date in a narrow card's subline stays on one line: at 390 px it broke after "2026-09-" (round thirty-seven, R2 design). */
  .sub .date { white-space: nowrap; }
  .hero { margin-top: 14px; }
  /* Without a picture the card does not overlap a hero that is not there. */
  .idcard.flat { margin: 14px 0 0; } /* with no photograph to overlap, the card spans the column as the cards under it do (the merge, round eighty-five; review-w W11: 165 to 1101 against 143 to 1123 at 1280 px) */
  /* With the photographs' strip between the hero and the card (two photographs or more), the card overlaps nothing: its
     negative margin, for overlapping the hero, put it over the bottom 26 px of every thumbnail and its date on a phone, and
     a tap there landed on the card (round eighty; the phone review's 2). */
  :global(.ptl) + .idcard { margin-top: 14px; }
  .idcard.flat .who { flex-basis: 260px; }
  .vern .kind { font-family: var(--ui); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cool); }
  .vern .place { font-weight: 600; color: var(--ink); }
  .idcard .pills:empty { display: none; }
  .cardmenu { position: relative; }
  .cardmenu .dots { font-weight: 700; letter-spacing: 0.1em; padding-left: 12px; padding-right: 12px; }
  .cardmenu .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 160px; background: var(--card); border-radius: var(--r); border: 1px solid var(--edge); box-shadow: none; padding: 6px; display: flex; flex-direction: column; }
  .cardmenu .menu > * { display: block; text-align: left; font: inherit; font-family: var(--ui); font-size: var(--fs-md); padding: 9px 12px; border: 0; background: none; color: var(--ink); border-radius: var(--r-sm); cursor: pointer; text-decoration: none; }
  .cardmenu .menu > *:hover, .cardmenu .menu > *:focus-visible { background: var(--sunk); outline: none; }
  /* A fixed height for the species photograph and its stand-ins: the box is the same size before the image, with it, and without it, so the page below does not move. */
  .hero:not(.own) { min-height: 260px; }
  .hero.hold { visibility: hidden; } /* the room of `.hero:not(.own)`: 260 px, its margin as the hero's */
  .hero .spthumb { width: 100%; height: 260px; object-fit: cover; display: block; }
  /* The skeleton fills the first screen, so the footer starts below the fold and does not move when the record's sections arrive (round eleven, 4). */
  .skel { min-height: calc(100vh - 150px); }
  .skelbox { background: var(--sunk); border-radius: var(--r); min-height: 260px; }
  .skelname { visibility: hidden; } /* holds the name's line, which wraps under the number on a phone, so the card does not grow when the record arrives (round twenty-one, 14) */
  .skeltile { width: var(--tile, 96px); height: var(--tile, 96px); min-height: 0; flex: 0 0 var(--tile, 96px); border-radius: var(--r); }
  .skelbtn { min-width: 64px; visibility: hidden; }
  .skelverbs { min-height: 52px; margin-top: 14px; }
  .parentage { margin-top: 2px; }
  .parentage a { color: inherit; }
  .hero.own { background: #0d1211; min-height: 430px; }
  .hero.own .cred { top: 10px; bottom: auto; }
  .heroimg { display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .heroimg :global(img) { width: 100%; height: 430px; object-fit: cover; display: block; } /* a fixed height: the box is the same before the pixels arrive from the vault */
  button.cred { border: 0; cursor: pointer; font: inherit; font-size: var(--fs-xs); }
  .addrow { padding: 14px 17px; margin-top: 12px; }
  .phgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
  .phgrid .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: var(--r); overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: none; }
  .phgrid .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .phgrid .ph.cov { outline: 2px solid var(--accent); outline-offset: 2px; }
  .phgrid .pd { position: absolute; left: 8px; bottom: 7px; font-family: var(--mono); font-size: var(--fs-xs); color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: var(--r-sm); }
  .phgrid .tag { position: absolute; right: 8px; top: 7px; font-size: var(--fs-xs); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: var(--r-sm); }
  .tlphoto { width: 100%; text-align: left; background: transparent; border: 0; border-top: 1px solid var(--rule); font: inherit; color: inherit; cursor: pointer; align-items: center; }
  .tlphoto:first-child { border-top: 0; }
  .tlphoto .thumb { display: inline-block; width: 44px; height: 44px; border-radius: var(--r-sm); overflow: hidden; vertical-align: middle; margin-right: 10px; background: var(--sunk); }
  .tlphoto .thumb :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tlphoto:hover .t { color: var(--accent); }
  .hvh { grid-template-columns: 1fr 1fr; }
  .linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; }
  .refuse { margin: 6px 0 0; font-size: var(--fs-md); color: var(--bad); }
  @media (max-width: 520px) { .hvh { grid-template-columns: 1fr; } }
  .muted { color: var(--ink3); }
  .editform, .evform { margin-top: 16px; }
  .editform { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; }
  .editform label { display: grid; gap: 4px; }
  .editform label > span, .editform .lbl { font-size: var(--fs-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .editform input, .editform select, .fields input, .fields select, .fields textarea { width: 100%; font: inherit; font-size: 0.875rem; padding: 8px 11px; border: 1px solid var(--rule); border-radius: var(--r); background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .measures { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
  .measures label { display: grid; gap: 3px; }
  .measures .lab, .repot .lab { font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .repot label { display: grid; gap: 3px; } /* a repot's pot and medium (round fifty-eight; the grower review) */
  .fl { display: grid; gap: 3px; min-width: 0; } /* a field with its small name over it (round fifty-eight; the accessibility review) */
  /* The rhythm box and its word, not set as a label (round fifty-eight; the grower review). */
  .editform label > span.unitfield { display: flex; align-items: center; gap: 6px; font-size: var(--fs-md); letter-spacing: 0; text-transform: none; color: var(--ink2); font-weight: 400; }
  .editform .unitfield input { width: 6em; }
  /* The plant it was taken from and how, side by side, the list wider (round eighty-seven, F4). */
  .editform .motherrow { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 10px 12px; align-items: end; }
  @media (max-width: 520px) { .editform .motherrow { grid-template-columns: minmax(0, 1fr); } }
  /* The habitat block is folded at the foot, one tap to open, its summary a 44px target (round fifty-eight; the grower review). */
  .hab { margin-top: var(--section-gap, 28px); }
  .hab > summary.secrule { display: flex; align-items: center; gap: 10px; min-height: 44px; margin: 0; cursor: pointer; list-style: none; }
  .hab > summary::-webkit-details-marker { display: none; }
  .hab > summary::before { content: '›'; display: inline-block; transition: transform 0.15s; color: var(--accent); font-size: var(--fs-lg); font-weight: 700; }
  .hab[open] > summary::before { transform: rotate(90deg); }
  .hab > summary h2 { color: var(--accent); }
  .hab > summary .n { margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .hab .cards { margin-top: 6px; }
  .siteline { margin: 10px 0 0; font-size: var(--fs-md); }
  .tlmore .linkish { display: inline-flex; align-items: center; min-height: 44px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin: 0; }
  .tlrow .x2 { font-weight: 400; color: var(--ink2); font-size: var(--fs-md); }
  .crossnamed { margin: 2px 0 8px; padding: 6px 10px; background: var(--warm-soft); color: var(--warm-ink); border-radius: var(--r); }
  /* The × is small; its hit area is not. Negative margins keep the row's height. */
  .rm { border: 0; background: transparent; color: var(--ink3); cursor: pointer; font-size: var(--fs-lg); line-height: 1; padding: 0 4px; min-width: 40px; min-height: 40px; margin: -12px -8px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r); }
  .rm:hover { color: var(--bad); }
  .rm.confirm { font-size: var(--fs-sm); color: var(--bad); font-weight: 600; }
  a.tlrow { color: inherit; }
  .tlrow.auto .t { color: var(--ink3); font-weight: 400; } /* a line the app wrote, or a place-wide action made, is set quieter than the grower's own (round twenty-five, 12) */
  a.tlrow:hover { text-decoration: none; }
  a.tlrow:hover .t { color: var(--accent); }
  .linkish { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: var(--fs-md); }
  /* The deaccession's line on its own row above the removal's (round eighty-seven, t1). */
  .deaccrow { flex-basis: 100%; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .dangerrow { margin: 46px 0 10px; padding: 0; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: var(--fs-md); color: var(--ink3); }
  .setup { margin-top: 14px; }
  .setup .setupbody { display: grid; }
  .setuprow { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 12px; align-items: center; text-align: left; padding: 12px 17px; border: 0; border-top: 1px solid var(--rule); background: none; font: inherit; color: inherit; cursor: pointer; min-height: 48px; width: 100%; }
  .setuprow:first-child { border-top: 0; }
  .setuprow:hover { background: var(--sunk); }
  .setuprow .n { font-family: var(--ui); font-variant-numeric: var(--figs); font-size: var(--fs-sm); color: var(--ink3); }
  .setuprow .t { font-weight: 600; font-size: var(--fs-md); color: var(--accent); }
  .setuprow .w { font-size: var(--fs-sm); color: var(--ink3); }
  .setuprow.next { padding-top: 14px; padding-bottom: 14px; }
  .setuprow.next .t { font-size: var(--fs-base); }
  .setuprow.later .t { font-weight: 500; color: var(--ink2); font-size: var(--fs-md); }
  .setuprow.later { padding-top: 9px; padding-bottom: 9px; }
  .quickbar .more { color: var(--ink2); }
  .confirmrow { display: inline-flex; gap: 6px; }
  /* On a phone the checklist is one row of steps, scrolled sideways, the next step set in the accent: four stacked rows
     stood between the name and the plant's first figures on the first screen (round fifty, 4). */
  @media (max-width: 640px) {
    .setup .sum .hint { display: none; }
    .setup .setupbody { display: flex; gap: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 0 12px 12px; }
    .setup .setupbody::-webkit-scrollbar { display: none; }
    /* Steps in a row of plain words, a thin rule between them, the next one in the accent: no chips (DESIGN-87; round
       eighty-seven's stage-3 integration). */
    .setuprow, .setuprow.next, .setuprow.later { display: inline-flex; width: auto; flex: none; gap: 6px; align-items: center; min-height: var(--tap); padding: 6px 12px; border: 0; border-left: 1px solid var(--rule); border-radius: 0; background: none; white-space: nowrap; }
    .setuprow:first-child { border-left: 0; padding-left: 0; }
    .setuprow .n { font-size: var(--fs-xs); }
    .setuprow .t, .setuprow.next .t, .setuprow.later .t { font-size: var(--fs-md); }
    .setuprow .w { display: none; }
  }
  /* Under a finger every control here is the tap token: the setup steps, the inline links, the entry's ×, the menu and its items (round sixty; the accessibility review, 6). */
  .setuprow { min-height: max(48px, var(--tap)); }
  .factgrid :global(a.tap), .factgrid :global(button.tap), .whybody :global(a.tap) { display: inline-flex; align-items: center; min-height: var(--tap); padding: 0 2px; margin: 0 -2px; vertical-align: middle; }
  .rm { min-width: max(40px, var(--tap)); min-height: max(40px, var(--tap)); }
  .cardmenu .menu > * { min-height: var(--tap); display: flex; align-items: center; }
  .cardmenu .dots { min-width: max(44px, var(--tap)); }
  /* A name wraps between words, never inside one ("Copia / poa"), and a pill wraps rather than pushing the page sideways at 200% text (round sixty; the accessibility review, 5; the outside review's A40). */
  .idcard h1.sci { overflow-wrap: break-word; word-break: normal; hyphens: manual; }
  .idcard .pills .pill { white-space: normal; overflow-wrap: break-word; max-width: 100%; }
  /* Round eighty-seven, stage-3 integration (DESIGN-87: data looks like data, no chips or bordered pills): the plant's
     number as plain figures, and its state ("not watered for 39 d") as words in their colour, not a box. */
  .accno { background: none; padding: 0; border-radius: 0; color: var(--ink2); font-variant-numeric: tabular-nums lining-nums; }
  .accno.big { padding: 0; }
  .fnchip { background: none; border: 0; padding: 0; border-radius: 0; }
  .idcard .pills .pill { border: 0; background: none; padding: 0; border-radius: 0; letter-spacing: 0; font-size: var(--fs-md); }
  .idcard .pills .pill.w { color: var(--warm-ink); }
  .idcard .pills .pill.b { color: var(--bad); }
  /* At a large text size (an em query follows the reader's own size: 22em is 352 px at 100%, 704 px at 200%) the tile goes above the name, so the name has the card's width (round sixty; the accessibility review, 5). */
  @media (max-width: 22em) { .idcard.flat { grid-template-columns: minmax(0, 1fr) !important; } .idcard.flat .who { grid-column: 1 / -1; } }
  .chooser { list-style: none; margin: 12px 0; padding: 0; display: grid; gap: 6px; }
  .chooser .azrow { grid-template-columns: minmax(0, 1fr); min-height: 56px; }
  .chooser .nm { overflow-wrap: break-word; word-break: normal; }
  /* The photograph fills the 260 px box on a phone: the theme's `.hero img { max-height: 150px }`, a species page's rule, made
     it a 150 px slice over a 110 px band of black (round eighty; the phone review's 4). */
  @media (max-width: 640px) { .editform { grid-template-columns: 1fr 1fr; } .hero { margin-top: 0; } .hero.own { min-height: 260px; } .heroimg :global(img) { height: 260px; max-height: none; } .hero .spthumb { max-height: none; } :global(.ptl) + .idcard { margin-top: 10px; } .idcard.flat { margin-top: 10px; display: grid; grid-template-columns: 80px minmax(0, 1fr); --tile: 80px; } .idcard.flat .acts { grid-column: 1 / -1; } .idcard.flat .who { flex-basis: auto; } .idcard.flat h1.sci { font-size: var(--fs-2xl); } .idcard.flat .accno.lead { display: table; margin: 0 0 4px; vertical-align: baseline; } }
</style>

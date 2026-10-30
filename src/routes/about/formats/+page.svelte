<script lang="ts">
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about/how' }, { label: 'Formats' }]);
    return () => setCrumb([]);
  });
</script>

<svelte:head>
  <title>Formats · Cultifolio</title>
  <meta name="description" content="The backup file, the change log, and the sync wire format, documented so you can read your own data without the app." />
</svelte:head>

<PageHead title="Formats" kick="About" places={false} sub="Your data is readable without this app: the change log, the backup file, and what sync puts on the server, all plain." />

<nav class="seg topseg" aria-label="About"><a href="/about/how">How it is made</a><a class="on" href="/about/formats" aria-current="page">Formats</a></nav>

<article class="prose">
  <section class="brief" aria-labelledby="brief-h">
    <h2 id="brief-h">In brief</h2>
    <ul>
      <li>Your collection is a log of changes, each setting one field of one record. Read them in order and you have the collection.</li>
      <li>A backup is an ordinary zip: the whole log as JSON, your photographs as JPEGs, and spreadsheets for reading.</li>
      <li>Sync stores the same log on the server, sealed with a key only you hold.</li>
      <li>This page is for anyone who wants to read their data without the app, or check what the app does with it. The words it uses are in the <a href="/about/how#glossary">glossary</a>.</li>
    </ul>
    <nav class="toc" aria-label="On this page">
      <a href="#log">The change log</a> · <a href="#fields">The fields</a> · <a href="#backup">The backup file</a> · <a href="#sync">Sync</a> · <a href="#clock">Clocks</a> · <a href="#snapshot">On the device</a> · <a href="#sample">The example collection</a> · <a href="#endpoints">Endpoints and limits</a> · <a href="#server-sees">What the server sees</a> · <a href="#privacy">Reference lookups</a> · <a href="#search">Search</a> · <a href="#import">Import and exports</a> · <a href="#dossier">A species dossier</a> · <a href="#corpus-files">The reference's files</a>
    </nav>
  </section>

  <!-- ─────────────────────────── The change log ─────────────────────────── -->
  <section aria-labelledby="log">
  <h2 id="log">The change log</h2>
  <p class="sum">A collection is a list of changes, each setting one field of one record. To read it, apply the changes in order of their stamps, the latest winning each field. The result is the same whatever order they arrived in.</p>
  <p>Each change sets one field of one record:</p>
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre tabindex="0" role="region" aria-label="An example change"><code>{`{ "t": "1789520000000-0001-a7f3c2c9d1e4x0z9", "kind": "accession", "id": "rmu3e054w01a7f3c2c9d1e4x0z9", "field": "notes", "value": "sulked all summer" }`}</code></pre>
  <h3 id="stamp">The stamp</h3>
  <ul class="rules">
    <li><code>t</code> is a hybrid logical clock in three parts. First the wall time: 13 digits of milliseconds.</li>
    <li>Then a hex counter of four digits, or six: past 65,535 changes in one millisecond, or for an edit placed past another stamp, which sets the bit 0x800000 (<a href="#marked">below</a>).</li>
    <li>Then the writer: the 12-character id of the device that made the change, followed by a 4-character tag for the browser tab, 16 characters in all. Each tab of one device is its own clock. A change written by the app's own number repair has a writer starting <code>zz</code>.</li>
    <li>Stamps order by wall time, then counter value, then writer.</li>
    <li>To find one device's changes, match the first 12 characters of the writer against the backup manifest's <code>device</code>, not the whole.</li>
    <li>A device follows a peer's clock only up to five minutes ahead of its own, so one phone set to the wrong year cannot become every device's clock.</li>
    <li><code>kind</code> is one of <code>accession</code>, <code>event</code>, <code>location</code>, <code>sowing</code>, <code>photo</code>, <code>taxon</code> and <code>setting</code>. A <code>sowing</code> is what the app calls a propagation batch, and a <code>location</code> is a space.</li>
    <li>A delete is a change setting <code>_deleted</code> to true. A later change to any other field of that record revives it.</li>
    <li>The fields <code>id</code>, <code>kind</code> and <code>_t</code> belong to the record and cannot be set by a change, nor can the names <code>*</code> and <code>_deleted=</code>.</li>
    <li>A change this version writes also carries its own <code>w</code>, beside <code>t</code>: the writing device's corrected clock when it wrote the change, in milliseconds since the epoch. It is not a field, so it is not a photograph's width <code>w</code>.</li>
    <li><code>w</code> is information only. No merge, hold or park reads it, and a log reads the same with it or without it.</li>
    <li>A stamp read from a clock already says when its change was made. A marked stamp says only where its change sits in the order. So wherever the app shows a change's time, a marked change is dated by its <code>w</code>.</li>
    <li>That covers the dates of a plant's earlier notes, the date of the number repair's note, and the time a photograph's removal is sent to the server with.</li>
    <li>A photograph's removal is dated by the earlier of its <code>w</code> and when this device first saw it, so a removal written by a clock running ahead is not held until that clock's time.</li>
    <li>A change written by an older version has no <code>w</code>, and is dated by its stamp.</li>
    <li>A <code>w</code> that is not a whole number of milliseconds from 2020-01-01 to the last date a Date can hold, or that is more than a day past its stamp's wall time, is left off and the change kept. Of two copies of one change, the earlier <code>w</code> is kept.</li>
  </ul>
  <h3 id="reading">Reading the log</h3>
  <ul class="rules">
    <li>To read a collection, sort the changes by <code>t</code> and apply them in order, keeping for each record and field the value with the greatest <code>t</code>. The app calls this folding the log.</li>
    <li>The result is the same whatever order the changes arrived in, and applying a change twice changes nothing.</li>
    <li>That is the merge rule; backup restore and sync both use it. A reader who wants the same collection must follow four refinements too.</li>
    <li>Two changes under one stamp, which a correct writer never makes, keep the one whose value sorts greater, and for a removal the removal.</li>
    <li>A record is live only while it has its required fields (a plant its name and status, a batch its count), so a record arriving field by field is shown only once whole.</li>
    <li>A record is removed if its latest removal is later than its latest edit to any other field, so an edit after a removal brings it back.</li>
    <li>The hold and park rules (<a href="#clock">below</a>) keep a change from a wrong clock out of the reading for a while, or for good.</li>
  </ul>
  <h3 id="ids">Records and numbers</h3>
  <ul class="rules">
    <li>Records are plain JSON with flat fields, keyed by an opaque identity, <code>id</code>, minted once on the device that made the record and never shown.</li>
    <li>An id is a kind prefix (<code>r</code> a plant, <code>s</code> a batch, <code>l</code> a space, <code>p</code> a photograph, <code>e</code> an event), then the minting stamp's wall time as exactly 8 base-36 digits, its counter in two or more base-36 digits, and the writer: <code>rmu3e054w01a7f3c2c9d1e4x0z9</code>.</li>
    <li>The app reads the time as the 8 characters after the prefix.</li>
    <li>A photograph made since October 2026 has 16 random base-36 characters after the time, in place of the counter and the writer, so its id cannot be guessed from the vault's listing.</li>
    <li>The number repair's note is the exception: its id is <code>e_</code> and a tag made from the record, the number it had and the number it gets. So two devices that renumber the same record write one note.</li>
    <li>The number a plant is known by is a field, <code>acc</code>, unique among live and dead plants and never reused. Two devices that make the same number offline end up with two plants under one number, never one plant made of both, until the grower renumbers one.</li>
    <li>A merge (a restore from a file, a sync pull) writes what arrived and nothing more, and never renumbers anything.</li>
    <li>Two records it leaves under one number are both listed. Each record's page names the other and says which would keep the number: the one recorded first, by its first stamp. Nothing is renumbered until the grower presses Renumber.</li>
    <li>The number Renumber gives is past every number the log has ever given a plant or batch, not only the numbers records hold now.</li>
    <li>Of two notes for one number renumbered two ways on two devices, the one whose new number the record holds is shown and the other hidden. A later renumbering that went on from it keeps it shown.</li>
    <li>Two notes an older version wrote for one renumbering (the same words) are shown as one line, the earliest dated. Removing it removes both, and Undo brings both back.</li>
    <li>While a number is shared, every link the app makes to either record is by its record id, not by the number. An address by the bare number (a typed one, an old bookmark) opens a chooser listing both.</li>
    <li>A removed plant or batch brought back (Undo, or Restore on its page) yields its number only to a record that reached this device while it was removed, judged by the order in which changes arrived here and never by two devices' clocks, whenever that record was made; the one coming back then takes the next free number.</li>
    <li>It takes it with a note saying so, and the other keeps its number and its printed label.</li>
    <li>A change stored before this device kept that order (an older version did not) has no place in it, and a removal of that age comes before anything that has one.</li>
    <li>When neither the removal nor the other record has a place, which came first is not known: the record that stayed keeps the number, since its label is the one likely printed, and the one coming back takes the next free number, with a note and a message saying the order is not known.</li>
    <li>A replace from a backup is the same: the file carries no order of arrival, so the changes it wrote have no place in it, and a change that arrives after the replace comes after them all.</li>
    <li>A Replace writes into the new log, as one setting record, the numbers this device had given that the file does not carry (<a href="#f-setting">below</a>), so a number given once is never given again.</li>
    <li>Opening the collection, or a sync run that brings nothing, reads the log and never writes to it.</li>
    <li>Nor does a page that reads the reference. A plant whose GBIF key the reference does not file its name under says so, and the key changes only when the grower takes the reference's.</li>
    <li>A change in the log that no version can read (a field the record owns, a kind it does not know) is skipped and counted, and the Backup page says how many. While there are any, no snapshot is written. Nothing that reaches the log by sync, a backup, a merge or an edit can be one.</li>
    <li>It stays in the log. A backup carries it apart, as it is, in <code>unreadable.json</code>. The restore preview, the sheets and sync's push leave it out, so every batch a device sends holds every change that can be read.</li>
    <li>A browser that refuses the collection's storage is said, not left opening.</li>
    <li>Sowings carry their batch number in <code>no</code>, as plants carry theirs in <code>acc</code>.</li>
    <li><b>Joins are by id, never by number.</b> An event's <code>acc</code> and a photo's <code>acc</code> hold the plant's record id (the <code>rmu3e…</code>, not the <code>2026-0001</code>). A sowing's own events (<code>germinate</code>, <code>potup</code>, <code>loss</code>) hold the sowing's record id; a photo of a batch carries it in <code>sowing</code>.</li>
    <li>To list a plant's events, take the plant's <code>id</code> and select the events whose <code>acc</code> equals it.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── The fields ─────────────────────────── -->
  <section aria-labelledby="fields">
  <h2 id="fields">The fields, by kind</h2>
  <p class="sum">Each kind of record has a fixed set of fields. Dates are written YYYY-MM-DD, temperatures in °C and sizes in millimetres, whatever the display. A field a record has never been given is absent.</p>
  <h3 id="f-accession">accession (a plant)</h3>
  <ul class="rules">
    <li><code>acc</code>: the plant number. <code>taxonName</code>, and <code>taxonKey</code>, the GBIF key. <code>nameAsReceived</code>: the name as it came, where the name filed differs.</li>
    <li><code>cultivar</code>, <code>nameKind</code> (species, cultivar or hybrid), and <code>parentage</code>: a cross's parents.</li>
    <li>A cultivar named under a genus alone ("Echeveria 'Lola'") is filed as a cultivar, its genus as the name and no reference key, and shown as "a cultivar, species not stated". A plant an older version filed that way, as a hybrid with no parentage, is read as written; its page offers to file it as a cultivar, species not stated, which writes the change and a note to the log.</li>
    <li><code>fieldNumber</code>, <code>provenance</code> (wild, f1, fn, veg, unknown), <code>status</code> (growing, archived, dead), and <code>locationId</code>, the space.</li>
    <li><code>acquired</code>: YYYY-MM-DD, or YYYY-MM or YYYY when an import read only a month or a year.</li>
    <li><code>sourceFrom</code>, <code>sourceRef</code>, <code>sourceForm</code>, <code>price</code> and <code>notes</code>.</li>
    <li><code>notesBase</code>: the stamp of the notes change the latest notes edit was made from. So an edit made in sight of a text is told from one made blind to it.</li>
    <li>A text an edit replaced blind stays in the log. The record's page reads it from there and shows it under the notes, on every device, writing nothing.</li>
    <li><code>sowingId</code>, and <code>cover</code>, a photo id.</li>
    <li><code>waterDays</code>: the plant's own watering rhythm, 1 to 365 days, over its space's. It does not take the plant out of its space's dry months.</li>
    <li><code>importKey</code>: the sheet line an import filed the plant from, as a 53-bit hash in base 36 after an "i". Nothing of the line's text is kept, and a plant not imported has none.</li>
    <li>The hash is of the line's fields as the import reads them through the column mapping: the name as read, Genus and Species joined; a date as read, or its text when not read; a number with its leading zeros dropped; a column no field takes left out.</li>
    <li>Each run of spaces is made one and the case folded, then "#" and the plant's place among the plants that line and its identical lines make.</li>
    <li><code>importKeyBare</code>: on a plant whose line had columns no field takes, the same key read without them, so a run of the sheet that has lost those columns finds the plant.</li>
  </ul>
  <h3 id="f-event">event</h3>
  <ul class="rules">
    <li><code>acc</code>: a record id, as above. <code>d</code>: YYYY-MM-DD; a plant's acquire line carries its date as read, so YYYY-MM or YYYY after an import.</li>
    <li><code>t</code> (acquire, repot, water, feed, treat, prune, flower, pollinate, seed, graft, measure, move, note, death, propagate, audit, germinate, potup, loss), and as the type needs: <code>note</code>, <code>cause</code>, <code>used</code>, and <code>followUp</code> in days.</li>
    <li><code>measures</code>: an object of named finite numbers: diam, h, spread, caudex and, on a repot line, pot, in millimetres whatever the display. Heads and leaves are counts.</li>
    <li><code>n</code>: a count: seedlings up so far, plants potted, plants lost. <code>plants</code>: on a potup line, the ids of the plants it made, so the line names them by their current numbers.</li>
    <li><code>auto</code>: true on a line the app wrote by itself, a rename's note or a move when a space is removed, which never counts as the plant being seen. A watering the grower started for a whole space, from Today or the space's page, is the grower's and counts.</li>
  </ul>
  <h3 id="f-photo">photo</h3>
  <ul class="rules">
    <li><code>acc</code> or <code>sowing</code>, <code>d</code>, <code>dFrom</code> (exif or added), <code>caption</code>, <code>w</code>, <code>h</code>, <code>bytes</code>, and <code>sha</code>, the SHA-256 of the full-size JPEG, in hex.</li>
    <li>Its pixels are stored separately under the same id, as the browser's own files. A browser that will not keep a file in its own database (Safari in a Private Browsing window) keeps the two JPEGs as plain bytes with their type instead. A backup carries them the same way.</li>
  </ul>
  <h3 id="f-location">location (a space)</h3>
  <ul class="rules">
    <li><code>name</code>, <code>parentId</code>, <code>type</code>, <code>indoor</code>, <code>floorC</code>, and <code>floorHeld</code>: true when the floor is a heater's set-point rather than what the space bottoms out at.</li>
    <li><code>ppfd</code>, <code>lightHours</code>, <code>lat</code>, <code>lon</code> and <code>altM</code>.</li>
    <li><code>waterDays</code>: water about every this many days, 1 to 365, which is what "due" means for the plants here. It is 21 when neither the plant nor any space above it sets one.</li>
    <li><code>dryMonths</code>: an array of months, 1 to 12, the plants here are kept dry and not due.</li>
    <li>Both are inherited down the tree when null, the nearest space that sets one deciding. So an empty list sets no dry months over a parent's.</li>
    <li><code>notes</code> and <code>sort</code>. Temperatures are stored in °C whatever the display.</li>
  </ul>
  <h3 id="f-sowing">sowing (a batch)</h3>
  <ul class="rules">
    <li><code>no</code>, <code>taxonName</code>, <code>taxonKey</code>, <code>cultivar</code>, <code>nameKind</code>, <code>parentage</code>, <code>method</code>, and <code>parentAcc</code>, a plant's record id.</li>
    <li><code>sown</code> (YYYY-MM-DD), <code>count</code>, <code>sourceFrom</code>, and <code>sourceRef</code>, the seller's lot.</li>
    <li><code>fieldNumber</code>: the collector's number, which the plants potted up inherit.</li>
    <li><code>provenance</code>, <code>medium</code>, <code>container</code>, <code>treatment</code>, <code>bottomHeatC</code>, <code>covered</code>, <code>locationId</code>, <code>status</code>, <code>notes</code> and <code>notesBase</code>.</li>
  </ul>
  <h3 id="f-taxon">taxon (a species you note or follow)</h3>
  <ul class="rules">
    <li>Keyed by the species' address, its name without a hybrid's sign, as the reference's addresses are: <code>aloe-nobilis</code> for Aloe × nobilis.</li>
    <li><code>name</code>: the species' name with a hybrid's sign. A record an older version wrote without it ("Aloe nobilis" for plants of Aloe × nobilis) is read as the plants' name, and is not written again.</li>
    <li><code>gbifKey</code>, <code>myNotes</code>, and <code>myNotesBase</code>: the base of the species' own notes, as a plant's notes have one; a text replaced blind is read from the log and shown under them. <code>followed</code>.</li>
  </ul>
  <h3 id="f-setting">setting</h3>
  <ul class="rules">
    <li>One record, id <code>numbering</code>, with <code>scheme</code>: the numbering scheme every device shares.</li>
    <li>And one record for each Replace, its id beginning <code>numbers-kept</code>, with <code>accession</code> and <code>sowing</code>: the plant and batch numbers this device had given that the file did not carry. So a number given once is never given again, and the log alone says so.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Backup ─────────────────────────── -->
  <section aria-labelledby="backup">
  <h2 id="backup">The backup file</h2>
  <p class="sum">A backup is an ordinary zip you can open anywhere. It holds the whole log, your photographs and three spreadsheets. Restoring it merges by the log's rule, so restoring an old file over a newer collection loses nothing.</p>
  <p><code>cultifolio-YYYY-MM-DD.cultifolio.zip</code>, an ordinary zip:</p>
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre tabindex="0" role="region" aria-label="What the backup file holds"><code>{`manifest.json        { format: "cultifolio-backup", v: 1, exported: <ISO time>, device, app,
                       counts: { changes, accessions, events, locations, sowings, taxa, photos, photoBytes },
                       photosMissing: [ids of photo records whose pixels were not on the exporting device; absent when none],
                       parked: [stamps of the changes the exporting device had parked; absent when none] }
                       (photos counts the photographs actually in the file; the numbering scheme is a setting record in the log)
changes.json         a JSON array of changes, the whole log, as above
unreadable.json      the changes in the log this version cannot fold (a kind it does not know, a broken stamp, a field the record owns), as they are; absent when none
photos/<id>.jpg      full-size JPEG, long edge 1600 px
photos/<id>.t.jpg    320 px thumbnail
plants.csv           one row per plant, for a spreadsheet, with its record id in the last column; the import reads it back (the id and sowing columns are listed apart, and a line whose id names a plant here is that plant, left out)
batches.csv          one row per propagation batch, with its record id, its latest count, potted and lost figures (not for import)
events.csv           one row per timeline entry, oldest first, with the plant's or batch's record id, number and species (not for import)
device.json          the exporting device's settings { site: { lat, lon, name? } (as entered, not rounded), units, labels, prefs }; a restore applies each only where the device has none`}</code></pre>
  <ul class="rules">
    <li>The manifest's <code>v</code> is 3 when any change carries its recorded time (<code>w</code>), 2 when none does and the log holds a marked stamp, and 1 otherwise.</li>
    <li>A version that reads 1 and 2 would restore a version-3 file without those times, and one that reads only 1 would park what every later version shows. So each refuses a newer file with a sentence ("This backup was written by a newer Cultifolio") rather than restore it. This version reads all three.</li>
    <li>A change in either file that this version cannot read is named.</li>
    <li>A change in <code>unreadable.json</code> that this version reads is read as any other change.</li>
    <li>One it cannot read, but with a stamp, is kept as it is, appended to the log on a merge or a replace. The reading skips it and a later backup carries it again.</li>
    <li>Sync does not send such a change, since a device that cannot read it would set aside the bundle it came in, until a version that reads it opens here and sends it.</li>
    <li>One with no stamp, or with a value its field never takes, is left out, and a replace is refused, since it would lose it.</li>
    <li>A replace is refused too while this device holds a change this version cannot read that the file does not carry, since a replacement clears the device's log. A merge keeps it.</li>
    <li>A file none of whose changes can be read is refused.</li>
    <li>Restoring merges by the log rule, so restoring an old file over a newer collection loses nothing, and restoring twice changes nothing.</li>
    <li>The changes the file names as parked are parked here too, before anything is read. A replace takes the file's parked set in place of the device's.</li>
    <li>While a replacement whose switch has begun is unfinished, nothing can be saved on the device, and Replace cannot start again, since it would delete the staged copy, the only one. The page that ran it says so and reloads.</li>
    <li>A copy that cannot finish when the collection opens (the device still full) leaves the collection open on what was copied so far, says why, and finishes at a later load when there is room. The other open tabs are then told, and reload onto it.</li>
    <li>One tab copies at a time. A Replace holds the browser's lock <code>cultifolio-replace</code> from its staging to the end of its switch. The other open tabs are told as the switch wipes the old log, and reload onto the new one.</li>
    <li>A tab that opens the collection while a switch is under way waits for it, says so, and opens on the finished copy.</li>
    <li>The switch replaces the log in one write, and deletes only the photographs the file does not hold before it copies the file's. So even two tabs running it at once, in a browser without Web Locks, lose nothing.</li>
    <li>A Replace, and a Merge into a device that held nothing, count as a backup taken that day, at once, and the backup page says it was a restore.</li>
    <li>A file names the app that wrote it. This version writes <code>cultifolio 3 (stored parks)</code> and lists only the parks its device stored.</li>
    <li>A version-1 file naming <code>cultifolio 3</code>, or no app, came from an older version, which also listed parks of its clock alone. Its list is read as parks all the same: that version judged by its clock alone only changes that reached it by sync, whose clock and arrival verdicts agree. Each is offered with Apply, which undoes a wrong one.</li>
    <li>In <code>device.json</code>, a site's name is read as Settings keeps one: control characters and runs of spaces become one space, and a name over 120 characters is cut at a word and marked.</li>
    <li>Only the zip is read.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Sync ─────────────────────────── -->
  <section aria-labelledby="sync">
  <h2 id="sync">Sync on the wire</h2>
  <p class="sum">Sync uploads your log in sealed batches, and your photographs sealed one by one. Only a device with your key can open them. The server sees names, sizes and times, never what is inside.</p>
  <h3 id="keys">The key, the token and the vault id</h3>
  <ul class="rules">
    <li>One vault key per person: 30 symbols from an alphabet without I, L, O, U, 0 or 1, in six groups of five.</li>
    <li>From it, HKDF-SHA-256 with salt <code>cultifolio-vault-v1</code> derives three 32-byte keys.</li>
    <li>The input is the 30 symbols upper-cased, with every character outside A–Z and 0–9 removed. Dashes, spaces, a line break, and the <code>cultifolio://vault?k=</code> prefix of the pairing link are all dropped, as the app does to whatever is typed or scanned. It is the UTF-8 bytes of that 30-character string, not a decoding of it.</li>
    <li>The three keys: an AES-256-GCM key (info <code>enc</code>); a 256-bit auth token (info <code>auth</code>, sent as 64 hex digits in a bearer header); and an HMAC-SHA-256 key for naming log batches (info <code>name</code>).</li>
    <li>A log batch here is what the sync page calls a sync bundle: one device's sealed bundle of changes.</li>
    <li>The vault id is 26 symbols made from SHA-256 of the string <code>id:</code> plus the token's 64 hex digits. Take the first 26 bytes of the digest and map each byte <i>b</i> to <code>ALPHABET[b mod 30]</code>, where the alphabet is <code>ABCDEFGHJKMNPQRSTVWXYZ23456789</code>, the key's 30 symbols in that order.</li>
    <li>It is not a base-32 encoding of the digest.</li>
    <li>The server stores SHA-256 of <code>token:</code> plus the token, and compares. At creation, the one moment it sees the token itself, it checks that the id is the one that token derives, so a vault cannot be made under a name its key would not produce.</li>
  </ul>
  <h3 id="sealed">Sealed blobs</h3>
  <ul class="rules">
    <li>A sealed blob is one version byte (1), a 12-byte IV, then AES-GCM ciphertext with its 128-bit tag appended, as WebCrypto does.</li>
    <li>Its associated data is the UTF-8 bytes of <code>vaultId|kind</code>, where kind is <code>log</code> or <code>photo</code>, so a blob cannot be replayed into another vault or as another kind.</li>
    <li>A photo's data also carries its id (<code>vaultId|photo|photoId</code>), so it cannot be handed out under another photo's id.</li>
    <li>A log batch's data carries its name on the server (<code>vaultId|log|batchName</code>, without <code>.bin</code>), so a log batch cannot be posted again under a fresh name and opened there. A blob opens under its own binding and no other.</li>
    <li>A log batch decrypts to <code>{`{ "v": 1, "device": "...", "changes": [...] }`}</code>. It is <code>"v": 2</code>, the same shape, when any of its changes carries the mark, or when it carries <code>"parked": [stamps]</code>: the stamps among its changes its sender holds as parked. This version reads both.</li>
    <li>An older version that writes log batches only as version 1 sets aside any log batch whose version is not 1, whole and under its name, for a later version to read. So a version that would read the mark as an ordinary counter, or would not read <code>parked</code>, waits rather than reading those changes differently.</li>
    <li>A log batch of a version this build does not know is set aside the same way.</li>
    <li>A change's <code>w</code> travels in the log batch as it is, with no new version: older versions keep a change's fields as they are, on the wire and in their own log.</li>
    <li>A log batch is stored at <code>vault/&lt;id&gt;/log/&lt;hour&gt;-0000-&lt;device&gt;-&lt;fingerprint&gt;.bin</code>. <code>&lt;hour&gt;</code> is the hour, in ms padded to 13 digits, of the log batch's last change; <code>&lt;device&gt;</code> the pushing device's 12-character id.</li>
    <li><code>&lt;fingerprint&gt;</code> is the first twelve hex digits of HMAC-SHA-256, under the naming key, of exactly the bytes <code>JSON.stringify(changes)</code> gives in JavaScript: no spaces, keys in the order each change carries them. A serialiser that adds spaces or sorts keys gives a different fingerprint.</li>
    <li>Every seal uses a fresh IV, so the same log batch pushed twice is different bytes under the same name.</li>
    <li>The pushing device sends the full fingerprint (<code>X-Batch-Plain</code>) and its id (<code>X-Device</code>), both required. When both match what the server kept with the first copy, it answers that the log batch is already there and stores nothing.</li>
    <li>Different bytes under a held name without that match are refused (409), so a name never stands for two contents.</li>
    <li>The fingerprint is keyed, so the server holds nothing it could test a guessed plaintext against.</li>
    <li>A log batch the device cannot open or check is set aside by name and reported, and does not stop the ones behind it.</li>
    <li>A log batch that cannot be stored on the device (a full phone) is not set aside: the sync stops with an error and fetches it again next time.</li>
    <li>Log batches are handed out in the order they <em>arrived</em> at the server, not in key order. A device that edited offline, and uploads after another device has pulled past that time, must still be found.</li>
    <li>So a client asks for everything since a server arrival time, re-reads a minute of overlap, and skips log batches it already holds. Within one sync it pages on the pair (arrival, key), so many log batches arriving in the same second cannot repeat.</li>
    <li>The changes inside carry the stamps that settle merges; arrival order only decides discovery.</li>
    <li>A photo decrypts to a 4-byte big-endian length, the full JPEG, then the thumbnail. It is stored at <code>vault/&lt;vaultId&gt;/photo/&lt;photoId&gt;.bin</code>, or, stored again after a removal, at a later generation of that name (<a href="#generations">below</a>).</li>
    <li>No log batch or photograph is ever written over; a photograph's pointer is. Nothing is deleted but a removed photograph's bytes, at a device's request, and bytes an upload cut off left unnamed.</li>
  </ul>

  <h3 id="clock">Clocks: held and parked changes</h3>
  <p class="sum">A device with a wrong clock could win every field it touches. So a change from the future waits until its time comes, and one from a clock that was badly wrong is parked until you apply it. A device also corrects its own clock by the sync server's.</p>
  <ul class="rules">
    <li>A change stamped more than five minutes ahead of the receiving device's clock (a peer's, or one in a restored file) is stored but held out of the merge until that clock reaches it, and the plants list and Today say how many are waiting. Otherwise one fast phone would win every field it touched on every device.</li>
    <li>That clock is the device's corrected by the server's: every sync answer carries a <code>Date</code> header, and a device whose clock disagrees with it by more than half a minute stamps its changes, dates its events and judges its holds by the server's time instead.</li>
    <li>A correction of two days or more is taken only when two readings from two sync runs, a minute or more apart, agree. So one wrong answer cannot move a clock by years.</li>
    <li>The correction is kept in the browser's storage (<code>localStorage</code>, under <code>cultifolio.clockOffsetMs</code>), is shared with the device's other tabs, and is cleared by Stop syncing.</li>
    <li>No amount of time passing drops it: a slow clock does not catch up by waiting.</li>
    <li>Within an open page the device clock is read against the browser's monotonic clock. A move of more than half a minute between the two is a move of the device clock.</li>
    <li>A move back (the clock set back, by hand or by a time sync) first undoes the moves forward kept since the last reading, as far as they go: the clock set forward by mistake and put back.</li>
    <li>Beyond that, it is followed only as far as a negative correction says the clock was fast. The correction shrinks by the move, so a fast clock set right needs no reading.</li>
    <li>A move back further still is kept, not followed. Nothing says the clock was that far fast, and a clock left slow stamps behind, which parks nothing.</li>
    <li>A move forward by about a positive correction is a slow clock set right, and is followed the same way.</li>
    <li>Any other move forward is a sleep (some platforms pause the monotonic clock while the device sleeps) or the clock set forward. The two cannot be told apart, so the correction is kept.</li>
    <li>The move is added to the moves forward kept since the last reading, which are stored with the correction, so a reload and the device's other tabs undo them too. Kept, a clock set forward stamps ahead by the move, and by any positive correction besides, until a reading.</li>
    <li>After any such move, and at every page load, the correction is kept but unconfirmed, and a reading is asked for at once.</li>
    <li>A reading that agrees with it to within half a minute confirms it, and the log is not read again unless the clock had not counted as confirmed before. One that disagrees replaces it, and the log is read once.</li>
    <li>At a page load after the device clock has moved at least the correction since the reading that confirmed it, a positive correction of more than a day is not in force until a reading confirms it. A slow clock set right moves so, and so does a move forward past the correction.</li>
    <li>A load before that keeps it in force. Until the reading the device stamps by its own clock, with one new reading of the log when it comes. So an edit made offline after a slow clock was set right lands behind, which parks nothing.</li>
    <li>A page loaded that long after the reading waits even while another tab of this browser holds the correction in force. That tab writes the correction only at a reading or a move of the clock, so it cannot vouch for it.</li>
    <li>Until its own reading such a page stamps by the device's clock, and an edit made in it offline can lose to another device's edit made before it and not yet seen.</li>
    <li>Meanwhile the clock does not count as confirmed, so another device's change far past it is held, never parked.</li>
    <li>An edit made in sight of a field is placed past the field's newest stamp, a held change included. A removal is placed past the newest held edit to any field of its record, and an edit past a held removal of its record. Each goes up to a day past the device's clock plus the stored correction.</li>
    <li>A reading that disagrees, or a move of the clock shorter than the correction (a sleep), never takes a confirmed correction out of force.</li>
    <li>A page's wait from its own load is its own. It never takes the correction out of force in another tab, and it ends at a reading, or when another tab with the correction in force writes it.</li>
    <li>Being unconfirmed changes nothing else. Changes are stamped and dates read by the correction in force, and holds are judged by it. This device's own changes are never held or parked by its own clock.</li>
    <li>Offline, a slow device whose clock was set right, and whose page was reloaded before any reading, stamps its edits by the old correction until the first reading, when that correction was a day or less; one of more than a day is not in force until a reading.</li>
    <li>Those edits are then stamped by the device's own clock, and park nothing.</li>
    <li>A device still slow then stamps behind until the reading. An edit made in sight of a field is placed past the field's newest stamp, another device's held change included, and a removal past another device's held edit to the record, so each still wins once the reading comes.</li>
    <li>A first reading that disagrees with the clock in force by more than two days stops it counting as confirmed until a second reading agrees. The correction stays in force and stored meanwhile, so every open tab stamps alike.</li>
    <li>A page loaded meanwhile holds a positive correction of more than a day out of force until its own reading, since no reading confirms it then.</li>
    <li>What is kept: the correction, the device's and the server's time of the reading, whether a reading has met it since the last move or load, and the moves forward kept since the last reading.</li>
    <li>A reading is trusted only while it is under a week old and not dated more than five minutes after the device's own clock. Five minutes of slack cover the reading's rounding and a clock nudged back by a time sync. A reading further in the future means the clock was set back since, so it confirms nothing, and at a page load its correction is not used.</li>
    <li>A correction whose last reading is older than a week stays in force, but no change is parked by it alone.</li>
    <li>A change stamped more than two days past the arrival of the log batch that carried it is parked, on every device including the one that made it, and listed with Apply. It is a broken clock's, kept in the log and never read on its own. The record it belongs to offers to apply it as an edit made now, so every device takes it.</li>
    <li>Each device lists the vault, so it learns when its own log batches arrived, and judges its own changes by that arrival as it judges a peer's. A log batch of its own that may hold such a stamp is fetched again to be judged. A device that synced before this rule lists the vault from the start once.</li>
    <li>A change this device made is never held, and is judged once its log batch is listed.</li>
    <li>No device keeps a verdict of its own clock alone. Another device's change with no arrival to judge it by (one read from a file) is held as a peer's is, or, against a clock a sync server has confirmed, parked for that load only and judged again at the next.</li>
    <li>A change read from a file is parked for good only if the file names it as parked.</li>
  </ul>
  <h3 id="marked">Marked stamps</h3>
  <ul class="rules">
    <li>An edit always wins: it is stamped just past the field's current stamp, however far ahead that stamp is. Such a stamp carries a mark in its counter, the bit 0x800000, saying it was placed after the field's stamp and not read from a clock.</li>
    <li>A marked stamp is never held or parked, on any device. So an edit made after a clock was put right shows everywhere, and a later edit anywhere is placed past it in turn.</li>
    <li>A field, and a record's removal, are ordered by a marked stamp's place, just past the far stamp it was placed after, until real time reaches that stamp.</li>
    <li>An edit or a removal made later elsewhere, on a device that had not yet seen the marked edit, sorts before it, even one made on a right clock. So every device shows the marked edit alike; it resolves by the stamps, not by when each was made.</li>
    <li>The mark says how a stamp was made, and nothing checks it: it is trusted as the key is.</li>
    <li>A device holding the vault key that marks a far stamp read from its own clock escapes the hold and the park. It wins the fields it touches until real time reaches the stamp, and raises no clock line; every later edit is placed past it in turn.</li>
    <li>An older version from before the mark parks such a stamp. A log batch carrying one is version 2, which that version sets aside.</li>
    <li>A number repair past a marked stamp is placed past it with the mark too.</li>
    <li>A device still on an older version that renumbers the same plant places its own repair just past that stamp without the mark. When the stamp is a broken clock's, far ahead, this version parks that repair, and leaving it parked keeps one renumbering and one note.</li>
    <li>No clock counts onto the mark: a counter one short of it moves to the next millisecond, its own or one it follows.</li>
    <li>Each change this version writes carries the time it was made beside its stamp (<code>w</code>), so the app dates a marked change by when it was made. The order is still the stamps'.</li>
    <li>That a device holding the key can mark any change is not a gap to close. A device holding the key already holds the whole collection, and can write any change to it.</li>
    <li>A device whose clock was a few days fast, offline for a month and then put right, sends its last days of stamps less than two days ahead. Its peers hold them rather than park them.</li>
    <li>A peer's edit to one of those fields, made meanwhile, shows until the held change comes due, and is then replaced by the older edit, with no notice. Every device ends the same.</li>
    <li>Two words for the two states. A <b>held</b> change waits for the clock to reach its stamp, then is read by itself. A <b>parked</b> change stays in the log and is never read unless the grower applies it.</li>
    <li>A held change that an edit here has since been stamped past will never show, and is not counted as waiting.</li>
    <li>A parked change that an edit was since stamped past is no longer offered with Apply. Apply takes a record's latest parked removal or restore, by its stamp, and on a restore brings the record back.</li>
    <li>A new vault is sent the parked changes too, with their verdict. The log batch lists them under <code>parked</code>, and a device reading it stores them as parked before it reads the rest, as it does a file's. Judged by the new vault's arrival alone, a change parked long ago would no longer be far ahead, and would be read there.</li>
    <li>Apply sends one as an edit made now. "Apply all from this device" on the Sync page applies this device's own parked changes at once; a peer's are left for the grower to judge one by one.</li>
    <li>A device whose clock reads earlier than its own latest change says so on its clock line. That acts on nothing, and edits still save and show.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── On the device ─────────────────────────── -->
  <section aria-labelledby="snapshot">
  <h2 id="snapshot">On the device</h2>
  <p class="sum">The device keeps the log, and a snapshot of its last reading so a page opens quickly. The snapshot is only a cache: dropping it never changes what you see. A backup and a sync carry the log, never the snapshot.</p>
  <ul class="rules">
    <li>The log is kept as an IndexedDB store of changes keyed by <code>t</code>, with an outbox of the stamps the server has not acknowledged (none in the example) and the order the changes arrived in, a numbered row per change stored.</li>
    <li>A photograph's pixels that nothing names are deleted from the device a few seconds after a page opens the collection, and after a Merge, with sync on or off. Those are the pixels of a photograph whose record is removed, and those with no change under their id two days after the time the id carries.</li>
    <li>The state the pages read is a reading of the log. The device keeps the last reading as a snapshot beside it, with the arrival number it was taken at, so a load reads the snapshot and the changes that arrived after it, not the whole log again.</li>
    <li>A fresh snapshot is written after a load that read the whole log, after one that read 1,000 changes or more on top of it, after an import, after a merge from a backup, and after the example is set out. The changes after it are read in one range read of the log.</li>
    <li>The example collection's database keeps no outbox, since it is never synced.</li>
    <li>The snapshot is only ever a cache of the log. It is dropped, in the same transaction, whenever the log is replaced from a file, a stored change is displaced by one that ranks higher under its stamp, or a change is parked on its arrival.</li>
    <li>A change the reading parks itself is parked by every reading of the same log, so the snapshot stands.</li>
    <li>A load that finds the log changed between reading the snapshot and reading what followed it reads the log instead.</li>
    <li>The snapshot is not read when it was built under other reading rules; a deploy that leaves the rules as they were keeps it. Nor when it was built by another device, or under another stored clock correction, or with that correction confirmed by a reading where it is now not, or the reverse.</li>
    <li>Nor when it read a change from another device that the clock in force now would hold. A page load holds a correction of more than a day out of force until a reading, so a snapshot written while it was in force is read by that load only when nothing it read is past that load's clock.</li>
    <li>Dropping the snapshot never changes what a page shows.</li>
    <li>What the snapshot did not read it names, every stamp. The held changes are judged again at each load and read as they come due, and the parked ones are read back so their Apply stands.</li>
    <li>A backup carries the log, never the snapshot; a sync sends the log, never the snapshot. A device with no snapshot reads the log and is the same collection.</li>
    <li>The database is at version 4. Opening it at a newer version tells a tab still running an older version of the app, which lets go of it once its writes in flight have landed and reloads into the newer one. So a tab left open across an update does not go on writing beside it.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── The example ─────────────────────────── -->
  <section aria-labelledby="sample">
  <h2 id="sample">The example collection</h2>
  <p class="sum">The example collection is a database of its own, kept apart from yours. Nothing of it reaches your log, a backup or sync, and leaving it deletes it. It opens only from its own button, never from a link.</p>
  <ul class="rules">
    <li>The example collection (the sample, in the code) is IndexedDB <code>cultifolio-demo</code>, beside the grower's <code>cultifolio</code>. A flag in this tab's session storage (<code>cultifolio.demo</code>) chooses it when a page loads, so entering or leaving it reloads the page.</li>
    <li>Which collection a page shows is decided once, as it loads. Its settings, the "keep data" question, sync and the front page's hint all read that decision, never the flag as it is later.</li>
    <li>A device's own collection is empty when its log holds nothing at all: no plant, removed or not, nothing in Propagation, no species followed or noted, no space and no numbering scheme.</li>
    <li>It also has no frost site, no change waiting for this device's date or parked, no replacement waiting to finish, no change this version could not read, and no sync set up. This is read once the collection and the sync key have been read.</li>
    <li>On such a device, Today, My spaces and Propagation show their own empty state with one button under it, Show the example collection, which opens it on the same page. One sentence beside it says it is a sample kept apart from your own collection, which you can close at any time.</li>
    <li>My plants, while it lists no plant, has the same button and sentence at its head, whatever else the collection holds.</li>
    <li>Nothing opens it by itself: arriving on a page, by a tab, a link or its address, never does.</li>
    <li>The button goes to its page at an address that says so: <code>?enter=</code> and a one-use token the button writes in the tab's session storage, <code>cultifolio.sampleEntering</code>.</li>
    <li>That page's first script sets the flag only when the token matches the one written in that same tab, taking the token off as it reads it, and the page then takes it off the address. So a copied link, a bookmark, the history or another tab's address opens nothing.</li>
    <li>While it loads the page says "Opening the example collection". A load into it that a page calls off (a "Leave site?" answered Cancel) leaves the tab outside it, however soon the page is reloaded after, since nothing but the token was written.</li>
    <li>In a tab whose session storage refuses the token, the button says so.</li>
    <li>On a device with a collection of its own, Today, My spaces and Propagation show their usual empty state alone.</li>
    <li>Nothing opens it while a restore, a merge, an import or a sync is in progress on the device; a button pressed then says why.</li>
    <li>Anyone can open it from the menu, a grower with plants too. The menu moves to Today first, so a page with something typed on it asks before it is left. Their own collection is left as it is, and Leave returns to it.</li>
    <li>Leave goes to the front page, and Add your first plant (offered to a visitor) to the add form, both in your own collection, never back to the page that opened the example. Both ask first when you added or changed records in it.</li>
    <li>So does every other way to add something of your own from inside the example (the top bar's +, Add one to my plants, New space, starting a propagation, Import). It leaves the example first, for the same page in your own collection.</li>
    <li>An add form reached inside the example says that what is added there joins the example and is deleted with it.</li>
    <li>Keep it as my own leaves for the same form in your own collection, with everything typed on it. That is every field (on the propagation form, all but the parent plant, which is the example's), kept for that one move in the tab's session storage, read once by the form and taken off. Nothing typed goes in the address.</li>
    <li>The space goes by its name and kind, with the name and kind of the space it sits inside. Your own space of that name is picked; otherwise the space picker's New… opens with it filled in, inside your own space of the containing space's name, or at the top level with a line saying where it was.</li>
    <li>The form's own "Leave site?" is not asked then.</li>
    <li>When the tab's storage refuses to keep what was typed, Keep it as my own does not leave the example. It says so, and the form stays as it was.</li>
    <li>The example's bar says that nothing added in it is kept. While a page shows the example, its top bar says Example.</li>
    <li>Nothing of the example reaches the grower's own log, settings, a backup or sync, and leaving it deletes its database whole.</li>
    <li>Leave goes to your own collection first, at an address that says so: <code>?left=</code> and a one-use token Leave writes in the tab's session storage, read by the page's first script and then taken off the address. The first page there deletes the example, once every other example tab has let it go.</li>
    <li>The address takes a tab out of the example, and marks the example for deletion only when its token matches the one Leave wrote in that same tab. So a copied link, a bookmark, the history or another tab's address deletes nothing.</li>
    <li>A page that asks "Leave site?" (an unsaved form) and is answered Cancel stays a working example tab, and that Leave is called off. A later reload or closing the tab keeps the example, and the Leave button comes back.</li>
    <li>When you added or changed records in the example, Leave says how many and asks first. A deletion held up because another tab still has the example open is said, and finishes when that tab closes.</li>
    <li>Its settings are its own, and no cookie is written from it. In the example, units, the label sheet, preferences, the site, the last spaces chosen, the species compared and the plants picked for labels are kept for that tab only, in its session storage under <code>cultifolio.demo.</code> and the key's name.</li>
    <li>Those keys are <code>cultifolio.demo.units</code>, <code>cultifolio.demo.labels</code>, <code>cultifolio.demo.prefs</code>, <code>cultifolio.demo.frost.site</code>, <code>cultifolio.demo.theme</code>, <code>cultifolio.demo.lastLocation</code>, <code>cultifolio.demo.lastSowLocation</code>, <code>cultifolio.demo.countMode</code>, <code>cultifolio.demo.compare</code> and <code>cultifolio.demo.labelsPicked</code>.</li>
    <li>Settings, Sync and Backup are shut there. A restore refuses to start in it, and so does sync, in the code and not only on the page.</li>
    <li>It offers no watering calendar file and no spreadsheet of its plants. Where a page says how your collection is kept (Today, My plants), the example says it is kept nowhere and is deleted when you leave it.</li>
    <li>Its frost watch says it has no site of its own (none is made up for it), and that yours is set on Today or in Settings once you leave.</li>
    <li>It is set out in one commit (one transaction of the database, holding every change of the example), by one tab at a time. The tab holds a browser lock named <code>cultifolio-sample-seed</code>; without these locks, a claim in its own database that lapses after a minute and that only the tab holding it clears.</li>
    <li>The commit is refused, setting out nothing, when the example already holds a seed's mark, when its log already holds anything of yours (read in that same transaction), or, without the locks, when the claim is no longer that tab's.</li>
    <li>An example that already holds records of yours is not set out over, and its bar says so.</li>
    <li>That same commit marks it as set out and notes the arrival number of its own last record (<code>demoSeeded</code> and <code>demoSeedSeq</code> in its database). What arrives after that number is yours, and is what Leave counts.</li>
    <li>A page reloaded while it is being set out sets it out again. A change that fails leaves it to be set out on the next load. An example whose marks are missing (set out by an older version) is marked from its own records and never set out twice.</li>
    <li>Each tab in the example holds a browser lock named <code>cultifolio-sample-open</code>, taken by the first script of each of its pages before anything else runs, so a tab that is only reloading still holds it.</li>
    <li>A page outside the example deletes an example database that no tab holds and that holds nothing you added or changed. So one left by a tab closed without leaving does not come back stale.</li>
    <li>One that holds records of yours is kept, and offered back on each page until it is answered: "You left an example collection with 3 records you added or changed there", with Open it, Delete it and Not now.</li>
    <li>Not now is noted in its database as <code>demoOfferedSeq</code>, and it is not offered again until it changes. One in which nothing has changed for 30 days is deleted, answered or not.</li>
    <li>A browser without these locks cannot tell an open example from a left one, so there the leftover is kept rather than risk deleting one open in another tab.</li>
    <li>Leaving tells the example's other tabs, on a channel named <code>cultifolio-sample</code>, and they go to your own collection and say why. A tab that learns it from the database instead does the same.</li>
    <li>Every Leave that is not called off, and every deletion of the example, also writes a new generation to local storage (<code>cultifolio.sampleGen</code>).</li>
    <li>A tab that was away when another left (another site in it, a page kept in the browser's history, a tab the browser put away) compares it with the one it opened the example under. It opens your own collection on its next load, saying why.</li>
    <li>From that moment such a tab saves nothing more and never opens the example's database again. A page with something typed on it is not sent away: it stays as drawn, with what was typed still there to copy and a sentence saying why nothing more is saved, and its next page is your own collection.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Endpoints ─────────────────────────── -->
  <section aria-labelledby="endpoints">
  <h2 id="endpoints">Endpoints and limits</h2>
  <p class="sum">These are the sync server's addresses, and the limits it keeps so one visitor cannot fill it. Every refusal says why, and the device waits it out without losing a change. Receiving goes on while sending waits.</p>
  <ul class="rules">
    <li><code>POST /api/sync/vault</code> with <code>{`{ id, token, create }`}</code>.</li>
    <li><code>GET /api/sync/log?vault=&amp;since=&lt;ms&gt;</code> returns <code>{`{ batches: [{ key, at }], more, next?: { at, key } }`}</code>. The next page is <code>&amp;after=&lt;at&gt;:&lt;key&gt;</code>.</li>
    <li><code>POST /api/sync/log?vault=</code> with headers <code>X-Batch</code>, <code>X-Batch-Plain</code> and <code>X-Device</code>.</li>
    <li><code>GET /api/sync/log/&lt;hour&gt;-0000-&lt;device&gt;-&lt;fingerprint&gt;?vault=</code>: the log batch's name, as above, without the <code>.bin</code>.</li>
    <li><code>PUT|GET|HEAD|DELETE /api/sync/photo/&lt;id&gt;?vault=</code>. A DELETE comes from a device that has read the photograph's removal, ten minutes on, asking for its bytes to go. They come off the vault's count, and a 404 is taken as done.</li>
    <li>The PUT carries <code>X-Photo-Drop</code>: the HMAC-SHA-256 of <code>drop:&lt;id&gt;</code> under the vault's naming key, which the server keeps with the object. The DELETE must repeat it, or is refused with 403. So the token alone can add to a vault and never destroy in it.</li>
    <li>All but creation take <code>Authorization: Bearer &lt;token&gt;</code>. Every request the sync engine sends carries <code>X-Cultifolio-Sync: 1</code>.</li>
    <li>A write with <code>Origin: null</code> and no <code>Sec-Fetch-Site</code> is taken as the site's own only when it carries that header. That is what a browser from before <code>Sec-Fetch-Site</code> (Safari before 16.4) sends for this site's own requests, under its no-referrer policy. Any other write that names another site is refused (403).</li>
    <li>A page on another site cannot send the header without asking first, and this site never says yes.</li>
    <li>A body larger than the limit is 413. A vault with no room left (2 GB) is 507 with <code>{`{ error: "vault full", bytes, limit }`}</code>, and the device stops sending and says so rather than splitting the log batch.</li>
    <li>A log batch the server refuses (400, 409 or 413) is halved down to the changes at fault. Those stay in the device's log and outbox, are said on the Sync page apart from what waits to be sent, and are sent again a day after the refusal, not at every run.</li>
    <li>A refusal the sync code makes itself is JSON with an <code>error</code>. One the framework makes (a bad vault id, a missing token, a body past the limit) is JSON with a <code>message</code>. A fetch of a log batch or photograph that is not there is a plain-text 404. The device shows whichever of the two fields the body carries.</li>
  </ul>
  <h3 id="limits">Limits for one address</h3>
  <ul class="rules">
    <li>One address (an IPv4 address, or an IPv6 /64) is bounded per day: 5 new vaults and 3 GB stored.</li>
    <li>It is bounded per ten minutes: 600 requests to open, list and push, and 3,000 to fetch or store single log batches and photographs.</li>
    <li>Past any of these the answer is 429 with <code>Retry-After</code> in seconds; for the new vaults and the bytes of a day, to midnight UTC. The sync page says the server refused, with the reason it gives.</li>
    <li>Any 429 is waited out until its <code>Retry-After</code>, ten minutes at most on a listing or a fetch.</li>
    <li>A 429 to an upload asking a minute or more is kept with the vault's sync state, so a reload or another tab waits too. It waits until its <code>Retry-After</code> or within the hour, whichever comes first, and for the bytes of a day until the time the server gives, a day at most.</li>
    <li>Meanwhile nothing more is uploaded. Under the bytes of a day only photographs and log batches over 16 KB wait, and a smaller log batch, which the day does not count, still goes.</li>
    <li>A shorter refusal met by such a log batch (a 503, or a request window's 429) leaves the day's wait standing and is kept beside it. So no log batch is sent, by any tab or after a reload, until it ends.</li>
    <li>A photograph that does not finish uploading within three minutes waits two minutes, then four, eight and sixteen at most after each such photograph in a row. Records still go, and changes from other devices still come in. Receiving goes on.</li>
    <li>A log batch of 16 KB or less is not counted against the address's or the /48's bytes of the day, only against its vault.</li>
    <li>For an IPv6 address the /48 around it is counted as well: 20 new vaults a day (past that, 429 to midnight UTC with "too many new vaults from this network today").</li>
    <li>And 12 GB stored a day (past that, 429 to midnight UTC with "the upload allowance for this network is used up for today"), kept by the counter object. The /48's requests for opening, listing and pushing, for single log batches and photographs, and for the reference's index and sheets are counted too.</li>
    <li>For an IPv4 address the /24 around it is counted for the requests for opening, listing and pushing, for single log batches and photographs, and for the index, at four times one address's allowance, as a /48's are. Past that, 429 with "too many requests from this network".</li>
  </ul>
  <h3 id="places">Vaults for everyone</h3>
  <ul class="rules">
    <li>New vaults are bounded for everyone too.</li>
    <li>A new vault takes its place among the day's new vaults and the vaults in all (200 a day and 2,000 in all by default; a deployment may set others in the Worker's variables <code>SYNC_VAULTS_PER_DAY</code> and <code>SYNC_VAULTS_MAX</code>, so this site's may be higher) when its first log batch or photograph is stored.</li>
    <li>It takes none when it is made, so a vault made and never used takes neither.</li>
    <li>A vault keeps its place while it is used. If its first upload does not land, the place is given back, unless another upload of it is still landing.</li>
    <li>A vault with no upload for 90 days gives its place back at the next midnight UTC. The server first writes the time into the vault's own record (<code>reclaimedAt</code> in its <code>meta.json</code>), then gives the place back.</li>
    <li>Nothing the vault holds is touched, and every device can still read it, but reading keeps no place.</li>
    <li>Its next upload takes a place again among the vaults in all, not among the day's new vaults, and only once that place is checked. If the counters cannot be read, the upload is refused with 503 and <code>Retry-After: 60</code>.</li>
    <li>If no place is free, it is refused with 503, <code>Retry-After: 3600</code> and a sentence that says so ("Sync is full for now. This vault had no upload for 90 days, so its place was given back. …").</li>
    <li>A vault made by an older version of the server, with no place recorded, is recorded at its next upload and not counted again.</li>
    <li>When the day's places are taken, a vault that holds nothing yet has its uploads refused until midnight UTC.</li>
    <li>A network (the IPv4 /24 or IPv6 /48 around the uploading address) may take 10 of the day's places. Past that its empty vaults are refused until midnight UTC too, with "Sync has taken all the new vaults it takes from this network today…". When the places in all are taken, they are refused until more are added.</li>
    <li>Past either ceiling the answer is 503 with <code>Retry-After</code> and a sentence the sync page shows.</li>
    <li>Joining a vault never takes a place. A joined vault that holds nothing yet is counted at its first upload like any other.</li>
    <li>A device given that answer keeps receiving, sends nothing more until the <code>Retry-After</code> has passed or within the hour, whichever comes first, and shows the server's own sentence. The refusal is kept with the vault's sync state, so a reload or another tab waits too.</li>
    <li>A 503 asking for less than a minute (a photograph another device is storing, a count that crossed an upload) is not kept: the device tries again then.</li>
    <li>A photograph another device is storing or removing is answered with <code>Retry-After: 10</code>, whatever is left of that device's hold, so one photograph never holds up the vault's other uploads.</li>
    <li>A 503 with no <code>Retry-After</code> is taken as five minutes and kept like any other refusal, as "The sync server is not taking uploads from this vault just now." when it carries no sentence.</li>
    <li>An upload that would make a vault's first object is 503 too, with <code>Retry-After: 60</code>, when the counters cannot be read at all. An uncounted vault is one the ceilings never saw, so it is refused rather than stored ("The site could not count this vault just now; try again in a minute.").</li>
  </ul>
  <h3 id="hourly">Hourly limits for one vault</h3>
  <ul class="rules">
    <li>A listing of a vault holding more log batches than one listing can walk is 503. So is a listing past the vault's hour of listings: 1,200 pages of a thousand log batches in any sixty minutes.</li>
    <li>Listings are counted in the vault's counter object by the minute each is asked. Each listing's most pages, 50, are counted when it is asked, and what it did not use is given back, so listings under way at once count too.</li>
    <li>The server finishes a listing, and settles it, even when the device has gone. A reservation not settled within a minute, as when the server itself stops partway, lapses. No sixty minutes hold more than 1,249 pages of listings that settle.</li>
    <li>The refusal carries <code>Retry-After</code> to when enough of the oldest pages have left the count, 61 minutes at most, and "Receiving is refused for now: …".</li>
    <li>The device keeps a wait of a minute or more in its sync record (an hour at most), so no tab of it and no reload lists again before then. It receives again then, and its uploads go on meanwhile.</li>
    <li>A vault may take 3,600 log batches and 3,600 photographs in any sixty minutes, each counted apart in its counter object by the minute the upload is taken (an upload that then fails still counts).</li>
    <li>Past either, the next upload of that kind is answered 503 with <code>Retry-After</code> to when enough of the oldest have left the count, 61 minutes at most, and "Uploading is refused for now: …" or "Uploading photographs is refused for now: …".</li>
    <li>The device keeps every change and sends it then, keeps receiving meanwhile, and past the photographs' hour still sends its record changes.</li>
  </ul>
  <h3 id="counts">How bytes are counted</h3>
  <ul class="rules">
    <li>The byte counts live in a counter object (a Durable Object), one per vault and one per address. Each upload's bytes are checked against the allowance and taken in one step, so two uploads in the same instant cannot both pass on the same figure.</li>
    <li>An upload not yet written is held as a lease on its bytes, released when it lands or fails, and lapsing by itself after ten minutes. So an upload whose Worker stopped midway cannot hold its bytes for good.</li>
    <li>A removal is held the same way, with no bytes, from just before it deletes until its bytes are given back.</li>
    <li>A photograph being stored and a removal of the same photograph wait for each other: a 503 with a short wait, which the device retries.</li>
    <li>A removal made before an upload of that photograph claimed it leaves the photograph in place (409). The DELETE carries the removal's time in <code>X-Photo-Removed-At</code>.</li>
    <li>An upload claims a photograph's name for two days, and only an upload that carries the photograph's removal proof claims it, whatever it is answered: stored, already there, or 409 for different bytes, which is what an Undo sealed again sends. So a first upload that lands after another device removed the record is removed once its claim is two days old.</li>
    <li>An upload whose proof does not match is answered at once (200 for the same bytes, 409 for others, 403 for a removed photograph), and holds the photograph's name for no time at all, so it cannot keep a removal waiting.</li>
    <li>The proof is checked before anything else.</li>
    <li>A device answered 409 does not take the removal as done: it asks again at a later sync, at most once an hour. The time it was last answered is kept in the sync record, so a reload or another tab waits too. It asks until the server removes the bytes (a success or 404) or the photograph is live again.</li>
    <li>A 403 (a proof that does not match the upload's) is said once on the sync page and not asked again.</li>
    <li>A listing of the vault puts its total right once a day, on an open at most once an hour, and at the next request after an upload's lease lapsed, the open leases added to it.</li>
    <li>It is kept only if no upload landed and no removal was made while it was being taken, and none is still between the bucket and the count. While one is, no listing is made at all.</li>
    <li>After two tries that end that way, the request is answered 503 with <code>Retry-After: 30</code> and the device tries again; opening or joining a vault waits that out and asks again, at most twice. An open of a vault whose count was already put right that day answers that count.</li>
    <li>The midnight sweep gives places back a page at a time, each page and the lowered count of places in one step, so a sweep cut short loses no place.</li>
    <li>Without the counter object bound, KV keeps the counts by read and write, which bounds the totals but cannot make them exact. It counts a vault's place once, by a key of its own, and does not reclaim places.</li>
  </ul>
  <h3 id="generations">Photographs by generation</h3>
  <ul class="rules">
    <li>A photograph is stored by generation. Its first is at <code>vault/&lt;vaultId&gt;/photo/&lt;photoId&gt;.bin</code>.</li>
    <li>A photograph stored again after its removal is a new generation, at <code>vault/&lt;vaultId&gt;/photo/&lt;photoId&gt;.g</code> and base-36 digits. A pointer at <code>vault/&lt;vaultId&gt;/photoref/&lt;photoId&gt;.json</code> names it.</li>
    <li>The pointer is <code>{`{ g }`}</code>, the generation that holds it (<code>bin</code> for the first), or after a removal <code>{`{ g: null, drop, at, was }`}</code>, the removal's receipt: its proof, its time and the generation it removes. Each carries a random <code>n</code> that makes every write of it its own.</li>
    <li>A removal renews its hold, and moves the pointer to its receipt only if the pointer is still the one it read (the bucket's own conditional write). Only then does it delete the generation it looked at. So a removal that stalls anywhere can remove nothing but that generation.</li>
    <li>An upload with the proof that finds the photograph already there (a retry after a lost reply, or an Undo) moves the pointer too, naming the generation it found. So a removal that read the pointer before it, and stalled past its hold, finds it moved, removes nothing and is answered 409.</li>
    <li>If a stalled removal's pointer write lands first, the upload is asked to wait ten seconds, and then stores the photograph again as a new generation.</li>
    <li>A removal cut off after its receipt was written (the bucket's delete failed, or the server stopped) is finished when the device asks again. The receipt names the generation; a request with the removal's proof deletes it, gives its bytes back, and is answered as a removal made. So the 404 a device takes as done comes only when nothing is left.</li>
    <li>A photograph whose name holds a receipt is stored again only with the proof the receipt holds (403 otherwise). So the token alone cannot put back a copy of a removed photograph.</li>
    <li>Photographs stored before the server kept generations stay where they are, as their name's first generation. The pointers are not counted against the vault's 2 GB.</li>
    <li>Bytes that nothing names (an upload cut off between storing a new generation and naming it, or a generation a cut-off removal left behind) are removed once ten minutes old. That happens at the next touch of that photograph, or by the vault's own sweep, whichever comes first.</li>
    <li>A touch is its next removal by a device holding its proof, its next storing, or an upload that finds it already there.</li>
    <li>Before a removal moves a pointer, and before an upload stores a new generation of a removed photograph, the server marks that photograph in the vault's counter object. If it cannot, the request is answered 503 with <code>Retry-After: 10</code> and nothing is changed.</li>
    <li>At midnight UTC the vault's counter object looks at each photograph marked at least ten minutes before. It holds the photograph's name (an upload or a removal of it waits ten seconds meanwhile), reads its pointer, and lists its generations.</li>
    <li>It removes each generation the pointer does not name that is at least ten minutes old, giving its bytes back as a removal does.</li>
    <li>Before it removes any, it writes the pointer back as it read it, under the condition that it is still the one read. So an upload whose own pointer write stalled cannot land afterwards and name bytes that are gone. An upload or a removal that finds such bytes does the same, and an upload renews its hold just before its pointer write.</li>
    <li>The generations are listed a thousand at a time, at most five thousand at one look, and the mark stays until a listing that reached the end finds nothing unnamed. So a photograph with more is looked at again the next midnight.</li>
    <li>A photograph with a younger unnamed generation, or whose name is held, is looked at again the next midnight. The mark goes once nothing unnamed is left.</li>
    <li>A photograph the sweep cannot read (its pointer cannot be read, or the store fails for it) loses nothing: nothing of it is removed, and it is looked at again the next midnight.</li>
    <li>After seven such nights its mark is dropped, and the night is counted among the server's faults, by kind alone (Cloudflare's request logs are off, so no log keeps its name). Anything of it left unnamed goes at its next touch instead.</li>
    <li>A removal or an upload that cannot read the pointer is asked to wait ten seconds and ask again. It is never told the photograph is already gone, and never stores over it. A GET or HEAD of it is answered 503 with <code>Retry-After: 10</code>, never 404.</li>
    <li>The sweep looks at 100 photographs at a time and goes on a second later until none is left.</li>
    <li>A vault with no removal and no photograph stored again since its last sweep costs nothing; each marked photograph costs one read and one listing, once. Until then such bytes count against the vault's 2 GB.</li>
    <li>Without the counter object bound there is no sweep, and they go at the next touch.</li>
    <li>A removed object's bytes are given back once, under its name and version, however often the removal is asked for.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── What the server sees ─────────────────────────── -->
  <section aria-labelledby="server-sees">
  <h2 id="server-sees">What the server can see</h2>
  <p class="sum">The server holds sealed blobs it cannot open. It can see when and how often each device syncs, and how large things are. It cannot see a plant's name, a note, a space, a date or how many plants you have.</p>
  <ul class="rules">
    <li>It holds a vault id, a hash of the token, and sealed blobs, and it cannot open any of them.</li>
    <li>The blob names, sizes and arrival times are in the clear. A log batch is named by the hour and device id of its last change, and a photograph by the time of its creation (before October 2026, its device id too).</li>
    <li>A sealed photograph is its full JPEG, plus its 320-pixel thumbnail, plus 17 bytes (a 4-byte length, the version byte and the IV), plus the 16-byte tag.</li>
    <li>So the operator can count the devices in a vault, see to the hour when each one made changes and to the second when it synced, and count the log batches (roughly, how often changes are made) and the photographs. The operator can read their sizes, and see which photographs were removed or stored again.</li>
    <li>This is not zero-knowledge in the strict sense: the pattern of activity is visible, its content is not.</li>
    <li>Nothing about the plants themselves (names, notes, spaces, dates, the number of plants) is visible.</li>
    <li>Anyone holding the bearer token (derived from the key, but it could be captured from a device) can add log batches to the vault, which the devices then set aside as unreadable, and can read the ciphertext. The token cannot delete a photograph, since removal needs a proof only a key-holder can make, and cannot read anything.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Reference lookups ─────────────────────────── -->
  <section aria-labelledby="privacy">
  <h2 id="privacy">The reference lookups</h2>
  <p class="sum">Your own pages need the reference's figures for the species you grow. They ask for a group of a few hundred species at a time, never for one by name. So the server cannot tell which of them you grow.</p>
  <ul class="rules">
    <li>A plant page, a batch page, Today, the labels, the plants list and the front page's own tiles need the reference's figures for your species. They ask for them by hash group, never by name or key.</li>
    <li>The species' address is hashed (FNV-1a) into one of a number of groups. The count is a power of two from 32, the smallest that keeps a group at 320 species or fewer, chosen by the build for the catalogue it writes and announced by <code>/api/corpus</code> as <code>buckets</code>.</li>
    <li>So a group never grows past 320 species, and once the catalogue holds more than 5,120, none holds fewer than about 160.</li>
    <li>The device asks <code>/api/sheets?b=</code> or <code>/api/entries?b=</code> for the groups it needs, naming the count it hashed by (<code>&amp;n=</code>), and picks its own species out of the answer.</li>
    <li>A count that is not the one served is refused with a 409, and the device reads the reference's version again.</li>
    <li>A group that cannot be read is answered 503 with a <code>Retry-After</code> of at most thirty seconds, and the server process that refused it does not try that group again for those thirty seconds.</li>
    <li>Under a published reference a group's sheet file is always one the build wrote. If it cannot be read, the group is answered that way, and the server does not rebuild it from the species' own files.</li>
    <li>The server sees which groups a device asked for, which narrows each species to one of its group's, and no more. A species page you open is, of course, a page you opened.</li>
    <li>A search typed on the front page or the compare page, a name typed in the species picker as typed, and a name in an import the groups do not settle, go to <code>/api/search?q=</code>. The answer is kept a day in the site's cache under that text, linked to no address, since it is a question about the catalogue, not about your plants.</li>
    <li>What is searched on the device is never sent: the text typed on "Your species", and anything typed before your collection has opened.</li>
    <li>Nor is anything shaped like a plant number: two to four digits and another, a dash between or not, as 2026-0013; under a prefix scheme, the collection's prefix followed by a dash or a digit, as ACC-0013; or a batch's number, as S2026-001.</li>
    <li>The catalogue's rows you scroll or jump to by letter are asked for by position (<code>/api/rows</code>: a grouping and a row number, nothing of yours).</li>
    <li>The service worker keeps those answers under the reference's id (each request carries it, from <code>/api/corpus</code>), so a second visit asks nothing until the reference is refreshed.</li>
    <li>The reference's photographs are not fetched for your own pages unless you switch them on in Settings. Then they come from the image host directly, which sees which species this address asked a picture of.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Search ─────────────────────────── -->
  <section aria-labelledby="search">
  <h2 id="search">Search</h2>
  <p class="sum">The search's order is set out on <a href="/about/how#search">How it is made</a>. Here is how a query is read, and what <code>/api/search</code> answers. Every header it adds says what it did to the words you typed.</p>
  <ul class="rules">
    <li>Search puts a name typed as a name first, then an older name typed as one, then a query read whole against each English name (every word in one name, never words of two), then every other match.</li>
    <li>An older name typed whole that a species holds exactly comes before a name whose genus the query only begins: <span class="ex" data-q="Tecoma speciosa" data-order="Handroanthus speciosus | Campsis radicans | Tecomanthe speciosa" data-first>"Tecoma speciosa" is Handroanthus speciosus and Campsis radicans before Tecomanthe speciosa</span>.</li>
    <li>Within each, for an older name: a species that holds it exactly, then the species that keeps its epithet, then one that shows the name itself.</li>
    <li>Then a name that is exactly the query, then whole words, then a match whose headline holds every word. Among English names, the matching name's place among the species' names, then a name written as typed, then more photographs; then the alphabet.</li>
    <li>Apostrophes are taken out before a name is split into words. A family is matched whole, or from its start by a word of six letters or more that is neither a genus of the reference nor a word of the entry's own name.</li>
    <li>Every older name of species rank is searched, not only the six an entry shows, and so are the names filed under the species' own varieties and subspecies.</li>
    <li>A query is read as a botanical name where <i>var.</i>, <i>v.</i>, <i>variety</i>, <i>subsp.</i>, <i>ssp.</i>, <i>subspecies</i>, <i>f.</i>, <i>fo.</i> and <i>forma</i> are skipped, what follows <i>cv.</i> is a cultivar and is not searched, and a word in a script the search cannot read is left out, and said.</li>
    <li>"cf.", "cfr.", "aff." and "nr." are skipped as "x" is, and so are "vel" before "aff." or "cf." and "near" between two words of a name. "sp.", "spp." and "nov." end the name.</li>
    <li>"x" or "×" marks a hybrid, and the word after it starts a name again and is never an author.</li>
    <li>An author pasted after the name is ignored: a bracket, "&amp;", "ex", or a capitalised abbreviation longer than four characters such as "N.E.Br.". After an epithet or a rank only, a shorter one such as "L.", or any word ending in ".", such as "l." or "mill.". And a capitalised word after an epithet of four letters or more.</li>
    <li>A quoted text that begins with a capital, after a word of the name, is a cultivar and is not searched, in straight or curly quotes, single or double.</li>
    <li>Every English name a species has is searched, not only the first.</li>
    <li>The query is NFKC-normalised, and loses its format characters (a zero-width space, a soft hyphen) first.</li>
    <li>When nothing matches exactly, one typing error per word of four letters or more is forgiven. After a capitalised first word, a capitalised word is matched only against a whole word of a name, never the start of one.</li>
    <li>Then the first two words of the name are searched, before any rank, "sp." or quoted cultivar. A hyphenated epithet is one word; a hybrid formula is searched on its first parent; a single letter is never searched again.</li>
    <li>Last, a query whose first word is capitalised and whose second begins with a capital is answered with the species of its first word, when that word is a genus of the reference, or one typing error from one, at four letters or more. Otherwise with nothing.</li>
  </ul>
  <h3 id="search-api">What <code>/api/search</code> answers</h3>
  <ul class="rules">
    <li><code>/api/search?q=</code> answers a list.</li>
    <li>Whenever the answer used other words than those typed (the search on fewer words, the genus answered last, or a reading that left out an author, a cultivar, "sp." or a word it cannot read), the <code>X-Search-Relaxed</code> header carries the words searched, URI-encoded.</li>
    <li>When a reading matched and left words out, and the query was not searched again, <code>X-Search-Left</code> carries those words as typed, URI-encoded.</li>
    <li>When the hits came by a forgiven typing error, <code>X-Search-Near: 1</code>.</li>
    <li>When every word of a query of two words or more, or a word with a typing error, begins words of more than 2,000 species, the answer is empty and carries <code>X-Search-Narrow: 1</code>. So it is when a typing error's similar spellings would mean reading more than 12,000 species or ranking more than 2,000.</li>
    <li>A region of origin named whole, every word of it that common, is answered from the reference's own best hundred instead.</li>
    <li><code>&amp;n=</code> asks for at most 100 hits (60 when not given), and <code>&amp;at=</code> for those after the first so many (at most 2,000).</li>
    <li><code>X-Search-Total</code> carries how many species match, when it is known. <code>X-Search-Kept</code> carries how many of them can be listed, when that is fewer (a word so common that only its best hundred are kept).</li>
    <li><code>X-Search-Regions</code> carries the regions of origin the query names, as URI-encoded JSON, each <code>{`{ name, row: { id, label } }`}</code> with the Origin grouping's row it is part of.</li>
    <li>With <code>&amp;shape=2</code> the answer is <code>{`{ hits, relaxed?: { query, left? }, near?: true, narrow?: true, total?, kept?, at?, regions? }`}</code>.</li>
    <li><code>/api/names?q=</code> takes letters, marks, spaces, ".", "'", "’", "-", "&amp;" and "×", NFKC-normalised, and answers 400 for anything else, such as a digit.</li>
  </ul>
  <h3 id="picker">The species picker</h3>
  <ul class="rules">
    <li>A name picked in the Add form's species picker replaces only what it names. A qualifier, a cross's parentage and a cultivar are kept as typed.</li>
    <li>A rank with its epithet is kept (written var., subsp. or f.) when the species picked has the epithet typed. The reference key is filed only when the name filed is the picked taxon's own.</li>
    <li>When a pick leaves typed words out (an author, a locality), the text as typed is kept as the plant's name as received.</li>
    <li>A nothogenus keeps its sign (× Gasteraloe), and a field number after the genus (Gymnocalycium LB 123) is kept as written.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Import ─────────────────────────── -->
  <section aria-labelledby="import">
  <h2 id="import">Import, the watering calendar and the label code</h2>
  <p class="sum">An import reads a pasted list or a spreadsheet on the device, and shows you every line before anything is saved. Nothing in the sheet is dropped unseen. Running the same sheet again adds only the plants still missing.</p>
  <h3 id="import-read">Reading a sheet</h3>
  <ul class="rules">
    <li><b>Import</b> (My plants, Import) reads a list pasted one plant per line (name; cultivar; number; where it came from; notes, separated by semicolons or tabs). Or it reads a CSV sheet with a comma, semicolon or tab separator, quoted cells and an optional byte order mark.</li>
    <li>It is read on the device, and nothing in the sheet is dropped unseen. Cells are kept as text and never evaluated. A cell written <code>="0012"</code>, as the backup's sheets write the shapes of text listed below, is read as <code>0012</code>, and a note keeps its own spaces and line breaks.</li>
    <li>A column no field takes is listed before the names are checked and, unless you untick it, added to each plant's notes as "Column: value".</li>
    <li>Genus and Species in two columns make one name.</li>
    <li>A name cell is read with its compatibility forms folded (full-width letters, ligatures, a no-break space: Unicode NFKC), and its invisible format characters taken out (a soft hyphen, a zero-width space, a byte order mark). A joiner inside an emoji is kept.</li>
    <li>A cell that held a soft hyphen, a zero-width space or full-width letters keeps its text as the plant's name as received.</li>
    <li>A Qty of 3 is three plants, and a Qty of "3.0" is three plants. A part of a name in brackets is kept with the name as received.</li>
    <li>"cf." (or "cfr."), "aff." (or "vel aff."), "nr." (or "near"), "sp." and "nov." stay in the name, written one way, whether before the genus or after it. A name in quotes after "sp." is the undescribed species' own.</li>
    <li>The reference is asked about the species part only, so such a plant is filed with no reference key. Its label's care line says whose care it borrows ("care as for C. cinerea").</li>
    <li>A cultivar in any quotes, straight or curly, single or double, is read as a cultivar.</li>
    <li>A plant filed under a name other than the sheet's (a suggestion used, a name edited in the review, a word not read) keeps the sheet's text as its name as received. "Use it" puts the suggested species in place of the species part only.</li>
    <li>A name the reference holds as an older name of one species is said as that ("an older name: the reference has this species as …"). Its name can be taken on one line, on every line of the same name, or on every such line at once. A near spelling is offered line by line.</li>
    <li>A Status or Kind the import cannot read is said on its line and kept in the notes, as Provenance is.</li>
    <li>A space path is split on " › ", after a space whose whole name is the cell.</li>
    <li>When the sheet's space cells have a "&gt;" between words (Greenhouse &gt; Bench 2), a "/" with a space on each side (Greenhouse / Bench 2), or a "/" with no spaces between two words of three letters or more after a space here (Greenhouse/Bench 2), the review asks once whether to read those as paths too. The answer is yes by default when the first part names a space here or begins another such cell.</li>
    <li>Nothing in brackets is a step, so Cold frame (N/S), S/W window and Shelf 1/2 are each one space.</li>
    <li>A sheet with a quote that is opened and never closed is not read, and the page says on which row.</li>
    <li>A row repeating the header is left out and counted, as is a line with no name.</li>
    <li>A new space named in the paste's space box and not yet added is made when Check names is pressed, so every line gets it.</li>
    <li>Names are checked against the reference: by hash group first, then by the catalogue's search for those the groups do not settle; never by GBIF's name service, which the Add form's picker asks.</li>
  </ul>
  <h3 id="import-dates">Dates</h3>
  <ul class="rules">
    <li>Dates are read at the precision they are written at: a year (2009), a month (August 2017, 2017-08), a named month with a day, or a day and month where a number over 12, or the same number twice, says which is which.</li>
    <li>A two-digit year is read after a day and month, as 20YY, and only when 20YY has come. So 1/1/27 is not read, since it could be 1927 or 2027.</li>
    <li>A two-digit year is not read in three numbers joined by dashes, or when the first number could be a year too (24/03/09, 24.03.09, 05/01/24), which could be written year first.</li>
    <li>That holds unless the sheet's dates are said to be written day first or month first, both of which put the year last (LibreOffice saves a date as 05/01/24 or 01/05/24, by its language).</li>
    <li>Or year first, offered when the sheet holds a date that could be read so. It reads such a date with its two-digit year first (10-04-15 is 15 April 2010), and no other date differently.</li>
    <li>A time after a date (09/03/2024 10:15) is not part of it. A day or month of 0 is no date. A year and a month joined by a full stop (2019.5) is a number, and is not read.</li>
    <li>A month name and a two-digit number (Aug-17), as a spreadsheet writes a month, is not read, since the number could be the year or the day. Nor is a five-digit number (45123), which may be a spreadsheet's count of days: the line says which, with the date it would be.</li>
    <li>A date like 09/03/2024, 05/01/24 or 19-05-23 is read only by one choice for the whole sheet: day first, month first, or year first where a date could be written so. It is asked whenever the sheet holds such a date, and left as written unless you make it.</li>
    <li>The question names the day each answer reads, with its year, and says what the sheet's other dates show: a first number over 12 can only be day first, a second over 12 only month first. It chooses nothing for you.</li>
    <li>A date in the future, or before 1900, is not read either.</li>
    <li>A date not read is said on its line and kept in the notes as "Acquired (as written): …". Its plant is numbered for the year it names, or this year when it names none.</li>
  </ul>
  <h3 id="import-numbers">Numbers, and running a sheet again</h3>
  <ul class="rules">
    <li>A number already used here is replaced by the next free number. A number given twice in the sheet keeps it on its first line and is replaced on the later ones.</li>
    <li>When the sheet's numbers share one pattern, the next free number is in that pattern, one past the highest of that pattern in the sheet or here, and unpadded when the sheet's numbers are.</li>
    <li>One pattern means the same letters before the digits, and either as many digits (0001 to 0300, or A001 to A095), or no number padded with a leading 0 (1 to 300, or A9 to A95).</li>
    <li>Otherwise, or past a padded pattern's last number (9999 for four digits), or past the largest whole number a browser counts exactly (9007199254740991), it is this collection's next number (2026-0009).</li>
    <li>A sheet numbered as this collection numbers, over one year or several, is numbered by its rule.</li>
    <li>The further plants of a line of several (Qty) that gives a number are numbered the same way, whether the line keeps its own number or not. The review says which, and the number it carried on from.</li>
    <li>Each plant an import adds carries its line's import key. Running the same sheet again, or the sheet saved again by a spreadsheet or given a column, leaves out every line whose plants are all here, removed plants included. It offers only the missing plants of a line partly added, numbered on in the sheet's pattern.</li>
    <li>The key reads a date by its exact day, so 2024-01-05 and 2024-05-01 are two lines.</li>
    <li>A date cell that reads either way round (09/03/2024), left as written, is keyed by its year with day and month in either order. That also finds a plant filed under either reading. Answered by the sheet's choice, it is keyed by the day the answer reads, which finds a plant of that day, or one an unanswered run filed with no date.</li>
    <li>A date whose two-digit year could come first or last (05/01/24) is keyed as such a cell is, by its readings with the year last; read year first, by the day it reads.</li>
    <li>The key reads the notes as the plant gets them, the columns no field takes included. It reads a price as its amount: 12.50 and 12.5 are one, and £12.50 also finds a plant filed at 12.50.</li>
    <li>A column added to the sheet leaves a line found in three cases: no other line of the sheet differs from it only there; or each that does is found by its own key; or the plants filed under the line without the column are as many as the lines sharing it that still lack a plant.</li>
    <li>A plant filed from a line with columns no field takes keeps the line's key without them too, numbered after the plants of lines that had none, so a sheet that has lost those columns finds it.</li>
    <li>While the plant's own line, those columns and all, is still in the sheet, that key finds it for no other line. So a line beside it with those columns empty is a new plant.</li>
    <li>A plant an earlier version's import filed is found by that version's key only when its own date acquired and notes agree with the line.</li>
    <li>A line whose number a plant here holds (compared without its leading zeros) looks already imported when the name is the same, or under any name when an import filed that plant (a name corrected since). The line names that plant when its name differs, and is skipped unless you add it anyway.</li>
    <li>A line with no number whose name, date acquired and source match a plant an earlier import added from a line this sheet no longer has looks already imported, changed. It is said, and added unless you drop it.</li>
    <li>The review before anything is saved says each.</li>
    <li>My plants' Newest first orders numbers with their digits read as numbers (A95, A94, A77, A9). A search that is a plant's whole number lists that plant first.</li>
    <li>The numbers shown in the review are the numbers given. The import gives each plant its number, and a number another tab takes meanwhile is replaced by the next free one, said.</li>
    <li>One import is written at a time in this browser. Before writing, it reads what other tabs wrote, leaves out every plant whose import key is already here, and names the lines imported elsewhere. So a sheet imported in two tabs adds each plant once.</li>
    <li>2,000 lines are read at a time, the lines already here not counted. The page then offers the next lines of the same file, and a line you dropped in an earlier pass stays dropped, left out and counted.</li>
    <li>Lines are written in groups of up to 50 plants, each group one write, so an import cut off partway keeps the groups before it. A group that cannot be written is tried again a line at a time, so the stop names its line.</li>
    <li>A change to the date order, the notes box, a column, the header or the path question after the names are checked reads the sheet again at once, and says so.</li>
    <li>A line of several plants bought at one price keeps the price on its first plant, and the others note "Bought with &lt;number&gt;, whose record holds the price.". A failure before the first plant says which spaces were made.</li>
    <li>A last watering given for the whole list is one watering line per plant.</li>
  </ul>
  <h3 id="sheets">The backup's spreadsheets</h3>
  <ul class="rules">
    <li>My plants offers the plants sheet on its own too, as <code>cultifolio-plants-</code> and the day, <code>.csv</code>: the backup's <code>plants.csv</code>, written the same way.</li>
    <li>The backup's sheets write <code>="…"</code> around the shapes of text a spreadsheet would change into a number or a date. These are a leading zero (0012), an exponent (1E5), a day and month (3-12, 1/2), a year and month (2026-01), a day, month and year (3-12-2024, 1/2/24), and a run of twelve digits or more.</li>
    <li>A text a spreadsheet would read as a formula gets a leading apostrophe, and one that already begins with an apostrophe and a formula sign gets a second.</li>
    <li>Only those shapes: text such as 3.12, 2026/01, Aug 2017, 1:30 or 50%, which some spreadsheets read as a date, a time or a number, is written as it is.</li>
    <li>A price is written as typed and never quoted, since quoting it would break other readers; a spreadsheet may show 12.50 as 12.5.</li>
    <li>A full date (2017-08-14) is written as it is. A spreadsheet takes it for a date and shows it in its own short form (14/08/2017 in Excel set to British English). A sheet saved again from the spreadsheet carries that form, which the import reads, asking once which way round a date like 09/03/2024 is.</li>
    <li>A date kept as a month (2017-08) is one of the shapes above, so it shows as written, not as Aug-17.</li>
    <li>In LibreOffice, tick "Evaluate formulas" when opening the sheet, or those cells show as <code>="…"</code>.</li>
  </ul>
  <h3 id="calendar">The watering calendar</h3>
  <ul class="rules">
    <li><b>The watering calendar</b> is an iCalendar file (<code>cultifolio-watering-</code> and the day, <code>.ics</code>, RFC 5545) made on the device. It holds one all-day event per space, and per plant with its own rhythm, repeating every <i>n</i> days (<code>RRULE:FREQ=DAILY;INTERVAL=n</code>) from its next due day.</li>
    <li>Each has a reminder at 09:00 on the day (<code>VALARM</code>, <code>TRIGGER:PT9H</code>); some calendars use their own default instead.</li>
    <li>Where a space keeps months dry, its rhythm is one series per run of watered months, for two years ahead. Each ends (<code>UNTIL</code>) on the last day before the dry months, and the next starts on the first day after them, the day Today lists the space's plants again.</li>
    <li>A space kept dry in every month makes no event, and the page names it.</li>
    <li>A rhythm that is not a whole number of days from 1 to 365 (one that came from a backup, an import or a sync) is written at the default of 21 days, and a plant's own at its space's.</li>
    <li>Every event has a UID that carries a short tag of the collection (a hash of its earliest record's id), and a SEQUENCE that grows with each download. A series after dry months is named by the first day of its watered months. So a file downloaded again names the same events the same way.</li>
    <li>Where any series stops at the two-year horizon, the file's last event, on the day the first one stops, says to download the calendar again. When other series stop later or repeat without end, it names the ones that stop that day.</li>
    <li>A calendar keeps an imported event as it was, so the page still asks for the old Cultifolio events to be deleted before a new file is added.</li>
  </ul>
  <h3 id="spent">Spent this year, and "No photo in 12 months"</h3>
  <ul class="rules">
    <li><b>Spent this year</b> is read from each plant's price, by the year the plant was acquired, where the price is a plain number with at most one currency mark (<code>12</code>, <code>£6</code>, <code>6 EUR</code>, <code>US$12</code>, <code>R$ 30</code>, <code>12 usd</code>).</li>
    <li>A thousands separator is read only where exactly three digits follow it (<code>£1,250</code>, <code>1.234,56 €</code>), and a space too (<code>1 200 €</code>, a no-break or thin space as well).</li>
    <li>"free" and "gift" count as nothing spent, and are said apart. Any other price is counted as not read, and the page says how many.</li>
    <li>The names of one currency are one total: $, US$ and USD; £ and GBP; € and EUR; ¥ and JPY; a code in lower case as in capitals.</li>
    <li>R$, A$, NZ$, C$ and Rs are each their own. Prices with no currency are a total of their own. Nothing is converted.</li>
    <li>Today's line "without a photograph in the last twelve months" and the plants list's "No photo in 12 months" read one rule. A growing plant had six months or more, by its acquisition date or else the day its record was made, with no photograph dated in the last twelve months.</li>
    <li>A date kept as a year or a month counts from its last day ("2026" as 31 December, "2026-04" as 30 April), so a plant is never counted six months old on a day its record does not give. The date itself is kept as written.</li>
    <li>Both read today's date from the same corrected clock, as the local day where you are, so they always agree.</li>
  </ul>
  <h3 id="label">The label's QR code</h3>
  <ul class="rules">
    <li><b>The label's QR code</b> is the plant's address, <code>/plants/&lt;identity&gt;#s=&lt;species&gt;&amp;n=&lt;name as printed&gt;</code>.</li>
    <li>The part after <code>#</code> stays in the phone that scans it and is never sent to the server as written.</li>
    <li>A phone without that plant shows the species the label names and a link to its page, after asking for that species' hash group (<code>/api/entries?b=</code>, as a plant page asks for its own). So the server learns the group, one species in a few hundred, and not the name.</li>
    <li>The name in the code is cut to at most 60 code points, by whole characters as a reader sees them (a letter with its marks, a joined emoji), never inside one.</li>
    <li>Every format character is taken out of it, closing the word up: text-direction marks, zero-width spaces and joiners, soft hyphens, tag characters. A joiner inside an emoji is kept.</li>
    <li>A control character, or a line or paragraph separator, is made a space; a letter keeps at most two marks; and a broken character (a lone surrogate) is replaced, so the label keeps its code. This is done on the label and when a scanned label is shown.</li>
    <li>A cross has no species page, so its code names no species, and its name is the cross's parents when they are known (Astrophytum asterias × capricorne), as its label prints it. A hybrid with a name of its own, such as Mentha × piperita, names its species as a species does.</li>
    <li>An "sp." plant's code names no species either. A name that cannot be put in a code leaves that one label without its code, and the others keep theirs.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Dossier ─────────────────────────── -->
  <section aria-labelledby="dossier">
  <h2 id="dossier">A species dossier</h2>
  <p class="sum">Each species page is drawn from one JSON file, its dossier, which anyone can fetch. It holds every figure the page shows, and a record of every source asked. A field a dossier lacks means it was not read, never "none".</p>
  <ul class="rules">
    <li>Each species page is rendered from one JSON document, served at <code>/api/dossier/&lt;id&gt;</code>, the page's id.</li>
    <li>It is answered <code>no-store</code> and kept by no cache, since a dossier's address stays the same when the reference is refreshed.</li>
    <li>A dossier the index lists but that cannot be read just now answers 503, never 404. A key the index does not list answers 404, whatever the group still holds.</li>
    <li>A GBIF key in its place (<code>/api/dossier/&lt;gbifKey&gt;</code>) moves for the moment to the id of the page whose own GBIF key it is, and is a 404 where no page's is.</li>
    <li>It holds: the name and classification; the native range as TDWG level-3 codes; the open occurrence points with licence tags; and the map marker and how it was placed.</li>
    <li>It holds the climate envelope (the median year, the 10th and 90th percentile years, the cells and records it rests on, the typical cell) with its sources, and the extremes.</li>
    <li>It holds the photographs with author and licence; <code>licence</code> is <code>cc0</code>, <code>pd</code>, <code>by</code> or <code>by-sa</code>. <code>pd</code> is public domain that is not a CC0 waiver; an older dossier tags a Commons file "Public domain" <code>cc0</code>, which the site reads as <code>pd</code>.</li>
    <li>It holds the summary with its licence, at most 1,500 characters, cut where a sentence ends, with <code>cut: true</code> where the article's lead went on, or the text does not end a sentence, when it ends with "…".</li>
    <li>It holds literature (empty in a page built since the reference stopped asking OpenAlex, whose <code>upstream.openalex</code> is <code>skipped</code>, not checked, never none) and links.</li>
    <li>And an <code>upstream</code> block, recording for every source whether it answered, refused, was not asked (<code>skipped</code>), or was carried from an earlier build. For a source read from a file, <code>asOf</code> is the day of the file it was read from (Kew's files, GBIF's download).</li>
    <li>Its <code>gbif.occurrences</code> row says how its records were tested against the range: by the regions' shapes, by their boxes, or by both, naming the regions tested by box.</li>
    <li><code>occurrences.rangeRule</code>: the rule of the regions' shapes its records were tested by (<code>r84</code>). Absent on a page tested before that rule, which <code>--check-ranges</code> lists.</li>
  </ul>
  <h3 id="photo-fields">A photograph's fields</h3>
  <ul class="rules">
    <li>A Commons photograph carries <code>categories</code>, Commons' categories for the file as the build or <code>--fill commons-kind</code> read them, absent where not yet read. It carries <code>struck</code> where its description strikes out a name. The site reads both to decide whether it is shown.</li>
    <li>A Commons photograph may carry <code>slips</code> (the uploader's slips in its name that Kew and GBIF were asked of and hold as no species).</li>
    <li>It may carry <code>inat</code> (the iNaturalist photograph its source names), <code>kind</code> (what its source or description says it is, when not a living plant), <code>sourceRead</code> (set once the fill has read them) and <code>kindRule</code>. A file left out by its description is asked again only when the description rules (<code>kindRule</code>) are newer.</li>
    <li>Any photograph may carry <code>shared</code>: the ids of the other species' pages that hold it, Kew's ids before GBIF's, each by number, written by <code>--index</code>. It is then not shown.</li>
    <li>A Commons photograph carries <code>judged</code> (<code>{`{ not, rank }`}</code>), written by <code>--index</code> with every name the reference holds. <code>not</code> is why the file is not a photograph of the species, absent when it is one.</li>
    <li><code>rank</code> is 0 when its title holds the species' own epithet, 1 an older name's, 2 neither. The site shows the file, and orders the Commons files, by it; a file without one by the same rules with no names but the species' own.</li>
    <li>A GBIF photograph whose record is not an observation of the living plant carries <code>specimen</code>, and is not shown.</li>
  </ul>
  <h3 id="dossier-keys">The id and the names</h3>
  <ul class="rules">
    <li>The document's <code>key</code> is the page's id (dossier version 3): <code>k</code> and Kew's plant_name_id where Kew's file gives the page one accepted taxon that no other page holds. Otherwise it is <code>g</code> and its GBIF Backbone key.</li>
    <li>A <code>g</code> page is one where Kew's rows do not decide, or two pages hold one Kew entry (which is Kew's is not guessed: a merge decides it), or a page merged into another until it is pruned.</li>
    <li><code>ids.gbif</code> is its GBIF key.</li>
    <li>A <code>k</code> page's <code>name</code> is Kew's accepted name for its entry, with Kew's author; GBIF's name for its key, where it differs, is among its older names.</li>
    <li><code>ids.gbif</code> is absent for a species Kew accepts whose name GBIF's backbone holds as no one accepted species. Its <code>key</code> is <code>k</code> and Kew's plant_name_id.</li>
    <li>Its name block (with <code>name.kew</code>), range and IPNI and POWO numbers are read from Kew's file (<code>upstream['kew.names']</code>, <code>asOf</code> the file's day). Its Wikidata item is the one that carries that IPNI or POWO number.</li>
    <li>GBIF is not asked by its name: its <code>gbif.species</code>, <code>gbif.synonyms</code>, <code>gbif.vernacular</code> and <code>gbif.media</code> rows are <code>skipped</code>, with the reason.</li>
    <li>Its English names are its item's, in <code>name.vernacular</code> with <code>source</code> "Wikidata". <code>upstream['wikidata.names']</code> says what was read: <code>ok</code> or <code>none</code> where Wikidata answered; <code>skipped</code>, <code>refused</code> or <code>error</code>, with why, where it was not checked.</li>
    <li>A dossier built before that row existed has none, and its names are not checked.</li>
    <li>Where Kew's synonymy gives it GBIF keys of its own (<code>scripts/extra-keys-kew.txt</code>), its <code>occurrences</code>, <code>centroid</code> and <code>climate</code> are read from their records as any page's, and <code>occurrences.keys</code> names each key.</li>
    <li>Otherwise its <code>gbif.occurrences</code> and <code>climate</code> rows are <code>skipped</code> with the reason, its <code>occurrences</code> are empty with <code>rangeTested</code> false, and it has no <code>centroid</code>. Its <code>climate</code> is <code>pending</code> with the reason, and the site says each as not checked, never none.</li>
    <li>That reason is the page's own, in <code>occurrences.unread</code> (<code>{`{ kind, why, under }`}</code>). It says what GBIF's backbone holds of Kew's names for it: <code>lumped</code>, <code>none</code>, <code>other-type</code>, <code>pro-parte</code>, <code>other-author</code> or <code>other</code>.</li>
    <li>It carries the words the page says and, where GBIF files those names under other pages here, each of them by its GBIF key, its name and its id (<code>page</code>). A dossier without it says the general reason.</li>
  </ul>
  <h3 id="dossier-fields">Fields that may be absent</h3>
  <ul class="rules">
    <li>Each of these fields, where absent, means not read, never none.</li>
    <li><code>name.cited</code> (<code>{`{ gbif, kew }`}</code>), present when the page cites Kew's author for the number it links: the backbone's citation, and Kew's row cited (its plant_name_id).</li>
    <li><code>name.kew</code> (<code>{`{ entry, synonyms, acceptedElsewhere, file, heldBy? }`}</code>): Kew's accepted entry for the page's plant, Kew's synonym binomials of it, the stored older names Kew accepts as species of their own, and the day of Kew's file.</li>
    <li>The entry is '' when the names do not lead to one, or lead to an entry another page holds, whose id <code>heldBy</code> names; there are then no synonyms. One Kew entry is one page's.</li>
    <li><code>name.kew.accepted</code> (<code>{`{ name, authors, rank, other? }`}</code>): Kew's row for the entry, which heads the page while its id is <code>k</code> and the entry's number. <code>name.gbif</code>: GBIF's name for the page's key, where Kew's heads the page; <code>added</code> names the older name the heading put among the synonyms.</li>
    <li><code>name.shared</code>: the one-word English names the page does not head with or show, since another species of its genus is given them more often, or as often. <code>name.infra</code>: the names GBIF files under the species' own varieties and subspecies, read by <code>--fill gbif-infra</code>, which the search reads as a name typed.</li>
    <li><code>distribution.via</code>, where the range comes from: its <code>kind</code> (<code>own</code>, <code>older-name</code>, <code>synonym-of</code>, <code>kew-entry</code> or <code>spelling</code>), and the <code>entry</code> whose range is shown.</li>
    <li>It also carries <code>page</code>, that page's id when the entry is another page here; <code>unplaced</code>, when Kew holds the name as unplaced; and <code>file</code>, the day of Kew's file.</li>
    <li><code>distribution.doubtful</code>: the regions where WCVP records the plant as doubtfully present, listed apart, never a range box.</li>
    <li><code>occurrences.keys</code> (<code>{`{ key, name, kew, n, from, slug }`}</code>), present when the records also come from other GBIF keys than the page's own, or, on a page without a GBIF key, from the keys Kew's synonymy gives it.</li>
    <li>For each key: GBIF's name for it, how Kew's file holds it as this page's name or type, the records it added, <code>download</code> or <code>api</code>, and, for a page merged into this one, the old address.</li>
    <li>The species page reads these fields. For a dossier built before them it reads the sentences the builder wrote then.</li>
    <li>GBIF's English names are one row per exact spelling and language. Each has the first source that gives it (<code>source</code>), the other named sources of that spelling (<code>alsoFrom</code>), how many sources give it when more than one (<code>sources</code>), and GBIF's <code>preferred</code> flag.</li>
    <li>A row whose name holds commas is read by the common-name rule as a list of names, each given by that row's sources. A list longer than four pages of a thousand rows is kept as far as it was read, and its upstream record says "truncated".</li>
    <li>A row whose <code>source</code> is "Wikidata" is an English name from the page's Wikidata item, its taxon common name (P1843), for a page without a GBIF key.</li>
    <li>Its <code>alsoFrom</code> lists the references of its statement that name a source ("stated in Q…", or "at" and the site of a reference URL). Its <code>preferred</code> is Wikidata's preferred rank. The record <code>wikidata.names</code> names the item and each name taken or refused, with why.</li>
    <li><code>climate.annualRain</code> holds the 10th and 90th percentiles and the median (<code>p50</code>) of the cells' own yearly rain totals.</li>
    <li><code>changed</code> is <code>{`{ on, h }`}</code>: the day (YYYY-MM-DD, UTC) the page's substance last changed, and a 16-hex fingerprint of it.</li>
    <li>The fingerprint is of the dossier without <code>built</code>, <code>builtBy</code>, <code>changed</code>, each photograph's <code>judged</code>, and each source row's <code>at</code> and <code>detail</code>. Each photograph's <code>shared</code> is read as a set, so the same pages in another order are no change.</li>
  </ul>
  <h3 id="entry">An index entry</h3>
  <ul class="rules">
    <li>Each species' index entry, as <code>/api/entries?b=</code> answers a group of them, carries <code>key</code>, the page's id. It carries <code>gbif</code>, its GBIF key, which a plant's <code>taxonKey</code> is compared with; the figure sheets carry both too. A page without a GBIF key has no <code>gbif</code>.</li>
    <li><code>slug</code>, <code>name</code>, <code>family</code>, <code>origin</code>, <code>photos</code>, <code>open</code> and <code>climate</code> (<code>ok</code>, <code>none</code> or <code>pending</code>).</li>
    <li><code>common</code>, the shown English name, and <code>commons</code>, the others. <code>spellings</code>: the other spellings of the shown names, searched, never shown.</li>
    <li><code>thumb</code> and <code>credit</code>: the thumbnail and its licence and author as a tile shows them after "Photo: ", absent when they cannot be said short and true.</li>
    <li><code>near</code>: the ids of the six species of nearest habitat climate.</li>
    <li><code>changed</code>: the day the dossier last changed in substance, as whole days since 1 January 1970.</li>
    <li><code>syn</code>: up to six older names, shown. <code>older</code>: every other older name of species rank, searched, never shown.</li>
    <li><code>kew</code>: Kew's older names for the plant that <code>syn</code> and <code>older</code> do not hold, and the names GBIF files under the species' own varieties and subspecies, which the search reads only as a name typed and nothing shows. Absent where there are none, or Kew's file has not been read for the page.</li>
    <li><code>hom</code>: the record's older names spelt as another page's accepted name, by another author than that page's, searched only as a name typed and said as another author's name. <code>homBy</code>: for each of them, the authors the record writes after it, as written.</li>
    <li><code>merged</code>: the names of the pages merged into this one, each also among its older names. The search lists this page first for them, and its row says the name is merged into it.</li>
    <li>Each of these, where absent, means none was written, never that the species has none: an index built before a field has none of it.</li>
  </ul>
  <h3 id="export">The dataset export</h3>
  <ul class="rules">
    <li>The reference is built from public data under CC0, public domain, CC BY and CC BY-SA. The repository's <code>npm run export</code> packages a built reference as a dataset bundle: the species JSON, <code>species.csv</code>, <code>climate.csv</code>, and the licence terms per source.</li>
    <li>That is how the reference data leaves the site as data rather than pages.</li>
    <li><code>species.csv</code> ends with <code>annual_precip_cells_p10_mm</code>, <code>annual_precip_cells_median_mm</code> and <code>annual_precip_cells_p90_mm</code>: the 10th percentile, median and 90th percentile, across the cells, of each cell's own yearly total. <code>annual_precip_mm</code> stays the median year's total.</li>
  </ul>
  </section>

  <!-- ─────────────────────────── Reference files ─────────────────────────── -->
  <section aria-labelledby="corpus-files">
  <h2 id="corpus-files">The reference's files</h2>
  <p class="sum">Beside the dossiers, the build writes small files the server reads instead of the whole index. Each is named by the hash of its content, and a manifest names them all. The file counts grow with the reference by a fixed rule.</p>
  <ul class="rules">
    <li>The files are stored under the hash of their content (<code>s/v3/p/&lt;md5&gt;.json</code>; the dossiers are <code>s/v3/&lt;id&gt;.json</code>). <code>s/v3/manifest.json</code> names them: <code>{`{ v, id, built, species, buckets, postings, files: { <name>: <md5> } }`}</code>, where <code>id</code> is a hash of every file's hash.</li>
    <li><code>index.json</code>: every species' index entry. <code>/api/index</code> passes it on as it is stored.</li>
    <li><code>entries/&lt;group&gt;.json</code> and <code>sheets/&lt;group&gt;.json</code>: a hash group's entries and figure sheets (<code>/api/entries</code>, <code>/api/sheets</code>).</li>
    <li><code>postings/&lt;n&gt;.json</code>: which entries, by position in the index, each short key of a name can match. <code>short.json</code>: the best hundred for each key of one or two letters.</li>
    <li><code>catalogue/&lt;grouping&gt;-&lt;chip&gt;.json</code>: the catalogue's rows (<code>{`{ rows, letters, letterAt, total, withClimate }`}</code>).</li>
    <li><code>rows/&lt;grouping&gt;/&lt;n&gt;.json</code>: each catalogue row's species under "all", by row id (<code>{`{ at, items }`}</code>), sorted by name, with each one's position in the index.</li>
    <li>The row files of a grouping are the power of two at or above the species count divided by 150 for genera, and by 600 for families and regions, and at least 16. At 48,357 species: 512 for genera, 128 for the others.</li>
    <li><code>genera.json</code>: every genus with its count of species, <code>[[genus, count], …]</code>.</li>
    <li><code>featured.json</code>: the species the front page's strip rotates through (<code>{`{ slug, name, thumb, credit, common, family }`}</code>).</li>
    <li><code>sitemap/&lt;n&gt;.json</code>: forty thousand of the sitemap's addresses a file, with each one's day (<code>{`{ urls, days }`}</code>).</li>
  </ul>
  <h3 id="lookup-files">The names every page looks up</h3>
  <ul class="rules">
    <li><code>cards/&lt;n&gt;.json</code>, what a species page reads: an object from each page's address to the id of its species, and from <code>#&lt;id&gt;</code> to the species itself.</li>
    <li>The species is <code>{`{ key, gbif, slug, name, at, family, common, thumb, credit, open, climate, syn, near, x }`}</code>: <code>key</code> its id, <code>gbif</code> its GBIF key, <code>at</code> its position in the index, and <code>x</code> its record's older names that are another species' accepted name here.</li>
    <li>It also maps <code>@&lt;GBIF key&gt;</code> to the id of the page whose own GBIF key it is, by which an answer of GBIF's finds its page.</li>
    <li>The card files are the power of two at or above a 64th of the species count, and at least 64: 1,024 at 48,357 species.</li>
    <li><code>older/&lt;n&gt;.json</code>, read for an address that is no page's and for a page reached by an older name. It maps each accepted name in lower case, and each older name in lower case and as an address, to <code>{`{ n, o }`}</code>.</li>
    <li><code>n</code> is the species whose accepted name it is, as <code>[id, address, name]</code>. <code>o</code> is an older name's holders, <code>{`{ m, h }`}</code>: <code>h</code> the species that hold it, as <code>[id, address, name]</code>, and <code>m</code> the name as written.</li>
    <li>With two or more holders, <code>h</code> is in the order the 404 names them, and the address leads to none.</li>
    <li>The files of names are the power of two at or above a hundredth of the species count, and at least 64: 512 at 48,357 species.</li>
    <li>The file a key is in is the FNV-1a hash of it, modulo the number of files of its set.</li>
    <li>A reference whose manifest lacks any of these is read through its index, as before.</li>
  </ul>
  <h3 id="search-files">The search's files</h3>
  <ul class="rules">
    <li><code>search/top.json</code> and <code>search/&lt;n&gt;.json</code> are the directories of the search's keys. <code>top.json</code> holds every key of one or two characters; each other key is in the file its first three characters' FNV-1a hash, modulo the number of files, gives.</li>
    <li>The number of directory files is sixty-four, doubled while the species count is more than 160 times it, up to 4,096: 512 at 48,357 species.</li>
    <li>Each directory is an object from a key to <code>[count, md5]</code>, the key's file. Or <code>[count, md5, 2]</code>: the key's file, and the keys one character longer are listed too, as they are for every key of one or two characters and every key of more than 200 species.</li>
    <li>Or <code>[count, md5, 1]</code>: more than 2,000 species, so no file; the keys one character longer are listed, and <code>md5</code> names its answers. Or <code>[count]</code>: a similar-spelling key with no file, of more than 2,000 species or of one or two characters; the keys one character longer are listed.</li>
    <li>A key is the beginning of a word as the search reads it (<code>alo</code>). A similar-spelling key, written with <code>~</code> before it, is the beginning of a word of a species' name, English names or older names with one of its letters taken out, and under three characters the beginning itself too.</li>
    <li>A key's file, <code>s/v3/p/&lt;md5&gt;.json</code>, is <code>[[position, doc], …]</code>: every species with a word so begun, in the index's order, with its position in the index and what the order reads of it.</li>
    <li>The doc is <code>[name, family, origin, common, commons, spellings, syn, older, kew, hom, merged]</code>. The family and the regions of origin are numbers into <code>search/tables.json</code> (<code>{`{ families, regions }`}</code>), with -1 for no family and '' for no headline; empty fields at the end are left off.</li>
    <li><code>kew</code> is filled only in a file of Kew's older names (an <code>@</code> key), with the names of that key's genus.</li>
    <li><code>search/blocks.json</code> is <code>{`{ photos, show }`}</code>: the md5s of the photograph counts by position, 4,096 to a file (<code>[count, …]</code>), and of the index entries by position, 16 to a file (<code>[entry, …]</code>). A search reads them for its matches only.</li>
    <li>Answers are <code>{`{ a, b?, t?, x?, n? }`}</code>, by position in the index: the whole index's best hundred to the word alone as typed (<code>a</code>); in a form no English name is written as, when that differs (<code>b</code>); and in each form an English name is written as (<code>t</code>, by the form).</li>
    <li><code>x: 1</code> when they came from the word as typed rather than a similar spelling. <code>n</code> is how many species the whole index answers, of which these are the first; absent in a file built before it, when the count is not known.</li>
    <li><code>search/genera.json</code> is every genus of the reference as the search reads a word.</li>
    <li>The key files and answers are named by the directories, and the count and entry files by <code>blocks.json</code>, not by the manifest. A server that reads them reads neither the index nor the postings. The postings and <code>short.json</code> are still written, for a server deployed before them.</li>
  </ul>
  </section>
</article>

<style>
  .prose { max-width: 720px; font-size: var(--fs-base); line-height: 1.6; color: var(--ink); font-family: var(--ui); }
  .prose h2 { font-family: var(--serif); font-size: var(--fs-2xl); margin: 32px 0 8px; }
  .prose h3 { font-family: var(--ui); font-size: var(--fs-lg); margin: 20px 0 6px; }
  .prose p { margin: 0 0 12px; }
  .prose pre { background: var(--sunk); border-radius: var(--r); padding: 12px 14px; overflow-x: auto; font-size: var(--fs-md); line-height: 1.5; margin: 0 0 12px; }
  .prose code { font-family: var(--mono); font-size: var(--fs-md); }
  .prose p code, .prose li code { background: var(--sunk); padding: 1px 5px; border-radius: 4px; }
  .topseg { margin: 14px 0 6px; }
  .brief { background: var(--card); border-radius: var(--r); box-shadow: var(--sh); padding: 4px 18px 14px; margin: 0 0 18px; }
  .brief ul { padding-left: 1.1rem; }
  .brief li { margin: 4px 0; }
  .toc { font-size: var(--fs-md); line-height: 2; }
  /* The section's plain summary: what a reader takes away before the rules (round eighty-four; the reviews' S5, A19). */
  .sum { font-size: var(--fs-lg); line-height: 1.55; margin: 0 0 12px; }
  .rules { padding-left: 1.1rem; margin: 0 0 12px; }
  .rules li { margin: 6px 0; }
  /* An anchor lands under the top bar, not beneath it. */
  .prose [id] { scroll-margin-top: calc(44px + 16px); }
  .prose code { overflow-wrap: anywhere; }
</style>

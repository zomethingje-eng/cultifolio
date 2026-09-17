<script lang="ts">
  import { setCrumb } from '$lib/ui/crumb.svelte';
  $effect(() => {
    setCrumb([{ label: 'About', href: '/about/how' }, { label: 'Formats' }]);
    return () => setCrumb([]);
  });
</script>

<svelte:head>
  <title>Cultifolio formats</title>
  <meta name="description" content="The backup file, the change log, and the sync wire format, documented so you can read your own data without the app." />
</svelte:head>

<div class="kick" style="margin-top: 22px">About</div>
<h1 class="q">Formats</h1>
<p class="secsub">Your data is yours, and that means being able to read it without this app. Three formats, all plain: the change log, the backup file, and what sync puts on the server.</p>

<nav class="seg topseg" aria-label="About"><a href="/about/how">How it is made</a><a class="on" href="/about/formats">Formats</a></nav>

<article class="prose">
  <h2 id="log">The change log</h2>
  <p>A collection is a list of changes. Each change sets one field of one record:</p>
<pre><code>{`{ "t": "1789520000000-0001-ab12cd", "kind": "accession", "id": "2026-0001", "field": "notes", "value": "sulked all summer" }`}</code></pre>
  <p><code>t</code> is a hybrid logical clock: 13-digit millisecond wall time, a 4-hex-digit counter, and the id of the device that made the change. It sorts as a string. <code>kind</code> is one of <code>accession</code>, <code>event</code>, <code>location</code>, <code>sowing</code>, <code>photo</code>, <code>taxon</code>, <code>setting</code>. A delete is a change setting <code>_deleted</code> to true; a later change to any other field of that record revives it. The fields <code>id</code>, <code>kind</code> and <code>_t</code> belong to the record and cannot be set by a change.</p>
  <p>To read a collection, sort the changes by <code>t</code> and apply them in order, keeping for each record and field the value with the greatest <code>t</code>. The result is the same whatever order the changes arrived in, and applying a change twice changes nothing. This is the whole merge rule; backup restore, the v2 import and sync all use it.</p>
  <p>Record shapes are plain JSON with flat fields. An accession (a plant) has <code>taxonName</code>, <code>taxonKey</code> (GBIF), <code>cultivar</code>, <code>nameKind</code> (species, cultivar or hybrid), <code>parentage</code>, <code>fieldNumber</code>, <code>provenance</code> (wild, f1, fn, veg, unknown), <code>status</code>, <code>locationId</code>, <code>acquired</code>, <code>sourceFrom</code>, <code>sourceForm</code>, <code>price</code>, <code>notes</code>, <code>sowingId</code>, <code>cover</code>. An event has <code>acc</code>, <code>d</code> (YYYY-MM-DD), <code>t</code> (water, feed, repot, measure, treat, flower, move, note, death, audit, germinate, potup, loss…), and <code>note</code>, <code>used</code>, <code>cause</code>, <code>measures</code>, <code>n</code> as the type needs. A photo record holds <code>acc</code> or <code>sowing</code>, <code>d</code>, <code>dFrom</code> (exif or added), <code>caption</code>, <code>w</code>, <code>h</code>, <code>bytes</code>, <code>sha</code>; its pixels are stored separately under the same id.</p>

  <h2 id="backup">The backup file</h2>
  <p><code>cultifolio-YYYY-MM-DD.cultifolio.zip</code>, an ordinary zip:</p>
<pre><code>{`manifest.json        format, version, when, device, counts, numbering scheme
changes.json         the whole change log, as above
photos/<id>.jpg      full-size JPEG, long edge 1600 px
photos/<id>.t.jpg    320 px thumbnail
plants.csv           one row per plant, for a spreadsheet (not for import)`}</code></pre>
  <p>Restoring merges by the log rule, so restoring an old file over a newer collection loses nothing and restoring twice changes nothing. The older changes-only JSON export (<code>{`{ "format": "cultifolio-changes", "changes": [...] }`}</code>) is still accepted, as is a v2 Herbarium backup.</p>

  <h2 id="sync">Sync on the wire</h2>
  <p>One vault key per person: 30 symbols from an alphabet without I, L, O, U, 0 or 1, in six groups of five. From it, HKDF-SHA-256 with salt <code>cultifolio-vault-v1</code> derives an AES-256-GCM key (info <code>enc</code>) and a 256-bit auth token (info <code>auth</code>, sent hex as a bearer). The vault id is the first 26 symbols of SHA-256 of <code>id:</code> + token, in the same alphabet. The server stores SHA-256 of <code>token:</code> + token and compares.</p>
  <p>A sealed blob is one version byte (1), a 12-byte IV, then AES-GCM ciphertext with associated data <code>vaultId|kind</code>, where kind is <code>log</code> or <code>photo</code>, so a blob cannot be replayed into another vault or as another kind. A log batch decrypts to <code>{`{ "v": 1, "device": "...", "changes": [...] }`}</code> and is stored at <code>vault/&lt;id&gt;/log/&lt;hlc&gt;.bin</code> where <code>&lt;hlc&gt;</code> is the batch's last change, so listing the prefix in key order is the log. A photo decrypts to a 4-byte big-endian length, the full JPEG, then the thumbnail, at <code>vault/&lt;id&gt;/photo/&lt;id&gt;.bin</code>. Nothing is rewritten or deleted.</p>
  <p>The endpoints: <code>POST /api/sync/vault</code> {`{ id, token, create }`}; <code>GET /api/sync/log?vault=&amp;after=</code>; <code>POST /api/sync/log?vault=</code> with header <code>X-Batch</code>; <code>GET /api/sync/log/&lt;hlc&gt;?vault=</code>; <code>PUT|GET|HEAD /api/sync/photo/&lt;id&gt;?vault=</code>. All but creation take <code>Authorization: Bearer &lt;token&gt;</code>.</p>

  <h2 id="dossier">A species dossier</h2>
  <p>Each species page is rendered from one JSON document, served at <code>/api/dossier/&lt;gbifKey&gt;</code>: name and classification, native range as TDWG level-3 codes, open occurrence points with licence tags, the habitat centre and how it was found, monthly climate with its sources, extremes, photographs with author and licence, the summary with its licence, literature, links, and an <code>upstream</code> block recording for every source whether it answered, refused, or was carried from an earlier build. The corpus is built from public data under CC0, CC BY and CC BY-SA and will be published as a dataset.</p>
</article>

<style>
  .prose { max-width: 720px; font-size: 15px; line-height: 1.6; color: var(--ink); font-family: var(--ui); }
  .prose h2 { font-family: var(--serif); font-size: 22px; margin: 28px 0 8px; }
  .prose p { margin: 0 0 12px; }
  .prose pre { background: var(--sunk); border-radius: 9px; padding: 12px 14px; overflow-x: auto; font-size: 12.5px; line-height: 1.5; margin: 0 0 12px; }
  .prose code { font-family: var(--mono); font-size: 12.5px; }
  .prose p code { background: var(--sunk); padding: 1px 5px; border-radius: 4px; }
  .topseg { margin: 14px 0 6px; }
</style>

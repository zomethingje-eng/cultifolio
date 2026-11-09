# Round 87, stage 2: browse (C6 to C9) — the about pages' sentences

Rule 5. Each sentence below is what the code on branch r87-s2browse does. HTML-ready; place as marked. Sentences marked
"replaces" are existing sentences this work makes untrue, with their new text.

## /about/how

### A new section after "Your collection" (`#collection`), before "Privacy": `<section aria-labelledby="browse-own">`, `<h2 id="browse-own">Browse, with your collection</h2>`

```html
<p class="sum">The browse pages are the same for everyone. Pins and the collection lens are worked out in your browser from your own collection.</p>
<ul class="plain">
  <li>A browse view can be pinned: its filters (regions, family, genus and the rest), not its order or its page. A pin is kept in your collection, so it syncs and is backed up with it, and goes nowhere else.</li>
  <li>A pin keeps the page ids of the view's species as they were when it was pinned, or when its changes were last opened. Your front page and the empty search box show each pin, and "+3 · −1 since 12 Nov" is the species the reference has added to the view and taken from it since then.</li>
  <li>A view of more than 3,000 species keeps no such list, and its pin says it is too many to follow for changes rather than a count.</li>
  <li>Opening a pin from the front page or the search box opens its changes, each species by name; one taken from the view that the reference no longer holds is counted, not named. From then on the pin counts from the view's species of that day. That it was opened from a pin is carried by the move itself, never in the address or the browser's storage.</li>
  <li>At most fifty views are pinned; past that, Pin says so.</li>
  <li>On a region's, a genus's or a family's page, a collection with a growing plant shows which of the page's species you grow now and which of your plants belong there. Your plants are matched in this browser against the reference's entries for their species, asked by hash group as a plant's page asks them. Yours and Not yours filter the page's results in this tab; neither is in the address or in any request.</li>
  <li>A plant filed under another page's name counts as that page's. A plant filed under its genus alone counts on its genus's page only.</li>
  <li>The map picker draws every TDWG level-3 region on the world map from this site's own files, and ticks a region by a press on it, by its keyboard (arrow keys move from region to region, Space ticks, + and - zoom) or by its list. Its files are fetched when it is opened.</li>
  <li>The results map shows how many of a view's species are native to each region, in steps its legend names. A region the view is filtered by holds every result and is drawn apart. Its files are fetched when the map is near the screen, and once the page is idle, so a printed page holds it.</li>
  <li>A region's page names the regions next door: those whose outlines in the shapes file touch it, a corner of one within 0.022 degrees (about 2.4 km) of the other's outline, minor islands left out. TDWG's own tables give no neighbours. Three regions have no outline there (Cocos (Keeling) Is., Christmas I., the South China Sea), and their pages say none was worked out.</li>
  <li>The list's record low is the index's: the lowest night in NASA POWER's daily series at the habitat's typical spot, as the species page gives it. An index built without it says "not in this index" and offers no order by it.</li>
  <li>Names on the browse pages are in one alphabet, English at base strength: accents and case are not differences, Æ is read as Ae, and numbers as numbers.</li>
</ul>
```

### Privacy (`#privacy`), the summary list: add after the item beginning "The about pages ask this site once for the reference's counts"

```html
<li>A browse page's own requests (<code>/browse/data</code>) carry the view's query alone: its count as you tick regions on the map, its regions' counts, its species for a pin. A pin's changes are asked with that pin's query, one request a pin shown, as opening the view would. Nothing of your plants is sent, and the collection lens asks only by hash group.</li>
```

### Privacy, "Full detail: what is sent": add after the item beginning "The text you type into the catalogue's search"

```html
<li>A browse view's query, to <code>/browse/data</code>, from the map picker (how many species the regions ticked give, and each region's count), from a pin (the view's species now, to count what changed), and for the names of the species a pin gained or lost (their page ids). The answer is the same for anyone who asks it.</li>
<li>Not your plants, on a region's, a genus's or a family's page: the collection lens asks for their species by hash group only, as a plant's page does.</li>
```

### "Full detail: what the server keeps": replaces the sentence at line 945

Old: `They are Compare, a species page or the front page the server cannot keep a copy of (one reached by an older name, a move inside the app, a HEAD), and every browse page (<code>/browse</code>, <code>/region</code>, <code>/genus</code>, <code>/family</code> and the pages under them).`

New: `They are Compare, a species page or the front page the server cannot keep a copy of (one reached by an older name, a move inside the app, a HEAD), every browse page (<code>/browse</code>, <code>/region</code>, <code>/genus</code>, <code>/family</code> and the pages under them) and a browse page's own requests (<code>/browse/data</code>).`

### "Full detail: the app kept on the device" (`#on-device`): replaces

Old: `It is installed at once on a page of your own collection (My plants, My spaces, Propagation, Today, Sync, Labels or Backup, an import among them), or as soon as the device holds a collection: a plant added, a species followed, a backup restored, sync set up.`

New: `It is installed at once on a page of your own collection (My plants, My spaces, Propagation, Today, Sync, Labels or Backup, an import among them), or as soon as the device holds a collection: a plant added, a species followed, a view pinned, a backup restored, sync set up.`

## /about/formats

### Section `#f-setting` (the setting records): add after the `numbers-kept` item

```html
<li>And one record for each pinned view, its id <code>pin-</code> and sixteen hex digits of a hash of its query, so a view pinned on two devices is one record: <code>href</code> (the page pinned), <code>view</code> (its browse query, such as <code>?r=NAM&amp;f=apocynaceae</code>), <code>label</code>, <code>made</code> and <code>seen</code> (days), <code>n</code> (its species when last seen) and <code>keys</code> (their page ids, written short: Kew's numbers in order, each as its distance from the one before in base-32 digits of a 64-letter alphabet, the last digit of each without its high bit, then <code>~</code> and GBIF's the same way; null for a view of more than 3,000 species). Unpinning removes the record.</li>
<li>A pin is a setting record, a kind every version reads, because a version refuses a batch that holds a kind it does not know, whole. A version before round eighty-seven folds pins as setting records it shows nothing of. Each pin is checked when it is read; one whose fields are not a pin's is not shown, and stays in the log as it is. A field this version does not know is passed over.</li>
```

### Replaces (line 367, the example's section)

Old: `A device's own collection is empty when its log holds nothing at all: no plant, removed or not, nothing in Propagation, no species followed or noted, no space and no numbering scheme.`

New: `A device's own collection is empty when its log holds nothing at all: no plant, removed or not, nothing in Propagation, no species followed or noted, no space, no numbering scheme and no pinned view.`

### The browse CSV's columns (where /about/formats or /about/how lists them, if it does): add

`record_low_c`: the record low, °C to a tenth, NASA POWER daily at the habitat's typical spot as the species page gives it; empty where the page has none, and the whole column empty where the index holds no record lows.

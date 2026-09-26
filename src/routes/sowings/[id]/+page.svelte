<script lang="ts">
  import { units } from '$lib/ui/units.svelte';
  import { localDate } from '$core/dates';
  import { temp, tempUnit, cToF, bottomHeat as heatCheck } from '$core/units';
  import { plural } from '$core/words';
  import { page } from '$app/state';
  import { accNo, sowNo } from '$lib/db/types';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { prefs } from '$lib/ui/prefs.svelte';
  import { collection } from '$lib/db/collection.svelte';
  import SpeciesName from '$lib/ui/SpeciesName.svelte';
  import LocationPicker from '$lib/ui/LocationPicker.svelte';
  import { slugify, speciesSlug } from '$core/names';
  import { EVENT_LABEL, PROP_METHODS, kindOf, type PropMethod, type Provenance } from '$lib/db/types';
  import { setCrumb } from '$lib/ui/crumb.svelte';
  import { entriesFor } from '$lib/ui/index.svelte';
  import type { IndexEntry } from '$lib/server/dossiers';
  import PhotoImg from '$lib/ui/PhotoImg.svelte';
  import PhotoAdd from '$lib/ui/PhotoAdd.svelte';
  import Lightbox from '$lib/ui/Lightbox.svelte';
  onMount(() => collection.load());
  const param = $derived(page.params.id!);
  const s = $derived(collection.sowing(param));
  const id = $derived(s?.id ?? param);
  const m = $derived(PROP_METHODS.find((x) => x.k === s?.method) ?? PROP_METHODS[0]);
  const st = $derived(collection.sowingStats(id));
  const events = $derived(collection.events(id));
  const raised = $derived(collection.raisedFrom(id));
  const photos = $derived(collection.photosOfSowing(id));
  let lightbox = $state<number | null>(null);
  const parent = $derived(s?.parentAcc ? collection.accession(s.parentAcc) : undefined);
  const today = () => localDate();
  let idx = $state<IndexEntry | undefined>(undefined);
  let thumbFailed = $state(false);
  $effect(() => {
    if (s) {
      setCrumb([{ label: 'Sowings', href: '/sowings' }, { label: `${sowNo(s)} · ${s.taxonName}` }]);
      entriesFor([speciesSlug(s.taxonName)]).then((m) => (idx = m?.get(speciesSlug(s.taxonName))));
    }
    return () => setCrumb([]);
  });

  // The batch believes what it is told, so what it is told is checked: a date on or after the sowing and not in the
  // future, a count that cannot exceed what went in or fall below what was already counted, a loss or a potting that
  // cannot exceed what is in the pot. Each refusal is a sentence under the form, never a silent no.
  const dateProblem = (d: string, what: string): string | null => {
    if (!d) return `Give the ${what} a date.`;
    if (d > today()) return `${what[0].toUpperCase()}${what.slice(1)} dated ${d} is in the future.`;
    if (s && d < s.sown) return `${what[0].toUpperCase()}${what.slice(1)} dated ${d} is before the sowing on ${s.sown}.`;
    return null;
  };
  /** A count can go only if what is left still covers what was potted and lost: the batch never says 0 up and 2 potted. */
  const canDropCount = (eventId: string): boolean => {
    const rest = collection.events(id).filter((e) => e.t === 'germinate' && e.id !== eventId).map((e) => e.n ?? 0);
    return (rest.length ? Math.max(...rest) : 0) >= st.potted + st.lost;
  };
  /* germination count */
  let gd = $state(today());
  let gn = $state<number | '' | null>(''); // null once a typed figure is cleared
  let gnote = $state('');
  let gmsg = $state('');
  async function count(e: SubmitEvent) {
    e.preventDefault();
    if (!s || gn == null || gn === '' || gn < 0) return;
    const n = Number(gn);
    gmsg = dateProblem(gd, 'count') ?? (n > s.count ? `${n} is more than the ${s.count} that went in; edit the batch if the count was wrong.` : n < st.germinated ? `${n} is fewer than the ${st.germinated} already counted; the count is the total up so far, so record losses instead.` : '');
    if (gmsg) return;
    await collection.addEvent({ acc: id, d: gd, t: 'germinate', n, note: gnote.trim() || null });
    gn = ''; gnote = '';
  }
  /* loss */
  let ld = $state(today());
  let ln = $state<number | '' | null>('');
  let lcause = $state('');
  let lmsg = $state('');
  async function loss(e: SubmitEvent) {
    e.preventDefault();
    if (ln == null || ln === '' || ln < 1) return;
    const n = Number(ln);
    lmsg = dateProblem(ld, 'loss') ?? (n > st.remaining ? (st.remaining ? `Only ${st.remaining} in the pot to lose.` : 'Nothing in the pot to lose: count the seedlings first.') : '');
    if (lmsg) return;
    await collection.addEvent({ acc: id, d: ld, t: 'loss', n, cause: lcause.trim() || null });
    ln = ''; lcause = '';
  }
  /* pot up */
  let potting = $state(false);
  let pd = $state(today());
  let pn = $state(1);
  let ploc = $state<string | null>(null);
  let pnote = $state('');
  let potted = $state<string[]>([]);
  let pmsg = $state('');
  async function potUp(e: SubmitEvent) {
    e.preventDefault();
    if (pn < 1) return;
    // A number is never reused, so a slip here would burn numbers for good: the pot decides how many can be potted.
    pmsg = dateProblem(pd, 'potting') ?? (st.remaining < 1 ? 'Nothing in the pot to pot up: count the seedlings first.' : pn > st.remaining ? `Only ${st.remaining} in the pot; each potted plant gets a number that is never reused.` : '');
    if (pmsg) return;
    const made = await collection.potUp(id, pn, { date: pd, locationId: ploc, note: pnote.trim() || null });
    potted = made.map((a) => accNo(a));
    potting = false;
    pnote = '';
  }
  /* note */
  let nd = $state(today());
  let ntext = $state('');
  let nmsg = $state('');
  async function note(e: SubmitEvent) {
    e.preventDefault();
    if (!ntext.trim()) return;
    nmsg = dateProblem(nd, 'note') ?? '';
    if (nmsg) return;
    await collection.addEvent({ acc: id, d: nd, t: 'note', note: ntext.trim() });
    ntext = '';
  }
  let confirmEvent = $state<string | null>(null);
  async function setStatus(status: 'active' | 'done' | 'failed') {
    await collection.put('sowing', id, { status });
  }
  async function remove() {
    if (raised.length) return;
    await collection.remove('sowing', id);
    goto('/sowings');
  }

  /* edit */
  let editing = $state(false);
  let f = $state({ taxonName: '', cultivar: '', method: 'seed' as PropMethod, sown: '', count: 0, sourceFrom: '', sourceRef: '', provenance: 'unknown' as Provenance, medium: '', container: '', treatment: '', bottomHeatC: '' as string | number | null, covered: false, locationId: null as string | null, notes: '' });
  function startEdit() {
    if (!s) return;
    f = { taxonName: s.taxonName, cultivar: s.cultivar ?? '', method: s.method, sown: s.sown, count: s.count, sourceFrom: s.sourceFrom ?? '', sourceRef: s.sourceRef ?? '', provenance: s.provenance ?? 'unknown', medium: s.medium ?? '', container: s.container ?? '', treatment: s.treatment ?? '', bottomHeatC: s.bottomHeatC == null ? '' : String(units.current === 'us' ? +cToF(s.bottomHeatC).toFixed(1) : s.bottomHeatC), covered: s.covered ?? false, locationId: s.locationId ?? null, notes: s.notes ?? '' };
    editing = true;
  }
  let heatMsg = $state('');
  async function saveEdit() {
    if (!s) return;
    const heat = heatCheck(f.bottomHeatC, units.current); // the same check as the new-batch form: 77 does not save as 77 °C here either
    heatMsg = heat.msg;
    if (heatMsg) {
      document.getElementById('se-heat')?.focus();
      return;
    }
    await collection.put('sowing', id, {
      taxonName: f.taxonName.trim() || s.taxonName, cultivar: f.cultivar.trim() || null, method: f.method, sown: f.sown || s.sown, count: Math.max(1, Number(f.count) || s.count),
      sourceFrom: f.sourceFrom.trim() || null, sourceRef: f.sourceRef.trim() || null, provenance: f.provenance, medium: f.medium.trim() || null, container: f.container.trim() || null,
      treatment: f.treatment.trim() || null, bottomHeatC: heat.c, covered: f.covered, locationId: f.locationId ?? null, notes: f.notes.trim() || null
    });
    editing = false;
  }
  const pct = (r: number | null) => (r == null ? '–' : `${Math.round(r * 100)}%`);
</script>

<svelte:head><title>{s ? `${sowNo(s)} ${s.taxonName}` : param} — Cultifolio</title></svelte:head>

{#if !collection.ready}
  <p class="muted">Opening your collection…</p>
{:else if !s}
  <h1 class="q" style="margin-top: 24px">{param}</h1>
  <p class="muted">No sowing with this number on this device.</p>
{:else}
  <div class="hero">
    {#if idx?.thumb && prefs.referencePhotos && !thumbFailed}<img src={idx.thumb} alt={s.taxonName} style="max-height: 220px" onerror={() => (thumbFailed = true)} /><span class="cred">species photograph</span>{:else if idx?.thumb && prefs.referencePhotos}<div class="ph empty" style="height: 120px">No photograph yet.</div>{:else}<div class="ph" style="height: 120px">{m.label}</div>{/if}
  </div>
  <div class="idcard">
    <div class="who">
      <h1 class="sci"><span class="accno big lead">{sowNo(s)}</span><SpeciesName name={s.taxonName} />{#if s.cultivar}{' '}<span style="font-style: normal">‘{s.cultivar}’</span>{/if}{#if kindOf(s) !== 'species'}{' '}<span class="pill c" style="vertical-align: middle">{kindOf(s)}</span>{/if}</h1>
      {#if kindOf(s) === 'hybrid' && s.parentage}<p class="vern"><SpeciesName name={s.parentage} /></p>{/if}
      <p class="vern">
        {s.count} {m.unit} on {s.sown}
        {#if parent} from <a class="mono" href="/plants/{accNo(parent)}">{accNo(parent)}</a>{:else if s.sourceFrom} from {s.sourceFrom}{/if}{#if s.sourceRef} · <span class="fnchip">{s.sourceRef}</span>{/if}
        {#if !m.veg} · {s.provenance === 'wild' ? 'wild-collected seed' : s.provenance === 'f1' ? 'seed from ex-habitat plants' : s.provenance === 'fn' ? 'seed from cultivated plants' : 'seed provenance not stated'}{/if}
      </p>
      <div class="pills">
        <span class="pill {s.status === 'active' ? 'a' : s.status === 'failed' ? 'b' : ''}">{s.status === 'active' ? 'in progress' : s.status}</span>
        <span class="pill">{m.label}</span>
        {#if s.locationId}<a class="pill" href="/benches/{s.locationId}">{collection.locationName(s.locationId)}</a>{/if}
        {#if s.bottomHeatC != null}<span class="pill w">bottom heat {temp(s.bottomHeatC, units.current)}</span>{/if}
        {#if s.covered}<span class="pill c">covered</span>{/if}
      </div>
    </div>
    <div class="acts">
      <a class="btn" href="/species/{speciesSlug(s.taxonName)}">Species page</a>
      <button class="btn" onclick={startEdit}>Edit</button>
      {#if s.status === 'active'}
        <button class="btn" onclick={() => setStatus('done')}>Mark done</button>
        {#if !raised.length}<button class="btn" onclick={() => setStatus('failed')}>Mark failed</button>{/if}
      {:else}
        <button class="btn" onclick={() => setStatus('active')}>Reopen</button>
      {/if}
    </div>
  </div>

  {#if editing}
    <form class="cult editform" onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
      <label><span>Species</span><input id="se-name" type="text" bind:value={f.taxonName} /></label>
      <label><span>Cultivar</span><input id="se-cv" type="text" bind:value={f.cultivar} /></label>
      <label><span>Method</span><select id="se-method" bind:value={f.method}>{#each PROP_METHODS as pm}<option value={pm.k}>{pm.label}</option>{/each}</select></label>
      <label><span>Date</span><input id="se-date" type="date" bind:value={f.sown} /></label>
      <label><span>Started</span><input id="se-count" type="number" min="1" bind:value={f.count} /></label>
      <label><span>Seed from</span><input id="se-from" type="text" bind:value={f.sourceFrom} /></label>
      <label><span>Lot / field no.</span><input id="se-ref" type="text" bind:value={f.sourceRef} /></label>
      <label><span>Seed provenance</span><select id="se-prov" bind:value={f.provenance}><option value="unknown">Not stated</option><option value="wild">Wild-collected</option><option value="f1">Ex-habitat plants</option><option value="fn">Cultivated plants</option><option value="veg">Vegetative</option></select></label>
      <label><span>Medium</span><input id="se-medium" type="text" bind:value={f.medium} /></label>
      <label><span>Container</span><input id="se-container" type="text" bind:value={f.container} /></label>
      <label><span>Pre-treatment</span><input id="se-treat" type="text" bind:value={f.treatment} /></label>
      <label><span>Bottom heat {tempUnit(units.current)}</span><input id="se-heat" type="number" step="0.5" bind:value={f.bottomHeatC} placeholder="blank if none" oninput={() => (heatMsg = '')} aria-invalid={!!heatMsg} aria-describedby={heatMsg ? 'se-heat-bad' : undefined} />{#if heatMsg}<span class="bad small" id="se-heat-bad">{heatMsg}</span>{/if}</label>
      <label class="row"><input id="se-covered" type="checkbox" bind:checked={f.covered} /> Covered</label>
      <div class="wide"><span class="lbl">Where</span><LocationPicker bind:value={f.locationId} id="se-loc" label="Where" /></div>
      <label class="wide"><span>Notes</span><textarea id="se-notes" rows="3" bind:value={f.notes}></textarea></label>
      <div class="actions wide"><button class="btn" type="button" onclick={() => (editing = false)}>Cancel</button><button class="btn pri" type="submit">Save</button></div>
    </form>
  {/if}

  <div class="cards">
    <div class="card"><div class="lab">Day</div><div class="val">{st.days}</div><div class="sub">since {s.sown}</div></div>
    <div class="card"><div class="lab">{m.veg ? 'Struck' : 'Germinated'}</div><div class="val">{st.germinated}<span class="u"> / {s.count}</span></div><div class="gauge"><i style="width: {Math.min(100, (st.rate ?? 0) * 100)}%"></i></div><div class="sub">{pct(st.rate)}{#if st.daysToFirst != null} · first at day {st.daysToFirst}{/if}</div></div>
    <div class="card"><div class="lab">Potted up</div><div class="val">{st.potted}</div><div class="sub">{raised.length ? `${raised.length} numbered plant${raised.length === 1 ? '' : 's'}` : 'none yet'}</div></div>
    <div class="card"><div class="lab">Still in the pot</div><div class="val">{st.remaining}</div><div class="sub">{st.lost ? `${st.lost} lost` : 'no losses recorded'}</div></div>
  </div>

  {#if potted.length}
    <div class="notice ok">Potted up {potted.length}: {#each potted as p, i}{#if i}, {/if}<a class="mono" href="/plants/{p}">{p}</a>{/each}.</div>
  {/if}

  {#if s.status !== 'active'}
    <p class="empty" style="margin: 14px 0">This batch is {s.status === 'done' ? 'done' : 'marked failed'}; Reopen it to record more.</p>
  {:else}
  <div class="acts3">
    <form class="cult act" onsubmit={count}>
      <div class="sum">{m.veg ? 'Count what has struck' : 'Count seedlings'} <span class="hint">the total up so far</span></div>
      <div class="fields">
        <div class="row"><input id="g-date" type="date" aria-label="Date counted" bind:value={gd} /><input id="g-n" type="number" min="0" placeholder="up so far" aria-label="Up so far" bind:value={gn} /></div>
        <input id="g-note" type="text" placeholder="note (optional)" aria-label="Note" bind:value={gnote} />
        {#if gmsg}<p class="refuse" role="alert">{gmsg}</p>{/if}
        <div class="end"><button class="btn pri" type="submit" disabled={gn == null || gn === ''}>Record count</button></div>
      </div>
    </form>
    <form class="cult act" onsubmit={loss}>
      <div class="sum">Record losses <span class="hint">damping off, drying out, eaten, rot</span></div>
      <div class="fields">
        <div class="row"><input id="l-date" type="date" aria-label="Date of loss" bind:value={ld} /><input id="l-n" type="number" min="1" placeholder="how many" aria-label="How many lost" bind:value={ln} /></div>
        <input id="l-cause" type="text" placeholder="cause" aria-label="Cause" bind:value={lcause} />
        {#if lmsg}<p class="refuse" role="alert">{lmsg}</p>{/if}
        <div class="end"><button class="btn" type="submit" disabled={ln == null || ln === ''}>Record loss</button></div>
      </div>
    </form>
    <div class="cult act">
      <div class="sum">Pot up <span class="hint">each plant gets its own number</span></div>
      {#if potting}
        <form onsubmit={potUp} class="fields">
          <div class="row"><input id="p-date" type="date" aria-label="Date potted up" bind:value={pd} /><input id="p-n" type="number" min="1" aria-label="How many to pot up" bind:value={pn} /></div>
          <LocationPicker bind:value={ploc} id="p-loc" label="Where they go" />
          <input id="p-note" type="text" placeholder="note (optional)" aria-label="Note" bind:value={pnote} />
          {#if pmsg}<p class="refuse" role="alert">{pmsg}</p>{/if}
          <div class="end"><button class="btn" type="button" onclick={() => (potting = false)}>Cancel</button><button class="btn pri" type="submit">Pot up {pn}</button></div>
        </form>
      {:else}
        <div class="fields"><p class="small muted" style="margin: 0">{st.remaining ? `${st.remaining} in the pot. ` : ''}The batch becomes their provenance: {m.veg ? 'the parent plant and the method' : 'seed source, lot and the right provenance class'} carry to every plant.</p><div class="end"><button class="btn pri" disabled={st.remaining < 1} title={st.remaining < 1 ? 'Count the seedlings first' : undefined} onclick={() => { potting = true; pmsg = ''; pn = Math.max(1, st.remaining || 1); ploc = s.locationId ?? null; }}>Pot up…</button></div></div>
      {/if}
    </div>
  </div>
  {/if}

  {#if raised.length}
    <div class="secrule"><h2>Plants raised from this batch</h2><div class="line"></div><span class="n">{raised.length}</span></div>
    <div class="rows">
      {#each raised as a}
        {@const own = collection.cover(a.id)}
        <a class="azrow accrow" href="/plants/{accNo(a)}"><span class="im">{#if own}<PhotoImg id={own.id} alt="" loading="lazy" />{:else}–{/if}</span><span><span class="nm"><span class="accno lead">{accNo(a)}</span><SpeciesName name={a.taxonName} /></span><span class="fam">{a.acquired ?? ''}{#if a.locationId} · {collection.locationName(a.locationId)}{/if}</span></span><span class="fig">{a.status}</span></a>
      {/each}
    </div>
  {/if}

  <div class="secrule" id="photos"><h2>Photographs</h2><div class="line"></div><span class="n">{photos.length || ''}</span></div>
  <div class="cult addrow"><PhotoAdd sowing={id} id="sow-photo" compact={photos.length > 0} /></div>
  {#if photos.length}
    <div class="phgrid">
      {#each photos as ph, i (ph.id)}
        <button class="ph" type="button" onclick={() => (lightbox = i)} title={ph.caption ?? ph.d}><PhotoImg id={ph.id} alt={ph.caption ?? ph.d} loading="lazy" /><span class="pd">{ph.d}</span></button>
      {/each}
    </div>
  {/if}
  {#if lightbox != null && photos.length}<Lightbox {photos} bind:index={lightbox} onclose={() => (lightbox = null)} />{/if}

  <div class="secrule"><h2>Log</h2><div class="line"></div><span class="n">{plural(events.length, 'entry', 'entries')}</span></div>
  <form class="noteform" onsubmit={note}>
    <input id="n-date" type="date" aria-label="Date of the note" bind:value={nd} /><input id="n-text" type="text" placeholder="Add a note to the log" aria-label="Note" bind:value={ntext} /><button class="btn" type="submit" disabled={!ntext.trim()}>Add</button>
  </form>
  {#if nmsg}<p class="refuse" role="alert">{nmsg}</p>{/if}
  {#if !events.length}
    <div class="cult"><div class="none">Nothing recorded yet.</div></div>
  {:else}
    <div class="tl">
      {#each events as e}
        <div class="tlrow">
          <span class="d">{e.d}</span>
          <span class="t">{EVENT_LABEL[e.t] ?? e.t}{#if e.n != null}&nbsp;<b>{e.n}</b>{/if}{#if e.cause}<span class="x2">{' · '}{e.cause}</span>{/if}{#if e.note}<span class="x2">{' · '}{e.note}</span>{/if}</span>
          {#if e.t === 'potup'}<span class="x small muted">kept: the plants exist</span>{:else if e.t === 'germinate' && !canDropCount(e.id)}<span class="x small muted" title="Without this count the batch would show fewer up than were potted and lost">kept: the potted plants rest on it</span>{:else if confirmEvent === e.id}<button class="rm confirm" type="button" onclick={() => { collection.remove('event', e.id); confirmEvent = null; }}>Remove?</button>{:else}<button class="rm" type="button" title="Remove this entry" aria-label="Remove this entry" onclick={() => (confirmEvent = e.id)}>×</button>{/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="secrule"><h2>{m.veg ? 'How it was started' : 'How it was sown'}</h2><div class="line"></div></div>
  <div class="factgrid">
    <div><b>Medium</b>{s.medium ?? 'not stated'}</div>
    <div><b>Container</b>{s.container ?? 'not stated'}</div>
    <div><b>Pre-treatment</b>{s.treatment ?? 'none'}</div>
    <div><b>Warmth and cover</b>{s.bottomHeatC != null ? `bottom heat ${temp(s.bottomHeatC, units.current)}` : 'no bottom heat'}{s.covered ? ' · covered' : ''}</div>
    {#if s.notes}<div class="wide"><b>Notes</b><span style="white-space: pre-wrap">{s.notes}</span></div>{/if}
  </div>

  {#if !raised.length}
    <div class="dangerrow">
      <span class="small muted">A batch that raised no plants can be removed; one that did keeps its number.</span>
      <button class="btn danger" onclick={remove}>Remove batch</button>
    </div>
  {/if}
{/if}

<style>
  .hero { margin-top: 14px; }
  .hero .ph { background: linear-gradient(135deg, var(--sunk), color-mix(in srgb, var(--sunk) 70%, var(--accent-soft))); }
  .muted { color: var(--ink3); }
  .editform { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 12px; padding: 14px 17px; margin-top: 16px; }
  .editform label { display: grid; gap: 4px; }
  .editform label > span, .editform .lbl { font-size: 10.5px; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink3); font-weight: 700; }
  .editform label.row { display: flex; align-items: center; gap: 8px; align-self: end; font-size: 13px; }
  .editform input, .editform select, .editform textarea, .fields input { width: 100%; font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .wide { grid-column: 1 / -1; }
  .actions, .end { display: flex; justify-content: flex-end; gap: 8px; margin: 0; }
  .addrow { padding: 12px 17px; margin-top: 12px; }
  .im :global(img) { width: 100%; height: 100%; object-fit: cover; }
  .phgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
  .phgrid .ph { position: relative; display: block; padding: 0; border: 0; background: var(--sunk); border-radius: 10px; overflow: hidden; aspect-ratio: 1; cursor: zoom-in; box-shadow: var(--sh); }
  .phgrid .ph :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .phgrid .pd { position: absolute; left: 8px; bottom: 7px; font-family: var(--mono); font-size: 10.5px; color: #fff; background: rgba(8, 20, 16, 0.6); padding: 2px 6px; border-radius: 5px; }
  .acts3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
  .act { margin: 0; display: flex; flex-direction: column; }
  .fields { display: grid; gap: 8px; padding: 13px 17px 15px; }
  .fields .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .noteform { display: grid; grid-template-columns: 10rem 1fr auto; gap: 8px; margin-bottom: 10px; }
  .noteform input { font: inherit; font-size: 14px; padding: 8px 11px; border: 1px solid var(--rule); border-radius: 9px; background: var(--card); color: var(--ink); }
  .tlrow .x2 { font-weight: 400; color: var(--ink2); font-size: 12.5px; }
  .factgrid .wide { grid-column: 1 / -1; }
  .accrow .nm .accno { font-style: normal; vertical-align: 2px; }
  .refuse { margin: 6px 0 0; font-size: 12.5px; color: var(--bad); }
  .rm { border: 0; background: none; color: var(--ink3); font: inherit; cursor: pointer; min-width: 32px; min-height: 32px; border-radius: 6px; }
  .rm:hover { color: var(--bad); background: var(--sunk); }
  .rm.confirm { color: var(--bad); font-size: 12.5px; font-weight: 600; }
  .dangerrow { margin: 46px 0 10px; padding: 0; display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 12.5px; color: var(--ink3); }
  a.pill { color: inherit; }
  @media (max-width: 720px) { .acts3 { grid-template-columns: 1fr; } .editform { grid-template-columns: 1fr 1fr; } .noteform { grid-template-columns: 1fr; } .hero { margin-top: 0; } }
</style>

<script lang="ts">
  /**
   * "Watering in your calendar" on Today (round sixty; the product review's 9 and Part E 4.1 option B, the self-review's
   * experience item 6): the rhythms as a .ics file made on this device and downloaded, for the grower to import into a
   * calendar of their choosing. No server, no subscription address, nothing sent: the calendar app keeps the file.
   */
  import { collection, DUE_DAYS } from '$lib/db/collection.svelte';
  import { localDate } from '$core/dates';
  import { icsOf, type RhythmSource } from '$lib/export/rhythms';
  import { saveFile } from '$lib/export/save';
  import { DRY_HORIZON_DAYS } from '$lib/export/ics';
  import { accNo } from '$lib/db/types';
  let msg = $state('');
  const growing = $derived(collection.ready ? collection.accessions.filter((a) => a.status === 'growing') : []);
  function sourceOf(): RhythmSource {
    const today = localDate();
    return {
      today,
      plants: growing.map((a) => ({ id: a.id, no: accNo(a), name: a.taxonName + (a.cultivar ? ` ‘${a.cultivar}’` : ''), placeId: collection.placeOf(a.locationId) ?? null, ownDays: typeof a.waterDays === 'number' && a.waterDays > 0 ? a.waterDays : null })),
      placeName: (id) => collection.locationName(id),
      rule: (id) => { const c = id ? collection.conditions(id) : null; return { every: c?.waterDays && c.waterDays > 0 ? c.waterDays : DUE_DAYS, dry: c?.dryMonths ?? [] }; },
      from: (id) => collection.lastWatered(id) ?? collection.madeOn('accession', id) ?? collection.accession(id)?.acquired ?? today
    };
  }
  function download() {
    const src = sourceOf();
    const text = icsOf(src);
    saveFile(new Blob([text], { type: 'text/calendar;charset=utf-8' }), `cultifolio-watering-${src.today}.ics`);
    const n = (text.match(/BEGIN:VEVENT/g) ?? []).length;
    msg = `Made on this device: ${n} repeating event${n === 1 ? '' : 's'}. Now open the file to add it to your calendar.`;
  }
</script>

{#if growing.length}
  <details class="cal" id="calendar">
    <summary>Watering in your phone's calendar</summary>
    <p>A calendar file with one all-day event per place, and one per plant with a rhythm of its own, repeating at its rhythm from its next due day. Months a place is kept dry are left out for the next {Math.round(DRY_HORIZON_DAYS / 365)} years; download it again after that, or when a rhythm changes. It is made here; the calendar you add it to keeps the place names and rhythms.</p>
    <button class="btn" type="button" id="ics-download" onclick={download}>Download watering calendar (.ics)</button>
    {#if msg}<p class="muted" role="status">{msg}</p>{/if}
    <ul class="how">
      <li><b>iPhone:</b> open the downloaded file (in Files, or the download list in Safari), tap Add All, then choose a calendar.</li>
      <li><b>Android:</b> on a computer, open Google Calendar, then Settings, Import and export, and import the file; it reaches the phone with your calendar. Some phone calendars open the file directly.</li>
      <li><b>Computer:</b> double-click the file, or use your calendar's Import.</li>
    </ul>
  </details>
{/if}

<style>
  .cal { margin: 12px 0 0; padding: 4px 14px; background: var(--card); border-radius: var(--r); box-shadow: var(--sh); font-size: var(--fs-md); }
  .cal summary { cursor: pointer; min-height: var(--tap); display: flex; align-items: center; font-weight: 600; }
  .cal p { margin: 0 0 10px; }
  .cal .btn { min-height: var(--tap); margin-bottom: 8px; }
  .how { margin: 4px 0 10px; padding-left: 18px; color: var(--ink2); }
  .how li + li { margin-top: 4px; }
  .muted { color: var(--ink3); }
</style>

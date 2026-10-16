/**
 * What the sync engine reports, in sentences a grower understands, with the engine's own words kept for a "Details"
 * disclosure. The page printed "push failed: 400" and "batch 0001791144…: 404" as they were (round sixty; the words
 * review, 15). "Sync bundle", not "batch": a batch is a sowing on every other page (the words review, 16).
 */
export type SyncWords = { text: string; detail: string | null };

const NEXT = 'tried again at the next sync';
/** A bare 5xx: no sentence of the server's, so not a refusal; said as no answer, as `failureKind` reads it for the reference (round seventy; triage-69 W2, S-E2). */
const bare5xx = (code: string) => code.startsWith('5') && code !== '503';
/** A wait as a person reads it: "45 seconds", "10 minutes". */
const waitFor = (s: number) => (s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes`);

export function syncWords(raw: string | null | undefined): SyncWords | null {
  if (!raw) return null;
  const s = raw.trim();
  let m: RegExpExecArray | null;
  // What came in before the run stopped is said after why it stopped: "received 3 batches; Uploading is refused…" fell
  // through to "Sync stopped on something it could not finish" (round seventy; triage-69 W2).
  if ((m = /^received (\d+) batch(?:es)?; (.+)$/s.exec(s))) {
    const rest = syncWords(m[2])!;
    const n = Number(m[1]);
    return { text: `${rest.text} Changes from your other devices still came in (${n} sync bundle${n === 1 ? '' : 's'}).`, detail: rest.detail ? s : null };
  }
  if ((m = /^photo push failed: (\d+)/.exec(s))) return { text: bare5xx(m[1]) ? `The server did not answer when this device sent a photograph (${m[1]}). It is kept here and ${NEXT}.` : `The server did not take a photograph from this device (${m[1]}). It is kept here and ${NEXT}.`, detail: s };
  if ((m = /^push failed: (\d+)/.exec(s))) return { text: m[1] === '503' ? 'The server is not taking changes from this vault for now. They are kept on this device and sent once it does.' : bare5xx(m[1]) ? `The server did not answer when this device sent its changes (${m[1]}). They are kept here and ${NEXT}.` : `The server refused a change from this device (${m[1]}). It is kept here and ${NEXT}.`, detail: s };
  if ((m = /^pull failed: (\d+)/.exec(s))) return { text: bare5xx(m[1]) ? `The server did not answer when this device asked for the changes waiting for it (${m[1]}). Nothing here changed; ${NEXT}.` : `The server did not list the changes waiting for this device (${m[1]}). Nothing here changed; ${NEXT}.`, detail: s };
  if (/removal: \d+/.test(s)) return { text: `A photograph's removal did not reach the server. It is ${NEXT}.`, detail: s };
  if (/^photo \S+: \d+/.test(s)) return { text: `A photograph listed on the server could not be fetched. It is ${NEXT}.`, detail: s };
  if (/^batch \S+: \d+/.test(s)) return { text: `A sync bundle listed on the server could not be fetched. It is ${NEXT}.`, detail: s };
  if (/pixels do not match/.test(s)) return { text: `A photograph arrived damaged and was not kept. It is ${NEXT}.`, detail: s };
  if (/not a batch this version understands/.test(s)) return { text: 'A sync bundle from a newer version of the app could not be read here. Updating the app on this device reads it.', detail: s };
  // A 429 is a refusal, said with the server's reason (round seventy; triage-69 W2, S-E2: it read "the server is busy").
  if ((m = /^the server refused this device for (\d+) s: (.+)$/s.exec(s))) return { text: `The server refused sync from this device for now: ${m[2]}. It syncs again in ${waitFor(Number(m[1]))}; your changes are kept here.`, detail: s };
  if ((m = /^the server asked this device to wait (\d+) s before syncing again/.exec(s))) return { text: `The server refused sync from this device for now and asked this device to wait ${m[1]} seconds. Your changes are kept here; it syncs again then.`, detail: s };
  // A 503 with a short wait and no sentence (the platform's own): neither a refusal nor a silence.
  if ((m = /^the sync server asked this device to wait (\d+) s/.exec(s))) return { text: `The server could not take this device's changes just now and asked it to wait ${m[1]} seconds. They are kept here; it sends them then.`, detail: s };
  if (/cursor stays before it/.test(s)) return { text: "The server's clock reads ahead of itself. Syncing works, a little slower, until it is put right.", detail: s };
  // Already a sentence (the server's own refusal, a full device): said as it is.
  if (/^[A-Z]/.test(s) && /[.!?]$/.test(s)) return { text: s, detail: null };
  return { text: `Sync stopped on something it could not finish. Your changes are kept here and ${NEXT}.`, detail: s };
}

/**
 * What the sync page says is kept on this device while the server's refusal stands (round seventy-one; self-review E6).
 * It said "Your changes are kept here meanwhile" of every refusal, after the server's own sentence for the vault's hour
 * of photographs ("…changes to your records still go"): under that refusal, and under the day's upload allowance, a
 * record's changes still go (the day's, those in sync bundles of 16 KB or less).
 */
export function refusalKept(r: { day?: boolean; photos?: boolean; small?: { until: number } }, now = Date.now()): string {
  // A shorter refusal met under the day's holds every upload until it ends (round seventy-two; E5).
  if (r.day && r.small && r.small.until > now) return 'Your changes are kept here meanwhile, and changes from your other devices still come in.';
  if (r.photos) return 'Photographs are kept here meanwhile; changes to your records still go, and changes from your other devices still come in.';
  if (r.day) return 'Photographs, and sync bundles of changes over 16 KB, are kept here meanwhile; smaller bundles of changes still go, and changes from your other devices still come in.';
  return 'Your changes are kept here meanwhile, and changes from your other devices still come in.';
}

/**
 * When a device that did not reach the server checks again, as the status card says it: a minute on, or longer after a
 * photograph that did not finish (round seventy-one; self-review E8: the engine's wait doubles with each, and the card
 * said "in a minute" whatever it was).
 */
export function checkAgainWords(retryAt: number | null | undefined, now = Date.now()): string {
  const mins = retryAt == null ? 1 : Math.max(1, Math.round((retryAt - now) / 60_000));
  return mins <= 1 ? 'again in a minute' : `again in about ${mins} minutes`;
}

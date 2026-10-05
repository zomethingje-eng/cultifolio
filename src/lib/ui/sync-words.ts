/**
 * What the sync engine reports, in sentences a grower understands, with the engine's own words kept for a "Details"
 * disclosure. The page printed "push failed: 400" and "batch 0001791144…: 404" as they were (round sixty; the words
 * review, 15). "Sync bundle", not "batch": a batch is a sowing on every other page (the words review, 16).
 */
export type SyncWords = { text: string; detail: string | null };

const NEXT = 'tried again at the next sync';

export function syncWords(raw: string | null | undefined): SyncWords | null {
  if (!raw) return null;
  const s = raw.trim();
  let m: RegExpExecArray | null;
  if ((m = /^photo push failed: (\d+)/.exec(s))) return { text: `The server did not take a photograph from this device (${m[1]}). It is kept here and ${NEXT}.`, detail: s };
  if ((m = /^push failed: (\d+)/.exec(s))) return { text: m[1] === '503' ? 'The server is not taking changes from this vault for now. They are kept on this device and sent once it does.' : `The server refused a change from this device (${m[1]}). It is kept here and ${NEXT}.`, detail: s };
  if ((m = /^pull failed: (\d+)/.exec(s))) return { text: `The server did not list the changes waiting for this device (${m[1]}). Nothing here changed; ${NEXT}.`, detail: s };
  if (/removal: \d+/.test(s)) return { text: `A photograph's removal did not reach the server. It is ${NEXT}.`, detail: s };
  if (/^photo \S+: \d+/.test(s)) return { text: `A photograph listed on the server could not be fetched. It is ${NEXT}.`, detail: s };
  if (/^batch \S+: \d+/.test(s)) return { text: `A sync bundle listed on the server could not be fetched. It is ${NEXT}.`, detail: s };
  if (/pixels do not match/.test(s)) return { text: `A photograph arrived damaged and was not kept. It is ${NEXT}.`, detail: s };
  if (/not a batch this version understands/.test(s)) return { text: 'A sync bundle from a newer version of the app could not be read here. Updating the app on this device reads it.', detail: s };
  if ((m = /asked this device to wait (\d+) s/.exec(s))) return { text: `The server is busy and asked this device to wait ${m[1]} seconds. Your changes are kept here; it syncs again then.`, detail: s };
  if (/cursor stays before it/.test(s)) return { text: "The server's clock reads ahead of itself. Syncing works, a little slower, until it is put right.", detail: s };
  // Already a sentence (the server's own refusal, a full device): said as it is.
  if (/^[A-Z]/.test(s) && /[.!?]$/.test(s)) return { text: s, detail: null };
  return { text: `Sync stopped on something it could not finish. Your changes are kept here and ${NEXT}.`, detail: s };
}

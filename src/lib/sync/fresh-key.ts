/**
 * The new-vault key kept for the tab's life (round forty-nine, 3), and when it may be shown again (round eighty-six;
 * outside review B's sync journey: after a backup replaced the collection and turned sync off, the page reopened on the
 * new-key form with a key made before the replace, and said nothing of the replace or the choice it leaves).
 *
 * The key is kept with the moment it was made. A key made before the collection was replaced belongs to a set-up the
 * replace overtook: it is dropped, and the page says what the replace did and offers a new vault or a rejoin. A key made
 * after it, or with no replace since, is the one the grower was shown, and the form comes back with it.
 */
export type WasIn = { vaultId: string; at: string; why: 'stopped' | 'replaced' } | null | undefined;

export const keepFresh = (key: string, now = Date.now()): string => JSON.stringify({ k: key, at: now });

/** The kept key to show again, or null (and the caller drops what is kept). */
export function resumeFresh(raw: string | null, wasIn: WasIn): string | null {
  if (!raw) return null;
  let key = raw;
  let at = 0; // a key kept by an earlier version, as a bare string: its moment is not known
  try {
    const o = JSON.parse(raw) as { k?: unknown; at?: unknown };
    if (o && typeof o.k === 'string') { key = o.k; at = typeof o.at === 'number' ? o.at : 0; }
  } catch { /* the bare key of an earlier version */ }
  if (wasIn?.why === 'replaced') {
    const replaced = Date.parse(wasIn.at);
    if (!Number.isFinite(replaced) || at <= replaced) return null;
  }
  return key;
}

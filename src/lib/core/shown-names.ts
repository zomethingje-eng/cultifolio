/**
 * The record's older names that are the page's own (the merge, round eighty-five; the owner's decision 6, N's
 * `name.kew.elsewhere`): GBIF's names stored on the page that Kew's file places only in another plant are not this
 * page's names. The index already leaves them out of the search and the addresses; the page leaves them out of what it
 * shows as older names, so Echinopsis macrogona no longer lists Trichocereus pachanoi, Kew's synonym of Echinopsis
 * pachanoi. Compared as stored, exact string for string, as the fill wrote them. A dossier written before (no
 * `elsewhere`) keeps every name, as before.
 */
export function ownSynonyms(name: { synonyms?: readonly string[] | null; kew?: { elsewhere?: readonly string[] | null } | null }): string[] {
  const away = new Set(name.kew?.elsewhere ?? []);
  return (name.synonyms ?? []).filter((s) => !away.has(s));
}

/**
 * An autonym, written as Kew writes it ("Stapelia hirsuta var. hirsuta"): below species, its last epithet the species'.
 * The Code of nomenclature gives an autonym no author of its own (Art. 22.1, 26.1), so its page says that rather than
 * that the backbone did not state one (the merge, round eighty-five; outside review A9b).
 */
export function isAutonymName(name: string): boolean {
  const w = name.replace(/×\s*/g, '').trim().split(/\s+/);
  return w.length === 4 && /^(subsp\.|var\.|f\.|subvar\.|subf\.)$/.test(w[2]) && w[1] === w[3];
}

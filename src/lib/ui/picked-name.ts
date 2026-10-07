import { parseName } from '$core/names';

/**
 * The name a pick in the species picker writes into the field (round sixty-one; the corpus review, 5).
 *
 * The picked suggestion's name replaces only what it names. A cross keeps its parentage as typed. A species picked for
 * a name typed below species rank keeps the typed rank and epithet after it, as a cultivar is kept: picking "Copiapoa
 * cinerea" for "Copiapoa cinerea var. columna-alba" wrote "Copiapoa cinerea", and the variety was gone from the record
 * about to be saved. A suggestion that is itself below species rank (the backbone's "… var. columna-alba") is its own
 * whole name.
 */
export function pickedName(typed: string, picked: { name: string; rank?: string }): string {
  const p = parseName(typed);
  const cv = p.cultivar ? ` '${p.cultivar}'` : '';
  if (p.parentage) return `${p.parentage}${cv}`;
  const atSpecies = !picked.rank || picked.rank === 'SPECIES';
  const binomial = picked.name.trim().split(/\s+/).length === 2;
  const head = p.epithet ? `${p.genus} ${p.epithet} ` : '';
  const rest = head && p.scientific.startsWith(head) ? p.scientific.slice(head.length).trim() : '';
  return picked.name + (atSpecies && binomial && rest ? ` ${rest}` : '') + cv;
}

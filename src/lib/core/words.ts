/** Small words the interface needs right: a count with its noun, so "1 plants" never prints. */

/**
 * `plural(1, 'plant')` → "1 plant"; `plural(3, 'plant')` → "3 plants"; an irregular plural is given: `plural(2, 'entry',
 * 'entries')`; a count of thousands with its comma, "1,200 plants". The one plural helper: the private pages' copy in
 * `$lib/ui/words` is this one (round sixty-two; the round-sixty triage review's merge leftovers, decision 11).
 */
export function plural(n: number, word: string, words = `${word}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? word : words}`;
}

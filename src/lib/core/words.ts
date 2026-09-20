/** Small words the interface needs right: a count with its noun, so "1 plants" never prints. */

/** `plural(1, 'plant')` → "1 plant"; `plural(3, 'plant')` → "3 plants"; an irregular plural is given: `plural(2, 'entry', 'entries')`. */
export function plural(n: number, word: string, words = `${word}s`): string {
  return `${n} ${n === 1 ? word : words}`;
}

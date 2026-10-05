/**
 * The sentence for changes held because they are dated ahead of this device's clock (decision 2 of round sixty): the
 * plants list, Today and a restore's report say it in the same words.
 */
export function heldWords(n: number): string {
  if (n <= 0) return '';
  return n === 1
    ? '1 change from a device whose clock runs ahead is waiting. It appears when this device\'s date reaches it.'
    : `${n.toLocaleString('en-US')} changes from a device whose clock runs ahead are waiting. They appear when this device's date reaches them.`;
}

/**
 * What "Share card" says when its drawing code, fetched on the first press, could not be fetched (round eighty-one; review
 * C1). Which case it is, is read, not guessed: the browser's own offline flag, and the framework's check of the site's
 * version against the page's.
 */
export type CardCodeMiss = 'offline' | 'newer' | 'unreached';
export function cardCodeWords(why: CardCodeMiss): string {
  if (why === 'offline') return "No connection: the card's drawing code is fetched the first time a card is made, and this device does not hold it yet.";
  if (why === 'newer') return "A newer version of Cultifolio is out since this page was opened, and this page's drawing code for the card has gone with the old one. Reload the page to make the card.";
  return "The card's drawing code could not be fetched just now. Reload the page to try again.";
}

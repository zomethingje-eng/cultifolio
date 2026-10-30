/**
 * What the add form says when plants are added (round eighty-four; outside review A16): the last watering is written in a
 * second commit, after the plants, and a failure there was caught and dropped, so the toast said "2026-0004 added" of a
 * plant whose watering line was never written. The plants stand; the toast says the line did not, and why.
 */
export function addedWords(o: { count: number; firstId: string; waterFailed: string | null }): string {
  const added = o.count > 1 ? `${o.count} plants added` : `${o.firstId} added`;
  if (o.waterFailed == null) return added;
  const why = o.waterFailed.trim().replace(/[.\s]+$/, '');
  const its = o.count > 1 ? 'their' : 'its';
  return `${added}, but ${its} last watering was not saved${why ? ` (${why})` : ''}. Record it on ${o.count > 1 ? "each plant's page" : 'its page'}.`;
}

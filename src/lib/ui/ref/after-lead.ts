/**
 * The photographs under the name card asked for once the lead photograph has come (round eighty-six; the coordinator's
 * follow-up to outside review B's 4).
 *
 * The strip's six thumbnails (iNaturalist's "small", about 40 kB each, 247 kB on Monstera deliciosa) were asked for as the
 * page was laid out, a second into a throttled phone's load, from the same host as the lead photograph, and shared the
 * line with it to the end: answered with nothing, the lead (the page's largest paint) came 1.2 s sooner. `fetchpriority=
 * "low"` alone changed nothing measurable (4,416 ms against 4,420): the host answers over HTTP/1.1, one connection a
 * request, so a priority orders nothing once both are asked for. So the strip waits: `go` runs when the lead has loaded or
 * failed, or `ms` after the wait began, whichever is first; at once when there is no lead or it has already finished.
 * Returns the undo.
 */
export function afterLead(lead: HTMLImageElement | null | undefined, go: () => void, ms = 2500): () => void {
  if (!lead || lead.complete) {
    go();
    return () => {};
  }
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    lead.removeEventListener('load', once);
    lead.removeEventListener('error', once);
    go();
  };
  const timer = setTimeout(once, ms);
  lead.addEventListener('load', once);
  lead.addEventListener('error', once);
  return () => {
    done = true;
    clearTimeout(timer);
    lead.removeEventListener('load', once);
    lead.removeEventListener('error', once);
  };
}

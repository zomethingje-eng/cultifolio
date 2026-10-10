/**
 * The build a client's request was made under (round sixty-seven; triage-66 S7, S-D5). The adapter's own cache
 * (`@sveltejs/adapter-cloudflare`'s worker) answers a repeated GET from Cloudflare's cache before any of this Worker's
 * code runs, keyed by the full URL and never by the build, for as long as the answer's `cache-control` allows. So after a
 * deploy that kept the corpus id, the old build's searches, rows, sheets, entries, name lookups and forecasts were served
 * for up to a day. The client now names its build in each such request (`v=<version>`), so a new build asks under new
 * URLs, and the answer is kept only when the build that made it is the build named: an old isolate still running during
 * a deploy, asked under the new build's URL, answers `no-store`, and an old page asking under the old build's URL is not
 * answered from a copy the new build made. A request that names no build (a script, a page from before this round) is
 * answered as before. The parameter is read here and nowhere else: no route validates it or fails on it.
 */
import { version } from '$app/environment';

/** The query parameter the client names its build with. `b` is taken: the sheets and entries name their buckets with it. */
export const BUILD_PARAM = 'v';

/** `cc` when the request names this build or none; `no-store` when it names another (round sixty-seven; S7). */
export function forBuild(url: URL, cc: string): string {
  const v = url.searchParams.get(BUILD_PARAM);
  return v != null && v !== version ? 'no-store' : cc;
}

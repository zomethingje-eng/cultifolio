/**
 * Round sixty-nine, agent P: the alerts' words (triage-68 P1, R46-6), the takeover's reload on arrival (P2, IND-11) and
 * the client's failure words (W6; S-E5, R46-7). Each failed on the base: `alert-words`, `onArrival` and `failureKind`
 * did not exist there, the place page read only `refused`, the layout assigned `location.href` in `beforeNavigate`, and a
 * 503 in the server's own words, a bare 502 and a search 503 were all a refusal or "did not answer".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { alertsUnchecked, alertsWhy } from '$lib/ui/alert-words';
import { onArrival } from '$lib/ui/take-over';

const raw = (f: string) => readFileSync(f, 'utf8');

describe('P1: the NWS alerts, refused or unanswered, are "not checked" on both pages', () => {
  it('both statuses are not checked, each in its own words; a checked answer is neither', () => {
    expect(alertsUnchecked('refused')).toBe(true);
    expect(alertsUnchecked('unanswered')).toBe(true);
    for (const s of ['ok', 'none', 'n/a', undefined, null]) expect(alertsUnchecked(s)).toBe(false);
    expect(alertsWhy('refused')).toBe("the National Weather Service refused this site's request");
    expect(alertsWhy('unanswered')).toBe('the National Weather Service did not answer');
    expect(alertsWhy('none')).toBe('');
  });
  it('the place page and Today both read the one rule; the place page no longer reads `refused` alone', () => {
    const place = raw('src/routes/places/[id]/+page.svelte');
    expect(place).not.toMatch(/alertsStatus === 'refused'\)/);
    expect(place).toMatch(/const alertsUnchecked = \$derived\(uncheckedOf\(forecast\?\.alertsStatus\)\)/);
    expect(place).toMatch(/Alerts not checked: \{alertsWhy\(forecast\?\.alertsStatus\)\}, and this is not a statement/);
    expect(place).not.toMatch(/Alerts not checked: the National Weather Service did not answer, and/);
    const today = raw('src/routes/today/+page.svelte');
    expect(today).toMatch(/\{:else if alertsUnchecked\(data\.alertsStatus\)\}/);
    expect(today).toMatch(/\{#if alertsUnchecked\(data\.alertsStatus\)\}<span class="unchecked">\{' '\}Alerts not checked\.<\/span>/);
  });
});

describe('P2: a takeover waiting for the next move reloads the page the move reaches', () => {
  it('reloads with nothing typed and nothing being written; waits for writes; never over typing', () => {
    expect(onArrival({ pending: true, typed: false, writing: 0 })).toBe('reload');
    expect(onArrival({ pending: true, typed: false, writing: 2 })).toBe('wait');
    expect(onArrival({ pending: true, typed: true, writing: 0 })).toBe('none');
    expect(onArrival({ pending: false, typed: false, writing: 0 })).toBe('none');
  });
  it('the layout no longer cancels the move and assigns location.href; it reloads after the move, by onArrival', () => {
    const layout = raw('src/routes/+layout.svelte');
    expect(layout).not.toMatch(/location\.href\s*=/);
    expect(layout).not.toMatch(/beforeNavigate\(/);
    expect(layout).toMatch(/afterNavigate\(async \(nav\) => \{[\s\S]{0,800}if \(!reloadOnNext \|\| nav\.type === 'enter'\) return;[\s\S]{0,300}onArrival\(\{ pending: reloadOnNext, typed: typedHere \|\| typing\(document\.activeElement\), writing: vaultWritesInFlight\(\) \}\)/);
    // A `from` whose url is null (a plant page's Apply) threw there in the first draft of this change; r62l's clock 3 caught it.
    expect(layout).toMatch(/if \(nav\.to\?\.url && nav\.from\?\.url && nav\.to\.url\.pathname !== nav\.from\.url\.pathname\) typedHere = false;/);
    expect(layout).toMatch(/if \(what === 'wait'\) \{ await whenVaultIdle\(5000\); what = now\(\); \}\n\s*if \(what === 'reload'\) location\.reload\(\);/);
  });
});

/* ---- W6: the client's words for a server's failure ---- */
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
let searchAnswer: Answer = { status: 200, body: [] };
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('fetch', async (u: string) => {
    if (u.startsWith('/api/corpus')) return new Response(JSON.stringify({ id: 'c1', buckets: 32 }), { status: 200 });
    if (u.startsWith('/api/search')) {
      const a = searchAnswer;
      return new Response(a.body === undefined ? '' : typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status, headers: a.headers });
    }
    throw new Error(`unexpected ${u}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('W6: a 503 with Retry-After "could not be read just now", a bare 5xx "did not answer", a 429 or 403 a refusal', () => {
  it('failureKind', async () => {
    const { failureKind } = await import('$lib/ui/index.svelte');
    expect(failureKind(429, true, true)).toBe('limited');
    expect(failureKind(403, false, false)).toBe('refused');
    expect(failureKind(503, false, true)).toBe('unread');
    expect(failureKind(503, true, false)).toBe('unread');
    expect(failureKind(502, false, false)).toBe('unreachable');
    expect(failureKind(500, false, false)).toBe('unreachable');
  });
  it('the catalogue search: its own 503 is a wait it says, a bare 502 no answer, a 403 a refusal', async () => {
    vi.resetModules();
    const { searchCatalogue } = await import('$lib/ui/index.svelte');
    searchAnswer = { status: 503, body: { message: 'The reference could not be read just now.' }, headers: { 'retry-after': '20', 'content-type': 'application/json' } };
    expect(await searchCatalogue('copiapoa')).toEqual({ limited: 20, kind: 'unread' });
    searchAnswer = { status: 502, body: '<html>Bad gateway</html>', headers: { 'content-type': 'text/html' } };
    expect(await searchCatalogue('copiapoa')).toBeNull();
    searchAnswer = { status: 403, body: { error: 'not for this site' }, headers: { 'content-type': 'application/json' } };
    expect(await searchCatalogue('copiapoa')).toEqual({ limited: 60, kind: 'refused' });
    searchAnswer = { status: 429, headers: { 'retry-after': '90' } };
    expect(await searchCatalogue('copiapoa')).toEqual({ limited: 90 });
  });
  it('the sentence for an unread bucket, and the picker and the front page say each apart', async () => {
    const { unreachedClause } = await import('$lib/ui/reach-words');
    const at = Date.now();
    expect(unreachedClause({ failed: true, kind: 'unread', status: 503, reason: 'The species sheets could not be read just now.', retryAfter: 30, at }, 'the species sheets', at)).toBe('the species sheets could not be read just now; it can be asked again in 30 s');
    expect(unreachedClause({ failed: true, kind: 'unreachable', status: 502, reason: null, retryAfter: null, at }, 'the species sheets', at)).toBe('the species sheets did not answer');
    const picker = raw('src/lib/ui/SpeciesPicker.svelte');
    expect(picker).toMatch(/refDown = answer === null \? 'unreached' : !Array\.isArray\(answer\) \? \(answer\.kind \?\? 'limited'\) : null;/);
    expect(picker).toMatch(/if \(d === 'unread'\) return "The reference's own search could not be read just now";/);
    expect(picker).toMatch(/if \(d === 'refused'\) return "The server refused the reference's own search just now";/);
    const home = raw('src/routes/+page.svelte');
    expect(home).toMatch(/searchFailed = \{ kind: r\.kind \?\? 'limited', wait: r\.limited \}/);
    expect(home).toMatch(/searchFailed\.kind === 'unread' \? 'The catalogue search could not be read just now\.'/);
  });
});

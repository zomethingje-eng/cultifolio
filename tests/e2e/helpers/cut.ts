import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A network the test can take away behind the service worker (round sixty-seven; triage-66 H2, S-E10).
 *
 * Playwright takes Safari's engine offline (`context.setOffline`), and routes its requests, from the page's own
 * inspector, which stands in front of the service worker: a navigation the worker would answer from its cache fails
 * there with "WebKit encountered an internal error", and a route answers a request the worker never saw. So the offline
 * tests were skipped in WebKit, and the worker's navigate branch (the section shell, the old addresses' redirects) ran in
 * no WebKit test, though a greenhouse with no signal is this app's iPhone case.
 *
 * This is a small proxy in front of the test server, on a port of its own (so a page opened through it is an origin of
 * its own, with its own worker and caches). While it is up it passes every request through and notes the path; `cut()`
 * makes it drop every connection as it arrives, which is what the worker's own `fetch` meets when the phone has no
 * signal: a network error, in every engine, with nothing standing in front of the worker. `mend()` lets requests through
 * again.
 */
export type Cut = { origin: string; seen: string[]; cut(): void; mend(): void; close(): Promise<void> };

export async function cuttableNetwork(target: string): Promise<Cut> {
  const to = new URL(target);
  let down = false;
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    if (down) { req.socket.destroy(); return; }
    seen.push(req.url ?? '');
    const up = http.request({ host: to.hostname, port: to.port, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.destroy());
    req.pipe(up);
  });
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    seen,
    cut() { down = true; server.closeIdleConnections(); },
    mend() { down = false; },
    close: () => new Promise<void>((res) => { server.closeAllConnections(); server.close(() => res()); })
  };
}

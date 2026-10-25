import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  // The class that scopes a component's styles, on every element it styles: `s` and the hash Svelte makes of the file, where
  // Svelte's own name is `svelte-` and the same hash (round eighty-three; the species page's weight). The species page's
  // HTML carried it about 900 times, 12 kB; six bytes fewer each, the same hash, and so the same classes apart.
  compilerOptions: { cssHash: ({ hash, css, filename }) => `s${hash(filename === '(unknown)' ? css : (filename ?? css))}` },
  kit: {
    adapter: adapter({
      config: 'wrangler.jsonc',
      // The proxy reads a config without the Durable Object: a dev proxy cannot run one and warned on every build that the class was missing (round twenty-two, 2)
      platformProxy: { configPath: 'wrangler.dev.jsonc', persist: true }
    }),
    // No version poll (round sixty; the first outside review, A3): Kit asked for /_app/version.json every five minutes from
    // every open page, a request /about/how did not list. An open page learns of a new deploy from the service worker's
    // own update check instead (the layout asks it when a page loads), and HTML is served with a short cache and no
    // stale-while-revalidate, so a page never asks for a chunk the previous build had and the new one does not.
    version: { pollInterval: 0 },
    // Every stylesheet goes into the page's HTML, the layout's 34 kB (7.6 kB gzipped) included: a page then paints with no
    // request between its HTML and its first paint. Round forty-six first inlined only the small sheets and left the
    // layout's as a file, and from Google's own machines that one request was still the top line, 450 ms on slow 4G;
    // the bytes it adds to each page are less than the round trip it removes. Client-side navigations still fetch the
    // sheets as files (Kit names them as disabled links), so nothing is lost there. Styles allow inline already
    // (`style-src 'unsafe-inline'`), so Kit adds no hashes for them (round forty-six, 1; round forty-seven, 1).
    // The layout's sheet has since grown past the 40 kB this lets in (58.7 kB at round eighty-two) and is a file again, and
    // round eighty-three measured the page's own sheets as files too (the species page's weight): 25.7 kB (5.2 kB gzipped)
    // off every species page, but its first paint on a throttled phone came about 150 ms later than with them inline, the
    // same build otherwise (round eighty-three's report, W). So the page's own sheets stay in its HTML.
    inlineStyleThreshold: 40 * 1024,
    // The corpus is never listed in the worker: 19,000 paths in the script would be 400 KB of nothing it uses. It is no
    // longer in the assets folder at all (round eighty, `files` below); the `s/` rule stays for a corpus put there by hand.
    // The layout registers the worker itself (after load, and it watches the registration for a waiting build); Kit's
    // own inline registration on top of that made two registrations per load, and the second always installed a
    // spurious waiting worker, which the take-over then reloaded the page for, without end.
    // Nor any dot-file (`.assetsignore` is the platform's own list, not a file to serve): the worker asked for it at every
    // install and got a 404 (round sixty; the product review, 12).
    serviceWorker: { register: false, files: (f) => !f.startsWith('s/') && !f.split('/').some((p) => p.startsWith('.')) },
    // "No third-party scripts" as a header the browser enforces, not a sentence on the about page. Scripts only from
    // this origin (SvelteKit hashes its own inline one; app.html's theme line is hashed below); inline style attributes are used
    // throughout, so styles allow them; photographs come from the four hosts /about/how names and from nowhere else, which
    // the browser now enforces (round sixty; the server review, 14: `https:` let any host serve an image).
    // src/app.html carries no comment of its own (round eighty-three; the species page's weight): a comment there is
    // sent in every page's HTML, and its two were 2.7 kB of each. What they said:
    // Its first script. The example's flag is taken off here when the address says the tab left it (`?left=`), when the
    // tab was sent home because another tab closed it (`cultifolio.sampleClosed`), or when another tab left the example
    // since this tab opened it (its generation, `cultifolio.demo.gen`, is not the device's, `cultifolio.sampleGen`):
    // such a tab, away when the other left (another site, the back-forward cache, a tab the browser discarded), opens
    // the grower's own collection and says why, rather than set out a new example (round sixty-nine; triage-68 X2).
    // Leave marks the example for deletion in the tab's storage; the address marks it too, but only when it carries the
    // one-use token Leave wrote in this same tab (`cultifolio.sampleLeaving`), taken off as it is read (triage-68 X1):
    // a copied link, a bookmark, the history or another tab's address deletes nothing, and no delete runs while any tab
    // holds the example open (round sixty-seven; V3, V6). The flag is set here too, and only here, when the address
    // carries `?enter=` and the one-use token the button "Show the example collection" wrote in this same tab
    // (`cultifolio.sampleEntering`), taken off as it is read, and the tab's generation is noted with it (round
    // seventy-seven): the button wrote the flag itself before its page went, and a "Leave site?" answered Cancel then
    // rested on a 3 s guess, a reload before it opening the example. An example page takes the shared "an example is
    // open" lock (`cultifolio-sample-open`) here, before anything else runs, and the bar takes the hold over once it is
    // drawn (`keepSampleOpen`; round seventy, triage-69 X1, S-D1): the lock was taken only by the bar, so from the
    // moment a reloading example tab's old page went until its new page was drawn (1 to 4.5 s on a slow phone) it held
    // nothing, and another tab read its example as left, offered it back and deleted it, the visitor's records with it.
    // Its placeholder (#shell). A page about your own plants is drawn only on the device, so its HTML had nothing in it
    // and the screen stayed blank until the scripts ran: 4.5 s on a slow phone. This placeholder shows the bar and a
    // line meanwhile, and only on such a page: a page the server drew has its content in the box above, and the rule
    // below keeps the line hidden; so does a browser without :has(). The app removes it once it draws (round sixty; the
    // accessibility review, 7). No script: the page's policy allows only hashed inline scripts, and a style needs none.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        // The hash is app.html's one inline line (the theme and the dismissed welcome, before first paint); change that line and this hash together.
        // The second hash is Svelte's own `this.__e=event` on images and iframes, which lets a load or error that fires
        // before hydration be replayed after it; `unsafe-hashes` is what lets a hash cover an attribute handler.
        'script-src': ['self', 'sha256-3LsFZZq160FJW5LRYuIRIzg3GbQ1+kDj7c38jJL9RU4=', 'unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:', 'https://inaturalist-open-data.s3.amazonaws.com', 'https://static.inaturalist.org', 'https://upload.wikimedia.org', 'https://api.gbif.org'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'worker-src': ['self'],
        'frame-ancestors': ['none'],
        // No plug-in content (<object>, <embed>): no page has any, and without this the directive fell back to
        // default-src 'self', which let a same-origin file be embedded as one (round eighty-two; the independent review's 33).
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self']
      }
    },
    // The app's own files (the icons, the maps, the link-preview image, `.assetsignore`) are in static/app/, and the
    // corpus the build writes is beside them in static/s/, outside the folder the build copies (round eighty; review C,
    // the owner's PC): with the corpus inside it, every build copied its 4.5 GB and 145,812 files twice, into
    // .svelte-kit/output/client and again into .svelte-kit/cloudflare, which took minutes and ran the browser suite's
    // server start past its budget, for files `.assetsignore` then kept out of the deploy. `vite dev` serves the corpus on
    // disk at /s/ itself (vite.config.ts), as the fallback in src/lib/server/dossiers.ts reads it.
    files: { assets: 'static/app' },
    alias: { $core: 'src/lib/core', $dossier: 'src/lib/dossier', $db: 'src/lib/db', $climate: 'src/lib/climate' },
    // Absolute asset paths: the service worker serves the /plants shell for /plants/<acc> when that page is not cached,
    // and a shell with relative ./_app/ paths would then look for its scripts under /plants/_app/ and find nothing.
    paths: { relative: false }
  }
};
export default config;

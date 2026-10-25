/// <reference types="@cloudflare/workers-types" />
declare global {
  namespace App {
    interface Error {
      message: string;
      /** A species address the reference does not hold: the name as read from the address, what the reference holds of its genus, and whether the genus is one the list takes whole (round forty-one, R15). */
      species?: { name: string; genus: string; inGenus: number; wholeGenus: boolean; accepted?: string; /** The reference's nearest names, by its own search (round fifty-eight). */ suggest?: Array<{ slug: string; name: string }> };
      /** The page exists but its data could not be read just now (a 503): not a statement that it does not exist (round sixty). */
      unreadable?: boolean;
    }
    interface PageState {
      /** What is open on the page and closes on Back, in the order opened: the photo viewer, the menu, the Record form (round eighty-one; src/lib/ui/back-layer.svelte.ts). */
      layers?: string[];
    }
    interface Locals {
      /** The corpus this request reads, loaded once by the hook for a page it may hold, so the cache key, the page's query and the page itself are one corpus (round fifty-nine). */
      corpus?: import('$lib/server/dossiers').Loaded;
      /** Markup a page's load drew for its HTML alone, by the mark its data carries in the markup's place (round eighty-three; $lib/server/drawn). */
      drawn?: import('$lib/server/drawn').Drawn;
    }
    interface Platform {
      env: {
        STORE?: R2Bucket;
        QUEUE?: KVNamespace;
        /** The vault-creation counters, one Durable Object (src/lib/server/counters.ts); without it the KV counters bound approximately. */
        COUNTERS?: DurableObjectNamespace<import('$lib/server/counters').Counters>;
        /** '1': a vault made now syncs without a licence (dev and pre-launch); anything else makes new vaults that are refused with 402. A vault keeps what it was made with. */
        SYNC_OPEN?: string;
        /** Set only by the browser suite's local server (`--var E2E_OFFLINE:1`): the server asks no outside service, as if none answered (round sixty-two, the first deploy). */
        E2E_OFFLINE?: string;
        /** Ceilings on new vaults, for everyone per day and in all; the code's defaults when unset (see `allowCreation`). */
        SYNC_VAULTS_PER_DAY?: string;
        SYNC_VAULTS_MAX?: string;
      };
      context?: ExecutionContext;
      caches?: CacheStorage & { default: Cache };
    }
  }
}
export {};

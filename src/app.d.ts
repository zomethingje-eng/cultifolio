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
    interface Locals {
      /** The corpus this request reads, loaded once by the hook for a page it may hold, so the cache key, the page's query and the page itself are one corpus (round fifty-nine). */
      corpus?: import('$lib/server/dossiers').Loaded;
    }
    interface Platform {
      env: {
        STORE?: R2Bucket;
        QUEUE?: KVNamespace;
        /** The vault-creation counters, one Durable Object (src/lib/server/counters.ts); without it the KV counters bound approximately. */
        COUNTERS?: DurableObjectNamespace<import('$lib/server/counters').Counters>;
        /** '1' lets any vault sync without a licence (dev and pre-launch). */
        SYNC_OPEN?: string;
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

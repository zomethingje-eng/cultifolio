/// <reference types="@cloudflare/workers-types" />
declare global {
  namespace App {
    interface Error {
      message: string;
      /** A species address the reference does not hold: the name as read from the address, what the reference holds of its genus, and whether the genus is one the list takes whole (round forty-one, R15). */
      species?: { name: string; genus: string; inGenus: number; wholeGenus: boolean; accepted?: string };
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

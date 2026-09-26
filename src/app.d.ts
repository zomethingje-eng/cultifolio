/// <reference types="@cloudflare/workers-types" />
declare global {
  namespace App {
    interface Platform {
      env: {
        STORE?: R2Bucket;
        QUEUE?: KVNamespace;
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

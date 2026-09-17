/// <reference types="@cloudflare/workers-types" />
declare global {
  namespace App {
    interface Platform {
      env: {
        STORE?: R2Bucket;
        QUEUE?: KVNamespace;
        DOSSIER_V?: string;
        /** '1' lets any vault sync without a licence (dev and pre-launch). */
        SYNC_OPEN?: string;
      };
      context?: ExecutionContext;
      caches?: CacheStorage & { default: Cache };
    }
  }
}
export {};

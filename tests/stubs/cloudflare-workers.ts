/** The one thing `cloudflare:workers` gives the counter class: a base with `ctx` and `env`. For unit tests, where the real module does not exist. */
export class DurableObject<Env = unknown> {
  constructor(
    public ctx: { storage: unknown },
    public env: Env
  ) {}
}

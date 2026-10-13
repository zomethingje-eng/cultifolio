/**
 * Round seventy, agent P (triage-69 P3, R47-19): `limitAddress` gives each attempt and each repeat of the per-address
 * limit test an address of its own. It depended on the project and the run alone, so a retry came back to an address
 * whose five new vaults the failed attempt had spent. Failed on the base: the retry's address was the first attempt's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const info = { project: { name: 'chromium' }, retry: 0, repeatEachIndex: 0 };
vi.mock('@playwright/test', () => ({ test: { info: () => info } }));

beforeEach(() => { info.project.name = 'chromium'; info.retry = 0; info.repeatEachIndex = 0; process.env.CULTIFOLIO_E2E_RUN = 'r70p-run'; });

describe('limitAddress', () => {
  it('a retry is given another address than the attempt it follows', async () => {
    const { limitAddress } = await import('../e2e/helpers/address');
    const first = limitAddress();
    info.retry = 1;
    expect(limitAddress()).not.toBe(first);
  });
  it('so is each repeat, and no two projects, attempts or repeats share one', async () => {
    const { limitAddress } = await import('../e2e/helpers/address');
    const seen = new Set<string>();
    for (const name of ['chromium', 'phone', 'webkit', 'phone-webkit', 'firefox']) for (const retry of [0, 1, 2]) for (const rep of [0, 1, 2]) {
      Object.assign(info, { retry, repeatEachIndex: rep }); info.project.name = name;
      seen.add(limitAddress());
    }
    expect(seen.size).toBe(5 * 3 * 3);
  });
  it('guard: still in 2001:db8::/32, which docAddress never gives, and the same address for the same attempt', async () => {
    const { limitAddress, docAddress } = await import('../e2e/helpers/address');
    expect(limitAddress()).toMatch(/^2001:db8:[0-9a-f]{1,4}::1$/);
    expect(limitAddress()).toBe(limitAddress());
    expect(docAddress()).toMatch(/^3fff:/);
  });
});

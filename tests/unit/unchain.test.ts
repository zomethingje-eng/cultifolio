import { describe, it, expect } from 'vitest';
import { unchain } from '$dossier/schema';

describe('a carried row names the build that asked, not the chain of builds that carried it (round thirty-seven, R1-6)', () => {
  it('cuts a nested chain to its origin and the reason that build gave', () => {
    const nine = 'carried from build of 2026-09-30 (rederive); that build: carried from build of 2026-09-29 (rederive); that build: carried from build of 2026-09-28 (rederive); that build: carried from build of 2026-09-20; this build: refused 429';
    expect(unchain(nine)).toBe('carried from build of 2026-09-20; this build: refused 429');
    expect(unchain('carried from build of 2026-09-30 (rederive); that build: carried from build of 2026-09-29 (rederive)')).toBe('carried from build of 2026-09-29 (rederive)');
    expect(unchain('carried from build of 2026-09-30 (rederive); that build: OpenAlex 429')).toBe('carried from build of 2026-09-30 (rederive); that build: OpenAlex 429');
  });
  it('leaves a plain row, a bare carried row and an empty detail alone', () => {
    expect(unchain('carried from build of 2026-09-20')).toBe('carried from build of 2026-09-20');
    expect(unchain('timed out after 30 s')).toBe('timed out after 30 s');
    expect(unchain(undefined)).toBeUndefined();
  });
});

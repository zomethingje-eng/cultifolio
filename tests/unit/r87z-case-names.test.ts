import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

// Round eighty-seven (the owner's predeploy on Windows): `src/lib/browse/lens.svelte.ts` and `Lens.svelte` were two files
// on Linux and one on Windows, whose file system ignores case, so `import … from '$lib/browse/lens.svelte'` read the
// component and the build failed there only. No two files of the repository may differ by case alone, nor a runes
// module `x.svelte.ts` share its import name with a component `X.svelte` beside it.
const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);

describe('r87z names that one file system takes for one file', () => {
  it('no two paths differ by case alone', () => {
    const seen = new Map<string, string>();
    const clash: string[] = [];
    for (const f of files) {
      const k = f.toLowerCase();
      if (seen.has(k)) clash.push(`${seen.get(k)} ~ ${f}`);
      else seen.set(k, f);
    }
    expect(clash).toEqual([]);
  });
  it('no runes module x.svelte.ts beside a component of the same import name', () => {
    const lower = new Set(files.map((f) => f.toLowerCase()));
    const clash = files.filter((f) => f.endsWith('.svelte.ts') && lower.has(f.slice(0, -3).toLowerCase()));
    expect(clash).toEqual([]);
  });
});

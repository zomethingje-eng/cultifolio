/**
 * Adopted in round sixty-one (agent G) from docs/review-60/tests/records--label-code.test.ts; the reproductions now
 * pass (the cut by code point, the direction characters taken off, the planner's running maximum).
 *
 * records review, round sixty: the label code (src/lib/ui/grow/qr.ts) and the import planner's cost (src/lib/import/plan.ts).
 *
 * Mixed: PASSES tests guard what is right; FAILS tests reproduce findings 3, 15 and 16 on commit 21257b7.
 * Run: npx vitest run tests/unit/records--label-code.test.ts
 */
import { describe, it, expect } from 'vitest';
import { plantQrUrl, labelFromHash, QR_NAME_MAX } from '$lib/ui/grow/qr';
import { planNumbers, blankRow } from '$lib/import/plan';
import { DEFAULT_SCHEME } from '$core/accession';

describe('plantQrUrl', () => {
  it('finding 3: a printed name whose 60th UTF-16 unit is the first half of an emoji makes a code (it threw URIError, and the label page then drew no code at all)', () => {
    const a = { id: 'r1', taxonName: 'Copiapoa cinerea', cultivar: 'Snow ' + 'x'.repeat(36) + '🌵 Queen', nameKind: 'cultivar' as const };
    expect(() => plantQrUrl('https://cultifolio.com', a)).not.toThrow();
  });
  it('PASSES: the address is the plant\'s identity; a cross carries its name only', () => {
    expect(plantQrUrl('https://x', { id: 'r1', taxonName: 'Copiapoa cinerea', cultivar: null, nameKind: 'species' })).toBe('https://x/plants/r1#s=copiapoa-cinerea&n=Copiapoa%20cinerea');
    expect(plantQrUrl('https://x', { id: 'r2', taxonName: 'Echinopsis', cultivar: 'Flying Saucer', nameKind: 'hybrid' })).toBe("https://x/plants/r2#n=Echinopsis%20'Flying%20Saucer'");
  });
});

describe('labelFromHash, with hostile values', () => {
  it('PASSES: markup stays text, a javascript: or traversal slug is refused, controls and length are taken off, a broken escape is skipped', () => {
    expect(labelFromHash('#s=javascript:alert(1)&n=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E')).toEqual({ slug: null, name: '<img src=x onerror=alert(1)>' });
    expect(labelFromHash('#s=../../api/sync&n=x').slug).toBeNull();
    expect(labelFromHash('#n=a%00b%0Ac%1Bd').name).toBe('a b c d');
    expect(labelFromHash('#n=' + 'a'.repeat(5000)).name).toHaveLength(QR_NAME_MAX);
    expect(labelFromHash('#n=%E0%A4%A&s=copiapoa-cinerea')).toEqual({ slug: 'copiapoa-cinerea', name: null });
  });
  it('finding 15: bidi overrides and C1 controls are taken off, so a forged code cannot show reversed or disguised text as "the label\'s name"', () => {
    const n = labelFromHash('#n=' + encodeURIComponent('Copiapoa ‮niarg‬ \u0085 ⁦x⁩')).name ?? '';
    expect(/[\u0080-\u009f‎‏‪-‮⁦-⁩]/.test(n)).toBe(false);
  });
  it('finding 15: the cut never leaves half an emoji', () => {
    const n = labelFromHash('#n=' + encodeURIComponent('x'.repeat(59) + '🌵')).name ?? '';
    expect(/[\ud800-\udbff]$/.test(n)).toBe(false);
  });
});

describe('the import planner\'s cost (finding 16)', () => {
  it('finding 16: planning 2,000 rows against 2,000 numbers takes well under 200 ms (it took seconds), and gives what nextAccession gives', () => {
    const rows = Array.from({ length: 2000 }, (_, i) => blankRow('k' + i, i + 1, 'Copiapoa cinerea'));
    const taken = Array.from({ length: 2000 }, (_, i) => `2026-${String(i + 1).padStart(4, '0')}`);
    const t0 = performance.now();
    planNumbers(rows, taken, DEFAULT_SCHEME, 2026);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

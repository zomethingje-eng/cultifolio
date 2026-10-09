/**
 * Review of round sixty-two (search): the common-name set-back reads the source's capitals, so the same English name
 * is set back or not by how one GBIF source happened to capitalise it. Both `it`s FAIL on the merged code.
 * Run from the repository root: cp /tmp/r62rev/out/tests/search--common-names.test.ts tests/unit/ && npx vitest run tests/unit/search--common-names.test.ts
 */
import { describe, it, expect } from 'vitest';
import { englishNames, generaOf } from '$dossier/index-entry';

const GENERA = generaOf(['Colchicum autumnale', 'Crocus sativus', 'Curio rowleyanus', 'Senecio vulgaris', 'Moraea villosa', 'Iris germanica']);
const eng = (name: string, source?: string) => ({ name, lang: 'eng', ...(source ? { source } : {}) });

describe('the set-back does not depend on a source\'s capitals', () => {
  it('Curio rowleyanus: "String-Of-Beads Senecio" (round sixty-one\'s own example) is set back, one source each', () => {
    // Title case exempts it now (a capital on every word): with one source per name, GBIF's order shows it again.
    const n = englishNames([eng('String-Of-Beads Senecio', 'ITIS'), eng('String-of-Pearls', 'USDA PLANTS')], { genus: 'Curio rowleyanus', genera: GENERA });
    expect(n.common).toBe('String-of-Pearls'); // merged: "String-Of-Beads Senecio"
  });
  it('Colchicum autumnale: "Autumn Crocus" is kept as "Autumn crocus" is (/about/how names "Autumn crocus" as not set back)', () => {
    const lower = englishNames([eng('autumn crocus'), eng('meadow saffron')], { genus: 'Colchicum autumnale', genera: GENERA });
    const title = englishNames([eng('Autumn Crocus'), eng('Meadow Saffron')], { genus: 'Colchicum autumnale', genera: GENERA });
    expect(lower.common).toBe('Autumn crocus');
    expect(title.common).toBe('Autumn Crocus'); // merged: "Meadow Saffron", "Autumn Crocus" set back
  });
});

// Round sixty-two, after the --names step on the PC: the audit's sample showed Dimorphotheca jucunda's shown name become
// "Osteospermum", another genus of the reference named alone.
import { englishNames as en2 } from '$lib/dossier/index-entry';
import { it as it2, expect as expect2 } from 'vitest';
it2('another genus named alone is set back, as one at the end of a longer name is', () => {
  const rows = [{ name: 'Osteospermum', lang: 'eng', source: 'a', sources: 3 }, { name: 'Cape daisy', lang: 'eng', source: 'b' }] as never;
  expect2(en2(rows, { genus: 'Dimorphotheca jucunda', genera: new Set(['dimorphotheca', 'osteospermum']) }).common).toBe('Cape daisy');
  // A genus English uses as a noun stays a name: "Aloe" for an Aristaloe.
  expect2(en2([{ name: 'Aloe', lang: 'eng', source: 'a' }] as never, { genus: 'Aristaloe aristata', genera: new Set(['aloe', 'aristaloe']) }).common).toBe('Aloe');
});

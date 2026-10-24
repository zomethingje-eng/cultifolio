/**
 * The genera the species list takes whole, `scripts/specialist-genera.txt`, which the derivation reads and /about/how
 * names as the list's 173 collector genera (round seventy-three made this the one place it is read). It says how today's
 * list was derived and nothing more: the species page's 404 says a genus is taken whole. The phone's catalogue no longer
 * opens on them (round seventy-five: every device shows every genus, with "Popular genera" a chip, `most-grown.ts`). Read on
 * the server only.
 */
import generaList from '../../../../scripts/specialist-genera.txt?raw';

export const WHOLE_GENERA: ReadonlySet<string> = new Set(generaList.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));

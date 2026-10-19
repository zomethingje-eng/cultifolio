/**
 * A manifest as a build before round seventy-seven wrote it: without the search's key files (`search/…`). The Worker
 * still searches such a corpus through its postings and its index (the live corpus until round seventy-seven's upload),
 * so the tests of that path's own mechanics (its charges, `short.json`, a posting file missing) keep reading it.
 */
import type { Manifest } from '$dossier/manifest';
export const before77 = (m: Manifest): Manifest => ({ ...m, files: Object.fromEntries(Object.entries(m.files).filter(([n]) => !n.startsWith('search/'))) });

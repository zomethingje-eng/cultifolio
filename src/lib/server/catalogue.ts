/**
 * The catalogue on the server: the pure builder lives in $dossier/catalogue (the corpus build writes its rows to files
 * with it); here it is read from the build's file under the corpus id, else derived from the index and kept.
 */
import { product, getIndexWithCorpus, type IndexEntry, type Platform, type Fetch } from '$lib/server/dossiers';
import { catalogueOf, catalogueFile, type By, type Chip, type CatalogueRows } from '$dossier/catalogue';
export * from '$dossier/catalogue';

/** A catalogue's rows and the corpus they belong to: the build's file under the corpus id, else derived from the index here and kept (round fifty-three, 2). */
export async function catalogueRows(platform: Platform, fetch: Fetch, by: By, chip: Chip): Promise<{ cat: CatalogueRows; idx: IndexEntry[]; corpus: string; fromFile: boolean }> {
  const { idx, corpus } = await getIndexWithCorpus(platform, fetch);
  const file = await product<CatalogueRows>(platform, fetch, catalogueFile(by, chip));
  if (file && Array.isArray(file.rows)) return { cat: file, idx, corpus, fromFile: true };
  return { cat: catalogueOf(idx, by, chip), idx, corpus, fromFile: false };
}

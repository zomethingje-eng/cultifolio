/**
 * A bulk file that is on disk but cannot be read as the code knows it (round eighty-seven's review of stage 2, S5): an
 * archive the extractor fails on (its exit code not 0), a header without the columns read, or no rows. Thrown by a
 * loader; `loadSources` catches it, and every page is "not asked", with this message as the reason, and the build
 * prints it (rules 2 and 6). Never "none": a file not read has said nothing of any name.
 */
export class BulkFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BulkFileError';
  }
}

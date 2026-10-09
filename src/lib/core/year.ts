/**
 * The one year rule (round sixty-two; the triage's 2, review B's 6): the year a plant's number is minted for, read from
 * its date acquired at any precision the app keeps it at ("2024-03-09", "2024-03" or "2024"). The collection mints with
 * it and the import plans with it; two copies of it had drifted apart, so a year-only row was planned for its year and
 * written as if it were this year's.
 */
export const yearOf = (d?: string | null): number | undefined => (d && /^\d{4}(?:-|$)/.test(d) ? Number(d.slice(0, 4)) : undefined);

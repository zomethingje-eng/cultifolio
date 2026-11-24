# Where a reader's site climate comes from (SPECIES 20, the lens's Outdoors view)

SPECIES 20 asks for a report before the round is built: can the build make the site's own climate tiles (option A),
or must the site ask NASA POWER (option B)? Written on 23 November 2026 while the photograph copy held the lock, from
the code and the files on disk. Nothing was run.

## Answer: option A, with no new binding

**The build already holds what option A needs.**
- `climate/climate.grid` is on this PC: 5,028,480,000 bytes, built 19 September 2026.
- It is CHELSA V2.1's 1981 to 2010 normals with ETOPO 2022 elevation, packed by `scripts/pack-climate.py`.
- The grid is 0.05°: 7,200 columns × 3,600 rows × 97 int16 layers, interleaved per cell.
- Its layers include the twelve months of `tasmax`, `tasmin` and `pr`: the daily high, the nightly low and the rain the
  Outdoors view needs.
- The species pages' habitat climates are read from the same grid. So both sides of the comparison share a source, a
  resolution and a span of years, as the hand-off wanted.

## The tiles

- **One file per one-degree square** that holds land: 20 × 20 cells × 3 measures × 12 months, int16 as the grid
  stores them.
  - That is 28,800 bytes before compression.
  - A cell that is sea in the grid (`nodata`) stays `nodata`.
- **Count and size.**
  - Of the 64,800 one-degree squares, roughly a third touch land: about 21,000, so about 600 MB raw.
  - Climate fields of int16 typically compress to between a third and a half with gzip, so about 200 to 300 MB stored.
  - These are estimates. The cutting script prints the real figures, and its dry run comes first.
- **Cost.** R2 storage is $0.015 per GB-month, so about half a cent a month. Each reader's comparison reads one tile,
  well within R2's free 10 million reads a month.
  - The hand-off's bar ("Report if the measured storage would cost more than US$1 a month") is not reached by two
    orders of magnitude.
- **Where they live.** In the bucket the Worker already reads, `cultifolio` (binding `STORE`), under `climate/v1/`.
  - A Worker route answers a square, cached at the edge for a year by its version.
  - No new binding, so `wrangler.jsonc` is not touched.
  - The corpus step's `upload` already copies to this bucket with rclone, so the tiles go up once, by a plan line of
    their own.
- **What the site learns.** The browser asks for one square, which is about 110 km by 110 km at the equator and less
  east to west further from it.
  - The site learns the square and nothing finer. That is coarser than the frost watch's kilometre.
  - No third party is asked.
- **Licence (rule 4).** CHELSA V2.1 is CC0 (Karger et al. 2017, as `pack-climate.py` records), so serving its figures
  per cell needs no permission. The card names CHELSA, its version and its years, as the species pages do.

## The yearly lowest night

Option A gives monthly normals only, so the Outdoors card leaves out "the site's yearly lowest night, on average"; the
hand-off allows this ("With A it is left out"). The habitat side keeps its yearly lows from NASA POWER, read by the
builder as now.

## Option B is not needed

NASA POWER's climatology endpoint was not read, and is not needed. Its parameter names in the hand-off are unconfirmed.

## The steps when SPECIES 20 is built

1. `scripts/site-tiles.ts`:
   - It reads `climate/climate.grid` as `src/lib/climate/grid.ts` lays it out.
   - It writes `bulk/site-tiles/<lat>_<lon>.bin.gz` for each square holding land.
   - It prints the count and the bytes.
   - Its dry run prints them without writing.
2. The Worker route `/api/site-climate?sq=<lat>,<lon>`:
   - It answers the square's bytes from `STORE` with `cache-control: public, max-age=31536000, immutable` under the
     tiles' version.
   - It answers 404 for a square of sea, which the card says as "no land climate for this square".
3. The browser reads the cell holding the reader's site from the square. The site is in Settings, as the frost watch
   has it. The browser then draws the Outdoors view.
4. /about/how and /privacy say what the comparison asks for and of whom (rule 5).

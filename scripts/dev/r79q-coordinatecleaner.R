# DEV TOOL ONLY (round 79, Q): needs R and the CRAN package CoordinateCleaner (GPL-3), installed in the review
# workspace for a read-only cross-check. Nothing in the build or the site runs or needs this script or R.
#
# Runs CoordinateCleaner's record tests, each with its documented defaults as clean_coordinates() calls them, on the
# points a corpus kept (one CSV row a point: key, species, decimalLatitude, decimalLongitude, year, countryCode,
# basisOfRecord, licence; written by scripts/dev/r79q-points.mjs from the dossiers' `occurrences.open`), and writes
# one logical column a test (TRUE = passed, FALSE = flagged) beside the point's row number.
#
#   Rscript scripts/dev/r79q-coordinatecleaner.R <points.csv> <flags.csv>
#
# The tests: val (valid coordinates), equ (equal latitude and longitude, absolute), zero (0/0 and a 0.5 degree radius),
# cap (10 km around capitals), cen (1 km around country and province centroids), inst (100 m around institutions),
# inst1k (the same at 1 km, since the corpus rounds coordinates to 0.001 degree), gbif (GBIF's headquarters), sea
# (Natural Earth land at 1:110m, cc_sea's own default), seabuf (land buffered by a degree, CoordinateCleaner's
# buffland), outl (quantile, 5 x IQR, species with 7 or more unique places) and dupl (species, latitude and
# longitude). Timings go to stderr. About half an hour for 1.1 million points on two shared cores.

suppressPackageStartupMessages({ library(CoordinateCleaner) })
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("usage: Rscript r79q-coordinatecleaner.R <points.csv> <flags.csv>")
x <- read.csv(args[1], stringsAsFactors = FALSE)
cat(sprintf("%d points, %d species\n", nrow(x), length(unique(x$key))), file = stderr())
timed <- function(name, expr) {
  t0 <- Sys.time()
  v <- tryCatch(expr, error = function(e) { cat(name, "failed:", conditionMessage(e), "\n", file = stderr()); rep(NA, nrow(x)) })
  cat(sprintf("%s: %d flagged, %.0f s\n", name, sum(!v, na.rm = TRUE), as.numeric(difftime(Sys.time(), t0, units = "secs"))), file = stderr())
  v
}
x$species <- as.character(x$key)
# The tests that read one record at a time are run 100,000 rows at a time: on the whole corpus at once the centroid test
# alone held 2.8 GB, more than this shared machine gives a process. The outlier and duplicate tests read a species' rows
# together, and every species' rows are together in the file, so those run over the whole table.
# Natural Earth's land at 1:110m, cc_sea()'s own default: at 1:50m, clean_coordinates()' default, the test had not read
# 20,000 points in three minutes here (its largest polygons have too many vertices for terra's point test), at 1:110m 22 s.
land <- tryCatch(terra::vect(rnaturalearth::ne_download(scale = 110, type = "land", category = "physical", returnclass = "sf")), error = function(e) { cat("sea: Natural Earth not read:", conditionMessage(e), "\n", file = stderr()); NULL })
data("buffland", package = "CoordinateCleaner")
bland <- terra::unwrap(buffland)
rowwise <- c("val", "equ", "zero", "cap", "cen", "inst", "inst1k", "gbif", "sea", "seabuf")
out <- data.frame(row = seq_len(nrow(x)))
for (t in rowwise) out[[t]] <- NA
spent <- setNames(numeric(length(rowwise)), rowwise)
step <- 100000
for (from in seq(1, nrow(x), by = step)) {
  i <- from:min(nrow(x), from + step - 1)
  y <- x[i, ]
  run <- function(name, expr) {
    t0 <- Sys.time()
    v <- tryCatch(expr, error = function(e) { cat(name, "failed:", conditionMessage(e), "\n", file = stderr()); rep(NA, nrow(y)) })
    spent[[name]] <<- spent[[name]] + as.numeric(difftime(Sys.time(), t0, units = "secs"))
    out[[name]][i] <<- v
  }
  run("val", cc_val(y, value = "flagged", verbose = FALSE))
  run("equ", cc_equ(y, value = "flagged", verbose = FALSE))
  run("zero", cc_zero(y, buffer = 0.5, value = "flagged", verbose = FALSE))
  run("cap", cc_cap(y, buffer = 10000, value = "flagged", verbose = FALSE))
  # geod = FALSE: terra's own buffer, still in metres on longitude and latitude; the default's 73-sided polygons around
  # each of 5,305 centroids took 86 s for 20,000 points here, and terra's 2.8 s, flagging the same 109.
  run("cen", cc_cen(y, buffer = 1000, geod = FALSE, test = "both", value = "flagged", verbose = FALSE))
  run("inst", cc_inst(y, buffer = 100, value = "flagged", verbose = FALSE))
  run("inst1k", cc_inst(y, buffer = 1000, value = "flagged", verbose = FALSE))
  run("gbif", cc_gbif(y, value = "flagged", verbose = FALSE))
  if (!is.null(land)) run("sea", cc_sea(y, ref = land, value = "flagged", verbose = FALSE))
  gc(verbose = FALSE)
  cat(sprintf("rows to %d\n", max(i)), file = stderr())
}
# The sea test against land buffered by a degree (CoordinateCleaner's `buffland`) only where the plain one flagged: land
# buffered holds land, and the buffered test read 20,000 points in more than 90 s here.
at_sea <- which(out$sea %in% FALSE)
out$seabuf[!is.na(out$sea)] <- TRUE
if (length(at_sea)) { t0 <- Sys.time(); out$seabuf[at_sea] <- cc_sea(x[at_sea, ], ref = bland, value = "flagged", verbose = FALSE); spent[["seabuf"]] <- as.numeric(difftime(Sys.time(), t0, units = "secs")) }
for (t in rowwise) cat(sprintf("%s: %d flagged, %.0f s\n", t, sum(!out[[t]], na.rm = TRUE), spent[[t]]), file = stderr())
out$outl <- timed("outl", cc_outl(x, method = "quantile", mltpl = 5, min_occs = 7, value = "flagged", verbose = FALSE))
out$dupl <- timed("dupl", cc_dupl(x, value = "flagged", verbose = FALSE))
write.csv(out, args[2], row.names = FALSE)
cat(sprintf("CoordinateCleaner %s\n", as.character(packageVersion("CoordinateCleaner"))), file = stderr())

# DEV TOOL ONLY (round 79, Q): needs R and the package rWCVP (GPL-3, CRAN archive 1.2.4), installed in the review
# workspace for a read-only cross-check. Nothing in the build or the site runs or needs this script or R.
#
# Asks rWCVP's wcvp_distribution() for each species of a ranges file (scripts/dev/r79q-ranges.mjs's) by the name of
# Kew's entry the page's range is read from, and writes what it answers: one line a species, the TDWG level-3 codes it
# gives as native, introduced, extinct and location_doubtful.
#
#   Rscript scripts/dev/r79q-rwcvp.R <ranges.tsv> rwcvpdata <folder holding rWCVPdata/data/*.rda> <out.tsv>
#   Rscript scripts/dev/r79q-rwcvp.R <ranges.tsv> kew <folder holding wcvp_names.csv and wcvp_distribution.csv> <out.tsv>
#
# The first reads the WCVP of the data package rWCVPdata (0.5.0, WCVP version 13 of 21 May 2024): its .rda files are
# read from the package's source folder, since installing the package here ran out of memory while it packed them. The
# second reads Kew's files the build reads, so any difference left is one of rule, not of version. Both are passed to
# wcvp_distribution() as its documented wcvp_names and wcvp_distributions arguments, cut first to the rows of the names
# asked (the function reads no other row for a species), so each call does not join 1.4 million names again.

suppressPackageStartupMessages({ library(rWCVP); library(dplyr) })
invisible(Sys.setlocale("LC_ALL", "C.UTF-8")) # so "×" is read and written as itself
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 4) stop("usage: Rscript r79q-rwcvp.R <ranges.tsv> rwcvpdata|kew <folder> <out.tsv>")
# Read as UTF-8: a hybrid's sign (Kew writes "× Sorbaronia arsenii") read in the C locale matched no row of Kew's.
sp <- read.delim(args[1], quote = "", stringsAsFactors = FALSE, colClasses = "character", encoding = "UTF-8")
asked <- unique(sp$kew)
keep <- c("plant_name_id", "taxon_rank", "taxon_status", "family", "genus", "species", "taxon_name", "taxon_authors")
if (args[2] == "rwcvpdata") {
  e <- new.env()
  load(file.path(args[3], "rWCVPdata/data/wcvp_names.rda"), envir = e)
  names_ <- e$wcvp_names[e$wcvp_names$taxon_name %in% asked, intersect(keep, names(e$wcvp_names))]
  rm(e); invisible(gc(verbose = FALSE))
  e <- new.env()
  load(file.path(args[3], "rWCVPdata/data/wcvp_distributions.rda"), envir = e)
  dist_ <- e$wcvp_distributions[e$wcvp_distributions$plant_name_id %in% names_$plant_name_id, ]
  rm(e); invisible(gc(verbose = FALSE))
} else {
  n <- data.table::fread(file.path(args[3], "wcvp_names.csv"), sep = "|", quote = "", select = keep, encoding = "UTF-8", showProgress = FALSE)
  names_ <- as.data.frame(n[n$taxon_name %in% asked, ])
  rm(n); invisible(gc(verbose = FALSE))
  d <- data.table::fread(file.path(args[3], "wcvp_distribution.csv"), sep = "|", quote = "", encoding = "UTF-8", showProgress = FALSE)
  dist_ <- as.data.frame(d[d$plant_name_id %in% names_$plant_name_id, ])
  rm(d); invisible(gc(verbose = FALSE))
}
cat(sprintf("%d names asked; %d name rows, %d distribution rows read\n", length(asked), nrow(names_), nrow(dist_)), file = stderr())
codes <- function(r, type) paste(sort(r$LEVEL3_COD[r$occurrence_type == type]), collapse = " ")
out <- vector("list", length(asked))
t0 <- Sys.time()
for (i in seq_along(asked)) {
  r <- tryCatch(suppressMessages(wcvp_distribution(asked[i], taxon_rank = "species", wcvp_names = names_, wcvp_distributions = dist_)), error = function(e) NULL)
  st <- paste(sort(unique(names_$taxon_status[names_$taxon_name == asked[i]])), collapse = "+")
  # How many of Kew's entries of these words carry range rows: more than one, and rWCVP joins their ranges.
  ids <- length(unique(dist_$plant_name_id[dist_$plant_name_id %in% names_$plant_name_id[names_$taxon_name == asked[i]]]))
  out[[i]] <- if (is.null(r)) data.frame(kew = asked[i], answered = "no", statuses = st, ranged = ids, native = "", introduced = "", extinct = "", doubtful = "")
              else { r <- sf::st_drop_geometry(r); data.frame(kew = asked[i], answered = "yes", statuses = st, ranged = ids, native = codes(r, "native"), introduced = codes(r, "introduced"), extinct = codes(r, "extinct"), doubtful = codes(r, "location_doubtful")) }
}
res <- do.call(rbind, out)
write.table(res, args[4], sep = "\t", quote = FALSE, row.names = FALSE)
cat(sprintf("%d names, %d answered, %.0f s; rWCVP %s\n", nrow(res), sum(res$answered == "yes"), as.numeric(difftime(Sys.time(), t0, units = "secs")), as.character(packageVersion("rWCVP"))), file = stderr())

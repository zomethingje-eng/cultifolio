#!/usr/bin/env python3
"""
Pack CHELSA V2.1 climatologies + ETOPO 2022 elevation into one 0.05° grid.

Output (in --out, default ./climate):
  climate.grid   int16 little-endian, 7200 cols × 3600 rows × 97 layers, interleaved per cell
  climate.json   header: geometry, layer order, scale factors, sources (read by the app)

Run on a machine with ~25 GB free disk and ~6 GB free RAM:
  pip install rasterio numpy requests
  python scripts/pack-climate.py            # downloads to ./climate/src, resumable
  python scripts/pack-climate.py --probe -24.877 -70.504   # read one cell back and print it
  python scripts/pack-climate.py --inspect rsds 1          # print what one raster says about its own units, and sample stats

Units: each raster's own scale/offset tags are used when it states them, the
technical specification's table otherwise, and every layer's scaling and its
source are written into climate.json. Radiation (rsds) is packed only from
stated tags or an explicit --trust-rsds-scale, because its tabulated scale
disagreed with a plausibility probe and plausibility is not a unit check.

Resumable: each downloaded file is kept; each finished layer is recorded in
climate/progress.json, so a crash or a Ctrl+C costs at most one layer.

Sources: CHELSA V2.1 1981–2010 climatologies (Karger et al. 2017; CC0),
ETOPO 2022 60″ surface (NOAA NCEI, public domain), sea masked before averaging. The app's grid.ts is the
authority on the layer order and quantisation; this script mirrors it.
"""
import argparse, json, os, sys, time
from datetime import datetime, timezone

CELL = 0.05
COLS, ROWS = 7200, 3600
NORTH, WEST = 90.0, -180.0
NODATA = -32768
VARS = ["tasmax", "tasmin", "tas", "pr", "rsds", "hurs", "vpd", "sfcWind"]
# quantisation written to the file (physical = raw * scale); mirrors src/lib/climate/grid.ts QUANT
QUANT = {"tasmax": (0.1, "°C"), "tasmin": (0.1, "°C"), "tas": (0.1, "°C"), "pr": (1, "mm/month"), "rsds": (0.01, "MJ/m²/day"), "hurs": (0.1, "%"), "vpd": (1, "Pa"), "sfcWind": (0.01, "m/s"), "elev": (1, "m")}
# CHELSA storage: physical = raw * scale + offset, as the technical specification tabulates it. This table is
# a FALLBACK: the GeoTIFF's own scale/offset tags are read first and win when present, and the header records
# which was used for every layer, so the unit question is settled by the file, not by what looks plausible.
CHELSA = {"tas": (0.1, -273.15), "tasmax": (0.1, -273.15), "tasmin": (0.1, -273.15), "pr": (0.1, 0.0),
          # rsds: the tabulated 0.001 (MJ m-2 d-1) does not match the files, whose variable_unit tag says W m-2
          # (a daily-mean flux, raw values around 200). The packer reads that tag and converts with ×0.0864
          # (86,400 s in a day). The grid was first packed with ×0.1, 16% high; --redo rsds repacks it.
          "rsds": (0.001, 0.0), "hurs": (0.01, 0.0), "vpd": (0.1, 0.0), "sfcWind": (0.001, 0.0)}

# Physical ranges a whole-earth monthly layer must fall inside; a layer outside them is a unit mistake, not weather.
SANE = {"tas": (-70, 50), "tasmax": (-60, 60), "tasmin": (-80, 45), "pr": (0, 5000), "rsds": (0, 45), "hurs": (0, 100), "vpd": (0, 8000), "sfcWind": (0, 30)}


def raster_scaling(path):
    """What the file itself says: (scale, offset, unit, tags) or (None, None, None, tags) when it says nothing."""
    import rasterio
    with rasterio.open(path) as src:
        sc = src.scales[0] if src.scales else None
        off = src.offsets[0] if src.offsets else None
        unit = src.units[0] if src.units else None
        tags = {**src.tags(), **src.tags(1)}
        # GDAL keeps a default of scale 1 / offset 0 when the tags are absent; treat that as "not stated".
        stated = not (sc in (None, 1.0) and off in (None, 0.0))
        return (sc if stated else None, off if stated else None, unit, tags)


def inspect(path, var):
    """Print everything the raster says about its units plus sample statistics under each candidate scaling."""
    import numpy as np, rasterio
    sc, off, unit, tags = raster_scaling(path)
    print(f"{os.path.basename(path)}")
    print(f"  raster tags: scale={sc} offset={off} unit={unit}")
    for k, v in sorted(tags.items()):
        if any(w in k.lower() for w in ("scale", "offset", "unit", "long_name", "standard_name", "description")):
            print(f"  tag {k} = {v}")
    with rasterio.open(path) as src:
        h, w = src.height, src.width
        win = rasterio.windows.Window(w // 2 - 500, h // 2 - 250, 1000, 500)  # a slab of the tropics/subtropics
        raw = src.read(1, window=win).astype("float64")
        nod = src.nodata if src.nodata is not None else 65535
        raw = raw[raw != nod]
    candidates = {"raster tags": (sc, off), "spec table": CHELSA.get(var, (1, 0))}
    if var == "rsds":
        # If the raw numbers sit around 100–350, they are a daily-mean flux in W m-2, and the way to a daily
        # integral in MJ m-2 is ×0.0864 (86,400 s in a day), not ×0.1: a 16% difference in every DLI figure.
        candidates["W m-2 → MJ m-2 d-1 (×0.0864)"] = (0.0864, 0.0)
        candidates["×0.1 (what the grid was first packed with)"] = (0.1, 0.0)
    print(f"  raw sample: median {np.median(raw):.4g}, p1 {np.percentile(raw, 1):.4g}, p99 {np.percentile(raw, 99):.4g}")
    for label, (s2, o2) in candidates.items():
        if s2 is None:
            print(f"  under {label}: not stated")
            continue
        phys = raw * s2 + o2
        lo, hi = SANE.get(var, (-1e9, 1e9))
        print(f"  under {label} (×{s2} + {o2}): median {np.median(phys):.3g}, p1 {np.percentile(phys, 1):.3g}, p99 {np.percentile(phys, 99):.3g}, sane range {lo}..{hi}: {'OK' if lo <= np.percentile(phys, 1) and np.percentile(phys, 99) <= hi else 'OUT OF RANGE'}")

CHELSA_URL = "https://os.zhdk.cloud.switch.ch/chelsav2/GLOBAL/climatologies/1981-2010/{var}/CHELSA_{var}_{mm}_1981-2010_V.2.1.tif"
CHELSA_URL_ALT = "https://os.unil.cloud.switch.ch/chelsa02/chelsa/global/climatologies/{var}/1981-2010/CHELSA_{var}_{mm}_1981-2010_V.2.1.tif"
ETOPO_URL = "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/ETOPO_2022_v1_60s_N90W180_surface.tif"


def layers():
    out = []
    for v in VARS:
        for m in range(1, 13):
            out.append({"id": f"{v}_{m:02d}", "var": v, "month": m, "scale": QUANT[v][0], "offset": 0, "unit": QUANT[v][1]})
    out.append({"id": "elev", "var": "elev", "scale": 1, "offset": 0, "unit": "m"})
    return out


def header():
    return {
        "v": 1,
        "built": datetime.now(timezone.utc).isoformat(),
        "cell": CELL, "cols": COLS, "rows": ROWS, "north": NORTH, "west": WEST,
        "nodata": NODATA, "bytesPerValue": 2, "layers": layers(),
        "sources": ["CHELSA V2.1 climatologies 1981–2010 (Karger et al. 2017; EnviDat, CC0)", "ETOPO 2022 60″ surface (NOAA NCEI, public domain), sea pixels masked so a cell mean is its land's"],
    }


def download(url, dest, alt=None):
    import requests
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        return dest
    tmp = dest + ".part"
    for u in [url] + ([alt] if alt else []):
        try:
            have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
            headers = {"Range": f"bytes={have}-"} if have else {}
            with requests.get(u, stream=True, timeout=120, headers=headers) as r:
                if r.status_code == 416:  # already complete
                    os.replace(tmp, dest); return dest
                if r.status_code not in (200, 206):
                    print(f"  {u} → HTTP {r.status_code}"); continue
                mode = "ab" if (have and r.status_code == 206) else "wb"
                total = int(r.headers.get("Content-Length", 0)) + (have if mode == "ab" else 0)
                done = have if mode == "ab" else 0
                t0 = time.time()
                with open(tmp, mode) as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk); done += len(chunk)
                        if total and time.time() - t0 > 2:
                            print(f"\r  {os.path.basename(dest)} {done/1e6:,.0f}/{total/1e6:,.0f} MB", end="", flush=True); t0 = time.time()
                print()
            os.replace(tmp, dest)
            return dest
        except Exception as e:
            print(f"  download failed from {u}: {e}")
    raise SystemExit(f"could not download {os.path.basename(dest)}")


def resample_to_grid(path, scale, offset, nodata_in=None, is_elev=False):
    """Read a global GeoTIFF decimated to the 0.05° grid by mean, return float32 (ROWS, COLS) with NaN for nodata.

    Elevation is the land's: ETOPO's "surface" is the sea floor over water, so a coastal cell averaged
    whole comes out below sea level and would warm every lapse-corrected extreme. Sea pixels are masked
    out before averaging (ETOPO surface < 0 is bathymetry; the Dead Sea and the Caspian are the
    exceptions, and they are not where anyone collects cacti), so a coastal cell's elevation is the mean
    of its land, and a cell with no land at all is nodata.
    """
    import numpy as np, rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject
    from rasterio.transform import from_origin
    from rasterio.io import MemoryFile
    with rasterio.open(path) as src:
        nod = src.nodata if src.nodata is not None else nodata_in
        dst = np.full((ROWS, COLS), np.nan, dtype="float32")
        dst_transform = from_origin(WEST, NORTH, CELL, CELL)
        if is_elev:
            # Mask the sea in memory, then average what is left: reproject() ignores nodata pixels in the mean.
            band = src.read(1).astype("float32")
            band[band < 0] = np.nan
            if nod is not None:
                band[band == nod] = np.nan
            with MemoryFile() as mem:
                with mem.open(driver="GTiff", height=band.shape[0], width=band.shape[1], count=1, dtype="float32", crs=src.crs, transform=src.transform, nodata=np.nan) as tmp:
                    tmp.write(band, 1)
                with mem.open() as land:
                    reproject(
                        source=rasterio.band(land, 1), destination=dst,
                        src_transform=land.transform, src_crs=land.crs, src_nodata=np.nan,
                        dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
                        resampling=Resampling.average, num_threads=4,
                    )
            return dst
        # Reproject by area average onto exactly our grid; rasterio handles the half-pixel offset CHELSA inherits from GMTED.
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            src_transform=src.transform, src_crs=src.crs, src_nodata=nod,
            dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
            resampling=Resampling.average, num_threads=4,
        )
        return dst * scale + offset


def quantise(arr, scale):
    import numpy as np
    q = np.rint(arr / scale)
    q = np.where(np.isnan(arr), NODATA, np.clip(q, -32767, 32767))
    return q.astype("<i2")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="climate")
    ap.add_argument("--probe", nargs=2, type=float, metavar=("LAT", "LON"), help="print one cell from an existing grid and exit")
    ap.add_argument("--keep-src", action="store_true", help="keep downloaded GeoTIFFs (default: delete each after packing to save disk)")
    ap.add_argument("--redo", metavar="VAR", action="append", default=[], help="repack every layer of this variable even if already done (repeatable)")
    ap.add_argument("--inspect", nargs=2, metavar=("VAR", "MM"), help="download one CHELSA layer, print its unit metadata and sample statistics under each candidate scaling, and exit")
    ap.add_argument("--trust-rsds-scale", type=float, metavar="SCALE", help="pack rsds with this scale when the raster tags state none (only after --inspect has settled it)")
    args = ap.parse_args()
    if args.inspect:
        v, mm_ = args.inspect[0], f"{int(args.inspect[1]):02d}"
        os.makedirs(os.path.join(args.out, "src"), exist_ok=True)
        path = download(CHELSA_URL.format(var=v, mm=mm_), os.path.join(args.out, "src", f"CHELSA_{v}_{mm_}.tif"), alt=CHELSA_URL_ALT.format(var=v, mm=mm_))
        inspect(path, v)
        return
    os.makedirs(args.out, exist_ok=True)
    grid_path = os.path.join(args.out, "climate.grid")
    hdr_path = os.path.join(args.out, "climate.json")

    if args.probe:
        import numpy as np
        h = json.load(open(hdr_path))
        lat, lon = args.probe
        row = min(ROWS - 1, max(0, int((NORTH - lat) // CELL)))
        col = min(COLS - 1, max(0, int((lon - WEST) // CELL)))
        n = len(h["layers"])
        mm = np.memmap(grid_path, dtype="<i2", mode="r", shape=(ROWS, COLS, n))
        vals = mm[row, col, :]
        print(f"cell row {row} col {col}")
        for L, raw in zip(h["layers"], vals):
            print(f"  {L['id']:12s} {'NODATA' if raw == NODATA else round(raw * L['scale'] + L['offset'], 2)} {L['unit']}")
        return

    try:
        import numpy as np, rasterio  # noqa
    except ImportError:
        raise SystemExit("pip install rasterio numpy requests")

    L = layers()
    n = len(L)
    prog_path = os.path.join(args.out, "progress.json")
    done = set(json.load(open(prog_path))) if os.path.exists(prog_path) else set()
    if args.redo:
        redo = {s["id"] for s in L if s["var"] in args.redo}
        done -= redo
        print(f"repacking {len(redo)} layer(s): {', '.join(sorted(redo))}")
    src_dir = os.path.join(args.out, "src"); os.makedirs(src_dir, exist_ok=True)

    new = not os.path.exists(grid_path)
    mm = np.memmap(grid_path, dtype="<i2", mode="w+" if new else "r+", shape=(ROWS, COLS, n))
    if new:
        print(f"creating {grid_path}: {ROWS*COLS*n*2/1e9:.2f} GB")
        mm[:] = NODATA; mm.flush()

    t_start = time.time()
    for i, spec in enumerate(L):
        if spec["id"] in done:
            continue
        t0 = time.time()
        if spec["var"] == "elev":
            path = download(ETOPO_URL, os.path.join(src_dir, "ETOPO_2022_v1_60s_surface.tif"))
            arr = resample_to_grid(path, 1, 0, nodata_in=-99999, is_elev=True)
        else:
            v, mm_ = spec["var"], f"{spec['month']:02d}"
            path = download(CHELSA_URL.format(var=v, mm=mm_), os.path.join(src_dir, f"CHELSA_{v}_{mm_}.tif"), alt=CHELSA_URL_ALT.format(var=v, mm=mm_))
            rsc, roff, runit, rtags = raster_scaling(path)
            unit_tag = (rtags.get("variable_unit") or runit or "").strip()
            if rsc is not None:
                sc, off, how = rsc, roff, "raster tags"
            elif v == "rsds" and unit_tag == "W m-2":
                # The file states a daily-mean flux in W m-2 (CHELSA V2.1 rsds does, in its variable_unit tag);
                # a day is 86,400 s, so ×0.0864 gives the daily integral in MJ m-2.
                sc, off, how = 0.0864, 0.0, "unit tag W m-2 → MJ m-2 d-1"
            elif v == "rsds" and args.trust_rsds_scale is not None:
                sc, off, how = args.trust_rsds_scale, 0.0, "--trust-rsds-scale"
            elif v == "rsds":
                raise SystemExit("rsds: the raster states no scale/offset and no unit, and its tabulated scale is in doubt. Run `pack-climate.py --inspect rsds 01`, read the output, then pass --trust-rsds-scale with the value the evidence supports.")
            else:
                sc, off, how = CHELSA[v][0], CHELSA[v][1], "spec table"
            arr = resample_to_grid(path, sc, off, nodata_in=65535)
            import numpy as np
            lo, hi = SANE[v]
            p1, p99 = np.nanpercentile(arr, 1), np.nanpercentile(arr, 99)
            if not (lo <= p1 and p99 <= hi):
                raise SystemExit(f"{spec['id']}: values {p1:.3g}..{p99:.3g} (1st–99th percentile) fall outside {lo}..{hi} under {how} (×{sc} + {off}); a unit mistake, not weather. Not packed.")
            spec["srcScale"], spec["srcOffset"], spec["srcUnit"], spec["scalingFrom"] = sc, off, runit, how
            print(f"  {spec['id']}: scaled ×{sc} + {off} ({how}{', unit ' + runit if runit else ''}); p1 {p1:.3g}, p99 {p99:.3g}")
        mm[:, :, i] = quantise(arr, spec["scale"])
        mm.flush()
        done.add(spec["id"]); json.dump(sorted(done), open(prog_path, "w"))
        if not args.keep_src and spec["var"] != "elev":
            try: os.remove(path)
            except OSError: pass
        elapsed = time.time() - t_start
        print(f"[{len(done)}/{n}] {spec['id']} packed in {time.time()-t0:.0f}s (elapsed {elapsed/60:.0f} min)")

    h = header()
    # Carry the per-layer provenance (which scale was used and where it came from) into the header, merging with any earlier run's.
    prev = json.load(open(hdr_path)) if os.path.exists(hdr_path) else {"layers": []}
    prevBy = {l["id"]: l for l in prev.get("layers", [])}
    for i, spec in enumerate(L):
        for k in ("srcScale", "srcOffset", "srcUnit", "scalingFrom"):
            if k in spec: h["layers"][i][k] = spec[k]
            elif k in prevBy.get(spec["id"], {}): h["layers"][i][k] = prevBy[spec["id"]][k]
    json.dump(h, open(hdr_path, "w"), indent=1)
    print(f"\ndone → {grid_path} ({os.path.getsize(grid_path)/1e9:.2f} GB) and {hdr_path}")
    print("upload with:  npx wrangler r2 object put cultifolio/climate/v1/climate.grid --file=climate/climate.grid")
    print("              npx wrangler r2 object put cultifolio/climate/v1/climate.json --file=climate/climate.json --content-type=application/json")


if __name__ == "__main__":
    main()

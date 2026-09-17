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

Resumable: each downloaded file is kept; each finished layer is recorded in
climate/progress.json, so a crash or a Ctrl+C costs at most one layer.

Sources: CHELSA V2.1 1981–2010 climatologies (Karger et al. 2017; CC0),
ETOPO 2022 60″ surface (NOAA NCEI, public domain). The app's grid.ts is the
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
# CHELSA storage: physical = raw * scale + offset (tech spec v1.3, table 7.1)
CHELSA = {"tas": (0.1, -273.15), "tasmax": (0.1, -273.15), "tasmin": (0.1, -273.15), "pr": (0.1, 0.0),
          # rsds: unit MJ m-2 d-1. The published scale 0.001 gives 0.3 MJ for the Atacama coast in January;
          # 0.1 gives 30 MJ, which is what the clear-sky × cloud model produces there. Verified by probe.
          "rsds": (0.1, 0.0), "hurs": (0.01, 0.0), "vpd": (0.1, 0.0), "sfcWind": (0.001, 0.0)}

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
        "sources": ["CHELSA V2.1 climatologies 1981–2010 (Karger et al. 2017; EnviDat, CC0)", "ETOPO 2022 60″ surface (NOAA NCEI, public domain)"],
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
    """Read a global GeoTIFF decimated to the 0.05° grid by mean, return float32 (ROWS, COLS) with NaN for nodata."""
    import numpy as np, rasterio
    from rasterio.enums import Resampling
    from rasterio.warp import reproject
    from rasterio.transform import from_origin
    with rasterio.open(path) as src:
        nod = src.nodata if src.nodata is not None else nodata_in
        dst = np.full((ROWS, COLS), np.nan, dtype="float32")
        dst_transform = from_origin(WEST, NORTH, CELL, CELL)
        # Reproject by area average onto exactly our grid; rasterio handles the half-pixel offset CHELSA inherits from GMTED.
        reproject(
            source=rasterio.band(src, 1), destination=dst,
            src_transform=src.transform, src_crs=src.crs, src_nodata=nod,
            dst_transform=dst_transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
            resampling=Resampling.average, num_threads=4,
        )
        if not is_elev:
            dst = dst * scale + offset
        return dst


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
    args = ap.parse_args()
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
            sc, off = CHELSA[v]
            arr = resample_to_grid(path, sc, off, nodata_in=65535)
        mm[:, :, i] = quantise(arr, spec["scale"])
        mm.flush()
        done.add(spec["id"]); json.dump(sorted(done), open(prog_path, "w"))
        if not args.keep_src and spec["var"] != "elev":
            try: os.remove(path)
            except OSError: pass
        elapsed = time.time() - t_start
        print(f"[{len(done)}/{n}] {spec['id']} packed in {time.time()-t0:.0f}s (elapsed {elapsed/60:.0f} min)")

    json.dump(header(), open(hdr_path, "w"), indent=1)
    print(f"\ndone → {grid_path} ({os.path.getsize(grid_path)/1e9:.2f} GB) and {hdr_path}")
    print("upload with:  npx wrangler r2 object put cultifolio/climate/v1/climate.grid --file=climate/climate.grid")
    print("              npx wrangler r2 object put cultifolio/climate/v1/climate.json --file=climate/climate.json --content-type=application/json")


if __name__ == "__main__":
    main()

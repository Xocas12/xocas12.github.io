"""Derive src/galicia.json by decoding the figure galicia-eucalyptus publishes.

Source
------
    gh repo clone Xocas12/galicia-eucalyptus

Reads `docs/galicia_real/mapas.png` and `src/eucalyptus_impact/reporting.py` from that clone.

    python src/make_galicia.py --repo ../galicia-eucalyptus
    python src/make_galicia.py --repo ../galicia-eucalyptus --check

Why a PNG and not a table
-------------------------
Because the repository commits the figure and not the table: its `.gitignore` excludes
`outputs/`, `data/raw/`, `data/interim/`, `*.parquet` and `*.tif`, so every quantitative result
lives either as prose in `docs/galicia_real/informe.md` or as pixels in this one image. This is
the weakest provenance of the five demos and the page says so. Running `euc real fetch && euc
real run` once and committing the 1 km cell table upstream would replace all of the arithmetic
below with a CSV read.

The decode is recoverable because `src/eucalyptus_impact/real/brief.py` draws the panels with
`imshow(..., interpolation="nearest")` over a plain (235, 230) array at 140 dpi, so each 1 km
cell occupies about 2.008 x 2.008 output pixels -- enough to sample cell centres. Panel origins
were fitted by minimising the disagreement between the pixel at a cell centre and the pixels at
0.18 and 0.82 across it; they are constants here because the figure is a committed file. That
fit only fixes where inside a cell the samples fall. An origin a whole cell out still samples
clean cell centres, one cell over, so the whole-cell part is pinned by the land-mask check below.

It is only publishable because it is checked, and this script exits non-zero if any check
fails:

  - the recovered eucalyptus-2024 and native-broadleaf-2017 areas must each land within half a
    per cent of the hectares `informe.md` states for that year, once on the decoded floats and
    again on the packed bytes, decoded the way the page decodes them (check_galicia.py, which
    every build also runs);
  - every panel draws the same 29,565 cells, so every panel read must decode exactly the
    eucalyptus-2024 panel's land mask, to the cell. A panel origin a whole cell out fails this
    by hundreds of cells, and would otherwise pair its values with the neighbouring cells.

If the figure is ever regenerated with a different layout, those checks are what fail rather
than the page silently going stale.

What the page sums
------------------
The layers ship at four bits a cell, but the page adds them up into the area tiles, so the
packing has to keep the totals as well as the per-cell values. Linear coding (level q read as
q/15) does not: every value under 1/30 becomes zero, which is half the cells, and the tiles came
out 1.05 and 1.12 per cent under the report while the check on the floats passed at +0.16. Each
layer therefore ships a 16-entry decode table whose entry q is the mean of the values that
rounded to q. The page reads table[q], so its sums equal the checked decode to within the
table's rounding, and the hover still moves in sixteen steps.

The burnt-share bars are not summed on the page at all. They are computed here from the
full-resolution decode and shipped as `bins`, with their edges; the page draws them and fills
the lede's two figures from the first and last, so the lede and the bars cannot disagree.

What is shipped, and what is not
--------------------------------
The figure has six panels. Three are deliberately not shipped:

  - "Cambio 2017-2024" is an artefact of how the 2017 map was made. `informe.md` section 2 says
    90 per cent of 2017 pixels are the 2024 class held fixed ("Retrodatouse o 90 % dos pixeles"),
    so the difference is zero by construction except where a Hansen clear-cut or an EFFIS burn
    was recorded. A layer called "the change" would read as "eucalyptus shrank 8 per cent in
    seven years", which is false and which the repository never claims.
  - "Celas prioritarias para restaurar" implies a benefit the repository declines to claim: its
    own projection band for restoring 25 per cent of eucalyptus crosses zero.
  - Eucalyptus 2017, because without the change layer the 2024 layer says everything it says.

The native-broadleaf and burnt layers used to be read from origins a whole cell out (COL_X[0]
one cell right, ROW_Y[1] one cell low), so each burnt value was drawn one row north of the cell
it describes and each native value one row north and one column west. The 403 and 625 land
cells that left uncovered were put down to colour-residual failures and shipped as no-data
lists. With the origins corrected every panel decodes the same cells, and the payload carries no
no-data list.
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import re
import sys

import numpy as np

from check_galicia import AREA_TOL, LEDE, REPORT_HA, decoded_ha, lede_figures, lede_problems, payload_problems

NX, NY = 230, 235          # GRID_1KM over BBOX (465000, 4620000, 695000, 4855000), EPSG:25829
SCALE = 2.008              # output pixels per cell at the figure's 140 dpi
#: Panel origins in output pixels: top and bottom rows, left, middle and right columns. The
#: right-hand column (change, priority) has no shipped panel; its origin was checked by decoding
#: the priority panel, whose land mask matches the eucalyptus-2024 mask cell for cell.
ROW_Y = (114.4, 681.592)
COL_X = (35.942, 627.5, 1218.926)
BG_TOL, RESIDUAL_TOL = 9, 18

#: Panels actually read: (name, column, row, colormap name in reporting.py)
PANELS = [
    ("euc", 1, 0, "SEQ_GREEN"),    # Fraccion de eucalipto, 2024
    ("nat", 0, 1, "SEQ_GREEN"),    # Fraccion de frondosas autoctonas, 2017
    ("burn", 1, 1, "SEQ_ORANGE"),  # Fraccion queimada 2018-2023 (EFFIS)
]

# The report's hectares (informe.md, "superficie no mapa") and the tolerance live in
# check_galicia.py, so this script and the build hold the payload to the same figures.

#: Edges of the burnt-share bars, in eucalyptus fraction of the cell; the last is past 1 so that a
#: cell that is all eucalyptus falls in a bin.
BIN_EDGES = (0.0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.01)


def colormaps(repo: pathlib.Path) -> dict[str, np.ndarray]:
    """Rebuild the figure's colour ramps from the hex stops in the repository's own source.

    Parsed rather than copied, so that a palette change upstream shows up as a decode failure
    instead of as quietly wrong values.
    """
    src = (repo / "src/eucalyptus_impact/reporting.py").read_text(encoding="utf-8")
    out = {}
    for name in ("SEQ_GREEN", "SEQ_ORANGE", "SURFACE"):
        m = re.search(rf"^{name} = (.+)$", src, re.M)
        if not m:
            sys.exit(f"{name} not found in reporting.py -- has the figure's palette moved?")
        stops = re.findall(r'"#([0-9a-fA-F]{6})"', m.group(1))
        if not stops:
            sys.exit(f"{name}: no hex stops parsed from {m.group(1)!r}")
        rgb = np.array([[int(h[i : i + 2], 16) for i in (0, 2, 4)] for h in stops], float)
        if name == "SURFACE":
            out[name] = rgb[0]
            continue
        t = np.linspace(0, 1, 512)
        lut = np.stack([np.interp(t, np.linspace(0, 1, len(rgb)), rgb[:, c]) for c in range(3)], 1)
        out[name] = lut
    return out


def decode_panel(im: np.ndarray, col: int, row: int, lut: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """Sample each cell centre and invert the colour ramp; NaN off the map or on a bad match."""
    xs = (COL_X[col] + (np.arange(NX) + 0.5) * SCALE).astype(int)
    ys = (ROW_Y[row] + (np.arange(NY) + 0.5) * SCALE).astype(int)
    px = im[np.ix_(ys, xs)].reshape(-1, 3)
    is_bg = np.abs(px - bg).sum(1) < BG_TOL

    idx = np.empty(len(px), int)
    resid = np.empty(len(px))
    for a in range(0, len(px), 4000):  # chunked: the full distance matrix would be 500 MB
        chunk = px[a : a + 4000]
        d = ((chunk[:, None, :] - lut[None, :, :]) ** 2).sum(2)
        idx[a : a + 4000] = d.argmin(1)
        resid[a : a + 4000] = np.sqrt(d[np.arange(len(chunk)), idx[a : a + 4000]])

    v = np.linspace(0, 1, len(lut))[idx]
    v[is_bg | (resid > RESIDUAL_TOL)] = np.nan
    return v.reshape(NY, NX)


def rle(mask: np.ndarray) -> list[int]:
    """Run lengths of the flattened mask, starting with a False run."""
    flat = mask.ravel()
    cuts = np.flatnonzero(np.diff(flat.astype(np.int8))) + 1
    runs = np.diff(np.concatenate([[0], cuts, [flat.size]])).tolist()
    return runs if not flat[0] else [0] + runs


def nibbles(v: np.ndarray) -> tuple[str, list[float]]:
    """4 bits a cell, two cells a byte, base64; and the table that decodes each level.

    Sixteen levels is coarse and that is the right coarseness for one cell: the quantity is a
    fraction of a square kilometre recovered from a colour ramp in a PNG, so finer steps would
    encode the figure's rendering rather than the model's output. It is not coarse enough to sum
    as q/15, though, because the page adds the cells up (see "What the page sums" above). So
    level q decodes to the mean of the values that rounded to it, which keeps the total; a level
    no cell uses decodes to q/15.

    The uint8 cast is load-bearing. Without it NumPy promotes the shift to int64 and every cell
    costs eight bytes instead of half of one, which is a 320 KB payload instead of a 50 KB one.
    """
    v = np.nan_to_num(v)
    q = np.clip(np.rint(v * 15), 0, 15).astype(np.uint8)
    lut = [round(float(v[q == k].mean()) if (q == k).any() else k / 15, 5) for k in range(16)]
    if q.size % 2:
        q = np.append(q, np.uint8(0))
    packed = base64.b64encode(((q[0::2] << np.uint8(4)) | q[1::2]).astype(np.uint8).tobytes()).decode("ascii")
    return packed, lut


def burnt_bins(euc: np.ndarray, brn: np.ndarray) -> list[list]:
    """[cells, mean burnt share] per eucalyptus bin, from the full-resolution decode."""
    out = []
    for lo, hi in zip(BIN_EDGES, BIN_EDGES[1:]):
        m = (euc >= lo) & (euc < hi)
        out.append([int(m.sum()), round(float(brn[m].mean()), 5) if m.any() else 0.0])
    return out


def delta(idx: np.ndarray) -> list[int]:
    return np.diff(np.concatenate([[0], idx])).tolist()


def mask_mismatches(grids: dict[str, np.ndarray], land: np.ndarray) -> list[str]:
    """Panels whose decoded land mask is not `land`, with the cells that differ each way.

    Every panel is the same 29,565 cells drawn in a different colour, so a correctly placed
    origin reproduces the mask exactly. An origin a whole cell out leaves hundreds of cells
    uncovered, all along the same side of the coast.
    """
    out = []
    for name, grid in grids.items():
        m = np.isfinite(grid)
        extra, missing = int((m & ~land).sum()), int((land & ~m).sum())
        if extra or missing:
            out.append(f"{name}: {extra} cells off the mask, {missing} on it with no value")
    return out


def build(repo: pathlib.Path) -> tuple[str, dict]:
    try:
        from PIL import Image
    except ImportError:
        sys.exit("needs Pillow: pip install pillow")

    fig = repo / "docs/galicia_real/mapas.png"
    if not fig.exists():
        sys.exit(f"{fig} not found -- is this a clone of Xocas12/galicia-eucalyptus?")
    im = np.asarray(Image.open(fig).convert("RGB")).astype(float)
    cm = colormaps(repo)

    grids = {n: decode_panel(im, c, r, cm[k], cm["SURFACE"]) for n, c, r, k in PANELS}
    land = np.isfinite(grids["euc"])
    n = int(land.sum())
    off = mask_mismatches(grids, land)
    if off:
        sys.exit("decoded land masks differ from the eucalyptus-2024 panel's (hundreds of cells "
                 "means a panel origin is a whole cell out): " + "; ".join(off))

    euc, nat, brn = (np.nan_to_num(grids[k][land]) for k in ("euc", "nat", "burn"))
    nz = np.flatnonzero(brn > 0)
    euc_q, euc_lut = nibbles(euc)
    nat_q, nat_lut = nibbles(nat)

    payload = {
        "ny": NY,
        "nx": NX,
        "n": n,
        "mask": rle(land),
        "euc": euc_q,
        "euc_lut": euc_lut,
        "nat": nat_q,
        "nat_lut": nat_lut,
        "burn": {
            "i": delta(nz),
            "v": np.clip(np.rint(brn[nz] * 15), 1, 15).astype(int).tolist(),
        },
        "bin_edges": list(BIN_EDGES),
        "bins": burnt_bins(euc, brn),
        "report_ha": REPORT_HA,
    }
    text = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    ha = {"euc": float(euc.sum() * 100), "nat": float(nat.sum() * 100)}
    return text, {"cells": n, "ha": ha, "burn_cells": len(nz)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, type=pathlib.Path, help="clone of Xocas12/galicia-eucalyptus")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent / "galicia.json")
    ap.add_argument("--check", action="store_true", help="regenerate and compare, writing nothing")
    args = ap.parse_args()

    text, got = build(args.repo)
    d = json.loads(text)
    print(f"  cells          {got['cells']}")
    failed = got["cells"] != 29_565
    if failed:
        print(f"decode recovered {got['cells']} cells, expected 29,565", file=sys.stderr)
    for layer, label in (("euc", "eucalyptus"), ("nat", "native")):
        ref, floats, shipped = REPORT_HA[layer], got["ha"][layer], decoded_ha(d, layer)
        print(f"  {label:<14} {floats:,.0f} ha decoded, {shipped:,.0f} ha as the page reads it, "
              f"vs {ref:,} published ({floats / ref - 1:+.2%}, {shipped / ref - 1:+.2%})")
        if abs(floats / ref - 1) > AREA_TOL:
            print(f"{label}: recovered area is {floats / ref - 1:+.2%} off the published figure, "
                  f"limit {AREA_TOL:.1%}", file=sys.stderr)
            failed = True
    print(f"  burnt cells    {got['burn_cells']}")
    print("  bars           " + " / ".join(f"{100 * v:.2f}" for _, v in d["bins"]))
    # The same check the build runs, on the bytes about to be written.
    for p in payload_problems(d):
        print(f"payload: {p}", file=sys.stderr)
        failed = True
    if failed:
        return 1
    # The lede is text in demo_galicia.html, edited by hand after a regeneration, so a stale one
    # is reported here and refused by the build, not by this script.
    lede = lede_problems(d, LEDE.read_text(encoding="utf-8"))
    print("  lede           {} per cent down to {}".format(*lede_figures(d)) +
          ("" if not lede else " -- demo_galicia.html does not say so yet; the build refuses it until it does"))

    if args.check:
        same = args.out.exists() and args.out.read_text(encoding="utf-8") == text
        print(f"{args.out.name}: {'byte-for-byte identical' if same else 'DIFFERS from the committed file'}")
        return 0 if same else 1

    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({len(text.encode()) / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

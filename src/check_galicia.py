"""Can demo_galicia.js read galicia.json, and do the numbers it shows hold?

Each panel of the figure draws the same 29,565 cells, so a correct decode has no gaps, and
make_galicia.py refuses to write a panel whose land mask differs from the eucalyptus-2024 one.
The payload used to carry no-data lists (`nd_nat`, `burn.nd`, 625 and 403 cells). They were not
colour failures: two panel origins were a whole cell out, and the lists were the cells the shift
pushed off the coast. The page no longer reads such lists, so it would draw those cells as if
they had values; this refuses the payload instead, and checks the indexing the page relies on.

The page also sums and averages what it decodes, so the area check has to run on what the page
decodes, not on the floats make_galicia.py held before packing. The layers are four bits a
cell. Read linearly, as q/15, every value under 1/30 becomes zero: half the cells, 7,206 ha of
eucalyptus between them. The tiles then read 1.05 and 1.12 per cent under the report while the
generator's check on the unpacked floats passed at +0.16. So each layer ships a 16-entry decode
table, and this decodes the nibbles through it exactly as unpack() does and refuses the payload
if either total is more than half a per cent off the report:

  - eucalyptus against the 442,209 ha the report's 2024 table gives;
  - native broadleaf against the 533,432 ha of its 2017 table, because that panel is from 2017.

The bars and the two figures the lede quotes from them are the shipped bins, computed from the
full-resolution decode. The lede's text in demo_galicia.html is checked against those bins in
the rounding the bars use, so a regenerated payload cannot leave the lede quoting the old bars.

Standard library only, because the build installs nothing.
"""

from __future__ import annotations

import base64
import binascii
import json
import pathlib
import re
from decimal import ROUND_HALF_UP, Decimal

#: informe.md, "superficie no mapa (ha)". Eucalyptus from the 2024 table, native broadleaf from
#: the 2017 one: the years of the two panels shipped.
REPORT_HA = {"euc": 442_209, "nat": 533_432}
AREA_TOL = 0.005
LEVELS = 16
HA_PER_CELL = 100
LEDE = pathlib.Path(__file__).resolve().parent / "demo_galicia.html"
LEDE_SPANS = ("gl-bin-first", "gl-bin-last")


def levels(b64: str, n: int) -> list[int]:
    """The 4-bit level of each land cell, high nibble first, as unpack() reads them."""
    raw = base64.b64decode(b64, validate=True)
    return [raw[i >> 1] >> 4 if i % 2 == 0 else raw[i >> 1] & 15 for i in range(n)]


def decoded_ha(d: dict, layer: str) -> float:
    """The layer's area as the page sums it: unpack() decodes level q to `<layer>_lut[q]`."""
    lut = d[layer + "_lut"]
    counts = [0] * LEVELS
    for q in levels(d[layer], d["n"]):
        counts[q] += 1
    return HA_PER_CELL * sum(c * v for c, v in zip(counts, lut))


def js_fixed1(x: float) -> str:
    """`x.toFixed(1)` in JavaScript: rounds the exact binary value, a tie going up (x >= 0)."""
    return str(Decimal(x).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def lede_figures(d: dict) -> tuple[str, str]:
    """The first and last bars' labels, which the lede quotes."""
    return js_fixed1(100 * d["bins"][0][1]), js_fixed1(100 * d["bins"][-1][1])


def _number(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def payload_problems(d: dict) -> list[str]:
    """Problems with the payload alone. Empty means the page can read every layer on every
    cell, and its area tiles are within AREA_TOL of the report's figures."""
    problems: list[str] = []

    for where, obj in (("", d), ("burn.", d.get("burn", {}))):
        for k in sorted(obj):
            if k.startswith("nd"):
                problems.append(
                    f"{where}{k} lists {len(obj[k])} land cells with no value; every panel draws "
                    "the same cells, so a no-data list means a panel origin is off"
                )

    required = {"ny", "nx", "n", "mask", "euc", "nat", "euc_lut", "nat_lut", "burn"}
    required |= {"bin_edges", "bins", "report_ha"}
    missing = required - set(d)
    missing |= {"burn." + k for k in ("i", "v") if k not in d.get("burn", {})}
    if missing:
        return problems + [f"missing keys {sorted(missing)}"]
    n = d["n"]

    runs = d["mask"]
    if any(not isinstance(r, int) or r < 0 for r in runs):
        problems.append("mask has a negative or non-integer run")
    elif sum(runs) != d["ny"] * d["nx"]:
        problems.append(f"mask runs cover {sum(runs)} cells, the grid has {d['ny'] * d['nx']}")
    elif sum(runs[1::2]) != n:
        problems.append(f"mask marks {sum(runs[1::2])} land cells, n says {n}")

    if d["report_ha"] != REPORT_HA:
        problems.append(
            f"report_ha is {d['report_ha']}, but the areas are checked against {REPORT_HA}; "
            "the note would quote figures the build never compared"
        )

    for layer in ("euc", "nat"):
        try:
            size = len(base64.b64decode(d[layer], validate=True))
        except binascii.Error as exc:
            problems.append(f"{layer} is not base64: {exc}")
            continue
        if size != (n + 1) // 2:
            problems.append(f"{layer} packs {size} bytes, {n} cells at 4 bits need {(n + 1) // 2}")
            continue

        lut = d[layer + "_lut"]
        if not isinstance(lut, list) or len(lut) != LEVELS or not all(_number(v) for v in lut):
            problems.append(f"{layer}_lut must be {LEVELS} numbers, one per 4-bit level")
            continue
        # Each entry is the mean of the values that rounded to that level, so it lies inside
        # the level's own interval: the hover still moves in 16 steps, and no table can move
        # the total by reassigning levels.
        stray = [
            q for q, v in enumerate(lut)
            if not max(0.0, (q - 0.5) / 15) - 1e-5 <= v <= min(1.0, (q + 0.5) / 15) + 1e-5
        ]
        if stray:
            problems.append(f"{layer}_lut decodes level(s) {stray} outside the values that level holds")
            continue

        ha, ref = decoded_ha(d, layer), REPORT_HA[layer]
        err = ha / ref - 1
        if abs(err) > AREA_TOL:
            problems.append(
                f"{layer} decodes to {ha:,.0f} ha as the page reads it, {err:+.2%} off the "
                f"report's {ref:,}; limit {AREA_TOL:.1%}"
            )

    deltas, vals = d["burn"]["i"], d["burn"]["v"]
    if len(deltas) != len(vals):
        problems.append(f"burn has {len(deltas)} indices and {len(vals)} values")
    if deltas and (deltas[0] < 0 or any(x <= 0 for x in deltas[1:]) or sum(deltas) >= n):
        problems.append("burn indices are not strictly increasing land-cell indices below n")
    if any(not 1 <= v <= 15 for v in vals):
        problems.append("burn values must be 4-bit levels from 1 to 15")

    edges, bins = d["bin_edges"], d["bins"]
    if (
        not isinstance(edges, list) or len(edges) < 2 or not all(_number(e) for e in edges)
        or edges[0] != 0 or edges[-1] <= 1 or any(b <= a for a, b in zip(edges, edges[1:]))
    ):
        problems.append("bin_edges must rise from 0 to past 1, so that every cell falls in a bin")
    elif (
        not isinstance(bins, list) or len(bins) != len(edges) - 1
        or not all(isinstance(b, list) and len(b) == 2 for b in bins)
    ):
        problems.append(f"bins must be {len(edges) - 1} [cells, mean burnt share] pairs, one per bin")
    elif not all(isinstance(c, int) and c >= 0 and _number(v) and 0 <= v <= 1 for c, v in bins):
        problems.append("each bin needs a cell count and a burnt share between 0 and 1")
    elif sum(c for c, _ in bins) != n:
        problems.append(f"bins hold {sum(c for c, _ in bins)} cells, n says {n}")
    return problems


def lede_problems(d: dict, html: str) -> list[str]:
    """Does the lede quote the first and last bars? The page fills the two spans from the bins
    at load; this keeps the text in the fragment, which is what shows before then and without
    scripts, from going stale when the payload is regenerated."""
    problems = []
    for span, want in zip(LEDE_SPANS, lede_figures(d)):
        m = re.search(rf'id="{span}">([^<]*)<', html)
        if not m:
            problems.append(f"the lede has no #{span}; it should quote the bar, {want}")
        elif m.group(1).strip() != want:
            problems.append(f"the lede's #{span} says {m.group(1).strip()}, the bar it quotes says {want}")
    return problems


def check(payload_text: str, lede_html: str | None = None) -> list[str]:
    """Return a list of problems. Empty means the page can read every layer on every cell, its
    area tiles are within AREA_TOL of the report, and the lede quotes the bars under it.
    `lede_html` defaults to demo_galicia.html beside this file."""
    d = json.loads(payload_text)
    problems = payload_problems(d)
    if problems:
        return problems
    return lede_problems(d, LEDE.read_text(encoding="utf-8") if lede_html is None else lede_html)


if __name__ == "__main__":  # pragma: no cover
    import sys

    text = (pathlib.Path(__file__).resolve().parent / "galicia.json").read_text(encoding="utf-8")
    found = check(text)
    for p in found:
        print(p)
    d = json.loads(text)
    if not found:
        for layer in ("euc", "nat"):
            ha = decoded_ha(d, layer)
            print(f"{layer}: {ha:,.0f} ha as the page decodes it, "
                  f"{ha / REPORT_HA[layer] - 1:+.2%} off the report's {REPORT_HA[layer]:,}")
        print("lede: {} per cent down to {}".format(*lede_figures(d)))
    print(f"galicia.json: {d['n']} land cells, {len(found)} problem(s)")
    sys.exit(1 if found else 0)

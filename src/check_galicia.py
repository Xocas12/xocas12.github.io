"""Does galicia.json give every layer a value on every land cell, as demo_galicia.js assumes?

Each panel of the figure draws the same 29,565 cells, so a correct decode has no gaps, and
make_galicia.py refuses to write a panel whose land mask differs from the eucalyptus one.
The payload used to carry no-data lists (`nd_nat`, `burn.nd`, 625 and 403 cells). They were not
colour failures: two panel origins were a whole cell out, and the lists were the cells the shift
pushed off the coast. The page no longer reads such lists, so it would draw those cells as if
they had values; this refuses the payload instead, and checks the indexing the page relies on.

It also checks that the eucalyptus layer is the 2017 map, which is what the page calls it. The
2024 map is made after the 2018-2023 fires and finds about half as much eucalyptus where they
burned, so a payload built from it would set the fires against their own aftermath. The two maps
are 8 per cent apart in total area, which is enough to tell them apart from the payload alone.
Standard library only, because the build installs nothing.
"""

from __future__ import annotations

import base64
import binascii
import json

#: informe.md, the 2017 eucalyptus area (482,702 ha on the map; the 2024 map has 442,209). The
#: page packs each cell to 4 bits, which costs about 1 per cent of the area, so the tolerance is
#: 2 per cent: wide enough for the packing, a quarter of the gap to the 2024 map.
EUC_2017_HA = 482_702
EUC_HA_TOL = 0.02


def check(payload_text: str) -> list[str]:
    """Return a list of problems. Empty means the page can read every layer on every cell."""
    d = json.loads(payload_text)
    problems: list[str] = []

    for where, obj in (("", d), ("burn.", d.get("burn", {}))):
        for k in sorted(obj):
            if k.startswith("nd"):
                problems.append(
                    f"{where}{k} lists {len(obj[k])} land cells with no value; every panel draws "
                    "the same cells, so a no-data list means a panel origin is off"
                )

    missing = {"ny", "nx", "n", "mask", "euc", "nat", "burn"} - set(d)
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

    for layer in ("euc", "nat"):
        try:
            packed = base64.b64decode(d[layer], validate=True)
        except binascii.Error as exc:
            problems.append(f"{layer} is not base64: {exc}")
            continue
        if len(packed) != (n + 1) // 2:
            problems.append(f"{layer} packs {len(packed)} bytes, {n} cells at 4 bits need {(n + 1) // 2}")
            continue
        if layer == "euc":
            # Every cell is 1 km2 = 100 ha; a level of 15 is the whole cell. The pad nibble is 0.
            ha = sum((b >> 4) + (b & 15) for b in packed) / 15 * 100
            if abs(ha / EUC_2017_HA - 1) > EUC_HA_TOL:
                problems.append(
                    f"euc sums to {ha:,.0f} ha; the page labels it the 2017 map, which has "
                    f"{EUC_2017_HA:,} ha (limit {EUC_HA_TOL:.0%}). Built from the 2024 panel?"
                )

    deltas, levels = d["burn"]["i"], d["burn"]["v"]
    if len(deltas) != len(levels):
        problems.append(f"burn has {len(deltas)} indices and {len(levels)} values")
    if deltas and (deltas[0] < 0 or any(x <= 0 for x in deltas[1:]) or sum(deltas) >= n):
        problems.append("burn indices are not strictly increasing land-cell indices below n")
    if any(not 1 <= v <= 15 for v in levels):
        problems.append("burn values must be 4-bit levels from 1 to 15")
    return problems


if __name__ == "__main__":  # pragma: no cover
    import pathlib
    import sys

    text = (pathlib.Path(__file__).resolve().parent / "galicia.json").read_text(encoding="utf-8")
    found = check(text)
    for p in found:
        print(p)
    print(f"galicia.json: {json.loads(text)['n']} land cells, {len(found)} problem(s)")
    sys.exit(1 if found else 0)

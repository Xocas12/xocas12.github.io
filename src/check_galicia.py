"""Does galicia.json give every layer a value on every land cell, as demo_galicia.js assumes?

Each panel of the figure draws the same 29,565 cells, so a correct decode has no gaps, and
make_galicia.py refuses to write a panel whose land mask differs from the eucalyptus-2024 one.
The payload used to carry no-data lists (`nd_nat`, `burn.nd`, 625 and 403 cells). They were not
colour failures: two panel origins were a whole cell out, and the lists were the cells the shift
pushed off the coast. The page no longer reads such lists, so it would draw those cells as if
they had values; this refuses the payload instead, and checks the indexing the page relies on.
Standard library only, because the build installs nothing.
"""

from __future__ import annotations

import base64
import binascii
import json


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
            size = len(base64.b64decode(d[layer], validate=True))
        except binascii.Error as exc:
            problems.append(f"{layer} is not base64: {exc}")
            continue
        if size != (n + 1) // 2:
            problems.append(f"{layer} packs {size} bytes, {n} cells at 4 bits need {(n + 1) // 2}")

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

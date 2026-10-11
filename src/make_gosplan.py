"""Derive src/gosplan.json from gosplan-env's committed run output.

Source
------
    gh repo clone Xocas12/gosplan-env

Reads `runs/phase1_gate/runs/*/` and `runs/estimator_bias/runs/*/` (each a `manifest.json` plus a
`rho_by_episode.json` of 100 evaluation episodes) and the criterion-2 table in
`runs/phase1_gate/report.md`. That is about 38 MB of committed JSON holding 1,916,440 reported
fulfilment ratios, which is why this reads a local clone rather than fetching.

    python src/make_gosplan.py --repo ../gosplan-env
    python src/make_gosplan.py --repo ../gosplan-env --check

What is shipped, and why these cells
------------------------------------
Only the five cells with `overfulfilment_cap == 1.2`, varying `notch_width` over
0.0 / 0.02 / 0.05 / 0.1 / 0.25.

The repository's own headline pair compares notch_width 0.0 with cap 1.2 against notch_width
0.25 with cap inf, which moves two incentive parameters at once and so cannot attribute anything
to the notch. Its 10-cell sweep does contain the cap-held-fixed comparison, and that is what the
page draws. The cost is that four of the five cells pool 5 seeds where the 0.0 cell pools 30.

Per-seed rows ship as share and verdict only. `b_hat` values like
`286,021.884 [78,863.377, 313,889.486]` are a vanishing denominator rather than an estimate, and
rendering them to three decimals would imply a precision that does not exist.

Nothing here is a finding. The repository is explicit that bunching is a pipeline check and not
part of its claims, and that its pre-registered test for it failed; the page leads with that.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

LO, HI, BW = 0.9, 1.3, 0.002
NBINS = 200
WIDTHS = ["0.0", "0.02", "0.05", "0.1", "0.25"]
CAP = "1.2"
THRESH = 0.44

#: Cross-checked against runs/phase1_gate/report.md and runs/G2_record.md. The record states
#: "77% of measured reports lie in [1.00, 1.02] on average", "3.7% of reports in the window on
#: average" and "23 of 30 seeds clear the share threshold".
EXPECT = {
    "notched_mean_share": 0.767,
    "smooth_mean_share": 0.037,
    "notched_clearing": 23,
    "smooth_clearing": 0,
    "sharp_peak_pct": 19.95,
}
ROW = re.compile(
    r"^\| (notched|smooth) \| (\d+) \| (\S+) \| \[([^\]]*)\] \| (\S+) \| (\S+) \| (\S+) \| (\S+) \| (\w+) \|$",
    re.M,
)


def collect(repo: pathlib.Path) -> dict:
    """Histogram every report of every run, keyed by (notch_width, overfulfilment_cap)."""
    cells: dict[str, dict] = {}
    roots = [repo / "runs/estimator_bias/runs", repo / "runs/phase1_gate/runs"]
    seen = 0
    for root in roots:
        if not root.exists():
            sys.exit(f"{root} not found -- is this a clone of Xocas12/gosplan-env?")
        for d in sorted(root.iterdir()):
            rho = d / "rho_by_episode.json"
            if not rho.exists():
                continue
            inc = json.loads((d / "manifest.json").read_text())["config"]["incentive"]
            key = f"{inc['notch_width']}|{inc['overfulfilment_cap']}"
            cell = cells.setdefault(key, {"n": 0, "lo": 0, "hi": 0, "c": [0] * NBINS, "seeds": 0})
            cell["seeds"] += 1
            seen += 1
            for episode in json.loads(rho.read_text()):
                for x in episode:
                    cell["n"] += 1
                    if x < LO:
                        cell["lo"] += 1
                    elif x >= HI:
                        cell["hi"] += 1
                    else:
                        cell["c"][int((x - LO) / BW)] += 1
    if not seen:
        sys.exit("no rho_by_episode.json found under runs/ -- is the clone complete?")
    return cells


def build(repo: pathlib.Path) -> tuple[str, dict]:
    cells = collect(repo)
    out_cells = []
    for width in WIDTHS:
        key = f"{width}|{CAP}"
        if key not in cells:
            sys.exit(f"cell {key} missing from the sweep; found {sorted(cells)}")
        v = cells[key]
        counts = v["c"]
        total = sum(counts) + v["lo"] + v["hi"]
        peak = max(counts)
        pi = counts.index(peak)
        first = next(i for i, c in enumerate(counts) if c)
        last = len(counts) - next(i for i, c in enumerate(reversed(counts)) if c)
        out_cells.append(
            {
                "w": float(width),
                "n": total,
                "below": v["lo"],
                "above": v["hi"],
                "i0": first,
                "c": counts[first:last],
                "peak": round(100 * peak / total, 2),
                "peakRho": round(LO + (pi + 0.5) * BW, 3),
            }
        )

    text_md = (repo / "runs/phase1_gate/report.md").read_text(encoding="utf-8")
    rows = ROW.findall(text_md)
    if len(rows) != 60:
        sys.exit(f"criterion-2 table parsed to {len(rows)} rows, expected 60")
    seeds: dict[str, list] = {"notched": [], "smooth": []}
    for arm, seed, _b, _ci, _hole, share, _pad, _eff, verdict in rows:
        seeds[arm].append({"s": int(seed), "share": round(float(share), 4), "v": verdict})
    for k in seeds:
        seeds[k].sort(key=lambda x: x["share"])

    payload = {"lo": LO, "w": BW, "cells": out_cells, "seeds": seeds, "thresh": THRESH}
    text = json.dumps(payload, separators=(",", ":"), allow_nan=False)

    got = {
        "notched_mean_share": round(sum(s["share"] for s in seeds["notched"]) / 30, 3),
        "smooth_mean_share": round(sum(s["share"] for s in seeds["smooth"]) / 30, 3),
        "notched_clearing": sum(1 for s in seeds["notched"] if s["share"] >= THRESH),
        "smooth_clearing": sum(1 for s in seeds["smooth"] if s["share"] >= THRESH),
        "sharp_peak_pct": out_cells[0]["peak"],
    }
    return text, got


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, type=pathlib.Path, help="clone of Xocas12/gosplan-env")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent / "gosplan.json")
    ap.add_argument("--check", action="store_true", help="regenerate and compare, writing nothing")
    args = ap.parse_args()

    text, got = build(args.repo)
    bad = []
    for k, want in EXPECT.items():
        ok = got[k] == want
        print(f"  {k:20} {got[k]!r}" + ("" if ok else f"   EXPECTED {want!r}"))
        if not ok:
            bad.append(k)
    if bad:
        print(f"derived values disagree with the repository's published record: {bad}", file=sys.stderr)
        return 1

    if args.check:
        same = args.out.exists() and args.out.read_text(encoding="utf-8") == text
        print(f"{args.out.name}: {'byte-for-byte identical' if same else 'DIFFERS from the committed file'}")
        return 0 if same else 1

    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({len(text.encode()) / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

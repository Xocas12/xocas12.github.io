"""Does the turnout demo say what its numbers say, and say what has not been checked?

The lede of `demo_forensics.html` is the only sentence most visitors read, and it once stated
the fraud mechanism as fact, named both elections as showing it and gave no result. The
numbers sat in the tiles; the caveats sat nowhere. This keeps the three in step:

- the 2018 and 2011 rows of `forensics.json` must equal forensic-elections' published
  anchor1_national.csv rows, pinned below;
- the lede must quote the 2018 result as the tiles print it: precincts tested, observed,
  expected ± one standard deviation, excess and z;
- any lede sentence about officials or targets must name the paper whose reading it is;
- the lede must name the false-positive control that has not been run (Poland 2010, Spain 2011)
  and link the "What is not claimed" section of RESULTS.md at a pinned commit.

When the control is run upstream, change the lede and the CONTROL rule together.
"""

from __future__ import annotations

import html
import json
import math
import pathlib
import re
from decimal import ROUND_HALF_UP, Decimal

SRC = pathlib.Path(__file__).resolve().parent
FRAGMENT = SRC / "demo_forensics.html"

#: Xocas12/forensic-elections at 22e373b93edd, projects/elections/results/anchor1_national.csv,
#: quantity turnout_boxes: n_stations - n_excluded_small, observed, expected_mean, expected_sd, z.
ANCHOR1_NATIONAL = {
    "2011": (95225 - 4143, 11640.0, 11435.07, 89.57007924233062, 2.287929202848699),
    "2018": (97699 - 4098, 11907.0, 10817.975, 89.63002892684536, 12.150224796745798),
}
#: The payload rounds expected, sd and z to two places.
TOLERANCE = 0.005 + 1e-9

CONTROL = ("Poland 2010", "Spain 2011")
NOT_CLAIMED = re.compile(
    r'href="https://github\.com/Xocas12/forensic-elections/blob/[0-9a-f]{7,40}/RESULTS\.md#what-is-not-claimed"'
)
# A sentence that describes the mechanism has to say whose reading it is.
MECHANISM = re.compile(r"\b(official|target)", re.I)
ATTRIBUTION = "Kobak, Shpilkin and Pshenichnikov (2016)"


def js_round(v: float) -> int:
    """Math.round, which the tiles use: halves go up, not to even."""
    return math.floor(v + 0.5)


def js_fixed(v: float, places: int) -> str:
    """Number.prototype.toFixed: the exact binary value, ties away from zero."""
    return str(Decimal(v).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def tiles(row: dict) -> dict[str, str]:
    """The strings demo_forensics.js prints in the four tiles, from the same payload fields."""
    return {
        "precincts": f"{row['n']:,}",
        "observed": f"{js_round(row['observed']):,}",
        "expected": f"{js_round(row['expected']):,}",
        "sd": f"± {js_round(row['sd']):,}",
        "excess": f"{js_round(row['observed'] - row['expected']):,}",
        "z": js_fixed(row["z"], 1),
    }


def lede(fragment: str) -> tuple[str, str]:
    """The lede's markup and its text with tags dropped and whitespace collapsed."""
    m = re.search(r'<p class="lede">(.*?)</p>', fragment, re.S)
    if not m:
        return "", ""
    raw = m.group(1)
    return raw, " ".join(html.unescape(re.sub(r"<[^>]+>", "", raw)).split())


def has_number(text: str, token: str) -> bool:
    # Whole numbers only: 1,089 must not match inside 11,089 or 1,089.5.
    return re.search(r"(?<![\d.,])" + re.escape(token) + r"(?![\d]|[.,]\d)", text) is not None


def check(payload_text: str, fragment_text: str | None = None) -> list[str]:
    """Return a list of problems. Empty means the lede, the tiles and the published table agree."""
    d = json.loads(payload_text)
    fragment = fragment_text if fragment_text is not None else FRAGMENT.read_text(encoding="utf-8")
    problems: list[str] = []

    for year, (n, observed, expected, sd, z) in ANCHOR1_NATIONAL.items():
        row = d[year]
        if row["n"] != n or row["observed"] != observed:
            problems.append(f"{year}: payload n/observed {row['n']}/{row['observed']}, "
                            f"anchor1_national.csv {n}/{observed}")
        for key, want in (("expected", expected), ("sd", sd), ("z", z)):
            if abs(row[key] - want) > TOLERANCE:
                problems.append(f"{year}: payload {key} {row[key]}, anchor1_national.csv {want}")

    raw, text = lede(fragment)
    if not text:
        return problems + ['demo_forensics.html has no <p class="lede">']

    shown = tiles(d["2018"])
    for name, token in shown.items():
        if not has_number(text, token):
            problems.append(f"the lede does not give the 2018 {name} as the tiles print it ({token!r})")

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if MECHANISM.search(sentence) and ATTRIBUTION not in sentence:
            problems.append(f"the lede states a mechanism without saying whose reading it is: {sentence!r}")

    for place in CONTROL:
        if place not in text:
            problems.append(f"the lede does not name the unrun {place} control")
    if not NOT_CLAIMED.search(raw):
        problems.append("the lede does not link forensic-elections' 'What is not claimed' at a pinned commit")
    return problems


if __name__ == "__main__":  # pragma: no cover
    import sys

    found = check((SRC / "forensics.json").read_text(encoding="utf-8"))
    for p in found:
        print(p)
    print("forensics lede, tiles and anchor1_national.csv agree" if not found
          else f"{len(found)} problem(s) in the forensics lede or payload")
    sys.exit(1 if found else 0)

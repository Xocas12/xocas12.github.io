"""Derive src/sac1956.json from the SAC 1956 target lists.

Source
------
    gh repo clone Xocas12/Nuclear-Probabilities -- -b claude/sleepy-davinci-d3sk0m

Branch matters: `main` is a 34-file subset that does NOT carry these CSVs. Two files are read,
`data/curated/labels/us_1956_sac_complexes.csv` and `.../us_1956_sac_airfields.csv`, both
transcriptions of SAC's Atomic Weapons Requirements Study for 1959 (SM 129-56, 15 June 1956).

    python src/make_sac.py --repo ../Nuclear-Probabilities
    python src/make_sac.py --repo ../Nuclear-Probabilities --check   # regenerate and compare

What is kept, and what is dropped
---------------------------------
Kept per row: the printed name, the coordinate as arc-minute integers, which of the two lists it
came from, its priority tier, its country, the PDF page, and the printed line verbatim.

Dropped: `weapons` and `yield_kt`, which are redacted in the released copy and empty here;
`selected`, which is 1 on every row and so would invite the page to imply that unmarked places
were examined and spared; `plan_id`, `planner`, `plan_year`, `provenance` and `source_doc`, which
are constant per list; `source_url`, carried once per list instead of 2,343 times; and `notes`
and `name_modern`, which the panel does not show.

Four rows print no usable coordinate and are dropped, which is why the page says 2,339 of 2,343.
They are already known upstream: `data/curated/sac1956/anomalies.csv` lists ARKHANGELSK/BAKARITSA
(minutes>=60), OLOVYANNAYA, ONEGA and PALANGA (a `?` where a digit should be).

How the quote is stored
-----------------------
The panel exists so a stranger can check the transcription against the scan, so no saving is
worth a printed character. The quote is therefore not rebuilt from its parts -- the two files do
not even share a format, a complex line being `701 0022 ABDULINO 5340-05340` against an airfield
`1042 0020 ABAKAN 0161-8002 5343-09127 R`, so one rebuild rule would be wrong for one of them.

What IS removed is only what the payload already carries under its own key, and only where
putting it back reproduces the line exactly:

  `~`  stands for the coordinate, which la/lo render
  `^`  stands for the leading priority token, which p carries

and the display name is derived from the quote rather than stored beside it, which is what the
`n` array used to duplicate. Both sentinels are characters that appear nowhere in any quote.

Every substitution is proved, not assumed: this script expands all 2,339 templates and asserts
each reproduces its original quote byte for byte, and that the derived name reproduces the
original, before it will write anything. A row that fails either test keeps its literal quote
and gets its name listed in `nx`. That takes the payload from 174.5 KB to 116.9 KB with nothing
lost. src/check_sac.py then checks the rendered coordinate against the expanded quote on every
build.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

import pandas as pd

#: Sentinels for the two derivable parts of a quote. Printable, and verified below to appear in
#: no quote; a control character would be JSON-escaped to six bytes and cost more than it saves.
SENT_COORD = "~"
SENT_PRIO = "^"

LISTS = [
    ("data/curated/labels/us_1956_sac_complexes.csv", 0),  # urban-industrial complex
    ("data/curated/labels/us_1956_sac_airfields.csv", 1),  # airfield
]
SOURCE_URLS = [
    "https://nsarchive.gwu.edu/document/15800-09-urban-industrial-target-list-part-i",
    "https://nsarchive.gwu.edu/document/15800-08-air-power-target-list-part-i",
]

#: Checked against the source repository's own README and data card. A decode or parse bug that
#: did not move these would have to be very strange.
EXPECT = {
    "rows_in": 2343,          # README: the two Part I lists, transcribed in full
    "rows_plotted": 2339,     # minus the four anomalies.csv rows with no usable coordinate
    "complex_top": "MOSCOW",  # priority 1 of the complex list
    "airfield_top": "BYKHOV",  # priority 1 of the airfield list
    "complex_max": 1223,
    "airfield_max": 1111,
}


def priority_rank(value: str) -> int:
    """The tier number, parsed numerically.

    18 airfield rows carry a letter suffix (`1036A`, `576A`); no complex row does. `int()` raises
    on those, and a plain `max()` over the raw strings returns "999" because it compares
    lexicographically -- which is how a stat tile came to claim the airfield list stops at 999
    when it runs to 1,111.
    """
    m = re.match(r"(\d+)", str(value))
    return int(m.group(1)) if m else 0


def render_dms(minutes: int, is_lon: bool) -> str:
    """The same arithmetic as dms() in demo_sac.js and check_sac.py."""
    neg = minutes < 0
    deg, mm = divmod(abs(minutes), 60)
    return str(deg).zfill(3 if is_lon else 2) + str(mm).zfill(2) + ("W" if neg and is_lon else "")


def coord_string(la: int, lo: int) -> str:
    lon = lo - 360 * 60 if lo > 180 * 60 else lo
    return render_dms(la, False) + "-" + render_dms(lon, True)


def expand(template: str, row: dict) -> str:
    """Put the sentinels back. demo_sac.js does exactly this, and check_sac.py asserts it."""
    return template.replace(SENT_COORD, coord_string(row["la"], row["lo"])).replace(
        SENT_PRIO, str(row["p"])
    )


def display_name(quote: str) -> str:
    """The printed name, title-cased and clipped -- what the panel heads the entry with.

    Written to match the JS rule character for character: lower-case everything, then upper-case
    any letter that follows a non-letter. That is Python's str.title() for ASCII, and the JS is
    a regex doing the same, so the two cannot drift without this assertion failing.
    """
    m = NAME_RE.match(quote)
    return m.group(3).title()[:26] if m else ""


#: priority, reference number, NAME, then the rest beginning with a coordinate-shaped token.
NAME_RE = re.compile(r"^(\S+)\s+(\d{4,5})\s+(.*?)\s+((?:\d{4}-\S+).*)$")


def build(repo: pathlib.Path) -> tuple[str, dict]:
    rows, dropped = [], []
    for rel, kind in LISTS:
        path = repo / rel
        if not path.exists():
            sys.exit(f"{path} not found -- is this a clone of the claude/sleepy-davinci-d3sk0m branch?")
        d = pd.read_csv(path, dtype=str)
        lat = pd.to_numeric(d["lat"], errors="coerce")
        lon = pd.to_numeric(d["lon"], errors="coerce")
        for i, r in d.iterrows():
            if pd.isna(lat[i]) or pd.isna(lon[i]):
                dropped.append(str(r["name_source"]))
                continue
            lo = float(lon[i])
            # Chukotka sits across the antimeridian: six complexes and seven airfields print a
            # western longitude. Shifting them past 180 keeps the USSR one shape on the map; the
            # panel shifts them back before printing the coordinate.
            if lo < -150:
                lo += 360
            page = re.search(r"p\.(\d+)", str(r["source_page"]))
            rows.append(
                {
                    "la": int(round(float(lat[i]) * 60)),
                    "lo": int(round(lo * 60)),
                    "k": kind,
                    "p": priority_rank(r["priority"]),
                    "n": str(r["name_source"]).strip().title()[:26],
                    "c": str(r["target_country"]).strip(),
                    "q": str(r["quote"]).strip(),
                    "pg": int(page.group(1)) if page else 0,
                }
            )

    rows.sort(key=lambda r: r["p"])

    # Templates, with a proof. See the module docstring.
    used = set("".join(r["q"] for r in rows))
    if SENT_COORD in used or SENT_PRIO in used:
        sys.exit("a sentinel character occurs in the data; pick another")
    name_exceptions = []
    for i, r in enumerate(rows):
        q = r["q"]
        t = q.replace(coord_string(r["la"], r["lo"]), SENT_COORD, 1)
        head, _, tail = t.partition(" ")
        if head == str(r["p"]) and tail:
            t = SENT_PRIO + " " + tail
        if expand(t, r) != q:
            t = q  # not provably reversible: keep the line as printed
        r["t"] = t
        if display_name(q) != r["n"]:
            name_exceptions.append([i, r["n"]])
    for i, r in enumerate(rows):
        if expand(r["t"], r) != r["q"]:
            sys.exit(f"row {i} does not round-trip; refusing to write a lossy payload")
    countries = sorted({r["c"] for r in rows})
    ci = {c: i for i, c in enumerate(countries)}
    payload = {
        "countries": countries,
        "src": SOURCE_URLS,
        "la": [r["la"] for r in rows],
        "lo": [r["lo"] for r in rows],
        "k": [r["k"] for r in rows],
        "p": [r["p"] for r in rows],
        "c": [ci[r["c"]] for r in rows],
        "pg": [r["pg"] for r in rows],
        # The display name is derived from the quote in the page; only the rows where that
        # derivation disagrees are carried, as [index, name].
        "nx": name_exceptions,
        "q": [r["t"] for r in rows],
    }
    # allow_nan=False, because a bare NaN here is valid JavaScript and not valid JSON, and the
    # page would draw fewer points than its own counter reports. It has happened.
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

    tops = {k: max((r["p"] for r in rows if r["k"] == k), default=0) for k in (0, 1)}
    firsts = {k: next(r["q"].split()[2] for r in rows if r["k"] == k) for k in (0, 1)}
    return text, {
        "name_exceptions": len(name_exceptions),
        "rows_in": len(rows) + len(dropped),
        "rows_plotted": len(rows),
        "dropped": dropped,
        "complex_max": tops[0],
        "airfield_max": tops[1],
        "complex_top": firsts[0],
        "airfield_top": firsts[1],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", required=True, type=pathlib.Path, help="clone of Xocas12/Nuclear-Probabilities")
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path(__file__).resolve().parent / "sac1956.json")
    ap.add_argument("--check", action="store_true", help="regenerate and compare, writing nothing")
    args = ap.parse_args()

    text, got = build(args.repo)

    bad = [f"{k}: expected {v!r}, got {got[k]!r}" for k, v in EXPECT.items() if got[k] != v]
    for k, v in EXPECT.items():
        print(f"  {k:14} {got[k]!r}" + ("" if got[k] == v else f"   EXPECTED {v!r}"))
    print(f"  dropped        {got['dropped']}")
    print(f"  name_except    {got['name_exceptions']} (names not derivable from their quote)")
    if bad:
        print("\n".join(bad), file=sys.stderr)
        return 1

    if args.check:
        same = args.out.exists() and args.out.read_text(encoding="utf-8") == text
        print(f"{args.out.name}: {'byte-for-byte identical' if same else 'DIFFERS from the committed file'}")
        return 0 if same else 1

    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({len(text.encode()) / 1024:.1f} KB, {got['rows_plotted']} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

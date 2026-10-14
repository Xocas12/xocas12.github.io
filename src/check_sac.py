"""Does the coordinate the SAC panel prints agree with the line it prints it beside?

`demo_sac.js` stores arc-minute integers and formats them back into the study's own DDMM-DDDMM
form for display, directly under a verbatim quote of the printed line. If that formatting ever
drifts, the page shows a coordinate that disagrees with the line above it while captioning
itself "as printed on PDF page N" — i.e. it misquotes a document it is inviting the reader to go
and check. Nothing else in the repository would notice.

So this re-implements the renderer's arithmetic in Python and compares it against the DMS pair
inside each row's own quote, for every row. It needs no network and no source checkout: the
payload carries both halves.

Three rows are expected to disagree, and they are a finding about the source data rather than
about this renderer. Their quotes carry a capital I where the coordinate has a 1 — plausibly a
faithful reading of a 1956 typescript with no separate `1` typebar, since the curated lat/lon
columns resolve all three correctly. Reported as Xocas12/Nuclear-Probabilities#1. They are named
here so that a fourth cannot arrive unnoticed.

It also checks the link printed beside them. The panel cites "PDF page N" and links to
`src[k]#page=N`, which lands on the cited page only if `src[k]` is the PDF itself: a link to the
Archive's page about a document opens a web page, and the airfield link once opened a 404. Which
PDF, and that N falls inside it, make_sac.py checks against its SCANS table when it writes the
payload; offline, the build can insist that every link is an https PDF and every page is >= 1.
"""

from __future__ import annotations

import json
import re

#: priority, reference number, NAME, then the rest beginning with a coordinate-shaped token.
#: The same expression make_sac.py and demo_sac.js use.
NAME_RE = re.compile(r"^(\S+)\s+(\d{4,5})\s+(.*?)\s+((?:\d{4}-\S+).*)$")

# name -> the quote as it stands in the source files. Matched on both so that a change to either
# the glyph or the row it belongs to shows up as a new failure rather than silently fitting the
# exemption.
KNOWN_GLYPH_ROWS = {
    "Kecskemet Hung": "403 3358 KECSKEMET HUNG 4654-0194I",
    "Markovo": "63 4898 MARKOVO 0074-8001 6441-I7026 R",
    "Ostrov Vran/Somnitelnaya": "608 5903 OSTROV VRAN/SOMNITELNAYA 0065-8009 7057-I7934W R",
}

# The last DMS pair on the line: DDMM-DDDMM, optionally followed by W. Last rather than first
# because an airfield line also carries a BE number of the same shape (0074-8001).
DMS = re.compile(r"(\d{4})-(\d{5})(W?)")


def render(minutes: int, is_lon: bool) -> str:
    """The same arithmetic as `dms()` in demo_sac.js, kept deliberately parallel to it."""
    neg = minutes < 0
    m = abs(minutes)
    deg, mm = divmod(m, 60)
    return str(deg).zfill(3 if is_lon else 2) + str(mm).zfill(2) + ("W" if neg and is_lon else "")


def check_links(d: dict) -> list[str]:
    """The scan link: one https PDF per list, and a page number to open it at for every row."""
    problems: list[str] = []
    src = d.get("src", [])
    kinds = sorted(set(d["k"]))
    if len(src) != len(kinds) or kinds != list(range(len(kinds))):
        problems.append(f"src has {len(src)} links for lists {kinds}; the panel reads src[k]")
    for k, url in enumerate(src):
        if not (url.startswith("https://") and url.lower().endswith(".pdf")):
            problems.append(f"src[{k}] is {url!r}, not the scan PDF that '#page=N' can open")
    low = [i for i, pg in enumerate(d["pg"]) if not (isinstance(pg, int) and pg >= 1)]
    if low:
        problems.append(f"{len(low)} rows have no PDF page to link to, the first at index {low[0]}")
    return problems


def check(payload_text: str) -> list[str]:
    """Return a list of problems. Empty means the panel quotes the document and links its scan."""
    d = json.loads(payload_text)
    problems: list[str] = []
    exempt_seen: set[str] = set()
    fixes = {e[0]: e[1] for e in d.get("nx", [])}

    for i in range(len(d["la"])):
        # Longitudes past 180 were shifted east for drawing; the panel shifts them back before
        # printing, and so does this.
        lon = d["lo"][i] - 360 * 60 if d["lo"][i] > 180 * 60 else d["lo"][i]
        shown = render(d["la"][i], False) + "-" + render(lon, True)
        # The stored line is a template; expanding it is exactly what the panel does, so this
        # checks the line the reader actually sees rather than the one on disk.
        quote = d["q"][i].replace("~", shown).replace("^", str(d["p"][i]))
        m_name = NAME_RE.match(quote)
        name = fixes.get(i, m_name.group(3).title()[:26] if m_name else "")

        m = DMS.findall(quote)
        if not m:
            if KNOWN_GLYPH_ROWS.get(name) == quote:
                exempt_seen.add(name)
                continue
            problems.append(f"{name!r}: no DDMM-DDDMM pair in its quote {quote!r}")
            continue

        lat_s, lon_s, west = m[-1]
        printed = lat_s + "-" + lon_s + west
        if printed != shown:
            if KNOWN_GLYPH_ROWS.get(name) == quote:
                exempt_seen.add(name)
                continue
            problems.append(
                f"{name!r}: the panel would print {shown!r} beside a line reading {printed!r}"
            )

    missing = set(KNOWN_GLYPH_ROWS) - exempt_seen
    if missing:
        # The exemptions are load-bearing, so they must not outlive the rows they excuse.
        problems.append(
            "these rows no longer disagree, so remove them from KNOWN_GLYPH_ROWS: "
            + ", ".join(sorted(missing))
        )
    return check_links(d) + problems


if __name__ == "__main__":  # pragma: no cover
    import pathlib
    import sys

    text = (pathlib.Path(__file__).resolve().parent / "sac1956.json").read_text(encoding="utf-8")
    found = check(text)
    for p in found:
        print(p)
    d = json.loads(text)
    links = check_links(d)
    n = len(d["la"])
    print(f"{n - (len(found) - len(links))} of {n} rows print a coordinate matching their own quote")
    print(f"{len(d['src'])} scan links: " + (f"{len(links)} problems" if links else "PDFs, a page for every row"))
    sys.exit(1 if found else 0)

"""Assemble the personal site from parts -> index.html.

parts:  base.css (theme + layout), body_top.html, work.html, rest.html, extra.css
slots:  slots.json  {"HERO_RESEARCH": "...", ...}  -- text filled from the repo research
demos:  ../demo_contagion.{html,js} + ../gsib_demo.json, ../activity.{html,js} + ../activity.json,
        ../demo_forensics.{html,js} (optional)
"""
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PAD = HERE
rd = lambda p: p.read_text(encoding="utf-8")

css = rd(HERE / "base.css").replace("</style>", rd(HERE / "extra.css") + "\n</style>")
body = rd(HERE / "body_top.html") + "\n" + rd(HERE / "work.html") + "\n" + rd(HERE / "rest.html")
slots = json.loads(rd(HERE / "slots.json"))
slots["RESEARCH_KNOWN"] = rd(HERE / "research_known.html")
slots["WRITING"] = rd(HERE / "writing.html")
slots.setdefault("RESEARCH_NEW", "")
for k, f in (("RESEARCH_NEW", "research_new.html"), ("SYSTEMS_NEW", "systems_new.html")):
    if (HERE / f).exists():
        slots[k] = rd(HERE / f)
slots["CONTAGION_HTML"] = rd(PAD / "demo_contagion.html")
slots["ACTIVITY_HTML"] = rd(PAD / "activity.html")
forensics = (PAD / "demo_forensics.html").exists()
slots["FORENSICS_SLOT"] = rd(PAD / "demo_forensics.html") if forensics else ""
for k in ("IMG_OGE", "IMG_VIXIA"):
    slots[k] = (HERE / (k.lower() + ".txt").replace("img_", "img_")).read_text(encoding="ascii") \
        if (HERE / (k.lower() + ".txt")).exists() else (HERE / ("img_" + k[4:].lower() + ".txt")).read_text(encoding="ascii")

for k, v in slots.items():
    body = body.replace("{{" + k + "}}", v)
left = re.findall(r"\{\{[A-Z_]+\}\}", body)
if left:
    sys.exit(f"unfilled slots: {sorted(set(left))}")

scripts = [rd(PAD / "demo_contagion.js").replace("__GSIB_DATA__", rd(PAD / "gsib_demo.json")),
           rd(PAD / "activity.js").replace("__ACTIVITY_DATA__", rd(PAD / "activity.json"))]
if forensics:
    js = rd(PAD / "demo_forensics.js")
    if (PAD / "forensics.json").exists():
        js = js.replace("__FORENSICS_DATA__", rd(PAD / "forensics.json"))
    scripts.append(js)

head = ('<title>Xocas Álvarez</title>\n'
        '<meta name="description" content="Xocas Álvarez, AI and data systems engineer: production data platforms, '
        'OSINT, and research code on financial contagion, election forensics and disclosure risk.">\n')
js = "".join(f"<script>\n{s}\n</script>\n" for s in scripts)
standalone = "--standalone" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
if standalone:  # the deployed file: a real document, so phones get the mobile layout and no quirks mode
    page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + css + "\n</head>\n<body>\n" + body + "\n" + js + "</body>\n</html>\n")
else:  # the artifact preview: the host adds the document skeleton
    page = head + css + "\n\n" + body + "\n" + js
out = pathlib.Path(args[0]) if args else HERE / "index.html"
out.write_text(page, encoding="utf-8", newline="\n")
print(f"wrote {out} ({len(page) / 1024:.0f} KB)")

"""Build the site: four pages from src/pages/, styled by one theme from src/themes/.

    python src/build.py OUTDIR                  # the site, in the default theme
    python src/build.py OUTDIR --theme mono     # the site, in another theme
    python src/build.py OUTDIR --previews       # also OUTDIR/preview/<theme>/ for every theme

The demos (src/demo_*.{html,js}) and the commit heatmap (src/activity.*) go on the Other page.
"""
import pathlib
import re
import shutil
import sys

SRC = pathlib.Path(__file__).resolve().parent
REPO = SRC.parent
THEMES = ["plain", "folders", "yearbook", "typewriter"]
DEFAULT_THEME = "plain"

PAGES = [  # file, nav label, <title>
    ("index", None, "Xocas Álvarez"),
    ("cv", "CV", "CV · Xocas Álvarez"),
    ("projects", "Projects", "Projects · Xocas Álvarez"),
    ("other", "Other", "Other · Xocas Álvarez"),
]
CONTACT = [
    ("mailto:xocas04@gmail.com", "Email"),
    ("https://github.com/Xocas12", "GitHub"),
    ("https://github.com/xocas123", "GitHub (older)"),
    ("https://www.linkedin.com/in/xocas-%C3%A1lvarez-21a250225/", "LinkedIn"),
]
DESCRIPTION = "Xocas Álvarez, data and ML engineer in New York."

CUR = ' aria-current="page"'
rd = lambda p: p.read_text(encoding="utf-8")


def sections(html):
    """Wrap each <h2> and what follows it in <section><h2/><div class="sec-body"/></section>."""
    parts = re.split(r"(<h2>.*?</h2>)", html)
    out = [parts[0]]
    for i in range(1, len(parts), 2):
        out.append(f'<section>{parts[i]}<div class="sec-body">{parts[i + 1]}</div></section>')
    return "".join(out)


def page(name, title, theme, root, preview):
    body = rd(SRC / "pages" / ("home.html" if name == "index" else name + ".html"))
    scripts = ""
    if name == "other":
        body = (body.replace("{{CONTAGION}}", rd(SRC / "demo_contagion.html"))
                    .replace("{{FORENSICS}}", rd(SRC / "demo_forensics.html"))
                    .replace("{{ACTIVITY}}", rd(SRC / "activity.html")))
        js = [rd(SRC / "demo_contagion.js").replace("__GSIB_DATA__", rd(SRC / "gsib_demo.json")),
              rd(SRC / "demo_forensics.js").replace("__FORENSICS_DATA__", rd(SRC / "forensics.json")),
              rd(SRC / "activity.js").replace("__ACTIVITY_DATA__", rd(SRC / "activity.json"))]
        scripts = "".join(f"<script>\n{s}\n</script>\n" for s in js)
    body = sections(body.replace("{{ROOT}}", root))
    left = re.findall(r"\{\{[A-Z_]+\}\}", body)
    if left:
        sys.exit(f"{name}: unfilled slots {sorted(set(left))}")

    nav = "".join(
        f'<a href="{f}.html"{CUR if f == name else ""}>{label}</a>'
        for f, label, _ in PAGES if label)
    header = "" if name == "index" else (
        f'<header class="site"><a class="name" href="index.html">Xocas Álvarez</a><nav>{nav}</nav></header>\n'
        f'<h1 class="page-title">{title.split(" · ")[0]}</h1>\n')
    footer = "".join(f'<a href="{href}">{label}</a>' for href, label in CONTACT)
    bar = ""
    if preview:
        links = " ".join(f'<a href="../{t}/{name}.html"{CUR if t == theme else ""}>{t}</a>'
                         for t in THEMES)
        bar = f'<div class="preview-bar">Style preview: {links}</div>\n'
    css = rd(SRC / "themes" / "_common.css") + "\n" + rd(SRC / "themes" / f"{theme}.css")
    fonts = re.search(r"/\* fonts: (\S+) \*/", css)
    head = ['<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
            f"<title>{title}</title>",
            f'<meta name="description" content="{DESCRIPTION}">']
    if preview:
        head.append('<meta name="robots" content="noindex">')
    if fonts:
        head += ['<link rel="preconnect" href="https://fonts.googleapis.com">',
                 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
                 f'<link rel="stylesheet" href="{fonts.group(1)}">']
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n" + "\n".join(head) + f"\n<style>\n{css}\n</style>\n</head>\n"
            f'<body class="p-{name}">\n{bar}<div class="wrap">\n{header}<main>\n{body}\n</main>\n'
            f'<footer>{footer}</footer>\n</div>\n{scripts}</body>\n</html>\n')


def build(out, theme, root="", preview=False):
    out.mkdir(parents=True, exist_ok=True)
    for name, _, title in PAGES:
        (out / f"{name}.html").write_text(page(name, title, theme, root, preview), encoding="utf-8", newline="\n")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    out = pathlib.Path(args[0])
    theme = sys.argv[sys.argv.index("--theme") + 1] if "--theme" in sys.argv else DEFAULT_THEME
    if theme not in THEMES:
        sys.exit(f"unknown theme {theme!r}; pick one of {THEMES}")
    build(out, theme)
    shutil.copytree(REPO / "papers", out / "papers", dirs_exist_ok=True)
    if "--previews" in sys.argv:
        for t in THEMES:
            build(out / "preview" / t, t, root="../../", preview=True)
    print(f"built {out} ({theme}{', with previews' if '--previews' in sys.argv else ''})")


if __name__ == "__main__":
    main()

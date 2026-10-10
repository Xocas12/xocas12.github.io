# xocas123.github.io

Personal site: five pages (home, CV, projects, writing, other) built from `src/` and published to
GitHub Pages at https://xocas12.github.io/xocas123.github.io/.

Every push to `main` runs `.github/workflows/pages.yml`, which builds the site and deploys it.

## Editing

| Where | What |
|---|---|
| `src/pages/` | page content: `home.html`, `cv.html`, `projects.html`, `writing.html`, `other.html` |
| `src/themes/` | `_common.css` (layout) and one file per style: `quiet`, `plain` |
| `src/demo_*`, `gsib_demo.json`, `forensics.json` | the two demos on the Other page |
| `src/activity.*`, `src/commits/` | the commit heatmap (`python src/make_activity.py` after updating the CSVs) |
| `papers/` | the PDFs linked from the Writing page |

The style is `DEFAULT_THEME` in `src/build.py`. Every style is also published under
`preview/<style>/` for comparison.

## Local build

```bash
python3 src/build.py _site --previews
python3 -m http.server -d _site 8000
```

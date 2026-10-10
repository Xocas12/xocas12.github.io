# xocas123.github.io

One static page (`index.html`) plus the PDFs in `papers/`, published to GitHub Pages
(and still served by `serve` on Railway).
`index.html` is built from `src/`; edit there, not in the built file.
Live at https://xocas12.github.io/xocas123.github.io/ (and, until it is shut down, https://personal-site-production-d4ca.up.railway.app)

## Deploying

### GitHub Pages

`.github/workflows/pages.yml` rebuilds `index.html` from `src/` on every push to `main`
and publishes it with `papers/` to GitHub Pages. Nothing else ships: `src/`, the Railway
files and the `tone_*.png` screenshots stay out of the published site.

The repo is public, `Xocas12/xocas123.github.io`, so the site is served at
`https://xocas12.github.io/xocas123.github.io/`. Renaming the repo to `xocas12.github.io`
would serve it at `https://xocas12.github.io/` instead; every link in the page is relative,
so either works. Pages is enabled once, under Settings -> Pages ->
Build and deployment -> Source: **GitHub Actions**. For a custom domain, set it there too.

This repo is a public copy of the private `personal-site` repo, started without its
history. Edit here from now on, or the two will drift apart.

### Railway

From the Railway CLI, and only from the Railway CLI:

```bash
railway link --project personal-site --service personal-site --environment production
railway up
```

`railway up` uploads this directory. `.railwayignore` keeps `node_modules` and
`.git` out of the upload; without it the thesis PDF is the small part of what
gets sent.

## Why pushing to GitHub does not deploy

It isn't wired to GitHub, and it can't be from here. The Railway service has no
source repo, so `git push` deploys nothing — the only thing that ships is
`railway up`.

Connecting it is not a CLI operation. `railway add --repo` creates a *new*
service rather than re-pointing this one, and calling `serviceConnect` on the
existing service returns:

```
User does not have access to the repo
```

Three accounts are involved and they are not the same one:

| | |
|---|---|
| this repo | `xocas123` |
| everything else on GitHub | `Xocas12` |
| Railway | `xocas04@gmail.com` |

Railway's GitHub App has not been granted access to the `xocas123` account, and
granting it is a consent screen on GitHub's side — no token can do it. So either
keep deploying with `railway up`, or move the repo under the account Railway can
already see and connect it there.

## Local check before shipping

```bash
npx serve -s . -l 3180
```

Worth doing at 390px as well as desktop: the nav and the footer links are flex
rows, and both overflowed a phone before they were set to wrap.

## Editing the page

`index.html` is generated. The parts live in `src/`:

| File | What it holds |
|---|---|
| `body_top.html`, `work.html`, `rest.html` | hero, Systems, and everything from Research down |
| `research_known.html`, `research_new.html`, `systems_new.html`, `writing.html` | the cards and papers slotted into those sections |
| `slots.json` | short text slots (hero line, Vixía update, statistics skills) |
| `base.css`, `extra.css` | theme tokens and layout |
| `demo_contagion.*`, `gsib_demo.json` | the bank-failure demo and its data |
| `demo_forensics.*`, `forensics.json` | the turnout demo and its histograms |
| `activity.*`, `activity.json`, `commits/` | the commit heatmap and the weekly counts behind it |
| `img_*.txt` | the three screenshots, as data URIs |

```bash
cd src && python make_activity.py          # only after updating commits/*.csv
python src/build.py index.html --standalone
```

`--standalone` writes the doctype, charset and viewport tags. Without the viewport
tag a phone renders the desktop layout zoomed out, which is what the page did before
October 2026. `src/` is in `.railwayignore`, so it is not uploaded.

Where the demo data comes from:

- `gsib_demo.json`: the 29 FSB 2025 G-SIBs. CET1 at end-2024 comes from contagion-lab's
  `data/reference/gsib_capital_2024.csv` (non-EU, converted at BIS 2024Q4 rates) and the
  EBA 2025 transparency exercise (EU, December 2024). Interbank assets and liabilities
  come from the BCBS G-SIB assessment sample (end-2024). The demo's maximum-entropy
  reconstruction and DebtRank are a straight port of contagion-lab's engines. They were
  checked against the Python results at four exposure shares.
- `forensics.json`: real 2011 and 2018 precinct turnout histograms. They are rebuilt
  from Kobak's precinct files with forensic-elections' own loader and test (observed
  11,640 and 11,907, z 2.29 and 12.15, identical to its results table).

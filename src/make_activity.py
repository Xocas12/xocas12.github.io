"""Weekly commit CSVs (repo,YYYY-Www,count) -> activity.json for the heatmap."""
import csv, datetime, json, glob, collections
AREAS = [
    ("Land & geodata", ["subdue-land", "terrafit", "galicia-eucalyptus", "Eucalyptus-Tree-Risk-Galicia"]),
    ("OSINT", ["vixia", "vixia-devbot", "vixia-observer", "vixia-scout"]),
    ("Research", ["contagion-lab", "tenk-risk-text", "forensics-core", "forensic-elections", "forensic-economy", "psephos",
                  "gosplan-env", "agenda_setting", "Arms-Control-and-Ethics-Project", "UN-Corpus-Cleaning", "Nuclear-Probabilities"]),
    ("Agents & simulation", ["oge", "dare-api", "hoi4-agent-harness", "battlelab"]),
    ("Products & tools", ["modmatch", "shipping-platform", "job-seeking-repo", "product-idea-coach", "personal-site", "DevSecOps-clinic-deployment"]),
]
counts = collections.defaultdict(lambda: collections.Counter())
for f in glob.glob("commits/activity_*.csv"):
    for row in csv.reader(open(f, encoding="utf-8")):
        if len(row) != 3 or not row[1].startswith("20"): continue
        repo, wk, n = row[0].strip(), row[1].strip(), int(row[2])
        counts[repo][wk] = max(counts[repo][wk], n)  # same repo from two sources: keep one value, not a sum
start = datetime.date.fromisocalendar(2025, 36, 1)   # week of 1 Sep 2025
end = datetime.date.fromisocalendar(2026, 40, 1)     # last complete week (28 Sep - 4 Oct 2026)
weeks, d = [], start
while d <= end:
    y, w, _ = d.isocalendar()
    weeks.append({"key": f"{y}-W{w:02d}", "label": d.strftime("%d %b %Y").lstrip("0"), "month": d.strftime("%b") if d.month != 1 else d.strftime("%b %Y")})
    d += datetime.timedelta(days=7)
keys = [w["key"] for w in weeks]
known = {r for _, rs in AREAS for r in rs}
missing = sorted(set(counts) - known)
if missing: raise SystemExit(f"repos without an area: {missing}")
rows = []
for area, repos in AREAS:
    rs = [{"name": r, "counts": [counts[r].get(k, 0) for k in keys]} for r in repos if r in counts]
    rs = [r for r in rs if sum(r["counts"])]
    if rs: rows.append({"name": area, "repos": rs})
json.dump({"weeks": weeks, "rows": rows}, open("activity.json", "w", encoding="utf-8"), separators=(",", ":"))
print(len(weeks), "weeks;", {r["name"]: sum(sum(p["counts"]) for p in r["repos"]) for r in rows})

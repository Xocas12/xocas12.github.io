(function () {
  const D = __ACTIVITY_DATA__; // { weeks: [{key, label}], rows: [{name, repos: [{name, counts: []}]}] }
  const grid = document.getElementById("act-grid"), tip = document.getElementById("cx-tip");
  const W = D.weeks.length;
  grid.style.gridTemplateColumns = "max-content repeat(" + W + ", minmax(7px, 1fr))";
  const BINS = [[0, 0], [1, 3], [4, 9], [10, 24], [25, Infinity]];
  const MIX = [0, 28, 48, 70, 92];
  const colorFor = v => { const b = BINS.findIndex(([lo, hi]) => v >= lo && v <= hi); return b <= 0 ? "var(--surface-2)" : "color-mix(in oklab, var(--accent) " + MIX[b] + "%, var(--surface-2))"; };
  let total = 0;
  const totals = D.rows.map(r => { const t = new Array(W).fill(0); r.repos.forEach(p => p.counts.forEach((c, k) => { t[k] += c; })); return t; });
  D.rows.forEach((r, ri) => {
    const nm = document.createElement("div"); nm.className = "act-row-name"; nm.textContent = r.name; grid.appendChild(nm);
    totals[ri].forEach((v, k) => {
      total += v;
      const c = document.createElement("div"); c.className = "act-cell"; c.style.background = colorFor(v); c.tabIndex = -1;
      const repos = r.repos.map(p => [p.name, p.counts[k]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      const show = e => {
        tip.innerHTML = "<b></b><br><span class='m'></span>";
        tip.querySelector("b").textContent = D.weeks[k].label + " · " + r.name;
        tip.querySelector(".m").textContent = v === 0 ? "no commits" : v + " commit" + (v === 1 ? "" : "s") + ": " + repos.map(x => x[0] + " " + x[1]).join(", ");
        tip.hidden = false;
        const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - w - 8)) + "px"; tip.style.top = (e.clientY + 14) + "px";
      };
      c.addEventListener("mouseenter", show); c.addEventListener("mousemove", show);
      c.addEventListener("mouseleave", () => { tip.hidden = true; });
      grid.appendChild(c);
    });
  });
  // month axis: label the first week of each month
  const pad = document.createElement("div"); grid.appendChild(pad);
  let lastMonth = "";
  D.weeks.forEach(w => {
    const a = document.createElement("div"); a.className = "act-axis";
    const m = w.month; if (m !== lastMonth) { a.textContent = m; lastMonth = m; }
    grid.appendChild(a);
  });
  document.getElementById("act-total").innerHTML = "<b></b>commits since " + D.weeks[0].label;
  document.getElementById("act-total").querySelector("b").textContent = total.toLocaleString("en-US");
  const lg = document.getElementById("act-legend");
  lg.innerHTML = "<span>Commits per week</span>";
  BINS.forEach(([lo, hi]) => {
    const s = document.createElement("span"); s.className = "sw";
    s.innerHTML = "<i></i>"; s.querySelector("i").style.background = colorFor(lo);
    s.appendChild(document.createTextNode(lo === 0 ? "0" : hi === Infinity ? lo + "+" : lo + "–" + hi));
    lg.appendChild(s);
  });
  const tb = document.getElementById("act-table");
  const repoTotals = [];
  D.rows.forEach(r => r.repos.forEach(p => repoTotals.push([r.name, p.name, p.counts.reduce((a, b) => a + b, 0)])));
  tb.innerHTML = "<tr><th>Area</th><th>Repository</th><th>Commits</th></tr>";
  repoTotals.sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]).forEach(([area, repo, n]) => {
    const tr = document.createElement("tr");
    [area, repo, String(n)].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
    tb.appendChild(tr);
  });
})();

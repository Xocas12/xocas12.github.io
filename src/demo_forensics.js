(function () {
  const REAL = __FORENSICS_DATA__; // {"2011": {obs[1001], exp[1001], n, observed, expected, sd, z}, "2018": {...}}
  const $ = id => document.getElementById(id);
  const svg = $("fz-chart"), tip = $("cx-tip"), NS = "http://www.w3.org/2000/svg";
  const LO = 300, HI = 1000;            // bins 30.0 .. 99.9 (index = tenths of a point)
  // Laid out in CSS pixels at the width the chart is drawn (chart_px.js), so FS is the text size
  // on screen. draw() sets W, H, the left margin and the bin width.
  const FS = 11, PR = 10, PT = 22, PB = 30;
  let W = 900, H = 280, PL = 46, bw = 1;
  const fmt = v => Math.round(v).toLocaleString("en-US");

  // ---- simulation: psephos's honest generator, plus officials who report a round target ----
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function binom(r, n, p) { // normal approximation; every simulated n is at least 300
    const m = n * p, s = Math.sqrt(n * p * (1 - p));
    return Math.min(n, Math.max(0, Math.round(m + s * normal(r))));
  }
  const NSIM = 20000, base = rng(20260926), size = [], turnout = [];
  while (size.length < NSIM) {
    const n = Math.round(Math.exp(6.8 + 0.6 * normal(base)));
    if (n < 300 || n > 3000) continue;
    size.push(n); turnout.push(Math.min(0.98, Math.max(0.05, 0.55 + 0.10 * normal(base))));
  }
  const honest = size.map((n, i) => binom(base, n, turnout[i]));
  const order = size.map((_, i) => i).sort((a, b) => ((a * 2654435761) >>> 0) % 9973 - ((b * 2654435761) >>> 0) % 9973);
  const near = p => Math.abs(p - Math.round(p)) <= 0.05 + 1e-9;
  const binOf = p => Math.floor(p * 10 + 0.5);

  function simulate(cheatShare) {
    const k = Math.round(cheatShare * NSIM), votes = honest.slice();
    for (let j = 0; j < k; j++) {
      const i = order[j];
      const target = Math.min(100, Math.ceil((100 * honest[i] / size[i] + 0.01) / 5) * 5); // next multiple of 5 above
      votes[i] = Math.round(size[i] * target / 100);
    }
    const obs = new Array(1001).fill(0), exp = new Array(1001).fill(0);
    let hits = 0;
    const pct = votes.map((v, i) => 100 * v / size[i]);
    pct.forEach(p => { obs[binOf(p)]++; if (near(p)) hits++; });
    const R = 40, r = rng(7), draws = [];
    for (let d = 0; d < R; d++) {
      let h = 0;
      for (let i = 0; i < NSIM; i++) { const q = 100 * binom(r, size[i], pct[i] / 100) / size[i]; exp[binOf(q)] += 1 / R; if (near(q)) h++; }
      draws.push(h);
    }
    const mean = draws.reduce((a, b) => a + b, 0) / R;
    const sd = Math.sqrt(draws.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (R - 1));
    return { obs: obs, exp: exp, n: NSIM, observed: hits, expected: mean, sd: sd, z: (hits - mean) / sd, cheat: k };
  }

  // ---- drawing ----
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  let cur = null, yMax = 1;
  const x = b => PL + (b - LO) * bw, y = v => PT + (H - PT - PB) * (1 - Math.min(v, yMax) / yMax);
  function draw(d) {
    cur = d;
    // A phone-width chart keeps more height than its share of the width, so the spikes have room.
    const box = ChartPx.fit(svg, w => Math.max(190, w * 0.31));
    W = box.w; H = box.h;
    while (svg.lastChild && svg.lastChild.tagName !== "title") svg.removeChild(svg.lastChild);
    const vals = d.obs.slice(LO, HI);
    const peak = Math.max.apply(null, vals);
    yMax = Math.ceil(peak / 100) * 100 || 100;
    PL = Math.ceil(ChartPx.textW(fmt(yMax), FS)) + 12;
    bw = (W - PL - PR) / (HI - LO);
    const ax = el("g", { class: "axis" }, svg);
    for (let t = 0; t <= yMax; t += yMax / 4) {
      el("line", { x1: PL, x2: W - PR, y1: y(t), y2: y(t), class: "grid" }, ax);
      el("text", { x: PL - 8, y: y(t) + 4, "text-anchor": "end" }, ax).textContent = fmt(t);
    }
    // Every ten points where the labels fit, every twenty where they would touch. The tightest
    // gap is the last: half of "90%", then all of "100%", which ends at the axis.
    const step = (W - PL - PR) / 7 < ChartPx.textW("90%", FS) / 2 + ChartPx.textW("100%", FS) + 6 ? 20 : 10;
    for (let p = 30; p <= 100; p += step) {
      const t = el("text", { x: x(p * 10) , y: H - 10, "text-anchor": p === 100 ? "end" : "middle" }, ax);
      t.textContent = p + "%";
    }
    let pa = "", pi = "";
    for (let b = LO; b < HI; b++) {
      const v = d.obs[b]; if (!v) continue;
      const seg = "M" + x(b).toFixed(2) + "," + y(v).toFixed(2) + "h" + Math.max(0.8, bw - 0.25).toFixed(2) + "V" + y(0).toFixed(2) + "h-" + Math.max(0.8, bw - 0.25).toFixed(2) + "Z";
      if (b % 10 === 0) pi += seg; else pa += seg;
    }
    el("path", { d: pa, class: "bars" }, svg);
    el("path", { d: pi, class: "bars-int" }, svg);
    let pe = "";
    for (let b = LO; b < HI; b++) pe += (b === LO ? "M" : "L") + (x(b) + bw / 2).toFixed(2) + "," + y(d.exp[b]).toFixed(2);
    el("path", { d: pe, class: "exp" }, svg);
    // label the three largest integer spikes above expectation
    const spikes = [];
    for (let b = LO; b < HI; b += 10) spikes.push([d.obs[b] - d.exp[b], b]);
    const labelled = spikes.sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([ex]) => ex >= 25);
    labelled.forEach(([, b]) => {
      const t = el("text", { x: x(b) + bw / 2, y: y(d.obs[b]) - 6, "text-anchor": b > 960 ? "end" : "middle", class: "peak" }, svg);
      t.textContent = (b / 10).toFixed(0) + "%";
    });
    // The same spikes as text under the chart, which reads at any width.
    $("fz-spikes").textContent = labelled.length
      ? labelled.sort((a, b) => b[1] - a[1]).map(([, b], i) =>
        (b / 10).toFixed(0) + "%: " + fmt(d.obs[b]) + (i ? " vs " : " precincts vs ") + fmt(d.exp[b]) + (i ? "" : " expected")).join("; ")
      : "No whole-percent bin is 25 or more precincts above what chance predicts.";
    const cross = el("line", { class: "cross", y1: PT, y2: H - PB, x1: -10, x2: -10 }, svg);
    const hit = el("rect", { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB, fill: "transparent" }, svg);
    hit.addEventListener("mousemove", e => {
      const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * W / r.width;
      const b = Math.max(LO, Math.min(HI - 1, Math.floor((sx - PL) / bw) + LO));
      cross.setAttribute("x1", x(b) + bw / 2); cross.setAttribute("x2", x(b) + bw / 2);
      tip.innerHTML = "<b></b><br><span class='m'></span>";
      tip.querySelector("b").textContent = "Turnout " + (b / 10).toFixed(1) + "%" + (b % 10 === 0 ? " · whole percent" : "");
      tip.querySelector(".m").textContent = fmt(cur.obs[b]) + " precincts · " + fmt(cur.exp[b]) + " expected";
      tip.hidden = false;
      const w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - w - 8)) + "px"; tip.style.top = (e.clientY + 14) + "px";
    });
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("x1", -10); cross.setAttribute("x2", -10); });

    $("fz-obs").textContent = fmt(d.observed);
    $("fz-exp").textContent = fmt(d.expected);
    $("fz-sd").textContent = "± " + fmt(d.sd) + " (one standard deviation)";
    $("fz-exc").textContent = (d.observed - d.expected >= 0 ? "+" : "") + fmt(d.observed - d.expected);
    $("fz-exc-s").textContent = "of " + fmt(d.n) + " precincts";
    $("fz-z").textContent = d.z.toFixed(1);
    const pill = $("fz-pill"), flagged = d.z >= 3;
    pill.className = "pill " + (flagged ? "flag" : "sub");
    pill.textContent = flagged ? "z ≥ 3" : "z < 3";
  }

  const NOTES = {
    "2018": "Real data: 93,601 precincts with at least 100 registered voters (4,098 smaller ones excluded), turnout as ballots in boxes over registered voters. Source: Kobak's precinct files, the same inputs as Kobak, Shpilkin & Pshenichnikov (2016). Observed, expected and z come straight from the forensic-elections results table (200 Monte Carlo draws, seed 20260926). Not shown: 1,366 precincts reported exactly 100%.",
    "2011": "Real data: 91,082 precincts with at least 100 registered voters (4,143 smaller ones excluded). The 2011 turnout signal is weaker than 2018's; the winner's vote share carries it (z = 8.4 in the results table). Not shown: 2,337 precincts reported exactly 100%.",
    "sim": "Simulated: 20,000 honest precincts from psephos's test generator (lognormal sizes of 300 to 3,000 voters, turnout around 55%). The share you set reports the next multiple of 5 above its real turnout. Expected counts come from 40 binomial redraws per precinct (normal approximation), so z moves a little with the draw."
  };
  let simCache = {};
  function show(mode) {
    ["2018", "2011", "sim"].forEach(m => $("fz-" + m).setAttribute("aria-pressed", String(m === mode)));
    $("fz-sim-ctl").hidden = mode !== "sim";
    $("fz-note").textContent = NOTES[mode];
    if (mode === "sim") {
      const s = Number($("fz-cheat").value) / 100;
      $("fz-cheat-val").textContent = $("fz-cheat").value + "% of 20,000 simulated precincts";
      const key = String(s);
      draw(simCache[key] || (simCache[key] = simulate(s)));
    } else draw(REAL[mode]);
  }
  $("fz-2018").addEventListener("click", () => show("2018"));
  $("fz-2011").addEventListener("click", () => show("2011"));
  $("fz-sim").addEventListener("click", () => show("sim"));
  $("fz-cheat").addEventListener("input", () => show("sim"));
  show("2018");
  ChartPx.watch(svg, () => { if (cur) draw(cur); });
})();

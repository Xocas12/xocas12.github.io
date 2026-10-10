(function () {
  const BANKS = __GSIB_DATA__;
  const SHORT = {
    "JPMorgan Chase": "JPM", "Bank of America": "BofA", "Citigroup": "Citi", "HSBC": "HSBC", "ICBC": "ICBC",
    "Agricultural Bank of China": "ABC", "BNP Paribas": "BNP", "Bank of China": "BOC", "Barclays": "Barclays",
    "China Construction Bank": "CCB", "Crédit Agricole": "CA", "Goldman Sachs": "GS", "Mitsubishi UFJ FG": "MUFG",
    "UBS": "UBS", "BNY Mellon": "BNY", "BPCE": "BPCE", "Bank of Communications": "BoCom", "Deutsche Bank": "DB",
    "ING": "ING", "Mizuho FG": "Mizuho", "Morgan Stanley": "MS", "Royal Bank of Canada": "RBC", "Santander": "SAN",
    "Société Générale": "SocGen", "Standard Chartered": "StanChart", "State Street": "STT",
    "Sumitomo Mitsui FG": "SMFG", "TD Bank": "TD", "Wells Fargo": "WFC"
  };
  const REGIONS = [
    { name: "AMERICAS", cc: ["US", "CA"] },
    { name: "EUROPE", cc: ["GB", "CH", "FR", "DE", "ES", "NL"] },
    { name: "ASIA", cc: ["CN", "JP"] }
  ];
  const CC_NAME = { US: "United States", CA: "Canada", GB: "United Kingdom", CH: "Switzerland", FR: "France", DE: "Germany", ES: "Spain", NL: "Netherlands", CN: "China", JP: "Japan" };

  // ---- engine: a straight port of contagion-lab (maxent RAS + differential DebtRank) ----
  function maxent(a, l, tol, maxIter) {
    tol = tol || 1e-8; maxIter = maxIter || 10000;
    const n = a.length, x = [];
    for (let i = 0; i < n; i++) { x.push(new Float64Array(n)); for (let j = 0; j < n; j++) x[i][j] = i === j ? 0 : a[i] * l[j]; }
    for (let it = 0; it < maxIter; it++) {
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += x[i][j]; const r = s > 0 ? a[i] / s : 1; for (let j = 0; j < n; j++) x[i][j] *= r; }
      const cs = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cs[j] += x[i][j];
      for (let j = 0; j < n; j++) { const r = cs[j] > 0 ? l[j] / cs[j] : 1; for (let i = 0; i < n; i++) x[i][j] *= r; }
      let worst = 0;
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += x[i][j]; worst = Math.max(worst, Math.abs(s - a[i]) / a[i]); }
      if (worst <= tol) break;
    }
    return x;
  }
  function debtrank(x, E, seed) {
    const n = E.length;
    let hPrev = new Float64Array(n), h = new Float64Array(n);
    h[seed] = 1;
    const history = [Float64Array.from(h)];
    let rounds = 0;
    while (rounds < 10000) {
      const hNew = new Float64Array(n);
      let moved = 0;
      for (let i = 0; i < n; i++) {
        let inc = 0;
        for (let j = 0; j < n; j++) inc += (x[i][j] / E[i]) * (h[j] - hPrev[j]);
        hNew[i] = Math.min(1, h[i] + inc);
        moved = Math.max(moved, hNew[i] - h[i]);
      }
      hNew[seed] = 1;
      if (moved <= 1e-9) break;
      rounds++;
      hPrev = h; h = hNew;
      history.push(Float64Array.from(h));
    }
    return { h: h, rounds: rounds, history: history };
  }
  function spectralRadius(x, E) {
    const n = E.length; let v = new Float64Array(n).fill(1 / n), lam = 0;
    for (let k = 0; k < 500; k++) {
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i] += (x[i][j] / E[i]) * v[j];
      let s = 0; for (let i = 0; i < n; i++) s += w[i];
      for (let i = 0; i < n; i++) w[i] /= s;
      const done = Math.abs(s - lam) < 1e-12; lam = s; v = w;
      if (done) break;
    }
    return lam;
  }

  // ---- data ----
  const n = BANKS.length;
  const E = BANKS.map(b => b.cet1);
  const A = BANKS.map(b => b.ia);
  const sumA = A.reduce((s, v) => s + v, 0), sumL = BANKS.reduce((s, b) => s + b.il, 0);
  const L = BANKS.map(b => b.il * sumA / sumL); // totals must match for the reconstruction
  const totalE = E.reduce((s, v) => s + v, 0);

  const $ = id => document.getElementById(id);
  const svg = $("cx-ring"), share = $("cx-share"), seedSel = $("cx-seed"), tip = $("cx-tip");
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- ring layout: regions in order, one empty slot between regions ----
  const order = [];
  REGIONS.forEach((r, ri) => {
    const members = BANKS.map((b, i) => i).filter(i => r.cc.includes(BANKS[i].cc))
      .sort((p, q) => r.cc.indexOf(BANKS[p].cc) - r.cc.indexOf(BANKS[q].cc) || E[q] - E[p]);
    members.forEach(i => order.push(i));
    if (ri < REGIONS.length - 1) order.push(-1);
  });
  order.push(-1);
  const C = 280, R = 196, maxE = Math.max.apply(null, E);
  const pos = new Array(n), regionAngles = [];
  order.forEach((idx, k) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * k) / order.length;
    if (idx >= 0) pos[idx] = { x: C + R * Math.cos(ang), y: C + R * Math.sin(ang), ang: ang, r: 5 + 14 * Math.sqrt(E[idx] / maxE) };
  });
  REGIONS.forEach(r => {
    const idx = order.filter(i => i >= 0 && r.cc.includes(BANKS[i].cc));
    const a = idx.map(i => pos[i].ang);
    regionAngles.push({ name: r.name, ang: (Math.min.apply(null, a) + Math.max.apply(null, a)) / 2 });
  });

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const gEdges = el("g", {}, svg), gNodes = el("g", {}, svg), gLabels = el("g", {}, svg), gCenter = el("g", {}, svg);
  regionAngles.forEach(r => {
    const t = el("text", { x: C + 150 * Math.cos(r.ang), y: C + 150 * Math.sin(r.ang), "text-anchor": "middle", "dominant-baseline": "middle", class: "region halo" }, gLabels);
    t.textContent = r.name;
  });
  const centerNum = el("text", { x: C, y: C - 4, "text-anchor": "middle", class: "center-num halo" }, gCenter);
  const centerCap = el("text", { x: C, y: C + 20, "text-anchor": "middle", class: "center-cap halo" }, gCenter);
  const nodes = [], labels = [];
  BANKS.forEach((b, i) => {
    const p = pos[i];
    const c = el("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: p.r.toFixed(1), class: "node", tabindex: "0", role: "button", "aria-label": b.name }, gNodes);
    c.addEventListener("click", () => { seedSel.value = String(i); run(true); });
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seedSel.value = String(i); run(true); } });
    c.addEventListener("mouseenter", e => showTip(i, e));
    c.addEventListener("mousemove", e => moveTip(e));
    c.addEventListener("mouseleave", hideTip);
    c.addEventListener("focus", () => { const r = c.getBoundingClientRect(); showTip(i, { clientX: r.right, clientY: r.top }); });
    c.addEventListener("blur", hideTip);
    nodes.push(c);
    const lr = R + p.r + 10, cos = Math.cos(p.ang), sin = Math.sin(p.ang);
    const t = el("text", { x: (C + lr * cos).toFixed(1), y: (C + lr * sin).toFixed(1), "dominant-baseline": "middle", "text-anchor": cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle" }, gLabels);
    t.textContent = SHORT[b.name] || b.name;
    labels.push(t);
  });

  BANKS.map((b, i) => [b.name, i]).sort((p, q) => p[0].localeCompare(q[0])).forEach(([name, i]) => {
    const o = document.createElement("option"); o.value = String(i); o.textContent = name; seedSel.appendChild(o);
  });
  seedSel.value = "0";

  // ---- state + render ----
  let X = null, cur = null, scores = null, timer = null, shownH = null;
  const eur = v => v >= 1e6 ? "€" + (v / 1e6).toFixed(2) + " tn" : "€" + Math.round(v / 1000) + " bn";
  const pct = v => (v * 100 >= 10 || v === 0 ? Math.round(v * 100) : (v * 100).toFixed(1)) + "%";

  function fillFor(h) {
    if (h >= 1 - 1e-9) return "var(--crit)";
    if (h <= 1e-4) return "var(--surface-2)";
    return "color-mix(in oklab, var(--accent) " + Math.round(18 + 72 * h) + "%, var(--surface-2))";
  }
  function drawState(h, seed) {
    shownH = h;
    nodes.forEach((c, i) => {
      c.style.fill = fillFor(h[i]);
      c.classList.toggle("seed", i === seed);
      labels[i].classList.toggle("hit", h[i] >= 0.05 || i === seed);
    });
    while (gEdges.firstChild) gEdges.removeChild(gEdges.firstChild);
    const flows = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && h[j] > 0) flows.push([X[i][j] * h[j], i, j]);
    flows.sort((p, q) => q[0] - p[0]);
    const top = flows.slice(0, 36), maxW = top.length ? top[0][0] : 1;
    top.forEach(([w, i, j]) => {
      const a = pos[j], b = pos[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const qx = C + (mx - C) * 0.35, qy = C + (my - C) * 0.35;
      el("path", { d: "M" + a.x.toFixed(1) + "," + a.y.toFixed(1) + " Q" + qx.toFixed(1) + "," + qy.toFixed(1) + " " + b.x.toFixed(1) + "," + b.y.toFixed(1),
        class: "edge", "stroke-width": (0.6 + 2.4 * w / maxW).toFixed(2), "stroke-opacity": (0.12 + 0.5 * w / maxW).toFixed(2) }, gEdges);
    });
    let others = 0, othersE = 0;
    for (let i = 0; i < n; i++) if (i !== seed) { others += h[i] * E[i]; othersE += E[i]; }
    centerNum.textContent = eur(others);
    centerCap.textContent = "LOST BY OTHER BANKS";
  }
  function bars(ul, items) {
    ul.innerHTML = "";
    items.forEach(it => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="nm"></span><span class="track"><span class="fill"></span></span><span class="pct"></span>';
      li.querySelector(".nm").textContent = it.name;
      const f = li.querySelector(".fill"); f.style.width = Math.max(0.5, it.v * 100) + "%"; if (it.dead) f.classList.add("dead");
      li.querySelector(".pct").textContent = it.label;
      ul.appendChild(li);
    });
  }
  function readout(seed) {
    const h = cur.h;
    let others = 0, othersE = 0, defs = 0;
    for (let i = 0; i < n; i++) if (i !== seed) { others += h[i] * E[i]; othersE += E[i]; if (h[i] >= 1 - 1e-9) defs++; }
    $("cx-loss").textContent = pct(others / othersE);
    $("cx-loss-s").textContent = eur(others) + " of " + eur(othersE) + " CET1 at the other 28 banks";
    $("cx-def").textContent = String(defs);
    $("cx-def-s").textContent = defs === 1 ? "besides " + SHORT[BANKS[seed].name] : "besides " + SHORT[BANKS[seed].name] + " itself";
    $("cx-rounds").textContent = String(cur.rounds);
    const hit = BANKS.map((b, i) => ({ name: b.name, v: h[i], i: i })).filter(o => o.i !== seed).sort((p, q) => q.v - p.v).slice(0, 6)
      .map(o => ({ name: o.name, v: o.v, dead: o.v >= 1 - 1e-9, label: o.v >= 1 - 1e-9 ? "all" : pct(o.v) }));
    bars($("cx-hit"), hit);
  }
  function rebuild() {
    const f = Number(share.value) / 100;
    $("cx-share-val").textContent = share.value + "% of each bank's interbank assets";
    X = maxent(A.map(v => v * f), L.map(v => v * f));
    const rho = spectralRadius(X, E);
    const sub = rho < 1;
    $("cx-rho").innerHTML = 'Spectral radius of exposures over capital <b class="val"></b> <span class="pill"></span>';
    $("cx-rho").querySelector("b").textContent = rho.toFixed(2);
    const pill = $("cx-rho").querySelector(".pill");
    pill.className = "pill " + (sub ? "sub" : "super");
    pill.textContent = sub ? "below 1: distress fades out" : "above 1: distress can amplify";
    scores = E.map((_, i) => { const r = debtrank(X, E, i); let s = 0; for (let j = 0; j < n; j++) if (j !== i) s += r.h[j] * E[j]; return s / totalE; });
    const maxS = Math.max.apply(null, scores) || 1;
    bars($("cx-rank"), scores.map((v, i) => ({ name: BANKS[i].name, v: v, i: i })).sort((p, q) => q.v - p.v).slice(0, 5)
      .map(o => ({ name: o.name, v: o.v / maxS, dead: false, label: pct(o.v) })));
  }
  function run(animate) {
    if (timer) { clearInterval(timer); timer = null; }
    const seed = Number(seedSel.value);
    cur = debtrank(X, E, seed);
    readout(seed);
    if (!animate || reduceMotion || cur.history.length < 2) { drawState(cur.h, seed); return; }
    let t = 0;
    drawState(cur.history[0], seed);
    const step = Math.max(40, Math.min(160, 2400 / cur.history.length));
    timer = setInterval(() => {
      t++;
      if (t >= cur.history.length) { clearInterval(timer); timer = null; drawState(cur.h, seed); return; }
      drawState(cur.history[t], seed);
    }, step);
  }

  function showTip(i, e) {
    const b = BANKS[i], h = shownH ? shownH[i] : 0;
    tip.innerHTML = "<b></b><br><span class='m'></span><br><span class='m'></span>";
    tip.querySelector("b").textContent = b.name;
    const m = tip.querySelectorAll(".m");
    m[0].textContent = CC_NAME[b.cc] + " · G-SIB bucket " + b.bucket + " · CET1 " + eur(b.cet1);
    m[1].textContent = "Interbank assets " + eur(b.ia) + " · capital lost " + (h >= 1 - 1e-9 ? "all" : pct(h));
    tip.hidden = false; moveTip(e);
  }
  function moveTip(e) {
    const w = tip.offsetWidth, x = Math.min(e.clientX + 14, window.innerWidth - w - 8);
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = (e.clientY + 14) + "px";
  }
  function hideTip() { tip.hidden = true; }

  share.addEventListener("input", () => { rebuild(); run(false); });
  seedSel.addEventListener("change", () => run(true));
  $("cx-replay").addEventListener("click", () => run(true));
  rebuild();
  run(false);
})();

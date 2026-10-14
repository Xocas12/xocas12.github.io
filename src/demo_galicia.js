/* Galicia at 1 km: where eucalyptus grows against where it burned.
 *
 * Data: the Galicia payload, substituted at build time: {ny, nx, n, mask (RLE from a False run), euc, nat (base64, 4 bits a
 * cell over the masked cells in raster order), burn {i: delta indices of non-zero cells, v: 4-bit
 * values}}. Every layer has a value on every masked cell: make_galicia.py refuses to write a
 * panel whose land mask differs from the eucalyptus one, and the build checks the payload.
 *
 * The grid is decoded from the figure the repository commits, not from a table, because the
 * repository commits no table. The decode was checked against the report's own hectares before
 * it was packed; the note under the chart says so.
 */
(function () {
  "use strict";
  var D = __GALICIA_DATA__;
  var cv = document.getElementById("gl-canvas");
  if (!cv || !D || !D.mask) return;

  var NY = D.ny;
  var NX = D.nx;
  var N = D.n;

  // mask -> for each land cell, its index in the full raster
  var cellOf = new Int32Array(N);
  (function () {
    var at = 0;
    var k = 0;
    var on = false;
    for (var r = 0; r < D.mask.length; r++) {
      if (on) for (var j = 0; j < D.mask[r]; j++) cellOf[k++] = at + j;
      at += D.mask[r];
      on = !on;
    }
  })();

  function unpack(b64) {
    var bin = atob(b64);
    var out = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      var byte = bin.charCodeAt(i >> 1);
      out[i] = ((i & 1) === 0 ? byte >> 4 : byte & 15) / 15;
    }
    return out;
  }
  function undelta(list) {
    var out = new Int32Array(list.length);
    var acc = 0;
    for (var i = 0; i < list.length; i++) {
      acc += list[i];
      out[i] = acc;
    }
    return out;
  }

  var euc = unpack(D.euc);
  var nat = unpack(D.nat);
  var burn = new Float32Array(N);
  (function () {
    var idx = undelta(D.burn.i);
    for (var i = 0; i < idx.length; i++) burn[idx[i]] = D.burn.v[i] / 15;
  })();

  var mode = "both";
  var off = document.createElement("canvas");
  off.width = NX;
  off.height = NY;
  var octx = off.getContext("2d");
  var ctx = cv.getContext("2d");

  function hex(name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }
  function rgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function paint() {
    var surf = rgb(hex("--surface-2", "#ECEEE7"));
    var green = rgb(hex("--teal", "#2E6E5E"));
    // Fire uses the themes' warning colour rather than the accent: on a theme whose accent
    // is blue, a blue "burnt" layer reads as water.
    var amber = rgb(hex("--crit", "#B8322C"));
    var img = octx.createImageData(NX, NY);
    var d = img.data;
    for (var i = 0; i < N; i++) {
      var c = cellOf[i];
      var p = c * 4;
      var base = surf;
      var v = 0;
      var col = green;
      if (mode === "euc" || mode === "both") {
        v = euc[i];
      } else if (mode === "nat") {
        v = nat[i];
      } else if (mode === "brn") {
        v = Math.min(1, burn[i] * 3);
        col = amber;
      }
      // A touch of gamma so the low fractions, which are most of Galicia, stay visible.
      var t = Math.pow(v, 0.65);
      d[p] = base[0] + (col[0] - base[0]) * t;
      d[p + 1] = base[1] + (col[1] - base[1]) * t;
      d[p + 2] = base[2] + (col[2] - base[2]) * t;
      d[p + 3] = 255;
      // In the combined view a cell that burned is stamped amber over the green, so the two
      // distributions are in one frame. Comparing a picture to the memory of a picture is not
      // how you see that two things do not overlap.
      if (mode === "both" && burn[i] > 0) {
        var s = Math.min(1, 0.45 + burn[i] * 2.2);
        d[p] = d[p] + (amber[0] - d[p]) * s;
        d[p + 1] = d[p + 1] + (amber[1] - d[p + 1]) * s;
        d[p + 2] = d[p + 2] + (amber[2] - d[p + 2]) * s;
      }
    }
    octx.putImageData(img, 0, 0);

    var w = cv.clientWidth || 520;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var h = Math.round((w * NY) / NX);
    cv.style.height = h + "px";
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, w, h);

    document.getElementById("gl-legend").innerHTML =
      mode === "brn"
        ? "<span><i style='background:" + hex("--crit", "#B8322C") + "'></i>share of 2018–2023 burnt</span>"
        : mode === "both"
          ? "<span><i style='background:" + hex("--teal", "#2E6E5E") + "'></i>eucalyptus fraction, 2017</span>" +
            "<span><i style='background:" + hex("--crit", "#B8322C") + "'></i>burnt 2018–2023</span>"
          : "<span><i style='background:" + hex("--teal", "#2E6E5E") + "'></i>" +
            (mode === "nat" ? "native broadleaf fraction" : "eucalyptus fraction, 2017") + "</span>";
  }

  // cell lookup for hover: raster index -> land index
  var landOf = new Int32Array(NY * NX).fill(-1);
  for (var i = 0; i < N; i++) landOf[cellOf[i]] = i;

  cv.addEventListener("mousemove", function (ev) {
    var r = cv.getBoundingClientRect();
    var cx = Math.floor(((ev.clientX - r.left) / r.width) * NX);
    var cy = Math.floor(((ev.clientY - r.top) / r.height) * NY);
    var el = document.getElementById("gl-read");
    if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return;
    var li = landOf[cy * NX + cx];
    if (li < 0) {
      el.textContent = "Outside the mapped area.";
      return;
    }
    el.innerHTML =
      "eucalyptus <b>" + Math.round(euc[li] * 100) + "%</b> &middot; native broadleaf <b>" +
      Math.round(nat[li] * 100) + "%" +
      "</b> &middot; burnt 2018–2023 <b>" +
      (100 * burn[li]).toFixed(1) + "% of the period" +
      "</b>";
  });

  var btns = { both: "gl-both", euc: "gl-euc", nat: "gl-nat", brn: "gl-brn" };
  Object.keys(btns).forEach(function (k) {
    var b = document.getElementById(btns[k]);
    if (!b) return;
    b.addEventListener("click", function () {
      mode = k;
      Object.keys(btns).forEach(function (o) {
        var e = document.getElementById(btns[o]);
        if (e) e.setAttribute("aria-pressed", o === k ? "true" : "false");
      });
      paint();
    });
  });

  // ---- the binned curve, computed here from the grid, and the project's own estimates
  function drawBins() {
    var edges = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.01];
    var bins = [];
    for (var b = 0; b < edges.length - 1; b++) {
      var s = 0;
      var c = 0;
      for (var i = 0; i < N; i++) {
        if (euc[i] >= edges[b] && euc[i] < edges[b + 1]) {
          s += burn[i];
          c++;
        }
      }
      bins.push({ lo: edges[b], hi: edges[b + 1], n: c, v: c ? s / c : 0 });
    }
    var W = 420,
      H = 190,
      L = 42,
      R = 10,
      T = 26,
      B = 34;
    var max = Math.max.apply(null, bins.map(function (x) { return x.v; })) * 1.12;
    var bw = (W - L - R) / bins.length;
    var p = ['<text class="ttl" x="0" y="12">WHAT THE MAP SHOWS (2017 MAP)</text>'];
    bins.forEach(function (x, i) {
      var h = ((H - T - B) * x.v) / max;
      p.push('<rect class="bar" x="' + (L + i * bw + 3) + '" y="' + (H - B - h) +
        '" width="' + (bw - 6) + '" height="' + h + '"></rect>');
      p.push('<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - B + 12) +
        '" text-anchor="middle">' + Math.round(x.lo * 100) + "</text>");
      p.push('<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - B - h - 4) +
        '" text-anchor="middle">' + (100 * x.v).toFixed(1) + "</text>");
    });
    p.push('<text x="' + (L + (W - L - R) / 2) + '" y="' + (H - 6) +
      '" text-anchor="middle">eucalyptus fraction of the cell, %</text>');
    p.push('<text x="0" y="' + (T + 4) + '">% burnt</text>');
    document.getElementById("gl-bins").innerHTML = p.join("");
  }

  function drawEffects() {
    // Quoted from informe.md. Percentage points of annual burn probability per 10 points of
    // eucalyptus. The second row is the comparison that matters for restoration and it is the
    // one that crosses zero.
    var rows = [
      { l: "vs agriculture and other uses", e: -0.26, lo: -0.46, hi: -0.07, warn: false },
      { l: "vs native broadleaf", e: 0.23, lo: -0.12, hi: 0.57, warn: true },
      { l: "northern block only", e: -0.14, lo: -0.38, hi: 0.11, warn: true },
    ];
    var W = 420,
      H = 200,
      L = 10,
      R = 14,
      T = 30;
    var lo = -0.6,
      hi = 0.7;
    var x = function (v) { return L + ((v - lo) / (hi - lo)) * (W - L - R); };
    var p = ['<text class="ttl" x="0" y="12">WHAT SURVIVES THE CONTROLS</text>'];
    p.push('<line class="zero" x1="' + x(0) + '" y1="' + T + '" x2="' + x(0) + '" y2="' + (H - 34) + '"></line>');
    p.push('<text x="' + x(0) + '" y="' + (H - 20) + '" text-anchor="middle">0</text>');
    rows.forEach(function (r, i) {
      var y = T + 24 + i * 44;
      var cls = r.warn ? " warn" : "";
      p.push('<text x="0" y="' + (y - 9) + '">' + r.l + "</text>");
      p.push('<line class="ci' + cls + '" x1="' + x(r.lo) + '" y1="' + y + '" x2="' + x(r.hi) + '" y2="' + y + '"></line>');
      p.push('<circle class="dot' + cls + '" cx="' + x(r.e) + '" cy="' + y + '" r="3.6"></circle>');
      p.push('<text x="' + (x(r.hi) + 6) + '" y="' + (y + 4) + '">' + r.e.toFixed(2) + "</text>");
    });
    p.push('<text x="' + (W / 2) + '" y="' + (H - 4) +
      '" text-anchor="middle">points of annual burn probability per +10 points eucalyptus</text>');
    document.getElementById("gl-eff").innerHTML = p.join("");
  }

  var totE = 0,
    totN = 0;
  for (var i2 = 0; i2 < N; i2++) {
    totE += euc[i2];
    totN += nat[i2];
  }
  document.getElementById("gl-euc-ha").textContent = Math.round((totE * 100) / 1000);
  document.getElementById("gl-nat-ha").textContent = Math.round((totN * 100) / 1000);

  // The burnt-cell figures (10.3, 5.6), the "about a point" elsewhere and the ratios (0.60,
  // 0.17) are measured and checked by make_galicia.py (NOTE_BURNT_EUC, NOTE_RATIO); change them
  // there first.
  document.getElementById("gl-note").textContent =
    "Model output, not a survey. The cover map is the project's 2017 map, made from imagery taken " +
    "before the fires, and the one its estimates use. The species model is trained on cleaned " +
    "OpenStreetMap labels, eucalyptus pseudo-labels from clear-cut history and the 1998 Mapa " +
    "Forestal de España; held out from the northern block it scores F1 0.68 for 2017 and 0.77 for " +
    "2024, but against 6,903 national-inventory plots the plot-by-plot agreement is F1 0.44 and 0.45 " +
    "respectively, and the totals match better than the cells do (the 2024 map calls 30.4 per cent " +
    "of wooded plots eucalyptus, the plots list 27.5 per cent). Nine pixels in ten of the 2017 map " +
    "are the 2024 class carried back where nothing happened in between; where a clear-cut or a fire " +
    "was recorded, and so on every burnt pixel, it is the same model run on 2017 imagery, which is " +
    "weaker (one satellite, fewer clear winter scenes): eucalyptus precision against the Mapa " +
    "Forestal is 0.31 for that classification and 0.47 for 2024. The 2024 map, made after the " +
    "fires, finds about half as much eucalyptus in the cells that burned (5.6 per cent of the cell " +
    "on average, against 10.3 on the 2017 map; in the other cells the averages differ by about a " +
    "point), and on it the burnt share falls far more steeply with eucalyptus. Inventory plots, " +
    "which need no map, fall between the two: those with eucalyptus burned 0.14 per cent a year and " +
    "the rest 0.38, a ratio of 0.37, where weighting each cell's burnt share by its eucalyptus and " +
    "by everything else gives 0.60 on the 2017 map and 0.17 on the 2024 one. The " +
    "grid itself was read back off the figure the repository publishes, because the repository " +
    "commits the figure and not the table; the recovered area comes within 0.2 per cent of the " +
    "hectares the report states. The binned bars are a correlation I computed from that grid, not " +
    "a result the project published. The intervals are the project's own, and the one that matters " +
    "for restoration — eucalyptus against native broadleaf rather than against farmland — crosses " +
    "zero. Its robustness value is 0.017: an unmeasured confounder explaining 1.7 per cent of the " +
    "residual variance of both cover and burning would erase the first estimate. EFFIS records only " +
    "the larger fires, there are six years of them, and 2022 dominates. The water effect is absent " +
    "because the project could not measure it.";

  paint();
  drawBins();
  drawEffects();

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(paint, 120);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", paint);
  }
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
})();

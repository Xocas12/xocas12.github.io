/* The 1956 SAC target list, drawn as points with no basemap.
 *
 * Data: the SAC payload, substituted at build time. Columnar arrays, sorted by priority ascending.
 *   la, lo  arc-minute integers (the study prints whole minutes, so this is lossless against
 *           the document rather than a rounding of it; divide by 60 for degrees)
 *   k       0 urban-industrial complex, 1 airfield
 *   p       priority tier within that list
 *   c       index into countries
 *   pg      PDF page of the scan
 *   src     the scan PDF for each list, indexed by k; pg counts pages in it
 *   q       the printed line, with "~" standing for the coordinate la/lo render and "^" for the
 *           leading priority token p carries. Put both back and you have the line as printed --
 *           make_sac.py expands all 2,339 and asserts each reproduces its original byte for
 *           byte before it will write the file, so this is a saving and not a paraphrase.
 *   nx      [index, name] for the rows whose display name is not derivable from the quote.
 *
 * Canvas rather than SVG because the tier slider refilters 2,339 points per input event.
 * Hit testing is a linear scan over what is currently drawn, which at this count is free.
 */
(function () {
  "use strict";
  var D = __SAC_DATA__;
  var cv = document.getElementById("sac-canvas");
  if (!cv || !D || !D.la) return;

  var N = D.la.length;
  var nameFix = {};
  (D.nx || []).forEach(function (e) {
    nameFix[e[0]] = e[1];
  });

  // priority, reference number, NAME, then the rest beginning with a coordinate-shaped token.
  var NAME_RE = /^(\S+)\s+(\d{4,5})\s+([\s\S]*?)\s+((?:\d{4}-\S+)[\s\S]*)$/;

  function titleCase(t) {
    // Lower-case, then upper-case any letter following a non-letter. Python's str.title() for
    // ASCII, which is what make_sac.py asserts against.
    return t.toLowerCase().replace(/(^|[^a-z])([a-z])/g, function (_, a, b) {
      return a + b.toUpperCase();
    });
  }

  function quoteOf(i) {
    var lon = D.lo[i] > 180 * 60 ? D.lo[i] - 360 * 60 : D.lo[i];
    var coord = dms(D.la[i], false) + "-" + dms(lon, true);
    return D.q[i].split("~").join(coord).split("^").join(String(D.p[i]));
  }

  function nameOf(i) {
    if (nameFix[i] !== undefined) return nameFix[i];
    var m = NAME_RE.exec(quoteOf(i));
    return m ? titleCase(m[3]).slice(0, 26) : "";
  }
  var ctx = cv.getContext("2d");
  var depth = document.getElementById("sac-depth");
  var depthVal = document.getElementById("sac-depth-val");
  var elWho = document.getElementById("sac-who");
  var elLine = document.getElementById("sac-line");
  var elMeta = document.getElementById("sac-meta");

  var mode = "all";
  var shown = [];
  var hover = -1;

  // Equidistant cylindrical with a standard parallel through the middle of the data. Enough
  // here: it stops the European cluster smearing sideways without claiming an accuracy the
  // arc-minute coordinates do not have.
  var KX = Math.cos((52 * Math.PI) / 180);
  var PAD = 10;

  var B = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
  for (var i = 0; i < N; i++) {
    var x = (D.lo[i] / 60) * KX;
    var y = -D.la[i] / 60;
    if (x < B.x0) B.x0 = x;
    if (x > B.x1) B.x1 = x;
    if (y < B.y0) B.y0 = y;
    if (y > B.y1) B.y1 = y;
  }
  var ASPECT = (B.x1 - B.x0) / (B.y1 - B.y0);

  function themeColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function draw() {
    var cssW = cv.clientWidth || 900;
    var cssH = Math.round(cssW / ASPECT) + PAD * 2;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.height = cssH + "px";
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    var s = Math.min((cssW - PAD * 2) / (B.x1 - B.x0), (cssH - PAD * 2) / (B.y1 - B.y0));
    var ox = PAD + (cssW - PAD * 2 - (B.x1 - B.x0) * s) / 2;
    var oy = PAD + (cssH - PAD * 2 - (B.y1 - B.y0) * s) / 2;

    var maxP = +depth.value;
    var cols = [themeColor("--accent", "#B97B1F"), themeColor("--teal", "#2E6E5E")];

    shown = [];
    var seen = {};
    var nC = 0;
    for (var i = 0; i < N; i++) {
      if (D.p[i] > maxP) continue;
      if (mode === "urb" && D.k[i] !== 0) continue;
      if (mode === "air" && D.k[i] !== 1) continue;
      shown.push({
        x: ox + ((D.lo[i] / 60) * KX - B.x0) * s,
        y: oy + (-D.la[i] / 60 - B.y0) * s,
        i: i,
      });
      if (!seen[D.c[i]]) {
        seen[D.c[i]] = 1;
        nC++;
      }
    }

    // Airfields first so the urban-industrial amber, the headline layer, sits on top.
    ctx.globalAlpha = 0.85;
    for (var pass = 1; pass >= 0; pass--) {
      ctx.fillStyle = cols[pass];
      ctx.beginPath();
      for (var j = 0; j < shown.length; j++) {
        if (D.k[shown[j].i] !== pass) continue;
        ctx.moveTo(shown[j].x + 2.1, shown[j].y);
        ctx.arc(shown[j].x, shown[j].y, 2.1, 0, 6.283185);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hover >= 0 && hover < shown.length) {
      ctx.strokeStyle = themeColor("--ink", "#1C2422");
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(shown[hover].x, shown[hover].y, 6, 0, 6.283185);
      ctx.stroke();
    }

    document.getElementById("sac-n").textContent = shown.length.toLocaleString("en-GB");
    document.getElementById("sac-c").textContent = nC;
    depthVal.textContent =
      maxP >= 1223 ? "all tiers" : "tiers 1 to " + maxP.toLocaleString("en-GB");
  }

  function dms(minutes, isLon) {
    var neg = minutes < 0;
    var m = Math.abs(minutes);
    var deg = Math.floor(m / 60);
    var mm = m % 60;
    var pad = isLon ? 3 : 2;
    return (
      String(deg).padStart(pad, "0") + String(mm).padStart(2, "0") + (neg && isLon ? " W" : "")
    );
  }

  function showEntry(i) {
    var isCx = D.k[i] === 0;
    elWho.innerHTML =
      "<b>" +
      esc(nameOf(i)) +
      "</b> &mdash; " +
      esc(D.countries[D.c[i]]) +
      ", " +
      (isCx ? "urban-industrial complex" : "airfield") +
      ", priority " +
      D.p[i];
    elLine.textContent = quoteOf(i);
    // The longitudes shifted past 180 for drawing must be shown as the page prints them.
    var lo = D.lo[i] > 180 * 60 ? D.lo[i] - 360 * 60 : D.lo[i];
    // src is the scan PDF itself (make_sac.py resolves it), so #page= opens it at the line.
    // A viewer that ignores the fragment opens page 1, and the page number is printed anyway.
    elMeta.innerHTML =
      "as printed on PDF page " +
      D.pg[i] +
      " &middot; " +
      dms(D.la[i], false) +
      "N " +
      dms(lo, true) +
      (lo < 0 ? "" : "E") +
      " &middot; <a href='" +
      D.src[D.k[i]] +
      "#page=" +
      D.pg[i] +
      "' target='_blank' rel='noopener'>the scan at the National Security Archive &#8599;</a>";
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function pick(ev) {
    var rect = cv.getBoundingClientRect();
    var pt = ev.touches ? ev.touches[0] : ev;
    var mx = pt.clientX - rect.left;
    var my = pt.clientY - rect.top;
    var best = -1;
    var bestD = 100;
    for (var i = 0; i < shown.length; i++) {
      var dx = shown[i].x - mx;
      var dy = shown[i].y - my;
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best !== hover) {
      hover = best;
      draw();
      if (best >= 0) showEntry(shown[best].i);
    }
  }

  cv.addEventListener("mousemove", pick);
  cv.addEventListener("touchstart", pick, { passive: true });
  cv.addEventListener("touchmove", pick, { passive: true });

  var btns = { all: "sac-all", urb: "sac-urb", air: "sac-air" };
  Object.keys(btns).forEach(function (k) {
    var el = document.getElementById(btns[k]);
    if (!el) return;
    el.addEventListener("click", function () {
      mode = k;
      Object.keys(btns).forEach(function (o) {
        var b = document.getElementById(btns[o]);
        if (b) b.setAttribute("aria-pressed", o === k ? "true" : "false");
      });
      hover = -1;
      draw();
    });
  });

  depth.addEventListener("input", function () {
    hover = -1;
    draw();
  });

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(draw, 120);
  });
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", draw);
  }
  new MutationObserver(draw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  document.getElementById("sac-note").textContent =
    "SAC's Atomic Weapons Requirements Study for 1959 (SM 129-56, 15 June 1956), declassified in 2015 " +
    "and held by the National Security Archive. It is a requirements study, not an approved war plan: " +
    "the first SIOP was four years away. Complexes come from Part I of the study, its unconstrained " +
    "requirement. Airfields come from Part II, the desired-stockpile allocation, because Part I's airfield " +
    "list was released only as an 11-page excerpt; of the 270 airfields printed in both, 265 carry the same " +
    "priority. The scans carry no text layer, so every line was read twice, " +
    "independently, and disagreements were settled on an enlarged image; a blind audit of a 5 per cent " +
    "sample, 743 lines, found no transcription errors. Of the 2,343 transcribed entries 2,339 are drawn " +
    "here — four print no usable coordinate — and two complexes are missing from the published scan " +
    "altogether, which the audit does not cover because it measures accuracy on lines that exist. The " +
    "weapons and yield columns are redacted in the released copy, so nothing here says what any of it " +
    "would have taken or done. Nothing is modelled: the repository fits models to these labels but says " +
    "of its own runs that their numbers are not results, so this shows what SAC listed and not what made " +
    "a place a target.";

  showEntry(0);
  draw();
})();

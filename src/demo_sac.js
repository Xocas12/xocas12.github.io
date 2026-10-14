/* The 1956 SAC target list, drawn as points with no basemap.
 *
 * Data: the SAC payload, substituted at build time. Columnar arrays, sorted by priority ascending.
 *   la, lo  arc-minute integers (the study prints whole minutes, so this is lossless against
 *           the document rather than a rounding of it; divide by 60 for degrees)
 *   k       0 urban-industrial complex, 1 airfield
 *   p       priority tier within that list
 *   c       index into countries
 *   pg      PDF page of the scan
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
  var elFind = document.getElementById("sac-find");
  var elNames = document.getElementById("sac-names");
  var elPos = document.getElementById("sac-pos");
  var elAlso = document.getElementById("sac-also");
  var elLive = document.getElementById("sac-live");

  var mode = "all";
  var MODE_TEXT = { all: "both lists", urb: "urban-industrial complexes only", air: "airfields only" };
  // What is drawn, in payload order, which is priority order with the complex first on a tie.
  var shown = [];
  // where[i] is the position in `shown` of payload row i, or -1 when it is filtered out.
  var where = new Int32Array(N);
  // The one entry the panel quotes and the map rings, as a payload index. Every way of choosing
  // an entry (pointer, search, Previous/Next, the "Also here" row) sets this and nothing else.
  var cur = 0;
  // A mouse click on the map holds the entry, so the pointer can cross the map on its way to
  // the panel without replacing it. Another click on the map picks again; one on empty map lets go.
  var held = false;
  // Where the "Also here" row looks: the pointer that picked the entry, or null for the entry's
  // own dot. Canvas CSS pixels.
  var alsoAt = null;
  var alsoKey = "";
  var lastTouch = false;
  var counts = ""; // "2 entries in 1 country", as of the last draw

  var KIND = ["urban-industrial complex", "airfield"];
  var LABEL = ["complex", "airfield"];

  function count(n, one, many) {
    return n.toLocaleString("en-GB") + " " + (n === 1 ? one : many);
  }

  function describe(i) {
    return nameOf(i) + ", " + KIND[D.k[i]] + ", priority " + D.p[i] + ", " + D.countries[D.c[i]];
  }

  // Search labels: a name alone does not tell apart the five places printed at one coordinate
  // in both lists (Hsian, Kochenevo, Kirovabad, Namangan, Arkhara) or the many "Leningrad/..."
  // airfields, so each option carries its list and priority. All 2,339 labels are distinct.
  var byLabel = {};
  var labels = [];
  for (var n = 0; n < N; n++) {
    labels[n] = nameOf(n) + ", " + LABEL[D.k[n]] + ", priority " + D.p[n];
    byLabel[labels[n]] = n;
  }

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
    where.fill(-1);
    var seen = {};
    var nC = 0;
    for (var i = 0; i < N; i++) {
      if (D.p[i] > maxP) continue;
      if (mode === "urb" && D.k[i] !== 0) continue;
      if (mode === "air" && D.k[i] !== 1) continue;
      where[i] = shown.length;
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

    // An entry the filters have just hidden hands the panel to the first one still drawn, so the
    // panel never quotes a point that is not on the map. shown is never empty: each list has a
    // priority 1 and the slider stops at 1.
    if (where[cur] < 0) {
      cur = shown[0].i;
      alsoAt = null;
      held = false;
      showEntry(cur);
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

    var at = shown[where[cur]];
    ctx.strokeStyle = themeColor("--ink", "#1C2422");
    ctx.lineWidth = held ? 2.25 : 1.25;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 6, 0, 6.283185);
    ctx.stroke();

    var nShown = shown.length.toLocaleString("en-GB");
    document.getElementById("sac-n").textContent = nShown;
    document.getElementById("sac-c").textContent = nC;
    var readout = maxP >= 1223 ? "all tiers" : "tiers 1 to " + maxP.toLocaleString("en-GB");
    depthVal.textContent = readout;
    // What a screen reader says for the slider: the readout and what it leaves on the map, not
    // the bare number.
    counts = count(shown.length, "entry", "entries") + " in " + count(nC, "country", "countries");
    depth.setAttribute("aria-valuetext", readout + ": " + counts);
    cv.setAttribute(
      "aria-label",
      "Map of " + count(shown.length, "target", "targets") +
        " from the 1956 Strategic Air Command study (" + MODE_TEXT[mode] + ", " + readout +
        "), plotted as points with no basemap, coloured by whether the entry is an " +
        "urban-industrial complex or an airfield."
    );
    elPos.textContent =
      (where[cur] + 1).toLocaleString("en-GB") + " of " + nShown + " shown, in priority order";
  }

  // The "Also here" row: up to six other drawn entries within reach of the pointer (or of the
  // entry's dot when it was chosen another way), lowest priority number first. Dots are 2.1 px
  // and packed into Europe and the big cities, so the nearest dot to a pointer is often not the
  // place meant; this puts the place meant one click away. Capped, because a radius that reaches
  // the place meant reaches a lot else: within 6 px of Moscow on the desktop canvas are 45 entries.
  var ALSO_MAX = 6;
  function alsoRadius() {
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return lastTouch || coarse ? 10 : 6;
  }

  function renderAlso() {
    var c = alsoAt || shown[where[cur]];
    var r2 = alsoRadius() * alsoRadius();
    var near = [];
    for (var j = 0; j < shown.length; j++) {
      var dx = shown[j].x - c.x;
      var dy = shown[j].y - c.y;
      if (shown[j].i !== cur && dx * dx + dy * dy <= r2) near.push(shown[j].i);
    }
    var key = near.slice(0, ALSO_MAX).join(",") + "|" + near.length;
    if (key === alsoKey) return;
    alsoKey = key;
    if (!near.length) {
      elAlso.hidden = true;
      elAlso.innerHTML = "";
      return;
    }
    var html = "<span>Also here:</span>";
    near.slice(0, ALSO_MAX).forEach(function (i) {
      html +=
        "<button type='button' class='sac-btn' aria-pressed='false' data-i='" + i + "'>" +
        esc(nameOf(i)) + " <span class='t'>" + LABEL[D.k[i]] + " " + D.p[i] + "</span></button>";
    });
    if (near.length > ALSO_MAX) {
      html += "<span>+" + (near.length - ALSO_MAX) + " more, use search</span>";
    }
    elAlso.innerHTML = html;
    elAlso.hidden = false;
  }

  function say(text) {
    elLive.textContent = text;
  }

  /* Make payload row i the current entry. opts.at: the pointer position that picked it (the
   * "Also here" row then looks around the pointer); opts.keepRow: leave the row as it is, which
   * is what a click on the row itself wants, so the button just pressed keeps its place and
   * focus; opts.say: announce it (never on mousemove or touchmove). */
  function select(i, opts) {
    opts = opts || {};
    var changed = i !== cur;
    cur = i;
    if (changed) {
      showEntry(i);
      draw();
    }
    if (opts.keepRow) {
      Array.prototype.forEach.call(elAlso.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", +b.getAttribute("data-i") === cur ? "true" : "false");
      });
      alsoKey = ""; // the row now holds the current entry; the next pick must rebuild it
    } else {
      alsoAt = opts.at || null;
      renderAlso();
    }
    if (opts.say) say(describe(i) + "; " + elPos.textContent);
  }

  // Filters or the canvas size changed: the dots moved, so the row looks around the entry again.
  function relayout() {
    alsoAt = null;
    draw();
    alsoKey = "";
    renderAlso();
  }

  function step(to) {
    var j = where[cur];
    var n = shown.length;
    var k = to === "first" ? 0 : to === "last" ? n - 1 : (j + to + n) % n;
    select(shown[k].i, { say: true });
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
      "' target='_blank' rel='noopener'>the scan at the National Security Archive &#8599;</a>";
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // The nearest drawn dot within 10 px of the pointer becomes the current entry. Returns whether
  // one was in range; when none is, nothing changes, so the panel and its ring stay together.
  function pick(ev) {
    var rect = cv.getBoundingClientRect();
    var pt = ev.touches ? ev.touches[0] : ev;
    if (!pt) return false;
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
    if (best < 0) return false;
    select(shown[best].i, { at: { x: mx, y: my } });
    return true;
  }

  function touchPick(ev) {
    lastTouch = true;
    pick(ev);
  }

  // Mouse and pen through pointer events; touch through the touch events, which keep firing
  // while the page pans vertically (touch-action: pan-y) where pointer events are cancelled.
  cv.addEventListener("pointermove", function (ev) {
    if (ev.pointerType === "touch") return;
    lastTouch = false;
    if (!held) pick(ev);
  });
  cv.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "touch" || ev.button !== 0) return;
    lastTouch = false;
    held = pick(ev);
    draw();
  });
  cv.addEventListener("touchstart", touchPick, { passive: true });
  cv.addEventListener("touchmove", touchPick, { passive: true });

  cv.addEventListener("keydown", function (ev) {
    var to = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" }[ev.key];
    if (to === undefined || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    step(to);
  });
  document.getElementById("sac-prev").addEventListener("click", function () {
    step(-1);
  });
  document.getElementById("sac-next").addEventListener("click", function () {
    step(1);
  });

  elAlso.addEventListener("click", function (ev) {
    var b = ev.target.closest ? ev.target.closest("button[data-i]") : null;
    if (b) select(+b.getAttribute("data-i"), { keepRow: true, say: true });
  });

  var btns = { all: "sac-all", urb: "sac-urb", air: "sac-air" };
  function setMode(k) {
    mode = k;
    Object.keys(btns).forEach(function (o) {
      var b = document.getElementById(btns[o]);
      if (b) b.setAttribute("aria-pressed", o === k ? "true" : "false");
    });
  }
  Object.keys(btns).forEach(function (k) {
    var el = document.getElementById(btns[k]);
    if (!el) return;
    el.addEventListener("click", function () {
      var before = cur;
      setMode(k);
      relayout();
      say(
        "Showing " + MODE_TEXT[k] + ": " + counts + "." +
          (cur !== before ? " The panel now shows " + describe(cur) + "." : "")
      );
    });
  });

  depth.addEventListener("input", relayout);

  // Search. The options are built here from the names the page already derives, so they cost
  // nothing in the payload. Picking an entry the filters hide widens them just enough to draw
  // it: the list switches to "Both lists" if the entry is on the other one, and the slider moves
  // up to its priority if it is below it. Nothing else the reader set is changed.
  var frag = document.createDocumentFragment();
  for (var o = 0; o < N; o++) {
    var opt = document.createElement("option");
    opt.value = labels[o];
    frag.appendChild(opt);
  }
  elNames.appendChild(frag);

  function choose(i) {
    var widened = false;
    if ((mode === "urb" && D.k[i] !== 0) || (mode === "air" && D.k[i] !== 1)) {
      setMode("all");
      widened = true;
    }
    if (D.p[i] > +depth.value) {
      depth.value = D.p[i];
      widened = true;
    }
    if (widened) relayout();
    select(i, {});
    say(describe(i) + "; " + elPos.textContent + (widened ? ". The filters were widened to show it." : ""));
  }

  // A typed name that is not one of the options: the first entry, in priority order, whose
  // label starts with it, else the first that contains it.
  function bestMatch(text) {
    var t = text.trim().toLowerCase();
    if (!t) return -1;
    var hit = -1;
    for (var i = 0; i < N; i++) {
      var l = labels[i].toLowerCase();
      if (l.indexOf(t) === 0) return i;
      if (hit < 0 && l.indexOf(t) > 0) hit = i;
    }
    return hit;
  }

  elFind.addEventListener("input", function () {
    elFind.removeAttribute("aria-invalid");
    var i = byLabel[elFind.value];
    if (i !== undefined) choose(i);
  });
  elFind.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    if (byLabel[elFind.value] !== undefined) return choose(byLabel[elFind.value]);
    var i = bestMatch(elFind.value);
    if (i < 0) {
      elFind.setAttribute("aria-invalid", "true");
      return say("No entry matches " + elFind.value.trim() + ".");
    }
    elFind.value = labels[i];
    choose(i);
  });

  var rt;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(relayout, 120);
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
    "the first SIOP was four years away. The scans carry no text layer, so every line was read twice, " +
    "independently, and disagreements were settled on an enlarged image; a blind audit of a 5 per cent " +
    "sample, 743 lines, found no transcription errors. Of the 2,343 transcribed entries 2,339 are drawn " +
    "here — four print no usable coordinate — and two complexes are missing from the published scan " +
    "altogether, which the audit does not cover because it measures accuracy on lines that exist. The " +
    "weapons and yield columns are redacted in the released copy, so nothing here says what any of it " +
    "would have taken or done. Nothing is modelled: the repository fits models to these labels but says " +
    "of its own runs that their numbers are not results, so this shows what SAC listed and not what made " +
    "a place a target.";

  showEntry(cur);
  relayout();
})();

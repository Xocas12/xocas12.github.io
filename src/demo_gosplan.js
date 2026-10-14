/* Bunching at the plan notch: reported fulfilment ratios from trained gosplan-env populations.
 *
 * Data: the gosplan payload, substituted at build time: {lo, w (bin width), thresh, cells[{w, n, below, above, i0, c[],
 * peak, peakRho}], seeds{notched[], smooth[]}}.
 *
 * Only the cap=1.2 cells are here, so the notch width is the only parameter that moves between
 * panels. The y axis is per panel and square-rooted: one bin holds 20 per cent of all reports
 * in the sharpest cell, and on a shared linear axis that is a single needle beside two hundred
 * flat bins, which destroys the shape it is meant to show.
 */
(function () {
  "use strict";
  var D = __GOSPLAN_DATA__;
  var host = document.getElementById("gp-hist");
  if (!host || !D || !D.cells) return;

  var sel = 0;

  var seg = document.getElementById("gp-seg");
  D.cells.forEach(function (c, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = c.w === 0 ? "0 (sharp)" : String(c.w);
    b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function () {
      sel = i;
      [].forEach.call(seg.children, function (e, j) {
        e.setAttribute("aria-pressed", j === i ? "true" : "false");
      });
      drawHist();
    });
    seg.appendChild(b);
  });

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function drawHist() {
    var c = D.cells[sel];
    // Laid out in CSS pixels at the width the chart is drawn (chart_px.js), so the stylesheet's
    // 11px is the text size on screen. On a narrow chart the title and caption take two lines.
    var title = [];
    var cap = [];
    var T = 0;
    var PLOT = 125;
    var dims = ChartPx.fit(host, function (w) {
      title = ChartPx.lines(["REPORTED FULFILMENT RATIO,", "NOTCH WIDTH " + (c.w === 0 ? "0 (SHARP)" : c.w)],
        11.5, w - 4, 0.06);
      cap = ChartPx.lines(["reported / planned, bins of " + D.w, "bar height is the square root of the count"],
        11, w - 4, 0, " · ");
      T = 13 + 15 * (title.length - 1) + 21;
      return T + PLOT + 37 + 15 * (cap.length - 1);
    });
    var W = dims.w,
      H = dims.h,
      L = 60,
      R = 56,
      B = H - T - PLOT;
    var n = c.c.length;
    var bw = (W - L - R) / n;
    var max = 0;
    for (var i = 0; i < n; i++) if (c.c[i] > max) max = c.c[i];
    var pk = c.c.indexOf(max);
    // sqrt so the tall bin does not flatten the rest into the axis
    var y = function (v) { return H - B - Math.sqrt(v / max) * (H - T - B); };
    var xAt = function (i) { return L + i * bw; };
    var rho = function (i) { return D.lo + (c.i0 + i + 0.5) * D.w; };

    var p = title.map(function (line, i) {
      return '<text class="ttl" x="0" y="' + (13 + 15 * i) + '">' + line + "</text>";
    });
    for (var i = 0; i < n; i++) {
      if (!c.c[i]) continue;
      p.push('<rect class="bar' + (i === pk ? " pk" : "") + '" x="' + xAt(i).toFixed(1) +
        '" y="' + y(c.c[i]).toFixed(1) + '" width="' + Math.max(0.7, bw - 0.2).toFixed(2) +
        '" height="' + (H - B - y(c.c[i])).toFixed(1) + '"></rect>');
    }
    // the plan target
    var one = L + ((1.0 - (D.lo + c.i0 * D.w)) / (n * D.w)) * (W - L - R);
    p.push('<line class="notch" x1="' + one.toFixed(1) + '" y1="' + T + '" x2="' + one.toFixed(1) +
      '" y2="' + (H - B) + '"></line>');
    p.push('<text x="' + one.toFixed(1) + '" y="' + (T - 4) + '" text-anchor="middle">plan = 1.00</text>');
    // The peak, called out where it actually sits. Offset to whichever side has room, because
    // the tallest bar reaches the top of the plot and the "plan = 1.00" label lives up there.
    var px = xAt(pk) + bw / 2;
    var callout = c.peak.toFixed(2) + "% at " + c.peakRho.toFixed(3);
    var right = px + 10 + ChartPx.textW(callout, 11) <= W - 4;
    p.push('<text class="lbl" x="' + (px + (right ? 10 : -10)).toFixed(1) + '" y="' + (T + 14) +
      '" text-anchor="' + (right ? "start" : "end") + '">' + callout + "</text>");
    p.push('<line class="ax" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '"></line>');
    for (var t = 0; t <= 4; t++) {
      var v = rho(0) + (t / 4) * (n * D.w);
      p.push('<text x="' + (L + (t / 4) * (W - L - R)).toFixed(1) + '" y="' + (H - B + 14) +
        '" text-anchor="middle">' + v.toFixed(2) + "</text>");
    }
    // overflow stubs, labelled: dropping them silently would be a lie about where the mass is
    if (c.below) {
      p.push('<rect class="stub" x="' + (L - 32) + '" y="' + (H - B - 34) + '" width="18" height="34"></rect>');
      p.push('<text x="' + (L - 23) + '" y="' + (H - B + 14) + '" text-anchor="middle">&lt;</text>');
      p.push('<text x="' + (L - 23) + '" y="' + (H - B - 40) + '" text-anchor="middle">' +
        c.below.toLocaleString("en-GB") + "</text>");
    }
    if (c.above) {
      p.push('<rect class="stub" x="' + (W - R + 14) + '" y="' + (H - B - 34) + '" width="18" height="34"></rect>');
      p.push('<text x="' + (W - R + 23) + '" y="' + (H - B + 14) + '" text-anchor="middle">&gt;</text>');
      p.push('<text x="' + (W - R + 23) + '" y="' + (H - B - 40) + '" text-anchor="middle">' +
        c.above.toLocaleString("en-GB") + "</text>");
    }
    cap.forEach(function (line, i) {
      p.push('<text x="' + W / 2 + '" y="' + (H - B + 31 + 15 * i) + '" text-anchor="middle">' + line + "</text>");
    });
    host.innerHTML = p.join("");

    document.getElementById("gp-peak").textContent = c.peak.toFixed(2) + "%";
    document.getElementById("gp-peak-s").textContent =
      "one bin of " + D.w + ", at " + c.peakRho.toFixed(3);
    document.getElementById("gp-n").textContent = c.n.toLocaleString("en-GB");
  }

  function drawSeeds() {
    // CSS pixels, as in drawHist.
    var svg = document.getElementById("gp-seeds");
    var title = [];
    var cap = [];
    var T = 0;
    var L = Math.ceil(ChartPx.textW("notched", 11)) + 14,
      R = 30;
    var dims = ChartPx.fit(svg, function (w) {
      title = ChartPx.lines(["EVERY RUN,", "NOT THE AVERAGE OF THEM"], 11.5, w - 4, 0.06);
      // centred under the axis rather than the chart, so it has w - (L - R) to fit in
      cap = ChartPx.lines(["share of that run's reports", "inside the bonus window"], 11, w - (L - R) - 4);
      T = 13 + 15 * (title.length - 1) + 21;
      return T + 90 + 34 + 15 * (cap.length - 1) + 6;
    });
    var W = dims.w,
      RULE = T + 90; // the threshold rule runs from T to here, below the second row
    var x = function (v) { return L + v * (W - L - R); };
    var p = title.map(function (line, i) {
      return '<text class="ttl" x="0" y="' + (13 + 15 * i) + '">' + line + "</text>";
    });
    ["notched", "smooth"].forEach(function (arm, r) {
      var y = T + 26 + r * 44;
      p.push('<text x="0" y="' + (y + 4) + '">' + arm + "</text>");
      p.push('<line class="ax" x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '"></line>');
      D.seeds[arm].forEach(function (s) {
        p.push('<circle class="' + (s.share >= D.thresh ? "ok" : "") + '" cx="' + x(s.share).toFixed(1) +
          '" cy="' + y + '" r="4" opacity="0.8"><title>seed ' + s.s + ": share " +
          s.share.toFixed(3) + ", " + esc(s.v) + "</title></circle>");
      });
    });
    p.push('<line class="rule" x1="' + x(D.thresh) + '" y1="' + T + '" x2="' + x(D.thresh) +
      '" y2="' + RULE + '"></line>');
    p.push('<text x="' + x(D.thresh) + '" y="' + (T - 4) + '" text-anchor="middle">threshold 0.44</text>');
    for (var t = 0; t <= 4; t++) {
      p.push('<text x="' + x(t / 4) + '" y="' + (RULE + 18) + '" text-anchor="middle">' +
        (t / 4).toFixed(2) + "</text>");
    }
    cap.forEach(function (line, i) {
      p.push('<text x="' + ((L + W - R) / 2) + '" y="' + (RULE + 34 + 15 * i) + '" text-anchor="middle">' +
        line + "</text>");
    });
    svg.innerHTML = p.join("");
  }

  document.getElementById("gp-note").textContent =
    "A simulation, not history. Twenty learning enterprises face a fixed rule-based planner; the " +
    "bars are fulfilment ratios they reported at the end of training, from runs totalling about " +
    "24 hours of compute. Nothing interesting follows from the pile on its own — reporting just " +
    "over the notch is the plain optimum of the bonus they were handed — and the repository is " +
    "explicit that bunching is a pipeline check and not part of its claims: if it failed to " +
    "appear, the optimiser would be broken. Its pre-registered test for it FAILED: 90 per cent of " +
    "seeds were required to show the effect, the notched arm reaches 37 per cent strictly, or 77 " +
    "per cent if seeds whose confidence interval is undefined are counted as met. Seven of the 30 " +
    "notched runs flatly contradict the pooled picture, two of them with no reports in the window " +
    "at all, which is why every run is plotted rather than their average. The panels hold the " +
    "overfulfilment cap fixed at 1.2 so the notch width is the only thing changing; the " +
    "repository's own headline pair moves both at once. And the training budget is itself a " +
    "finding: tripling it collapses the same economy to near-zero output, so each bar is a point " +
    "on a learning trajectory rather than a steady state.";

  drawHist();
  drawSeeds();
  ChartPx.watch(host, drawHist);
  ChartPx.watch(document.getElementById("gp-seeds"), drawSeeds);
})();

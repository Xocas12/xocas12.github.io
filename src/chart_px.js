/* Chart text at the size the stylesheet gives it.
 *
 * An inline SVG with a fixed viewBox scales everything inside it with the width it is drawn at,
 * text included: a chart laid out 900 units wide and drawn 304 px wide sets 11-unit text at
 * 3.7 px. The turnout, Galicia and gosplan charts lay themselves out in CSS pixels instead.
 * fit() gives the SVG a viewBox as wide as the SVG is drawn (rounded down, so the scale is never
 * below 1), which makes a font-size of 11px in the stylesheet 11 px on screen; the chart then
 * places everything from the width it gets back, and watch() draws it again when that width
 * changes. textW() and lines() estimate monospace text so a chart can make room for its labels.
 */
(function () {
  "use strict";
  // Advance of one character, in em. Menlo, SF Mono and DejaVu Sans Mono are 0.60, Consolas 0.55;
  // the margin keeps a label that fits here from touching its neighbour on a wider font.
  var EM = 0.62;

  function width(svg) {
    return Math.floor(svg.getBoundingClientRect().width);
  }
  // height: a number, or a function of the width.
  function fit(svg, height) {
    var w = width(svg) || 600;
    var h = Math.ceil(typeof height === "function" ? height(w) : height);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    return { w: w, h: h };
  }
  function watch(svg, draw) {
    var last = width(svg);
    var check = function () {
      var w = width(svg);
      if (w > 0 && w !== last) {
        last = w;
        draw();
      }
    };
    if (window.ResizeObserver) new ResizeObserver(check).observe(svg);
    else window.addEventListener("resize", check);
  }
  // px wide, for s set at size px with letter-spacing track (em)
  function textW(s, px, track) {
    return String(s).length * px * (EM + (track || 0));
  }
  // greedy word wrap into lines no wider than max px
  function wrap(s, px, max, track) {
    var out = [];
    var cur = "";
    String(s).split(" ").forEach(function (word) {
      var next = cur ? cur + " " + word : word;
      if (cur && textW(next, px, track) > max) {
        out.push(cur);
        cur = word;
      } else cur = next;
    });
    if (cur) out.push(cur);
    return out;
  }
  // The parts joined by sep (default a space) if that fits in max px; otherwise a line per part,
  // so a caption breaks where it reads well, and a part still too wide is word-wrapped.
  function lines(parts, px, max, track, sep) {
    var one = parts.join(sep || " ");
    if (textW(one, px, track) <= max) return [one];
    var out = [];
    parts.forEach(function (part) {
      out = out.concat(wrap(part, px, max, track));
    });
    return out;
  }
  window.ChartPx = { fit: fit, watch: watch, textW: textW, lines: lines };
})();
